import React from 'react';
import { LucideIcon } from 'lucide-react';

interface SectionHeaderProps {
  id?: string;
  icon: LucideIcon;
  title: string;
  subtitle?: string;
  badge?: React.ReactNode;
  actions?: React.ReactNode;
}

export const SectionHeader: React.FC<SectionHeaderProps> = ({
  id,
  icon: Icon,
  title,
  subtitle,
  badge,
  actions,
}) => {
  return (
    <div
      id={id}
      className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 mb-2.5 border-b border-[#222222] font-mono select-none"
    >
      <div className="flex items-center gap-2.5">
        <div className="p-1.5 rounded border border-[#222222] bg-[#0D0D0D] text-[#38BDF8]">
          <Icon className="w-4 h-4 text-[#38BDF8]" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xs sm:text-sm font-bold tracking-wider uppercase text-[#FFFFFF]">
              {title}
            </h2>
            {badge}
          </div>
          {subtitle && (
            <p className="text-[11px] text-[#8A8A8A] tracking-normal mt-0.5">
              {subtitle}
            </p>
          )}
        </div>
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
};
