import React from 'react';
import { LucideIcon } from 'lucide-react';

interface EmptyStateProps {
  id?: string;
  icon: LucideIcon;
  title: string;
  message?: string;
  secondaryNote?: string;
  action?: React.ReactNode;
  compact?: boolean;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  id,
  icon: Icon,
  title,
  message,
  secondaryNote,
  action,
  compact = false,
}) => {
  return (
    <div
      id={id}
      className={`border border-[#222222] bg-[#080808] rounded text-center flex flex-col items-center justify-center font-mono ${
        compact ? 'p-4' : 'p-8 sm:p-10'
      }`}
    >
      <div className="w-10 h-10 rounded border border-[#222222] bg-[#0D0D0D] flex items-center justify-center text-[#B3B3B3] mb-3">
        <Icon className="w-5 h-5 text-[#B3B3B3]" />
      </div>
      <div className="text-xs sm:text-sm font-bold tracking-wider uppercase text-[#FFFFFF]">
        {title}
      </div>
      {message && (
        <p className="text-xs text-[#B3B3B3] mt-1.5 max-w-md leading-relaxed">
          {message}
        </p>
      )}
      {secondaryNote && (
        <div className="mt-2 text-[11px] text-[#8A8A8A] tracking-tight">
          {secondaryNote}
        </div>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
};
