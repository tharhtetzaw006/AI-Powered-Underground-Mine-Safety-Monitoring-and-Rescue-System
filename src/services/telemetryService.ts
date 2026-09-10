/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Hardware-independent telemetry service abstraction.
 * Completely decoupled from specific transports (ESP32, LoRa, serial).
 * Connects directly to the backend telemetry ingestion layer via WebSocket and REST.
 */

import {
  SensorTelemetry,
  NodeStatus,
  GatewayStats,
  WebSocketMessage,
  SystemEventLog,
  HumanDetectionResult,
  HumanDetectionInput,
  DetectionEngineStatus,
  DetectionEventRecord,
} from '../types/telemetry.ts';
import { RadarTelemetry } from '../types/radar.ts';
import { CameraTelemetry } from '../types/camera.ts';
import { LiveEvent, validateLiveEvent } from '../types/events.ts';

export type ConnectionStatus = 'CONNECTING' | 'CONNECTED' | 'DISCONNECTED' | 'RECONNECTING' | 'ERROR';

export type TelemetryListener = (telemetry: SensorTelemetry) => void;
export type NodeStatusListener = (nodes: NodeStatus[]) => void;
export type ConnectionListener = (status: ConnectionStatus, error?: string | null) => void;
export type GatewayStatsListener = (stats: GatewayStats) => void;
export type EventLogListener = (event: SystemEventLog) => void;
export type DetectionListener = (detection: HumanDetectionResult) => void;
export type RadarListener = (radar: RadarTelemetry) => void;
export type CameraListener = (camera: CameraTelemetry) => void;

export interface ITelemetryService {
  connect(): void;
  disconnect(): void;
  getConnectionStatus(): ConnectionStatus;
  onTelemetry(listener: TelemetryListener): () => void;
  onNodeStatus(listener: NodeStatusListener): () => void;
  onConnectionChange(listener: ConnectionListener): () => void;
  onGatewayStats(listener: GatewayStatsListener): () => void;
  onEventLog(listener: EventLogListener): () => void;
  onDetection(listener: DetectionListener): () => void;
  onRadar(listener: RadarListener): () => void;
  onCamera(listener: CameraListener): () => void;
  fetchLatestTelemetry(nodeId?: string): Promise<SensorTelemetry | null>;
  fetchAllNodes(): Promise<NodeStatus[]>;
  fetchGatewayStats(): Promise<GatewayStats | null>;
  fetchSystemEvents(): Promise<SystemEventLog[]>;
  fetchDetectionStatus(): Promise<DetectionEngineStatus | null>;
  fetchDetectionHistory(nodeId?: string): Promise<DetectionEventRecord[]>;
  requestInference(input: HumanDetectionInput): Promise<HumanDetectionResult>;
  sendTelemetryPacket(packet: unknown): Promise<{ success: boolean; message: string }>;
}

export class LiveWebSocketTelemetryService implements ITelemetryService {
  private ws: WebSocket | null = null;
  private status: ConnectionStatus = 'DISCONNECTED';
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempts = 0;
  private maxReconnectDelay = 10000;
  private isIntentionallyClosed = false;

  private telemetryListeners = new Set<TelemetryListener>();
  private nodeStatusListeners = new Set<NodeStatusListener>();
  private connectionListeners = new Set<ConnectionListener>();
  private gatewayStatsListeners = new Set<GatewayStatsListener>();
  private eventLogListeners = new Set<EventLogListener>();
  private detectionListeners = new Set<DetectionListener>();
  private radarListeners = new Set<RadarListener>();
  private cameraListeners = new Set<CameraListener>();

  constructor() {
    // Hardware-independent service
  }

  public getConnectionStatus(): ConnectionStatus {
    return this.status;
  }

  private setStatus(newStatus: ConnectionStatus, error: string | null = null): void {
    if (this.status !== newStatus) {
      this.status = newStatus;
      this.connectionListeners.forEach((l) => l(newStatus, error));
    }
  }

