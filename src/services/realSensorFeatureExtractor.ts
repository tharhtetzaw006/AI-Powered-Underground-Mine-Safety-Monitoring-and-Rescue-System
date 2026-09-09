/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * RealSensorFeatureExtractor
 * 
 * Computes strictly derived features from real received hardware telemetry.
 * Operates on strictly isolated per-node rolling sample windows.
 * Never fabricates values; returns null for missing or unmeasured dimensions.
 */

import { SensorTelemetry } from '../types/telemetry.ts';
import { RealSensorFeatures, HumanDetectionInput } from '../types/detection.ts';

export interface NodeFeatureWindow {
  nodeId: string;
  samples: SensorTelemetry[];
  lastReceiveTime: number | null;
  lastDistance: number | null;
  maxWindowSize: number;
}

export class RealSensorFeatureExtractor {
  private windows = new Map<string, NodeFeatureWindow>();
  private readonly defaultWindowSize: number;

  constructor(windowSize: number = 20) {
    this.defaultWindowSize = windowSize;
  }

  private getOrCreateWindow(nodeId: string): NodeFeatureWindow {
    let win = this.windows.get(nodeId);
    if (!win) {
      win = {
        nodeId,
        samples: [],
        lastReceiveTime: null,
        lastDistance: null,
        maxWindowSize: this.defaultWindowSize,
      };
      this.windows.set(nodeId, win);
    }
    return win;
  }

  public clearNode(nodeId: string): void {
    this.windows.delete(nodeId);
  }

  public clearAll(): void {
    this.windows.clear();
  }

