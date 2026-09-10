/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Tactical Radar Scope (Plan Position Indicator - PPI)
 * 
 * Professional engineering & air-defense-style tactical radar console.
 * Strict Scientific & Hardware Truthfulness:
 * - Centerpiece circular PPI radar scope with concentric range rings & azimuth grid.
 * - Rotating sweep line is a VISUALIZATION EFFECT ONLY:
 *     * Does NOT create targets.
 *     * Does NOT modify backend data.
 *     * Continues rotating even if offline (clearly flagged as HW OFFLINE).
 * - Real target dots appear ONLY from genuine radar telemetry.
 * - If range is available but angle/azimuth is NOT:
 *     * Does NOT invent an angle.
 *     * Renders an isorange gate (concentric range ring highlight) & UNPOSITIONED TARGET readout.
 * - Human / Animal classification is ONLY displayed if the backend classifier validates it.
 *     * Otherwise explicitly displays 'UNKNOWN TARGET' / 'CLASSIFICATION NOT AVAILABLE'.
 * - Missing values remain '--' / 'NOT AVAILABLE'; never zero.
 */

import React, { useMemo, useState, useEffect } from 'react';
import {
  RadarTelemetry,
  RadarConnectionStatus,
  RadarTarget,
} from '../types/radar.ts';
import {
  Crosshair,
  Radio,
  Activity,
  AlertTriangle,
  Info,
  Target,
  Compass,
  Gauge,
  Clock,
  Shield,
  Eye,
  Play,
  Sparkles,
} from 'lucide-react';

interface TacticalRadarScopeProps {
  telemetry: RadarTelemetry | null;
  connectionStatus: RadarConnectionStatus;
  isStale: boolean;
  onRefresh?: () => Promise<void>;
}

interface DemoRadarTarget extends RadarTarget {
  isDemo: true;
}

