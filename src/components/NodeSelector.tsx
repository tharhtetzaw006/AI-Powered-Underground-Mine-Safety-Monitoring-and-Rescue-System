import React, { useState } from 'react';
import { useLiveData } from '../context/LiveDataContext.tsx';
import { StatusBadge } from './StatusBadge.tsx';
import { Radio, Battery, Wifi, Activity, MapPin } from 'lucide-react';

interface DemoFieldNode {
  nodeId: string;
  status: 'ONLINE';
  battery: number;
  rssi: number;
  packetLoss: string;
  sensors: 'HEALTHY' | 'WARNING';
  zone: string;
  lastTelemetry: string;
}

const DEMO_FIELD_NODES: DemoFieldNode[] = [
  {
    nodeId: 'NODE-01',
    status: 'ONLINE',
    battery: 94,
    rssi: -67,
    packetLoss: '0.8%',
    sensors: 'HEALTHY',
    zone: 'TUNNEL-A',
    lastTelemetry: '2s ago',
  },
  {
    nodeId: 'NODE-02',
    status: 'ONLINE',
    battery: 87,
    rssi: -72,
    packetLoss: '1.2%',
    sensors: 'HEALTHY',
    zone: 'TUNNEL-B',
    lastTelemetry: '4s ago',
  },
  {
    nodeId: 'NODE-03',
    status: 'ONLINE',
    battery: 76,
    rssi: -81,
    packetLoss: '2.1%',
    sensors: 'WARNING',
    zone: 'TUNNEL-C',
    lastTelemetry: '7s ago',
  },
  {
    nodeId: 'NODE-04',
    status: 'ONLINE',
    battery: 91,
    rssi: -69,
    packetLoss: '0.5%',
    sensors: 'HEALTHY',
    zone: 'SHAFT-01',
    lastTelemetry: '1s ago',
  },
];

export const NodeSelector: React.FC = () => {
  const { nodes, activeNodeId, setActiveNodeId } = useLiveData();
  const [isDemoMode, setIsDemoMode] = useState<boolean>(false);
  const [selectedDemoNodeId, setSelectedDemoNodeId] = useState<string>('NODE-01');

  const formatLastSeen = (lastSeen: number | null) => {
    if (!lastSeen) return 'Never';
    const elapsedSec = Math.floor((Date.now() - lastSeen) / 1000);
    if (elapsedSec < 1) return '< 1s ago';
    if (elapsedSec < 60) return `${elapsedSec}s ago`;
    const elapsedMin = Math.floor(elapsedSec / 60);
    return `${elapsedMin}m ${elapsedSec % 60}s ago`;
  };

  const showDemoNodes = isDemoMode && nodes.length === 0;

  return (
    <div className="bg-[#080808] border border-[#222222] rounded p-3 font-mono">
      {/* Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2.5 pb-2 border-b border-[#222222]">
        <div className="flex items-center gap-2">
          <Radio className="w-4 h-4 text-[#38BDF8]" />
          <h2 className="text-xs font-bold tracking-wider uppercase text-[#FFFFFF]">
            Field Rescue Nodes ({showDemoNodes ? '4' : nodes.length})
          </h2>
        </div>

        <div className="flex items-center gap-3">
          <span className="hidden sm:inline text-[11px] text-[#8A8A8A]">
            AUTO-DISCOVERED VIA TELEMETRY
          </span>

          {/* Compact Demo Mode Button */}
          <button
            type="button"
            id="field-nodes-demo-toggle-btn"
            onClick={() => setIsDemoMode((prev) => !prev)}
            className={`flex items-center gap-1.5 px-2 py-1 rounded text-[10px] font-bold tracking-wider uppercase transition-colors border cursor-pointer ${
              isDemoMode
                ? 'bg-[#F59E0B] text-[#000000] border-[#F59E0B] hover:bg-[#F59E0B]/90 shadow-[0_0_8px_rgba(245,158,11,0.5)]'
                : 'bg-[#111111] text-[#FFFFFF] border-[#38BDF8]/60 hover:bg-[#38BDF8] hover:text-[#000000]'
            }`}
            title="Toggle Field Nodes Presentation Demo Mode"
          >
            <Radio className="w-3 h-3" />
            <span>DEMO MODE: {isDemoMode ? 'ON' : 'OFF'}</span>
          </button>
        </div>
      </div>

      {/* When DEMO MODE is ON and no real nodes: Show Demo Node Cards */}
      {showDemoNodes ? (
        <div className="space-y-2">
          {/* 4 Field Node Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
            {DEMO_FIELD_NODES.map((node) => {
              const isSelected = node.nodeId === selectedDemoNodeId;
              return (
                <div
                  key={node.nodeId}
                  onClick={() => setSelectedDemoNodeId(node.nodeId)}
                  className={`p-2.5 rounded text-left transition-colors border font-mono cursor-pointer ${
                    isSelected
                      ? 'bg-[#0E0B04] border-[#F59E0B] text-[#FFFFFF]'
                      : 'bg-[#000000] hover:bg-[#080808] border-[#222222] text-[#B3B3B3]'
                  }`}
                >
                  <div className="flex items-center justify-between gap-1 mb-1.5">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-bold text-[#FFFFFF] tracking-wider truncate">
                        {node.nodeId}
                      </span>
                    </div>
                    <StatusBadge status={node.status} size="xs" />
                  </div>

                  <div className="grid grid-cols-2 gap-1.5 text-[11px] text-[#B3B3B3]">
                    <div className="flex items-center gap-1">
                      <Wifi className="w-3 h-3 text-[#8A8A8A]" />
                      <span>RSSI: <strong className="text-[#FFFFFF]">{node.rssi} dBm</strong></span>
                    </div>
                    <div className="flex items-center gap-1 justify-end">
                      <Battery className="w-3 h-3 text-[#8A8A8A]" />
                      <span>BATTERY: <strong className="text-[#FFFFFF]">{node.battery}%</strong></span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Activity className="w-3 h-3 text-[#8A8A8A]" />
                      <span>PKT LOSS: <strong className="text-[#FFFFFF]">{node.packetLoss}</strong></span>
                    </div>
                    <div className="flex items-center gap-1 justify-end">
                      <span className="text-[#8A8A8A]">SENSORS:</span>
                      <span className={`font-bold ${node.sensors === 'HEALTHY' ? 'text-[#22C55E]' : 'text-[#F59E0B]'}`}>
                        {node.sensors}
                      </span>
                    </div>
                  </div>

                  <div className="mt-2 pt-1.5 border-t border-[#222222] flex items-center justify-between text-[10px] text-[#8A8A8A]">
                    <div className="flex items-center gap-1">
                      <MapPin className="w-3 h-3 text-[#38BDF8]" />
                      <span className="text-[#E2E8F0] font-semibold">ZONE: {node.zone}</span>
                    </div>
                    <div>
                      <span>SEEN: </span>
                      <span className="text-[#B3B3B3] font-medium">{node.lastTelemetry}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : nodes.length === 0 ? (
        /* Original Empty State (Preserved exactly when DEMO MODE is OFF and no real nodes) */
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
        /* Real Nodes Grid (Preserved exactly when real nodes exist) */
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
