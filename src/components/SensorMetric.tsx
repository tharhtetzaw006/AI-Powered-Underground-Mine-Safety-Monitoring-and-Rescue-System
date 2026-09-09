import React from 'react';

interface SensorMetricProps {
  id?: string;
  axis?: string;
  label?: string;
  value: number | null | undefined;
  unit: string;
  precision?: number;
  signed?: boolean;
  statusLabel?: string;
  statusColor?: 'success' | 'warning' | 'critical' | 'neutral';
}

export const SensorMetric: React.FC<SensorMetricProps> = ({
  id,
  axis,
  label,
  value,
  unit,
  precision = 2,
  signed = false,
  statusLabel,
  statusColor = 'neutral',
}) => {
  const isAvailable = value !== null && value !== undefined;

  let formattedValue = '--';
  if (isAvailable) {
    if (signed && value > 0) {
      formattedValue = `+${value.toFixed(precision)}`;
    } else {
      formattedValue = value.toFixed(precision);
    }
  }

  let colorClass = 'text-[#B3B3B3]';
  if (statusColor === 'success') colorClass = 'text-[#22C55E]';
  if (statusColor === 'warning') colorClass = 'text-[#F59E0B]';
  if (statusColor === 'critical') colorClass = 'text-[#EF4444]';

  return (
    <div
      id={id}
      className="flex items-center justify-between px-2.5 py-1.5 rounded bg-[#0D0D0D] border border-[#222222] font-mono text-xs"
    >
      <div className="flex items-center gap-2">
        {axis && (
          <span className="w-5 h-5 rounded flex items-center justify-center bg-[#1A1A1A] text-[#38BDF8] font-bold text-[11px]">
            {axis}
          </span>
        )}
        {label && <span className="text-[#B3B3B3] uppercase text-[11px]">{label}</span>}
      </div>

      <div className="flex items-baseline gap-1.5">
        <span
          className={`font-semibold tracking-tight ${
            isAvailable ? 'text-[#FFFFFF]' : 'text-[#8A8A8A]'
          }`}
        >
          {formattedValue}
        </span>
        <span className="text-[10px] text-[#B3B3B3] font-normal">{unit}</span>
        {statusLabel && (
          <span className={`text-[10px] ml-1 uppercase font-medium ${colorClass}`}>
            [{statusLabel}]
          </span>
        )}
      </div>
    </div>
  );
};
