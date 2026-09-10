import React from 'react';
import { useLiveData } from '../context/LiveDataContext.tsx';
import { StatusBadge } from './StatusBadge.tsx';
import { Clock, Terminal, Activity, Radio } from 'lucide-react';

interface HeaderProps {
  onToggleGatewayInfo: () => void;
  showGatewayInfo: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  onToggleGatewayInfo,
  showGatewayInfo,
}) => {
  const { connectionStatus, connectionError, lastUpdateTime, nodes, gatewayStats } = useLiveData();

  const onlineNodes = nodes.filter((n) => n.status === 'ONLINE');

  // A. Backend Server Status
  const backendStatus: 'ONLINE' | 'OFFLINE' | 'CONNECTING' | 'RECONNECTING' =
    connectionStatus === 'CONNECTED'
      ? 'ONLINE'
      : connectionStatus === 'CONNECTING'
      ? 'CONNECTING'
      : connectionStatus === 'RECONNECTING'
      ? 'RECONNECTING'
      : 'OFFLINE';

  // B. Gateway Wi-Fi/LAN connection (actual ESP32 gateway ingestion)
  const isGatewayConnected = !!(
    gatewayStats &&
    gatewayStats.lastIngestionTime &&
    Date.now() - gatewayStats.lastIngestionTime < 30000
  );
  const gatewayStatus: 'CONNECTED' | 'DISCONNECTED' = isGatewayConnected
    ? 'CONNECTED'
    : 'DISCONNECTED';

  // C. LoRa link state
  const isLoraReceiving = !!(
    lastUpdateTime &&
    Date.now() - lastUpdateTime < 15000 &&
    (gatewayStats?.totalPacketsAccepted ?? 0) > 0
  );
  const loraStatus: 'RECEIVING' | 'NO PACKETS' = isLoraReceiving ? 'RECEIVING' : 'NO PACKETS';

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
    <header className="bg-[#080808] border-b border-[#222222] text-[#FFFFFF] px-3 sm:px-4 py-2 sticky top-0 z-30 font-mono shrink-0 w-full select-none">
      <div className="w-full flex flex-col md:flex-row md:items-center justify-between gap-2.5">
        {/* System Name & Identification */}
        <div className="flex items-center">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xs sm:text-sm font-bold tracking-wider uppercase text-[#FFFFFF]">
                MINE-RESCUE OPERATIONS MONITOR
              </h1>
              <span className="text-[10px] uppercase px-1.5 py-0.2 rounded bg-[#0D0D0D] text-[#B3B3B3] border border-[#222222]">
                HARDWARE V1.0
              </span>
            </div>
            <p className="text-[10px] sm:text-[11px] text-[#8A8A8A]">
              REAL HARDWARE TELEMETRY RIG &bull; ESP32 + RA-02 SX1278 LORA
            </p>
          </div>
        </div>

        {/* System & Connection Status Metrics */}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {/* Backend Status */}
          <div className="flex items-center gap-1.5 bg-[#0D0D0D] px-2.5 py-1 rounded border border-[#222222]">
            <span className="text-[#8A8A8A] text-[10px] sm:text-[11px] uppercase">BACKEND:</span>
            <StatusBadge status={backendStatus} size="xs" pulse={backendStatus === 'ONLINE'} />
          </div>

          {/* Gateway Status */}
          <div className="flex items-center gap-1.5 bg-[#0D0D0D] px-2.5 py-1 rounded border border-[#222222]">
            <span className="text-[#8A8A8A] text-[10px] sm:text-[11px] uppercase">GATEWAY:</span>
            <StatusBadge
              status={gatewayStatus}
              size="xs"
              pulse={gatewayStatus === 'CONNECTED'}
            />
          </div>

          {/* LoRa Status */}
          <div className="flex items-center gap-1.5 bg-[#0D0D0D] px-2.5 py-1 rounded border border-[#222222]">
            <span className="text-[#8A8A8A] text-[10px] sm:text-[11px] uppercase">LORA:</span>
            <StatusBadge
              status={loraStatus}
              size="xs"
              pulse={loraStatus === 'RECEIVING'}
            />
          </div>

          {/* Active Nodes Counter */}
          <div className="hidden sm:flex items-center gap-1.5 bg-[#0D0D0D] px-2.5 py-1 rounded border border-[#222222] text-[11px]">
            <Radio className="w-3.5 h-3.5 text-[#38BDF8]" />
            <span className="text-[#8A8A8A]">NODES:</span>
            <span className="text-[#22C55E] font-semibold">{onlineNodes.length}</span>
            <span className="text-[#8A8A8A]">/</span>
            <span className="text-[#B3B3B3]">{nodes.length}</span>
          </div>

          {/* Latest Timestamp */}
          <div className="flex items-center gap-1.5 bg-[#0D0D0D] px-2.5 py-1 rounded border border-[#222222] text-[11px]">
            <Clock className="w-3.5 h-3.5 text-[#38BDF8]" />
            <span className="text-[#8A8A8A]">LATEST:</span>
            <span className="font-semibold text-[#FFFFFF]">
              {formatTimestamp(lastUpdateTime)}
            </span>
          </div>

          {/* Gateway Ingestion Spec / Test Modal Button */}
          <button
            type="button"
            onClick={onToggleGatewayInfo}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] uppercase tracking-wider font-semibold border transition-colors ${
              showGatewayInfo
                ? 'bg-[#38BDF8]/20 border-[#38BDF8] text-[#38BDF8]'
                : 'bg-[#0D0D0D] border-[#222222] text-[#B3B3B3] hover:text-[#FFFFFF] hover:border-[#38BDF8]/50'
            }`}
            title="Gateway Ingestion API & Diagnostics"
          >
            <Terminal className="w-3.5 h-3.5" />
            <span>INGESTION SPEC</span>
          </button>
        </div>
      </div>

      {connectionError && (
        <div className="w-full mt-2 text-[11px] text-[#EF4444] bg-[#1a0505] border border-[#EF4444]/60 px-3 py-1.5 rounded flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-[#EF4444] animate-ping" />
          <span>TRANSPORT ALERT: {connectionError}</span>
        </div>
      )}
    </header>
  );
};
