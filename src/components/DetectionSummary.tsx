/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Human / Life Detection Panel
 * 
 * Truthful, production-ready AI inference interface for mine-rescue monitoring.
 * Connected directly to the real remote FastAPI backend at http://192.168.1.6:8000
 * and WebSocket stream at ws://192.168.1.6:8000/ws.
 * 
 * Strict truth-in-data principles:
 * - NO mock data
 * - NO fake human counts or confidence scores
 * - Estimated People displays '--' / 'NOT AVAILABLE' because backend does not provide discrete count
 * - Person Votes displayed as vote ratio (e.g. 30 / 30) - NEVER as people count
 * - Confidence displayed as real percentage (e.g. 77.88%) or '--'
 * - Displays clear technical limitation warning regarding through-obstacle physics
 * - Shows explicit model lifecycle and real-only event history
 * - Development diagnostics detailing WebSocket readyState, HTTP error categories, and Mixed-Content warnings
 */

import React, { useState } from 'react';
import { useLiveData } from '../context/LiveDataContext.tsx';
import {
  Users,
  ShieldCheck,
  Activity,
  Clock,
  Cpu,
  Signal,
  AlertTriangle,
  Radio,
  History,
  CheckCircle2,
  HelpCircle,
  RefreshCw,
  Server,
  Wifi,
  WifiOff,
  Layers,
  Terminal,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  ShieldAlert,
} from 'lucide-react';
import { StatusBadge } from './StatusBadge.tsx';
import { SensorFusionPanel } from './SensorFusionPanel.tsx';
import { RadarDetectionPanel } from './RadarDetectionPanel.tsx';
import { API_BASE_URL, WS_URL } from '../config/api.ts';

interface DetectionSummaryProps {
  id?: string;
}

