import React from 'react';
import { useLiveData } from '../context/LiveDataContext.tsx';
import { StatusBadge } from './StatusBadge.tsx';
import { Activity, Clock } from 'lucide-react';

interface ConnectionStatusProps {
  id?: string;
  showDetails?: boolean;
}

export const ConnectionStatus: React.FC<ConnectionStatusProps> = ({
  id,
  showDetails = true,
}) => {
  const { connectionStatus, lastUpdateTime } = useLiveData();

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
    <div id={id} className="flex items-center gap-2.5 font-mono text-xs">
      {/* Gateway WebSocket Status Badge */}
      <div className="flex items-center gap-1.5">
        <span className="text-[10px] text-[#94A3B8] uppercase tracking-wider hidden sm:inline">
          GW:
        </span>
        <StatusBadge
          status={connectionStatus}
          label={
            connectionStatus === 'CONNECTED'
              ? 'GATEWAY ONLINE'
              : connectionStatus === 'CONNECTING'
              ? 'CONNECTING'
              : connectionStatus === 'DISCONNECTED'
              ? 'GATEWAY OFFLINE'
              : 'ERROR'
          }
          size="sm"
          pulse={connectionStatus === 'CONNECTED'}
        />
      </div>

      {showDetails && (
        <div className="hidden lg:flex items-center gap-1.5 px-2 py-0.5 rounded bg-[#111827] border border-[#1E293B] text-[11px] text-[#94A3B8]">
          <Clock className="w-3.5 h-3.5 text-[#38BDF8]" />
          <span className="text-[#64748B]">LAST PKT:</span>
          <span className="font-semibold text-[#F8FAFC]">
            {formatTimestamp(lastUpdateTime)}
          </span>
        </div>
      )}
    </div>
  );
};
