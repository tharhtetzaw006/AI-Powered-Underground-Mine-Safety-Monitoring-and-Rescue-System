/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Strict Typed WebSocket Event Envelope Protocol for Real-Time Mine Rescue System.
 * Adheres strictly to Section 3 & 18:
 * - Discriminated union of typed live events
 * - Typed event envelope { type, nodeId, timestamp, data }
 * - Safe runtime validator ignoring malformed messages
 */

import {
  SensorTelemetry,
  NodeStatus,
  GatewayStats,
  SystemEventLog,
  HumanDetectionResult,
} from './telemetry.ts';
import { RadarTelemetry } from './radar.ts';

/**
 * 1. Telemetry Update Event:
 * Broadcast whenever a real validated telemetry packet arrives from any field node.
 */
export interface TelemetryUpdateEvent {
  type: 'TELEMETRY_UPDATE';
  nodeId: string;
  timestamp: number | string;
  data: SensorTelemetry;
  // Legacy aliases for backward compatibility
  payload?: SensorTelemetry;
  telemetry?: SensorTelemetry;
}

/**
 * 2. Node Status Update Event:
 * Broadcast whenever real node connectivity transitions (ONLINE, STALE, OFFLINE)
 * or when node registry updates.
 */
export interface NodeStatusUpdateEvent {
  type: 'NODE_STATUS_UPDATE';
  nodeId?: string;
  timestamp: number | string;
  data: {
    node?: NodeStatus;
    nodes: NodeStatus[];
    status?: string;
  } | NodeStatus[];
  // Legacy aliases for backward compatibility
  payload?: NodeStatus[];
  node?: NodeStatus;
  status?: string;
}

/**
 * 3. Human / Life Detection Update Event:
 * Broadcast when genuine CSI or sensor inference occurs on the backend.
 */
export interface DetectionUpdateEvent {
  type: 'DETECTION_UPDATE';
  nodeId?: string;
  timestamp: number | string;
  data: HumanDetectionResult;
  // Legacy aliases for backward compatibility
  payload?: HumanDetectionResult;
  detection?: HumanDetectionResult;
  prediction?: HumanDetectionResult;
}

/**
 * 4. Radar Telemetry Update Event:
 * Broadcast when genuine hardware radar telemetry arrives.
 */
export interface RadarUpdateEvent {
  type: 'RADAR_UPDATE';
  nodeId?: string;
  timestamp: number | string;
  data: RadarTelemetry;
  // Legacy aliases for backward compatibility
  payload?: RadarTelemetry;
  telemetry?: RadarTelemetry;
}

/**
 * 5. System Status Update Event:
 * Broadcast periodically or on state change with gateway and system metrics.
 */
export interface SystemStatusUpdateEvent {
  type: 'SYSTEM_STATUS_UPDATE';
  timestamp: number | string;
  data: {
    gatewayStats?: GatewayStats;
    registeredNodesCount?: number;
    activeWebSocketClients?: number;
  } | GatewayStats;
  // Legacy aliases for backward compatibility
  payload?: GatewayStats;
}

/**
 * Initial Snapshot Event:
 * Broadcast upon initial WebSocket connection to synchronize existing backend state.
 */
export interface InitSnapshotEvent {
  type: 'INIT_SNAPSHOT';
  timestamp: number | string;
  data: {
    nodes: NodeStatus[];
    latestTelemetry: Record<string, SensorTelemetry>;
    detections: Record<string, HumanDetectionResult>;
    gatewayStats: GatewayStats;
    events: SystemEventLog[];
    latestRadar: RadarTelemetry | null;
  };
  payload?: {
    nodes: NodeStatus[];
    latestTelemetry: Record<string, SensorTelemetry>;
    detections: Record<string, HumanDetectionResult>;
    gatewayStats: GatewayStats;
    events: SystemEventLog[];
    latestRadar: RadarTelemetry | null;
  };
}

/**
 * Event Log Update Event:
 * Broadcast when a system log or hardware event is registered.
 */
export interface EventLogUpdateEvent {
  type: 'EVENT_LOG_UPDATE';
  timestamp: number | string;
  data: SystemEventLog;
  payload?: SystemEventLog;
}

/**
 * Discriminated Union for all real-time events.
 */
export type LiveEvent =
  | TelemetryUpdateEvent
  | NodeStatusUpdateEvent
  | DetectionUpdateEvent
  | RadarUpdateEvent
  | SystemStatusUpdateEvent
  | InitSnapshotEvent
  | EventLogUpdateEvent;

/**
 * Safely validates an incoming raw JSON message into a strictly typed LiveEvent.
 * Returns null and logs an error if the message is malformed.
 */
