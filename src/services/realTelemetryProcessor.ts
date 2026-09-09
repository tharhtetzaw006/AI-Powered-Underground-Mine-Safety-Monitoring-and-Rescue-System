/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * RealTelemetryProcessor: Deterministic Real-Time Sensor Signal Processing Engine.
 * 
 * Transforms genuine ESP32 telemetry into deterministic engineering metrics:
 * - 3D vector acceleration & angular rate magnitudes
 * - Kinetic Motion Index (dynamic deviation + angular rate)
 * - Temporal rolling window variance & rate-of-change statistics
 * - Acoustic activity profiling (SPL mean, max, variation)
 * - Ultrasonic obstacle proximity & delta monitoring
 * - Sensor quality classification
 * - Sensor activity state classification
 * 
 * STRICT REAL-DATA GUARANTEES:
 * - Never synthesizes, interpolates, or extrapolates samples.
 * - Missing values are preserved as null.
 * - Isolated per-node state.
 * - Prepares DetectionEngine interface returning null until a genuine model is deployed.
 */

import { SensorTelemetry, Vector3D } from '../types/telemetry.ts';
import {
  DerivedSensorMetrics,
  ProcessedSensorFeatures,
  DetectionResult,
  DetectionEngine,
  SignalActivityState,
  ProximityCondition,
  RealSensorQuality,
} from '../types/signalProcessing.ts';
import { SIGNAL_CONFIG } from '../config/signalProcessingConfig.ts';

export class RealTelemetryProcessor {
  /** Isolated temporal rolling sample buffers for each physical hardware node */
  private nodeWindows = new Map<string, SensorTelemetry[]>();

  /** Latest calculated derived metrics for each physical hardware node */
  private nodeMetrics = new Map<string, DerivedSensorMetrics>();

  /** Configured detection engine interface (returns null in standby mode) */
  private detectionEngine: DetectionEngine;

  constructor(engine?: DetectionEngine) {
    this.detectionEngine = engine || new StandbyDetectionEngine();
  }

  /**
   * Calculates instantaneous vector magnitude from 3-axis coordinates.
   * If any required component (x, y, or z) is unavailable or non-finite: returns null.
   * Never replaces missing values with zero.
   */
  public calculateVectorMagnitude(vec: Vector3D | null | undefined): number | null {
    if (!vec) return null;
    if (
      typeof vec.x !== 'number' ||
      typeof vec.y !== 'number' ||
      typeof vec.z !== 'number' ||
      !Number.isFinite(vec.x) ||
      !Number.isFinite(vec.y) ||
      !Number.isFinite(vec.z)
    ) {
      return null;
    }
    const mag = Math.sqrt(vec.x * vec.x + vec.y * vec.y + vec.z * vec.z);
    return Number(mag.toFixed(3));
  }

  /**
   * Deterministic Motion Index Calculation.
   * 
   * ENGINEERING CALCULATION:
   * Dynamic Linear Accel = |Acceleration Magnitude - 9.80665 m/s²|
   * Angular Component    = Gyroscope Magnitude * (π / 180) [converting °/s to rad/s]
   * Motion Index         = Dynamic Linear Accel + Angular Component
   * 
   * When stationary on Earth, nominal acceleration magnitude is 1g (~9.81 m/s²),
   * producing a dynamic deviation near 0.0. Physical motion or vibration introduces
   * deviations away from 1g and angular rotational velocity.
   * 
   * IMPORTANT:
   * This metric represents measured kinetic motion/activity in the sensor signal.
   * It does NOT indicate or claim human presence.
   * 
   * If either acceleration magnitude or gyroscope magnitude is missing: returns null.
   */
  public calculateMotionIndex(
    accelMag: number | null,
    gyroMag: number | null
  ): number | null {
    if (accelMag === null || gyroMag === null) {
      return null;
    }
    const dynamicAccel = Math.abs(accelMag - SIGNAL_CONFIG.GRAVITY_STANDARD);
    const angularComponent = gyroMag * (Math.PI / 180);
    return Number((dynamicAccel + angularComponent).toFixed(3));
  }

