/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Typed telemetry definitions for real hardware-connected mine-rescue monitoring.
 * Strict adherence to hardware-grounded data: missing values remain null/undefined.
 */

export interface Vector3D {
  x: number | null;
  y: number | null;
  z: number | null;
}

export interface SensorTelemetry {
  nodeId: string;
  timestamp: number | string | null;        // Hardware timestamp (device millis epoch, ISO string, or relative uptime)
  serverReceiveTime: number;               // Server timestamp (epoch millis when packet received)
  acceleration: Vector3D | null;           // Acceleration [x, y, z] in m/s²
  gyroscope: Vector3D | null;              // Gyroscope [x, y, z] in °/s
  distance: number | null;                 // Obstacle / proximity distance in meters
  soundLevel: number | null;               // Acoustic sound pressure level in dB
  rssi: number | null;                     // RF signal strength in dBm
  packetLoss: number | null;               // Packet loss percentage (0 - 100%)
  battery: number | null;                  // Battery charge percentage (0 - 100%)
  sequenceNumber?: number | null;          // Hardware packet sequence counter
}

export type NodeConnectionState = 'ONLINE' | 'STALE' | 'OFFLINE';

export type SubsystemHealth = 'HEALTHY' | 'DEGRADED' | 'ERROR' | 'UNKNOWN' | 'NORMAL' | 'LOW' | 'CRITICAL';

export type SensorAvailability = 'AVAILABLE' | 'PARTIAL' | 'NO DATA' | 'INVALID';

export interface SensorAvailabilityMap {
  imu: SensorAvailability;
  accelX: SensorAvailability;
  accelY: SensorAvailability;
  accelZ: SensorAvailability;
  gyroX: SensorAvailability;
  gyroY: SensorAvailability;
  gyroZ: SensorAvailability;
  distance: SensorAvailability;
  soundLevel: SensorAvailability;
  acoustic?: SensorAvailability;
  rf: SensorAvailability;
  battery: SensorAvailability;
}

export interface SensorFreshnessMap {
  lastTelemetryReceived: number | null;
  lastImuUpdate: number | null;
  lastDistanceUpdate: number | null;
  lastAcousticUpdate: number | null;
  lastRfUpdate: number | null;
  lastBatteryUpdate: number | null;
}

export type SystemEventType =
  | 'PACKET_RECEIVED'
  | 'NODE_REGISTERED'
  | 'PACKET_REJECTED'
  | 'DUPLICATE_PACKET'
  | 'OUT_OF_ORDER_PACKET'
  | 'NODE_STALE'
  | 'NODE_OFFLINE'
  | 'PROCESSING_ERROR'
  | 'WEBSOCKET_CONNECTED'
  | 'WEBSOCKET_DISCONNECTED';

export interface SystemEventLog {
  id: string;
  type: SystemEventType;
  timestamp: number;
  nodeId?: string;
  details?: string;
}

export interface SensorHealthStatus {
  imu: SubsystemHealth;
  distance: SubsystemHealth;
  acoustic: SubsystemHealth;
  battery: SubsystemHealth;
}

export interface NodeStatus {
  nodeId: string;
  connected: boolean;
  status: NodeConnectionState;
  firstSeen: number | null;
  lastSeen: number | null;
  packetCount: number;
  acceptedPacketCount: number;
  rejectedPacketCount: number;
  duplicatePacketsCount: number;
  outOfOrderPacketsCount: number;
  lastHardwareTimestamp: number | string | null;
  lastServerReceiveTime: number | null;
  connectionState: NodeConnectionState;
  sensorAvailability: SensorAvailabilityMap;
  freshness: SensorFreshnessMap;
  latencyMs: number | null;
  packetRateHz: number | null;
  dataQualityScore: number | null;
  rssi: number | null;
  battery: number | null;
  packetLoss: number | null;
  sensorHealth: SensorHealthStatus;
  totalPacketsReceived: number;
}

export interface GatewayStats {
  serverStartTime: number;
  serverCurrentTime: number;
  activeWebSocketClients: number;
  totalPacketsAccepted: number;
  totalPacketsRejected: number;
  totalDuplicatesDetected: number;
  totalOutOfOrderDetected: number;
  registeredNodesCount: number;
  activeNodesCount: number;
  staleNodesCount: number;
  offlineNodesCount: number;
  lastIngestionTime: number | null;
  systemPacketRateHz: number | null;
}

export interface IngestionResponse {
  accepted: boolean;
  success?: boolean;
  message?: string;
  nodeId?: string;
  serverReceiveTime?: number;
  errors?: string[];
}

export interface WebSocketMessage {
  type: 'INIT_SNAPSHOT' | 'TELEMETRY_UPDATE' | 'NODE_STATUS_UPDATE' | 'GATEWAY_STATS' | 'ERROR';
  payload: any;
}
