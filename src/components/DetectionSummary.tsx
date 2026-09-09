/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Human / Life Detection Panel
 * 
 * Truthful, production-ready AI inference interface for mine-rescue monitoring.
 * Strictly adheres to truth-in-data principles:
 * - NO mock data
 * - NO fake human counts or confidence scores
 * - Displays NO DATA / INSUFFICIENT DATA when model or RF/radar inputs are absent
 * - Displays clear technical limitation warning regarding through-obstacle physics
 * - Shows explicit model lifecycle and real-only event history
 */

import React, { useMemo } from 'react';
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
  XCircle,
  HelpCircle,
} from 'lucide-react';
import { StatusBadge } from './StatusBadge.tsx';

interface DetectionSummaryProps {
  id?: string;
}

export const DetectionSummary: React.FC<DetectionSummaryProps> = ({ id }) => {
  const {
    activeDetection,
    activeNodeId,
    detectionStatus,
    detectionHistory,
    nodes,
  } = useLiveData();

  const nodeHistory = useMemo(() => {
    if (!activeNodeId) return detectionHistory;
    return detectionHistory.filter((h) => h.nodeId === activeNodeId);
  }, [detectionHistory, activeNodeId]);

  // Status mapping
  const currentStatus = activeDetection?.status ?? 'NO_DATA';
  const hasRealDetection = currentStatus === 'HUMAN_DETECTED' || currentStatus === 'NO_HUMAN';

  // Format timestamp helper
  const formatTime = (ts: number | null | undefined): string => {
    if (!ts || typeof ts !== 'number') return '--';
    return new Date(ts).toLocaleTimeString(undefined, {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  // Model Lifecycle Stages evaluation
  const isModelLoaded = detectionStatus?.modelAvailable ?? false;
  const hasValidInput = detectionStatus?.hasValidRealInput ?? false;
  const isInferring = hasRealDetection;

  let currentStageIndex = 0; // 0: NO MODEL
  if (isModelLoaded) currentStageIndex = 1;
  if (isModelLoaded && hasValidInput) currentStageIndex = 2;
  if (isModelLoaded && hasValidInput && isInferring) currentStageIndex = 4;

  const lifecycleStages = [
    { label: 'NO MODEL', desc: 'Awaiting weights' },
    { label: 'MODEL LOADED', desc: 'TFJS / ONNX / Service' },
    { label: 'VALID REAL INPUT', desc: 'RF CSI / UWB Radar' },
    { label: 'INFERENCE', desc: 'Model evaluation' },
    { label: 'REAL RESULT', desc: 'Verified presence' },
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
                NODE: {activeNodeId ?? 'NO NODE SELECTED'}
              </span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#0D0D0D] text-[#38BDF8] border border-[#222222]">
                SOURCE: {activeDetection?.source ?? 'UNKNOWN'}
              </span>
            </div>
            <p className="text-[10px] text-[#8A8A8A] mt-0.5">
              RF / RADAR / SENSOR-FUSION CLASSIFIER PIPELINE
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {currentStatus === 'HUMAN_DETECTED' ? (
            <StatusBadge status="ACTIVE" label="HUMAN DETECTED" size="xs" />
          ) : currentStatus === 'NO_HUMAN' ? (
            <StatusBadge status="ACTIVE" label="NO HUMAN DETECTED" size="xs" />
          ) : currentStatus === 'INSUFFICIENT_DATA' ? (
            <StatusBadge status="STALE" label="INSUFFICIENT DATA" size="xs" />
          ) : currentStatus === 'ERROR' ? (
            <StatusBadge status="OFFLINE" label="PIPELINE ERROR" size="xs" />
          ) : (
            <StatusBadge status="NO DATA" label="STATUS: NO DATA" size="xs" />
          )}
        </div>
      </div>

      {/* Mandatory Technical Limitation Notice */}
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
              Standard field sensors (HC-SR04 ultrasonic, MPU6500 IMU, electret microphone, and LoRa RSSI) measure surface acoustic noise and node movement. They cannot reliably detect or count humans through collapsed rock or dense mine debris. The pipeline will output verified predictions once dedicated RF CSI / UWB radar hardware is connected and a trained classifier is loaded.
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
            {currentStatus === 'HUMAN_DETECTED' ? (
              <span className="text-[#22C55E]">HUMAN DETECTED</span>
            ) : currentStatus === 'NO_HUMAN' ? (
              <span className="text-[#38BDF8]">NO HUMAN</span>
            ) : currentStatus === 'INSUFFICIENT_DATA' ? (
              <span className="text-[#EAB308]">INSUFFICIENT DATA</span>
            ) : currentStatus === 'ERROR' ? (
              <span className="text-[#EF4444]">ERROR</span>
            ) : (
              <span className="text-[#8A8A8A]">NO DATA</span>
            )}
          </div>
          <div className="text-[9px] text-[#8A8A8A] mt-0.5">LIFECYCLE STATE</div>
        </div>

        {/* 2. Estimated People */}
        <div className="p-2.5 rounded bg-[#0D0D0D] border border-[#222222]">
          <div className="flex items-center gap-1.5 text-[10px] text-[#B3B3B3] uppercase">
            <Users className="w-3.5 h-3.5 text-[#38BDF8]" />
            <span>Estimated People</span>
          </div>
          <div className="mt-1.5 text-base sm:text-lg font-bold">
            {detectionStatus?.modelAvailable &&
            activeDetection?.status === 'HUMAN_DETECTED' &&
            activeDetection?.estimatedCount !== null &&
            activeDetection?.estimatedCount !== undefined ? (
              <span className="text-[#22C55E]">{activeDetection.estimatedCount}</span>
            ) : (
              <span className="text-[#8A8A8A]">--</span>
            )}
          </div>
          <div className="text-[9px] text-[#8A8A8A] mt-0.5">DISCRETE COUNT</div>
        </div>

        {/* 3. Confidence */}
        <div className="p-2.5 rounded bg-[#0D0D0D] border border-[#222222]">
          <div className="flex items-center gap-1.5 text-[10px] text-[#B3B3B3] uppercase">
            <ShieldCheck className="w-3.5 h-3.5 text-[#38BDF8]" />
            <span>Confidence</span>
          </div>
          <div className="mt-1.5 text-base sm:text-lg font-bold">
            {detectionStatus?.modelAvailable &&
            (activeDetection?.status === 'HUMAN_DETECTED' || activeDetection?.status === 'NO_HUMAN') &&
            activeDetection?.confidence !== null &&
            activeDetection?.confidence !== undefined ? (
              <span className="text-[#22C55E]">{activeDetection.confidence.toFixed(1)}%</span>
            ) : (
              <span className="text-[#8A8A8A]">--</span>
            )}
          </div>
          <div className="text-[9px] text-[#8A8A8A] mt-0.5">MODEL POSTERIOR</div>
        </div>

        {/* 4. Life Activity */}
        <div className="p-2.5 rounded bg-[#0D0D0D] border border-[#222222]">
          <div className="flex items-center gap-1.5 text-[10px] text-[#B3B3B3] uppercase">
            <Activity className="w-3.5 h-3.5 text-[#38BDF8]" />
            <span>Life Activity</span>
          </div>
          <div className="mt-1.5 text-xs sm:text-sm font-bold truncate">
            {activeDetection?.lifeActivity && activeDetection.lifeActivity !== 'UNKNOWN' ? (
              <span className="text-[#38BDF8]">{activeDetection.lifeActivity.replace(/_/g, ' ')}</span>
            ) : (
              <span className="text-[#8A8A8A]">UNKNOWN</span>
            )}
          </div>
          <div className="text-[9px] text-[#8A8A8A] mt-0.5">BIOMETRIC SIGN</div>
        </div>

        {/* 5. Model */}
        <div className="p-2.5 rounded bg-[#0D0D0D] border border-[#222222]">
          <div className="flex items-center gap-1.5 text-[10px] text-[#B3B3B3] uppercase">
            <Cpu className="w-3.5 h-3.5 text-[#38BDF8]" />
            <span>Model</span>
          </div>
          <div className="mt-1.5 text-xs font-bold truncate">
            {detectionStatus?.modelAvailable ? (
              <span className="text-[#22C55E]">{detectionStatus.modelName}</span>
            ) : (
              <span className="text-[#8A8A8A]">NOT AVAILABLE</span>
            )}
          </div>
          <div className="text-[9px] text-[#8A8A8A] mt-0.5">
            {detectionStatus?.modelAvailable ? `v${detectionStatus.modelVersion}` : 'AWAITING WEIGHTS'}
          </div>
        </div>

        {/* 6. Input Quality */}
        <div className="p-2.5 rounded bg-[#0D0D0D] border border-[#222222]">
          <div className="flex items-center gap-1.5 text-[10px] text-[#B3B3B3] uppercase">
            <Signal className="w-3.5 h-3.5 text-[#38BDF8]" />
            <span>Input Quality</span>
          </div>
          <div className="mt-1.5 text-base sm:text-lg font-bold">
            {activeDetection?.inputQuality !== null && activeDetection?.inputQuality !== undefined ? (
              <span className={activeDetection.inputQuality > 70 ? 'text-[#22C55E]' : 'text-[#EAB308]'}>
                {activeDetection.inputQuality.toFixed(1)}%
              </span>
            ) : (
              <span className="text-[#8A8A8A]">--</span>
            )}
          </div>
          <div className="text-[9px] text-[#8A8A8A] mt-0.5">SIGNAL INTEGRITY</div>
        </div>

        {/* 7. Last Inference */}
        <div className="p-2.5 rounded bg-[#0D0D0D] border border-[#222222] col-span-2 sm:col-span-1">
          <div className="flex items-center gap-1.5 text-[10px] text-[#B3B3B3] uppercase">
            <Clock className="w-3.5 h-3.5 text-[#38BDF8]" />
            <span>Last Inference</span>
          </div>
          <div className="mt-1.5 text-xs sm:text-sm font-bold">
            {activeDetection?.inferenceTimestamp ? (
              <span className="text-[#FFFFFF]">{formatTime(activeDetection.inferenceTimestamp)}</span>
            ) : (
              <span className="text-[#8A8A8A]">--</span>
            )}
          </div>
          <div className="text-[9px] text-[#8A8A8A] mt-0.5">RECENCY</div>
        </div>
      </div>

      {/* Model Lifecycle Pipeline Tracker */}
      <div className="p-3 rounded bg-[#0D0D0D] border border-[#222222] space-y-2">
        <div className="flex items-center justify-between text-[11px]">
          <span className="text-[#FFFFFF] font-bold uppercase tracking-wider">
            Inference Pipeline Lifecycle
          </span>
          <span className="text-[10px] text-[#8A8A8A]">
            CURRENT STATE: {lifecycleStages[currentStageIndex].label}
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
            {nodeHistory.length} REAL EVENTS (ZERO SYNTHETIC RECORDS)
          </span>
        </div>

        {nodeHistory.length === 0 ? (
          <div className="py-4 text-center border border-dashed border-[#1F1F1F] rounded bg-[#050505]">
            <HelpCircle className="w-5 h-5 mx-auto text-[#555555] mb-1.5" />
            <div className="text-xs text-[#8A8A8A] font-bold">
              NO REAL DETECTION EVENTS RECORDED
            </div>
            <p className="text-[10px] text-[#555555] mt-0.5 max-w-md mx-auto">
              The detection engine strictly stores history only when a genuine trained model performs real inference on valid inputs. Mock, simulated, or default predictions are never generated.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[10px] text-left border-collapse">
              <thead>
                <tr className="border-b border-[#222222] text-[#8A8A8A]">
                  <th className="py-1 px-2">TIME</th>
                  <th className="py-1 px-2">NODE</th>
                  <th className="py-1 px-2">STATUS</th>
                  <th className="py-1 px-2">EST. COUNT</th>
                  <th className="py-1 px-2">CONFIDENCE</th>
                  <th className="py-1 px-2">ACTIVITY</th>
                  <th className="py-1 px-2">MODEL</th>
                  <th className="py-1 px-2">INPUT QUALITY</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1A1A1A]">
                {nodeHistory.map((item) => (
                  <tr key={item.id} className="hover:bg-[#121212]">
                    <td className="py-1 px-2 text-[#FFFFFF]">{formatTime(item.timestamp)}</td>
                    <td className="py-1 px-2 text-[#38BDF8]">{item.nodeId}</td>
                    <td className="py-1 px-2">
                      <span
                        className={`px-1 py-0.5 rounded text-[9px] font-bold ${
                          item.status === 'HUMAN_DETECTED'
                            ? 'bg-[#072412] text-[#22C55E] border border-[#22C55E]/40'
                            : 'bg-[#0C1E2B] text-[#38BDF8] border border-[#38BDF8]/40'
                        }`}
                      >
                        {item.status.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="py-1 px-2 text-[#FFFFFF]">
                      {item.estimatedCount !== null ? item.estimatedCount : '--'}
                    </td>
                    <td className="py-1 px-2 text-[#FFFFFF]">
                      {item.confidence !== null ? `${item.confidence.toFixed(1)}%` : '--'}
                    </td>
                    <td className="py-1 px-2 text-[#B3B3B3]">{item.lifeActivity}</td>
                    <td className="py-1 px-2 text-[#8A8A8A]">{item.modelVersion ?? 'N/A'}</td>
                    <td className="py-1 px-2 text-[#8A8A8A]">
                      {item.inputQuality !== null ? `${item.inputQuality.toFixed(1)}%` : '--'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
