import React from 'react';
import { useLiveData } from '../context/LiveDataContext.tsx';
import { StatusBadge } from './StatusBadge.tsx';
import { Radio, Battery, Wifi } from 'lucide-react';

export const NodeSelector: React.FC = () => {
  const { nodes, activeNodeId, setActiveNodeId } = useLiveData();

  const formatLastSeen = (lastSeen: number | null) => {
    if (!lastSeen) return 'Never';
    const elapsedSec = Math.floor((Date.now() - lastSeen) / 1000);
    if (elapsedSec < 1) return '< 1s ago';
    if (elapsedSec < 60) return `${elapsedSec}s ago`;
    const elapsedMin = Math.floor(elapsedSec / 60);
    return `${elapsedMin}m ${elapsedSec % 60}s ago`;
  };

  return (
    <div className="bg-[#080808] border border-[#222222] rounded p-3 font-mono">
      <div className="flex items-center justify-between mb-2.5 pb-2 border-b border-[#222222]">
        <div className="flex items-center gap-2">
          <Radio className="w-4 h-4 text-[#38BDF8]" />
          <h2 className="text-xs font-bold tracking-wider uppercase text-[#FFFFFF]">
            Field Rescue Nodes ({nodes.length})
          </h2>
        </div>
        <span className="text-[11px] text-[#8A8A8A]">
          AUTO-DISCOVERED VIA TELEMETRY
        </span>
      </div>

      {nodes.length === 0 ? (
        <div className="text-center py-5 px-4 border border-dashed border-[#222222] rounded bg-[#000000]">
          <Radio className="w-6 h-6 mx-auto text-[#8A8A8A] mb-1.5" />
          <p className="text-xs text-[#FFFFFF] font-semibold uppercase tracking-wider">
            NO FIELD NODES REGISTERED
          </p>
          <p className="text-[11px] text-[#B3B3B3] mt-1 max-w-md mx-auto">
            Awaiting real telemetry packets from ESP32 gateway. Send telemetry via POST /api/telemetry to register.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
          {nodes.map((node) => {
            const isSelected = node.nodeId === activeNodeId;
            return (
              <button
                key={node.nodeId}
                type="button"
                onClick={() => setActiveNodeId(node.nodeId)}
                className={`p-2.5 rounded text-left transition-colors border font-mono ${
                  isSelected
                    ? 'bg-[#111111] border-[#38BDF8] text-[#FFFFFF]'
                    : 'bg-[#000000] hover:bg-[#0D0D0D] border-[#222222] text-[#B3B3B3]'
                }`}
              >
                <div className="flex items-center justify-between gap-1 mb-1.5">
                  <span className="text-xs font-bold text-[#FFFFFF] tracking-wider truncate">
                    {node.nodeId}
                  </span>
                  <StatusBadge status={node.status} size="xs" />
                </div>

                <div className="grid grid-cols-2 gap-1.5 text-[11px] text-[#B3B3B3]">
                  <div className="flex items-center gap-1">
                    <Wifi className="w-3 h-3 text-[#8A8A8A]" />
                    <span>{node.rssi !== null ? `${node.rssi} dBm` : '--'}</span>
                  </div>
                  <div className="flex items-center gap-1 justify-end">
                    <Battery className="w-3 h-3 text-[#8A8A8A]" />
                    <span>{node.battery !== null ? `${node.battery}%` : '--'}</span>
                  </div>
                </div>

                <div className="mt-1.5 pt-1.5 border-t border-[#222222] flex items-center justify-between text-[10px] text-[#8A8A8A]">
                  <span>LAST SEEN:</span>
                  <span className="text-[#B3B3B3] font-medium">{formatLastSeen(node.lastSeen)}</span>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
