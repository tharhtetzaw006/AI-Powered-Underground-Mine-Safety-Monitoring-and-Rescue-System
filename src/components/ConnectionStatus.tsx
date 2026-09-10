import React from 'react';
import { useLiveData } from '../context/LiveDataContext.tsx';
import { StatusBadge } from './StatusBadge.tsx';
import { Server, Radio, Cpu, Wifi, Activity, Clock } from 'lucide-react';

interface ConnectionStatusProps {
  id?: string;
  showDetails?: boolean;
}

export const ConnectionStatus: React.FC<ConnectionStatusProps> = ({
  id,
  showDetails = true,
}) => {
  const { connectionStatus, gatewayStats, lastUpdateTime, nodes, activeNodeId } = useLiveData();

  // A. Backend server status (WebSocket connection to Node.js backend)
  const backendStatus: 'ONLINE' | 'OFFLINE' | 'CONNECTING' | 'RECONNECTING' =
    connectionStatus === 'CONNECTED'
      ? 'ONLINE'
      : connectionStatus === 'CONNECTING'
      ? 'CONNECTING'
      : connectionStatus === 'RECONNECTING'
      ? 'RECONNECTING'
      : 'OFFLINE';

  // B. Gateway Wi-Fi/LAN connection (ESP32 gateway communicating with /api/telemetry)
  const isGatewayConnected = !!(
    gatewayStats &&
    gatewayStats.lastIngestionTime &&
    Date.now() - gatewayStats.lastIngestionTime < 30000
  );
  const gatewayStatus: 'CONNECTED' | 'DISCONNECTED' = isGatewayConnected
    ? 'CONNECTED'
    : 'DISCONNECTED';

  // C. LoRa gateway receiving packets from field nodes
  const isLoraReceiving = !!(
    lastUpdateTime &&
    Date.now() - lastUpdateTime < 15000 &&
    (gatewayStats?.totalPacketsAccepted ?? 0) > 0
  );
  const loraStatus: 'RECEIVING' | 'NO PACKETS' = isLoraReceiving ? 'RECEIVING' : 'NO PACKETS';

  // D. Field node online/stale/offline
  const activeNode = nodes.find((n) => n.nodeId === activeNodeId);
  const nodeStatus = activeNode ? activeNode.status : (nodes.length > 0 ? nodes[0].status : 'OFFLINE');

  // E. Sensor data availability (OK / NO DATA / ERROR)
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
    const timeStr = d.toLocaleTimeString(undefined, {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    const msStr = String(d.getMilliseconds()).padStart(3, '0');
    return `${timeStr}.${msStr}`;
  };

  return (
    <div id={id} className="flex flex-wrap items-center gap-2 font-mono text-xs">
      {/* A. Backend */}
      <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-[#0D0D0D] border border-[#222222]">
        <Server className="w-3.5 h-3.5 text-[#8A8A8A]" />
        <span className="text-[10px] text-[#8A8A8A] uppercase">BACKEND:</span>
        <StatusBadge status={backendStatus} size="xs" pulse={backendStatus === 'ONLINE'} />
      </div>

      {/* B. Gateway */}
      <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-[#0D0D0D] border border-[#222222]">
        <Wifi className="w-3.5 h-3.5 text-[#8A8A8A]" />
        <span className="text-[10px] text-[#8A8A8A] uppercase">GATEWAY:</span>
        <StatusBadge status={gatewayStatus} size="xs" pulse={gatewayStatus === 'CONNECTED'} />
      </div>

      {/* C. LoRa */}
      <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-[#0D0D0D] border border-[#222222]">
        <Radio className="w-3.5 h-3.5 text-[#8A8A8A]" />
        <span className="text-[10px] text-[#8A8A8A] uppercase">LORA:</span>
        <StatusBadge status={loraStatus} size="xs" pulse={loraStatus === 'RECEIVING'} />
      </div>

      {/* D. Field Node */}
      <div className="hidden sm:flex items-center gap-1.5 px-2 py-1 rounded bg-[#0D0D0D] border border-[#222222]">
        <Cpu className="w-3.5 h-3.5 text-[#8A8A8A]" />
        <span className="text-[10px] text-[#8A8A8A] uppercase">NODE:</span>
        <StatusBadge status={nodeStatus} size="xs" pulse={nodeStatus === 'ONLINE'} />
      </div>

      {/* E. Sensor */}
      <div className="hidden md:flex items-center gap-1.5 px-2 py-1 rounded bg-[#0D0D0D] border border-[#222222]">
        <Activity className="w-3.5 h-3.5 text-[#8A8A8A]" />
        <span className="text-[10px] text-[#8A8A8A] uppercase">SENSOR:</span>
        <StatusBadge status={sensorStatus} size="xs" />
      </div>

      {showDetails && lastUpdateTime && (
        <div className="hidden xl:flex items-center gap-1.5 px-2 py-1 rounded bg-[#0D0D0D] border border-[#222222] text-[10px] text-[#8A8A8A]">
          <Clock className="w-3 h-3 text-[#38BDF8]" />
          <span>RX: {formatTimestamp(lastUpdateTime)}</span>
        </div>
      )}
    </div>
  );
};

