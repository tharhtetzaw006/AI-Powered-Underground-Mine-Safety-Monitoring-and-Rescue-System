import React, { useState, useRef, useEffect } from 'react';
import { useLiveData } from '../context/LiveDataContext.tsx';
import {
  Camera,
  VideoOff,
  Radio,
  Eye,
  EyeOff,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Cpu,
  Layers,
  CheckCircle2,
  RefreshCw,
  PowerOff,
  Wrench,
  ShieldAlert,
  Play,
  Pause,
  RotateCcw,
  Compass,
} from 'lucide-react';
import { StatusBadge } from './StatusBadge.tsx';

interface CameraSectionProps {
  id?: string;
}

export const CameraSection: React.FC<CameraSectionProps> = ({ id }) => {
  const {
    activeNodeId,
    cameraTelemetry,
    cameraDiagnostics,
    operationalMode,
    setOperationalMode,
    startLocalCamera,
    stopCamera,
    connectNetworkStream,
    refreshCameraStatus,
    startCounting,
    pauseCounting,
    resumeCounting,
    resetCounting,
    markComplete,
    fastApiState,
    radarState,
    sensorFusionResult,
  } = useLiveData();

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const [streamInputUrl, setStreamInputUrl] = useState('');
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [isStartingCamera, setIsStartingCamera] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  // Paint real bounding boxes whenever telemetry updates with new detections
  useEffect(() => {
    const canvas = canvasRef.current;
    const video = videoRef.current;

    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (cameraTelemetry.state !== 'STREAMING' || !video || video.videoWidth === 0) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      return;
    }

    // Match canvas coordinate space to the actual video resolution
    if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const detections = cameraTelemetry.detections || [];
    detections.forEach((det) => {
      const [x, y, w, h] = det.bbox;

      // Draw primary bounding box
      ctx.strokeStyle = '#10B981';
      ctx.lineWidth = 2.5;
      ctx.strokeRect(x, y, w, h);

      // Draw corner accent reticles
      const cornerLen = Math.min(16, w / 4, h / 4);
      ctx.strokeStyle = '#34D399';
      ctx.lineWidth = 3.5;

      // Top-left
      ctx.beginPath();
      ctx.moveTo(x, y + cornerLen);
      ctx.lineTo(x, y);
      ctx.lineTo(x + cornerLen, y);
      ctx.stroke();

      // Top-right
      ctx.beginPath();
      ctx.moveTo(x + w - cornerLen, y);
      ctx.lineTo(x + w, y);
      ctx.lineTo(x + w, y + cornerLen);
      ctx.stroke();

      // Bottom-left
      ctx.beginPath();
      ctx.moveTo(x, y + h - cornerLen);
      ctx.lineTo(x, y + h);
      ctx.lineTo(x + cornerLen, y + h);
      ctx.stroke();

      // Bottom-right
      ctx.beginPath();
      ctx.moveTo(x + w - cornerLen, y + h);
      ctx.lineTo(x + w, y + h);
      ctx.lineTo(x + w, y + h - cornerLen);
      ctx.stroke();

      // Label badge
      const confPercent = Math.round((det.confidence || 0) * 100);
      const reIdStatusText = det.reIdStatus || (det.globalId ? 'CONFIRMED' : 'PENDING');
      const labelText = det.globalId
        ? `G-${det.globalId} [T-${det.trackId ?? '?'}] • ${reIdStatusText} | ${confPercent}%`
        : `T-${det.trackId ?? '?'} [RE-ID: ${reIdStatusText}] | ${confPercent}%`;

      ctx.font = 'bold 12px ui-monospace, monospace';
      const textMetrics = ctx.measureText(labelText);
      const textWidth = textMetrics.width;
      const textHeight = 16;
      const badgeY = Math.max(0, y - textHeight - 6);

      ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
      ctx.fillRect(x, badgeY, textWidth + 12, textHeight + 4);

      ctx.strokeStyle = '#10B981';
      ctx.lineWidth = 1;
      ctx.strokeRect(x, badgeY, textWidth + 12, textHeight + 4);

      ctx.fillStyle = '#10B981';
      ctx.fillText(labelText, x + 6, badgeY + textHeight - 2);
    });
  }, [cameraTelemetry]);

  // Handler for connecting device camera
  const handleStartDeviceCamera = async () => {
    setCameraError(null);
    setIsStartingCamera(true);
    try {
      if (!videoRef.current) {
        throw new Error('Video viewport not initialized');
      }
      const success = await startLocalCamera(videoRef.current);
      if (!success) {
        setCameraError(cameraTelemetry.error || 'Failed to access camera device');
      }
    } catch (err) {
      setCameraError(err instanceof Error ? err.message : 'Unknown camera error');
    } finally {
      setIsStartingCamera(false);
    }
  };

  const handleStopCamera = () => {
    stopCamera();
    setCameraError(null);
  };

  const handleConnectStream = () => {
    if (!streamInputUrl.trim()) return;
    connectNetworkStream(streamInputUrl.trim());
  };

  // Format helpers
  const isStreaming = cameraTelemetry.state === 'STREAMING';
  const visibleCount = isStreaming ? (cameraTelemetry.visiblePeopleCount ?? 0) : '--';
  const globalCount =
    isStreaming && cameraTelemetry.globalUniquePeopleCount !== null
      ? cameraTelemetry.globalUniquePeopleCount
      : '--';
  const countStatus = isStreaming ? (cameraTelemetry.countStatus || 'READY') : 'NO_DATA';
  const totalRegistered = isStreaming ? (cameraTelemetry.totalRegisteredInSession || 0) : '--';
  const coverageDeg = isStreaming ? (cameraTelemetry.coverageEstimateDeg ?? 0) : '--';
  const coverageStatus = isStreaming ? (cameraTelemetry.coverageStatus || 'UNKNOWN') : 'NO_DATA';

  const fpsText = cameraTelemetry.frameRate ? `${cameraTelemetry.frameRate.toFixed(1)} FPS` : '--';
  const resText = cameraTelemetry.resolution
    ? `${cameraTelemetry.resolution.width}x${cameraTelemetry.resolution.height}`
    : '--';
  const confText =
    cameraTelemetry.modelConfidence !== null
      ? `${Math.round(cameraTelemetry.modelConfidence * 100)}%`
      : '--';
  const qualityText = cameraTelemetry.detectionQuality || '--';
  const motionText = cameraTelemetry.motionState || '--';
  const modelText = cameraTelemetry.modelName || (isStreaming ? 'COCO-SSD' : '--');

  return (
    <div
      id={id}
      className="border border-[#222222] bg-[#080808] rounded p-3.5 font-mono flex flex-col justify-between"
    >
      {/* 1. Header & Operational Mode Selector */}
      <div>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2.5 mb-3 border-b border-[#222222]">
          <div className="flex items-center gap-2">
            <Camera className="w-4 h-4 text-[#38BDF8]" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#FFFFFF]">
              Optical Surveillance & People Counting
            </h3>
            {activeNodeId && (
              <span className="text-[10px] text-[#8A8A8A]">
                NODE: {activeNodeId}
              </span>
            )}
          </div>

          {/* Operational Mode Toggle */}
          <div className="flex items-center gap-1 p-0.5 bg-[#0D0D0D] border border-[#222222] rounded">
            <button
              type="button"
              onClick={() => setOperationalMode('VISIBLE_CAMERA')}
              className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold tracking-wider transition-colors ${
                operationalMode === 'VISIBLE_CAMERA'
                  ? 'bg-[#38BDF8]/15 text-[#38BDF8] border border-[#38BDF8]/40'
                  : 'text-[#8A8A8A] hover:text-[#FFFFFF]'
              }`}
            >
              <Eye className="w-3 h-3" />
              <span>VISIBLE CAMERA</span>
            </button>
            <button
              type="button"
              onClick={() => setOperationalMode('THROUGH_OBSTACLE_SENSOR')}
              className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold tracking-wider transition-colors ${
                operationalMode === 'THROUGH_OBSTACLE_SENSOR'
                  ? 'bg-[#F59E0B]/15 text-[#F59E0B] border border-[#F59E0B]/40'
                  : 'text-[#8A8A8A] hover:text-[#FFFFFF]'
              }`}
            >
              <Layers className="w-3 h-3" />
              <span>THROUGH-OBSTACLE SENSOR</span>
            </button>
          </div>
        </div>

        {/* 2. MODE A: VISIBLE CAMERA PIPELINE */}
        {operationalMode === 'VISIBLE_CAMERA' && (
          <div className="space-y-3">
            {/* Real Hardware Metrics Ribbon */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
              {/* 1. Global Unique People Headcount (Primary Metric) */}
              <div
                id="camera-global-unique-people-pill"
                className={`col-span-2 sm:col-span-1 p-2 rounded border flex flex-col justify-between ${
                  isStreaming && typeof globalCount === 'number' && globalCount > 0
                    ? 'bg-[#062419] border-[#10B981] text-[#10B981]'
                    : isStreaming
                    ? 'bg-[#0D0D0D] border-[#38BDF8]/40 text-[#FFFFFF]'
                    : 'bg-[#0D0D0D] border-[#222222] text-[#8A8A8A]'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-[9px] uppercase tracking-wider font-bold text-[#8A8A8A]">
                    OBSERVED UNIQUE
                  </span>
                  <Camera className="w-3.5 h-3.5 text-[#38BDF8]" />
                </div>
                <div className="text-2xl font-bold tracking-tight mt-0.5">
                  {globalCount}
                  {isStreaming && typeof globalCount === 'number' && (
                    <span className="text-[9px] font-normal ml-1.5 opacity-80 uppercase">
                      DEEP RE-ID
                    </span>
                  )}
                </div>
                <div className="text-[9px] text-[#8A8A8A] mt-0.5 truncate">
                  REGISTRY: {cameraTelemetry.totalGlobalPeople || totalRegistered} (ACTIVE: {cameraTelemetry.activeGlobalPeople || 0})
                </div>
              </div>

              {/* 2. Deep Re-ID Embedder Status */}
              <div
                id="camera-reid-embedder-pill"
                className="p-2 rounded bg-[#0D0D0D] border border-[#222222] flex flex-col justify-between"
              >
                <div className="flex items-center justify-between">
                  <span className="text-[9px] uppercase tracking-wider text-[#8A8A8A]">
                    RE-ID EMBEDDER
                  </span>
                  <Cpu className="w-3.5 h-3.5 text-[#38BDF8]" />
                </div>
                <div className="mt-0.5">
                  <span
                    className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-bold tracking-wider ${
                      cameraTelemetry.reIdModelStatus === 'READY'
                        ? 'bg-[#10B981]/20 text-[#10B981] border border-[#10B981]/40'
                        : cameraTelemetry.reIdModelStatus === 'LOADING'
                        ? 'bg-[#F59E0B]/20 text-[#F59E0B] border border-[#F59E0B]/40 animate-pulse'
                        : cameraTelemetry.reIdModelStatus === 'ERROR'
                        ? 'bg-[#EF4444]/20 text-[#EF4444] border border-[#EF4444]/40'
                        : 'bg-[#222222] text-[#8A8A8A]'
                    }`}
                  >
                    {cameraTelemetry.reIdModelStatus || 'UNLOADED'}
                  </span>
                  {cameraTelemetry.embeddingDimension && (
                    <span className="text-[9px] text-[#FFFFFF] ml-1 font-mono">
                      {cameraTelemetry.embeddingDimension}-D
                    </span>
                  )}
                </div>
                <div className="text-[9px] text-[#8A8A8A] mt-0.5 truncate">
                  MATCH: {cameraTelemetry.identityMatches || 0} | REASSOC: {cameraTelemetry.identityReassociations || 0}
                </div>
              </div>

              {/* 3. Count Status */}
              <div className="p-2 rounded bg-[#0D0D0D] border border-[#222222] flex flex-col justify-between">
                <span className="text-[9px] uppercase tracking-wider text-[#8A8A8A]">
                  COUNT STATUS
                </span>
                <div className="mt-0.5">
                  <span
                    className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold tracking-wider ${
                      countStatus === 'COUNTING'
                        ? 'bg-[#10B981]/20 text-[#10B981] border border-[#10B981]/50 animate-pulse'
                        : countStatus === 'PAUSED'
                        ? 'bg-[#F59E0B]/20 text-[#F59E0B] border border-[#F59E0B]/50'
                        : countStatus === 'COMPLETE'
                        ? 'bg-[#38BDF8]/20 text-[#38BDF8] border border-[#38BDF8]/50'
                        : countStatus === 'INSUFFICIENT_COVERAGE'
                        ? 'bg-[#EF4444]/20 text-[#EF4444] border border-[#EF4444]/50'
                        : 'bg-[#222222] text-[#8A8A8A]'
                    }`}
                  >
                    {countStatus}
                  </span>
                </div>
                <div className="text-[9px] text-[#8A8A8A] mt-0.5">
                  SESSION: {isStreaming ? cameraTelemetry.cameraId : 'STANDBY'}
                </div>
              </div>

              {/* 4. Visible in Current Frame */}
              <div
                id="camera-visible-people-pill"
                className="p-2 rounded bg-[#0D0D0D] border border-[#222222] flex flex-col justify-between"
              >
                <div className="flex items-center justify-between">
                  <span className="text-[9px] uppercase tracking-wider text-[#8A8A8A]">
                    VISIBLE IN FRAME
                  </span>
                  <Eye className="w-3.5 h-3.5 text-[#8A8A8A]" />
                </div>
                <div className="text-xl font-bold tracking-tight text-[#FFFFFF] mt-0.5">
                  {visibleCount}
                  {isStreaming && typeof visibleCount === 'number' && (
                    <span className="text-[10px] font-normal text-[#8A8A8A] ml-1">
                      CURRENT
                    </span>
                  )}
                </div>
                <div className="text-[9px] text-[#8A8A8A] mt-0.5">
                  ACTIVE TRACKS: {cameraTelemetry.activeTracksCount || 0}
                </div>
              </div>

              {/* 5. Room Sweep Coverage */}
              <div className="p-2 rounded bg-[#0D0D0D] border border-[#222222] flex flex-col justify-between">
                <div className="flex items-center justify-between">
                  <span className="text-[9px] uppercase tracking-wider text-[#8A8A8A]">
                    SWEEP ARC (EST)
                  </span>
                  <Compass className="w-3.5 h-3.5 text-[#38BDF8]" />
                </div>
                <div className="text-xs font-bold text-[#FFFFFF] mt-0.5">
                  {coverageDeg !== '--' ? `${coverageDeg}°` : '--'}{' '}
                  <span
                    className={`text-[9px] px-1.5 py-0.5 rounded font-bold ${
                      coverageStatus === 'SUFFICIENT'
                        ? 'text-[#10B981] bg-[#062419]'
                        : coverageStatus === 'PARTIAL'
                        ? 'text-[#F59E0B] bg-[#241a06]'
                        : coverageStatus === 'INSUFFICIENT'
                        ? 'text-[#EF4444] bg-[#240606]'
                        : 'text-[#8A8A8A] bg-[#1A1A1A]'
                    }`}
                  >
                    {coverageStatus}
                  </span>
                </div>
                <div className="text-[9px] text-[#8A8A8A] mt-0.5">
                  UNVERIFIED 3D (2D EST)
                </div>
              </div>

              {/* 6. Stream Quality & Hardware Rate */}
              <div className="p-2 rounded bg-[#0D0D0D] border border-[#222222] flex flex-col justify-between">
                <span className="text-[9px] uppercase tracking-wider text-[#8A8A8A]">
                  RATE / MOTION
                </span>
                <div className="text-xs font-bold text-[#FFFFFF] mt-0.5">
                  {fpsText} &bull; <span className="text-[10px] text-[#B3B3B3]">{motionText}</span>
                </div>
                <div className="text-[9px] text-[#8A8A8A] mt-0.5 truncate">
                  RES: {resText}
                </div>
              </div>
            </div>

            {/* Session Controller Toolbar */}
            <div className="flex flex-wrap items-center justify-between gap-2 p-2 rounded bg-[#0D0D0D] border border-[#222222]">
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-[#8A8A8A] uppercase font-bold tracking-wider">
                  SWEEP COUNT SESSION:
                </span>
                <span
                  className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                    countStatus === 'COUNTING'
                      ? 'bg-[#10B981]/20 text-[#10B981] border border-[#10B981]/40 animate-pulse'
                      : countStatus === 'PAUSED'
                      ? 'bg-[#F59E0B]/20 text-[#F59E0B] border border-[#F59E0B]/40'
                      : countStatus === 'COMPLETE'
                      ? 'bg-[#38BDF8]/20 text-[#38BDF8] border border-[#38BDF8]/40'
                      : countStatus === 'INSUFFICIENT_COVERAGE'
                      ? 'bg-[#EF4444]/20 text-[#EF4444] border border-[#EF4444]/40'
                      : 'bg-[#222222] text-[#8A8A8A]'
                  }`}
                >
                  {countStatus}
                </span>
              </div>

              <div className="flex items-center gap-1.5">
                {(!countStatus || countStatus === 'READY' || countStatus === 'NO_DATA') && (
                  <button
                    type="button"
                    onClick={() => startCounting()}
                    disabled={!isStreaming}
                    className="flex items-center gap-1 px-2.5 py-1 rounded bg-[#10B981] text-[#000000] font-bold text-xs hover:bg-[#10B981]/90 disabled:opacity-40 transition-colors"
                  >
                    <Play className="w-3 h-3" />
                    <span>START COUNTING</span>
                  </button>
                )}

                {countStatus === 'COUNTING' && (
                  <>
                    <button
                      type="button"
                      onClick={() => pauseCounting()}
                      className="flex items-center gap-1 px-2.5 py-1 rounded bg-[#F59E0B] text-[#000000] font-bold text-xs hover:bg-[#F59E0B]/90 transition-colors"
                    >
                      <Pause className="w-3 h-3" />
                      <span>PAUSE</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => markComplete()}
                      className="flex items-center gap-1 px-2.5 py-1 rounded bg-[#38BDF8] text-[#000000] font-bold text-xs hover:bg-[#38BDF8]/90 transition-colors"
                    >
                      <CheckCircle2 className="w-3 h-3" />
                      <span>FINALIZE COUNT</span>
                    </button>
                  </>
                )}

                {countStatus === 'PAUSED' && (
                  <>
                    <button
                      type="button"
                      onClick={() => resumeCounting()}
                      className="flex items-center gap-1 px-2.5 py-1 rounded bg-[#10B981] text-[#000000] font-bold text-xs hover:bg-[#10B981]/90 transition-colors"
                    >
                      <Play className="w-3 h-3" />
                      <span>RESUME</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => markComplete()}
                      className="flex items-center gap-1 px-2.5 py-1 rounded bg-[#38BDF8] text-[#000000] font-bold text-xs hover:bg-[#38BDF8]/90 transition-colors"
                    >
                      <CheckCircle2 className="w-3 h-3" />
                      <span>FINALIZE COUNT</span>
                    </button>
                  </>
                )}

                {(countStatus === 'COMPLETE' || countStatus === 'INSUFFICIENT_COVERAGE') && (
                  <button
                    type="button"
                    onClick={() => startCounting()}
                    disabled={!isStreaming}
                    className="flex items-center gap-1 px-2.5 py-1 rounded bg-[#10B981] text-[#000000] font-bold text-xs hover:bg-[#10B981]/90 disabled:opacity-40 transition-colors"
                  >
                    <Play className="w-3 h-3" />
                    <span>START NEW COUNT</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => resetCounting()}
                  className="flex items-center gap-1 px-2 py-1 rounded bg-[#1A1A1A] border border-[#333333] text-[#B3B3B3] text-xs hover:text-[#FFFFFF] hover:border-[#555555] transition-colors"
                  title="Reset unique people registry and count without resetting RF, Radar, or sensor telemetry"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>RESET</span>
                </button>
              </div>
            </div>

            {/* Video Viewport & Detection Canvas */}
            <div className="relative aspect-video w-full rounded border border-[#222222] bg-[#000000] overflow-hidden flex items-center justify-center">
              {/* Actual HTML5 Video Element for real camera stream */}
              <video
                ref={videoRef}
                playsInline
                muted
                autoPlay
                className={`w-full h-full object-contain ${
                  isStreaming ? 'block' : 'hidden'
                }`}
              />

              {/* Bounding Box Drawing Canvas */}
              <canvas
                ref={canvasRef}
                className={`absolute inset-0 w-full h-full pointer-events-none ${
                  isStreaming ? 'block' : 'hidden'
                }`}
              />

              {/* Standby / Offline UI */}
              {!isStreaming && (
                <div className="flex flex-col items-center justify-center p-6 text-center z-10">
                  <div className="w-12 h-12 rounded border border-[#222222] bg-[#0D0D0D] flex items-center justify-center text-[#8A8A8A] mb-3">
                    <VideoOff className="w-6 h-6" />
                  </div>
                  <div className="text-sm font-bold tracking-wider text-[#FFFFFF] uppercase">
                    OPTICAL CAMERA FEED OFFLINE
                  </div>
                  <p className="text-xs text-[#8A8A8A] mt-1.5 max-w-sm">
                    No active optical stream detected. Click{' '}
                    <strong className="text-[#38BDF8]">CONNECT DEVICE CAMERA</strong> to bind
                    your device lens, or enter an ESP32-CAM stream URL.
                  </p>
                  <p className="text-[10px] text-[#555555] mt-2 max-w-xs">
                    Optical camera operates strictly on line-of-sight. For through-wall detection,
                    switch to Through-Obstacle Sensor mode.
                  </p>
                </div>
              )}

              {/* Viewport Corner HUD Badges */}
              <div className="absolute top-2 left-2 flex items-center gap-1.5 px-1.5 py-0.5 rounded bg-[#000000]/80 border border-[#222222] text-[9px] text-[#B3B3B3]">
                <span
                  className={`w-2 h-2 rounded-full ${
                    isStreaming ? 'bg-[#10B981] animate-pulse' : 'bg-[#EF4444]'
                  }`}
                />
                <span>
                  {isStreaming ? `LIVE FEED [${cameraTelemetry.cameraId}]` : 'FEED STANDBY'}
                </span>
              </div>

              <div className="absolute top-2 right-2 px-1.5 py-0.5 rounded bg-[#000000]/80 border border-[#222222] text-[9px] text-[#B3B3B3]">
                INFERENCE: {cameraDiagnostics.inferenceLatencyMs ? `${cameraDiagnostics.inferenceLatencyMs}ms` : 'IDLE'}
              </div>

              <div className="absolute bottom-2 left-2 px-1.5 py-0.5 rounded bg-[#000000]/80 border border-[#222222] text-[9px] text-[#8A8A8A]">
                RES: {resText}
              </div>

              <div className="absolute bottom-2 right-2 px-1.5 py-0.5 rounded bg-[#000000]/80 border border-[#222222] text-[9px] text-[#8A8A8A]">
                FOV: LINE-OF-SIGHT ONLY
              </div>
            </div>

            {/* Error Message banner if any */}
            {cameraError && (
              <div className="p-2 rounded bg-[#1f0505] border border-[#6b1414] text-xs text-[#EF4444] flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{cameraError}</span>
              </div>
            )}

            {/* Hardware Controls & Stream Ingestion */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 pt-2 border-t border-[#222222]">
              <div className="flex flex-wrap items-center gap-2">
                {!isStreaming ? (
                  <button
                    type="button"
                    onClick={handleStartDeviceCamera}
                    disabled={isStartingCamera}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-[#38BDF8] text-[#000000] font-bold text-xs hover:bg-[#38BDF8]/90 disabled:opacity-50 transition-colors"
                  >
                    <Camera className="w-3.5 h-3.5" />
                    <span>{isStartingCamera ? 'INITIALIZING...' : 'CONNECT DEVICE CAMERA'}</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleStopCamera}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-[#1f0505] border border-[#6b1414] text-[#EF4444] font-bold text-xs hover:bg-[#300a0a] transition-colors"
                  >
                    <PowerOff className="w-3.5 h-3.5" />
                    <span>DISCONNECT CAMERA</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => refreshCameraStatus()}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded bg-[#0D0D0D] border border-[#222222] text-xs text-[#B3B3B3] hover:text-[#FFFFFF]"
                >
                  <RefreshCw className="w-3 h-3" />
                  <span>PROBE NETWORK</span>
                </button>
              </div>

              {/* Stream URL Input for ESP32-CAM */}
              <div className="flex items-center gap-1.5">
                <input
                  type="text"
                  placeholder="ESP32-CAM Stream URL"
                  value={streamInputUrl}
                  onChange={(e) => setStreamInputUrl(e.target.value)}
                  className="px-2 py-1 text-xs rounded bg-[#0D0D0D] border border-[#222222] text-[#FFFFFF] placeholder-[#555555] w-48 sm:w-56 focus:outline-none focus:border-[#38BDF8]"
                />
                <button
                  type="button"
                  onClick={handleConnectStream}
                  disabled={!streamInputUrl.trim()}
                  className="px-2.5 py-1 rounded bg-[#0D0D0D] border border-[#222222] text-xs text-[#38BDF8] hover:border-[#38BDF8] disabled:opacity-40"
                >
                  CONNECT
                </button>
              </div>
            </div>

            {/* Diagnostics Drawer Toggle */}
            <div className="pt-1">
              <button
                type="button"
                onClick={() => setShowDiagnostics(!showDiagnostics)}
                className="flex items-center gap-1.5 text-[11px] text-[#8A8A8A] hover:text-[#FFFFFF] transition-colors"
              >
                <Wrench className="w-3.5 h-3.5" />
                <span>CAMERA SUBSYSTEM DIAGNOSTICS</span>
                {showDiagnostics ? (
                  <ChevronUp className="w-3.5 h-3.5" />
                ) : (
                  <ChevronDown className="w-3.5 h-3.5" />
                )}
              </button>

              {showDiagnostics && (
                <div
                  id="camera-diagnostics-drawer"
                  className="mt-2.5 p-3 rounded bg-[#0D0D0D] border border-[#222222] grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5 text-[11px]"
                >
                  <div>
                    <span className="text-[#8A8A8A] block">SOURCE TYPE:</span>
                    <span className="text-[#FFFFFF] font-bold">
                      {cameraTelemetry.sourceType || 'NONE'}
                    </span>
                  </div>
                  <div>
                    <span className="text-[#8A8A8A] block">STREAM / DEVICE URL:</span>
                    <span className="text-[#FFFFFF] truncate block">
                      {cameraDiagnostics.streamUrl || '--'}
                    </span>
                  </div>
                  <div>
                    <span className="text-[#8A8A8A] block">MODEL ENGINE STATUS:</span>
                    <span
                      className={`font-bold ${
                        cameraDiagnostics.modelLoadingStatus === 'READY'
                          ? 'text-[#10B981]'
                          : cameraDiagnostics.modelLoadingStatus === 'LOADING'
                          ? 'text-[#F59E0B]'
                          : 'text-[#8A8A8A]'
                      }`}
                    >
                      {cameraDiagnostics.modelLoadingStatus}
                    </span>
                  </div>
                  <div>
                    <span className="text-[#8A8A8A] block">INFERENCE LATENCY:</span>
                    <span className="text-[#FFFFFF]">
                      {cameraDiagnostics.inferenceLatencyMs
                        ? `${cameraDiagnostics.inferenceLatencyMs} ms`
                        : '--'}
                    </span>
                  </div>
                  <div>
                    <span className="text-[#8A8A8A] block">TOTAL FRAMES EVALUATED:</span>
                    <span className="text-[#FFFFFF]">
                      {cameraDiagnostics.totalFramesProcessed}
                    </span>
                  </div>
                  <div>
                    <span className="text-[#8A8A8A] block">DROPPED / SKIPPED FRAMES:</span>
                    <span className="text-[#FFFFFF]">
                      {cameraDiagnostics.droppedFrames}
                    </span>
                  </div>
                  <div>
                    <span className="text-[#8A8A8A] block">WEBSOCKET SYNC:</span>
                    <span className="text-[#10B981] font-bold">
                      {cameraDiagnostics.webSocketStatus}
                    </span>
                  </div>
                  <div>
                    <span className="text-[#8A8A8A] block">LAST FRAME AGE:</span>
                    <span className="text-[#FFFFFF]">
                      {cameraDiagnostics.lastFrameAgeMs !== null
                        ? `${cameraDiagnostics.lastFrameAgeMs} ms`
                        : '--'}
                    </span>
                  </div>
                  <div>
                    <span className="text-[#8A8A8A] block">RE-ID EMBEDDER MODEL:</span>
                    <span
                      className={`font-bold ${
                        cameraTelemetry.reIdModelStatus === 'READY'
                          ? 'text-[#10B981]'
                          : cameraTelemetry.reIdModelStatus === 'LOADING'
                          ? 'text-[#F59E0B]'
                          : 'text-[#8A8A8A]'
                      }`}
                    >
                      {cameraTelemetry.reIdModelStatus}
                    </span>
                    <span className="text-[#FFFFFF] block text-[10px] truncate">
                      {cameraTelemetry.reIdModelName || 'MobileNet Feature Extractor'}
                    </span>
                  </div>
                  <div>
                    <span className="text-[#8A8A8A] block">RE-ID EMBEDDING DIMENSION:</span>
                    <span className="text-[#FFFFFF] font-mono">
                      {cameraTelemetry.embeddingDimension ? `${cameraTelemetry.embeddingDimension}-Dimensional` : '--'}
                    </span>
                  </div>
                  <div>
                    <span className="text-[#8A8A8A] block">RE-ID IDENTITY STATS:</span>
                    <span className="text-[#FFFFFF]">
                      MATCHES: {cameraTelemetry.identityMatches} | CREATED: {cameraTelemetry.identityCreations} | REASSOC: {cameraTelemetry.identityReassociations}
                    </span>
                  </div>
                  <div>
                    <span className="text-[#8A8A8A] block">SUBSYSTEM ERROR:</span>
                    <span className="text-[#EF4444]">
                      {cameraDiagnostics.cameraErrors.length > 0
                        ? cameraDiagnostics.cameraErrors[0]
                        : 'None (Nominal)'}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* 3. MODE B: THROUGH-OBSTACLE SENSOR PIPELINE */}
        {operationalMode === 'THROUGH_OBSTACLE_SENSOR' && (
          <div className="space-y-3">
            {/* Strict Physics Constraint Notice */}
            <div className="p-3 rounded bg-[#161204] border border-[#6b4708] text-xs font-mono space-y-1">
              <div className="flex items-center gap-2 text-[#F59E0B] font-bold uppercase">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>Physical Constraint & RF Modality Distinction</span>
              </div>
              <p className="text-[#B3B3B3] text-[11px] leading-relaxed">
                Optical cameras cannot penetrate solid rock, concrete, or collapsed mine debris.
                Through-obstacle human detection is powered strictly by <strong>Wi-Fi Channel State Information (CSI)</strong> subcarrier variance and <strong>FMCW Radar</strong> micro-Doppler chest-wall respiration motion.
              </p>
            </div>

            {/* Through-Obstacle Evidence Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              {/* 1. Multi-Sensor Fusion Verdict */}
              <div className="p-3 rounded bg-[#0D0D0D] border border-[#222222] flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between text-[10px] text-[#8A8A8A] uppercase tracking-wider">
                    <span>FUSION VERDICT</span>
                    <Layers className="w-3.5 h-3.5 text-[#38BDF8]" />
                  </div>
                  <div className="mt-2 text-sm font-bold text-[#FFFFFF]">
                    {sensorFusionResult.finalStatus}
                  </div>
                </div>
                <div className="mt-3 text-[10px] text-[#8A8A8A]">
                  SOURCE: {sensorFusionResult.sourceDescription} &bull; {sensorFusionResult.fusionState}
                </div>
              </div>

              {/* 2. RF CSI Subcarrier Modality */}
              <div className="p-3 rounded bg-[#0D0D0D] border border-[#222222] flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between text-[10px] text-[#8A8A8A] uppercase tracking-wider">
                    <span>RF CSI INFERENCE</span>
                    <Radio className="w-3.5 h-3.5 text-[#38BDF8]" />
                  </div>
                  <div className="mt-2 text-sm font-bold text-[#FFFFFF]">
                    {fastApiState.latestPrediction?.status || 'NO CSI DATA'}
                  </div>
                </div>
                <div className="mt-3 text-[10px] text-[#8A8A8A]">
                  VOTES:{' '}
                  {fastApiState.latestPrediction?.person_votes !== null &&
                  fastApiState.latestPrediction?.person_votes !== undefined
                    ? `${fastApiState.latestPrediction.person_votes}/30`
                    : '--'}{' '}
                  &bull; CONF:{' '}
                  {fastApiState.latestPrediction?.confidence !== null &&
                  fastApiState.latestPrediction?.confidence !== undefined
                    ? `${Math.round(fastApiState.latestPrediction.confidence * 100)}%`
                    : '--'}
                </div>
              </div>

              {/* 3. FMCW Radar Modality */}
              <div className="p-3 rounded bg-[#0D0D0D] border border-[#222222] flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between text-[10px] text-[#8A8A8A] uppercase tracking-wider">
                    <span>RADAR MICRO-DOPPLER</span>
                    <Cpu className="w-3.5 h-3.5 text-[#38BDF8]" />
                  </div>
                  <div className="mt-2 text-sm font-bold text-[#FFFFFF]">
                    {radarState.latestTelemetry
                      ? radarState.latestTelemetry.motionState === 'MOTION_DETECTED' ||
                        radarState.latestTelemetry.motionDetected
                        ? 'TARGET CONFIRMED'
                        : 'CLEAR'
                      : 'NO RADAR DATA'}
                  </div>
                </div>
                <div className="mt-3 text-[10px] text-[#8A8A8A]">
                  DIST:{' '}
                  {radarState.latestTelemetry?.rangeM !== null &&
                  radarState.latestTelemetry?.rangeM !== undefined
                    ? `${radarState.latestTelemetry.rangeM.toFixed(2)}m`
                    : '--'}{' '}
                  &bull; SNR:{' '}
                  {radarState.latestTelemetry?.snrDb !== null &&
                  radarState.latestTelemetry?.snrDb !== undefined
                    ? `${radarState.latestTelemetry.snrDb.toFixed(1)}dB`
                    : '--'}
                </div>
              </div>
            </div>

            {/* Prominent Hidden People Headcount Integrity Notice */}
            <div className="p-3 rounded bg-[#0D0D0D] border border-[#222222] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="space-y-1">
                <div className="text-xs font-bold text-[#FFFFFF] flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 text-[#F59E0B]" />
                  <span>THROUGH-OBSTACLE HEADCOUNT POLICY</span>
                </div>
                <p className="text-[11px] text-[#8A8A8A] max-w-xl leading-relaxed">
                  RF CSI and single-antenna Radar classify presence and respiration movement behind walls, but cannot provide a discrete headcount without multi-antenna MIMO beamforming arrays. Scientific integrity strictly prohibits manufacturing an unverified headcount.
                </p>
              </div>

              <div className="px-3 py-2 rounded bg-[#080808] border border-[#333333] text-center shrink-0">
                <span className="text-[9px] text-[#8A8A8A] uppercase block">
                  HIDDEN PEOPLE
                </span>
                <span className="text-sm font-bold text-[#8A8A8A]">
                  NOT AVAILABLE
                </span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
