import React from 'react';
import { useLiveData } from '../context/LiveDataContext.tsx';
import { StatusBadge } from './StatusBadge.tsx';
import { ShieldAlert, Server, Radio, Cpu, Clock, Activity } from 'lucide-react';

interface SystemHealthSummaryProps {
  id?: string;
}

export const SystemHealthSummary: React.FC<SystemHealthSummaryProps> = ({ id }) => {
  const { connectionStatus, nodes, activeNodeId, activeTelemetry, lastUpdateTime } = useLiveData();

  const onlineNodes = nodes.filter((n) => n.status === 'ONLINE');
  const staleNodes = nodes.filter((n) => n.status === 'STALE');
  const offlineNodes = nodes.filter((n) => n.status === 'OFFLINE');

  // Overall system status
  let systemStatus: 'ONLINE' | 'DEGRADED' | 'OFFLINE' | 'ERROR' | 'NO DATA' = 'NO DATA';
  if (connectionStatus === 'ERROR') {
    systemStatus = 'ERROR';
  } else if (connectionStatus === 'DISCONNECTED') {
    systemStatus = 'OFFLINE';
  } else if (nodes.length === 0) {
    systemStatus = 'NO DATA';
  } else if (onlineNodes.length === nodes.length) {
    systemStatus = 'ONLINE';
  } else if (onlineNodes.length > 0) {
    systemStatus = 'DEGRADED';
  } else if (staleNodes.length > 0) {
    systemStatus = 'STALE' as unknown as 'DEGRADED';
  } else {
    systemStatus = 'OFFLINE';
  }

  // Active node sensor health
  const activeNode = nodes.find((n) => n.nodeId === activeNodeId);
  const sensorHealthLabel = activeNode
    ? activeNode.sensorHealth.imu === 'HEALTHY' && activeNode.sensorHealth.distance === 'HEALTHY'
      ? 'HEALTHY'
      : activeNode.sensorHealth.imu === 'ERROR' || activeNode.sensorHealth.distance === 'ERROR'
      ? 'ERROR'
      : 'DEGRADED'
    : nodes.length > 0
    ? 'ONLINE'
    : 'NO DATA';

  const formatTimestamp = (ts: number | null) => {
    if (!ts) return 'NO DATA';
    const d = new Date(ts);
    return d.toLocaleTimeString(undefined, {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  return (
    <div
      id={id}
      className="border border-[#222222] bg-[#080808] rounded p-3.5 font-mono"
    >
      <div className="flex items-center justify-between pb-2.5 mb-3 border-b border-[#222222]">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-[#38BDF8]" />
          <h3 className="text-xs font-bold uppercase tracking-wider text-[#FFFFFF]">
            System Operational Health
          </h3>
        </div>
        <StatusBadge status={systemStatus} size="sm" pulse={systemStatus === 'ONLINE'} />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
        {/* 1. Overall System Status */}
        <div className="p-2.5 rounded bg-[#0D0D0D] border border-[#222222]">
          <div className="flex items-center gap-1.5 text-[10px] text-[#B3B3B3] uppercase">
            <ShieldAlert className="w-3.5 h-3.5 text-[#38BDF8]" />
            <span>Overall System</span>
          </div>
          <div className="mt-1.5">
            <StatusBadge status={systemStatus} size="xs" />
          </div>
          <div className="text-[9px] text-[#8A8A8A] mt-1">TELEMETRY RIG STATUS</div>
        </div>

        {/* 2. Gateway Status */}
        <div className="p-2.5 rounded bg-[#0D0D0D] border border-[#222222]">
          <div className="flex items-center gap-1.5 text-[10px] text-[#B3B3B3] uppercase">
            <Server className="w-3.5 h-3.5 text-[#38BDF8]" />
            <span>Gateway Link</span>
          </div>
          <div className="mt-1.5">
            <StatusBadge
              status={
                connectionStatus === 'CONNECTED'
                  ? 'ONLINE'
                  : connectionStatus === 'CONNECTING'
                  ? 'STALE'
                  : connectionStatus === 'DISCONNECTED'
                  ? 'OFFLINE'
                  : 'ERROR'
              }
              label={
                connectionStatus === 'CONNECTED'
                  ? 'CONNECTED'
                  : connectionStatus === 'CONNECTING'
                  ? 'CONNECTING'
                  : connectionStatus === 'DISCONNECTED'
                  ? 'OFFLINE'
                  : 'ERROR'
              }
              size="xs"
            />
          </div>
          <div className="text-[9px] text-[#8A8A8A] mt-1">REST / WS TRANSPORT</div>
        </div>

        {/* 3. Active Nodes */}
        <div className="p-2.5 rounded bg-[#0D0D0D] border border-[#222222]">
          <div className="flex items-center gap-1.5 text-[10px] text-[#B3B3B3] uppercase">
            <Radio className="w-3.5 h-3.5 text-[#38BDF8]" />
            <span>Active Nodes</span>
          </div>
          <div className="mt-1.5 text-base font-bold text-[#FFFFFF]">
            {nodes.length > 0 ? (
              <span>
                <strong className="text-[#22C55E]">{onlineNodes.length}</strong>
                <span className="text-[#8A8A8A] text-xs font-normal"> / {nodes.length} ONLINE</span>
              </span>
            ) : (
              <span className="text-[#8A8A8A] text-xs">0 REGISTERED</span>
            )}
          </div>
          <div className="text-[9px] text-[#8A8A8A] mt-1">FIELD RF SENSORS</div>
        </div>

        {/* 4. Sensor Health */}
        <div className="p-2.5 rounded bg-[#0D0D0D] border border-[#222222]">
          <div className="flex items-center gap-1.5 text-[10px] text-[#B3B3B3] uppercase">
            <Cpu className="w-3.5 h-3.5 text-[#38BDF8]" />
            <span>Sensor Health</span>
          </div>
          <div className="mt-1.5">
            <StatusBadge status={sensorHealthLabel} size="xs" />
          </div>
          <div className="text-[9px] text-[#8A8A8A] mt-1">
            {activeNodeId ? `NODE ${activeNodeId}` : 'ALL NODES'}
          </div>
        </div>

        {/* 5. Last Telemetry Update */}
        <div className="p-2.5 rounded bg-[#0D0D0D] border border-[#222222] col-span-2 sm:col-span-1">
          <div className="flex items-center gap-1.5 text-[10px] text-[#B3B3B3] uppercase">
            <Clock className="w-3.5 h-3.5 text-[#38BDF8]" />
            <span>Last Update</span>
          </div>
          <div className="mt-1.5 text-sm font-bold text-[#FFFFFF]">
            {formatTimestamp(lastUpdateTime)}
          </div>
          <div className="text-[9px] text-[#8A8A8A] mt-1">PACKET ARRIVAL TIME</div>
        </div>
      </div>
    </div>
  );
};