  /**
   * Ingests and processes an authentic incoming hardware telemetry packet.
   * Updates the isolated per-node rolling window and computes derived features.
   */
  public processTelemetry(telemetry: SensorTelemetry): DerivedSensorMetrics {
    const nodeId = telemetry.nodeId;
    if (!nodeId) {
      throw new Error('Telemetry packet missing nodeId');
    }

    // 1. Maintain isolated rolling sample window for this node
    let window = this.nodeWindows.get(nodeId);
    if (!window) {
      window = [];
      this.nodeWindows.set(nodeId, window);
    }

    // Append genuine packet and enforce bounded capacity
    window.push(telemetry);
    if (window.length > SIGNAL_CONFIG.ROLLING_WINDOW_SIZE) {
      window.shift();
    }

    // 2. Compute instantaneous vector magnitudes
    const accelMag = this.calculateVectorMagnitude(telemetry.acceleration);
    const gyroMag = this.calculateVectorMagnitude(telemetry.gyroscope);

    // 3. Compute deterministic kinetic Motion Index
    const motionIndex = this.calculateMotionIndex(accelMag, gyroMag);

    // 4. Compute temporal statistics over genuine rolling window
    const accelMagsInWindow: number[] = [];
    const gyroMagsInWindow: number[] = [];
    const soundsInWindow: number[] = [];

    for (const sample of window) {
      const aM = this.calculateVectorMagnitude(sample.acceleration);
      if (aM !== null) accelMagsInWindow.push(aM);

      const gM = this.calculateVectorMagnitude(sample.gyroscope);
      if (gM !== null) gyroMagsInWindow.push(gM);

      if (typeof sample.soundLevel === 'number' && Number.isFinite(sample.soundLevel)) {
        soundsInWindow.push(sample.soundLevel);
      }
    }

    // Acceleration magnitude mean & variance
    let accelMagMean: number | null = null;
    let accelMagVariance: number | null = null;
    if (accelMagsInWindow.length >= SIGNAL_CONFIG.MIN_SAMPLES_FOR_VARIANCE) {
      const sum = accelMagsInWindow.reduce((a, b) => a + b, 0);
      accelMagMean = Number((sum / accelMagsInWindow.length).toFixed(3));
      const sqDiffs = accelMagsInWindow.map((val) => Math.pow(val - accelMagMean!, 2));
      const variance = sqDiffs.reduce((a, b) => a + b, 0) / accelMagsInWindow.length;
      accelMagVariance = Number(variance.toFixed(4));
    }

    // Gyroscope magnitude mean & variance
    let gyroMagMean: number | null = null;
    let gyroMagVariance: number | null = null;
    if (gyroMagsInWindow.length >= SIGNAL_CONFIG.MIN_SAMPLES_FOR_VARIANCE) {
      const sum = gyroMagsInWindow.reduce((a, b) => a + b, 0);
      gyroMagMean = Number((sum / gyroMagsInWindow.length).toFixed(3));
      const sqDiffs = gyroMagsInWindow.map((val) => Math.pow(val - gyroMagMean!, 2));
      const variance = sqDiffs.reduce((a, b) => a + b, 0) / gyroMagsInWindow.length;
      gyroMagVariance = Number(variance.toFixed(4));
    }

    // Signal change rate (delta accel mag / delta time between two most recent samples)
    let signalChangeRate: number | null = null;
    if (window.length >= 2 && accelMag !== null) {
      // Find the most recent preceding sample with a valid acceleration magnitude
      for (let i = window.length - 2; i >= 0; i--) {
        const prevSample = window[i];
        const prevAM = this.calculateVectorMagnitude(prevSample.acceleration);
        if (prevAM !== null) {
          const dt = (telemetry.serverReceiveTime - prevSample.serverReceiveTime) / 1000;
          if (dt >= SIGNAL_CONFIG.MIN_TIME_DELTA_SECONDS) {
            signalChangeRate = Number(((accelMag - prevAM) / dt).toFixed(3));
          }
          break;
        }
      }
    }

    // 5. Acoustic Activity Features
    const currentSoundLevel =
      typeof telemetry.soundLevel === 'number' && Number.isFinite(telemetry.soundLevel)
        ? Number(telemetry.soundLevel.toFixed(1))
        : null;

    let rollingSoundMean: number | null = null;
    let rollingSoundMax: number | null = null;
    let soundVariation: number | null = null;

    if (soundsInWindow.length > 0) {
      rollingSoundMax = Number(Math.max(...soundsInWindow).toFixed(1));
      if (soundsInWindow.length >= SIGNAL_CONFIG.MIN_SAMPLES_FOR_VARIANCE) {
        const soundSum = soundsInWindow.reduce((a, b) => a + b, 0);
        rollingSoundMean = Number((soundSum / soundsInWindow.length).toFixed(1));
        const soundMin = Math.min(...soundsInWindow);
        soundVariation = Number((rollingSoundMax - soundMin).toFixed(1));
      } else {
        rollingSoundMean = currentSoundLevel;
        soundVariation = 0.0;
      }
    }

    // 6. Obstacle Distance & Proximity Monitoring
    const distance =
      typeof telemetry.distance === 'number' && Number.isFinite(telemetry.distance)
        ? Number(telemetry.distance.toFixed(2))
        : null;

    let distanceDelta: number | null = null;
    if (distance !== null && window.length >= 2) {
      for (let i = window.length - 2; i >= 0; i--) {
        const prevDist = window[i].distance;
        if (typeof prevDist === 'number' && Number.isFinite(prevDist)) {
          distanceDelta = Number((distance - prevDist).toFixed(3));
          break;
        }
      }
    }

    let proximityCondition: ProximityCondition = 'NO DATA';
    if (distance !== null) {
      if (distance < SIGNAL_CONFIG.DISTANCE.CRITICAL_M) {
        proximityCondition = 'CRITICAL';
      } else if (distance < SIGNAL_CONFIG.DISTANCE.CAUTION_M) {
        proximityCondition = 'CAUTION';
      } else {
        proximityCondition = 'CLEAR';
      }
    }

    // 7. Sensor Quality Assessment
    let sensorQuality: RealSensorQuality = 'HEALTHY';
    const isImuAvailable = accelMag !== null || gyroMag !== null;
    const isDistAvailable = distance !== null;
    const isSoundAvailable = currentSoundLevel !== null;

    if (!isImuAvailable && !isDistAvailable && !isSoundAvailable) {
      sensorQuality = 'NO DATA';
    } else if (!isImuAvailable || !isDistAvailable || !isSoundAvailable) {
      sensorQuality = 'DEGRADED';
    } else if (
      (telemetry.battery !== null && telemetry.battery <= 20) ||
      (telemetry.packetLoss !== null && telemetry.packetLoss > 15)
    ) {
      sensorQuality = 'DEGRADED';
    }

    // 8. Deterministic Sensor Activity State
    // Evaluates measured sensor excitation levels (NOT human detection).
    let activityState: SignalActivityState = 'NO DATA';
    if (motionIndex !== null || currentSoundLevel !== null) {
      const isHighMotion = motionIndex !== null && motionIndex >= SIGNAL_CONFIG.MOTION_INDEX.HIGH_MIN;
      const isHighSound = currentSoundLevel !== null && currentSoundLevel >= SIGNAL_CONFIG.ACOUSTIC.HIGH_MIN_DB;

      const isElevatedMotion = motionIndex !== null && motionIndex >= SIGNAL_CONFIG.MOTION_INDEX.ELEVATED_MAX;
      const isElevatedSound = currentSoundLevel !== null && currentSoundLevel >= SIGNAL_CONFIG.ACOUSTIC.ELEVATED_MAX_DB;

      const isLowMotion = motionIndex !== null && motionIndex >= SIGNAL_CONFIG.MOTION_INDEX.LOW_MAX;
      const isLowSound = currentSoundLevel !== null && currentSoundLevel >= SIGNAL_CONFIG.ACOUSTIC.MODERATE_MAX_DB;

      if (isHighMotion || isHighSound) {
        activityState = 'HIGH ACTIVITY';
      } else if (isElevatedMotion || isElevatedSound) {
        activityState = 'ELEVATED ACTIVITY';
      } else if (isLowMotion || isLowSound) {
        activityState = 'LOW ACTIVITY';
      } else {
        activityState = 'QUIET';
      }
    }

    const metrics: DerivedSensorMetrics = {
      nodeId,
      accelerationMagnitude: accelMag,
      gyroscopeMagnitude: gyroMag,
      motionIndex,
      accelMagMean,
      accelMagVariance,
      gyroMagMean,
      gyroMagVariance,
      signalChangeRate,
      currentSoundLevel,
      rollingSoundMean,
      rollingSoundMax,
      soundVariation,
      distance,
      distanceDelta,
      proximityCondition,
      sensorQuality,
      activityState,
      sampleCount: window.length,
      lastProcessedTimestamp: telemetry.serverReceiveTime,
    };

    this.nodeMetrics.set(nodeId, metrics);

    // Prepared Detection Engine pass (returns null until an actual model is connected)
    const features: ProcessedSensorFeatures = {
      nodeId,
      timestamp: telemetry.serverReceiveTime,
      metrics,
      rawTelemetry: telemetry,
    };
    this.detectionEngine.processFeatures(features);

    return metrics;
  }

