import React from 'react';
import { SubsystemHealth, NodeConnectionState } from '../types/telemetry.ts';
import { ConnectionStatus } from '../services/telemetryService.ts';

export type AlertSeverity = 'CRITICAL' | 'WARNING' | 'INFO';

export type AnyStatus =
  | SubsystemHealth
  | NodeConnectionState
  | ConnectionStatus
  | AlertSeverity
  | 'ONLINE'
  | 'OFFLINE'
  | 'STALE'
  | 'ERROR'
  | 'HEALTHY'
  | 'DEGRADED'
  | 'CRITICAL'
  | 'UNKNOWN'
  | 'NORMAL'
  | 'LOW'
  | 'ACTIVE'
  | 'ACKNOWLEDGED'
  | 'RESOLVED'
  | 'NO DATA'
  | 'VALID'
  | 'RECEIVING'
  | 'NO PACKETS'
  | 'OK'
  | 'PARTIAL'
  | 'CONNECTED'
  | 'DISCONNECTED';

interface StatusBadgeProps {
  id?: string;
  status: AnyStatus | string | null | undefined;
  label?: string;
  size?: 'xs' | 'sm' | 'md';
  pulse?: boolean;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({
  id,
  status,
  label,
  size = 'sm',
  pulse = false,
}) => {
  const norm = (status ?? 'NO DATA').toString().toUpperCase();
  const displayLabel = label ?? norm;

  let colorClasses = 'bg-[#0D0D0D] text-[#8A8A8A] border-[#222222]';
  let dotColor = 'bg-[#8A8A8A]';

  if (['ONLINE', 'HEALTHY', 'NORMAL', 'CONNECTED', 'VALID', 'RECEIVING', 'RESOLVED', 'OK'].includes(norm)) {
    colorClasses = 'bg-[#071a0e] text-[#22C55E] border-[#1b4d29]';
    dotColor = 'bg-[#22C55E]';
  } else if (['STALE', 'DEGRADED', 'LOW', 'CONNECTING', 'WARNING', 'WEAK', 'PARTIAL'].includes(norm)) {
    colorClasses = 'bg-[#1c1203] text-[#F59E0B] border-[#5e3805]';
    dotColor = 'bg-[#F59E0B]';
  } else if (['OFFLINE', 'ERROR', 'CRITICAL', 'DISCONNECTED', 'INVALID', 'ACTIVE'].includes(norm)) {
    colorClasses = 'bg-[#1f0505] text-[#EF4444] border-[#6b1414]';
    dotColor = 'bg-[#EF4444]';
  } else if (['NO DATA', 'NO PACKETS', 'UNKNOWN', 'NEVER'].includes(norm)) {
    colorClasses = 'bg-[#0D0D0D] text-[#8A8A8A] border-[#222222]';
    dotColor = 'bg-[#8A8A8A]';
  } else if (['ACKNOWLEDGED'].includes(norm)) {
    colorClasses = 'bg-[#081a26] text-[#38BDF8] border-[#0e3b57]';
    dotColor = 'bg-[#38BDF8]';
  }

  const sizeClasses =
    size === 'xs'
      ? 'text-[10px] px-1.5 py-0.5 gap-1'
      : size === 'md'
      ? 'text-xs px-2.5 py-1 gap-1.5'
      : 'text-[11px] px-2 py-0.5 gap-1.5';

  return (
    <span
      id={id}
      className={`inline-flex items-center font-mono font-medium rounded border tracking-wider uppercase select-none ${sizeClasses} ${colorClasses}`}
    >
      <span
        className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotColor} ${
          pulse ? 'animate-pulse' : ''
        }`}
      />
      <span className="truncate">{displayLabel}</span>
    </span>
  );
};
