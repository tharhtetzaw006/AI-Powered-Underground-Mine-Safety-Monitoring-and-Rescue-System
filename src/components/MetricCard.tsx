import React from 'react';
import { LucideIcon } from 'lucide-react';
import { StatusBadge, AnyStatus } from './StatusBadge.tsx';

interface MetricCardProps {
  id?: string;
  title: string;
  value: string | number | null | undefined;
  unit?: string;
  source?: string;
  status?: AnyStatus | string | null;
  icon?: LucideIcon;
  detail?: string;
  highlight?: boolean;
}

export const MetricCard: React.FC<MetricCardProps> = ({
  id,
  title,
  value,
  unit,
  source,
  status,
  icon: Icon,
  detail,
  highlight = false,
}) => {
  const isAvailable = value !== null && value !== undefined;
  const displayValue = isAvailable ? value : '--';

  return (
    <div
      id={id}
      className={`border rounded p-3 font-mono transition-colors ${
        highlight
          ? 'border-[#38BDF8]/40 bg-[#080808]'
          : 'border-[#222222] bg-[#080808]'
      }`}
    >
      <div className="flex items-center justify-between gap-1 mb-1.5">
        <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-[#B3B3B3]">
          {Icon && <Icon className="w-3.5 h-3.5 text-[#38BDF8] shrink-0" />}
          <span className="truncate">{title}</span>
        </div>
        {status && <StatusBadge status={status} size="xs" />}
      </div>

      <div className="flex items-baseline gap-1.5 my-1">
        <span
          className={`text-xl sm:text-2xl font-bold tracking-tight ${
            isAvailable ? 'text-[#FFFFFF]' : 'text-[#8A8A8A]'
          }`}
        >
          {displayValue}
        </span>
        {unit && isAvailable && (
          <span className="text-xs text-[#B3B3B3] font-normal">{unit}</span>
        )}
      </div>

      <div className="flex items-center justify-between text-[10px] text-[#8A8A8A] pt-1.5 mt-1 border-t border-[#222222]">
        <span className="truncate">{source ?? 'SENSOR STREAM'}</span>
        {detail && <span className="truncate text-[#B3B3B3]">{detail}</span>}
      </div>
    </div>
  );
};