export const TacticalRadarScope: React.FC<TacticalRadarScopeProps> = ({
  telemetry,
  connectionStatus,
  isStale,
}) => {
  const [selectedTargetId, setSelectedTargetId] = useState<string | null>(null);

  // Presentation Demo Mode state (Isolated local simulation for presentations)
  const [isDemoMode, setIsDemoMode] = useState<boolean>(false);
  const [demoElapsedSec, setDemoElapsedSec] = useState<number>(0);

  // Deterministic demo animation clock (Runs ONLY when Demo Mode is explicitly ON)
  useEffect(() => {
    if (!isDemoMode) return;
    const startMs = Date.now() - demoElapsedSec * 1000;
    const timer = window.setInterval(() => {
      setDemoElapsedSec((Date.now() - startMs) / 1000);
    }, 50);
    return () => {
      window.clearInterval(timer);
    };
  }, [isDemoMode]);

  // Derive hardware connection state
  const isConnected = connectionStatus === 'CONNECTED' && !isStale;
  const isOffline = connectionStatus === 'OFFLINE' || connectionStatus === 'NOT_CONNECTED';
  const isNoData = !telemetry || isOffline;

  // Maximum display range in meters (default 10m; dynamically expands if real range exceeds 10m)
  const maxRangeMeters = useMemo(() => {
    const r = telemetry?.rangeM ?? telemetry?.rangeMeters ?? null;
    if (r !== null && r > 10) {
      return Math.ceil(r / 5) * 5;
    }
    return 10;
  }, [telemetry]);

  // Extract REAL targets from authentic radar telemetry
  const realTargets: RadarTarget[] = useMemo(() => {
    if (!telemetry) return [];

    // 1. If explicit multi-target list exists in telemetry
    if (Array.isArray(telemetry.targets) && telemetry.targets.length > 0) {
      return telemetry.targets;
    }

    // 2. If single-target scalar fields indicate a detected target
    const range = telemetry.rangeM ?? telemetry.rangeMeters ?? null;
    const hasTargetSignal =
      (range !== null && range > 0) ||
      telemetry.motionDetected === true ||
      telemetry.motionState === 'MOTION_DETECTED' ||
      (telemetry.targetCount !== null && telemetry.targetCount > 0);

    if (hasTargetSignal && range !== null) {
      return [
        {
          targetId: telemetry.targetId ?? 'TGT-01',
          rangeM: range,
          azimuthDeg: telemetry.azimuthDeg ?? telemetry.angleDeg ?? null,
          radialVelocityMps: telemetry.radialVelocityMps,
          snrDb: telemetry.snrDb ?? telemetry.snr ?? null,
          motionState: typeof telemetry.motionState === 'string' ? telemetry.motionState : null,
          classification: telemetry.classification ?? null,
          classificationConfidence: telemetry.classificationConfidence ?? null,
          lastSeen: telemetry.timestamp ?? Date.now(),
        },
      ];
    }

    return [];
  }, [telemetry]);

  // Generate deterministic DEMO targets (Smooth natural motion within scope; isolated from telemetry)
  const demoTargets: DemoRadarTarget[] = useMemo(() => {
    if (!isDemoMode) return [];
    const t = demoElapsedSec;
    return [
      {
        targetId: 'DEMO-T01',
        rangeM: 3.0 + 0.22 * Math.sin(t * 0.4),
        azimuthDeg: (45 + 7 * Math.cos(t * 0.3) + 360) % 360,
        radialVelocityMps: 0.12 * Math.cos(t * 0.4),
        snrDb: 19.5,
        motionState: 'MOTION_DETECTED',
        classification: 'UNKNOWN / DEMO',
        classificationConfidence: null,
        lastSeen: Date.now(),
        isDemo: true,
      },
      {
        targetId: 'DEMO-T02',
        rangeM: 5.0 + 0.30 * Math.cos(t * 0.25),
        azimuthDeg: (120 + 9 * Math.sin(t * 0.2) + 360) % 360,
        radialVelocityMps: -0.14 * Math.sin(t * 0.25),
        snrDb: 16.2,
        motionState: 'MOTION_DETECTED',
        classification: 'UNKNOWN / DEMO',
        classificationConfidence: null,
        lastSeen: Date.now(),
        isDemo: true,
      },
      {
        targetId: 'DEMO-T03',
        rangeM: 6.5 + 0.25 * Math.sin(t * 0.2),
        azimuthDeg: (210 + 6 * Math.sin(t * 0.25) + 360) % 360,
        radialVelocityMps: 0.08 * Math.cos(t * 0.2),
        snrDb: 21.4,
        motionState: 'MOTION_DETECTED',
        classification: 'UNKNOWN / DEMO',
        classificationConfidence: null,
        lastSeen: Date.now(),
        isDemo: true,
      },
      {
        targetId: 'DEMO-T04',
        rangeM: 4.2 + 0.25 * Math.cos(t * 0.35),
        azimuthDeg: (300 + 8 * Math.cos(t * 0.28) + 360) % 360,
        radialVelocityMps: -0.11 * Math.sin(t * 0.35),
        snrDb: 17.8,
        motionState: 'MOTION_DETECTED',
        classification: 'UNKNOWN / DEMO',
        classificationConfidence: null,
        lastSeen: Date.now(),
        isDemo: true,
      },
    ];
  }, [isDemoMode, demoElapsedSec]);

  // Combined candidate targets list (Isolated: demoTargets when demoMode, realTargets otherwise)
  const candidateTargets: (RadarTarget | DemoRadarTarget)[] = useMemo(() => {
    if (isDemoMode) return demoTargets;
    return realTargets;
  }, [isDemoMode, demoTargets, realTargets]);

  // Selected target or default first target
  const activeTarget = useMemo(() => {
    if (candidateTargets.length === 0) return null;
    if (selectedTargetId) {
      const found = candidateTargets.find((t) => t.targetId === selectedTargetId);
      if (found) return found;
    }
    return candidateTargets[0];
  }, [candidateTargets, selectedTargetId]);

  // SVG Scope Dimensions
  const scopeSize = 360;
  const center = scopeSize / 2;
  const radius = center - 24; // 156px radius for the active radar PPI area

  // Concentric range rings: 4 intervals (25%, 50%, 75%, 100%)
  const rangeRings = [
    { fraction: 0.25, meters: (maxRangeMeters * 0.25).toFixed(1) },
    { fraction: 0.50, meters: (maxRangeMeters * 0.50).toFixed(1) },
    { fraction: 0.75, meters: (maxRangeMeters * 0.75).toFixed(1) },
    { fraction: 1.00, meters: maxRangeMeters.toFixed(1) },
  ];

  // Azimuth bearing lines (every 30 degrees)
  const bearingAngles = [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330];

  // Formatter helpers
  const formatNum = (val: number | null | undefined, suffix = '', decimals = 2) => {
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

  // Status badge styling
  const getStatusText = () => {
    if (isOffline) return 'OFFLINE';
    if (isStale) return 'STALE';
    if (connectionStatus === 'CONNECTED') return 'CONNECTED';
    if (connectionStatus === 'ERROR') return 'ERROR';
    return 'NO DATA';
  };

  return (
    <div className="space-y-3 font-mono">
      <style>{`
        @keyframes tactical-radar-sweep {
          from {
            transform: rotate(0deg);
          }
          to {
            transform: rotate(360deg);
          }
        }
        .animate-radar-sweep {
          transform-origin: 180px 180px;
          animation: tactical-radar-sweep 4s linear infinite;
        }
      `}</style>

      {/* Main Console Container: Scope + Tactical Target Panel */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-start">
        {/* ========================================================================= */}
        {/* LEFT / CENTER: CIRCULAR PPI RADAR SCOPE (Tactical Centerpiece)            */}
        {/* ========================================================================= */}
        <div className="lg:col-span-7 bg-[#020508] border border-[#16222F] rounded p-3 relative flex flex-col items-center select-none overflow-hidden">
          {/* Top Technical Metadata Header */}
          <div className="w-full flex items-center justify-between text-[10px] text-[#0EA5E9] border-b border-[#16222F] pb-2 mb-2 font-mono">
            <div className="flex items-center gap-2 min-w-0">
              <Compass className="w-3.5 h-3.5 text-[#38BDF8] shrink-0" />
              <span className="font-bold tracking-wider text-[#E2E8F0] whitespace-nowrap">PPI SCOPE // CONSOLE 01</span>
            </div>

            <div className="flex items-center gap-2.5 shrink-0">
              <div className="hidden md:flex items-center gap-2 text-[9px] text-[#8A8A8A]">
                <span>RNG: <strong className="text-[#38BDF8]">{maxRangeMeters.toFixed(1)}m</strong></span>
              </div>
              {/* CLEARLY VISIBLE COMPACT BUTTON AT TOP-RIGHT OF RADAR PPI CONSOLE */}
              <button
                type="button"
                id="radar-demo-mode-toggle-ppi"
                onClick={() => {
                  setIsDemoMode((prev) => {
                    const next = !prev;
                    if (!next) setSelectedTargetId(null);
                    return next;
                  });
                }}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-[10px] font-bold tracking-wider uppercase transition-all border cursor-pointer ${
                  isDemoMode
                    ? 'bg-[#F59E0B] text-[#000000] border-[#F59E0B] hover:bg-[#F59E0B]/90 shadow-[0_0_10px_rgba(245,158,11,0.6)]'
                    : 'bg-[#1E293B] text-[#FFFFFF] border-[#38BDF8]/60 hover:bg-[#38BDF8] hover:text-[#000000] hover:border-[#38BDF8]'
                }`}
                title="Toggle Demo Mode"
              >
                <Radio className="w-3.5 h-3.5" />
                <span>DEMO MODE: {isDemoMode ? 'ON' : 'OFF'}</span>
              </button>
            </div>
          </div>

          {/* Radar Scope Wrapper */}
          <div className="relative w-full max-w-[370px] sm:max-w-[400px] aspect-square my-1 flex items-center justify-center">
            {/* SVG Circular PPI Radar Scope */}
            <svg
              viewBox={`0 0 ${scopeSize} ${scopeSize}`}
              className="w-full h-full drop-shadow-md"
              aria-label="Tactical PPI Radar Scope"
            >
              <defs>
                {/* Radar Scope Background Gradient */}
                <radialGradient id="radarGlassGrad" cx="50%" cy="50%" r="50%">
                  <stop offset="0%" stopColor="#040c14" />
                  <stop offset="85%" stopColor="#02060a" />
                  <stop offset="100%" stopColor="#010305" />
                </radialGradient>

                {/* Sweep Sector Phosphor Trail Gradient */}
                <linearGradient id="sweepTrailGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#38BDF8" stopOpacity="0.28" />
                  <stop offset="70%" stopColor="#0EA5E9" stopOpacity="0.08" />
                  <stop offset="100%" stopColor="#0EA5E9" stopOpacity="0.0" />
                </linearGradient>

                {/* Tactical Target Glow Filter */}
                <filter id="blipGlow" x="-50%" y="-50%" width="200%" height="200%">
                  <feGaussianBlur in="SourceGraphic" stdDeviation="1.5" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              </defs>

              {/* Scope Outer Housing & Glass Bezel */}
              <circle
                cx={center}
                cy={center}
                r={radius + 18}
                fill="#050a0f"
                stroke="#1B2D3F"
                strokeWidth="2"
              />
              <circle
                cx={center}
                cy={center}
                r={radius + 10}
                fill="none"
                stroke="#101F2D"
                strokeWidth="1"
              />
              <circle
                cx={center}
                cy={center}
                r={radius}
                fill="url(#radarGlassGrad)"
                stroke="#0EA5E9"
                strokeWidth="1.2"
                strokeOpacity="0.5"
              />

              {/* Cardinal & Azimuth Ticks around perimeter */}
              {Array.from({ length: 72 }).map((_, i) => {
                const angle = i * 5;
                const isMajor = angle % 30 === 0;
                const isCardinal = angle % 90 === 0;
                const tickLen = isCardinal ? 8 : isMajor ? 5 : 3;
                const rad = (angle * Math.PI) / 180;
                const x1 = center + radius * Math.sin(rad);
                const y1 = center - radius * Math.cos(rad);
                const x2 = center + (radius - tickLen) * Math.sin(rad);
                const y2 = center - (radius - tickLen) * Math.cos(rad);

                return (
                  <line
                    key={`tick-${angle}`}
                    x1={x1}
                    y1={y1}
                    x2={x2}
                    y2={y2}
                    stroke={isCardinal ? '#38BDF8' : isMajor ? '#0EA5E9' : '#1E3A54'}
                    strokeWidth={isCardinal ? 1.5 : 1}
                    strokeOpacity={isCardinal ? 0.9 : isMajor ? 0.7 : 0.4}
                  />
                );
              })}

              {/* Radial Azimuth Spoke Lines */}
              {bearingAngles.map((deg) => {
                const rad = (deg * Math.PI) / 180;
                const x2 = center + radius * Math.sin(rad);
                const y2 = center - radius * Math.cos(rad);
                const isCardinal = deg % 90 === 0;

                return (
                  <line
                    key={`spoke-${deg}`}
                    x1={center}
                    y1={center}
                    x2={x2}
                    y2={y2}
                    stroke="#0EA5E9"
                    strokeWidth={isCardinal ? 1 : 0.6}
                    strokeOpacity={isCardinal ? 0.35 : 0.15}
                    strokeDasharray={isCardinal ? 'none' : '3 3'}
                  />
                );
              })}

              {/* Concentric Range Rings */}
              {rangeRings.map(({ fraction, meters }) => {
                const r = radius * fraction;
                return (
                  <g key={`ring-${fraction}`}>
                    <circle
                      cx={center}
                      cy={center}
                      r={r}
                      fill="none"
                      stroke="#0EA5E9"
                      strokeWidth="1"
                      strokeOpacity={fraction === 1 ? 0.4 : 0.22}
                    />
                    {/* Range Labels along North Axis */}
                    <rect
                      x={center - 14}
                      y={center - r - 6}
                      width={28}
                      height={11}
                      fill="#03080e"
                      fillOpacity="0.8"
                      rx={1}
                    />
                    <text
                      x={center}
                      y={center - r + 3}
                      fill="#38BDF8"
                      fillOpacity="0.75"
                      fontSize="8"
                      fontFamily="monospace"
                      textAnchor="middle"
                      fontWeight="bold"
                    >
                      {meters}m
                    </text>
                  </g>
                );
              })}

              {/* Cardinal Compass Headings */}
              <text x={center} y={center - radius - 6} fill="#E2E8F0" fontSize="10" fontWeight="bold" fontFamily="monospace" textAnchor="middle">
                N
              </text>
              <text x={center + radius + 8} y={center + 3} fill="#94A3B8" fontSize="9" fontWeight="bold" fontFamily="monospace" textAnchor="start">
                E
              </text>
              <text x={center} y={center + radius + 13} fill="#94A3B8" fontSize="9" fontWeight="bold" fontFamily="monospace" textAnchor="middle">
                S
              </text>
              <text x={center - radius - 8} y={center + 3} fill="#94A3B8" fontSize="9" fontWeight="bold" fontFamily="monospace" textAnchor="end">
                W
              </text>

              {/* Bearing Labels (030°, 060°, 120°, 150°, 210°, 240°, 300°, 330°) */}
              {[30, 60, 120, 150, 210, 240, 300, 330].map((deg) => {
                const rad = (deg * Math.PI) / 180;
                const tx = center + (radius + 12) * Math.sin(rad);
                const ty = center - (radius + 12) * Math.cos(rad) + 3;
                return (
                  <text
                    key={`label-${deg}`}
                    x={tx}
                    y={ty}
                    fill="#475569"
                    fontSize="7"
                    fontFamily="monospace"
                    textAnchor="middle"
                  >
                    {String(deg).padStart(3, '0')}°
                  </text>
                );
              })}

              {/* Transceiver Center Crosshair (TX/RX Radar Origin) */}
              <circle cx={center} cy={center} r={2.5} fill="#38BDF8" />
              <circle cx={center} cy={center} r={6} fill="none" stroke="#38BDF8" strokeWidth="1" strokeOpacity="0.6" />
              <line x1={center - 10} y1={center} x2={center - 3} y2={center} stroke="#38BDF8" strokeWidth="1" strokeOpacity="0.7" />
              <line x1={center + 3} y1={center} x2={center + 10} y2={center} stroke="#38BDF8" strokeWidth="1" strokeOpacity="0.7" />
              <line x1={center} y1={center - 10} x2={center} y2={center - 3} stroke="#38BDF8" strokeWidth="1" strokeOpacity="0.7" />
              <line x1={center} y1={center + 3} x2={center} y2={center + 10} stroke="#38BDF8" strokeWidth="1" strokeOpacity="0.7" />

              {/* ============================================================= */}
              {/* REAL TARGET RENDERING (Strictly Real Hardware Data - Sec 4-8) */}
              {/* ============================================================= */}
              {realTargets.map((target, idx) => {
                const targetRange = Math.min(target.rangeM, maxRangeMeters);
                const targetPixelDist = (targetRange / maxRangeMeters) * radius;
                const hasAngle = typeof target.azimuthDeg === 'number' && !isNaN(target.azimuthDeg);

                // If Angle is AVAILABLE: Plot exact 2D point (r, theta)
                if (hasAngle) {
                  const rad = (target.azimuthDeg! * Math.PI) / 180;
                  const tgtX = center + targetPixelDist * Math.sin(rad);
                  const tgtY = center - targetPixelDist * Math.cos(rad);
                  const isSelected = activeTarget?.targetId === target.targetId;

                  return (
                    <g
                      key={`target-2d-${target.targetId}-${idx}`}
                      className="cursor-pointer transition-transform"
                      onClick={() => setSelectedTargetId(target.targetId)}
                    >
                      {/* Range radial guide to target */}
                      <line
                        x1={center}
                        y1={center}
                        x2={tgtX}
                        y2={tgtY}
                        stroke="#22C55E"
                        strokeWidth="0.8"
                        strokeDasharray="2 2"
                        strokeOpacity="0.4"
                      />

                      {/* Tactical Tracking Bracket (Sec 8: ┌ ┐ └ ┘) */}
                      <g className="transition-opacity">
                        {/* Top-Left */}
                        <path d={`M ${tgtX - 10} ${tgtY - 6} L ${tgtX - 10} ${tgtY - 10} L ${tgtX - 6} ${tgtY - 10}`} fill="none" stroke="#22C55E" strokeWidth="1.2" />
                        {/* Top-Right */}
                        <path d={`M ${tgtX + 6} ${tgtY - 10} L ${tgtX + 10} ${tgtY - 10} L ${tgtX + 10} ${tgtY - 6}`} fill="none" stroke="#22C55E" strokeWidth="1.2" />
                        {/* Bottom-Left */}
                        <path d={`M ${tgtX - 10} ${tgtY + 6} L ${tgtX - 10} ${tgtY + 10} L ${tgtX - 6} ${tgtY + 10}`} fill="none" stroke="#22C55E" strokeWidth="1.2" />
                        {/* Bottom-Right */}
                        <path d={`M ${tgtX + 6} ${tgtY + 10} L ${tgtX + 10} ${tgtY + 10} L ${tgtX + 10} ${tgtY + 6}`} fill="none" stroke="#22C55E" strokeWidth="1.2" />
                      </g>

                      {/* Outer Ring & Solid Blip Dot */}
                      <circle cx={tgtX} cy={tgtY} r={8} fill="none" stroke="#22C55E" strokeWidth="1" strokeOpacity="0.75" />
                      <circle
                        cx={tgtX}
                        cy={tgtY}
                        r={3.5}
                        fill="#22C55E"
                        filter="url(#blipGlow)"
                      />

                      {/* Tactical Target HUD Tag */}
                      <g transform={`translate(${tgtX + 13}, ${tgtY - 12})`}>
                        <rect x="0" y="0" width="70" height="24" fill="#040A0F" fillOpacity="0.9" stroke="#1B4D29" strokeWidth="1" rx="1" />
                        <text x="4" y="9" fill="#22C55E" fontSize="7.5" fontWeight="bold" fontFamily="monospace">
                          {target.targetId}
                        </text>
                        <text x="4" y="18" fill="#A3E635" fontSize="7" fontFamily="monospace">
                          {target.rangeM.toFixed(2)}m | {target.azimuthDeg!.toFixed(0)}°
                        </text>
                      </g>
                    </g>
                  );
                }

                // If Angle is NOT AVAILABLE (1D Range-Only Radar - Sec 5 Fallback):
                // Strictly DO NOT invent an angle or randomly position dot!
                // Render an ISORANGE GATE (concentric range ring highlight) at exact target distance.
                return (
                  <g key={`isorange-gate-${target.targetId}-${idx}`}>
                    {/* Concentric Isorange Shell Arc at measured range */}
                    <circle
                      cx={center}
                      cy={center}
                      r={targetPixelDist}
                      fill="none"
                      stroke="#22C55E"
                      strokeWidth="1.8"
                      strokeDasharray="4 3"
                      strokeOpacity="0.85"
                    />

                    {/* Unpositioned Range Marker Tag on North Axis */}
                    <g transform={`translate(${center - 50}, ${center - targetPixelDist - 15})`}>
                      <rect
                        x="0"
                        y="0"
                        width="100"
                        height="14"
                        fill="#05140A"
                        stroke="#1B4D29"
                        strokeWidth="1"
                        rx="1"
                      />
                      <text
                        x="50"
                        y="10"
                        fill="#22C55E"
                        fontSize="7.5"
                        fontWeight="bold"
                        fontFamily="monospace"
                        textAnchor="middle"
                      >
                        [{target.targetId} ISORANGE: {target.rangeM.toFixed(2)}m]
                      </text>
                    </g>
                  </g>
                );
              })}

              {/* ============================================================= */}
              {/* DEMO TARGET RENDERING (Isolated Presentation Mode - Sec 1-12) */}
              {/* ============================================================= */}
              {isDemoMode &&
                demoTargets.map((target, idx) => {
                  const targetRange = Math.min(target.rangeM, maxRangeMeters);
                  const targetPixelDist = (targetRange / maxRangeMeters) * radius;
                  const rad = (target.azimuthDeg * Math.PI) / 180;
                  const tgtX = center + targetPixelDist * Math.sin(rad);
                  const tgtY = center - targetPixelDist * Math.cos(rad);
                  const isSelected = activeTarget?.targetId === target.targetId;

                  // Sweep interaction: calculate current sweep angle (360° / 4s period)
                  // and brighten dot when sweep beam passes target azimuth
                  const sweepAngleDeg = ((Date.now() % 4000) / 4000) * 360;
                  const angleDiff = (sweepAngleDeg - target.azimuthDeg + 360) % 360;
                  const isSweepHit = angleDiff >= 0 && angleDiff < 36;

                  return (
                    <g
                      key={`demo-target-${target.targetId}-${idx}`}
                      className="cursor-pointer transition-transform"
                      onClick={() => setSelectedTargetId(target.targetId)}
                    >
                      {/* Range radial guide to demo target */}
                      <line
                        x1={center}
                        y1={center}
                        x2={tgtX}
                        y2={tgtY}
                        stroke={isSweepHit ? '#F59E0B' : '#22C55E'}
                        strokeWidth="0.8"
                        strokeDasharray="2 2"
                        strokeOpacity={isSweepHit ? '0.6' : '0.35'}
                      />

                      {/* Tactical Tracking Bracket (┌ ┐ └ ┘) */}
                      <g className="transition-opacity">
                        <path
                          d={`M ${tgtX - 10} ${tgtY - 6} L ${tgtX - 10} ${tgtY - 10} L ${tgtX - 6} ${tgtY - 10}`}
                          fill="none"
                          stroke={isSweepHit ? '#F59E0B' : '#22C55E'}
                          strokeWidth={isSelected ? '1.6' : '1.2'}
                        />
                        <path
                          d={`M ${tgtX + 6} ${tgtY - 10} L ${tgtX + 10} ${tgtY - 10} L ${tgtX + 10} ${tgtY - 6}`}
                          fill="none"
                          stroke={isSweepHit ? '#F59E0B' : '#22C55E'}
                          strokeWidth={isSelected ? '1.6' : '1.2'}
                        />
                        <path
                          d={`M ${tgtX - 10} ${tgtY + 6} L ${tgtX - 10} ${tgtY + 10} L ${tgtX - 6} ${tgtY + 10}`}
                          fill="none"
                          stroke={isSweepHit ? '#F59E0B' : '#22C55E'}
                          strokeWidth={isSelected ? '1.6' : '1.2'}
                        />
                        <path
                          d={`M ${tgtX + 6} ${tgtY + 10} L ${tgtX + 10} ${tgtY + 10} L ${tgtX + 10} ${tgtY + 6}`}
                          fill="none"
                          stroke={isSweepHit ? '#F59E0B' : '#22C55E'}
                          strokeWidth={isSelected ? '1.6' : '1.2'}
                        />
                      </g>

                      {/* Outer Ring & Solid Blip Dot */}
                      <circle
                        cx={tgtX}
                        cy={tgtY}
                        r={isSweepHit ? 10 : 8}
                        fill="none"
                        stroke={isSweepHit ? '#F59E0B' : '#22C55E'}
                        strokeWidth={isSelected ? '1.8' : '1.2'}
                        strokeOpacity={isSweepHit ? 0.95 : 0.75}
                      />
                      <circle
                        cx={tgtX}
                        cy={tgtY}
                        r={isSweepHit ? 5.5 : 3.8}
                        fill={isSweepHit ? '#FDE047' : '#22C55E'}
                        filter="url(#blipGlow)"
                      />

                      {/* Tactical Target HUD Tag */}
                      <g transform={`translate(${tgtX + 13}, ${tgtY - 12})`}>
                        <rect
                          x="0"
                          y="0"
                          width="76"
                          height="24"
                          fill="#040A0F"
                          fillOpacity="0.95"
                          stroke={isSweepHit ? '#F59E0B' : '#166534'}
                          strokeWidth="1"
                          rx="2"
                        />
                        <text x="5" y="10" fill={isSweepHit ? '#FDE047' : '#4ADE80'} fontSize="8" fontWeight="bold" fontFamily="monospace">
                          {target.targetId}
                        </text>
                        <text x="5" y="19" fill="#94A3B8" fontSize="7" fontFamily="monospace">
                          {target.rangeM.toFixed(2)}m | {target.azimuthDeg.toFixed(0)}°
                        </text>
                      </g>
                    </g>
                  );
                })}

              {/* ============================================================= */}
              {/* ROTATING RADAR SWEEP LINE (VISUALIZATION ONLY - Section 3)     */}
              {/* Rendered above targets with pointer-events-none               */}
              {/* ============================================================= */}
              <g
                transform={isDemoMode ? `rotate(${((Date.now() % 4000) / 4000) * 360} ${center} ${center})` : undefined}
                className={!isDemoMode ? 'animate-radar-sweep pointer-events-none' : 'pointer-events-none'}
              >
                {/* Trailing Phosphor Wedge (30 deg sector) */}
                <path
                  d={`M ${center} ${center} L ${center} ${center - radius} A ${radius} ${radius} 0 0 0 ${center - radius * 0.5} ${center - radius * 0.866} Z`}
                  fill="url(#sweepTrailGrad)"
                />
                {/* Crisp Rotating Sweep Arm */}
                <line
                  x1={center}
                  y1={center}
                  x2={center}
                  y2={center - radius}
                  stroke="#38BDF8"
                  strokeWidth="1.6"
                  strokeOpacity="0.85"
                />
              </g>

              {/* Empty State Banner in Scope (When no targets or disconnected) */}
              {realTargets.length === 0 && !isDemoMode && (
                <g transform={`translate(${center}, ${center + 35})`}>
                  <rect
                    x="-65"
                    y="-11"
                    width="130"
                    height="20"
                    fill="#05080C"
                    fillOpacity="0.85"
                    stroke="#1E293B"
                    strokeWidth="1"
                    rx="2"
                  />
                  <text
                    x="0"
                    y="3"
                    fill="#64748B"
                    fontSize="8.5"
                    fontWeight="bold"
                    fontFamily="monospace"
                    textAnchor="middle"
                    letterSpacing="0.5"
                  >
                    NO TARGET DATA
                  </text>
                </g>
              )}

              {/* Hardware Disconnected Overlay Tag */}
              {isOffline && (
                <g transform={`translate(${center}, ${center - 40})`}>
                  <rect
                    x="-65"
                    y="-11"
                    width="130"
                    height="20"
                    fill="#1A0A0A"
                    fillOpacity="0.9"
                    stroke="#EF4444"
                    strokeWidth="1"
                    strokeOpacity="0.6"
                    rx="2"
                  />
                  <text
                    x="0"
                    y="3"
                    fill="#EF4444"
                    fontSize="8.5"
                    fontWeight="bold"
                    fontFamily="monospace"
                    textAnchor="middle"
                  >
                    RADAR OFFLINE
                  </text>
                </g>
              )}
            </svg>
          </div>

          {/* Scope Perimeter Footer Readout */}
          <div className="w-full flex items-center justify-between text-[9px] text-[#64748B] pt-1.5 border-t border-[#16222F] px-1 font-mono">
            <div className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-[#38BDF8]" />
              <span>SWEEP: <strong className="text-[#94A3B8]">360° CONT</strong></span>
            </div>
            <div className="text-[8px] text-[#475569]">
              {isOffline ? 'SWEEP VISUALIZER ONLY (HW OFFLINE)' : 'LIVE PPI SCAN READY'}
            </div>
            <div>
              <span>PRF: <strong className="text-[#94A3B8]">2.0 kHz</strong></span>
            </div>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* RIGHT: TACTICAL TARGET TRACKING & CLASSIFICATION PANEL (Sec 10-12)         */}
        {/* ========================================================================= */}
        <div className="lg:col-span-5 bg-[#05080C] border border-[#16222F] rounded p-3 space-y-3 font-mono">
          {/* Header Bar */}
          <div className="flex items-center justify-between pb-2 border-b border-[#16222F]">
            <div className="flex items-center gap-1.5">
              <Target className="w-4 h-4 text-[#22C55E]" />
              <h5 className="text-xs font-bold uppercase text-[#FFFFFF] tracking-wider">
                Target Surveillance
              </h5>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-[#8A8A8A]">STATUS:</span>
              <span
                className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                  isConnected
                    ? 'bg-[#061A0C] text-[#22C55E] border-[#1B4D29]'
                    : isStale
                    ? 'bg-[#2A2000] text-[#EAB308] border-[#EAB308]/40'
                    : 'bg-[#181818] text-[#8A8A8A] border-[#333333]'
                }`}
              >
                {getStatusText()}
              </span>
            </div>
          </div>

          {/* Target Count & Selector Ribbon */}
          <div className="p-2 rounded bg-[#020508] border border-[#16222F] flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Eye className="w-3.5 h-3.5 text-[#38BDF8]" />
              <span className="text-[10px] text-[#8A8A8A] uppercase">
                Targets:
              </span>
              <strong className="text-xs text-[#FFFFFF]">
                {candidateTargets.length > 0
                  ? candidateTargets.length
                  : telemetry?.targetCount !== null && telemetry?.targetCount !== undefined
                  ? telemetry.targetCount
                  : '--'}
              </strong>
            </div>

            {candidateTargets.length > 1 && (
              <div className="flex flex-wrap items-center gap-1">
                {candidateTargets.map((t) => {
                  const isSelected = activeTarget?.targetId === t.targetId;
                  return (
                    <button
                      key={`btn-tgt-${t.targetId}`}
                      type="button"
                      onClick={() => setSelectedTargetId(t.targetId)}
                      className={`px-1.5 py-0.5 rounded text-[9px] border transition-colors ${
                        isSelected
                          ? 'bg-[#0EA5E9] text-[#000000] border-[#38BDF8] font-bold'
                          : 'bg-[#0A121A] text-[#94A3B8] border-[#1E293B] hover:text-[#FFFFFF]'
                      }`}
                    >
                      {t.targetId}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Active Target Card / Empty State */}
          {activeTarget ? (
            (() => {
              const isDemo = Boolean((activeTarget as any).isDemo);
              return (
                <div className="p-2.5 rounded bg-[#040A0F] border border-[#1B4D29] space-y-2">
                  {/* Target ID & Classification Banner */}
                  <div className="flex items-center justify-between pb-1.5 border-b border-[#132A1C]">
                    <div className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full animate-pulse bg-[#22C55E]" />
                      <span className="text-xs font-bold text-[#FFFFFF]">
                        {activeTarget.targetId}
                      </span>
                      {!isDemo && (
                        <span className="text-[9px] px-1 rounded border bg-[#0A1F12] text-[#22C55E] border-[#1B4D29]">
                          ACTIVE TRACK
                        </span>
                      )}
                    </div>
                    <div className="text-[9px] text-[#8A8A8A]">
                      {!isDemo && `UPDATED: ${formatTime(activeTarget.lastSeen)}`}
                    </div>
                  </div>

                  {/* Classification Display */}
                  <div className="p-2 rounded bg-[#020609] border border-[#1A2E22] space-y-1">
                    <div className="text-[9px] text-[#8A8A8A] uppercase">CLASSIFICATION:</div>
                    <div className="flex items-center justify-between">
                      <div className="text-xs font-bold">
                        {isDemo ? null : activeTarget.classification ? (
                          <span className="text-[#22C55E]">{activeTarget.classification.toUpperCase()}</span>
                        ) : (
                          <span className="text-[#F59E0B]">UNKNOWN TARGET</span>
                        )}
                      </div>
                      {!isDemo && (
                        <div className="text-[10px]">
                          <span className="text-[#8A8A8A]">CONFIDENCE: </span>
                          <strong className="text-[#FFFFFF]">
                            {activeTarget.classificationConfidence !== null && activeTarget.classificationConfidence !== undefined
                              ? `${(activeTarget.classificationConfidence * 100).toFixed(0)}%`
                              : '--'}
                          </strong>
                        </div>
                      )}
                    </div>
                    <div className="text-[8px] text-[#666666]">
                      {isDemo
                        ? null
                        : activeTarget.classification
                        ? 'VALIDATED CLASSIFIER MODEL OUTPUT'
                        : 'CLASSIFICATION NOT AVAILABLE (NO INFERENCE FROM MOTION)'}
                    </div>
                  </div>

                  {/* Kinematic Measurements Grid */}
                  <div className="grid grid-cols-2 gap-2 text-[10px]">
                    {/* Range */}
                    <div className="p-1.5 rounded bg-[#020508] border border-[#152332]">
                      <div className="text-[9px] text-[#8A8A8A] uppercase">RANGE:</div>
                      <div className="text-sm font-bold text-[#FFFFFF]">
                        {formatNum(activeTarget.rangeM, ' m', 2)}
                      </div>
                      <div className="text-[8px] text-[#666666]">RADIAL DISTANCE</div>
                    </div>

                    {/* Radial Velocity */}
                    <div className="p-1.5 rounded bg-[#020508] border border-[#152332]">
                      <div className="text-[9px] text-[#8A8A8A] uppercase">VELOCITY:</div>
                      <div className="text-sm font-bold text-[#FFFFFF]">
                        {formatNum(activeTarget.radialVelocityMps, ' m/s', 2)}
                      </div>
                      <div className="text-[8px] text-[#666666]">DOPPLER VELOCITY</div>
                    </div>

                    {/* Bearing / Azimuth */}
                    <div className="p-1.5 rounded bg-[#020508] border border-[#152332]">
                      <div className="text-[9px] text-[#8A8A8A] uppercase">BEARING:</div>
                      <div className="text-xs font-bold text-[#FFFFFF]">
                        {activeTarget.azimuthDeg !== null && activeTarget.azimuthDeg !== undefined ? (
                          `${activeTarget.azimuthDeg.toFixed(1)}°`
                        ) : (
                          <span className="text-[#8A8A8A]">NOT AVAILABLE (1D)</span>
                        )}
                      </div>
                      <div className="text-[8px] text-[#666666]">
                        {activeTarget.azimuthDeg !== null ? 'BEARING ANGLE' : 'ISORANGE GATE ACTIVE'}
                      </div>
                    </div>

                    {/* Motion State */}
                    <div className="p-1.5 rounded bg-[#020508] border border-[#152332]">
                      <div className="text-[9px] text-[#8A8A8A] uppercase">MOTION STATE:</div>
                      <div className="text-xs font-bold truncate">
                        {activeTarget.motionState === 'MOTION_DETECTED' ? (
                          <span className="text-[#22C55E]">MOTION DETECTED</span>
                        ) : activeTarget.motionState === 'STATIONARY' ? (
                          <span className="text-[#38BDF8]">STATIONARY</span>
                        ) : (
                          <span className="text-[#8A8A8A]">{activeTarget.motionState ?? '--'}</span>
                        )}
                      </div>
                      <div className="text-[8px] text-[#666666]">DYNAMICS</div>
                    </div>

                    {/* SNR (dB) */}
                    <div className="p-1.5 rounded bg-[#020508] border border-[#152332]">
                      <div className="text-[9px] text-[#8A8A8A] uppercase">SNR:</div>
                      <div className="text-xs font-bold text-[#FFFFFF]">
                        {formatNum(activeTarget.snrDb, ' dB', 1)}
                      </div>
                      <div className="text-[8px] text-[#666666]">SIGNAL QUALITY</div>
                    </div>

                    {/* Tracking State */}
                    <div className="p-1.5 rounded bg-[#020508] border border-[#152332]">
                      <div className="text-[9px] text-[#8A8A8A] uppercase">TRACK STATE:</div>
                      <div className="text-xs font-bold text-[#22C55E]">
                        ACQUIRED
                      </div>
                      <div className="text-[8px] text-[#666666]">
                        LOCKED TRACK
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()
          ) : (
            /* No Target State */
            <div className="p-4 rounded bg-[#030609] border border-[#15202B] text-center space-y-1.5">
              <Shield className="w-6 h-6 mx-auto text-[#475569]" />
              <div className="text-xs font-bold text-[#94A3B8]">NO TARGET DATA</div>
              <p className="text-[10px] text-[#64748B] leading-relaxed max-w-xs mx-auto">
                Radar scope is standing by. Target blips appear strictly when verified hardware telemetry packets are received.
              </p>
            </div>
          )}

          {/* Scientific Disclaimer Card */}
          <div className="p-2 rounded bg-[#040608] border border-[#1A2633] text-[9px] text-[#8A8A8A] space-y-1">
            <div className="flex items-center gap-1.5 text-[#38BDF8]">
              <Info className="w-3.5 h-3.5 shrink-0" />
              <span className="font-bold uppercase">Scientific Accuracy Guarantee</span>
            </div>
            <p className="leading-normal">
              Target positions and classifications are derived purely from validated hardware packets. If radar operates in 1D range-only mode, the scope displays an isorange circle rather than fabricating an artificial bearing.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
