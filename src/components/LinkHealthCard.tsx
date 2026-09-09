/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { useLiveData } from '../context/LiveDataContext.tsx';
import { Wifi, Battery, Percent, Hash, AlertCircle } from 'lucide-react';

export const LinkHealthCard: React.FC = () => {
  const { activeTelemetry, activeNodeId } = useLiveData();

  const rssi = activeTelemetry?.rssi;
  const packetLoss = activeTelemetry?.packetLoss;
  const battery = activeTelemetry?.battery;
  const seq = activeTelemetry?.sequenceNumber;

  const formatRssi = (val: number | null | undefined) => {
    if (val === null || val === undefined) return <span className="text-zinc-600 italic">--</span>;
    return (
      <span className="font-mono text-zinc-100 font-semibold text-lg">
        {val} <span className="text-xs text-zinc-400 font-normal">dBm</span>
      </span>
    );
  };

  const formatLoss = (val: number | null | undefined) => {
    if (val === null || val === undefined) return <span className="text-zinc-600 italic">--</span>;
    return (
      <span className="font-mono text-zinc-100 font-semibold text-lg">
        {val.toFixed(1)} <span className="text-xs text-zinc-400 font-normal">%</span>
      </span>
    );
  };

  const formatBattery = (val: number | null | undefined) => {
    if (val === null || val === undefined) return <span className="text-zinc-600 italic">--</span>;
    return (
      <span className="font-mono text-zinc-100 font-semibold text-lg">
        {val.toFixed(0)} <span className="text-xs text-zinc-400 font-normal">%</span>
      </span>
    );
  };

  return (
    <div className="bg-zinc-900/90 border border-zinc-800 rounded-lg p-3.5 font-mono">
      <div className="flex items-center justify-between pb-2 mb-3 border-b border-zinc-800">
        <div className="flex items-center gap-2">
          <Wifi className="w-4 h-4 text-amber-400" />
          <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-200">
            RF Link & Power Status
          </h3>
        </div>
        <span className="text-[10px] text-zinc-500 uppercase">
          Transport: LoRa / Gateway
        </span>
      </div>

      {!activeNodeId ? (
        <div className="py-6 text-center text-zinc-600 text-xs">
          SELECT NODE TO VIEW LINK HEALTH
        </div>
      ) : !activeTelemetry ? (
        <div className="py-6 text-center text-zinc-600 text-xs flex flex-col items-center gap-1.5">
          <AlertCircle className="w-5 h-5 text-zinc-700" />
          <span>NO TELEMETRY RECEIVED FOR NODE</span>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          {/* RSSI */}
          <div className="bg-zinc-950/70 border border-zinc-800/80 rounded p-2.5">
            <div className="flex items-center justify-between text-zinc-400 text-xs mb-1.5">
              <span className="flex items-center gap-1">
                <Wifi className="w-3.5 h-3.5 text-amber-400" />
                RSSI
              </span>
            </div>
            <div className="text-center py-1">
              {formatRssi(rssi)}
            </div>
            <div className="text-[10px] text-zinc-500 text-center mt-1">
              Signal Strength
            </div>
          </div>

          {/* Packet Loss */}
          <div className="bg-zinc-950/70 border border-zinc-800/80 rounded p-2.5">
            <div className="flex items-center justify-between text-zinc-400 text-xs mb-1.5">
              <span className="flex items-center gap-1">
                <Percent className="w-3.5 h-3.5 text-amber-400" />
                Packet Loss
              </span>
            </div>
            <div className="text-center py-1">
              {formatLoss(packetLoss)}
            </div>
            <div className="text-[10px] text-zinc-500 text-center mt-1">
              Link Quality
            </div>
          </div>

          {/* Battery */}
          <div className="bg-zinc-950/70 border border-zinc-800/80 rounded p-2.5">
            <div className="flex items-center justify-between text-zinc-400 text-xs mb-1.5">
              <span className="flex items-center gap-1">
                <Battery className="w-3.5 h-3.5 text-amber-400" />
                Battery
              </span>
            </div>
            <div className="text-center py-1">
              {formatBattery(battery)}
            </div>
            <div className="text-[10px] text-zinc-500 text-center mt-1">
              Remaining Charge
            </div>
          </div>

          {/* Sequence Number */}
          <div className="bg-zinc-950/70 border border-zinc-800/80 rounded p-2.5">
            <div className="flex items-center justify-between text-zinc-400 text-xs mb-1.5">
              <span className="flex items-center gap-1">
                <Hash className="w-3.5 h-3.5 text-amber-400" />
                Packet Seq
              </span>
            </div>
            <div className="text-center py-1">
              {seq !== null && seq !== undefined ? (
                <span className="font-mono text-zinc-100 font-semibold text-lg">#{seq}</span>
              ) : (
                <span className="text-zinc-600 italic">--</span>
              )}
            </div>
            <div className="text-[10px] text-zinc-500 text-center mt-1">
              HW Packet Index
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
