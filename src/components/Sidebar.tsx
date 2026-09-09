import React from 'react';
import {
  LayoutDashboard,
  Activity,
  Crosshair,
  Radio,
  ShieldAlert,
  Camera,
  Server,
} from 'lucide-react';
import { useLiveData } from '../context/LiveDataContext.tsx';

export type NavSection =
  | 'overview'
  | 'sensors'
  | 'detection'
  | 'nodes'
  | 'alerts'
  | 'camera'
  | 'system';

interface SidebarProps {
  id?: string;
  activeSection: NavSection;
  onSelectSection: (section: NavSection) => void;
  alertCount?: number;
}

export const Sidebar: React.FC<SidebarProps> = ({
  id,
  activeSection,
  onSelectSection,
  alertCount = 0,
}) => {
  const { nodes } = useLiveData();
  const onlineCount = nodes.filter((n) => n.status === 'ONLINE').length;

  const navItems = [
    {
      id: 'overview' as const,
      label: 'Overview',
      icon: LayoutDashboard,
    },
    {
      id: 'sensors' as const,
      label: 'Live Sensors',
      icon: Activity,
    },
    {
      id: 'detection' as const,
      label: 'Detection',
      icon: Crosshair,
    },
    {
      id: 'nodes' as const,
      label: 'Nodes',
      icon: Radio,
      badge: nodes.length > 0 ? `${onlineCount}/${nodes.length}` : undefined,
    },
    {
      id: 'alerts' as const,
      label: 'Alerts',
      icon: ShieldAlert,
      badge: alertCount > 0 ? String(alertCount) : undefined,
      badgeColor: alertCount > 0 ? 'bg-[#200505] text-[#EF4444] border-[#6b1414]' : undefined,
    },
    {
      id: 'camera' as const,
      label: 'Camera',
      icon: Camera,
      statusDot: 'bg-[#EF4444]',
    },
    {
      id: 'system' as const,
      label: 'System',
      icon: Server,
    },
  ];

  return (
    <aside
      id={id}
      className="w-full md:w-56 shrink-0 md:h-full bg-[#080808] border-b md:border-b-0 md:border-r border-[#222222] p-2 sm:p-2.5 font-mono select-none flex flex-col justify-between overflow-y-auto"
    >
      <div>
        <div className="px-2 py-1.5 mb-1.5 text-[10px] text-[#8A8A8A] uppercase tracking-wider font-semibold border-b border-[#222222]">
          COMMAND NAVIGATION
        </div>

        <nav className="flex md:flex-col gap-1 overflow-x-auto md:overflow-visible py-1">
          {navItems.map((item) => {
            const isActive = activeSection === item.id;
            const Icon = item.icon;

            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectSection(item.id)}
                className={`flex items-center justify-between px-2.5 py-2 rounded text-xs tracking-wider uppercase font-semibold transition-colors shrink-0 md:shrink border ${
                  isActive
                    ? 'bg-[#111111] border-[#38BDF8] text-[#FFFFFF]'
                    : 'bg-transparent border-transparent text-[#B3B3B3] hover:bg-[#0D0D0D] hover:text-[#FFFFFF]'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Icon
                    className={`w-4 h-4 ${
                      isActive ? 'text-[#38BDF8]' : 'text-[#8A8A8A]'
                    }`}
                  />
                  <span className="truncate">{item.label}</span>
                </div>

                <div className="flex items-center gap-1.5 ml-2">
                  {item.statusDot && (
                    <span className={`w-1.5 h-1.5 rounded-full ${item.statusDot}`} />
                  )}
                  {item.badge && (
                    <span
                      className={`text-[10px] px-1.5 py-0.2 rounded border font-mono ${
                        item.badgeColor ??
                        'bg-[#0D0D0D] text-[#B3B3B3] border-[#222222]'
                      }`}
                    >
                      {item.badge}
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </nav>
      </div>

      {/* Quick Specs Footer */}
      <div className="hidden md:block mt-4 pt-3 border-t border-[#222222] px-2 text-[10px] text-[#8A8A8A] space-y-1">
        <div>PROTOCOL: JSON REST/WS</div>
        <div>STALE TIMEOUT: 10 SEC</div>
        <div>OFFLINE TIMEOUT: 30 SEC</div>
      </div>
    </aside>
  );
};
