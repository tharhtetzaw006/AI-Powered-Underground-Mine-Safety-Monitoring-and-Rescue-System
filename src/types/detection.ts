/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Strict TypeScript contracts for the Human / Life Detection AI Pipeline.
 * Enforces truthful reporting of real model inference, feature inputs, and hardware constraints.
 */

export type DetectionStatus =
  | 'NO_DATA'
  | 'INSUFFICIENT_DATA'
  | 'NO_HUMAN'
  | 'HUMAN_DETECTED'
  | 'ERROR';

export type LifeActivityState =
  | 'UNKNOWN'
  | 'NOT_DETERMINED'
  | 'POSSIBLE_LIFE_ACTIVITY'
  | 'CONFIRMED_BY_MODEL';

export type DetectionSource =
  | 'RF'
  | 'RADAR'
  | 'CAMERA'
  | 'SENSOR_FUSION'
  | 'UNKNOWN';

export interface RfCsiExtensibleFeatures {
  subcarrierAmplitudes?: number[];
  subcarrierPhases?: number[];
  dopplerShift?: number | null;
  rssiVariance?: number | null;
  frequencyBandHz?: number | null;
}

export interface RealSensorFeatures {
  accelerationMagnitude: number | null;
  gyroscopeMagnitude: number | null;
  accelerationVariance: number | null;
  gyroscopeVariance: number | null;
  motionIndex: number | null;
  acousticLevel: number | null;
  acousticMean: number | null;
  acousticPeak: number | null;
  distance: number | null;
  distanceChange: number | null;
  rssi: number | null;
  snr: number | null;
  packetTiming: number | null;
  packetLoss: number | null;
  sensorFreshness: number | null;
  signalQuality: number | null;
  rfCsiFeatures?: RfCsiExtensibleFeatures | null;
  rawSampleCount: number;
}

export interface HumanDetectionInput {
  nodeId: string;
  timestamp: number;
  source: DetectionSource;
  features: RealSensorFeatures;
  sequence: number | null;
  quality: number | null;
}

export interface HumanDetectionResult {
  status: DetectionStatus;
  estimatedCount: number | null;
  confidence: number | null;
  lifeActivity: LifeActivityState;
  modelName: string | null;
  modelVersion: string | null;
  inferenceTimestamp: number | null;
  inputQuality: number | null;
  nodeId: string;
  source?: DetectionSource;
  message?: string;
}

export interface DetectionEngineStatus {
  engineAvailable: boolean;
  modelAvailable: boolean;
  modelLoaded: boolean;
  modelStatus: 'MODEL_UNAVAILABLE' | 'MODEL_LOADED';
  validRealInputAvailable: boolean;
  hasValidRealInput: boolean;
  inputStatus: 'VALID_REAL_INPUT_UNAVAILABLE' | 'VALID_REAL_INPUT_AVAILABLE';
  inferenceReady: boolean;
  inferenceStatus: 'INFERENCE_UNAVAILABLE' | 'INFERENCE_READY';
  modelName: string | null;
  modelVersion: string | null;
  adapterType: string;
  lastInferenceTime: number | null;
  lastInferenceStatus: DetectionStatus | null;
  activeNodesCount: number;
  technicalLimitationNote: string;
}

export interface HumanDetectionModelAdapter {
  name: string;
  version: string;
  adapterType: 'TFJS' | 'ONNX' | 'PYTHON_SERVICE' | 'LOCAL_ENDPOINT' | 'NONE';
  isLoaded(): boolean;
  load(): Promise<boolean>;
  unload(): Promise<void>;
  predict(features: RealSensorFeatures, input: HumanDetectionInput): Promise<{
    status: DetectionStatus;
    estimatedCount: number | null;
    confidence: number | null;
    lifeActivity: LifeActivityState;
  }>;
}

export interface DetectionEngine {
  infer(input: HumanDetectionInput): Promise<HumanDetectionResult>;
  getStatus(): DetectionEngineStatus;
  getModelAdapter(): HumanDetectionModelAdapter | null;
  setModelAdapter(adapter: HumanDetectionModelAdapter | null): void;
}

export interface DetectionEventRecord {
  id: string;
  nodeId: string;
  timestamp: number;
  status: DetectionStatus;
  estimatedCount: number | null;
  confidence: number | null;
  lifeActivity: LifeActivityState;
  modelVersion: string | null;
  inputQuality: number | null;
}
