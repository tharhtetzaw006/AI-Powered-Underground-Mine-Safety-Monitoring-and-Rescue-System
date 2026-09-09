import React from 'react';
import { useLiveData } from '../context/LiveDataContext.tsx';
import { NodeStatus } from '../types/telemetry.ts';
import { StatusBadge } from './StatusBadge.tsx';
import { Radio, Wifi, Battery, CheckCircle2, ChevronRight, Activity } from 'lucide-react';
import { EmptyState } from './EmptyState.tsx';

interface NodeStatusTableProps {
  id?: string;
  onSelectNode?: (nodeId: string) => void;
}

export const NodeStatusTable: React.FC<NodeStatusTableProps> = ({ id, onSelectNode }) => {
  const { nodes, activeNodeId, setActiveNodeId } = useLiveData();

  const handleSelect = (nodeId: string) => {
    setActiveNodeId(nodeId);
    if (onSelectNode) onSelectNode(nodeId);
  };

  const formatLastSeen = (ts: number | null) => {
    if (!ts) return 'NEVER';
    const elapsedSec = Math.floor((Date.now() - ts) / 1000);
    if (elapsedSec < 1) return '< 1s AGO';
    if (elapsedSec < 60) return `${elapsedSec}s AGO`;
    const elapsedMin = Math.floor(elapsedSec / 60);
    return `${elapsedMin}m ${elapsedSec % 60}s AGO`;
  };

  const getRssiStatus = (rssi: number | null): 'success' | 'warning' | 'critical' | 'neutral' => {
    if (rssi === null) return 'neutral';
    if (rssi >= -70) return 'success';
    if (rssi >= -90) return 'warning';
    return 'critical';
  };

  const getBatteryStatus = (battery: number | null): 'success' | 'warning' | 'critical' | 'neutral' => {
    if (battery === null) return 'neutral';
    if (battery >= 40) return 'success';
    if (battery >= 20) return 'warning';
    return 'critical';
  };

  if (nodes.length === 0) {
    return (
      <EmptyState
        id={id}
        icon={Radio}
        title="NO NODES REGISTERED"
        message="No active or historic field nodes registered in the gateway. Field nodes are auto-discovered as soon as valid telemetry is received."
        secondaryNote="POST /api/telemetry with nodeId to register a node"
      />
    );
  }

  return (
    <div id={id} className="border border-[#222222] bg-[#080808] rounded overflow-hidden font-mono text-xs">
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-[#222222] bg-[#0D0D0D] text-[#B3B3B3] text-[11px] uppercase tracking-wider select-none">
              <th className="py-2.5 px-3">Node ID</th>
              <th className="py-2.5 px-3">Status</th>
              <th className="py-2.5 px-3">Last Seen</th>
              <th className="py-2.5 px-3">Rate</th>
              <th className="py-2.5 px-3">Latency</th>
              <th className="py-2.5 px-3">Quality</th>
              <th className="py-2.5 px-3">RSSI</th>
              <th className="py-2.5 px-3">Battery</th>
              <th className="py-2.5 px-3">Sensor Health</th>
              <th className="py-2.5 px-3 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#222222]">
            {nodes.map((node) => {
              const isActive = node.nodeId === activeNodeId;
              const rssiLevel = getRssiStatus(node.rssi);
              const battLevel = getBatteryStatus(node.battery);

              return (
                <tr
                  key={node.nodeId}
                  onClick={() => handleSelect(node.nodeId)}
                  className={`cursor-pointer transition-colors ${
                    isActive
                      ? 'bg-[#111111] text-[#FFFFFF]'
                      : 'hover:bg-[#0D0D0D] text-[#B3B3B3]'
                  }`}
                >
                  {/* Node ID */}
                  <td className="py-2.5 px-3">
                    <div className="flex items-center gap-2">
                      <span
                        className={`w-2 h-2 rounded-full shrink-0 ${
                          node.status === 'ONLINE'
                            ? 'bg-[#22C55E]'
                            : node.status === 'STALE'
                            ? 'bg-[#F59E0B]'
                            : 'bg-[#EF4444]'
                        }`}
                      />
                      <span className="font-bold text-[#FFFFFF] tracking-wider">
                        {node.nodeId}
                      </span>
                      {isActive && (
                        <span className="text-[10px] px-1.5 py-0.2 rounded bg-[#38BDF8]/20 text-[#38BDF8] border border-[#38BDF8]/40 uppercase font-semibold">
                          ACTIVE
                        </span>
                      )}
                    </div>
                  </td>

                  {/* Status */}
                  <td className="py-2.5 px-3">
                    <StatusBadge status={node.status} size="xs" />
                  </td>

                  {/* Last Seen */}
                  <td className="py-2.5 px-3 text-[11px] text-[#B3B3B3]">
                    {formatLastSeen(node.lastSeen)}
                  </td>

                  {/* Packet Rate */}
                  <td className="py-2.5 px-3 text-[11px]">
                    {node.packetRateHz !== null && node.packetRateHz !== undefined ? (
                      <span className="text-[#38BDF8] font-semibold">
                        {node.packetRateHz.toFixed(1)} <span className="text-[10px] text-[#8A8A8A]">Hz</span>
                      </span>
                    ) : (
                      <span className="text-[#8A8A8A]">--</span>
                    )}
                  </td>

                  {/* Latency */}
                  <td className="py-2.5 px-3 text-[11px]">
                    {node.latencyMs !== null && node.latencyMs !== undefined ? (
                      <span
                        className={`font-semibold ${
                          node.latencyMs < 100
                            ? 'text-[#22C55E]'
                            : node.latencyMs < 500
                            ? 'text-[#F59E0B]'
                            : 'text-[#EF4444]'
                        }`}
                      >
                        {node.latencyMs} <span className="text-[10px] text-[#8A8A8A]">ms</span>
                      </span>
                    ) : (
                      <span className="text-[#8A8A8A]">--</span>
                    )}
                  </td>

                  {/* Quality Score */}
                  <td className="py-2.5 px-3 text-[11px]">
                    {node.dataQualityScore !== null && node.dataQualityScore !== undefined ? (
                      <span
                        className={`font-semibold ${
                          node.dataQualityScore >= 80
                            ? 'text-[#22C55E]'
                            : node.dataQualityScore >= 50
                            ? 'text-[#F59E0B]'
                            : 'text-[#EF4444]'
                        }`}
                      >
                        {node.dataQualityScore}%
                      </span>
                    ) : (
                      <span className="text-[#8A8A8A]">--</span>
                    )}
                  </td>

                  {/* RSSI */}
                  <td className="py-2.5 px-3">
                    {node.rssi !== null ? (
                      <span
                        className={`font-semibold ${
                          rssiLevel === 'success'
                            ? 'text-[#22C55E]'
                            : rssiLevel === 'warning'
                            ? 'text-[#F59E0B]'
                            : 'text-[#EF4444]'
                        }`}
                      >
                        {node.rssi} <span className="text-[10px] text-[#8A8A8A] font-normal">dBm</span>
                      </span>
                    ) : (
                      <span className="text-[#8A8A8A]">--</span>
                    )}
                  </td>

                  {/* Battery */}
                  <td className="py-2.5 px-3">
                    {node.battery !== null ? (
                      <span
                        className={`font-semibold ${
                          battLevel === 'success'
                            ? 'text-[#22C55E]'
                            : battLevel === 'warning'
                            ? 'text-[#F59E0B]'
                            : 'text-[#EF4444]'
                        }`}
                      >
                        {node.battery}%
                      </span>
                    ) : (
                      <span className="text-[#8A8A8A]">--</span>
                    )}
                  </td>

                  {/* Sensor Health */}
                  <td className="py-2.5 px-3">
                    <div className="flex items-center gap-1.5">
                      <span
                        title={`IMU: ${node.sensorHealth.imu}`}
                        className={`px-1.5 py-0.5 rounded text-[10px] uppercase font-semibold border ${
                          node.sensorHealth.imu === 'HEALTHY'
                            ? 'bg-[#071a0e] text-[#22C55E] border-[#1b4d29]'
                            : node.sensorHealth.imu === 'DEGRADED'
                            ? 'bg-[#1c1203] text-[#F59E0B] border-[#5e3805]'
                            : node.sensorHealth.imu === 'ERROR'
                            ? 'bg-[#1f0505] text-[#EF4444] border-[#6b1414]'
                            : 'bg-[#0D0D0D] text-[#8A8A8A] border-[#222222]'
                        }`}
                      >
                        IMU: {node.sensorHealth.imu}
                      </span>
                      <span
                        title={`PROX: ${node.sensorHealth.distance}`}
                        className={`px-1.5 py-0.5 rounded text-[10px] uppercase font-semibold border ${
                          node.sensorHealth.distance === 'HEALTHY'
                            ? 'bg-[#071a0e] text-[#22C55E] border-[#1b4d29]'
                            : node.sensorHealth.distance === 'DEGRADED'
                            ? 'bg-[#1c1203] text-[#F59E0B] border-[#5e3805]'
                            : node.sensorHealth.distance === 'ERROR'
                            ? 'bg-[#1f0505] text-[#EF4444] border-[#6b1414]'
                            : 'bg-[#0D0D0D] text-[#8A8A8A] border-[#222222]'
                        }`}
                      >
                        PROX: {node.sensorHealth.distance}
                      </span>
                    </div>
                  </td>

                  {/* Action */}
                  <td className="py-2.5 px-3 text-right">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSelect(node.nodeId);
                      }}
                      className={`px-2.5 py-1 rounded text-[11px] font-mono uppercase tracking-wider font-semibold border transition-colors ${
                        isActive
                          ? 'bg-[#38BDF8]/20 border-[#38BDF8] text-[#38BDF8]'
                          : 'bg-[#0D0D0D] border-[#222222] text-[#B3B3B3] hover:text-[#FFFFFF] hover:border-[#38BDF8]/60'
                      }`}
                    >
                      {isActive ? 'SELECTED' : 'SELECT'}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
