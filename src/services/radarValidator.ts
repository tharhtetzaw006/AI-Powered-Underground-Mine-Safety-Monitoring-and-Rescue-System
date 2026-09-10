/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Strict Data Validation Layer for Radar Telemetry.
 * 
 * Rules:
 * - Reject malformed or invalid packets.
 * - Enforce non-negative range, finite velocity/SNR, bounded confidence [0, 1].
 * - Target count must be non-negative integer.
 * - Missing/null data is preserved as null; NEVER silently converted to zero.
 */

import {
  RadarTelemetry,
  RadarDataSource,
  RadarMotionState,
  RadarDetectionResult,
} from '../types/radar.ts';

export interface ValidationResult<T> {
  isValid: boolean;
  error: string | null;
  data: T | null;
}

export function validateRadarTelemetry(
  raw: unknown,
  fallbackSource: string = 'HARDWARE'
): ValidationResult<RadarTelemetry> {
  if (!raw || typeof raw !== 'object') {
    return { isValid: false, error: 'Payload must be a non-null JSON object', data: null };
  }

  const obj = raw as Record<string, unknown>;

  // Device ID is mandatory for authentic hardware telemetry
  const rawDeviceId = obj.deviceId ?? obj.device_id ?? obj.sensor_id ?? obj.id;
  if (typeof rawDeviceId !== 'string' || rawDeviceId.trim().length === 0) {
    return { isValid: false, error: 'Radar packet missing valid non-empty deviceId', data: null };
  }
  const deviceId = rawDeviceId.trim();

  // Timestamp validation
  let timestamp: string | number | null = null;
  const rawTs = obj.timestamp ?? obj.time ?? obj.ts;
  if (rawTs !== undefined && rawTs !== null) {
    if (typeof rawTs === 'number') {
      if (!Number.isFinite(rawTs) || rawTs <= 0) {
        return { isValid: false, error: 'Numeric timestamp must be a positive finite epoch', data: null };
      }
      timestamp = rawTs;
    } else if (typeof rawTs === 'string') {
      const parsedDate = Date.parse(rawTs);
      if (isNaN(parsedDate)) {
        return { isValid: false, error: 'String timestamp is not a valid ISO date', data: null };
      }
      timestamp = rawTs;
    } else {
      return { isValid: false, error: 'Timestamp must be an ISO date string or numeric epoch', data: null };
    }
  }

  // Range validation: cannot be negative, must be finite number. Do NOT convert missing to zero.
  let rangeM: number | null = null;
  const rawRange = obj.rangeM ?? obj.rangeMeters ?? obj.range_meters ?? obj.range ?? obj.distance;
  if (rawRange !== undefined && rawRange !== null) {
    if (typeof rawRange !== 'number' || !Number.isFinite(rawRange)) {
      return { isValid: false, error: 'Range must be a finite number', data: null };
    }
    if (rawRange < 0) {
      return { isValid: false, error: 'Range cannot be negative', data: null };
    }
    rangeM = rawRange;
  }

  // Radial velocity validation: must be finite number.
  let radialVelocityMps: number | null = null;
  const rawVel = obj.radialVelocityMps ?? obj.radial_velocity ?? obj.velocity;
  if (rawVel !== undefined && rawVel !== null) {
    if (typeof rawVel !== 'number' || !Number.isFinite(rawVel)) {
      return { isValid: false, error: 'Radial velocity must be a finite number', data: null };
    }
    radialVelocityMps = rawVel;
  }

  // Motion state & motionDetected
  let motionDetected: boolean | null = null;
  let motionState: RadarMotionState = 'NO_DATA';
  const rawMotion = obj.motionDetected ?? obj.motion_detected ?? obj.motion;
  if (typeof rawMotion === 'boolean') {
    motionDetected = rawMotion;
    motionState = rawMotion ? 'MOTION_DETECTED' : 'STATIONARY';
  }

  const rawMotionState = obj.motionState ?? obj.motion_state;
  if (typeof rawMotionState === 'string') {
    const s = rawMotionState.trim().toUpperCase();
    if (s === 'MOTION_DETECTED' || s === 'STATIONARY' || s === 'UNCERTAIN' || s === 'NO_DATA') {
      motionState = s as RadarMotionState;
      if (s === 'MOTION_DETECTED') motionDetected = true;
      if (s === 'STATIONARY') motionDetected = false;
    }
  }

  // Target count: must be non-negative integer. Do NOT convert missing to zero.
  let targetCount: number | null = null;
  const rawTargets = obj.targetCount ?? obj.target_count ?? obj.targets;
  if (rawTargets !== undefined && rawTargets !== null) {
    if (typeof rawTargets !== 'number' || !Number.isFinite(rawTargets) || rawTargets < 0 || Math.floor(rawTargets) !== rawTargets) {
      return { isValid: false, error: 'Target count must be a non-negative integer', data: null };
    }
    targetCount = rawTargets;
  }

  // Micro-motion: finite number, boolean, or string
  let microMotion: number | boolean | string | null = null;
  const rawMicro = obj.microMotion ?? obj.micro_motion ?? obj.vibration;
  if (rawMicro !== undefined && rawMicro !== null) {
    if (typeof rawMicro === 'number') {
      if (!Number.isFinite(rawMicro)) {
        return { isValid: false, error: 'Micro-motion numeric value must be finite', data: null };
      }
      microMotion = rawMicro;
    } else if (typeof rawMicro === 'boolean' || typeof rawMicro === 'string') {
      microMotion = rawMicro;
    } else {
      return { isValid: false, error: 'Micro-motion must be a number, boolean, or string', data: null };
    }
  }

  // Vital Signs: Breathing rate (reject negative or non-finite values)
  let breathingRateBpm: number | null = null;
  const rawBreathing = obj.breathingRateBpm ?? obj.breathing_rate ?? obj.respiration_rate;
  if (rawBreathing !== undefined && rawBreathing !== null) {
    if (typeof rawBreathing !== 'number' || !Number.isFinite(rawBreathing) || rawBreathing < 0) {
      return { isValid: false, error: 'Breathing rate must be a non-negative finite number', data: null };
    }
    breathingRateBpm = rawBreathing;
  }

  // Vital Signs: Heart rate (reject negative or non-finite values)
  let heartRateBpm: number | null = null;
  const rawHeart = obj.heartRateBpm ?? obj.heart_rate ?? obj.pulse_rate;
  if (rawHeart !== undefined && rawHeart !== null) {
    if (typeof rawHeart !== 'number' || !Number.isFinite(rawHeart) || rawHeart < 0) {
      return { isValid: false, error: 'Heart rate must be a non-negative finite number', data: null };
    }
    heartRateBpm = rawHeart;
  }

  // Data Quality / Confidence validation
  let dataQuality: number | null = null;
  const rawQuality = obj.dataQuality ?? obj.quality ?? obj.confidence;
  if (rawQuality !== undefined && rawQuality !== null) {
    if (typeof rawQuality !== 'number' || !Number.isFinite(rawQuality) || rawQuality < 0) {
      return { isValid: false, error: 'Data quality must be a non-negative finite number', data: null };
    }
    dataQuality = rawQuality <= 1 ? rawQuality : Number((rawQuality / 100).toFixed(4));
  }

  // SNR (dB) validation
  let snrDb: number | null = null;
  const rawSnr = obj.snrDb ?? obj.snr;
  if (rawSnr !== undefined && rawSnr !== null) {
    if (typeof rawSnr !== 'number' || !Number.isFinite(rawSnr)) {
      return { isValid: false, error: 'SNR must be a finite number', data: null };
    }
    snrDb = rawSnr;
  }

  // Sequence number validation
  let sequence: number | null = null;
  const rawSeq = obj.sequence ?? obj.seq;
  if (rawSeq !== undefined && rawSeq !== null) {
    if (typeof rawSeq !== 'number' || !Number.isFinite(rawSeq) || rawSeq < 0 || Math.floor(rawSeq) !== rawSeq) {
      return { isValid: false, error: 'Sequence must be a non-negative integer', data: null };
    }
    sequence = rawSeq;
  }

  // Source field
  let source: string | null = null;
  if (typeof obj.source === 'string' && obj.source.trim().length > 0) {
    source = obj.source.trim();
  } else {
    source = fallbackSource;
  }

  // Azimuth / Angle validation (finite number in degrees, e.g. -180..+180 or 0..360)
  let azimuthDeg: number | null = null;
  const rawAzimuth = obj.azimuthDeg ?? obj.azimuth ?? obj.angleDeg ?? obj.angle ?? obj.bearing;
  if (rawAzimuth !== undefined && rawAzimuth !== null) {
    if (typeof rawAzimuth === 'number' && Number.isFinite(rawAzimuth)) {
      azimuthDeg = rawAzimuth;
    }
  }

  // Target ID validation
  let targetId: string | null = null;
  const rawTargetId = obj.targetId ?? obj.target_id ?? obj.trackId ?? obj.track_id;
  if (typeof rawTargetId === 'string' && rawTargetId.trim().length > 0) {
    targetId = rawTargetId.trim();
  }

  // Real classification validation (only accepted if explicitly provided by backend/model)
  let classification: 'HUMAN' | 'ANIMAL' | 'UNKNOWN TARGET' | string | null = null;
  const rawClass = obj.classification ?? obj.target_type ?? obj.class;
  if (typeof rawClass === 'string' && rawClass.trim().length > 0) {
    const normClass = rawClass.trim().toUpperCase();
    if (normClass === 'HUMAN' || normClass === 'ANIMAL' || normClass === 'UNKNOWN TARGET' || normClass === 'UNKNOWN') {
      classification = normClass === 'UNKNOWN' ? 'UNKNOWN TARGET' : (normClass as any);
    } else {
      classification = rawClass.trim();
    }
  }

  // Classification confidence (finite number [0, 1] or [0, 100])
  let classificationConfidence: number | null = null;
  const rawClassConf = obj.classificationConfidence ?? obj.classification_confidence ?? obj.class_confidence;
  if (rawClassConf !== undefined && rawClassConf !== null) {
    if (typeof rawClassConf === 'number' && Number.isFinite(rawClassConf) && rawClassConf >= 0) {
      classificationConfidence = rawClassConf <= 1 ? rawClassConf : Number((rawClassConf / 100).toFixed(4));
    }
  }

  // Multi-target list validation
  let targets: RadarTelemetry['targets'] = null;
  const rawTargetList = obj.targets ?? obj.targetList ?? obj.target_list;
  if (Array.isArray(rawTargetList)) {
    targets = rawTargetList
      .filter((t): t is Record<string, unknown> => Boolean(t && typeof t === 'object'))
      .map((t, idx) => {
        const tRange = typeof t.rangeM === 'number' && Number.isFinite(t.rangeM) && t.rangeM >= 0
          ? t.rangeM
          : typeof t.range === 'number' && Number.isFinite(t.range) && t.range >= 0
          ? t.range
          : 0;
        const tAzimuth = typeof t.azimuthDeg === 'number' && Number.isFinite(t.azimuthDeg)
          ? t.azimuthDeg
          : typeof t.azimuth === 'number' && Number.isFinite(t.azimuth)
          ? t.azimuth
          : null;
        const tVel = typeof t.radialVelocityMps === 'number' && Number.isFinite(t.radialVelocityMps)
          ? t.radialVelocityMps
          : typeof t.velocity === 'number' && Number.isFinite(t.velocity)
          ? t.velocity
          : null;
        const tId = typeof t.targetId === 'string' && t.targetId.trim().length > 0
          ? t.targetId.trim()
          : typeof t.id === 'string' && t.id.trim().length > 0
          ? t.id.trim()
          : `TGT-${String(idx + 1).padStart(2, '0')}`;
        const tClass = typeof t.classification === 'string' ? t.classification : null;
        const tConf = typeof t.classificationConfidence === 'number' && Number.isFinite(t.classificationConfidence)
          ? t.classificationConfidence
          : null;

        return {
          targetId: tId,
          rangeM: tRange,
          azimuthDeg: tAzimuth,
          radialVelocityMps: tVel,
          snrDb: typeof t.snrDb === 'number' && Number.isFinite(t.snrDb) ? t.snrDb : null,
          motionState: typeof t.motionState === 'string' ? t.motionState : null,
          classification: tClass,
          classificationConfidence: tConf,
          lastSeen: typeof t.lastSeen === 'number' || typeof t.lastSeen === 'string' ? t.lastSeen : Date.now(),
        };
      });
  }

  const vitalSignAvailable = breathingRateBpm !== null || heartRateBpm !== null;

  const validatedTelemetry: RadarTelemetry = {
    deviceId,
    timestamp: timestamp ?? new Date().toISOString(),
    receivedAt: Date.now(),
    source,
    rangeM,
    rangeMeters: rangeM,
    radialVelocityMps,
    motionState,
    motionDetected,
    targetCount,
    microMotion,
    breathingRateBpm,
    heartRateBpm,
    dataQuality,
    quality: dataQuality,
    snrDb,
    snr: snrDb,
    sequence,
    rawFeatures: null,
    vitalSignAvailable,
    azimuthDeg,
    angleDeg: azimuthDeg,
    targetId,
    classification,
    classificationConfidence,
    targets,
  };

  return {
    isValid: true,
    error: null,
    data: validatedTelemetry,
  };
}

