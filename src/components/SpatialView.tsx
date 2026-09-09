import React from 'react';
import { useLiveData } from '../context/LiveDataContext.tsx';
import { Compass, Scan, AlertCircle } from 'lucide-react';
import { StatusBadge } from './StatusBadge.tsx';

interface SpatialViewProps {
  id?: string;
}

export const SpatialView: React.FC<SpatialViewProps> = ({ id }) => {
  const { activeTelemetry, activeNodeId } = useLiveData();

  const rawData = activeTelemetry as unknown as Record<string, unknown> | null;
  const spatialPoints = (rawData?.spatialPoints ?? rawData?.pointCloud) as unknown[] | null;
  const hasSpatialData = Array.isArray(spatialPoints) && spatialPoints.length > 0;

  const distance = activeTelemetry?.distance;

  return (
    <div
      id={id}
      className="border border-[#222222] bg-[#080808] rounded p-3.5 font-mono"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2.5 mb-3 border-b border-[#222222]">
        <div className="flex items-center gap-2">
          <Compass className="w-4 h-4 text-[#38BDF8]" />
          <h3 className="text-xs font-bold uppercase tracking-wider text-[#FFFFFF]">
            Spatial & Proximity Environment
          </h3>
          {activeNodeId && (
            <span className="text-[10px] text-[#8A8A8A]">
              NODE: {activeNodeId}
            </span>
          )}
        </div>

        <StatusBadge
          status={hasSpatialData ? 'ONLINE' : 'NO DATA'}
          label={hasSpatialData ? 'POINT CLOUD MAPPED' : 'NO SPATIAL DATA'}
          size="xs"
        />
      </div>

      {/* Radar Range Canvas Display */}
      <div className="relative aspect-video w-full max-w-2xl mx-auto rounded border border-[#222222] bg-[#000000] flex flex-col items-center justify-center p-6 text-center overflow-hidden">
        {/* Concentric distance coordinate rings */}
        <svg
          viewBox="0 0 400 240"
          className="absolute inset-0 w-full h-full pointer-events-none opacity-30"
        >
          <line x1="200" y1="0" x2="200" y2="240" stroke="#222222" strokeWidth="1" />
          <line x1="0" y1="120" x2="400" y2="120" stroke="#222222" strokeWidth="1" />
          <circle cx="200" cy="120" r="40" fill="none" stroke="#222222" strokeWidth="1" />
          <circle cx="200" cy="120" r="80" fill="none" stroke="#222222" strokeWidth="1" />
          <circle cx="200" cy="120" r="110" fill="none" stroke="#222222" strokeWidth="1" strokeDasharray="3,3" />
          {/* Node origin point */}
          <circle cx="200" cy="120" r="3.5" fill="#38BDF8" />
        </svg>

        {/* Empty state or real spatial summary */}
        {!hasSpatialData ? (
          <div className="relative z-10 flex flex-col items-center">
            <div className="w-10 h-10 rounded border border-[#222222] bg-[#0D0D0D] flex items-center justify-center text-[#B3B3B3] mb-3">
              <Scan className="w-5 h-5 text-[#B3B3B3]" />
            </div>
            <div className="text-sm font-bold tracking-wider text-[#FFFFFF] uppercase">
              NO SPATIAL DATA
            </div>
            <p className="text-xs text-[#B3B3B3] mt-1.5 max-w-sm">
              Awaiting 2D/3D coordinate localization or LiDAR point-cloud vectors from rescue field telemetry.
            </p>

            <div className="mt-4 flex flex-wrap items-center justify-center gap-2 text-[10px]">
              <span className="px-2.5 py-1 rounded bg-[#0D0D0D] border border-[#222222] text-[#B3B3B3]">
                RADIAL PROXIMITY:{' '}
                {distance !== null && distance !== undefined ? (
                  <strong className="text-[#38BDF8]">{distance.toFixed(2)} m</strong>
                ) : (
                  <span className="text-[#8A8A8A]">--</span>
                )}
              </span>
              <span className="px-2.5 py-1 rounded bg-[#0D0D0D] border border-[#222222] text-[#8A8A8A]">
                SLAM MATRIX: UNINITIALIZED
              </span>
            </div>
          </div>
        ) : (
          <div className="relative z-10 text-xs text-[#38BDF8]">
            Point cloud telemetry stream active ({spatialPoints.length} points)
          </div>
        )}

        <div className="absolute top-2 left-2 text-[9px] text-[#8A8A8A]">
          ORIGIN: [0.00, 0.00, 0.00]
        </div>
        <div className="absolute bottom-2 right-2 text-[9px] text-[#8A8A8A]">
          RANGE LIMIT: 50.0m
        </div>
      </div>
    </div>
  );
};
