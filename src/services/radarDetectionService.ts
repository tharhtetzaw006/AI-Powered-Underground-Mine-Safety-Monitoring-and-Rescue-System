/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Production Radar Data Provider & Service Abstraction.
 * 
 * Architected to support future real hardware radar sources:
 * - Serial radar streams (UART/USB)
 * - ESP32 wireless radar telemetry
 * - HTTP REST radar endpoints (/api/radar/status, /api/radar/latest)
 * - Dedicated Radar WebSocket streams
 * - LoRa gateway radar packet forwarders
 * 
 * Strict Hardware Truthfulness:
 * - NO mock data, NO fake targets, NO random numbers.
 * - If no real radar hardware is connected, status is NOT_CONNECTED / NO_DATA.
 * - All telemetry is validated through validateRadarTelemetry().
 */

import {
  RadarTelemetry,
  RadarDetectionResult,
  RadarDeviceStatus,
  RadarState,
  RadarDataSource,
  RadarConnectionStatus,
} from '../types/radar.ts';
import { validateRadarTelemetry, validateRadarDetectionResult } from './radarValidator.ts';

export type RadarStateListener = (state: RadarState) => void;
export type RadarTelemetryListener = (telemetry: RadarTelemetry) => void;

export interface RadarDataProvider {
  getState(): RadarState;
  onStateChange(listener: RadarStateListener): () => void;
  onTelemetry(listener: RadarTelemetryListener): () => void;
  ingestTelemetry(raw: unknown, source?: RadarDataSource): boolean;
  ingestDetection(raw: unknown): boolean;
  setDeviceStatus(status: Partial<RadarDeviceStatus>): void;
  connectWebSocket(url: string): void;
  disconnectWebSocket(): void;
  pollHttp(statusUrl: string, latestUrl?: string): Promise<boolean>;
}

class RadarDetectionService implements RadarDataProvider {
  private ws: WebSocket | null = null;
  private freshnessCheckTimer: ReturnType<typeof setInterval> | null = null;
  private stateListeners = new Set<RadarStateListener>();
  private telemetryListeners = new Set<RadarTelemetryListener>();

  // Freshness thresholds
  private readonly STALE_THRESHOLD_MS = 15000;
  private readonly OFFLINE_THRESHOLD_MS = 45000;

  private state: RadarState = {
    deviceStatus: {
      connected: false,
      status: 'NOT_CONNECTED',
      deviceId: null,
      lastSeen: null,
      sampleRateHz: null,
      firmwareVersion: null,
      source: 'UNKNOWN',
      vitalSignSupported: false,
      message: 'No radar hardware connected. Telemetry input awaiting connection.',
    },
    latestTelemetry: null,
    latestDetection: null,
    isStale: true,
    lastMessageTimestamp: null,
    error: null,
  };

  constructor() {
    this.startFreshnessMonitor();
  }

  public getState(): RadarState {
    return { ...this.state };
  }

  public onStateChange(listener: RadarStateListener): () => void {
    this.stateListeners.add(listener);
    listener(this.getState());
    return () => this.stateListeners.delete(listener);
  }

  public onTelemetry(listener: RadarTelemetryListener): () => void {
    this.telemetryListeners.add(listener);
    return () => this.telemetryListeners.delete(listener);
  }

  private notifyStateChange(): void {
    const snap = this.getState();
    this.stateListeners.forEach((l) => l(snap));
  }

  /**
   * Ingests a real radar telemetry packet from any source (Serial, ESP32, HTTP, WS, LoRa).
   * Validates the payload strictly before updating state.
   */
  public ingestTelemetry(raw: unknown, source: RadarDataSource = 'UNKNOWN'): boolean {
    const validation = validateRadarTelemetry(raw, source);
    if (!validation.isValid || !validation.data) {
      console.warn('[RADAR] Rejected malformed telemetry packet:', validation.error);
      this.state.error = validation.error;
      this.notifyStateChange();
      return false;
    }

    const telemetry = validation.data;
    const now = Date.now();

    this.state.latestTelemetry = telemetry;
    this.state.lastMessageTimestamp = now;
    this.state.isStale = false;
    this.state.error = null;

    // Update device status truthfully upon receiving real valid packet
    this.state.deviceStatus = {
      ...this.state.deviceStatus,
      connected: true,
      status: 'ONLINE',
      deviceId: telemetry.deviceId,
      lastSeen: now,
      source: telemetry.source,
      vitalSignSupported: telemetry.vitalSignAvailable,
      message: `Active radar telemetry received via ${telemetry.source}`,
    };

    // Synthesize verified detection outcome if motion or target is indicated
    if (telemetry.motionDetected !== null || telemetry.targetCount !== null) {
      const isTarget = Boolean(telemetry.motionDetected || (telemetry.targetCount !== null && telemetry.targetCount > 0));
      this.state.latestDetection = {
        status: isTarget ? 'TARGET_DETECTED' : 'NO_TARGET',
        humanDetected: isTarget,
        confidence: telemetry.quality,
        targetCount: telemetry.targetCount,
        timestamp: telemetry.timestamp,
        modelName: 'RadarFeatureProcessor',
        message: isTarget ? 'Target motion detected by radar' : 'Radar field clear',
      };
    }

    this.notifyStateChange();
    this.telemetryListeners.forEach((l) => l(telemetry));
    return true;
  }

