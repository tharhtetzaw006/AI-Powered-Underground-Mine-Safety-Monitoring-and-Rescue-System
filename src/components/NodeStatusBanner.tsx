import React from 'react';
import { useLiveData } from '../context/LiveDataContext.tsx';
import { AlertTriangle, Clock, Activity, Cpu, WifiOff } from 'lucide-react';
import { StatusBadge } from './StatusBadge.tsx';
import { SubsystemHealth } from '../types/telemetry.ts';

export const NodeStatusBanner: React.FC = () => {
  const { activeNodeId, nodes, activeTelemetry } = useLiveData();

  const activeNode = nodes.find((n) => n.nodeId === activeNodeId);

  if (!activeNodeId || !activeNode) {
    return null;
  }

  const formatTimestamp = (ts: number | string | null) => {
    if (!ts) return '--';
    const num = typeof ts === 'number' ? ts : (!isNaN(Number(ts)) ? Number(ts) : Date.parse(ts));
    const d = isNaN(num) ? new Date(ts) : new Date(num);
    if (isNaN(d.getTime())) return String(ts);
    return `${d.toLocaleTimeString(undefined, {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })}.${String(d.getMilliseconds()).padStart(3, '0')}`;
  };

  return (
    <div className="space-y-2 font-mono">
      {/* Stale Telemetry Warning Banner */}
      {activeNode.status === 'STALE' && (
        <div className="bg-[#1c1203] border border-[#5e3805] text-[#F59E0B] px-3.5 py-2 rounded flex items-center gap-2.5 text-xs">
          <AlertTriangle className="w-4 h-4 text-[#F59E0B] shrink-0" />
          <div>
            <span className="font-bold">STALE TELEMETRY DETECTED:</span> No packets received for &gt;10 seconds. Displaying last known hardware state.
          </div>
        </div>
      )}

      {/* Offline Alert Banner */}
      {activeNode.status === 'OFFLINE' && (
        <div className="bg-[#1f0505] border border-[#6b1414] text-[#EF4444] px-3.5 py-2 rounded flex items-center gap-2.5 text-xs">
          <WifiOff className="w-4 h-4 text-[#EF4444] shrink-0" />
          <div>
            <span className="font-bold">NODE OFFLINE:</span> No telemetry received for &gt;30 seconds. RF link disconnected.
          </div>
        </div>
      )}

      {/* Node Identity and Diagnostics Card */}
      <div className="bg-[#080808] border border-[#222222] rounded p-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-[#222222]">
          <div className="flex items-center gap-2">
            <Cpu className="w-4 h-4 text-[#38BDF8]" />
            <span className="text-xs text-[#8A8A8A]">TARGET:</span>
            <span className="text-sm font-bold text-[#FFFFFF] tracking-wider">
              {activeNode.nodeId}
            </span>
            <StatusBadge status={activeNode.status} size="xs" />
          </div>

          <div className="flex flex-wrap items-center gap-3 text-[11px] text-[#B3B3B3]">
            <div className="flex items-center gap-1">
              <Clock className="w-3.5 h-3.5 text-[#8A8A8A]" />
              <span className="text-[#8A8A8A]">SERVER RX:</span>
              <span className="text-[#FFFFFF] font-semibold">
                {formatTimestamp(activeTelemetry?.serverReceiveTime ?? activeNode.lastSeen)}
              </span>
            </div>
            {activeTelemetry?.timestamp && (
              <div className="flex items-center gap-1">
                <span className="text-[#8A8A8A]">HW TIME:</span>
                <span className="text-[#B3B3B3]">
                  {formatTimestamp(activeTelemetry.timestamp)}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Subsystem Health Grid */}
        <div className="mt-2.5">
          <div className="text-[10px] text-[#8A8A8A] uppercase tracking-wider mb-1.5 flex items-center gap-1">
            <Activity className="w-3 h-3 text-[#8A8A8A]" />
            <span>Subsystem Health Status</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <div className="px-2 py-1 rounded bg-[#0D0D0D] border border-[#222222] text-[11px] flex items-center justify-between">
              <span className="text-[#B3B3B3]">IMU:</span>
              <StatusBadge status={activeNode.sensorHealth.imu} size="xs" />
            </div>
            <div className="px-2 py-1 rounded bg-[#0D0D0D] border border-[#222222] text-[11px] flex items-center justify-between">
              <span className="text-[#B3B3B3]">PROX:</span>
              <StatusBadge status={activeNode.sensorHealth.distance} size="xs" />
            </div>
            <div className="px-2 py-1 rounded bg-[#0D0D0D] border border-[#222222] text-[11px] flex items-center justify-between">
              <span className="text-[#B3B3B3]">SOUND:</span>
              <StatusBadge status={activeNode.sensorHealth.acoustic} size="xs" />
            </div>
            <div className="px-2 py-1 rounded bg-[#0D0D0D] border border-[#222222] text-[11px] flex items-center justify-between">
              <span className="text-[#B3B3B3]">POWER:</span>
              <StatusBadge status={activeNode.sensorHealth.battery} size="xs" />
            </div>
          </div>
        </div>

        {/* Packet Telemetry Counter Ribbons */}
        <div className="mt-2.5 pt-2 border-t border-[#222222] flex flex-wrap items-center gap-4 text-[10px] text-[#8A8A8A]">
          <span>PACKETS RX: <strong className="text-[#FFFFFF]">{activeNode.totalPacketsReceived}</strong></span>
          <span>DUPLICATES FILTERED: <strong className="text-[#B3B3B3]">{activeNode.duplicatePacketsCount}</strong></span>
          <span>MALFORMED: <strong className="text-[#B3B3B3]">{activeNode.rejectedPacketCount}</strong></span>
        </div>
      </div>
    </div>
  );
};
