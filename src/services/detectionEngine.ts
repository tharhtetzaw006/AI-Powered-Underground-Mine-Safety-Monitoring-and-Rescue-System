/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * DetectionEngine & HumanDetectionModelAdapter
 * 
 * Production-ready detection pipeline adhering to strict truth-in-data principles:
 * - NO mock data
 * - NO simulated detections
 * - NO fake human counts or confidence scores
 * - If model or valid features are missing, returns NO_DATA / INSUFFICIENT_DATA
 * - Per-node isolated state
 * - Event history records stored ONLY when genuine inference occurs
 */

import {
  DetectionEngine,
  DetectionEngineStatus,
  HumanDetectionInput,
  HumanDetectionResult,
  HumanDetectionModelAdapter,
  DetectionStatus,
  DetectionEventRecord,
} from '../types/detection.ts';

export const TECHNICAL_LIMITATION_NOTE =
  'Through-obstacle human detection requires valid RF/radar/depth sensing input and a trained detection model.';

/**
 * Default Unconfigured Model Adapter (Current Hardware Phase)
 * Truthfully reflects that hardware team has not yet deployed trained weights or RF/radar sensor.
 */
export class UnconfiguredModelAdapter implements HumanDetectionModelAdapter {
  public name = 'NONE';
  public version = '0.0.0';
  public adapterType = 'NONE' as const;

  public isLoaded(): boolean {
    return false;
  }

  public async load(): Promise<boolean> {
    return false;
  }

  public async unload(): Promise<void> {
    // No-op
  }

  public async predict(): Promise<{
    status: DetectionStatus;
    estimatedCount: number | null;
    confidence: number | null;
    lifeActivity: 'UNKNOWN';
  }> {
    return {
      status: 'NO_DATA',
      estimatedCount: null,
      confidence: null,
      lifeActivity: 'UNKNOWN',
    };
  }
}

/**
 * Extensible TensorFlow.js Model Adapter for future trained weights
 */
export class TfjsModelAdapter implements HumanDetectionModelAdapter {
  public name: string;
  public version: string;
  public adapterType = 'TFJS' as const;
  private modelUrl: string;
  private loaded = false;

  constructor(modelName: string, version: string, modelUrl: string) {
    this.name = modelName;
    this.version = version;
    this.modelUrl = modelUrl;
  }

  public isLoaded(): boolean {
    return this.loaded;
  }

  public async load(): Promise<boolean> {
    // Extensible hook for @tensorflow/tfjs loadLayersModel / loadGraphModel
    // Kept inactive until genuine model weights file is provided
    return false;
  }

  public async unload(): Promise<void> {
    this.loaded = false;
  }

  public async predict(): Promise<{
    status: DetectionStatus;
    estimatedCount: number | null;
    confidence: number | null;
    lifeActivity: 'UNKNOWN';
  }> {
    if (!this.loaded) {
      return {
        status: 'NO_DATA',
        estimatedCount: null,
        confidence: null,
        lifeActivity: 'UNKNOWN',
      };
    }
    // Execution will occur only with real loaded tensor runtime
    return {
      status: 'INSUFFICIENT_DATA',
      estimatedCount: null,
      confidence: null,
      lifeActivity: 'UNKNOWN',
    };
  }
}

/**
 * Extensible Python Inference Service Adapter for local or edge AI microservices
 */
export class PythonServiceAdapter implements HumanDetectionModelAdapter {
  public name: string;
  public version: string;
  public adapterType = 'PYTHON_SERVICE' as const;
  private endpointUrl: string;
  private reachable = false;

  constructor(name: string, version: string, endpointUrl: string) {
    this.name = name;
    this.version = version;
    this.endpointUrl = endpointUrl;
  }

  public isLoaded(): boolean {
    return this.reachable;
  }

  public async load(): Promise<boolean> {
    try {
      const res = await fetch(`${this.endpointUrl}/health`, { method: 'GET' });
      this.reachable = res.ok;
      return this.reachable;
    } catch {
      this.reachable = false;
      return false;
    }
  }

  public async unload(): Promise<void> {
    this.reachable = false;
  }

  public async predict(features: unknown, input: HumanDetectionInput) {
    if (!this.reachable) {
      return {
        status: 'NO_DATA' as const,
        estimatedCount: null,
        confidence: null,
        lifeActivity: 'UNKNOWN' as const,
      };
    }
    try {
      const response = await fetch(`${this.endpointUrl}/predict`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ features, input }),
      });
      if (!response.ok) {
        return {
          status: 'ERROR' as const,
          estimatedCount: null,
          confidence: null,
          lifeActivity: 'UNKNOWN' as const,
        };
      }
      return await response.json();
    } catch {
      return {
        status: 'ERROR' as const,
        estimatedCount: null,
        confidence: null,
        lifeActivity: 'UNKNOWN' as const,
      };
    }
  }
}