export function validateLiveEvent(raw: unknown): LiveEvent | null {
  if (!raw || typeof raw !== 'object') {
    console.error('WebSocket validation error: message is not an object', raw);
    return null;
  }

  const msg = raw as Record<string, unknown>;
  const type = msg.type;

  if (typeof type !== 'string') {
    console.error('WebSocket validation error: missing or non-string "type"', raw);
    return null;
  }

  switch (type) {
    case 'TELEMETRY_UPDATE':
    case 'telemetry': {
      const telemetryObj = (msg.data || msg.telemetry || msg.payload) as SensorTelemetry | undefined;
      if (!telemetryObj || typeof telemetryObj !== 'object' || typeof telemetryObj.nodeId !== 'string') {
        console.error('WebSocket validation error: invalid TELEMETRY_UPDATE payload', msg);
        return null;
      }
      return {
        type: 'TELEMETRY_UPDATE',
        nodeId: telemetryObj.nodeId,
        timestamp: (msg.timestamp as number | string) || telemetryObj.serverReceiveTime || Date.now(),
        data: telemetryObj,
        payload: telemetryObj,
        telemetry: telemetryObj,
      };
    }

    case 'NODE_STATUS_UPDATE':
    case 'node_status': {
      const nodesData = (msg.data || msg.payload) as NodeStatus[] | { nodes: NodeStatus[]; node?: NodeStatus } | undefined;
      const singleNode = msg.node as NodeStatus | undefined;
      return {
        type: 'NODE_STATUS_UPDATE',
        nodeId: typeof msg.nodeId === 'string' ? msg.nodeId : singleNode?.nodeId,
        timestamp: (msg.timestamp as number | string) || Date.now(),
        data: (nodesData || singleNode || []) as any,
        payload: Array.isArray(nodesData) ? nodesData : Array.isArray((nodesData as any)?.nodes) ? (nodesData as any).nodes : singleNode ? [singleNode] : [],
        node: singleNode || (Array.isArray(nodesData) ? undefined : (nodesData as any)?.node),
        status: typeof msg.status === 'string' ? msg.status : singleNode?.status,
      };
    }

    case 'DETECTION_UPDATE':
    case 'detection': {
      const detectionObj = (msg.data || msg.detection || msg.payload || msg.prediction) as HumanDetectionResult | undefined;
      if (!detectionObj || typeof detectionObj !== 'object') {
        console.error('WebSocket validation error: invalid DETECTION_UPDATE payload', msg);
        return null;
      }
      return {
        type: 'DETECTION_UPDATE',
        nodeId: typeof msg.nodeId === 'string' ? msg.nodeId : detectionObj.nodeId,
        timestamp: (msg.timestamp as number | string) || Date.now(),
        data: detectionObj,
        payload: detectionObj,
        detection: detectionObj,
      };
    }

    case 'RADAR_UPDATE': {
      const radarObj = (msg.data || msg.telemetry || msg.payload) as RadarTelemetry | undefined;
      if (!radarObj || typeof radarObj !== 'object') {
        console.error('WebSocket validation error: invalid RADAR_UPDATE payload', msg);
        return null;
      }
      return {
        type: 'RADAR_UPDATE',
        nodeId: typeof msg.nodeId === 'string' ? msg.nodeId : radarObj.deviceId,
        timestamp: (msg.timestamp as number | string) || Date.now(),
        data: radarObj,
        payload: radarObj,
        telemetry: radarObj,
      };
    }

    case 'SYSTEM_STATUS_UPDATE':
    case 'GATEWAY_STATS': {
      const statsObj = (msg.data || msg.payload) as GatewayStats | undefined;
      return {
        type: 'SYSTEM_STATUS_UPDATE',
        timestamp: (msg.timestamp as number | string) || Date.now(),
        data: (statsObj || {}) as any,
        payload: statsObj,
      };
    }

    case 'INIT_SNAPSHOT': {
      const snapshot = (msg.data || msg.payload) as any;
      if (!snapshot || typeof snapshot !== 'object') {
        console.error('WebSocket validation error: invalid INIT_SNAPSHOT payload', msg);
        return null;
      }
      return {
        type: 'INIT_SNAPSHOT',
        timestamp: (msg.timestamp as number | string) || Date.now(),
        data: snapshot,
        payload: snapshot,
      };
    }

    case 'EVENT_LOG_UPDATE': {
      const eventObj = (msg.data || msg.payload) as SystemEventLog | undefined;
      if (!eventObj || typeof eventObj !== 'object') {
        console.error('WebSocket validation error: invalid EVENT_LOG_UPDATE payload', msg);
        return null;
      }
      return {
        type: 'EVENT_LOG_UPDATE',
        timestamp: (msg.timestamp as number | string) || Date.now(),
        data: eventObj,
        payload: eventObj,
      };
    }

    default:
      console.warn(`WebSocket validation: unrecognized event type "${type}"`, raw);
      return null;
  }
}
