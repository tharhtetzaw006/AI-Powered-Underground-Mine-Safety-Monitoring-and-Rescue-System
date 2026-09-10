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
  Zap,
  Timer,
} from 'lucide-react';
import { SensorFusionResult, FusionFinalStatus, FusionModalityStatus } from '../types/radar.ts';

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
    sourceDescription,
    csiModalityStatus,
    radarModalityStatus,
    csiConfidence,
    radarConfidence,
    fusionState,
    lastFusionUpdate,
    syncWindowMs = 15000,
    inSync,
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

  const getModalityBadge = (mStatus: FusionModalityStatus | undefined) => {
    switch (mStatus) {
      case 'PERSON DETECTED':
        return 'bg-[#072412] text-[#22C55E] border-[#22C55E]/40 font-bold';
      case 'CLEAR':
        return 'bg-[#0C1E2B] text-[#38BDF8] border-[#38BDF8]/40 font-bold';
      case 'NO DATA':
        return 'bg-[#181818] text-[#8A8A8A] border-[#333333] font-bold';
      case 'OFFLINE':
      default:
        return 'bg-[#2A0808] text-[#EF4444] border-[#EF4444]/40 font-bold';
    }
  };

  const getSourceBadge = (src: 'NONE' | 'CSI' | 'RADAR' | 'CSI + RADAR' | undefined) => {
    switch (src) {
      case 'CSI + RADAR':
        return 'text-[#C084FC] border-[#A855F7]/50 bg-[#1E0B3B] font-bold';
      case 'CSI':
        return 'text-[#22C55E] border-[#22C55E]/50 bg-[#072412] font-bold';
      case 'RADAR':
        return 'text-[#38BDF8] border-[#38BDF8]/50 bg-[#0C1E2B] font-bold';
      case 'NONE':
      default:
        return 'text-[#8A8A8A] border-[#333333] bg-[#141414] font-bold';
    }
  };

  const syncIndicator =
    inSync === true
      ? 'IN SYNC'
      : (csiModalityStatus === 'PERSON DETECTED' || csiModalityStatus === 'CLEAR') &&
        (radarModalityStatus === 'PERSON DETECTED' || radarModalityStatus === 'CLEAR')
      ? 'OUT OF SYNC'
      : 'AWAITING DATA';

  const getSyncBadge = (sync: string) => {
    switch (sync) {
      case 'IN SYNC':
        return 'text-[#22C55E] border-[#22C55E]/40 bg-[#072412] font-bold';
      case 'OUT OF SYNC':
        return 'text-[#EAB308] border-[#EAB308]/40 bg-[#2A2000] font-bold';
      default:
        return 'text-[#8A8A8A] border-[#333333] bg-[#141414] font-bold';
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
                RF CSI + RADAR CROSS-VERIFICATION
              </span>
            </div>
            <p className="text-[10px] text-[#8A8A8A] mt-0.5">
              TEMPORAL SYNCHRONIZATION &bull; AUTHORITATIVE TRUTH ARBITRATION
            </p>
          </div>
        </div>

        {/* Combined Status Badge */}
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-[#8A8A8A] uppercase">COMBINED STATUS:</span>
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
              className={`px-1.5 py-0.5 rounded text-[9px] border ${
                csiOnline
                  ? 'bg-[#072412] text-[#22C55E] border-[#22C55E]/40 font-bold'
                  : 'bg-[#2A0808] text-[#EF4444] border-[#EF4444]/40 font-bold'
              }`}
            >
              {csiOnline ? 'ONLINE' : 'OFFLINE'}
            </span>
          </div>

          <div className="space-y-1 text-[10px] pt-1 border-t border-[#181818]">
            <div className="flex justify-between items-center">
              <span className="text-[#8A8A8A]">Modality Status:</span>
              <span className={`px-1.5 py-0.2 rounded text-[9px] border ${getModalityBadge(csiModalityStatus)}`}>
                {csiModalityStatus ?? 'OFFLINE'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#8A8A8A]">Confidence:</span>
              <span className="text-[#FFFFFF] font-bold">{formatConfidence(csiConfidence)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#8A8A8A]">Pipeline:</span>
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
              className={`px-1.5 py-0.5 rounded text-[9px] border ${
                radarConnected
                  ? 'bg-[#072412] text-[#22C55E] border-[#22C55E]/40 font-bold'
                  : 'bg-[#181818] text-[#8A8A8A] border-[#333333] font-bold'
              }`}
            >
              {radarConnected ? 'CONNECTED' : 'NOT CONNECTED'}
            </span>
          </div>

          <div className="space-y-1 text-[10px] pt-1 border-t border-[#181818]">
            <div className="flex justify-between items-center">
              <span className="text-[#8A8A8A]">Modality Status:</span>
              <span className={`px-1.5 py-0.2 rounded text-[9px] border ${getModalityBadge(radarModalityStatus)}`}>
                {radarModalityStatus ?? 'OFFLINE'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#8A8A8A]">Confidence:</span>
              <span className="text-[#FFFFFF] font-bold">{formatConfidence(radarConfidence)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#8A8A8A]">Pipeline:</span>
              <span className="text-[#8A8A8A]">Radar Telemetry Ingest</span>
            </div>
          </div>
        </div>

        {/* Branch 3: Arbitration Engine */}
        <div className="p-2.5 rounded bg-[#060606] border border-[#1F1F1F] space-y-1.5">
          <div className="flex items-center justify-between text-[10px]">
            <div className="flex items-center gap-1.5 text-[#B3B3B3] font-bold">
              <Zap className="w-3.5 h-3.5 text-[#A855F7]" />
              <span>ARBITRATION</span>
            </div>
            <span className={`px-1.5 py-0.5 rounded text-[9px] border ${getSourceBadge(sourceDescription)}`}>
              SOURCE: {sourceDescription ?? 'NONE'}
            </span>
          </div>

          <div className="space-y-1 text-[10px] pt-1 border-t border-[#181818]">
            <div className="flex justify-between items-center">
              <span className="text-[#8A8A8A]">Temporal Sync:</span>
              <span className={`px-1.5 py-0.2 rounded text-[9px] border ${getSyncBadge(syncIndicator)}`}>
                {syncIndicator}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#8A8A8A]">Sync Window:</span>
              <span className="text-[#FFFFFF] font-bold">{(syncWindowMs / 1000).toFixed(0)}s</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#8A8A8A]">Last Update:</span>
              <span className="text-[#FFFFFF] font-bold">{formatTime(lastFusionUpdate)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Fusion Explanatory Note (Clear justification for why state was chosen) */}
      <div className="p-2.5 rounded bg-[#080808] border border-[#1C1C1C] flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-[10px]">
        <div className="flex items-start sm:items-center gap-2">
          {fusionState === 'FUSED_CONFLICT' ? (
            <AlertTriangle className="w-4 h-4 text-[#EF4444] shrink-0 mt-0.5 sm:mt-0" />
          ) : fusionState === 'FUSED_CONCORDANT' ? (
            <CheckCircle2 className="w-4 h-4 text-[#22C55E] shrink-0 mt-0.5 sm:mt-0" />
          ) : (
            <HelpCircle className="w-4 h-4 text-[#8A8A8A] shrink-0 mt-0.5 sm:mt-0" />
          )}
          <div>
            <span className="text-[#8A8A8A] uppercase font-bold mr-1.5">Arbitration Logic:</span>
            <span className="text-[#E0E0E0]">{notes}</span>
          </div>
        </div>

        <div className="flex items-center gap-1.5 text-[9px] text-[#666666] shrink-0 self-end sm:self-auto">
          <Timer className="w-3 h-3 text-[#A855F7]" />
          <span>STRICT DUAL-SENSOR TEMPORAL CORRELATION</span>
        </div>
      </div>
    </div>
  );
};
