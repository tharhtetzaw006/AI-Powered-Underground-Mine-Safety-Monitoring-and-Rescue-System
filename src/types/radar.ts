/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Strict TypeScript contracts for the Radar Sensing & Sensor Fusion Subsystems.
 * 
 * Hardware Abstraction & Truthfulness Guarantees:
 * - Real-data ready: Designed for FMCW/UWB/Doppler radar telemetry.
 * - ZERO mock values: When hardware is not connected, all measurements are null/undefined.
 * - Missing data is never treated as zero.
 * - Discrete people count is not estimated unless a validated count model is active.
 */

export type RadarConnectionStatus =
  | 'NOT_CONNECTED'
  | 'ONLINE'
  | 'STALE'
  | 'OFFLINE'
  | 'NOT_CONFIGURED'
  | 'NO_DATA'
  | 'ERROR';

export type RadarMotionState =
  | 'NO_DATA'
  | 'MOTION_DETECTED'
  | 'STATIONARY'
  | 'UNCERTAIN';

export type RadarDataSource =
  | 'SERIAL'
  | 'ESP32_TELEMETRY'
  | 'HTTP'
  | 'WEBSOCKET'
  | 'LORA_GATEWAY'
  | 'UNKNOWN';

export interface RadarFeatureVector {
  rangeMeters: number | null;
  radialVelocityMps: number | null;
  signalStrengthDbm: number | null;
  snrDb: number | null;
  dopplerBin: number | null;
  microMotionEnergy: number | null;
  rangeSpread: number | null;
  rawBins?: number[] | null;
}

export interface RadarTelemetry {
  timestamp: string | number | null;
  receivedAt: number;
  deviceId: string;
  source: RadarDataSource;
  rangeMeters: number | null;
  radialVelocityMps: number | null;
  motionDetected: boolean | null;
  motionState: RadarMotionState;
  signalStrength: number | null; // e.g. dBm
  snr: number | null;
  breathingRateBpm: number | null;
  heartRateBpm: number | null;
  microMotion: number | null;
  targetCount: number | null;
  rawFeatures: RadarFeatureVector | null;
  quality: number | null; // 0.0 - 1.0
  vitalSignAvailable: boolean;
}

export interface RadarDetectionResult {
  status: 'NO_DATA' | 'TARGET_DETECTED' | 'NO_TARGET' | 'UNCERTAIN' | 'ERROR';
  humanDetected: boolean | null;
  confidence: number | null;
  targetCount: number | null;
  timestamp: string | number | null;
  modelName: string | null;
  message?: string | null;
}

export interface RadarDeviceStatus {
  connected: boolean;
  status: RadarConnectionStatus;
  deviceId: string | null;
  lastSeen: number | null;
  sampleRateHz: number | null;
  firmwareVersion: string | null;
  source: RadarDataSource;
  vitalSignSupported: boolean;
  message: string | null;
}

export interface RadarState {
  deviceStatus: RadarDeviceStatus;
  latestTelemetry: RadarTelemetry | null;
  latestDetection: RadarDetectionResult | null;
  isStale: boolean;
  lastMessageTimestamp: number | null;
  error: string | null;
}

export type FusionEvidenceSource =
  | 'NO_DATA'
  | 'CSI_ONLY'
  | 'RADAR_ONLY'
  | 'MULTI_SENSOR'
  | 'CONFLICT'
  | 'ERROR';

export type FusionFinalStatus =
  | 'NO DATA'
  | 'CSI DETECTED'
  | 'RADAR DETECTED'
  | 'MULTI-SENSOR DETECTED'
  | 'CONFLICT'
  | 'ERROR';

export type FusionState =
  | 'IDLE'
  | 'SINGLE_SOURCE_CSI'
  | 'SINGLE_SOURCE_RADAR'
  | 'FUSED_CONCORDANT'
  | 'FUSED_CONFLICT'
  | 'INSUFFICIENT_EVIDENCE';

export interface SensorFusionResult {
  finalStatus: FusionFinalStatus;
  evidenceSource: FusionEvidenceSource;
  csiStatus: string;
  radarStatus: string;
  csiConfidence: number | null;
  radarConfidence: number | null;
  fusionState: FusionState;
  lastFusionUpdate: number | null;
  notes: string;
}
