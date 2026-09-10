/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Radar Detection Panel
 * 
 * Independent sensing layer alongside the RF CSI pipeline.
 * Adheres strictly to physical truthfulness:
 * - NO mock readings, NO fake Doppler bins, NO synthetic targets.
 * - When disconnected, displays '--' / 'NOT CONNECTED' / 'NOT AVAILABLE'.
 * - Explicit physics and vital signs limitation disclaimers.
 */

import React, { useState } from 'react';
import {
  Scan,
  Activity,
  AlertTriangle,
  RefreshCw,
  Cpu,
  Clock,
  Gauge,
  Heart,
  Wind,
  Shield,
  Radio,
  Terminal,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { RadarState, RadarConnectionStatus } from '../types/radar.ts';

interface RadarDetectionPanelProps {
  radarState: RadarState;
  onRefreshRadar: () => Promise<void>;
}

export const RadarDetectionPanel: React.FC<RadarDetectionPanelProps> = ({
  radarState,
  onRefreshRadar,
}) => {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showDocs, setShowDocs] = useState(false);

  const { deviceStatus, latestTelemetry, isStale } = radarState;
  const rawStatus = deviceStatus.status;
  const displayStatus: RadarConnectionStatus =
    rawStatus === 'CONNECTED' || (deviceStatus.connected && !isStale)
      ? 'CONNECTED'
      : isStale
      ? 'STALE'
      : rawStatus === 'ERROR'
      ? 'ERROR'
      : 'NOT_CONNECTED';

  const formatNumber = (val: number | null | undefined, suffix = '', decimals = 2): string => {
    if (val === null || val === undefined || isNaN(val)) return '--';
    return `${val.toFixed(decimals)}${suffix}`;
  };

  const formatTime = (ts: string | number | null | undefined): string => {
    if (!ts) return '--';
    try {
      const d = typeof ts === 'number' ? new Date(ts) : new Date(ts);
      if (isNaN(d.getTime())) return typeof ts === 'string' ? ts : '--';
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

  const getConnectionBadge = (status: RadarConnectionStatus) => {
    switch (status) {
      case 'CONNECTED':
      case 'ONLINE':
        return 'bg-[#072412] text-[#22C55E] border-[#22C55E]/40 font-bold';
      case 'STALE':
        return 'bg-[#2A2000] text-[#EAB308] border-[#EAB308]/40 font-bold';
      case 'ERROR':
        return 'bg-[#2A0808] text-[#EF4444] border-[#EF4444]/40 font-bold';
      case 'NOT_CONNECTED':
      case 'OFFLINE':
      case 'NO_DATA':
      default:
        return 'bg-[#181818] text-[#8A8A8A] border-[#333333] font-bold';
    }
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await onRefreshRadar();
    } finally {
      setIsRefreshing(false);
    }
  };

  const rangeVal = latestTelemetry?.rangeM ?? latestTelemetry?.rangeMeters ?? null;
  const snrVal = latestTelemetry?.snrDb ?? latestTelemetry?.snr ?? null;
  const qualityVal = latestTelemetry?.dataQuality ?? latestTelemetry?.quality ?? null;

  return (
    <div className="p-3.5 rounded bg-[#0A0A0A] border border-[#262626] space-y-3 font-mono">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2.5 border-b border-[#202020]">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded bg-[#121212] border border-[#2A2A2A] text-[#38BDF8]">
            <Scan className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-[#FFFFFF]">
                Radar Detection
              </h4>
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-[#141414] text-[#38BDF8] border border-[#38BDF8]/40 font-semibold">
                FMCW / UWB / DOPPLER
              </span>
            </div>
            <p className="text-[10px] text-[#8A8A8A] mt-0.5">
              INDEPENDENT HARDWARE TELEMETRY &bull; NO SIMULATED DATA
            </p>
          </div>
        </div>

        {/* Status Badge & Actions */}
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-[#8A8A8A] uppercase">CONNECTION:</span>
          <span
            className={`px-2 py-0.5 rounded text-[10px] uppercase border ${getConnectionBadge(
              displayStatus
            )}`}
          >
            {displayStatus === 'CONNECTED'
              ? 'CONNECTED'
              : displayStatus === 'STALE'
              ? 'STALE'
              : displayStatus === 'ERROR'
              ? 'ERROR'
              : 'NOT CONNECTED'}
          </span>

          <button
            type="button"
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="flex items-center gap-1 px-2 py-1 rounded bg-[#141414] hover:bg-[#1F1F1F] border border-[#2E2E2E] text-[#FFFFFF] text-[10px] transition-colors disabled:opacity-50"
            title="Poll GET /api/radar/status and /api/radar/latest"
          >
            <RefreshCw className={`w-3 h-3 text-[#38BDF8] ${isRefreshing ? 'animate-spin' : ''}`} />
            <span>Check Radar</span>
          </button>
        </div>
      </div>

      {/* Physics Limitation Notice */}
      <div className="p-2.5 rounded bg-[#0A0700] border border-[#332600] text-[#EAB308] space-y-1">
        <div className="flex items-start gap-2">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-[#EAB308]" />
          <div className="text-[10px] leading-relaxed">
            <span className="font-bold text-[#FDE047]">Physics &amp; Hardware Integrity:</span>{' '}
            Radar human/life detection performance depends on radar frequency, antenna
            configuration, propagation through debris, target geometry, signal processing, and a
            validated detection model. Values are displayed strictly from verified hardware packets.
          </div>
        </div>
      </div>

      {/* Vital Signs Limitation Notice */}
      <div className="p-2 rounded bg-[#080808] border border-[#1A1A1A] flex items-center justify-between text-[10px] text-[#8A8A8A]">
        <div className="flex items-center gap-1.5">
          <Heart className="w-3.5 h-3.5 text-[#EF4444]/70" />
          <span>
            VITAL SIGN INTEGRITY: Breathing and heart rate are displayed{' '}
            <strong className="text-[#B3B3B3]">ONLY</strong> when validated measurements are provided
            by hardware.
          </span>
        </div>
        <span className="text-[9px] text-[#555555] hidden sm:block">NO INFERENCE FROM MOTION</span>
      </div>

      {/* Primary Metrics Grid (Strict Contract Fields) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5">
        {/* 1. Device ID */}
        <div className="p-2 rounded bg-[#060606] border border-[#1F1F1F]">
          <div className="flex items-center gap-1.5 text-[9px] text-[#8A8A8A] uppercase">
            <Cpu className="w-3 h-3 text-[#38BDF8]" />
            <span>Device ID</span>
          </div>
          <div className="mt-1 text-xs font-bold truncate text-[#FFFFFF]">
            {latestTelemetry?.deviceId ?? deviceStatus.deviceId ?? '--'}
          </div>
          <div className="text-[8px] text-[#666666] mt-0.5">
            {deviceStatus.source && deviceStatus.source !== 'UNKNOWN' ? deviceStatus.source : 'HARDWARE BUS'}
          </div>
        </div>

        {/* 2. Range (m) */}
        <div className="p-2 rounded bg-[#060606] border border-[#1F1F1F]">
          <div className="flex items-center gap-1.5 text-[9px] text-[#8A8A8A] uppercase">
            <Gauge className="w-3 h-3 text-[#38BDF8]" />
            <span>Range</span>
          </div>
          <div className="mt-1 text-sm font-bold text-[#FFFFFF]">
            {rangeVal !== null ? `${rangeVal.toFixed(2)} m` : '-- m'}
          </div>
          <div className="text-[8px] text-[#666666] mt-0.5">TARGET DISTANCE</div>
        </div>

        {/* 3. Radial Velocity (m/s) */}
        <div className="p-2 rounded bg-[#060606] border border-[#1F1F1F]">
          <div className="flex items-center gap-1.5 text-[9px] text-[#8A8A8A] uppercase">
            <Activity className="w-3 h-3 text-[#38BDF8]" />
            <span>Radial Velocity</span>
          </div>
          <div className="mt-1 text-sm font-bold text-[#FFFFFF]">
            {latestTelemetry?.radialVelocityMps !== null && latestTelemetry?.radialVelocityMps !== undefined
              ? `${latestTelemetry.radialVelocityMps.toFixed(2)} m/s`
              : '-- m/s'}
          </div>
          <div className="text-[8px] text-[#666666] mt-0.5">DOPPLER VELOCITY</div>
        </div>

        {/* 4. Motion State */}
        <div className="p-2 rounded bg-[#060606] border border-[#1F1F1F]">
          <div className="flex items-center gap-1.5 text-[9px] text-[#8A8A8A] uppercase">
            <Radio className="w-3 h-3 text-[#38BDF8]" />
            <span>Motion</span>
          </div>
          <div className="mt-1 text-xs font-bold truncate">
            {latestTelemetry?.motionState === 'MOTION_DETECTED' ? (
              <span className="text-[#22C55E]">MOTION DETECTED</span>
            ) : latestTelemetry?.motionState === 'STATIONARY' ? (
              <span className="text-[#38BDF8]">STATIONARY</span>
            ) : latestTelemetry?.motionState && latestTelemetry.motionState !== 'NO_DATA' ? (
              <span className="text-[#EAB308]">{latestTelemetry.motionState}</span>
            ) : (
              <span className="text-[#8A8A8A]">--</span>
            )}
          </div>
          <div className="text-[8px] text-[#666666] mt-0.5">TARGET DYNAMICS</div>
        </div>

        {/* 5. Target Count */}
        <div className="p-2 rounded bg-[#060606] border border-[#1F1F1F]">
          <div className="flex items-center gap-1.5 text-[9px] text-[#8A8A8A] uppercase">
            <Shield className="w-3 h-3 text-[#38BDF8]" />
            <span>Target Count</span>
          </div>
          <div className="mt-1 text-xs font-bold text-[#FFFFFF]">
            {latestTelemetry?.targetCount !== null && latestTelemetry?.targetCount !== undefined
              ? latestTelemetry.targetCount
              : '--'}
          </div>
          <div className="text-[8px] text-[#666666] mt-0.5">REAL TARGET COUNT</div>
        </div>

        {/* 6. Micro-motion */}
        <div className="p-2 rounded bg-[#060606] border border-[#1F1F1F]">
          <div className="flex items-center gap-1.5 text-[9px] text-[#8A8A8A] uppercase">
            <Activity className="w-3 h-3 text-[#38BDF8]" />
            <span>Micro-Motion</span>
          </div>
          <div className="mt-1 text-xs font-bold text-[#FFFFFF]">
            {latestTelemetry?.microMotion !== null && latestTelemetry?.microMotion !== undefined
              ? String(latestTelemetry.microMotion)
              : '--'}
          </div>
          <div className="text-[8px] text-[#666666] mt-0.5">ENERGY / SIGNATURE</div>
        </div>

        {/* 7. Breathing Rate (BPM) */}
        <div className="p-2 rounded bg-[#060606] border border-[#1F1F1F]">
          <div className="flex items-center gap-1.5 text-[9px] text-[#8A8A8A] uppercase">
            <Wind className="w-3 h-3 text-[#38BDF8]" />
            <span>Breathing</span>
          </div>
          <div className="mt-1 text-xs font-bold">
            {latestTelemetry?.breathingRateBpm !== null && latestTelemetry?.breathingRateBpm !== undefined ? (
              <span className="text-[#38BDF8]">{latestTelemetry.breathingRateBpm} BPM</span>
            ) : (
              <span className="text-[#8A8A8A]">NOT AVAILABLE</span>
            )}
          </div>
          <div className="text-[8px] text-[#666666] mt-0.5">RESPIRATION RADAR</div>
        </div>

        {/* 8. Heart Rate (BPM) */}
        <div className="p-2 rounded bg-[#060606] border border-[#1F1F1F]">
          <div className="flex items-center gap-1.5 text-[9px] text-[#8A8A8A] uppercase">
            <Heart className="w-3 h-3 text-[#EF4444]" />
            <span>Heart Rate</span>
          </div>
          <div className="mt-1 text-xs font-bold">
            {latestTelemetry?.heartRateBpm !== null && latestTelemetry?.heartRateBpm !== undefined ? (
              <span className="text-[#EF4444]">{latestTelemetry.heartRateBpm} BPM</span>
            ) : (
              <span className="text-[#8A8A8A]">NOT AVAILABLE</span>
            )}
          </div>
          <div className="text-[8px] text-[#666666] mt-0.5">CARDIAC RADAR</div>
        </div>

        {/* 9. Data Quality */}
        <div className="p-2 rounded bg-[#060606] border border-[#1F1F1F]">
          <div className="flex items-center gap-1.5 text-[9px] text-[#8A8A8A] uppercase">
            <Gauge className="w-3 h-3 text-[#38BDF8]" />
            <span>Data Quality</span>
          </div>
          <div className="mt-1 text-xs font-bold text-[#FFFFFF]">
            {qualityVal !== null ? `${(qualityVal * 100).toFixed(0)}%` : '--'}
          </div>
          <div className="text-[8px] text-[#666666] mt-0.5">SIGNAL CONFIDENCE</div>
        </div>

        {/* 10. SNR (dB) */}
        <div className="p-2 rounded bg-[#060606] border border-[#1F1F1F]">
          <div className="flex items-center gap-1.5 text-[9px] text-[#8A8A8A] uppercase">
            <Radio className="w-3 h-3 text-[#38BDF8]" />
            <span>SNR</span>
          </div>
          <div className="mt-1 text-xs font-bold text-[#FFFFFF]">
            {snrVal !== null ? `${snrVal.toFixed(1)} dB` : '-- dB'}
          </div>
          <div className="text-[8px] text-[#666666] mt-0.5">SIGNAL-TO-NOISE</div>
        </div>

        {/* 11. Last Radar Update */}
        <div className="p-2 rounded bg-[#060606] border border-[#1F1F1F] col-span-2 sm:col-span-1 lg:col-span-2">
          <div className="flex items-center gap-1.5 text-[9px] text-[#8A8A8A] uppercase">
            <Clock className="w-3 h-3 text-[#38BDF8]" />
            <span>Last Radar Update</span>
          </div>
          <div className="mt-1 text-xs font-bold text-[#FFFFFF]">
            {formatTime(latestTelemetry?.timestamp ?? deviceStatus.lastSeen)}
          </div>
          <div className="text-[8px] text-[#666666] mt-0.5">PACKET RECEIVE TIME</div>
        </div>
      </div>

      {/* Hardware Telemetry Contract Documentation */}
      <div className="p-2 rounded bg-[#080808] border border-[#1C1C1C] space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-[10px] text-[#B3B3B3]">
            <Terminal className="w-3.5 h-3.5 text-[#38BDF8]" />
            <span className="font-bold uppercase">Hardware Gateway Integration Contract</span>
          </div>

          <button
            type="button"
            onClick={() => setShowDocs(!showDocs)}
            className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-[#121212] hover:bg-[#1A1A1A] border border-[#2A2A2A] text-[9px] text-[#38BDF8] transition-colors"
          >
            <span>Telemetry Contract Specs</span>
            {showDocs ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>
        </div>

        <p className="text-[9px] text-[#8A8A8A]">
          Hardware gateways (ESP32, Raspberry Pi, UART bridge) stream real radar packets directly to{' '}
          <code className="text-[#38BDF8]">POST /api/radar/telemetry</code>. Malformed packets are
          strictly rejected with 400 Bad Request.
        </p>

        {showDocs && (
          <div className="p-2.5 rounded bg-[#050505] border border-[#222222] space-y-2 text-[10px]">
            <div className="text-[#B3B3B3] font-bold">Example Hardware Ingestion Command (curl):</div>
            <pre className="p-2 rounded bg-[#0D0D0D] border border-[#2A2A2A] text-[#38BDF8] font-mono text-[9px] overflow-x-auto whitespace-pre">
{`curl -X POST http://localhost:3000/api/radar/telemetry \\
  -H "Content-Type: application/json" \\
  -d '{
    "deviceId": "RADAR-60G-01",
    "timestamp": "${new Date().toISOString()}",
    "rangeM": 2.45,
    "radialVelocityMps": 0.08,
    "motionState": "MOTION_DETECTED",
    "targetCount": 1,
    "microMotion": 0.12,
    "dataQuality": 0.92,
    "snrDb": 18.5,
    "source": "RADAR_60GHZ"
  }'`}
            </pre>
            <div className="text-[9px] text-[#8A8A8A]">
              Endpoints: <code className="text-[#FFFFFF]">GET /api/radar/status</code> &bull;{' '}
              <code className="text-[#FFFFFF]">GET /api/radar/latest</code> &bull;{' '}
              <code className="text-[#FFFFFF]">POST /api/radar/telemetry</code> &bull;{' '}
              <code className="text-[#FFFFFF]">WS /ws (type: RADAR_UPDATE)</code>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
