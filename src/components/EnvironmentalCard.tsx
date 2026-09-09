/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { useLiveData } from '../context/LiveDataContext.tsx';
import { Ruler, Volume2, AlertCircle } from 'lucide-react';

export const EnvironmentalCard: React.FC = () => {
  const { activeTelemetry, activeNodeId } = useLiveData();

  const distance = activeTelemetry?.distance;
  const soundLevel = activeTelemetry?.soundLevel;

  const formatDistance = (val: number | null | undefined) => {
    if (val === null || val === undefined) {
      return <span className="text-zinc-600 italic">--</span>;
    }
    return (
      <span className="font-mono text-zinc-100 font-semibold text-lg">
        {val.toFixed(2)} <span className="text-xs text-zinc-400 font-normal">m</span>
      </span>
    );
  };

  const formatSound = (val: number | null | undefined) => {
    if (val === null || val === undefined) {
      return <span className="text-zinc-600 italic">--</span>;
    }
    return (
      <span className="font-mono text-zinc-100 font-semibold text-lg">
        {val.toFixed(1)} <span className="text-xs text-zinc-400 font-normal">dB SPL</span>
      </span>
    );
  };

  return (
    <div className="bg-zinc-900/90 border border-zinc-800 rounded-lg p-3.5 font-mono">
      <div className="flex items-center justify-between pb-2 mb-3 border-b border-zinc-800">
        <div className="flex items-center gap-2">
          <Ruler className="w-4 h-4 text-amber-400" />
          <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-200">
            Proximity & Acoustic Sensing
          </h3>
        </div>
        <span className="text-[10px] text-zinc-500 uppercase">
          Units: m | dB SPL
        </span>
      </div>

      {!activeNodeId ? (
        <div className="py-6 text-center text-zinc-600 text-xs">
          SELECT NODE TO VIEW SENSOR READINGS
        </div>
      ) : !activeTelemetry ? (
        <div className="py-6 text-center text-zinc-600 text-xs flex flex-col items-center gap-1.5">
          <AlertCircle className="w-5 h-5 text-zinc-700" />
          <span>NO TELEMETRY RECEIVED FOR NODE</span>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* Distance Sensor Block */}
          <div className="bg-zinc-950/70 border border-zinc-800/80 rounded p-3 flex flex-col justify-between">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-zinc-400 font-semibold flex items-center gap-1.5">
                <Ruler className="w-3.5 h-3.5 text-amber-400" />
                Clearance / Distance
              </span>
              {distance === null || distance === undefined ? (
                <span className="text-[10px] text-zinc-500 bg-zinc-900 px-1.5 py-0.5 rounded border border-zinc-800">
                  NO DATA
                </span>
              ) : (
                <span className="text-[10px] text-emerald-400 bg-emerald-950/80 px-1.5 py-0.5 rounded border border-emerald-800/80">
                  ACTIVE
                </span>
              )}
            </div>

            <div className="my-2 text-center py-2 bg-zinc-900/50 rounded border border-zinc-800/40">
              {formatDistance(distance)}
            </div>

            <div className="text-[10px] text-zinc-500 flex justify-between">
              <span>Sensor: Ultrasonic / LiDAR</span>
              <span>Range: 0.00 - 50.00 m</span>
            </div>
          </div>

          {/* Sound Level Sensor Block */}
          <div className="bg-zinc-950/70 border border-zinc-800/80 rounded p-3 flex flex-col justify-between">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-zinc-400 font-semibold flex items-center gap-1.5">
                <Volume2 className="w-3.5 h-3.5 text-amber-400" />
                Sound Pressure Level
              </span>
              {soundLevel === null || soundLevel === undefined ? (
                <span className="text-[10px] text-zinc-500 bg-zinc-900 px-1.5 py-0.5 rounded border border-zinc-800">
                  NO DATA
                </span>
              ) : (
                <span className="text-[10px] text-emerald-400 bg-emerald-950/80 px-1.5 py-0.5 rounded border border-emerald-800/80">
                  ACTIVE
                </span>
              )}
            </div>

            <div className="my-2 text-center py-2 bg-zinc-900/50 rounded border border-zinc-800/40">
              {formatSound(soundLevel)}
            </div>

            <div className="text-[10px] text-zinc-500 flex justify-between">
              <span>Acoustic Mic: Hydro/Air SPL</span>
              <span>Nominal: &lt; 85 dB</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