interface PerNodeDetectionState {
  nodeId: string;
  lastInput: HumanDetectionInput | null;
  lastResult: HumanDetectionResult | null;
  lastInferenceTime: number | null;
}

export class ProductionDetectionEngine implements DetectionEngine {
  private modelAdapter: HumanDetectionModelAdapter | null = null;
  private nodeStates = new Map<string, PerNodeDetectionState>();
  private history: DetectionEventRecord[] = [];
  private lastGlobalInferenceTime: number | null = null;
  private lastGlobalInferenceStatus: DetectionStatus | null = null;

  constructor(adapter: HumanDetectionModelAdapter | null = null) {
    this.modelAdapter = adapter;
  }

  public getModelAdapter(): HumanDetectionModelAdapter | null {
    return this.modelAdapter;
  }

  public setModelAdapter(adapter: HumanDetectionModelAdapter | null): void {
    this.modelAdapter = adapter;
  }

  public getNodeState(nodeId: string): PerNodeDetectionState | undefined {
    return this.nodeStates.get(nodeId);
  }

  public getDetectionHistory(nodeId?: string): DetectionEventRecord[] {
    if (nodeId) {
      return this.history.filter((h) => h.nodeId === nodeId);
    }
    return [...this.history];
  }

  public clearNode(nodeId: string): void {
    this.nodeStates.delete(nodeId);
    this.history = this.history.filter((h) => h.nodeId !== nodeId);
  }

  public clearAll(): void {
    this.nodeStates.clear();
    this.history = [];
    this.lastGlobalInferenceTime = null;
    this.lastGlobalInferenceStatus = null;
  }

  public getStatus(): DetectionEngineStatus {
    const isModelLoaded = this.modelAdapter ? this.modelAdapter.isLoaded() : false;
    let hasValidRealInput = false;

    for (const state of this.nodeStates.values()) {
      if (
        state.lastInput &&
        state.lastInput.quality !== null &&
        state.lastInput.quality > 0 &&
        (state.lastInput.source === 'RF' ||
          state.lastInput.source === 'RADAR' ||
          state.lastInput.source === 'CAMERA' ||
          state.lastInput.source === 'SENSOR_FUSION')
      ) {
        hasValidRealInput = true;
        break;
      }
    }

    const inferenceReady = isModelLoaded && hasValidRealInput;

    return {
      engineAvailable: true,
      modelAvailable: isModelLoaded,
      modelLoaded: isModelLoaded,
      modelStatus: isModelLoaded ? 'MODEL_LOADED' : 'MODEL_UNAVAILABLE',
      validRealInputAvailable: hasValidRealInput,
      hasValidRealInput,
      inputStatus: hasValidRealInput ? 'VALID_REAL_INPUT_AVAILABLE' : 'VALID_REAL_INPUT_UNAVAILABLE',
      inferenceReady,
      inferenceStatus: inferenceReady ? 'INFERENCE_READY' : 'INFERENCE_UNAVAILABLE',
      modelName: this.modelAdapter ? this.modelAdapter.name : null,
      modelVersion: this.modelAdapter ? this.modelAdapter.version : null,
      adapterType: this.modelAdapter ? this.modelAdapter.adapterType : 'NONE',
      lastInferenceTime: this.lastGlobalInferenceTime,
      lastInferenceStatus: this.lastGlobalInferenceStatus,
      activeNodesCount: this.nodeStates.size,
      technicalLimitationNote: TECHNICAL_LIMITATION_NOTE,
    };
  }

