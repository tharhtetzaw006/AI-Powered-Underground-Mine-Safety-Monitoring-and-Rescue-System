/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { useLiveData } from '../context/LiveDataContext.tsx';
import { Compass, Gauge, AlertCircle } from 'lucide-react';

export const ImuTelemetryCard: React.FC = () => {
  const { activeTelemetry, activeNodeId } = useLiveData();

  const acc = activeTelemetry?.acceleration;
  const gyro = activeTelemetry?.gyroscope;

  const formatValue = (val: number | null | undefined, unit: string) => {
    if (val === null || val === undefined) {
      return (
        <span className="text-zinc-600 font-mono italic">
          --
        </span>
      );
    }
    return (
      <span className="font-mono text-zinc-100 font-semibold">
        {val >= 0 ? `+${val.toFixed(2)}` : val.toFixed(2)}{' '}
        <span className="text-xs text-zinc-400 font-normal">{unit}</span>
      </span>
    );
  };

  const hasAccData = acc && (acc.x !== null || acc.y !== null || acc.z !== null);
  const hasGyroData = gyro && (gyro.x !== null || gyro.y !== null || gyro.z !== null);

  return (
    <div className="bg-zinc-900/90 border border-zinc-800 rounded-lg p-3.5 font-mono">
      <div className="flex items-center justify-between pb-2 mb-3 border-b border-zinc-800">
        <div className="flex items-center gap-2">
          <Compass className="w-4 h-4 text-amber-400" />
          <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-200">
            Inertial Measurement Unit (IMU)
          </h3>
        </div>
        <span className="text-[10px] text-zinc-500 uppercase">
          Units: m/s² | °/s
        </span>
      </div>

      {!activeNodeId ? (
        <div className="py-6 text-center text-zinc-600 text-xs">
          SELECT NODE TO VIEW IMU DATA
        </div>
      ) : !activeTelemetry ? (
        <div className="py-6 text-center text-zinc-600 text-xs flex flex-col items-center gap-1.5">
          <AlertCircle className="w-5 h-5 text-zinc-700" />
          <span>NO TELEMETRY RECEIVED FOR NODE</span>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {/* Acceleration Block */}
          <div className="bg-zinc-950/70 border border-zinc-800/80 rounded p-2.5">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-zinc-400 font-semibold flex items-center gap-1.5">
                <Gauge className="w-3.5 h-3.5 text-amber-400" />
                Acceleration
              </span>
              {!hasAccData && (
                <span className="text-[10px] text-zinc-500 bg-zinc-900 px-1.5 py-0.5 rounded border border-zinc-800">
                  NO DATA
                </span>
              )}
            </div>

            <div className="space-y-1.5 text-xs">
              <div className="flex items-center justify-between bg-zinc-900/60 px-2 py-1 rounded">
                <span className="text-zinc-500 font-medium">Axis X:</span>
                {formatValue(acc?.x, 'm/s²')}
              </div>
              <div className="flex items-center justify-between bg-zinc-900/60 px-2 py-1 rounded">
                <span className="text-zinc-500 font-medium">Axis Y:</span>
                {formatValue(acc?.y, 'm/s²')}
              </div>
              <div className="flex items-center justify-between bg-zinc-900/60 px-2 py-1 rounded">
                <span className="text-zinc-500 font-medium">Axis Z:</span>
                {formatValue(acc?.z, 'm/s²')}
              </div>
            </div>
          </div>

          {/* Gyroscope Block */}
          <div className="bg-zinc-950/70 border border-zinc-800/80 rounded p-2.5">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-zinc-400 font-semibold flex items-center gap-1.5">
                <Compass className="w-3.5 h-3.5 text-amber-400" />
                Angular Velocity (Gyro)
              </span>
              {!hasGyroData && (
                <span className="text-[10px] text-zinc-500 bg-zinc-900 px-1.5 py-0.5 rounded border border-zinc-800">
                  NO DATA
                </span>
              )}
            </div>

            <div className="space-y-1.5 text-xs">
              <div className="flex items-center justify-between bg-zinc-900/60 px-2 py-1 rounded">
                <span className="text-zinc-500 font-medium">Roll (X):</span>
                {formatValue(gyro?.x, '°/s')}
              </div>
              <div className="flex items-center justify-between bg-zinc-900/60 px-2 py-1 rounded">
                <span className="text-zinc-500 font-medium">Pitch (Y):</span>
                {formatValue(gyro?.y, '°/s')}
              </div>
              <div className="flex items-center justify-between bg-zinc-900/60 px-2 py-1 rounded">
                <span className="text-zinc-500 font-medium">Yaw (Z):</span>
                {formatValue(gyro?.z, '°/s')}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
