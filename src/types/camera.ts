/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Strict TypeScript contracts for the Optical Camera People Detection & Counting Subsystem.
 * Enforces scientific integrity:
 * - NO fake/mock camera frames, fake bounding boxes, or synthetic counts.
 * - Optical camera detects ONLY visible persons in genuine frames.
 * - Optical camera CANNOT see through opaque walls, rock, or concrete.
 * - Through-obstacle detection is handled strictly by RF CSI and Radar subsystems.
 */

export type CameraConnectionState =
  | 'NO_CAMERA'
  | 'CONNECTING'
  | 'CONNECTED'
  | 'STREAMING'
  | 'STALE'
  | 'OFFLINE'
  | 'ERROR';

export type CameraDetectionQuality = 'GOOD' | 'LIMITED' | 'INSUFFICIENT';

export type CameraMotionState = 'MOVING' | 'STABLE';

export type OperationalMode = 'VISIBLE_CAMERA' | 'THROUGH_OBSTACLE_SENSOR';

export type CameraInputSourceType = 'LOCAL_LENS' | 'NETWORK_STREAM' | 'ESP32_CAM';

export type CountingSessionState =
  | 'READY'
  | 'COUNTING'
  | 'PAUSED'
  | 'INSUFFICIENT_COVERAGE'
  | 'COMPLETE'
  | 'NO_DATA'
  | 'ERROR';

export type CoverageStatus = 'INSUFFICIENT' | 'PARTIAL' | 'SUFFICIENT' | 'UNKNOWN';

export interface CameraBoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CameraPersonDetection {
  id: string;
  trackId: number | null;
  globalId?: number | null; // Associated session-unique person ID (G-1, G-2, ...)
  class: 'person';
  bbox: [number, number, number, number]; // [x, y, width, height] in source pixels
  normalizedBbox?: [number, number, number, number]; // [x, y, width, height] in 0..1 relative coords
  confidence: number; // 0.00 to 1.00 from real model
  timestamp: number;
}

export interface RegisteredUniquePerson {
  globalId: number;
  firstSeenTime: number;
  lastSeenTime: number;
  totalObservations: number;
  bestConfidence: number;
  appearanceDescriptor: number[]; // Normalized multi-zone color histogram
  aspectRatio: number;
  lastBbox: [number, number, number, number];
  estimatedPanAngle: number; // Cumulative estimated pan angle when observed
}

export interface CameraTelemetry {
  cameraId: string;
  state: CameraConnectionState;
  timestamp: number | null;
  lastFrameTime: number | null;
  frameRate: number | null; // Real measured FPS
  resolution: { width: number; height: number } | null;
  visiblePeopleCount: number | null; // null if no camera/model; 0 if no person detected; N if N persons
  globalUniquePeopleCount: number | null; // null if session not started or camera offline; N if counting session active
  countStatus: CountingSessionState;
  totalRegisteredInSession: number;
  activeTracksCount: number;
  coverageEstimateDeg: number;
  coverageStatus: CoverageStatus;
  detections: CameraPersonDetection[];
  detectionQuality: CameraDetectionQuality | null;
  modelName: string | null;
  modelConfidence: number | null; // Aggregate average confidence of visible person detections
  motionState: CameraMotionState | null;
  sourceType: CameraInputSourceType | null;
  streamUrl: string | null;
  error: string | null;
}

export interface CameraDiagnostics {
  streamUrl: string | null;
  connectionStatus: CameraConnectionState;
  frameArrivalTime: number | null;
  lastFrameAgeMs: number | null;
  inferenceLatencyMs: number | null;
  modelLoadingStatus: 'UNLOADED' | 'LOADING' | 'READY' | 'ERROR';
  detectionFps: number | null;
  webSocketStatus: 'CONNECTED' | 'CONNECTING' | 'DISCONNECTED';
  backendStatus: 'ONLINE' | 'OFFLINE' | 'UNREACHABLE';
  droppedFrames: number;
  totalFramesProcessed: number;
  cameraErrors: string[];
}

export interface IngestCameraFramePayload {
  cameraId: string;
  timestamp: number;
  imageBase64?: string;
  width?: number;
  height?: number;
  detections?: CameraPersonDetection[];
  visiblePeopleCount?: number;
  globalUniquePeopleCount?: number | null;
  countStatus?: CountingSessionState;
  confidence?: number;
  modelName?: string;
}