export const DetectionSummary: React.FC<DetectionSummaryProps> = ({ id }) => {
  const {
    activeNodeId,
    fastApiState,
    fastApiHistory,
    radarState,
    sensorFusionResult,
    refreshRadarStatus,
    ingestRadarTelemetry,
    refreshFastApi,
    reconnectFastApiWs,
  } = useLiveData();

  const [showDiagnostics, setShowDiagnostics] = useState(true);

  const prediction = fastApiState.latestPrediction;
  const statusInfo = fastApiState.statusInfo;
  const isOnline = fastApiState.backendOnline;
  const wsState = fastApiState.wsState;
  const isStale = fastApiState.isStale;
  const diag = fastApiState.diagnostics;

  // Real backend prediction status
  const currentStatus = prediction?.status ?? (isOnline ? 'UNCERTAIN' : 'NO_DATA');

  // Format timestamp helper
  const formatBackendTime = (ts: string | number | null | undefined): string => {
    if (!ts) return '--';
    try {
      const date = typeof ts === 'number' ? new Date(ts) : new Date(ts);
      if (isNaN(date.getTime())) {
        return typeof ts === 'string' ? ts : '--';
      }
      return date.toLocaleTimeString(undefined, {
        hour12: false,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
    } catch {
      return '--';
    }
  };

  // Format confidence helper (Task 8: e.g. 0.7787777777777778 -> 77.88%)
  const formatConfidence = (conf: number | null | undefined): string => {
    if (conf === null || conf === undefined || isNaN(conf)) return '--';
    const percent = conf <= 1 ? conf * 100 : conf;
    return `${percent.toFixed(2)}%`;
  };

  // Format person votes helper (Task 9: e.g. 30 / 30)
  const formatVotes = (
    votes: number | null | undefined,
    winSize: number | null | undefined
  ): string => {
    if (votes === null || votes === undefined) return '--';
    if (winSize !== null && winSize !== undefined) {
      return `${votes} / ${winSize}`;
    }
    return `${votes}`;
  };

  // Model Lifecycle Stages evaluation
  const isModelLoaded = isOnline && statusInfo?.ml_model === 'loaded';
  const isWsConnected = wsState === 'CONNECTED';
  const hasRealPrediction = Boolean(prediction);

  let currentStageIndex = 0;
  if (isOnline) currentStageIndex = 1;
  if (isModelLoaded) currentStageIndex = 2;
  if (isWsConnected) currentStageIndex = 3;
  if (isWsConnected && hasRealPrediction) currentStageIndex = 4;

  const lifecycleStages = [
    { label: 'BACKEND API', desc: API_BASE_URL },
    { label: 'MODEL LOADED', desc: statusInfo?.model_type ?? 'RandomForest' },
    { label: 'WEBSOCKET STREAM', desc: WS_URL },
    { label: '192-DIM FEATURES', desc: `${statusInfo?.features_required ?? 192} RF CSI vectors` },
    { label: '30-VOTE ENSEMBLE', desc: 'Sliding window decision' },
  ];

  return (
    <div
      id={id}
      className="border border-[#222222] bg-[#080808] rounded p-3.5 font-mono space-y-3.5"
    >
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-[#222222]">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 rounded bg-[#0D0D0D] border border-[#222222] text-[#38BDF8]">
            <Radio className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#FFFFFF]">
                Human / Life Detection
              </h3>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#0D0D0D] text-[#8A8A8A] border border-[#222222]">
                NODE: {activeNodeId ?? 'RESCUE MESH'}
              </span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#0D0D0D] text-[#38BDF8] border border-[#222222]">
                BACKEND: {API_BASE_URL.replace(/^https?:\/\//, '')}
              </span>
            </div>
            <p className="text-[10px] text-[#8A8A8A] mt-0.5">
              RF CSI / RANDOM FOREST (192-FEATURE) VOTING ENSEMBLE &bull; CSI + RADAR SENSOR FUSION
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Fusion Outcome Summary Badge */}
          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-[#10081C] border border-[#A855F7]/40 text-[#C084FC] text-[10px]">
            <span className="text-[#8A8A8A]">FUSION:</span>
            <span className="font-bold">{sensorFusionResult.finalStatus}</span>
          </div>

          {currentStatus === 'PERSON DETECTED' ? (
            <StatusBadge status="ACTIVE" label="CSI: PERSON DETECTED" size="xs" />
          ) : currentStatus === 'AREA EMPTY' ? (
            <StatusBadge status="ACTIVE" label="CSI: AREA EMPTY" size="xs" />
          ) : currentStatus === 'UNCERTAIN' ? (
            <StatusBadge status="STALE" label="CSI: UNCERTAIN" size="xs" />
          ) : !isOnline ? (
            <StatusBadge status="OFFLINE" label="CSI: OFFLINE" size="xs" />
          ) : (
            <StatusBadge status="NO DATA" label="CSI: NO DATA" size="xs" />
          )}
        </div>
      </div>

      {/* Mixed Content Security Restriction Banner (When run inside HTTPS cloud preview) */}
      {diag.isHttpsContext && diag.mixedContentRisk && (
        <div className="p-3 rounded bg-[#1C0F00] border border-[#B45309] text-[#F59E0B] space-y-2">
          <div className="flex items-start gap-2.5">
            <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5 text-[#F59E0B]" />
            <div className="space-y-1 w-full">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wide text-[#FDE68A]">
                  Browser Security Restriction: Mixed Content & Private Network Access
                </span>
                <span className="text-[9px] px-1.5 py-0.5 rounded bg-[#2D1600] text-[#FBBF24] border border-[#B45309]/50">
                  HTTPS PREVIEW DETECTED
                </span>
              </div>
              <p className="text-[11px] leading-relaxed text-[#FDE68A]">
                The current AI Studio preview is loaded over secure <strong>HTTPS</strong> ({diag.currentOrigin}). Modern web browsers strictly block active mixed-content subresource calls to unencrypted HTTP endpoints (<code>http://192.168.1.6:8000</code>) and insecure WebSockets (<code>ws://192.168.1.6:8000/ws</code>) on private LAN IPs.
              </p>
              <div className="text-[10px] leading-relaxed text-[#D97706] pt-1.5 border-t border-[#B45309]/30 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <strong>To conduct live LAN testing:</strong> Run the frontend locally over HTTP on the Windows machine:
                  <code className="ml-1 px-1.5 py-0.5 rounded bg-[#0A0500] text-[#FDE68A] border border-[#B45309]/40 font-mono">
                    npm run dev &rarr; http://localhost:5173
                  </code>
                </div>
                <div className="text-[9px] text-[#FBBF24] shrink-0">
                  Direct LAN access permitted in local HTTP context
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SECTION 1: SENSOR FUSION ARBITRATION PANEL */}
      {/* ========================================================================= */}
      <SensorFusionPanel
        fusionResult={sensorFusionResult}
        csiOnline={isOnline}
        radarConnected={radarState.deviceStatus.connected && !radarState.isStale}
      />

      {/* ========================================================================= */}
      {/* SECTION 2: CSI HUMAN DETECTION PIPELINE (192-FEATURE RANDOM FOREST) */}
      {/* ========================================================================= */}
      <div className="p-3.5 rounded bg-[#0A0A0A] border border-[#222222] space-y-3.5 font-mono">
        <div className="flex items-center justify-between pb-2 border-b border-[#1C1C1C]">
          <div className="flex items-center gap-2">
            <Radio className="w-4 h-4 text-[#22C55E]" />
            <h4 className="text-xs font-bold uppercase tracking-wider text-[#FFFFFF]">
              RF CSI Human Detection Pipeline
            </h4>
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-[#141414] text-[#22C55E] border border-[#22C55E]/40 font-semibold">
              192 FEATURES &bull; 30-VOTE WINDOW
            </span>
          </div>
          <span className="text-[10px] text-[#8A8A8A]">
            BACKEND: {API_BASE_URL}
          </span>
        </div>

      {/* Real FastAPI Backend Health & Telemetry Status Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 rounded bg-[#0D0D0D] border border-[#222222] text-[10px]">
        <div className="flex flex-wrap items-center gap-3 text-[#B3B3B3]">
          {/* Backend Status */}
          <div className="flex items-center gap-1.5">
            <Server className="w-3.5 h-3.5 text-[#38BDF8]" />
            <span>BACKEND:</span>
            {isOnline ? (
              <span className="px-1.5 py-0.5 rounded bg-[#072412] text-[#22C55E] border border-[#22C55E]/40 font-bold">
                ONLINE
              </span>
            ) : (
              <span className="px-1.5 py-0.5 rounded bg-[#2A0808] text-[#EF4444] border border-[#EF4444]/40 font-bold">
                OFFLINE
              </span>
            )}
          </div>

          {/* WebSocket Status */}
          <div className="flex items-center gap-1.5">
            {wsState === 'CONNECTED' ? (
              <Wifi className="w-3.5 h-3.5 text-[#22C55E]" />
            ) : (
              <WifiOff className="w-3.5 h-3.5 text-[#EF4444]" />
            )}
            <span>WS:</span>
            <span
              className={`px-1.5 py-0.5 rounded font-bold border ${
                wsState === 'CONNECTED'
                  ? 'bg-[#072412] text-[#22C55E] border-[#22C55E]/40'
                  : wsState === 'CONNECTING'
                  ? 'bg-[#2A2000] text-[#EAB308] border-[#EAB308]/40'
                  : 'bg-[#181818] text-[#8A8A8A] border-[#333333]'
              }`}
            >
              {wsState}
            </span>
          </div>

          {/* Stale Warning */}
          {isStale && prediction && (
            <span className="px-1.5 py-0.5 rounded bg-[#2A2000] text-[#EAB308] border border-[#EAB308]/40">
              DISCONNECTED / STALE DATA
            </span>
          )}

          {/* Model info */}
          <div className="hidden md:flex items-center gap-1 text-[#8A8A8A]">
            <Layers className="w-3 h-3 text-[#38BDF8]" />
            <span>
              {statusInfo?.model_type ?? 'RandomForestClassifier'}
              {statusInfo?.features_required ? ` (${statusInfo.features_required} features)` : ''}
            </span>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2 ml-auto">
          <button
            type="button"
            onClick={() => refreshFastApi()}
            className="flex items-center gap-1 px-2 py-1 rounded bg-[#1A1A1A] hover:bg-[#252525] border border-[#333333] text-[#FFFFFF] transition-colors"
            title="Force GET http://192.168.1.6:8000/api/status and /api/prediction"
          >
            <RefreshCw className="w-3 h-3 text-[#38BDF8]" />
            <span>Check Status</span>
          </button>

          {wsState !== 'CONNECTED' && (
            <button
              type="button"
              onClick={() => reconnectFastApiWs()}
              className="flex items-center gap-1 px-2 py-1 rounded bg-[#0C1E2B] hover:bg-[#133045] border border-[#38BDF8]/40 text-[#38BDF8] transition-colors"
              title="Reset backoff and connect to ws://192.168.1.6:8000/ws"
            >
              <Wifi className="w-3 h-3" />
              <span>Connect WS</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setShowDiagnostics(!showDiagnostics)}
            className="flex items-center gap-1 px-2 py-1 rounded bg-[#141414] hover:bg-[#1C1C1C] border border-[#2A2A2A] text-[#B3B3B3] transition-colors"
            title="Toggle Network & Development Diagnostics"
          >
            <Terminal className="w-3 h-3 text-[#38BDF8]" />
            <span>Diagnostics</span>
            {showDiagnostics ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>
        </div>
      </div>

      {/* Development Diagnostics & Network Telemetry Panel */}
      {showDiagnostics && (
        <div className="p-3 rounded bg-[#0A0A0A] border border-[#222222] space-y-2.5 text-[10px]">
          <div className="flex items-center justify-between pb-1.5 border-b border-[#1A1A1A]">
            <div className="flex items-center gap-1.5 text-xs font-bold text-[#FFFFFF] uppercase">
              <Terminal className="w-3.5 h-3.5 text-[#38BDF8]" />
              <span>Development Diagnostics & Network Telemetry</span>
            </div>
            <span className="text-[9px] text-[#8A8A8A]">
              RUNTIME CONTEXT: {diag.isHttpsContext ? 'HTTPS CLOUD RUNTIME' : 'LOCAL HTTP RUNTIME'}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-2">
            {/* HTTP Status URL */}
            <div className="p-2 rounded bg-[#050505] border border-[#1A1A1A] space-y-0.5">
              <div className="text-[#8A8A8A] uppercase">HTTP Status URL</div>
              <div className="text-[#38BDF8] font-mono break-all">{diag.httpStatusUrl}</div>
              <div className="text-[9px] text-[#555555]">
                {diag.lastHttpAttemptTime ? `Last Check: ${formatBackendTime(diag.lastHttpAttemptTime)}` : 'No checks yet'}
              </div>
            </div>

            {/* WebSocket Stream URL */}
            <div className="p-2 rounded bg-[#050505] border border-[#1A1A1A] space-y-0.5">
              <div className="text-[#8A8A8A] uppercase">WebSocket Stream URL</div>
              <div className="text-[#38BDF8] font-mono break-all">{diag.wsUrl}</div>
              <div className="text-[9px] text-[#555555]">
                {diag.lastWsAttemptTime ? `Last Attempt: ${formatBackendTime(diag.lastWsAttemptTime)}` : 'No attempts yet'}
              </div>
            </div>

            {/* WebSocket readyState */}
            <div className="p-2 rounded bg-[#050505] border border-[#1A1A1A] space-y-0.5">
              <div className="text-[#8A8A8A] uppercase">WebSocket readyState</div>
              <div className="font-bold">
                <span
                  className={
                    diag.wsReadyState === 1
                      ? 'text-[#22C55E]'
                      : diag.wsReadyState === 0
                      ? 'text-[#EAB308]'
                      : 'text-[#8A8A8A]'
                  }
                >
                  {diag.wsReadyStateLabel}
                </span>
              </div>
              <div className="text-[9px] text-[#555555]">
                {diag.reconnectPaused
                  ? `Reconnection Paused (Attempt ${diag.reconnectAttempts}/${diag.maxReconnectAttempts})`
                  : `Attempts: ${diag.reconnectAttempts} / ${diag.maxReconnectAttempts}`}
              </div>
            </div>

            {/* Network Error Category */}
            <div className="p-2 rounded bg-[#050505] border border-[#1A1A1A] space-y-0.5">
              <div className="text-[#8A8A8A] uppercase">Error Classification</div>
              <div className="font-bold">
                <span
                  className={
                    diag.httpErrorCategory === 'NONE' && diag.wsErrorCategory === 'NONE'
                      ? 'text-[#22C55E]'
                      : diag.httpErrorCategory === 'MIXED_CONTENT_BLOCKED' || diag.wsErrorCategory === 'MIXED_CONTENT_BLOCKED'
                      ? 'text-[#F59E0B]'
                      : 'text-[#EF4444]'
                  }
                >
                  {diag.httpErrorCategory !== 'NONE'
                    ? diag.httpErrorCategory
                    : diag.wsErrorCategory !== 'NONE'
                    ? diag.wsErrorCategory
                    : 'HEALTHY'}
                </span>
              </div>
              <div className="text-[9px] text-[#8A8A8A] truncate">
                WS Error: {diag.wsErrorCategory}
              </div>
            </div>
          </div>

          {/* Diagnostic message description */}
          {(diag.networkErrorMessage || diag.wsErrorMessage) && (
            <div className="p-2 rounded bg-[#120B05] border border-[#2D1600] text-[10px] space-y-1">
              <div className="text-[#FBBF24] font-bold">Network & Security Root Cause:</div>
              {diag.networkErrorMessage && (
                <div className="text-[#FDE68A] leading-relaxed">
                  &bull; <strong>HTTP Layer:</strong> {diag.networkErrorMessage}
                </div>
              )}
              {diag.wsErrorMessage && (
                <div className="text-[#FDE68A] leading-relaxed">
                  &bull; <strong>WebSocket Layer:</strong> {diag.wsErrorMessage}
                </div>
              )}
            </div>
          )}

          {/* Local Windows Testing Guide */}
          <div className="p-2 rounded bg-[#05080C] border border-[#112536] text-[10px] text-[#93C5FD] space-y-1">
            <div className="font-bold text-[#60A5FA]">Target Setup for Real LAN Telemetry:</div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5 text-[9px] font-mono text-[#BFDBFE]">
              <div className="p-1 rounded bg-[#08131F]">Frontend: http://localhost:5173</div>
              <div className="p-1 rounded bg-[#08131F]">Backend: http://192.168.1.6:8000</div>
              <div className="p-1 rounded bg-[#08131F]">WebSocket: ws://192.168.1.6:8000/ws</div>
            </div>
            <div className="text-[9px] text-[#60A5FA] pt-0.5">
              * Note: For cross-origin REST fetch from localhost:5173, ensure FastAPI has CORSMiddleware configured (allow_origins=[&quot;*&quot;]).
            </div>
          </div>
        </div>
      )}

      {/* Mandatory Technical Physics Limitation Notice */}
      <div className="p-3 rounded bg-[#0A0800] border border-[#3A2E00] text-[#EAB308]">
        <div className="flex items-start gap-2.5">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-[#EAB308]" />
          <div className="space-y-1">
            <div className="text-xs font-bold uppercase tracking-wide text-[#FEF08A]">
              Technical Physics Limitation Notice
            </div>
            <p className="text-[11px] leading-relaxed text-[#FDE047]">
              &ldquo;Through-obstacle human detection requires valid RF/radar/depth sensing input and a trained detection model.&rdquo;
            </p>
            <p className="text-[10px] leading-relaxed text-[#CA8A04]">
              Standard field sensors (HC-SR04 ultrasonic, MPU6500 IMU, electret microphone, and LoRa RSSI) measure surface acoustic noise and node movement. They cannot reliably detect or count humans through collapsed rock or dense mine debris. The pipeline receives verified RF CSI vectors processed through a 192-feature Random Forest classifier on the remote AI backend.
            </p>
          </div>
        </div>
      </div>

      {/* 7 Required Metrics Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-2.5">
        {/* 1. Status */}
        <div className="p-2.5 rounded bg-[#0D0D0D] border border-[#222222]">
          <div className="flex items-center gap-1.5 text-[10px] text-[#B3B3B3] uppercase">
            <Activity className="w-3.5 h-3.5 text-[#38BDF8]" />
            <span>Status</span>
          </div>
          <div className="mt-1.5 text-sm sm:text-base font-bold truncate">
            {currentStatus === 'PERSON DETECTED' ? (
              <span className="text-[#22C55E]">PERSON DETECTED</span>
            ) : currentStatus === 'AREA EMPTY' ? (
              <span className="text-[#38BDF8]">AREA EMPTY</span>
            ) : currentStatus === 'UNCERTAIN' ? (
              <span className="text-[#EAB308]">UNCERTAIN</span>
            ) : !isOnline ? (
              <span className="text-[#EF4444]">BACKEND OFFLINE</span>
            ) : (
              <span className="text-[#8A8A8A]">NO DATA</span>
            )}
          </div>
          <div className="text-[9px] text-[#8A8A8A] mt-0.5">
            {prediction && wsState !== 'CONNECTED'
              ? 'STORED LATEST (WS DISCONNECTED)'
              : 'CLASSIFIER OUTCOME'}
          </div>
        </div>

        {/* 2. Estimated People (Backend does not provide discrete count -> display -- or NOT AVAILABLE) */}
        <div className="p-2.5 rounded bg-[#0D0D0D] border border-[#222222]">
          <div className="flex items-center gap-1.5 text-[10px] text-[#B3B3B3] uppercase">
            <Users className="w-3.5 h-3.5 text-[#38BDF8]" />
            <span>Estimated People</span>
          </div>
          <div className="mt-1.5 text-base sm:text-lg font-bold">
            <span className="text-[#8A8A8A]">--</span>
          </div>
          <div className="text-[9px] text-[#8A8A8A] mt-0.5">NOT AVAILABLE</div>
        </div>

        {/* 3. Confidence (Real backend confidence as percentage or --) */}
        <div className="p-2.5 rounded bg-[#0D0D0D] border border-[#222222]">
          <div className="flex items-center gap-1.5 text-[10px] text-[#B3B3B3] uppercase">
            <ShieldCheck className="w-3.5 h-3.5 text-[#38BDF8]" />
            <span>Confidence</span>
          </div>
          <div className="mt-1.5 text-base sm:text-lg font-bold">
            {prediction?.confidence !== null && prediction?.confidence !== undefined ? (
              <span className="text-[#22C55E]">
                {formatConfidence(prediction.confidence)}
              </span>
            ) : (
              <span className="text-[#8A8A8A]">--</span>
            )}
          </div>
          <div className="text-[9px] text-[#8A8A8A] mt-0.5">MODEL POSTERIOR</div>
        </div>

        {/* 4. Person Votes / Detection Window (e.g. 30 / 30, NOT people count) */}
        <div className="p-2.5 rounded bg-[#0D0D0D] border border-[#222222]">
          <div className="flex items-center gap-1.5 text-[10px] text-[#B3B3B3] uppercase">
            <Signal className="w-3.5 h-3.5 text-[#38BDF8]" />
            <span>Person Votes</span>
          </div>
          <div className="mt-1.5 text-base sm:text-lg font-bold">
            {prediction?.person_votes !== null && prediction?.person_votes !== undefined ? (
              <span className="text-[#38BDF8]">
                {formatVotes(prediction.person_votes, prediction.window_size)}
              </span>
            ) : (
              <span className="text-[#8A8A8A]">--</span>
            )}
          </div>
          <div className="text-[9px] text-[#8A8A8A] mt-0.5">DETECTION WINDOW</div>
        </div>

        {/* 5. Model Type */}
        <div className="p-2.5 rounded bg-[#0D0D0D] border border-[#222222]">
          <div className="flex items-center gap-1.5 text-[10px] text-[#B3B3B3] uppercase">
            <Cpu className="w-3.5 h-3.5 text-[#38BDF8]" />
            <span>Model</span>
          </div>
          <div className="mt-1.5 text-xs font-bold truncate">
            {isOnline ? (
              <span className="text-[#22C55E]">
                {statusInfo?.model_type ?? 'RandomForest'}
              </span>
            ) : (
              <span className="text-[#8A8A8A]">NOT AVAILABLE</span>
            )}
          </div>
          <div className="text-[9px] text-[#8A8A8A] mt-0.5">
            {statusInfo?.features_required
              ? `${statusInfo.features_required} FEATURES`
              : '192-DIM VECTOR'}
          </div>
        </div>

        {/* 6. ML Model State */}
        <div className="p-2.5 rounded bg-[#0D0D0D] border border-[#222222]">
          <div className="flex items-center gap-1.5 text-[10px] text-[#B3B3B3] uppercase">
            <Layers className="w-3.5 h-3.5 text-[#38BDF8]" />
            <span>ML Model</span>
          </div>
          <div className="mt-1.5 text-base sm:text-lg font-bold">
            {isOnline ? (
              <span className="text-[#22C55E]">
                {statusInfo?.ml_model ? statusInfo.ml_model.toUpperCase() : 'LOADED'}
              </span>
            ) : (
              <span className="text-[#8A8A8A]">--</span>
            )}
          </div>
          <div className="text-[9px] text-[#8A8A8A] mt-0.5">CSI BRIDGE PIPELINE</div>
        </div>

        {/* 7. Last Inference (Real backend timestamp) */}
        <div className="p-2.5 rounded bg-[#0D0D0D] border border-[#222222] col-span-2 sm:col-span-1">
          <div className="flex items-center gap-1.5 text-[10px] text-[#B3B3B3] uppercase">
            <Clock className="w-3.5 h-3.5 text-[#38BDF8]" />
            <span>Last Inference</span>
          </div>
          <div className="mt-1.5 text-xs sm:text-sm font-bold">
            {prediction?.timestamp ? (
              <span className="text-[#FFFFFF]">
                {formatBackendTime(prediction.timestamp)}
              </span>
            ) : (
              <span className="text-[#8A8A8A]">--</span>
            )}
          </div>
          <div className="text-[9px] text-[#8A8A8A] mt-0.5">BACKEND TIME</div>
        </div>
      </div>

      {/* Model Lifecycle Pipeline Tracker */}
      <div className="p-3 rounded bg-[#0D0D0D] border border-[#222222] space-y-2">
        <div className="flex items-center justify-between text-[11px]">
          <span className="text-[#FFFFFF] font-bold uppercase tracking-wider">
            Inference Pipeline Lifecycle
          </span>
          <span className="text-[10px] text-[#8A8A8A]">
            CURRENT STAGE: {lifecycleStages[currentStageIndex].label}
          </span>
        </div>

        <div className="grid grid-cols-5 gap-1.5">
          {lifecycleStages.map((stage, idx) => {
            const isCurrent = idx === currentStageIndex;
            const isCompleted = idx < currentStageIndex;

            return (
              <div
                key={stage.label}
                className={`p-2 rounded border text-center transition-colors ${
                  isCurrent
                    ? 'border-[#38BDF8] bg-[#0C1E2B] text-[#FFFFFF]'
                    : isCompleted
                    ? 'border-[#22C55E]/40 bg-[#071F11] text-[#A7F3D0]'
                    : 'border-[#1A1A1A] bg-[#050505] text-[#555555]'
                }`}
              >
                <div className="flex items-center justify-center gap-1 mb-1">
                  {isCompleted ? (
                    <CheckCircle2 className="w-3 h-3 text-[#22C55E]" />
                  ) : isCurrent ? (
                    <span className="w-2 h-2 rounded-full bg-[#38BDF8] animate-pulse" />
                  ) : (
                    <span className="w-1.5 h-1.5 rounded-full bg-[#444444]" />
                  )}
                  <span className="text-[9px] font-bold uppercase truncate">{stage.label}</span>
                </div>
                <div className="text-[8px] text-[#8A8A8A] truncate">{stage.desc}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Real Detection Event History */}
      <div className="p-3 rounded bg-[#0D0D0D] border border-[#222222] space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-xs font-bold text-[#FFFFFF] uppercase">
            <History className="w-3.5 h-3.5 text-[#38BDF8]" />
            <span>Verified Detection Event Log</span>
          </div>
          <span className="text-[10px] text-[#8A8A8A]">
            {fastApiHistory.length} REAL FASTAPI EVENTS (ZERO SYNTHETIC RECORDS)
          </span>
        </div>

        {fastApiHistory.length === 0 ? (
          <div className="py-4 text-center border border-dashed border-[#1F1F1F] rounded bg-[#050505]">
            <HelpCircle className="w-5 h-5 mx-auto text-[#555555] mb-1.5" />
            <div className="text-xs text-[#8A8A8A] font-bold">
              NO REAL FASTAPI DETECTION EVENTS RECORDED
            </div>
            <p className="text-[10px] text-[#555555] mt-0.5 max-w-md mx-auto">
              Awaiting live inference packets from {WS_URL} or REST prediction sync. Mock, simulated, or default predictions are never generated.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[10px] text-left border-collapse">
              <thead>
                <tr className="border-b border-[#222222] text-[#8A8A8A]">
                  <th className="py-1 px-2">TIME</th>
                  <th className="py-1 px-2">STATUS</th>
                  <th className="py-1 px-2">PERSON VOTES</th>
                  <th className="py-1 px-2">CONFIDENCE</th>
                  <th className="py-1 px-2">MODEL</th>
                  <th className="py-1 px-2">EST. COUNT</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1A1A1A]">
                {fastApiHistory.map((item) => (
                  <tr key={item.id} className="hover:bg-[#121212]">
                    <td className="py-1 px-2 text-[#FFFFFF]">
                      {formatBackendTime(item.timestamp)}
                    </td>
                    <td className="py-1 px-2">
                      <span
                        className={`px-1 py-0.5 rounded text-[9px] font-bold ${
                          item.status === 'PERSON DETECTED'
                            ? 'bg-[#072412] text-[#22C55E] border border-[#22C55E]/40'
                            : item.status === 'AREA EMPTY'
                            ? 'bg-[#0C1E2B] text-[#38BDF8] border border-[#38BDF8]/40'
                            : 'bg-[#2A2000] text-[#EAB308] border border-[#EAB308]/40'
                        }`}
                      >
                        {item.status}
                      </span>
                    </td>
                    <td className="py-1 px-2 text-[#38BDF8]">
                      {formatVotes(item.person_votes, item.window_size)}
                    </td>
                    <td className="py-1 px-2 text-[#FFFFFF]">
                      {formatConfidence(item.confidence)}
                    </td>
                    <td className="py-1 px-2 text-[#8A8A8A]">
                      {item.model_type ?? 'RandomForestClassifier'}
                    </td>
                    <td className="py-1 px-2 text-[#8A8A8A]">
                      --
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {/* Close CSI Pipeline Section */}
      </div>

      {/* ========================================================================= */}
      {/* SECTION 3: RADAR DETECTION SUBSYSTEM (INDEPENDENT HARDWARE SENSING SOURCE) */}
      {/* ========================================================================= */}
      <RadarDetectionPanel
        radarState={radarState}
        onRefreshRadar={refreshRadarStatus}
      />
    </div>
  );
};