  /**
   * Ingests an independently computed Radar detection result.
   */
  public ingestDetection(raw: unknown): boolean {
    const validation = validateRadarDetectionResult(raw);
    if (!validation.isValid || !validation.data) {
      console.warn('[RADAR] Rejected malformed detection result:', validation.error);
      return false;
    }

    this.state.latestDetection = validation.data;
    this.notifyStateChange();
    return true;
  }

  /**
   * Manually sets or resets device status (e.g. from connection diagnostics).
   */
  public setDeviceStatus(status: Partial<RadarDeviceStatus>): void {
    this.state.deviceStatus = {
      ...this.state.deviceStatus,
      ...status,
    };
    this.notifyStateChange();
  }

  /**
   * Connects to a dedicated Radar WebSocket stream (future hardware bridge).
   */
  public connectWebSocket(url: string): void {
    this.disconnectWebSocket();

    try {
      this.ws = new WebSocket(url);

      this.ws.onopen = () => {
        console.log('[RADAR] WebSocket connected to', url);
        this.setDeviceStatus({
          connected: true,
          status: 'ONLINE',
          message: `Connected to radar stream: ${url}`,
        });
      };

      this.ws.onmessage = (event: MessageEvent) => {
        try {
          const raw = JSON.parse(event.data);
          this.ingestTelemetry(raw, 'WEBSOCKET');
        } catch (err) {
          console.error('[RADAR] Failed to parse WebSocket message:', err);
        }
      };

      this.ws.onerror = (err) => {
        console.warn('[RADAR] WebSocket error:', err);
        this.setDeviceStatus({
          status: 'ERROR',
          message: 'Radar WebSocket connection error',
        });
      };

      this.ws.onclose = () => {
        console.log('[RADAR] WebSocket disconnected');
        this.setDeviceStatus({
          connected: false,
          status: 'OFFLINE',
          message: 'Radar WebSocket disconnected',
        });
        this.ws = null;
      };
    } catch (err) {
      console.error('[RADAR] Error initializing WebSocket:', err);
    }
  }

  public disconnectWebSocket(): void {
    if (this.ws) {
      this.ws.onopen = null;
      this.ws.onmessage = null;
      this.ws.onerror = null;
      this.ws.onclose = null;
      try {
        this.ws.close();
      } catch {
        // Ignore
      }
      this.ws = null;
    }
  }

  /**
   * Polls an HTTP radar endpoint (e.g. /api/radar/status or /api/radar/latest).
   */
  public async pollHttp(statusUrl: string, latestUrl?: string): Promise<boolean> {
    try {
      const res = await fetch(statusUrl, { headers: { Accept: 'application/json' } });
      if (!res.ok) {
        return false;
      }
      const data = await res.json();
      if (data && typeof data.connected === 'boolean') {
        this.setDeviceStatus({
          connected: data.connected,
          status: data.status ?? (data.connected ? 'ONLINE' : 'NOT_CONNECTED'),
          deviceId: data.deviceId ?? null,
          message: data.message ?? null,
        });
      }

      if (latestUrl && data.connected) {
        const latestRes = await fetch(latestUrl, { headers: { Accept: 'application/json' } });
        if (latestRes.ok) {
          const telemetryData = await latestRes.json();
          if (telemetryData && telemetryData.telemetry) {
            this.ingestTelemetry(telemetryData.telemetry, 'HTTP');
          }
        }
      }
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Evaluates freshness and staleness based on elapsed time since last packet.
   */
  private checkFreshness(): void {
    const lastSeen = this.state.deviceStatus.lastSeen;
    if (!lastSeen) {
      // Never seen: remain NOT_CONNECTED
      return;
    }

    const elapsed = Date.now() - lastSeen;
    let newStatus: RadarConnectionStatus = this.state.deviceStatus.status;
    let newStale = this.state.isStale;

    if (elapsed > this.OFFLINE_THRESHOLD_MS) {
      newStatus = 'OFFLINE';
      newStale = true;
    } else if (elapsed > this.STALE_THRESHOLD_MS) {
      newStatus = 'STALE';
      newStale = true;
    } else {
      newStatus = 'ONLINE';
      newStale = false;
    }

    if (newStatus !== this.state.deviceStatus.status || newStale !== this.state.isStale) {
      this.state.deviceStatus.status = newStatus;
      this.state.isStale = newStale;
      this.notifyStateChange();
    }
  }

  private startFreshnessMonitor(): void {
    if (typeof window !== 'undefined' && !this.freshnessCheckTimer) {
      this.freshnessCheckTimer = setInterval(() => {
        this.checkFreshness();
      }, 5000);
    }
  }

  public destroy(): void {
    if (this.freshnessCheckTimer) {
      clearInterval(this.freshnessCheckTimer);
      this.freshnessCheckTimer = null;
    }
    this.disconnectWebSocket();
  }
}

export const radarDetectionService = new RadarDetectionService();
