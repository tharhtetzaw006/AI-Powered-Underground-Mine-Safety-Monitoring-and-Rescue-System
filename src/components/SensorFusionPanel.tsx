/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Sensor Fusion Panel
 * 
 * Combines independent RF CSI and Radar sensing streams.
 * Enforces strict hardware truthfulness:
 * - NEVER manufactures detection results or fake people counts.
 * - Evidence States: NO_DATA, CSI_ONLY, RADAR_ONLY, MULTI_SENSOR, CONFLICT, ERROR.
 * - Final States: NO DATA, CSI DETECTED, RADAR DETECTED, MULTI-SENSOR DETECTED, CONFLICT, ERROR.
 */

import React from 'react';
import {
  GitMerge,
  Radio,
  Scan,
  AlertTriangle,
  CheckCircle2,
  Clock,
  HelpCircle,
  ShieldCheck,
  Zap,
} from 'lucide-react';
import { SensorFusionResult, FusionFinalStatus } from '../types/radar.ts';

interface SensorFusionPanelProps {
  fusionResult: SensorFusionResult;
  csiOnline: boolean;
  radarConnected: boolean;
}

export const SensorFusionPanel: React.FC<SensorFusionPanelProps> = ({
  fusionResult,
  csiOnline,
  radarConnected,
}) => {
  const {
    finalStatus,
    evidenceSource,
    csiStatus,
    radarStatus,
    csiConfidence,
    radarConfidence,
    fusionState,
    lastFusionUpdate,
    notes,
  } = fusionResult;

  const formatTime = (ts: number | null): string => {
    if (!ts) return '--';
    try {
      const d = new Date(ts);
      return d.toLocaleTimeString(undefined, {
        hour12: false,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
    } catch {
      return '--';
    }
  };

  const formatConfidence = (c: number | null): string => {
    if (c === null || isNaN(c)) return '--';
    const pct = c <= 1 ? c * 100 : c;
    return `${pct.toFixed(1)}%`;
  };

  // Badge styles based on final status
  const getStatusBadge = (status: FusionFinalStatus) => {
    switch (status) {
      case 'MULTI-SENSOR DETECTED':
        return 'bg-[#2E1065] text-[#C084FC] border-[#A855F7]/60 animate-pulse';
      case 'CSI DETECTED':
        return 'bg-[#072412] text-[#22C55E] border-[#22C55E]/50';
      case 'RADAR DETECTED':
        return 'bg-[#0C1E2B] text-[#38BDF8] border-[#38BDF8]/50';
      case 'CONFLICT':
        return 'bg-[#2A0808] text-[#F87171] border-[#EF4444]/60 animate-pulse';
      case 'ERROR':
        return 'bg-[#2A0808] text-[#EF4444] border-[#EF4444]/50';
      case 'NO DATA':
      default:
        return 'bg-[#141414] text-[#8A8A8A] border-[#2A2A2A]';
    }
  };

  const getEvidenceSourceBadge = (src: string) => {
    switch (src) {
      case 'MULTI_SENSOR':
        return 'text-[#C084FC] border-[#A855F7]/40 bg-[#1E0B3B]';
      case 'CSI_ONLY':
        return 'text-[#22C55E] border-[#22C55E]/40 bg-[#072412]';
      case 'RADAR_ONLY':
        return 'text-[#38BDF8] border-[#38BDF8]/40 bg-[#0C1E2B]';
      case 'CONFLICT':
        return 'text-[#F87171] border-[#EF4444]/40 bg-[#2A0808]';
      case 'ERROR':
        return 'text-[#EF4444] border-[#EF4444]/40 bg-[#2A0808]';
      case 'NO_DATA':
      default:
        return 'text-[#8A8A8A] border-[#333333] bg-[#141414]';
    }
  };

  return (
    <div className="p-3.5 rounded bg-[#0A0A0A] border border-[#262626] space-y-3 font-mono">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2.5 border-b border-[#202020]">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded bg-[#121212] border border-[#2A2A2A] text-[#A855F7]">
            <GitMerge className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-[#FFFFFF]">
                Sensor Fusion Engine
              </h4>
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-[#141414] text-[#A855F7] border border-[#A855F7]/40 font-semibold">
                DUAL-MODALITY ARBITRATION
              </span>
            </div>
            <p className="text-[10px] text-[#8A8A8A] mt-0.5">
              INDEPENDENT RF CSI + RADAR CROSS-VERIFICATION LAYER
            </p>
          </div>
        </div>

        {/* Big Final Status Badge */}
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-[#8A8A8A] uppercase">FINAL OUTCOME:</span>
          <span
            className={`px-2.5 py-1 rounded text-xs font-extrabold uppercase border ${getStatusBadge(
              finalStatus
            )}`}
          >
            {finalStatus}
          </span>
        </div>
      </div>

      {/* Cross-modality Telemetry Streams Overview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
        {/* Branch 1: CSI Sensing */}
        <div className="p-2.5 rounded bg-[#060606] border border-[#1F1F1F] space-y-1.5">
          <div className="flex items-center justify-between text-[10px]">
            <div className="flex items-center gap-1.5 text-[#B3B3B3] font-bold">
              <Radio className="w-3.5 h-3.5 text-[#22C55E]" />
              <span>CSI SENSING</span>
            </div>
            <span
              className={`px-1.5 py-0.2 rounded text-[9px] font-bold border ${
                csiOnline
                  ? 'bg-[#072412] text-[#22C55E] border-[#22C55E]/40'
                  : 'bg-[#2A0808] text-[#EF4444] border-[#EF4444]/40'
              }`}
            >
              {csiOnline ? 'ONLINE' : 'OFFLINE'}
            </span>
          </div>

          <div className="space-y-1 text-[10px] pt-1 border-t border-[#181818]">
            <div className="flex justify-between">
              <span className="text-[#8A8A8A]">Classification:</span>
              <span
                className={`font-bold ${
                  csiStatus === 'PERSON DETECTED'
                    ? 'text-[#22C55E]'
                    : csiStatus === 'AREA EMPTY'
                    ? 'text-[#38BDF8]'
                    : 'text-[#8A8A8A]'
                }`}
              >
                {csiStatus}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#8A8A8A]">Confidence:</span>
              <span className="text-[#FFFFFF] font-bold">{formatConfidence(csiConfidence)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#8A8A8A]">Model Type:</span>
              <span className="text-[#8A8A8A]">192-Feat Random Forest</span>
            </div>
          </div>
        </div>

        {/* Branch 2: Radar Sensing */}
        <div className="p-2.5 rounded bg-[#060606] border border-[#1F1F1F] space-y-1.5">
          <div className="flex items-center justify-between text-[10px]">
            <div className="flex items-center gap-1.5 text-[#B3B3B3] font-bold">
              <Scan className="w-3.5 h-3.5 text-[#38BDF8]" />
              <span>RADAR SENSING</span>
            </div>
            <span
              className={`px-1.5 py-0.2 rounded text-[9px] font-bold border ${
                radarConnected
                  ? 'bg-[#072412] text-[#22C55E] border-[#22C55E]/40'
                  : 'bg-[#181818] text-[#8A8A8A] border-[#333333]'
              }`}
            >
              {radarConnected ? 'ONLINE' : 'NOT CONNECTED'}
            </span>
          </div>

          <div className="space-y-1 text-[10px] pt-1 border-t border-[#181818]">
            <div className="flex justify-between">
              <span className="text-[#8A8A8A]">Classification:</span>
              <span
                className={`font-bold ${
                  radarStatus === 'TARGET_DETECTED'
                    ? 'text-[#38BDF8]'
                    : radarStatus === 'NO_TARGET'
                    ? 'text-[#22C55E]'
                    : 'text-[#8A8A8A]'
                }`}
              >
                {radarStatus}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#8A8A8A]">Confidence:</span>
              <span className="text-[#FFFFFF] font-bold">{formatConfidence(radarConfidence)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#8A8A8A]">Processing:</span>
              <span className="text-[#8A8A8A]">Radar Feature Extractor</span>
            </div>
          </div>
        </div>

        {/* Branch 3: Arbitration Engine */}
        <div className="p-2.5 rounded bg-[#060606] border border-[#1F1F1F] space-y-1.5">
          <div className="flex items-center justify-between text-[10px]">
            <div className="flex items-center gap-1.5 text-[#B3B3B3] font-bold">
              <Zap className="w-3.5 h-3.5 text-[#A855F7]" />
              <span>FUSED ARBITRATION</span>
            </div>
            <span
              className={`px-1.5 py-0.2 rounded text-[9px] font-bold border ${getEvidenceSourceBadge(
                evidenceSource
              )}`}
            >
              {evidenceSource}
            </span>
          </div>

          <div className="space-y-1 text-[10px] pt-1 border-t border-[#181818]">
            <div className="flex justify-between">
              <span className="text-[#8A8A8A]">Fusion State:</span>
              <span className="text-[#FFFFFF] font-bold">{fusionState}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#8A8A8A]">Last Update:</span>
              <span className="text-[#FFFFFF] font-bold">{formatTime(lastFusionUpdate)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#8A8A8A]">Discrepancy:</span>
              <span
                className={`font-bold ${
                  fusionState === 'FUSED_CONFLICT'
                    ? 'text-[#EF4444]'
                    : fusionState === 'FUSED_CONCORDANT'
                    ? 'text-[#22C55E]'
                    : 'text-[#8A8A8A]'
                }`}
              >
                {fusionState === 'FUSED_CONFLICT'
                  ? 'YES (CONFLICT)'
                  : fusionState === 'FUSED_CONCORDANT'
                  ? 'NONE (CONCORDANT)'
                  : 'N/A'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Fusion Explanatory Note */}
      <div className="p-2 rounded bg-[#080808] border border-[#1C1C1C] flex items-center justify-between text-[10px]">
        <div className="flex items-center gap-2">
          {fusionState === 'FUSED_CONFLICT' ? (
            <AlertTriangle className="w-3.5 h-3.5 text-[#EF4444] shrink-0" />
          ) : fusionState === 'FUSED_CONCORDANT' ? (
            <CheckCircle2 className="w-3.5 h-3.5 text-[#22C55E] shrink-0" />
          ) : (
            <HelpCircle className="w-3.5 h-3.5 text-[#8A8A8A] shrink-0" />
          )}
          <span className="text-[#B3B3B3]">{notes}</span>
        </div>

        <div className="text-[9px] text-[#666666] shrink-0 hidden sm:block">
          ZERO SYNTHETIC INFERENCE &bull; REAL SENSING ONLY
        </div>
      </div>
    </div>
  );
};
