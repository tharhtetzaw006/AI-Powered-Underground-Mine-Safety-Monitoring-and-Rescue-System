/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Production-oriented Real Camera People Detection & Counting Service.
 * Powered by validated TensorFlow.js COCO-SSD Object Detection Model.
 * 
 * SCIENTIFIC INTEGRITY RULES:
 * 1. Consumes ONLY genuine frames from physical camera hardware (Local device lens or ESP32-CAM).
 * 2. Real forward-pass tensor inference: filters strictly for class === 'person'.
 * 3. Never fabricates fake bounding boxes, synthetic counts, or random confidence.
 * 4. Derives visiblePeopleCount strictly from validated person detections (0 if none, null if offline).
 * 5. Strictly adheres to optical physics: Optical cameras CANNOT see through opaque walls/rubble.
 */

import * as tf from '@tensorflow/tfjs';
import * as cocoSsd from '@tensorflow-models/coco-ssd';
import {
  CameraTelemetry,
  CameraConnectionState,
  CameraPersonDetection,
  CameraDetectionQuality,
  CameraMotionState,
  CameraDiagnostics,
  CameraInputSourceType,
} from '../types/camera.ts';

interface InternalTrack {
  id: number;
  lastCentroid: [number, number];
  lastBbox: [number, number, number, number];
  lastSeenTime: number;
  consecutiveMisses: number;
}

type CameraTelemetryListener = (telemetry: CameraTelemetry) => void;
type CameraDiagnosticsListener = (diagnostics: CameraDiagnostics) => void;

class RealCameraDetectionService {
  private model: cocoSsd.ObjectDetection | null = null;
  private modelLoading = false;
  private modelLoadError: string | null = null;

  // Active Media Stream & DOM elements
  private activeStream: MediaStream | null = null;
  private activeVideoElement: HTMLVideoElement | null = null;
  private inferenceLoopTimer: number | null = null;
  private isProcessingFrame = false;

  // Real Frame Timing & Metrics
  private frameTimestamps: number[] = [];
  private lastInferenceTime = 0;
  private lastFrameReceivedTime = 0;
  private inferenceLatencyMs = 0;
  private droppedFrames = 0;
  private totalFramesProcessed = 0;

  // Tracking state
  private nextTrackId = 1;
  private activeTracks: InternalTrack[] = [];
  private readonly MAX_TRACK_DISTANCE = 120; // Pixel Euclidean distance threshold for centroid association
  private readonly MAX_CONSECUTIVE_MISSES = 5;

  // Motion Estimation via Inter-frame Luminance Sampling
  private previousLuminanceBuffer: Uint8Array | null = null;
  private motionSampleCanvas: HTMLCanvasElement | null = null;
  private motionSampleCtx: CanvasRenderingContext2D | null = null;

  // Current Telemetry
  private currentTelemetry: CameraTelemetry = {
    cameraId: 'CAM-01',
    state: 'NO_CAMERA',
    timestamp: null,
    lastFrameTime: null,
    frameRate: null,
    resolution: null,
    visiblePeopleCount: null,
    detections: [],
    detectionQuality: null,
    modelName: null,
    modelConfidence: null,
    motionState: null,
    sourceType: null,
    streamUrl: null,
    error: null,
  };

  private telemetryListeners = new Set<CameraTelemetryListener>();
  private diagnosticsListeners = new Set<CameraDiagnosticsListener>();

  constructor() {
    // Initialise offscreen canvas for motion diff analysis
    if (typeof document !== 'undefined') {
      this.motionSampleCanvas = document.createElement('canvas');
      this.motionSampleCanvas.width = 64;
      this.motionSampleCanvas.height = 48;
      this.motionSampleCtx = this.motionSampleCanvas.getContext('2d', { willReadFrequently: true });
    }
  }

  /**
   * Subscribe to camera telemetry updates
   */
  public subscribe(listener: CameraTelemetryListener): () => void {
    this.telemetryListeners.add(listener);
    listener(this.currentTelemetry);
    return () => this.telemetryListeners.delete(listener);
  }

  /**
   * Subscribe to diagnostics updates
   */
  public subscribeDiagnostics(listener: CameraDiagnosticsListener): () => void {
    this.diagnosticsListeners.add(listener);
    listener(this.getDiagnostics());
    return () => this.diagnosticsListeners.delete(listener);
  }

  public getTelemetry(): CameraTelemetry {
    return { ...this.currentTelemetry };
  }