export function validateRadarDetectionResult(raw: unknown): ValidationResult<RadarDetectionResult> {
  if (!raw || typeof raw !== 'object') {
    return { isValid: false, error: 'Detection result must be an object', data: null };
  }

  const obj = raw as Record<string, unknown>;
  const rawStatus = (typeof obj.status === 'string' ? obj.status : '').toUpperCase();
  const validStatuses = ['NO_DATA', 'TARGET_DETECTED', 'NO_TARGET', 'UNCERTAIN', 'ERROR'];
  const status = validStatuses.includes(rawStatus)
    ? (rawStatus as RadarDetectionResult['status'])
    : 'UNCERTAIN';

  let confidence: number | null = null;
  if (obj.confidence !== undefined && obj.confidence !== null) {
    if (typeof obj.confidence === 'number' && Number.isFinite(obj.confidence) && obj.confidence >= 0 && obj.confidence <= 1) {
      confidence = obj.confidence;
    } else {
      return { isValid: false, error: 'Detection confidence must be between 0 and 1', data: null };
    }
  }

  let targetCount: number | null = null;
  if (obj.targetCount !== undefined && obj.targetCount !== null) {
    if (typeof obj.targetCount === 'number' && Number.isFinite(obj.targetCount) && obj.targetCount >= 0 && Math.floor(obj.targetCount) === obj.targetCount) {
      targetCount = obj.targetCount;
    }
  }

  return {
    isValid: true,
    error: null,
    data: {
      status,
      humanDetected: typeof obj.humanDetected === 'boolean' ? obj.humanDetected : status === 'TARGET_DETECTED',
      confidence,
      targetCount,
      timestamp: typeof obj.timestamp === 'string' || typeof obj.timestamp === 'number' ? obj.timestamp : new Date().toISOString(),
      modelName: typeof obj.modelName === 'string' ? obj.modelName : null,
      message: typeof obj.message === 'string' ? obj.message : null,
    },
  };
}
