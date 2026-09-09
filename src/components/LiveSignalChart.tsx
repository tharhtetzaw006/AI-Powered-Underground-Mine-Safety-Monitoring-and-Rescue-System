import React, { useState, useMemo } from 'react';
import { useLiveData } from '../context/LiveDataContext.tsx';
import { SensorTelemetry } from '../types/telemetry.ts';
import { LineChart, Activity, AlertCircle } from 'lucide-react';
import { EmptyState } from './EmptyState.tsx';
import { realTelemetryProcessor } from '../services/realTelemetryProcessor.ts';

type SignalKey =
  | 'ACCEL'
  | 'GYRO'
  | 'ACCEL_MAG'
  | 'GYRO_MAG'
  | 'MOTION_INDEX'
  | 'ACOUSTIC_ACTIVITY'
  | 'DISTANCE'
  | 'SOUND'
  | 'RF_LINK'
  | 'BATTERY';

interface SeriesPoint {
  time: number;
  val: number;
}

export const LiveSignalChart: React.FC<{ id?: string }> = ({ id }) => {
  const { telemetryHistory, activeNodeId } = useLiveData();
  const [selectedSignal, setSelectedSignal] = useState<SignalKey>('ACCEL');
  const [hoveredPoint, setHoveredPoint] = useState<{
    x: number;
    y: number;
    label: string;
    value: string;
  } | null>(null);

  // Filter history for current node, reversed so oldest is left, newest is right
  const nodePackets = useMemo(() => {
    if (!activeNodeId) return [];
    return telemetryHistory
      .filter((p) => p.nodeId === activeNodeId)
      .slice(0, 30)
      .reverse();
  }, [telemetryHistory, activeNodeId]);

  // Extract series based on selected signal
  const { series, unit, minVal, maxVal, hasData } = useMemo(() => {
    if (nodePackets.length === 0) {
      return { series: [], unit: '', minVal: 0, maxVal: 1, hasData: false };
    }

    if (selectedSignal === 'ACCEL') {
      const xPts: SeriesPoint[] = [];
      const yPts: SeriesPoint[] = [];
      const zPts: SeriesPoint[] = [];

      nodePackets.forEach((p) => {
        if (p.acceleration) {
          if (p.acceleration.x !== null) xPts.push({ time: p.serverReceiveTime, val: p.acceleration.x });
          if (p.acceleration.y !== null) yPts.push({ time: p.serverReceiveTime, val: p.acceleration.y });
          if (p.acceleration.z !== null) zPts.push({ time: p.serverReceiveTime, val: p.acceleration.z });
        }
      });

      const allVals = [...xPts, ...yPts, ...zPts].map((pt) => pt.val);
      const hasAny = allVals.length > 0;
      const min = hasAny ? Math.min(-15, Math.floor(Math.min(...allVals) - 2)) : -15;
      const max = hasAny ? Math.max(15, Math.ceil(Math.max(...allVals) + 2)) : 15;

      return {
        series: [
          { name: 'X-Axis', color: '#38BDF8', data: xPts },
          { name: 'Y-Axis', color: '#22C55E', data: yPts },
          { name: 'Z-Axis', color: '#F59E0B', data: zPts },
        ],
        unit: 'm/s²',
        minVal: min,
        maxVal: max,
        hasData: hasAny,
      };
    }

    if (selectedSignal === 'GYRO') {
      const xPts: SeriesPoint[] = [];
      const yPts: SeriesPoint[] = [];
      const zPts: SeriesPoint[] = [];

      nodePackets.forEach((p) => {
        if (p.gyroscope) {
          if (p.gyroscope.x !== null) xPts.push({ time: p.serverReceiveTime, val: p.gyroscope.x });
          if (p.gyroscope.y !== null) yPts.push({ time: p.serverReceiveTime, val: p.gyroscope.y });
          if (p.gyroscope.z !== null) zPts.push({ time: p.serverReceiveTime, val: p.gyroscope.z });
        }
      });

      const allVals = [...xPts, ...yPts, ...zPts].map((pt) => pt.val);
      const hasAny = allVals.length > 0;
      const min = hasAny ? Math.min(-50, Math.floor(Math.min(...allVals) - 10)) : -50;
      const max = hasAny ? Math.max(50, Math.ceil(Math.max(...allVals) + 10)) : 50;

      return {
        series: [
          { name: 'Roll (X)', color: '#38BDF8', data: xPts },
          { name: 'Pitch (Y)', color: '#22C55E', data: yPts },
          { name: 'Yaw (Z)', color: '#F59E0B', data: zPts },
        ],
        unit: '°/s',
        minVal: min,
        maxVal: max,
        hasData: hasAny,
      };
    }

    if (selectedSignal === 'DISTANCE') {
      const pts: SeriesPoint[] = [];
      nodePackets.forEach((p) => {
        if (p.distance !== null) pts.push({ time: p.serverReceiveTime, val: p.distance });
      });
      const allVals = pts.map((pt) => pt.val);
      const hasAny = allVals.length > 0;
      const min = 0;
      const max = hasAny ? Math.max(10, Math.ceil(Math.max(...allVals) + 2)) : 10;

      return {
        series: [{ name: 'Distance', color: '#38BDF8', data: pts }],
        unit: 'm',
        minVal: min,
        maxVal: max,
        hasData: hasAny,
      };
    }

    if (selectedSignal === 'SOUND') {
      const pts: SeriesPoint[] = [];
      nodePackets.forEach((p) => {
        if (p.soundLevel !== null) pts.push({ time: p.serverReceiveTime, val: p.soundLevel });
      });
      const allVals = pts.map((pt) => pt.val);
      const hasAny = allVals.length > 0;
      const min = 30;
      const max = hasAny ? Math.max(120, Math.ceil(Math.max(...allVals) + 10)) : 120;

      return {
        series: [{ name: 'Sound Level', color: '#F59E0B', data: pts }],
        unit: 'dB SPL',
        minVal: min,
        maxVal: max,
        hasData: hasAny,
      };
    }

    if (selectedSignal === 'RF_LINK') {
      const rssiPts: SeriesPoint[] = [];
      nodePackets.forEach((p) => {
        if (p.rssi !== null) rssiPts.push({ time: p.serverReceiveTime, val: p.rssi });
      });
      const allVals = rssiPts.map((pt) => pt.val);
      const hasAny = allVals.length > 0;
      const min = -130;
      const max = -30;

      return {
        series: [{ name: 'RSSI', color: '#22C55E', data: rssiPts }],
        unit: 'dBm',
        minVal: min,
        maxVal: max,
        hasData: hasAny,
      };
    }

    if (selectedSignal === 'ACCEL_MAG') {
      const pts: SeriesPoint[] = [];
      nodePackets.forEach((p) => {
        const mag = realTelemetryProcessor.calculateVectorMagnitude(p.acceleration);
        if (mag !== null) pts.push({ time: p.serverReceiveTime, val: mag });
      });
      const allVals = pts.map((pt) => pt.val);
      const hasAny = allVals.length > 0;
      const min = 0;
      const max = hasAny ? Math.max(16, Math.ceil(Math.max(...allVals) + 2)) : 16;

      return {
        series: [{ name: 'Accel Magnitude', color: '#38BDF8', data: pts }],
        unit: 'm/s²',
        minVal: min,
        maxVal: max,
        hasData: hasAny,
      };
    }

    if (selectedSignal === 'GYRO_MAG') {
      const pts: SeriesPoint[] = [];
      nodePackets.forEach((p) => {
        const mag = realTelemetryProcessor.calculateVectorMagnitude(p.gyroscope);
        if (mag !== null) pts.push({ time: p.serverReceiveTime, val: mag });
      });
      const allVals = pts.map((pt) => pt.val);
      const hasAny = allVals.length > 0;
      const min = 0;
      const max = hasAny ? Math.max(60, Math.ceil(Math.max(...allVals) + 10)) : 60;

      return {
        series: [{ name: 'Gyro Magnitude', color: '#22C55E', data: pts }],
        unit: '°/s',
        minVal: min,
        maxVal: max,
        hasData: hasAny,
      };
    }

    if (selectedSignal === 'MOTION_INDEX') {
      const pts: SeriesPoint[] = [];
      nodePackets.forEach((p) => {
        const aM = realTelemetryProcessor.calculateVectorMagnitude(p.acceleration);
        const gM = realTelemetryProcessor.calculateVectorMagnitude(p.gyroscope);
        const mi = realTelemetryProcessor.calculateMotionIndex(aM, gM);
        if (mi !== null) pts.push({ time: p.serverReceiveTime, val: mi });
      });
      const allVals = pts.map((pt) => pt.val);
      const hasAny = allVals.length > 0;
      const min = 0;
      const max = hasAny ? Math.max(5, Math.ceil(Math.max(...allVals) + 1)) : 5;

      return {
        series: [{ name: 'Motion Index', color: '#F59E0B', data: pts }],
        unit: 'idx',
        minVal: min,
        maxVal: max,
        hasData: hasAny,
      };
    }

    if (selectedSignal === 'ACOUSTIC_ACTIVITY') {
      const currentPts: SeriesPoint[] = [];
      const meanPts: SeriesPoint[] = [];
      const windowBuf: number[] = [];

      nodePackets.forEach((p) => {
        if (typeof p.soundLevel === 'number' && Number.isFinite(p.soundLevel)) {
          windowBuf.push(p.soundLevel);
          if (windowBuf.length > 10) windowBuf.shift();
          currentPts.push({ time: p.serverReceiveTime, val: p.soundLevel });
          const sum = windowBuf.reduce((a, b) => a + b, 0);
          meanPts.push({ time: p.serverReceiveTime, val: Number((sum / windowBuf.length).toFixed(1)) });
        }
      });

      const allVals = [...currentPts, ...meanPts].map((pt) => pt.val);
      const hasAny = allVals.length > 0;
      const min = 30;
      const max = hasAny ? Math.max(110, Math.ceil(Math.max(...allVals) + 10)) : 110;

      return {
        series: [
          { name: 'Sound Level', color: '#F59E0B', data: currentPts },
          { name: 'Rolling Mean', color: '#38BDF8', data: meanPts },
        ],
        unit: 'dB SPL',
        minVal: min,
        maxVal: max,
        hasData: hasAny,
      };
    }

    if (selectedSignal === 'BATTERY') {
      const pts: SeriesPoint[] = [];
      nodePackets.forEach((p) => {
        if (p.battery !== null) pts.push({ time: p.serverReceiveTime, val: p.battery });
      });
      const allVals = pts.map((pt) => pt.val);
      const hasAny = allVals.length > 0;

      return {
        series: [{ name: 'Battery Reserve', color: '#38BDF8', data: pts }],
        unit: '%',
        minVal: 0,
        maxVal: 100,
        hasData: hasAny,
      };
    }

    return { series: [], unit: '', minVal: 0, maxVal: 1, hasData: false };
  }, [nodePackets, selectedSignal]);

  // SVG dimensions
  const svgWidth = 600;
  const svgHeight = 160;
  const padLeft = 45;
  const padRight = 15;
  const padTop = 15;
  const padBottom = 25;

  const chartW = svgWidth - padLeft - padRight;
  const chartH = svgHeight - padTop - padBottom;

  const getY = (val: number) => {
    const range = maxVal - minVal || 1;
    const clamped = Math.max(minVal, Math.min(maxVal, val));
    const normalized = (clamped - minVal) / range;
    return padTop + chartH - normalized * chartH;
  };

  const midVal = (maxVal + minVal) / 2;

  return (
    <div id={id} className="border border-[#222222] bg-[#080808] rounded p-3.5 font-mono">
      {/* Top Header Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2.5 mb-3 border-b border-[#222222]">
        <div className="flex items-center gap-2">
          <LineChart className="w-4 h-4 text-[#38BDF8]" />
          <h3 className="text-xs font-bold uppercase tracking-wider text-[#FFFFFF]">
            Live Signal Telemetry Stream
          </h3>
          {activeNodeId && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#0D0D0D] border border-[#222222] text-[#B3B3B3]">
              {activeNodeId}
            </span>
          )}
        </div>

        {/* Signal Selector Pills */}
        <div className="flex flex-wrap gap-1">
          {(
            [
              { key: 'ACCEL', label: 'ACCEL (3X)' },
              { key: 'ACCEL_MAG', label: '|ACCEL|' },
              { key: 'GYRO', label: 'GYRO (3X)' },
              { key: 'GYRO_MAG', label: '|GYRO|' },
              { key: 'MOTION_INDEX', label: 'MOTION IDX' },
              { key: 'ACOUSTIC_ACTIVITY', label: 'ACOUSTIC' },
              { key: 'DISTANCE', label: 'DIST' },
              { key: 'RF_LINK', label: 'RSSI' },
              { key: 'BATTERY', label: 'BATT' },
            ] as const
          ).map((sig) => (
            <button
              key={sig.key}
              type="button"
              onClick={() => setSelectedSignal(sig.key)}
              className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border transition-colors ${
                selectedSignal === sig.key
                  ? 'bg-[#38BDF8]/20 border-[#38BDF8] text-[#38BDF8]'
                  : 'bg-[#0D0D0D] border-[#222222] text-[#B3B3B3] hover:text-[#FFFFFF]'
              }`}
            >
              {sig.label}
            </button>
          ))}
        </div>
      </div>

      {/* Chart Canvas or Empty State */}
      {!hasData ? (
        <EmptyState
          icon={AlertCircle}
          title="NO DATA AVAILABLE"
          message={`No valid ${selectedSignal} measurements have been received for this node in the active telemetry buffer.`}
          secondaryNote="Updates only when real incoming hardware packets include this sensor"
          compact
        />
      ) : (
        <div className="relative">
          {/* Legend and Unit */}
          <div className="flex items-center justify-between text-[11px] mb-2 px-1">
            <div className="flex items-center gap-3">
              {series.map((s) => (
                <div key={s.name} className="flex items-center gap-1.5">
                  <span
                    className="w-2.5 h-1 rounded"
                    style={{ backgroundColor: s.color }}
                  />
                  <span className="text-[#B3B3B3]">{s.name}</span>
                  {s.data.length > 0 && (
                    <span className="text-[#FFFFFF] font-semibold">
                      {s.data[s.data.length - 1].val.toFixed(1)} {unit}
                    </span>
                  )}
                </div>
              ))}
            </div>
            <span className="text-[10px] text-[#8A8A8A] uppercase">
              REAL HARDWARE SAMPLES: {nodePackets.length}
            </span>
          </div>

          {/* SVG Line Graph */}
          <div className="w-full overflow-hidden bg-[#000000] border border-[#222222] rounded">
            <svg
              viewBox={`0 0 ${svgWidth} ${svgHeight}`}
              className="w-full h-40 select-none block"
            >
              {/* Horizontal Gridlines */}
              <line
                x1={padLeft}
                y1={padTop}
                x2={svgWidth - padRight}
                y2={padTop}
                stroke="#222222"
                strokeDasharray="2,2"
              />
              <line
                x1={padLeft}
                y1={padTop + chartH / 2}
                x2={svgWidth - padRight}
                y2={padTop + chartH / 2}
                stroke="#222222"
                strokeDasharray="2,2"
              />
              <line
                x1={padLeft}
                y1={padTop + chartH}
                x2={svgWidth - padRight}
                y2={padTop + chartH}
                stroke="#222222"
              />

              {/* Y-Axis Labels */}
              <text
                x={padLeft - 6}
                y={padTop + 4}
                textAnchor="end"
                className="fill-[#8A8A8A] text-[10px] font-mono"
              >
                {maxVal.toFixed(0)}
              </text>
              <text
                x={padLeft - 6}
                y={padTop + chartH / 2 + 3}
                textAnchor="end"
                className="fill-[#8A8A8A] text-[10px] font-mono"
              >
                {midVal.toFixed(0)}
              </text>
              <text
                x={padLeft - 6}
                y={padTop + chartH}
                textAnchor="end"
                className="fill-[#8A8A8A] text-[10px] font-mono"
              >
                {minVal.toFixed(0)}
              </text>

              {/* Plotted Series Lines */}
              {series.map((s) => {
                if (s.data.length === 0) return null;

                const ptsString = s.data
                  .map((pt, idx) => {
                    const x =
                      padLeft +
                      (s.data.length > 1
                        ? (idx / (s.data.length - 1)) * chartW
                        : chartW / 2);
                    const y = getY(pt.val);
                    return `${x},${y}`;
                  })
                  .join(' ');

                return (
                  <g key={s.name}>
                    <polyline
                      fill="none"
                      stroke={s.color}
                      strokeWidth="1.75"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      points={ptsString}
                    />
                    {s.data.map((pt, idx) => {
                      const x =
                        padLeft +
                        (s.data.length > 1
                          ? (idx / (s.data.length - 1)) * chartW
                          : chartW / 2);
                      const y = getY(pt.val);
                      return (
                        <circle
                          key={idx}
                          cx={x}
                          cy={y}
                          r="2.5"
                          fill={s.color}
                          className="cursor-pointer"
                          onMouseEnter={() =>
                            setHoveredPoint({
                              x,
                              y,
                              label: s.name,
                              value: `${pt.val.toFixed(2)} ${unit}`,
                            })
                          }
                          onMouseLeave={() => setHoveredPoint(null)}
                        />
                      );
                    })}
                  </g>
                );
              })}

              {/* Time Label on Bottom Axis */}
              <text
                x={padLeft}
                y={svgHeight - 6}
                className="fill-[#8A8A8A] text-[9px] font-mono"
              >
                OLDEST
              </text>
              <text
                x={svgWidth - padRight}
                y={svgHeight - 6}
                textAnchor="end"
                className="fill-[#8A8A8A] text-[9px] font-mono"
              >
                LATEST REAL PACKET
              </text>
            </svg>

            {/* Hover Tooltip */}
            {hoveredPoint && (
              <div
                className="absolute pointer-events-none px-2 py-1 bg-[#0D0D0D] border border-[#222222] text-[#FFFFFF] text-[10px] rounded shadow"
                style={{
                  left: `${(hoveredPoint.x / svgWidth) * 100}%`,
                  top: `${hoveredPoint.y - 30}px`,
                  transform: 'translateX(-50%)',
                }}
              >
                <span className="text-[#B3B3B3]">{hoveredPoint.label}: </span>
                <span className="font-bold text-[#38BDF8]">
                  {hoveredPoint.value}
                </span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