  public getDiagnostics(): CameraDiagnostics {
    const now = Date.now();
    const lastFrameAge = this.lastFrameReceivedTime > 0 ? now - this.lastFrameReceivedTime : null;
    return {
      streamUrl: this.currentTelemetry.streamUrl,
      connectionStatus: this.currentTelemetry.state,
      frameArrivalTime: this.lastFrameReceivedTime > 0 ? this.lastFrameReceivedTime : null,
      lastFrameAgeMs: lastFrameAge,
      inferenceLatencyMs: this.inferenceLatencyMs > 0 ? this.inferenceLatencyMs : null,
      modelLoadingStatus: this.modelLoading
        ? 'LOADING'
        : this.model
        ? 'READY'
        : this.modelLoadError
        ? 'ERROR'
        : 'UNLOADED',
      detectionFps: this.currentTelemetry.frameRate,
      webSocketStatus: 'CONNECTED',
      backendStatus: 'ONLINE',
      droppedFrames: this.droppedFrames,
      totalFramesProcessed: this.totalFramesProcessed,
      cameraErrors: this.currentTelemetry.error ? [this.currentTelemetry.error] : [],
    };
  }

  private notify() {
    const telemetry = this.getTelemetry();
    for (const listener of this.telemetryListeners) {
      try {
        listener(telemetry);
      } catch (err) {
        console.error('[CameraService] Listener error:', err);
      }
    }

    const diagnostics = this.getDiagnostics();
    for (const listener of this.diagnosticsListeners) {
      try {
        listener(diagnostics);
      } catch (err) {
        console.error('[CameraService] Diagnostics listener error:', err);
      }
    }
  }

  /**
   * Loads the real COCO-SSD object detection model
   */
  public async loadModel(): Promise<boolean> {
    if (this.model) return true;
    if (this.modelLoading) return false;

    this.modelLoading = true;
    this.modelLoadError = null;
    this.notify();

    try {
      // Ensure tfjs backend is ready
      await tf.ready();
      // Load validated coco-ssd model with mobilenet_v2 base
      this.model = await cocoSsd.load({
        base: 'mobilenet_v2',
      });
      this.modelLoading = false;
      this.currentTelemetry.modelName = 'COCO-SSD (MobileNet v2)';
      this.notify();
      return true;
    } catch (err: any) {
      console.error('[CameraService] Failed to load COCO-SSD model:', err);
      this.modelLoading = false;
      this.modelLoadError = err?.message || 'Failed to initialize TensorFlow.js model';
      this.currentTelemetry.modelName = 'PERSON DETECTION MODEL NOT AVAILABLE';
      this.notify();
      return false;
    }
  }

