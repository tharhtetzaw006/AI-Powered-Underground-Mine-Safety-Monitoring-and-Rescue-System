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
  CheckCircle2,
  AlertOctagon,
} from 'lucide-react';
import { RadarState, RadarConnectionStatus } from '../types/radar.ts';

interface RadarDetectionPanelProps {
  radarState: RadarState;
  onRefreshRadar: () => Promise<void>;
  onIngestTelemetry?: (raw: unknown) => boolean;
}

export const RadarDetectionPanel: React.FC<RadarDetectionPanelProps> = ({
  radarState,
  onRefreshRadar,
  onIngestTelemetry,
}) => {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showTester, setShowTester] = useState(false);
  const [testPayload, setTestPayload] = useState(`{
  "deviceId": "RADAR-UWB-01",
  "rangeMeters": 2.45,
  "radialVelocityMps": 0.08,
  "motionDetected": true,
  "motionState": "MOTION_DETECTED",
  "snr": 18.5,
  "quality": 0.88,
  "source": "ESP32_TELEMETRY"
}`);
  const [testerMessage, setTesterMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const { deviceStatus, latestTelemetry, latestDetection, isStale, error } = radarState;
  const isConnected = deviceStatus.connected && !isStale && deviceStatus.status === 'ONLINE';

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
      case 'ONLINE':
        return 'bg-[#072412] text-[#22C55E] border-[#22C55E]/40 font-bold';
      case 'STALE':
        return 'bg-[#2A2000] text-[#EAB308] border-[#EAB308]/40 font-bold';
      case 'OFFLINE':
      case 'ERROR':
        return 'bg-[#2A0808] text-[#EF4444] border-[#EF4444]/40 font-bold';
      case 'NOT_CONNECTED':
      case 'NOT_CONFIGURED':
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

  const handleManualIngest = () => {
    if (!onIngestTelemetry) return;
    try {
      const parsed = JSON.parse(testPayload);
      const success = onIngestTelemetry(parsed);
      if (success) {
        setTesterMessage({
          type: 'success',
          text: 'Packet accepted & validated. Radar state updated successfully.',
        });
      } else {
        setTesterMessage({
          type: 'error',
          text: 'Packet rejected: failed validation rules.',
        });
      }
    } catch (err) {
      setTesterMessage({
        type: 'error',
        text: `JSON Parse error: ${err instanceof Error ? err.message : 'Invalid JSON'}`,
      });
    }
  };

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
                Radar Detection Subsystem
              </h4>
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-[#141414] text-[#38BDF8] border border-[#38BDF8]/40 font-semibold">
                FMCW / UWB / DOPPLER
              </span>
            </div>
            <p className="text-[10px] text-[#8A8A8A] mt-0.5">
              INDEPENDENT MICROWAVE / MILLIMETER-WAVE SENSING SUBSYSTEM
            </p>
          </div>
        </div>

        {/* Status Badge & Actions */}
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-[#8A8A8A] uppercase">STATUS:</span>
          <span
            className={`px-2 py-0.5 rounded text-[10px] uppercase border ${getConnectionBadge(
              deviceStatus.status
            )}`}
          >
            {deviceStatus.status}
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
            <span className="font-bold text-[#FDE047]">Physics Limitation:</span>{' '}
            &ldquo;Radar human/life detection performance depends on radar frequency, antenna
            configuration, propagation through debris, target geometry, signal processing, and a
            validated detection model.&rdquo;
          </div>
        </div>
      </div>

      {/* Vital Signs Limitation Notice */}
      <div className="p-2 rounded bg-[#080808] border border-[#1A1A1A] flex items-center justify-between text-[10px] text-[#8A8A8A]">
        <div className="flex items-center gap-1.5">
          <Heart className="w-3.5 h-3.5 text-[#EF4444]/70" />
          <span>
            VITAL SIGN DATA: <strong className="text-[#B3B3B3]">NOT AVAILABLE</strong> &bull; Do not
            infer breathing or heartbeat from generic motion/range data.
          </span>
        </div>
        <span className="text-[9px] text-[#555555] hidden sm:block">ISO 13485 DISCLOSURE</span>
      </div>

      {/* Primary Metrics Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
        {/* 1. Device ID */}
        <div className="p-2 rounded bg-[#060606] border border-[#1F1F1F]">
          <div className="flex items-center gap-1.5 text-[9px] text-[#8A8A8A] uppercase">
            <Cpu className="w-3 h-3 text-[#38BDF8]" />
            <span>Device ID</span>
          </div>
          <div className="mt-1 text-xs font-bold truncate text-[#FFFFFF]">
            {deviceStatus.deviceId ?? '--'}
          </div>
          <div className="text-[8px] text-[#666666] mt-0.5">
            {deviceStatus.source !== 'UNKNOWN' ? deviceStatus.source : 'HARDWARE BUS'}
          </div>
        </div>

        {/* 2. Range (m) */}
        <div className="p-2 rounded bg-[#060606] border border-[#1F1F1F]">
          <div className="flex items-center gap-1.5 text-[9px] text-[#8A8A8A] uppercase">
            <Gauge className="w-3 h-3 text-[#38BDF8]" />
            <span>Range (Meters)</span>
          </div>
          <div className="mt-1 text-sm font-bold text-[#FFFFFF]">
            {formatNumber(latestTelemetry?.rangeMeters, ' m')}
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
            {formatNumber(latestTelemetry?.radialVelocityMps, ' m/s')}
          </div>
          <div className="text-[8px] text-[#666666] mt-0.5">DOPPLER COMPONENT</div>
        </div>

        {/* 4. Motion State */}
        <div className="p-2 rounded bg-[#060606] border border-[#1F1F1F]">
          <div className="flex items-center gap-1.5 text-[9px] text-[#8A8A8A] uppercase">
            <Radio className="w-3 h-3 text-[#38BDF8]" />
            <span>Motion State</span>
          </div>
          <div className="mt-1 text-xs font-bold truncate">
            {latestTelemetry?.motionState === 'MOTION_DETECTED' ? (
              <span className="text-[#22C55E]">MOTION DETECTED</span>
            ) : latestTelemetry?.motionState === 'STATIONARY' ? (
              <span className="text-[#38BDF8]">STATIONARY</span>
            ) : (
              <span className="text-[#8A8A8A]">NO DATA</span>
            )}
          </div>
          <div className="text-[8px] text-[#666666] mt-0.5">RADAR SIGNATURE</div>
        </div>

        {/* 5. Target Count */}
        <div className="p-2 rounded bg-[#060606] border border-[#1F1F1F]">
          <div className="flex items-center gap-1.5 text-[9px] text-[#8A8A8A] uppercase">
            <Shield className="w-3 h-3 text-[#38BDF8]" />
            <span>Target Count</span>
          </div>
          <div className="mt-1 text-xs font-bold text-[#8A8A8A]">
            {latestTelemetry?.targetCount !== null && latestTelemetry?.targetCount !== undefined
              ? latestTelemetry.targetCount
              : 'NOT AVAILABLE'}
          </div>
          <div className="text-[8px] text-[#666666] mt-0.5">TRACKED TARGETS</div>
        </div>

        {/* 6. Micro-motion */}
        <div className="p-2 rounded bg-[#060606] border border-[#1F1F1F]">
          <div className="flex items-center gap-1.5 text-[9px] text-[#8A8A8A] uppercase">
            <Activity className="w-3 h-3 text-[#38BDF8]" />
            <span>Micro-Motion</span>
          </div>
          <div className="mt-1 text-xs font-bold text-[#FFFFFF]">
            {formatNumber(latestTelemetry?.microMotion)}
          </div>
          <div className="text-[8px] text-[#666666] mt-0.5">ENERGY SPECTRUM</div>
        </div>

        {/* 7. Breathing Rate (BPM) */}
        <div className="p-2 rounded bg-[#060606] border border-[#1F1F1F]">
          <div className="flex items-center gap-1.5 text-[9px] text-[#8A8A8A] uppercase">
            <Wind className="w-3 h-3 text-[#38BDF8]" />
            <span>Breathing Rate</span>
          </div>
          <div className="mt-1 text-xs font-bold text-[#8A8A8A]">
            {latestTelemetry?.breathingRateBpm !== null && latestTelemetry?.breathingRateBpm !== undefined
              ? `${latestTelemetry.breathingRateBpm} BPM`
              : 'NOT AVAILABLE'}
          </div>
          <div className="text-[8px] text-[#666666] mt-0.5">BIOMEDICAL RADAR</div>
        </div>

        {/* 8. Heart Rate (BPM) */}
        <div className="p-2 rounded bg-[#060606] border border-[#1F1F1F]">
          <div className="flex items-center gap-1.5 text-[9px] text-[#8A8A8A] uppercase">
            <Heart className="w-3 h-3 text-[#EF4444]" />
            <span>Heart Rate</span>
          </div>
          <div className="mt-1 text-xs font-bold text-[#8A8A8A]">
            {latestTelemetry?.heartRateBpm !== null && latestTelemetry?.heartRateBpm !== undefined
              ? `${latestTelemetry.heartRateBpm} BPM`
              : 'NOT AVAILABLE'}
          </div>
          <div className="text-[8px] text-[#666666] mt-0.5">PULSE RHYTHM</div>
        </div>

        {/* 9. Data Quality / SNR */}
        <div className="p-2 rounded bg-[#060606] border border-[#1F1F1F]">
          <div className="flex items-center gap-1.5 text-[9px] text-[#8A8A8A] uppercase">
            <Radio className="w-3 h-3 text-[#38BDF8]" />
            <span>Quality / SNR</span>
          </div>
          <div className="mt-1 text-xs font-bold text-[#FFFFFF]">
            {latestTelemetry?.snr !== null && latestTelemetry?.snr !== undefined
              ? `${latestTelemetry.snr.toFixed(1)} dB`
              : latestTelemetry?.quality !== null && latestTelemetry?.quality !== undefined
              ? `${(latestTelemetry.quality * 100).toFixed(0)}%`
              : '--'}
          </div>
          <div className="text-[8px] text-[#666666] mt-0.5">SIGNAL CLARITY</div>
        </div>

        {/* 10. Last Radar Update */}
        <div className="p-2 rounded bg-[#060606] border border-[#1F1F1F]">
          <div className="flex items-center gap-1.5 text-[9px] text-[#8A8A8A] uppercase">
            <Clock className="w-3 h-3 text-[#38BDF8]" />
            <span>Last Update</span>
          </div>
          <div className="mt-1 text-xs font-bold text-[#FFFFFF]">
            {formatTime(latestTelemetry?.timestamp ?? deviceStatus.lastSeen)}
          </div>
          <div className="text-[8px] text-[#666666] mt-0.5">HARDWARE PACKET TIME</div>
        </div>
      </div>

      {/* Real Hardware Ingestion Points & Testing Tool */}
      <div className="p-2 rounded bg-[#080808] border border-[#1C1C1C] space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-[10px] text-[#B3B3B3]">
            <Terminal className="w-3.5 h-3.5 text-[#38BDF8]" />
            <span className="font-bold uppercase">Hardware Ingestion Endpoints</span>
          </div>

          <button
            type="button"
            onClick={() => setShowTester(!showTester)}
            className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-[#121212] hover:bg-[#1A1A1A] border border-[#2A2A2A] text-[9px] text-[#38BDF8] transition-colors"
          >
            <span>Hardware Bench Ingest Tester</span>
            {showTester ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5 text-[9px] font-mono text-[#8A8A8A]">
          <div className="p-1.5 rounded bg-[#050505] border border-[#141414] truncate">
            GET /api/radar/status
          </div>
          <div className="p-1.5 rounded bg-[#050505] border border-[#141414] truncate">
            GET /api/radar/latest
          </div>
          <div className="p-1.5 rounded bg-[#050505] border border-[#141414] truncate">
            POST /api/radar/telemetry
          </div>
        </div>

        {/* Collapsible Manual Telemetry Tester */}
        {showTester && (
          <div className="p-2.5 rounded bg-[#050505] border border-[#222222] space-y-2 text-[10px]">
            <div className="text-[#B3B3B3] font-bold">
              Test Real Radar Ingestion (Strict Validation):
            </div>
            <p className="text-[9px] text-[#666666]">
              Submits a validated JSON packet directly to the RadarDataProvider abstraction. Validates
              positive range, finite velocity, device ID presence, and bounded confidence.
            </p>
            <textarea
              value={testPayload}
              onChange={(e) => setTestPayload(e.target.value)}
              className="w-full h-24 p-2 rounded bg-[#0D0D0D] border border-[#2A2A2A] text-[#38BDF8] font-mono text-[10px] focus:outline-none focus:border-[#38BDF8]"
            />
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={handleManualIngest}
                className="px-2.5 py-1 rounded bg-[#0C1E2B] hover:bg-[#133045] border border-[#38BDF8]/40 text-[#38BDF8] font-bold transition-colors"
              >
                Validate & Ingest Packet
              </button>

              {testerMessage && (
                <div
                  className={`text-[9px] flex items-center gap-1 ${
                    testerMessage.type === 'success' ? 'text-[#22C55E]' : 'text-[#EF4444]'
                  }`}
                >
                  {testerMessage.type === 'success' ? (
                    <CheckCircle2 className="w-3 h-3" />
                  ) : (
                    <AlertOctagon className="w-3 h-3" />
                  )}
                  <span>{testerMessage.text}</span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
