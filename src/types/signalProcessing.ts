/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Typed definitions for the real-time sensor signal processing layer
 * and future detection engine interface.
 */

import { SensorTelemetry } from './telemetry.ts';

export type SignalActivityState =
  | 'NO DATA'
  | 'QUIET'
  | 'LOW ACTIVITY'
  | 'ELEVATED ACTIVITY'
  | 'HIGH ACTIVITY';

export type ProximityCondition =
  | 'CLEAR'
  | 'CAUTION'
  | 'CRITICAL'
  | 'NO DATA';

export type RealSensorQuality =
  | 'HEALTHY'
  | 'DEGRADED'
  | 'NO DATA'
  | 'ERROR';

export interface DerivedSensorMetrics {
  /** Node identifier */
  nodeId: string;

  /** Instantaneous vector acceleration magnitude in m/s²: sqrt(x² + y² + z²) */
  accelerationMagnitude: number | null;

  /** Instantaneous vector angular-rate magnitude in °/s: sqrt(x² + y² + z²) */
  gyroscopeMagnitude: number | null;

  /**
   * Deterministic Motion Index (dimensionless).
   * Derived from dynamic linear acceleration deviation from 1g + angular rate.
   * Represents physical sensor kinetic movement, NOT human detection.
   */
  motionIndex: number | null;

  /** Rolling mean of acceleration magnitude in m/s² over real window */
  accelMagMean: number | null;

  /** Rolling variance of acceleration magnitude in (m/s²)² over real window */
  accelMagVariance: number | null;

  /** Rolling mean of gyroscope magnitude in °/s over real window */
  gyroMagMean: number | null;

  /** Rolling variance of gyroscope magnitude in (°/s)² over real window */
  gyroMagVariance: number | null;

  /** Instantaneous rate of change of acceleration magnitude in m/s³ */
  signalChangeRate: number | null;

  /** Current sound level in dB SPL */
  currentSoundLevel: number | null;

  /** Rolling mean sound level in dB SPL over real window */
  rollingSoundMean: number | null;

  /** Rolling maximum sound level in dB SPL over real window */
  rollingSoundMax: number | null;

  /** Acoustic variation (standard deviation or spread) in dB SPL over real window */
  soundVariation: number | null;

  /** Actual distance from HC-SR04 obstacle sensor in meters */
  distance: number | null;

  /** Delta distance from immediately previous genuine sample in meters */
  distanceDelta: number | null;

  /** Proximity safety condition based on configurable engineering thresholds */
  proximityCondition: ProximityCondition;

  /** Real-time sensor quality state based strictly on telemetry validity and recency */
  sensorQuality: RealSensorQuality;

  /** Deterministic sensor activity state (SENSOR ACTIVITY ONLY, NOT human presence) */
  activityState: SignalActivityState;

  /** Total genuine samples currently retained in this node's rolling window */
  sampleCount: number;

  /** Server receive timestamp of the sample producing this derived state */
  lastProcessedTimestamp: number | null;
}

/**
 * Clean interface prepared for a future real detection model.
 * Does NOT generate fake data; returns null until an actual model is connected.
 */
export interface ProcessedSensorFeatures {
  nodeId: string;
  timestamp: number;
  metrics: DerivedSensorMetrics;
  rawTelemetry: SensorTelemetry;
}

export interface DetectionResult {
  subjectCount: number;
  confidence: number;
  activityState: string;
  zone: string;
  timestamp: number;
  source: string;
}

export interface DetectionEngine {
  processFeatures(features: ProcessedSensorFeatures): DetectionResult | null;
}