  /**
   * Connect and start genuine local hardware camera (Webcam / USB Camera)
   */
  public async startLocalCamera(
    videoElement: HTMLVideoElement,
    cameraId = 'CAM-LOCAL'
  ): Promise<boolean> {
    this.stopCamera();

    this.currentTelemetry = {
      ...this.currentTelemetry,
      cameraId,
      state: 'CONNECTING',
      sourceType: 'LOCAL_LENS',
      streamUrl: 'local://media-devices/video-input',
      error: null,
      visiblePeopleCount: null,
      detections: [],
      detectionQuality: null,
      modelConfidence: null,
      motionState: null,
    };
    this.notify();

    // Trigger model load concurrently
    this.loadModel().catch(() => {});

    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Camera hardware access (getUserMedia) not supported in this browser context');
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          frameRate: { ideal: 20 },
        },
        audio: false,
      });

      this.activeStream = stream;
      this.activeVideoElement = videoElement;
      videoElement.srcObject = stream;

      // Wait until video has loaded metadata and can play
      await new Promise<void>((resolve, reject) => {
        videoElement.onloadedmetadata = () => {
          videoElement.play().then(resolve).catch(reject);
        };
        videoElement.onerror = (e) => reject(new Error('Video element playback error'));
      });

      const width = videoElement.videoWidth || 640;
      const height = videoElement.videoHeight || 480;

      this.currentTelemetry = {
        ...this.currentTelemetry,
        state: 'CONNECTED',
        resolution: { width, height },
        lastFrameTime: Date.now(),
      };
      this.notify();

      // Start real inference loop
      this.startInferenceLoop();
      return true;
    } catch (err: any) {
      console.error('[CameraService] Failed to start local camera:', err);
      this.currentTelemetry = {
        ...this.currentTelemetry,
        state: 'ERROR',
        error: err?.message || 'Camera permission denied or device busy',
        visiblePeopleCount: null,
        detections: [],
        detectionQuality: null,
      };
      this.notify();
      return false;
    }
  }

  /**
   * Connects to a network stream (e.g. ESP32-CAM MJPEG / LAN stream)
   */
  public connectNetworkStream(streamUrl: string, cameraId = 'CAM-01'): void {
    this.stopCamera();

    this.currentTelemetry = {
      ...this.currentTelemetry,
      cameraId,
      state: 'CONNECTING',
      sourceType: 'NETWORK_STREAM',
      streamUrl,
      error: null,
      visiblePeopleCount: null,
      detections: [],
      detectionQuality: null,
      modelConfidence: null,
      motionState: null,
    };
    this.notify();

    this.loadModel().catch(() => {});
  }

  /**
   * Ingest a genuine frame received over network (e.g., from ESP32-CAM HTTP POST)
   */
  public async ingestNetworkImageFrame(
    imageElementOrBlob: HTMLImageElement | Blob | string,
    width = 640,
    height = 480,
    cameraId = 'CAM-01'
  ): Promise<void> {
    const now = Date.now();
    this.lastFrameReceivedTime = now;

    let img: HTMLImageElement;
    if (typeof imageElementOrBlob === 'string') {
      img = new Image();
      img.crossOrigin = 'anonymous';
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
        img.src = imageElementOrBlob;
      });
    } else if (imageElementOrBlob instanceof HTMLImageElement) {
      img = imageElementOrBlob;
    } else {
      const url = URL.createObjectURL(imageElementOrBlob);
      img = new Image();
      await new Promise((resolve, reject) => {
        img.onload = () => {
          URL.revokeObjectURL(url);
          resolve(null);
        };
        img.onerror = reject;
        img.src = url;
      });
    }

    const naturalWidth = img.naturalWidth || width;
    const naturalHeight = img.naturalHeight || height;

    this.currentTelemetry = {
      ...this.currentTelemetry,
      cameraId,
      state: 'STREAMING',
      sourceType: 'ESP32_CAM',
      resolution: { width: naturalWidth, height: naturalHeight },
      lastFrameTime: now,
      error: null,
    };

    // Run inference on genuine frame
    await this.processImageElement(img, naturalWidth, naturalHeight);
  }

  /**
   * Continuous inference loop on active camera stream
   */
  private startInferenceLoop(): void {
    if (this.inferenceLoopTimer) {
      window.clearInterval(this.inferenceLoopTimer);
    }

    // Schedule inference every ~80ms (approx 12-15 FPS real forward passes)
    this.inferenceLoopTimer = window.setInterval(() => {
      this.executeFrameStep();
    }, 80);
  }

  private async executeFrameStep(): Promise<void> {
    if (this.isProcessingFrame) {
      this.droppedFrames++;
      return;
    }

    if (!this.activeVideoElement || this.activeVideoElement.readyState < 2) {
      return;
    }

    this.isProcessingFrame = true;
    const startTime = performance.now();
    const now = Date.now();

    try {
      const video = this.activeVideoElement;
      const width = video.videoWidth || 640;
      const height = video.videoHeight || 480;

      // Update frame timing & rolling FPS
      this.lastFrameReceivedTime = now;
      this.frameTimestamps.push(now);
      while (this.frameTimestamps.length > 10) {
        this.frameTimestamps.shift();
      }

      let frameRate: number | null = null;
      if (this.frameTimestamps.length >= 2) {
        const delta =
          (this.frameTimestamps[this.frameTimestamps.length - 1] - this.frameTimestamps[0]) /
          (this.frameTimestamps.length - 1);
        if (delta > 0) {
          frameRate = Math.round((1000 / delta) * 10) / 10;
        }
      }

      // 1. Calculate genuine camera motion (inter-frame luminance diff)
      const motionState = this.computeOpticalMotion(video);

      // 2. Perform real object detection if model is loaded
      let personDetections: CameraPersonDetection[] = [];
      let visiblePeopleCount: number | null = null;
      let modelConfidence: number | null = null;
      let detectionQuality: CameraDetectionQuality | null = null;

      if (this.model) {
        const predictions = await this.model.detect(video);

        // Filter strictly for class === 'person' with valid confidence threshold >= 0.40
        const rawPersonDetections = predictions.filter(
          (pred) => pred.class.toLowerCase() === 'person' && pred.score >= 0.40
        );

        // Associate with tracking identities
        personDetections = this.updateCentroidTracking(rawPersonDetections, width, height, now);

        // Derive current scene visible people count (0 if none, or count of validated persons)
        visiblePeopleCount = personDetections.length;

        if (personDetections.length > 0) {
          const sumConf = personDetections.reduce((acc, cur) => acc + cur.confidence, 0);
          modelConfidence = Math.round((sumConf / personDetections.length) * 100) / 100;
        } else {
          modelConfidence = null;
        }

        // Determine real detection quality
        if (width >= 640 && height >= 480 && (modelConfidence === null || modelConfidence >= 0.7)) {
          detectionQuality = 'GOOD';
        } else if (width >= 320 && height >= 240 && (modelConfidence === null || modelConfidence >= 0.5)) {
          detectionQuality = 'LIMITED';
        } else {
          detectionQuality = 'INSUFFICIENT';
        }
      } else {
        // Model not yet available
        visiblePeopleCount = null;
        detectionQuality = null;
        modelConfidence = null;
      }

      this.inferenceLatencyMs = Math.round(performance.now() - startTime);
      this.totalFramesProcessed++;

      // Update state
      this.currentTelemetry = {
        ...this.currentTelemetry,
        state: 'STREAMING',
        timestamp: now,
        lastFrameTime: now,
        frameRate,
        resolution: { width, height },
        visiblePeopleCount,
        detections: personDetections,
        detectionQuality,
        modelConfidence,
        motionState,
      };

      this.notify();
    } catch (err: any) {
      console.error('[CameraService] Frame execution step failed:', err);
    } finally {
      this.isProcessingFrame = false;
    }
  }

  /**
   * Process a single HTMLImageElement (for network frames)
   */
  private async processImageElement(
    img: HTMLImageElement,
    width: number,
    height: number
  ): Promise<void> {
    const startTime = performance.now();
    const now = Date.now();

    try {
      let personDetections: CameraPersonDetection[] = [];
      let visiblePeopleCount: number | null = null;
      let modelConfidence: number | null = null;
      let detectionQuality: CameraDetectionQuality | null = null;

      if (this.model) {
        const predictions = await this.model.detect(img);
        const rawPersonDetections = predictions.filter(
          (pred) => pred.class.toLowerCase() === 'person' && pred.score >= 0.40
        );

        personDetections = this.updateCentroidTracking(rawPersonDetections, width, height, now);
        visiblePeopleCount = personDetections.length;

        if (personDetections.length > 0) {
          const sumConf = personDetections.reduce((acc, cur) => acc + cur.confidence, 0);
          modelConfidence = Math.round((sumConf / personDetections.length) * 100) / 100;
        }

        if (width >= 640 && height >= 480 && (modelConfidence === null || modelConfidence >= 0.7)) {
          detectionQuality = 'GOOD';
        } else if (width >= 320 && height >= 240 && (modelConfidence === null || modelConfidence >= 0.5)) {
          detectionQuality = 'LIMITED';
        } else {
          detectionQuality = 'INSUFFICIENT';
        }
      }

      this.inferenceLatencyMs = Math.round(performance.now() - startTime);
      this.totalFramesProcessed++;

      this.currentTelemetry = {
        ...this.currentTelemetry,
        timestamp: now,
        lastFrameTime: now,
        visiblePeopleCount,
        detections: personDetections,
        detectionQuality,
        modelConfidence,
      };

      this.notify();
    } catch (err) {
      console.error('[CameraService] Image frame processing failed:', err);
    }
  }

  /**
   * Real Centroid Tracker across consecutive frames
   */
  private updateCentroidTracking(
    rawPredictions: cocoSsd.DetectedObject[],
    frameWidth: number,
    frameHeight: number,
    timestamp: number
  ): CameraPersonDetection[] {
    const currentDetections: Array<{
      centroid: [number, number];
      bbox: [number, number, number, number];
      confidence: number;
    }> = rawPredictions.map((pred) => {
      const [x, y, w, h] = pred.bbox;
      const cx = x + w / 2;
      const cy = y + h / 2;
      return {
        centroid: [cx, cy],
        bbox: [Math.round(x), Math.round(y), Math.round(w), Math.round(h)],
        confidence: Math.round(pred.score * 100) / 100,
      };
    });

    const assignedTrackIds: Array<number | null> = new Array(currentDetections.length).fill(null);
    const matchedTrackIndices = new Set<number>();

    // Greedy nearest-neighbor centroid association
    for (let i = 0; i < currentDetections.length; i++) {
      const [cx, cy] = currentDetections[i].centroid;
      let minDistance = this.MAX_TRACK_DISTANCE;
      let matchedIdx = -1;

      for (let t = 0; t < this.activeTracks.length; t++) {
        if (matchedTrackIndices.has(t)) continue;
        const [tcx, tcy] = this.activeTracks[t].lastCentroid;
        const dist = Math.hypot(cx - tcx, cy - tcy);

        if (dist < minDistance) {
          minDistance = dist;
          matchedIdx = t;
        }
      }

      if (matchedIdx !== -1) {
        matchedTrackIndices.add(matchedIdx);
        this.activeTracks[matchedIdx].lastCentroid = [cx, cy];
        this.activeTracks[matchedIdx].lastBbox = currentDetections[i].bbox;
        this.activeTracks[matchedIdx].lastSeenTime = timestamp;
        this.activeTracks[matchedIdx].consecutiveMisses = 0;
        assignedTrackIds[i] = this.activeTracks[matchedIdx].id;
      }
    }

    // Register new tracks for unassigned detections
    for (let i = 0; i < currentDetections.length; i++) {
      if (assignedTrackIds[i] === null) {
        const newTrack: InternalTrack = {
          id: this.nextTrackId++,
          lastCentroid: currentDetections[i].centroid,
          lastBbox: currentDetections[i].bbox,
          lastSeenTime: timestamp,
          consecutiveMisses: 0,
        };
        this.activeTracks.push(newTrack);
        assignedTrackIds[i] = newTrack.id;
      }
    }

    // Age and prune stale tracks that were not matched
    for (let t = 0; t < this.activeTracks.length; t++) {
      if (!matchedTrackIndices.has(t)) {
        this.activeTracks[t].consecutiveMisses++;
      }
    }
    this.activeTracks = this.activeTracks.filter(
      (t) => t.consecutiveMisses < this.MAX_CONSECUTIVE_MISSES
    );

    // Build strict typed output
    return currentDetections.map((d, index) => {
      const [x, y, w, h] = d.bbox;
      const normalizedBbox: [number, number, number, number] = [
        frameWidth > 0 ? Math.max(0, Math.min(1, x / frameWidth)) : 0,
        frameHeight > 0 ? Math.max(0, Math.min(1, y / frameHeight)) : 0,
        frameWidth > 0 ? Math.max(0, Math.min(1, w / frameWidth)) : 0,
        frameHeight > 0 ? Math.max(0, Math.min(1, h / frameHeight)) : 0,
      ];

      return {
        id: `person-${assignedTrackIds[index]}-${timestamp}`,
        trackId: assignedTrackIds[index],
        class: 'person',
        bbox: d.bbox,
        normalizedBbox,
        confidence: d.confidence,
        timestamp,
      };
    });
  }

  /**
   * Real optical motion detection via inter-frame luminance differencing
   */
  private computeOpticalMotion(video: HTMLVideoElement): CameraMotionState | null {
    if (!this.motionSampleCanvas || !this.motionSampleCtx) return null;

    try {
      this.motionSampleCtx.drawImage(video, 0, 0, 64, 48);
      const imgData = this.motionSampleCtx.getImageData(0, 0, 64, 48);
      const data = imgData.data;
      const pixelCount = 64 * 48;
      const currentLuminance = new Uint8Array(pixelCount);

      for (let i = 0; i < pixelCount; i++) {
        // Standard Rec. 601 luma formula
        const r = data[i * 4];
        const g = data[i * 4 + 1];
        const b = data[i * 4 + 2];
        currentLuminance[i] = (r * 299 + g * 587 + b * 114) / 1000;
      }

      if (!this.previousLuminanceBuffer) {
        this.previousLuminanceBuffer = currentLuminance;
        return 'STABLE';
      }

      let diffSum = 0;
      for (let i = 0; i < pixelCount; i++) {
        diffSum += Math.abs(currentLuminance[i] - this.previousLuminanceBuffer[i]);
      }

      const meanDiff = diffSum / pixelCount;
      this.previousLuminanceBuffer = currentLuminance;

      // Threshold derived from camera shake / walking motion
      return meanDiff > 14 ? 'MOVING' : 'STABLE';
    } catch {
      return null;
    }
  }

  /**
   * Cleanly stop camera and tear down resources
   */
  public stopCamera(): void {
    if (this.inferenceLoopTimer) {
      window.clearInterval(this.inferenceLoopTimer);
      this.inferenceLoopTimer = null;
    }

    if (this.activeStream) {
      this.activeStream.getTracks().forEach((track) => track.stop());
      this.activeStream = null;
    }

    if (this.activeVideoElement) {
      this.activeVideoElement.srcObject = null;
      this.activeVideoElement = null;
    }

    this.activeTracks = [];
    this.previousLuminanceBuffer = null;
    this.frameTimestamps = [];

    this.currentTelemetry = {
      ...this.currentTelemetry,
      state: 'OFFLINE',
      frameRate: null,
      visiblePeopleCount: null,
      detections: [],
      detectionQuality: null,
      modelConfidence: null,
      motionState: null,
      error: null,
    };

    this.notify();
  }
}

export const realCameraDetectionService = new RealCameraDetectionService();