  /**
   * Ingests a real telemetry packet and extracts features strictly from genuine data.
   */
  public extractFeatures(telemetry: SensorTelemetry): {
    features: RealSensorFeatures;
    detectionInput: HumanDetectionInput;
  } {
    const nodeId = telemetry.nodeId;
    const win = this.getOrCreateWindow(nodeId);

    const now = telemetry.serverReceiveTime || Date.now();
    const packetTiming = win.lastReceiveTime !== null ? Math.max(0, now - win.lastReceiveTime) : null;
    const sensorFreshness = packetTiming;
    win.lastReceiveTime = now;

    // Append sample to node window
    win.samples.push(telemetry);
    if (win.samples.length > win.maxWindowSize) {
      win.samples.shift();
    }

    // 1. Instantaneous vector magnitudes
    let accelerationMagnitude: number | null = null;
    if (
      telemetry.acceleration &&
      typeof telemetry.acceleration.x === 'number' &&
      typeof telemetry.acceleration.y === 'number' &&
      typeof telemetry.acceleration.z === 'number'
    ) {
      const { x, y, z } = telemetry.acceleration;
      accelerationMagnitude = Number(Math.sqrt(x * x + y * y + z * z).toFixed(3));
    }

    let gyroscopeMagnitude: number | null = null;
    if (
      telemetry.gyroscope &&
      typeof telemetry.gyroscope.x === 'number' &&
      typeof telemetry.gyroscope.y === 'number' &&
      typeof telemetry.gyroscope.z === 'number'
    ) {
      const { x, y, z } = telemetry.gyroscope;
      gyroscopeMagnitude = Number(Math.sqrt(x * x + y * y + z * z).toFixed(3));
    }

    // 2. Rolling window acceleration statistics
    const accelMags = win.samples
      .map((s) => {
        if (
          !s.acceleration ||
          typeof s.acceleration.x !== 'number' ||
          typeof s.acceleration.y !== 'number' ||
          typeof s.acceleration.z !== 'number'
        ) {
          return null;
        }
        const { x, y, z } = s.acceleration;
        return Math.sqrt(x * x + y * y + z * z);
      })
      .filter((v): v is number => v !== null);

    let accelerationVariance: number | null = null;
    if (accelMags.length >= 2) {
      const mean = accelMags.reduce((a, b) => a + b, 0) / accelMags.length;
      const sumSq = accelMags.reduce((acc, val) => acc + (val - mean) ** 2, 0);
      accelerationVariance = Number((sumSq / (accelMags.length - 1)).toFixed(4));
    }

    // 3. Rolling window gyroscope statistics
    const gyroMags = win.samples
      .map((s) => {
        if (
          !s.gyroscope ||
          typeof s.gyroscope.x !== 'number' ||
          typeof s.gyroscope.y !== 'number' ||
          typeof s.gyroscope.z !== 'number'
        ) {
          return null;
        }
        const { x, y, z } = s.gyroscope;
        return Math.sqrt(x * x + y * y + z * z);
      })
      .filter((v): v is number => v !== null);

    let gyroscopeVariance: number | null = null;
    if (gyroMags.length >= 2) {
      const mean = gyroMags.reduce((a, b) => a + b, 0) / gyroMags.length;
      const sumSq = gyroMags.reduce((acc, val) => acc + (val - mean) ** 2, 0);
      gyroscopeVariance = Number((sumSq / (gyroMags.length - 1)).toFixed(4));
    }

    // 4. Motion / Activity Index (dimensionless indicator derived from real kinetic dynamics)
    let motionIndex: number | null = null;
    if (accelerationVariance !== null) {
      const gyroComponent = gyroscopeVariance !== null ? Math.min(gyroscopeVariance / 50.0, 1.0) : 0;
      motionIndex = Number(Math.min(10.0, accelerationVariance * 2.0 + gyroComponent * 5.0).toFixed(2));
    }

    // 5. Acoustic features
    const acousticLevel =
      telemetry.soundLevel !== null && typeof telemetry.soundLevel === 'number'
        ? Number(telemetry.soundLevel.toFixed(1))
        : null;

    const soundSamples = win.samples
      .map((s) => s.soundLevel)
      .filter((v): v is number => typeof v === 'number');

    let acousticMean: number | null = null;
    let acousticPeak: number | null = null;
    if (soundSamples.length > 0) {
      acousticMean = Number((soundSamples.reduce((a, b) => a + b, 0) / soundSamples.length).toFixed(1));
      acousticPeak = Number(Math.max(...soundSamples).toFixed(1));
    }

    // 6. Ultrasonic distance & delta
    const distance =
      telemetry.distance !== null && typeof telemetry.distance === 'number'
        ? Number(telemetry.distance.toFixed(3))
        : null;

    let distanceChange: number | null = null;
    if (distance !== null) {
      if (win.lastDistance !== null) {
        distanceChange = Number(Math.abs(distance - win.lastDistance).toFixed(3));
      }
      win.lastDistance = distance;
    }

    // 7. RF Physical Link features
    const rssi = typeof telemetry.rssi === 'number' ? telemetry.rssi : null;
    const snr = typeof telemetry.snr === 'number' ? telemetry.snr : null;
    const packetLoss = typeof telemetry.packetLoss === 'number' ? telemetry.packetLoss : null;

    // 8. Multi-channel completeness & signal quality
    let validChannels = 0;
    let expectedChannels = 0;
    for (const sample of win.samples) {
      expectedChannels += 4;
      if (sample.acceleration) validChannels++;
      if (sample.gyroscope) validChannels++;
      if (sample.distance !== null) validChannels++;
      if (sample.soundLevel !== null) validChannels++;
    }

    const signalQuality =
      expectedChannels > 0 ? Number(((validChannels / expectedChannels) * 100).toFixed(1)) : null;

    // 9. Detection source determination
    const rawTelemetry = telemetry as any;
    let source: HumanDetectionInput['source'] = 'UNKNOWN';
    if (rawTelemetry.radar || rawTelemetry.uwbRadar) {
      source = 'RADAR';
    } else if (rawTelemetry.rfCsi || rawTelemetry.csi) {
      source = 'RF';
    } else if (rawTelemetry.camera || rawTelemetry.imageStream) {
      source = 'CAMERA';
    } else if (rawTelemetry.sensorFusion) {
      source = 'SENSOR_FUSION';
    } else {
      source = 'UNKNOWN';
    }

    const rfCsiFeatures = rawTelemetry.rfCsi || rawTelemetry.csi || null;

    const features: RealSensorFeatures = {
      accelerationMagnitude,
      gyroscopeMagnitude,
      accelerationVariance,
      gyroscopeVariance,
      motionIndex,
      acousticLevel,
      acousticMean,
      acousticPeak,
      distance,
      distanceChange,
      rssi,
      snr,
      packetTiming,
      packetLoss,
      sensorFreshness,
      signalQuality,
      rfCsiFeatures,
      rawSampleCount: win.samples.length,
    };

    const detectionInput: HumanDetectionInput = {
      nodeId,
      timestamp: now,
      source,
      features,
      sequence: telemetry.sequenceNumber ?? null,
      quality: signalQuality,
    };

    return { features, detectionInput };
  }
}

export const realSensorFeatureExtractor = new RealSensorFeatureExtractor(20);