  /** Retrieve computed metrics for a given physical node */
  public getNodeMetrics(nodeId: string): DerivedSensorMetrics | null {
    return this.nodeMetrics.get(nodeId) || null;
  }

  /** Retrieve all computed metrics by node */
  public getAllNodeMetrics(): Record<string, DerivedSensorMetrics> {
    const result: Record<string, DerivedSensorMetrics> = {};
    for (const [id, m] of this.nodeMetrics.entries()) {
      result[id] = m;
    }
    return result;
  }

  /** Retrieve genuine rolling sample window for a physical node */
  public getNodeWindow(nodeId: string): ReadonlyArray<SensorTelemetry> {
    return this.nodeWindows.get(nodeId) || [];
  }

  /** Clear single node's processing buffer */
  public clearNode(nodeId: string): void {
    this.nodeWindows.delete(nodeId);
    this.nodeMetrics.delete(nodeId);
  }

  /** Clear all nodes' processing buffers upon field reset */
  public clearAll(): void {
    this.nodeWindows.clear();
    this.nodeMetrics.clear();
  }
}

/**
 * Standby detection engine interface implementation.
 * Strictly returns null until an authenticated, physical detection model is connected.
 * Prevents simulated confidence or phantom human detection.
 */
export class StandbyDetectionEngine implements DetectionEngine {
  public processFeatures(_features: ProcessedSensorFeatures): DetectionResult | null {
    // Standby: No simulated or fabricated detections
    return null;
  }
}

/** Singleton instance for the application runtime */
export const realTelemetryProcessor = new RealTelemetryProcessor();
