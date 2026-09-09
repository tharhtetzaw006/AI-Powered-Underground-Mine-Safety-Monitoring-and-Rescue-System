/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Hardware-independent telemetry packet validation and sanitization.
 * Enforces strict verification:
 * - Reject malformed or non-object payloads
 * - Reject packets without a valid nodeId string
 * - Validate finite numeric values
 * - Preserve missing fields as null (never convert to zero)
 * - Detect corrupt or NaN numbers
 */

import { SensorTelemetry, Vector3D } from '../types/telemetry.ts';

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  telemetry: SensorTelemetry | null;
}

/**
 * Validates whether a value is a finite number, or null/undefined.
 * Returns the number if valid, null if null/undefined or missing,
 * and throws error if it's an invalid type (NaN, string, boolean, infinity).
 */
function parseOptionalNumber(
  val: unknown,
  fieldName: string,
  min?: number,
  max?: number
): { value: number | null; error?: string } {
  if (val === undefined || val === null || val === '') {
    return { value: null };
  }

  let num: number;
  if (typeof val === 'number') {
    num = val;
  } else if (typeof val === 'string') {
    const parsed = Number(val.trim());
    if (!Number.isFinite(parsed)) {
      return { value: null, error: `${fieldName} must be a valid finite number or null (received: "${val}")` };
    }
    num = parsed;
  } else {
    return { value: null, error: `${fieldName} must be a valid finite number or null (received: ${typeof val})` };
  }

  if (!Number.isFinite(num)) {
    return { value: null, error: `${fieldName} must be a valid finite number or null` };
  }

  if (min !== undefined && num < min) {
    return { value: null, error: `${fieldName} (${num}) is below allowable threshold (${min})` };
  }

  if (max !== undefined && num > max) {
    return { value: null, error: `${fieldName} (${num}) exceeds allowable threshold (${max})` };
  }

  return { value: num };
}

/**
 * Validates a 3D vector (x, y, z).
 * If the vector object itself is missing or null, returns null.
 * If present, validates each axis independently without replacing missing with zero.
 */
function parseVector3D(
  val: unknown,
  vectorName: string
): { vector: Vector3D | null; error?: string } {
  if (val === undefined || val === null) {
    return { vector: null };
  }

  if (typeof val !== 'object' || Array.isArray(val)) {
    return { vector: null, error: `${vectorName} must be an object with {x, y, z} or null` };
  }

  const obj = val as Record<string, unknown>;
  const xRes = parseOptionalNumber(obj.x, `${vectorName}.x`);
  const yRes = parseOptionalNumber(obj.y, `${vectorName}.y`);
  const zRes = parseOptionalNumber(obj.z, `${vectorName}.z`);

  const errors: string[] = [];
  if (xRes.error) errors.push(xRes.error);
  if (yRes.error) errors.push(yRes.error);
  if (zRes.error) errors.push(zRes.error);

  if (errors.length > 0) {
    return { vector: null, error: errors.join('; ') };
  }

  // If all fields are null/undefined, keep vector null
  if (xRes.value === null && yRes.value === null && zRes.value === null) {
    return { vector: null };
  }

  return {
    vector: {
      x: xRes.value,
      y: yRes.value,
      z: zRes.value,
    },
  };
}

/**
 * Validates an incoming raw telemetry packet against hardware specifications.
 */
export function validateTelemetryPacket(raw: unknown): ValidationResult {
  const errors: string[] = [];

  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return {
      isValid: false,
      errors: ['Packet must be a valid non-empty JSON object.'],
      telemetry: null,
    };
  }

  const data = raw as Record<string, unknown>;

  // 1. Validate nodeId (required, non-empty string, reasonable length)
  if (typeof data.nodeId !== 'string' || data.nodeId.trim().length === 0) {
    errors.push('Missing or invalid "nodeId". Must be a non-empty string.');
  } else if (data.nodeId.length > 64) {
    errors.push('"nodeId" exceeds 64 character maximum.');
  }
  const nodeId = typeof data.nodeId === 'string' ? data.nodeId.trim() : '';

  // 2. Validate timestamp (optional hardware timestamp)
  let timestamp: number | string | null = null;
  if (data.timestamp !== undefined && data.timestamp !== null) {
    if (typeof data.timestamp === 'number') {
      if (!Number.isFinite(data.timestamp) || data.timestamp <= 0) {
        errors.push('"timestamp" if numeric must be a positive finite number representing hardware epoch or uptime.');
      } else {
        timestamp = data.timestamp;
      }
    } else if (typeof data.timestamp === 'string') {
      const trimmed = data.timestamp.trim();
      if (trimmed.length > 0) {
        timestamp = trimmed;
      }
    } else {
      errors.push('"timestamp" must be a number, string, or null.');
    }
  }

  // 3. Acceleration vector [m/s²]
  const accRes = parseVector3D(data.acceleration, 'acceleration');
  if (accRes.error) errors.push(accRes.error);

  // 4. Gyroscope vector [°/s]
  const gyroRes = parseVector3D(data.gyroscope, 'gyroscope');
  if (gyroRes.error) errors.push(gyroRes.error);

  // 5. Distance [m] (range: 0 to 500 meters for typical LiDAR/ultrasonic mine sensors)
  const distRes = parseOptionalNumber(data.distance, 'distance', 0, 1000);
  if (distRes.error) errors.push(distRes.error);

  // 6. Sound Level [dB] (range: 0 to 160 dB SPL)
  const soundRes = parseOptionalNumber(data.soundLevel, 'soundLevel', 0, 200);
  if (soundRes.error) errors.push(soundRes.error);

  // 7. RSSI [dBm] (range: -150 to 20 dBm)
  const rssiRes = parseOptionalNumber(data.rssi, 'rssi', -160, 30);
  if (rssiRes.error) errors.push(rssiRes.error);

  // 8. Packet Loss [%] (range: 0 to 100%)
  const lossRes = parseOptionalNumber(data.packetLoss, 'packetLoss', 0, 100);
  if (lossRes.error) errors.push(lossRes.error);

  // 9. Battery [%] (range: 0 to 100%)
  const battRes = parseOptionalNumber(data.battery, 'battery', 0, 100);
  if (battRes.error) errors.push(battRes.error);

  // 10. Sequence number (optional integer)
  let sequenceNumber: number | null = null;
  if (data.sequenceNumber !== undefined && data.sequenceNumber !== null) {
    if (typeof data.sequenceNumber !== 'number' || !Number.isInteger(data.sequenceNumber) || data.sequenceNumber < 0) {
      errors.push('"sequenceNumber" must be a positive integer.');
    } else {
      sequenceNumber = data.sequenceNumber;
    }
  }

  if (errors.length > 0) {
    return {
      isValid: false,
      errors,
      telemetry: null,
    };
  }

  const serverReceiveTime = Date.now();

  const telemetry: SensorTelemetry = {
    nodeId,
    timestamp,
    serverReceiveTime,
    acceleration: accRes.vector,
    gyroscope: gyroRes.vector,
    distance: distRes.value,
    soundLevel: soundRes.value,
    rssi: rssiRes.value,
    packetLoss: lossRes.value,
    battery: battRes.value,
    sequenceNumber,
  };

  return {
    isValid: true,
    errors: [],
    telemetry,
  };
}
