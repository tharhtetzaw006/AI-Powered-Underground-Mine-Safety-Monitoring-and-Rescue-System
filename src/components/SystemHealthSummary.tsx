import React from 'react';
import { useLiveData } from '../context/LiveDataContext.tsx';
import { StatusBadge } from './StatusBadge.tsx';
import { ShieldAlert, Server, Radio, Cpu, Clock, Activity } from 'lucide-react';

interface SystemHealthSummaryProps {
  id?: string;
}

export const SystemHealthSummary: React.FC<SystemHealthSummaryProps> = ({ id }) => {
  const { connectionStatus, nodes, activeNodeId, lastUpdateTime, gatewayStats } = useLiveData();

  const activeNode = nodes.find((n) => n.nodeId === activeNodeId);
  const onlineNodes = nodes.filter((n) => n.status === 'ONLINE');

  // A. Backend server status
  const backendStatus: 'ONLINE' | 'OFFLINE' | 'CONNECTING' | 'RECONNECTING' =
    connectionStatus === 'CONNECTED'
      ? 'ONLINE'
      : connectionStatus === 'CONNECTING'
      ? 'CONNECTING'
      : connectionStatus === 'RECONNECTING'
      ? 'RECONNECTING'
      : 'OFFLINE';

  // B. Gateway Wi-Fi/LAN connection (ESP32 Gateway actively POSTing)
  const isGatewayConnected = !!(
    gatewayStats &&
    gatewayStats.lastIngestionTime &&
    Date.now() - gatewayStats.lastIngestionTime < 30000
  );
  const gatewayStatus: 'CONNECTED' | 'DISCONNECTED' = isGatewayConnected
    ? 'CONNECTED'
    : 'DISCONNECTED';

  // C. LoRa RF Reception state
  const isLoraReceiving = !!(
    lastUpdateTime &&
    Date.now() - lastUpdateTime < 15000 &&
    (gatewayStats?.totalPacketsAccepted ?? 0) > 0
  );
  const loraStatus: 'RECEIVING' | 'NO PACKETS' = isLoraReceiving ? 'RECEIVING' : 'NO PACKETS';

  // D. Field Node Status
  const fieldNodeStatus: 'ONLINE' | 'STALE' | 'OFFLINE' =
    activeNode ? activeNode.status : (nodes.length > 0 && onlineNodes.length > 0 ? 'ONLINE' : 'OFFLINE');

  // E. Sensor Subsystems Status (OK / NO DATA / ERROR)
  let sensorStatus: 'OK' | 'NO DATA' | 'ERROR' = 'NO DATA';
  if (activeNode) {
    const hasError =
      activeNode.sensorHealth.imu === 'ERROR' ||
      activeNode.sensorHealth.distance === 'ERROR' ||
      activeNode.sensorHealth.acoustic === 'ERROR';
    const hasData =
      activeNode.sensorAvailability?.imu === 'AVAILABLE' ||
      activeNode.sensorAvailability?.distance === 'AVAILABLE' ||
      activeNode.sensorAvailability?.acoustic === 'AVAILABLE';

    if (hasError) {
      sensorStatus = 'ERROR';
    } else if (hasData) {
      sensorStatus = 'OK';
    } else {
      sensorStatus = 'NO DATA';
    }
  }

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
            Hardware Validation & Connection Status
          </h3>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-[#8A8A8A]">LAST PACKET:</span>
          <span className="text-xs font-bold text-[#FFFFFF]">{formatTimestamp(lastUpdateTime)}</span>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
        {/* 1. Backend Server */}
        <div className="p-2.5 rounded bg-[#0D0D0D] border border-[#222222]">
          <div className="flex items-center gap-1.5 text-[10px] text-[#B3B3B3] uppercase">
            <Server className="w-3.5 h-3.5 text-[#38BDF8]" />
            <span>Backend Server</span>
          </div>
          <div className="mt-1.5">
            <StatusBadge status={backendStatus} size="xs" pulse={backendStatus === 'ONLINE'} />
          </div>
          <div className="text-[9px] text-[#8A8A8A] mt-1">NODE.JS / REST & WS</div>
        </div>

        {/* 2. Gateway */}
        <div className="p-2.5 rounded bg-[#0D0D0D] border border-[#222222]">
          <div className="flex items-center gap-1.5 text-[10px] text-[#B3B3B3] uppercase">
            <ShieldAlert className="w-3.5 h-3.5 text-[#38BDF8]" />
            <span>ESP32 Gateway</span>
          </div>
          <div className="mt-1.5">
            <StatusBadge
              status={gatewayStatus}
              size="xs"
              pulse={gatewayStatus === 'CONNECTED'}
            />
          </div>
          <div className="text-[9px] text-[#8A8A8A] mt-1">WI-FI / LAN INGESTION</div>
        </div>

        {/* 3. LoRa RF Link */}
        <div className="p-2.5 rounded bg-[#0D0D0D] border border-[#222222]">
          <div className="flex items-center gap-1.5 text-[10px] text-[#B3B3B3] uppercase">
            <Radio className="w-3.5 h-3.5 text-[#38BDF8]" />
            <span>LoRa Link</span>
          </div>
          <div className="mt-1.5">
            <StatusBadge
              status={loraStatus}
              size="xs"
              pulse={loraStatus === 'RECEIVING'}
            />
          </div>
          <div className="text-[9px] text-[#8A8A8A] mt-1">RA-02 SX1278 RF</div>
        </div>

        {/* 4. Field Node */}
        <div className="p-2.5 rounded bg-[#0D0D0D] border border-[#222222]">
          <div className="flex items-center gap-1.5 text-[10px] text-[#B3B3B3] uppercase">
            <Cpu className="w-3.5 h-3.5 text-[#38BDF8]" />
            <span>Field Node</span>
          </div>
          <div className="mt-1.5">
            <StatusBadge status={fieldNodeStatus} size="xs" pulse={fieldNodeStatus === 'ONLINE'} />
          </div>
          <div className="text-[9px] text-[#8A8A8A] mt-1">
            {activeNodeId ? `TARGET: ${activeNodeId}` : `${onlineNodes.length}/${nodes.length} ONLINE`}
          </div>
        </div>

        {/* 5. Sensor Availability */}
        <div className="p-2.5 rounded bg-[#0D0D0D] border border-[#222222] col-span-2 sm:col-span-1">
          <div className="flex items-center gap-1.5 text-[10px] text-[#B3B3B3] uppercase">
            <Clock className="w-3.5 h-3.5 text-[#38BDF8]" />
            <span>Sensor Streams</span>
          </div>
          <div className="mt-1.5">
            <StatusBadge status={sensorStatus} size="xs" />
          </div>
          <div className="text-[9px] text-[#8A8A8A] mt-1">MPU6500 &bull; HC-SR04 &bull; MIC</div>
        </div>
      </div>
    </div>
  );
};