  /**
   * Evaluates input through the explicit model lifecycle:
   * NO MODEL -> MODEL LOADED -> VALID REAL INPUT -> INFERENCE -> REAL RESULT
   */
  public async infer(input: HumanDetectionInput): Promise<HumanDetectionResult> {
    // 1. Strict validation of input
    if (!input || !input.nodeId || typeof input.nodeId !== 'string') {
      const errResult: HumanDetectionResult = {
        status: 'ERROR',
        estimatedCount: null,
        confidence: null,
        lifeActivity: 'UNKNOWN',
        modelName: null,
        modelVersion: null,
        inferenceTimestamp: Date.now(),
        inputQuality: null,
        nodeId: input?.nodeId || 'UNKNOWN',
        message: 'Invalid detection input: missing or malformed nodeId.',
      };
      return errResult;
    }

    if (!input.features || typeof input.features !== 'object') {
      const errResult: HumanDetectionResult = {
        status: 'ERROR',
        estimatedCount: null,
        confidence: null,
        lifeActivity: 'UNKNOWN',
        modelName: null,
        modelVersion: null,
        inferenceTimestamp: Date.now(),
        inputQuality: null,
        nodeId: input.nodeId,
        message: 'Invalid detection input: missing features object.',
      };
      return errResult;
    }

    // Update isolated per-node tracking
    let nodeState = this.nodeStates.get(input.nodeId);
    if (!nodeState) {
      nodeState = {
        nodeId: input.nodeId,
        lastInput: input,
        lastResult: null,
        lastInferenceTime: null,
      };
      this.nodeStates.set(input.nodeId, nodeState);
    } else {
      nodeState.lastInput = input;
    }

    // 2. Lifecycle Stage: MODEL AVAILABILITY
    if (!this.modelAdapter || !this.modelAdapter.isLoaded()) {
      const noModelResult: HumanDetectionResult = {
        status: 'NO_DATA',
        estimatedCount: null,
        confidence: null,
        lifeActivity: 'UNKNOWN',
        modelName: this.modelAdapter?.name || null,
        modelVersion: this.modelAdapter?.version || null,
        inferenceTimestamp: input.timestamp || Date.now(),
        inputQuality: input.quality,
        nodeId: input.nodeId,
        source: input.source,
        message: 'No detection model loaded. ' + TECHNICAL_LIMITATION_NOTE,
      };

      nodeState.lastResult = noModelResult;
      nodeState.lastInferenceTime = noModelResult.inferenceTimestamp;
      this.lastGlobalInferenceTime = noModelResult.inferenceTimestamp;
      this.lastGlobalInferenceStatus = 'NO_DATA';
      // Per Rule 12: Do NOT create history records when no real inference occurred
      return noModelResult;
    }

    // 3. Lifecycle Stage: VALID REAL INPUT
    // Through-obstacle detection requires RF, RADAR, CAMERA, or SENSOR_FUSION with dedicated depth stream.
    // Acoustic/IMU alone cannot reliably infer human presence behind rock.
    const isObstaclePenetrating =
      input.source === 'RF' ||
      input.source === 'RADAR' ||
      input.source === 'CAMERA' ||
      input.source === 'SENSOR_FUSION';

    if (!isObstaclePenetrating) {
      const insufficientResult: HumanDetectionResult = {
        status: 'INSUFFICIENT_DATA',
        estimatedCount: null,
        confidence: null,
        lifeActivity: 'UNKNOWN',
        modelName: this.modelAdapter.name,
        modelVersion: this.modelAdapter.version,
        inferenceTimestamp: input.timestamp || Date.now(),
        inputQuality: input.quality,
        nodeId: input.nodeId,
        source: input.source,
        message:
          'Insufficient sensor modality. Standard IMU/ultrasonic/sound cannot penetrate rock. ' +
          TECHNICAL_LIMITATION_NOTE,
      };

      nodeState.lastResult = insufficientResult;
      nodeState.lastInferenceTime = insufficientResult.inferenceTimestamp;
      this.lastGlobalInferenceTime = insufficientResult.inferenceTimestamp;
      this.lastGlobalInferenceStatus = 'INSUFFICIENT_DATA';
      return insufficientResult;
    }

    // 4. Lifecycle Stage: REAL INFERENCE
    try {
      const prediction = await this.modelAdapter.predict(input.features, input);

      const realResult: HumanDetectionResult = {
        status: prediction.status,
        estimatedCount: prediction.estimatedCount,
        confidence: prediction.confidence,
        lifeActivity: prediction.lifeActivity,
        modelName: this.modelAdapter.name,
        modelVersion: this.modelAdapter.version,
        inferenceTimestamp: Date.now(),
        inputQuality: input.quality,
        nodeId: input.nodeId,
        source: input.source,
      };

      nodeState.lastResult = realResult;
      nodeState.lastInferenceTime = realResult.inferenceTimestamp;
      this.lastGlobalInferenceTime = realResult.inferenceTimestamp;
      this.lastGlobalInferenceStatus = realResult.status;

      // 5. Record history ONLY when genuine inference occurred
      if (realResult.status === 'HUMAN_DETECTED' || realResult.status === 'NO_HUMAN') {
        const historyRecord: DetectionEventRecord = {
          id: `det-${input.nodeId}-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          nodeId: input.nodeId,
          timestamp: realResult.inferenceTimestamp || Date.now(),
          status: realResult.status,
          estimatedCount: realResult.estimatedCount,
          confidence: realResult.confidence,
          lifeActivity: realResult.lifeActivity,
          modelVersion: realResult.modelVersion,
          inputQuality: realResult.inputQuality,
        };
        this.history.unshift(historyRecord);
        if (this.history.length > 200) {
          this.history.pop();
        }
      }

      return realResult;
    } catch (err) {
      const errResult: HumanDetectionResult = {
        status: 'ERROR',
        estimatedCount: null,
        confidence: null,
        lifeActivity: 'UNKNOWN',
        modelName: this.modelAdapter.name,
        modelVersion: this.modelAdapter.version,
        inferenceTimestamp: Date.now(),
        inputQuality: input.quality,
        nodeId: input.nodeId,
        source: input.source,
        message: err instanceof Error ? err.message : 'Inference execution failed',
      };

      nodeState.lastResult = errResult;
      return errResult;
    }
  }
}

export const productionDetectionEngine = new ProductionDetectionEngine(new UnconfiguredModelAdapter());
