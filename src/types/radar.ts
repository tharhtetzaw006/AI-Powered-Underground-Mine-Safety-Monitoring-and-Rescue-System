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
  | 'CONNECTED'
  | 'STALE'
  | 'ERROR'
  | 'ONLINE'
  | 'OFFLINE'
  | 'NO_DATA';

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
  | 'RADAR_60GHZ'
  | 'RADAR_24GHZ'
  | 'RADAR'
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

export interface RadarTarget {
  targetId: string;
  rangeM: number;
  azimuthDeg?: number | null;
  radialVelocityMps?: number | null;
  snrDb?: number | null;
  motionState?: string | null;
  classification?: 'HUMAN' | 'ANIMAL' | 'UNKNOWN TARGET' | string | null;
  classificationConfidence?: number | null;
  lastSeen?: number | string | null;
}

export interface RadarTelemetry {
  deviceId: string;
  timestamp: string | number | null;
  receivedAt: number;
  source: string | null;
  rangeM: number | null;
  rangeMeters?: number | null;
  radialVelocityMps: number | null;
  motionState: 'NO_DATA' | 'MOTION_DETECTED' | 'STATIONARY' | 'UNCERTAIN' | string | null;
  motionDetected?: boolean | null;
  targetCount: number | null;
  microMotion: number | boolean | string | null;
  breathingRateBpm: number | null;
  heartRateBpm: number | null;
  dataQuality: number | null;
  quality?: number | null;
  snrDb: number | null;
  snr?: number | null;
  sequence: number | null;
  rawFeatures?: RadarFeatureVector | null;
  vitalSignAvailable?: boolean;
  // Optional real target position & classification from multi-dimensional radar hardware (AoA / FMCW / tracking engine)
  azimuthDeg?: number | null;
  angleDeg?: number | null;
  targetId?: string | null;
  classification?: 'HUMAN' | 'ANIMAL' | 'UNKNOWN TARGET' | string | null;
  classificationConfidence?: number | null;
  targets?: RadarTarget[] | null;
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
  source: string;
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

export type FusionModalityStatus =
  | 'PERSON DETECTED'
  | 'CLEAR'
  | 'NO DATA'
  | 'OFFLINE';

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
  sourceDescription: 'CSI' | 'RADAR' | 'CSI + RADAR' | 'NONE';
  csiStatus: string;
  radarStatus: string;
  csiModalityStatus: FusionModalityStatus;
  radarModalityStatus: FusionModalityStatus;
  csiConfidence: number | null;
  radarConfidence: number | null;
  fusionState: FusionState;
  lastFusionUpdate: number | null;
  syncWindowMs: number;
  inSync: boolean;
  notes: string;
}
