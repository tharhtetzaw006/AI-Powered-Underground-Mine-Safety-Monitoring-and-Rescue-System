import React from 'react';
import { useLiveData } from '../context/LiveDataContext.tsx';
import { Users, Crosshair, ShieldCheck, Activity, MapPin, Clock } from 'lucide-react';
import { StatusBadge } from './StatusBadge.tsx';

interface DetectionSummaryProps {
  id?: string;
}

export const DetectionSummary: React.FC<DetectionSummaryProps> = ({ id }) => {
  const { activeTelemetry, activeNodeId } = useLiveData();

  // Check if real hardware telemetry contains actual detection fields
  const rawData = activeTelemetry as unknown as Record<string, unknown> | null;
  const detectionObj = (rawData?.detection && typeof rawData.detection === 'object'
    ? rawData.detection
    : null) as Record<string, unknown> | null;

  const subjectCount =
    detectionObj?.count !== undefined && detectionObj?.count !== null
      ? String(detectionObj.count)
      : rawData?.subjectCount !== undefined && rawData?.subjectCount !== null
      ? String(rawData.subjectCount)
      : null;

  const activityState =
    detectionObj?.activity !== undefined && detectionObj?.activity !== null
      ? String(detectionObj.activity)
      : rawData?.activityState !== undefined && rawData?.activityState !== null
      ? String(rawData.activityState)
      : null;

  const confidence =
    detectionObj?.confidence !== undefined && detectionObj?.confidence !== null
      ? `${Number(detectionObj.confidence).toFixed(1)}%`
      : rawData?.confidence !== undefined && rawData?.confidence !== null
      ? `${Number(rawData.confidence).toFixed(1)}%`
      : null;

  const detectionZone =
    detectionObj?.zone !== undefined && detectionObj?.zone !== null
      ? String(detectionObj.zone)
      : rawData?.detectionZone !== undefined && rawData?.detectionZone !== null
      ? String(rawData.detectionZone)
      : null;

  const lastDetectionTime =
    detectionObj?.timestamp !== undefined && detectionObj?.timestamp !== null
      ? new Date(Number(detectionObj.timestamp)).toLocaleTimeString(undefined, {
          hour12: false,
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        })
      : rawData?.lastDetectionTime !== undefined && rawData?.lastDetectionTime !== null
      ? new Date(Number(rawData.lastDetectionTime)).toLocaleTimeString(undefined, {
          hour12: false,
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        })
      : null;

  const hasAnyDetection = subjectCount !== null || activityState !== null || confidence !== null;

  return (
    <div
      id={id}
      className="border border-[#222222] bg-[#080808] rounded p-3.5 font-mono"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2.5 mb-3 border-b border-[#222222]">
        <div className="flex items-center gap-2">
          <Crosshair className="w-4 h-4 text-[#38BDF8]" />
          <h3 className="text-xs font-bold uppercase tracking-wider text-[#FFFFFF]">
            Live Detection Summary
          </h3>
          <span className="text-[10px] text-[#8A8A8A]">
            TARGET IDENTIFICATION CLASSIFIER
          </span>
        </div>

        <StatusBadge
          status={hasAnyDetection ? 'ACTIVE' : 'NO DATA'}
          label={hasAnyDetection ? 'TARGET CLASSIFIED' : 'NO DETECTION DATA'}
          size="xs"
        />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
        {/* Detected Subject Count */}
        <div className="p-2.5 rounded bg-[#0D0D0D] border border-[#222222]">
          <div className="flex items-center gap-1.5 text-[10px] text-[#B3B3B3] uppercase">
            <Users className="w-3.5 h-3.5 text-[#38BDF8]" />
            <span>Subject Count</span>
          </div>
          <div className="mt-1.5 text-base sm:text-lg font-bold">
            {subjectCount !== null ? (
              <span className="text-[#22C55E]">{subjectCount}</span>
            ) : (
              <span className="text-[#8A8A8A] text-sm">NO DATA</span>
            )}
          </div>
          <div className="text-[9px] text-[#8A8A8A] mt-0.5">ACOUSTIC/IMU INFERENCE</div>
        </div>

        {/* Activity State */}
        <div className="p-2.5 rounded bg-[#0D0D0D] border border-[#222222]">
          <div className="flex items-center gap-1.5 text-[10px] text-[#B3B3B3] uppercase">
            <Activity className="w-3.5 h-3.5 text-[#38BDF8]" />
            <span>Activity State</span>
          </div>
          <div className="mt-1.5 text-base sm:text-lg font-bold">
            {activityState !== null ? (
              <span className="text-[#38BDF8]">{activityState}</span>
            ) : (
              <span className="text-[#8A8A8A] text-sm">NO DATA</span>
            )}
          </div>
          <div className="text-[9px] text-[#8A8A8A] mt-0.5">MOTION PROFILE</div>
        </div>

        {/* Confidence */}
        <div className="p-2.5 rounded bg-[#0D0D0D] border border-[#222222]">
          <div className="flex items-center gap-1.5 text-[10px] text-[#B3B3B3] uppercase">
            <ShieldCheck className="w-3.5 h-3.5 text-[#38BDF8]" />
            <span>Confidence</span>
          </div>
          <div className="mt-1.5 text-base sm:text-lg font-bold">
            {confidence !== null ? (
              <span className="text-[#22C55E]">{confidence}</span>
            ) : (
              <span className="text-[#8A8A8A] text-sm">NO DATA</span>
            )}
          </div>
          <div className="text-[9px] text-[#8A8A8A] mt-0.5">MODEL PROBABILITY</div>
        </div>

        {/* Detection Zone */}
        <div className="p-2.5 rounded bg-[#0D0D0D] border border-[#222222]">
          <div className="flex items-center gap-1.5 text-[10px] text-[#B3B3B3] uppercase">
            <MapPin className="w-3.5 h-3.5 text-[#38BDF8]" />
            <span>Detection Zone</span>
          </div>
          <div className="mt-1.5 text-base sm:text-lg font-bold">
            {detectionZone !== null ? (
              <span className="text-[#FFFFFF]">{detectionZone}</span>
            ) : (
              <span className="text-[#8A8A8A] text-sm">NO DATA</span>
            )}
          </div>
          <div className="text-[9px] text-[#8A8A8A] mt-0.5">SPATIAL SECTOR</div>
        </div>

        {/* Last Detection Time */}
        <div className="p-2.5 rounded bg-[#0D0D0D] border border-[#222222] col-span-2 sm:col-span-1">
          <div className="flex items-center gap-1.5 text-[10px] text-[#B3B3B3] uppercase">
            <Clock className="w-3.5 h-3.5 text-[#38BDF8]" />
            <span>Last Detection</span>
          </div>
          <div className="mt-1.5 text-base sm:text-lg font-bold">
            {lastDetectionTime !== null ? (
              <span className="text-[#FFFFFF]">{lastDetectionTime}</span>
            ) : (
              <span className="text-[#8A8A8A] text-sm">NO DATA</span>
            )}
          </div>
          <div className="text-[9px] text-[#8A8A8A] mt-0.5">TIMESTAMP RECENCY</div>
        </div>
      </div>
    </div>
  );
};
