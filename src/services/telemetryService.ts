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

export type ConnectionStatus = 'CONNECTING' | 'CONNECTED' | 'DISCONNECTED' | 'ERROR';

export type TelemetryListener = (telemetry: SensorTelemetry) => void;
export type NodeStatusListener = (nodes: NodeStatus[]) => void;
export type ConnectionListener = (status: ConnectionStatus, error?: string | null) => void;
export type GatewayStatsListener = (stats: GatewayStats) => void;
export type EventLogListener = (event: SystemEventLog) => void;
export type DetectionListener = (detection: HumanDetectionResult) => void;
export type RadarListener = (radar: RadarTelemetry) => void;

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

    this.setStatus('CONNECTING');

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;

    try {
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        this.reconnectAttempts = 0;
        this.setStatus('CONNECTED');
        // Request initial full state sync
        this.fetchInitialState();
      };

      this.ws.onmessage = (event: MessageEvent) => {
        try {
          const msg: WebSocketMessage = JSON.parse(event.data);
          this.handleServerMessage(msg);
        } catch {
          // Ignore unparseable or corrupted wire frames without crashing
        }
      };

      this.ws.onerror = () => {
        this.setStatus('ERROR', 'WebSocket transport encountered an error');
      };

      this.ws.onclose = () => {
        this.ws = null;
        if (!this.isIntentionallyClosed) {
          this.setStatus('DISCONNECTED');
          this.scheduleReconnect();
        }
      };
    } catch (err) {
      this.setStatus('ERROR', err instanceof Error ? err.message : 'Failed to initialize WebSocket');
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer || this.isIntentionallyClosed) return;
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
      this.ws.close();
      this.ws = null;
    }
    this.setStatus('DISCONNECTED');
  }

  private handleServerMessage(msg: WebSocketMessage): void {
    if (!msg || !msg.type) return;

    switch (msg.type as string) {
      case 'TELEMETRY_UPDATE':
      case 'telemetry': {
        const telemetryObj = ((msg as any).telemetry || msg.payload) as SensorTelemetry | undefined;
        if (telemetryObj && typeof telemetryObj === 'object' && telemetryObj.nodeId) {
          this.telemetryListeners.forEach((listener) => listener(telemetryObj));
        }
        break;
      }

      case 'NODE_STATUS_UPDATE':
      case 'node_status': {
        if (Array.isArray(msg.payload)) {
          this.nodeStatusListeners.forEach((listener) => listener(msg.payload as NodeStatus[]));
        } else if ((msg as any).node && typeof (msg as any).node === 'object') {
          const singleNode = (msg as any).node as NodeStatus;
          // Refresh list or trigger node listeners
          this.fetchAllNodes().then((nodes) => {
            this.nodeStatusListeners.forEach((listener) => listener(nodes));
          }).catch(() => {
            this.nodeStatusListeners.forEach((listener) => listener([singleNode]));
          });
        }
        break;
      }

      case 'INIT_SNAPSHOT':
        if (msg.payload) {
          if (Array.isArray(msg.payload.nodes)) {
            this.nodeStatusListeners.forEach((listener) => listener(msg.payload.nodes as NodeStatus[]));
          }
          if (msg.payload.latestTelemetry && typeof msg.payload.latestTelemetry === 'object') {
            const telemetryRecord = msg.payload.latestTelemetry as Record<string, SensorTelemetry>;
            Object.values(telemetryRecord).forEach((t) => {
              if (t) {
                this.telemetryListeners.forEach((listener) => listener(t));
              }
            });
          }
          if (msg.payload.gatewayStats) {
            this.gatewayStatsListeners.forEach((listener) => listener(msg.payload.gatewayStats));
          }
          if (Array.isArray(msg.payload.events)) {
            (msg.payload.events as SystemEventLog[]).forEach((ev) => {
              this.eventLogListeners.forEach((listener) => listener(ev));
            });
          }
          if (msg.payload.latestRadar) {
            this.radarListeners.forEach((listener) => listener(msg.payload.latestRadar as RadarTelemetry));
          }
        }
        break;

      case 'GATEWAY_STATS':
        if (msg.payload) {
          this.gatewayStatsListeners.forEach((listener) => listener(msg.payload as GatewayStats));
        }
        break;

      case 'EVENT_LOG_UPDATE' as any:
        if (msg.payload) {
          this.eventLogListeners.forEach((listener) => listener(msg.payload as SystemEventLog));
        }
        break;

      case 'DETECTION_UPDATE':
      case 'detection': {
        const detObj = ((msg as any).detection || msg.payload) as HumanDetectionResult | undefined;
        if (detObj && typeof detObj === 'object' && detObj.nodeId) {
          this.detectionListeners.forEach((listener) => listener(detObj));
        }
        break;
      }

      case 'RADAR_UPDATE' as any: {
        const radarData = ((msg as any).data || (msg as any).telemetry || msg.payload) as RadarTelemetry | undefined;
        if (radarData && typeof radarData === 'object' && radarData.deviceId) {
          this.radarListeners.forEach((listener) => listener(radarData));
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