  public connect(): void {
    if (typeof window === 'undefined') return;
    this.isIntentionallyClosed = false;

    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    if (this.ws) {
      this.ws.onopen = null;
      this.ws.onmessage = null;
      this.ws.onerror = null;
      this.ws.onclose = null;
      try {
        this.ws.close();
      } catch {
        // Safe ignore
      }
      this.ws = null;
    }

    this.setStatus(this.reconnectAttempts > 0 ? 'RECONNECTING' : 'CONNECTING');

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;

    try {
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        this.reconnectAttempts = 0;
        this.setStatus('CONNECTED');
        // Hydrate initial full state sync
        this.fetchInitialState();
      };

      this.ws.onmessage = (event: MessageEvent) => {
        try {
          const raw = JSON.parse(event.data);
          const liveEvent = validateLiveEvent(raw);
          if (liveEvent) {
            this.handleLiveEvent(liveEvent);
          }
        } catch (err) {
          console.error('WebSocket parse error: unparseable frame payload', err);
        }
      };

      this.ws.onerror = () => {
        this.setStatus('ERROR', 'WebSocket transport encountered an error');
      };

      this.ws.onclose = () => {
        this.ws = null;
        if (!this.isIntentionallyClosed) {
          this.scheduleReconnect();
        } else {
          this.setStatus('DISCONNECTED');
        }
      };
    } catch (err) {
      this.setStatus('ERROR', err instanceof Error ? err.message : 'Failed to initialize WebSocket');
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer || this.isIntentionallyClosed) return;
    this.setStatus('RECONNECTING');
    const delay = Math.min(1000 * Math.pow(1.5, this.reconnectAttempts), this.maxReconnectDelay);
    this.reconnectAttempts++;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  public disconnect(): void {
    this.isIntentionallyClosed = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.onopen = null;
      this.ws.onmessage = null;
      this.ws.onerror = null;
      this.ws.onclose = null;
      try {
        this.ws.close();
      } catch {
        // Safe ignore
      }
      this.ws = null;
    }
    this.setStatus('DISCONNECTED');
  }

  private handleLiveEvent(event: LiveEvent): void {
    switch (event.type) {
      case 'TELEMETRY_UPDATE': {
        const telemetry = event.data;
        if (telemetry && typeof telemetry === 'object' && telemetry.nodeId) {
          this.telemetryListeners.forEach((listener) => listener(telemetry));
        }
        break;
      }

      case 'NODE_STATUS_UPDATE': {
        const rawNodes = event.data;
        if (Array.isArray(rawNodes)) {
          const list = rawNodes as NodeStatus[];
          this.nodeStatusListeners.forEach((listener) => listener(list));
        } else if (rawNodes && typeof rawNodes === 'object') {
          const obj = rawNodes as { node?: NodeStatus; nodes?: NodeStatus[]; status?: string };
          if (Array.isArray(obj.nodes)) {
            this.nodeStatusListeners.forEach((listener) => listener(obj.nodes));
          } else if (obj.node) {
            const single = obj.node;
            this.fetchAllNodes().then((nodes) => {
              this.nodeStatusListeners.forEach((l) => l(nodes));
            }).catch(() => {
              this.nodeStatusListeners.forEach((l) => l([single]));
            });
          }
        }
        break;
      }

      case 'INIT_SNAPSHOT': {
        const snapshot = event.data;
        if (snapshot) {
          if (Array.isArray(snapshot.nodes)) {
            this.nodeStatusListeners.forEach((listener) => listener(snapshot.nodes));
          }
          if (snapshot.latestTelemetry && typeof snapshot.latestTelemetry === 'object') {
            Object.values(snapshot.latestTelemetry).forEach((t) => {
              if (t) this.telemetryListeners.forEach((listener) => listener(t));
            });
          }
          if (snapshot.gatewayStats) {
            this.gatewayStatsListeners.forEach((listener) => listener(snapshot.gatewayStats));
          }
          if (Array.isArray(snapshot.events)) {
            snapshot.events.forEach((ev) => {
              this.eventLogListeners.forEach((listener) => listener(ev));
            });
          }
          if (snapshot.latestRadar) {
            this.radarListeners.forEach((listener) => listener(snapshot.latestRadar as RadarTelemetry));
          }
          if (snapshot.latestCamera) {
            this.cameraListeners.forEach((listener) => listener(snapshot.latestCamera as CameraTelemetry));
          }
        }
        break;
      }

      case 'SYSTEM_STATUS_UPDATE': {
        if (event.data) {
          const stats = (event.data as any).gatewayStats || (event.data as GatewayStats);
          if (stats && typeof stats === 'object') {
            this.gatewayStatsListeners.forEach((listener) => listener(stats));
          }
        }
        break;
      }

      case 'EVENT_LOG_UPDATE': {
        if (event.data) {
          this.eventLogListeners.forEach((listener) => listener(event.data));
        }
        break;
      }

      case 'DETECTION_UPDATE': {
        const det = event.data;
        if (det && typeof det === 'object') {
          this.detectionListeners.forEach((listener) => listener(det));
        }
        break;
      }

      case 'RADAR_UPDATE': {
        const radar = event.data;
        if (radar && typeof radar === 'object' && radar.deviceId) {
          this.radarListeners.forEach((listener) => listener(radar));
        }
        break;
      }

      case 'CAMERA_UPDATE': {
        const camera = event.data || event.payload || (event as any).telemetry;
        if (camera && typeof camera === 'object') {
          this.cameraListeners.forEach((listener) => listener(camera));
        }
        break;
      }

      default:
        break;
    }
  }

  private async fetchInitialState(): Promise<void> {
    try {
      const [nodes, stats, events] = await Promise.all([
        this.fetchAllNodes(),
        this.fetchGatewayStats(),
        this.fetchSystemEvents(),
      ]);
      if (nodes.length > 0) {
        this.nodeStatusListeners.forEach((l) => l(nodes));
      }
      if (stats) {
        this.gatewayStatsListeners.forEach((l) => l(stats));
      }
      if (events.length > 0) {
        events.forEach((ev) => {
          this.eventLogListeners.forEach((l) => l(ev));
        });
      }
    } catch {
      // Backend may be booting or unreachable
    }
  }

  public onTelemetry(listener: TelemetryListener): () => void {
    this.telemetryListeners.add(listener);
    return () => this.telemetryListeners.delete(listener);
  }

  public onNodeStatus(listener: NodeStatusListener): () => void {
    this.nodeStatusListeners.add(listener);
    return () => this.nodeStatusListeners.delete(listener);
  }

  public onConnectionChange(listener: ConnectionListener): () => void {
    this.connectionListeners.add(listener);
    // Immediately inform current status
    listener(this.status);
    return () => this.connectionListeners.delete(listener);
  }

  public onGatewayStats(listener: GatewayStatsListener): () => void {
    this.gatewayStatsListeners.add(listener);
    return () => this.gatewayStatsListeners.delete(listener);
  }

  public onEventLog(listener: EventLogListener): () => void {
    this.eventLogListeners.add(listener);
    return () => this.eventLogListeners.delete(listener);
  }

  public onDetection(listener: DetectionListener): () => void {
    this.detectionListeners.add(listener);
    return () => this.detectionListeners.delete(listener);
  }

  public onRadar(listener: RadarListener): () => void {
    this.radarListeners.add(listener);
    return () => this.radarListeners.delete(listener);
  }

  public onCamera(listener: CameraListener): () => void {
    this.cameraListeners.add(listener);
    return () => this.cameraListeners.delete(listener);
  }

  public async fetchLatestTelemetry(nodeId?: string): Promise<SensorTelemetry | null> {
    const url = nodeId ? `/api/telemetry/latest?nodeId=${encodeURIComponent(nodeId)}` : '/api/telemetry/latest';
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    return data.telemetry || null;
  }

  public async fetchAllNodes(): Promise<NodeStatus[]> {
    const res = await fetch('/api/nodes');
    if (!res.ok) return [];
    const data = await res.json();
    return data.nodes || [];
  }

  public async fetchGatewayStats(): Promise<GatewayStats | null> {
    const res = await fetch('/api/gateway/stats');
    if (!res.ok) return null;
    return await res.json();
  }

  public async fetchSystemEvents(): Promise<SystemEventLog[]> {
    try {
      const res = await fetch('/api/events');
      if (!res.ok) return [];
      const data = await res.json();
      return data.events || [];
    } catch {
      return [];
    }
  }

  public async fetchDetectionStatus(): Promise<DetectionEngineStatus | null> {
    try {
      const res = await fetch('/api/detection/status');
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  }

  public async fetchDetectionHistory(nodeId?: string): Promise<DetectionEventRecord[]> {
    try {
      const url = nodeId ? `/api/detection/history?nodeId=${encodeURIComponent(nodeId)}` : '/api/detection/history';
      const res = await fetch(url);
      if (!res.ok) return [];
      const data = await res.json();
      return data.history || [];
    } catch {
      return [];
    }
  }

  public async requestInference(input: HumanDetectionInput): Promise<HumanDetectionResult> {
    const res = await fetch('/api/detection/infer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    return await res.json();
  }

  public async sendTelemetryPacket(packet: unknown): Promise<{ success: boolean; message: string }> {
    try {
      const res = await fetch('/api/telemetry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(packet),
      });
      const data = await res.json();
      return { success: res.ok, message: data.message || (res.ok ? 'Telemetry ingested' : 'Ingestion rejected') };
    } catch (err) {
      return { success: false, message: err instanceof Error ? err.message : 'Network error posting telemetry' };
    }
  }
}

// Single hardware-independent service instance
export const liveTelemetryService = new LiveWebSocketTelemetryService();
