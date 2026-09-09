import React, { useState } from 'react';
import { useLiveData } from '../context/LiveDataContext.tsx';
import { Activity, Radio, ShieldCheck, Clock, AlertTriangle, CheckCircle2, XCircle, ListFilter, RefreshCw } from 'lucide-react';
import { SystemEventType } from '../types/telemetry.ts';

interface SensorDiagnosticsPanelProps {
  id?: string;
}

export const SensorDiagnosticsPanel: React.FC<SensorDiagnosticsPanelProps> = ({ id }) => {
  const { nodes, activeNodeId, systemEvents, refresh } = useLiveData();
  const [selectedEventType, setSelectedEventType] = useState<string>('ALL');

  const activeNode = nodes.find((n) => n.nodeId === activeNodeId);

  const formatTimestamp = (ts: number | null | undefined) => {
    if (!ts) return '--';
    const d = new Date(ts);
    return `${d.toLocaleTimeString(undefined, {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })}.${String(d.getMilliseconds()).padStart(3, '0')}`;
  };

  const formatAge = (ts: number | null | undefined) => {
    if (!ts) return 'NEVER';
    const sec = Math.floor((Date.now() - ts) / 1000);
    if (sec < 1) return '< 1s ago';
    if (sec < 60) return `${sec}s ago`;
    const min = Math.floor(sec / 60);
    return `${min}m ${sec % 60}s ago`;
  };

  const getAvailabilityBadge = (status?: string) => {
    if (status === 'AVAILABLE') {
      return (
        <span className="inline-flex items-center gap-1 text-[10px] text-[#22C55E] bg-[#071a0e] px-1.5 py-0.5 rounded border border-[#1b4d29] font-bold">
          <CheckCircle2 className="w-2.5 h-2.5" />
          AVAILABLE
        </span>
      );
    }
    if (status === 'PARTIAL') {
      return (
        <span className="inline-flex items-center gap-1 text-[10px] text-[#F59E0B] bg-[#1a1205] px-1.5 py-0.5 rounded border border-[#4d3205] font-bold">
          <AlertTriangle className="w-2.5 h-2.5" />
          PARTIAL
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 text-[10px] text-[#8A8A8A] bg-[#111111] px-1.5 py-0.5 rounded border border-[#222222]">
        <XCircle className="w-2.5 h-2.5 text-[#8A8A8A]" />
        NO DATA
      </span>
    );
  };

  const filteredEvents = systemEvents.filter((ev) => {
    if (selectedEventType === 'ALL') return true;
    return ev.type === selectedEventType;
  });

  return (
    <div id={id} className="bg-[#080808] border border-[#222222] rounded p-3.5 font-mono text-xs">
      {/* Panel Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2.5 mb-3 border-b border-[#222222]">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-[#38BDF8]" />
          <h3 className="text-xs font-bold uppercase tracking-wider text-[#FFFFFF]">
            Hardware Validation & Sensor Diagnostics
          </h3>
          {activeNodeId && (
            <span className="text-[10px] text-[#38BDF8] bg-[#0d2230] px-1.5 py-0.5 rounded border border-[#184e70]">
              NODE: {activeNodeId}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => refresh()}
            className="flex items-center gap-1 text-[10px] px-2 py-1 bg-[#111111] hover:bg-[#1a1a1a] text-[#B3B3B3] hover:text-[#FFFFFF] rounded border border-[#222222] transition-colors"
          >
            <RefreshCw className="w-3 h-3" />
            REFRESH
          </button>
        </div>
      </div>

      {!activeNode ? (
        <div className="text-center py-6 text-xs text-[#8A8A8A] border border-dashed border-[#222222] rounded bg-[#000000]">
          NO ACTIVE NODE SELECTED FOR SENSOR DIAGNOSTICS
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mb-3">
          {/* Left Column: Real Sensor Availability & Freshness */}
          <div className="space-y-2">
            <div className="text-[11px] font-bold text-[#FFFFFF] flex items-center justify-between">
              <span>ACTIVE SENSOR SUBSYSTEMS</span>
              <span className="text-[10px] text-[#8A8A8A] font-normal">REAL TELEMETRY VALIDATION</span>
            </div>

            <div className="bg-[#000000] border border-[#222222] rounded divide-y divide-[#1a1a1a]">
              {/* IMU */}
              <div className="p-2 flex items-center justify-between">
                <div>
                  <div className="text-[#FFFFFF] font-semibold text-[11px]">IMU 6-DOF (ACCEL / GYRO)</div>
                  <div className="text-[9px] text-[#8A8A8A]">
                    Last Update: {formatTimestamp(activeNode.freshness?.lastImuUpdate)} (
                    {formatAge(activeNode.freshness?.lastImuUpdate)})
                  </div>
                </div>
                <div>{getAvailabilityBadge(activeNode.sensorAvailability?.imu)}</div>
              </div>

              {/* Distance / Proximity */}
              <div className="p-2 flex items-center justify-between">
                <div>
                  <div className="text-[#FFFFFF] font-semibold text-[11px]">ULTRASONIC / LIDAR RANGE</div>
                  <div className="text-[9px] text-[#8A8A8A]">
                    Last Update: {formatTimestamp(activeNode.freshness?.lastDistanceUpdate)} (
                    {formatAge(activeNode.freshness?.lastDistanceUpdate)})
                  </div>
                </div>
                <div>{getAvailabilityBadge(activeNode.sensorAvailability?.distance)}</div>
              </div>

              {/* Acoustic / Sound */}
              <div className="p-2 flex items-center justify-between">
                <div>
                  <div className="text-[#FFFFFF] font-semibold text-[11px]">ACOUSTIC TRANSDUCER (MIC)</div>
                  <div className="text-[9px] text-[#8A8A8A]">
                    Last Update: {formatTimestamp(activeNode.freshness?.lastAcousticUpdate)} (
                    {formatAge(activeNode.freshness?.lastAcousticUpdate)})
                  </div>
                </div>
                <div>{getAvailabilityBadge(activeNode.sensorAvailability?.acoustic)}</div>
              </div>

              {/* RF Radio */}
              <div className="p-2 flex items-center justify-between">
                <div>
                  <div className="text-[#FFFFFF] font-semibold text-[11px]">RF LINK (RSSI & LOSS)</div>
                  <div className="text-[9px] text-[#8A8A8A]">
                    Last Update: {formatTimestamp(activeNode.freshness?.lastRfUpdate)} (
                    {formatAge(activeNode.freshness?.lastRfUpdate)})
                  </div>
                </div>
                <div>{getAvailabilityBadge(activeNode.sensorAvailability?.rf)}</div>
              </div>

              {/* Battery */}
              <div className="p-2 flex items-center justify-between">
                <div>
                  <div className="text-[#FFFFFF] font-semibold text-[11px]">POWER / BATTERY GAUGE</div>
                  <div className="text-[9px] text-[#8A8A8A]">
                    Last Update: {formatTimestamp(activeNode.freshness?.lastBatteryUpdate)} (
                    {formatAge(activeNode.freshness?.lastBatteryUpdate)})
                  </div>
                </div>
                <div>{getAvailabilityBadge(activeNode.sensorAvailability?.battery)}</div>
              </div>
            </div>
          </div>

          {/* Right Column: Node Ingestion Diagnostics */}
          <div className="space-y-2">
            <div className="text-[11px] font-bold text-[#FFFFFF] flex items-center justify-between">
              <span>LINK QUALITY & TRANSPORT METRICS</span>
              <span className="text-[10px] text-[#8A8A8A] font-normal">NODE {activeNode.nodeId}</span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              <div className="p-2 bg-[#000000] border border-[#222222] rounded">
                <span className="text-[#8A8A8A] text-[9px] block">DATA QUALITY SCORE</span>
                <span
                  className={`text-base font-bold ${
                    (activeNode.dataQualityScore ?? 0) >= 80
                      ? 'text-[#22C55E]'
                      : (activeNode.dataQualityScore ?? 0) >= 50
                      ? 'text-[#F59E0B]'
                      : 'text-[#EF4444]'
                  }`}
                >
                  {activeNode.dataQualityScore !== null && activeNode.dataQualityScore !== undefined
                    ? `${activeNode.dataQualityScore}%`
                    : '--'}
                </span>
                <span className="text-[9px] text-[#8A8A8A] block mt-0.5">COMPOSITE HEALTH</span>
              </div>

              <div className="p-2 bg-[#000000] border border-[#222222] rounded">
                <span className="text-[#8A8A8A] text-[9px] block">INGESTION LATENCY</span>
                <span
                  className={`text-base font-bold ${
                    (activeNode.latencyMs ?? 999) < 100
                      ? 'text-[#22C55E]'
                      : (activeNode.latencyMs ?? 999) < 500
                      ? 'text-[#F59E0B]'
                      : 'text-[#EF4444]'
                  }`}
                >
                  {activeNode.latencyMs !== null && activeNode.latencyMs !== undefined
                    ? `${activeNode.latencyMs} ms`
                    : '--'}
                </span>
                <span className="text-[9px] text-[#8A8A8A] block mt-0.5">HW TO SERVER DELTA</span>
              </div>

              <div className="p-2 bg-[#000000] border border-[#222222] rounded">
                <span className="text-[#8A8A8A] text-[9px] block">PACKET RATE</span>
                <span className="text-base font-bold text-[#38BDF8]">
                  {activeNode.packetRateHz !== null && activeNode.packetRateHz !== undefined
                    ? `${activeNode.packetRateHz.toFixed(1)} Hz`
                    : '--'}
                </span>
                <span className="text-[9px] text-[#8A8A8A] block mt-0.5">SLIDING WINDOW</span>
              </div>

              <div className="p-2 bg-[#000000] border border-[#222222] rounded">
                <span className="text-[#8A8A8A] text-[9px] block">ACCEPTED PACKETS</span>
                <span className="text-sm font-bold text-[#22C55E]">
                  {activeNode.acceptedPacketCount ?? 0}
                </span>
                <span className="text-[9px] text-[#8A8A8A] block mt-0.5">VALID TELEMETRY</span>
              </div>

              <div className="p-2 bg-[#000000] border border-[#222222] rounded">
                <span className="text-[#8A8A8A] text-[9px] block">REJECTED PACKETS</span>
                <span className="text-sm font-bold text-[#EF4444]">
                  {activeNode.rejectedPacketCount ?? 0}
                </span>
                <span className="text-[9px] text-[#8A8A8A] block mt-0.5">MALFORMED / BAD</span>
              </div>

              <div className="p-2 bg-[#000000] border border-[#222222] rounded">
                <span className="text-[#8A8A8A] text-[9px] block">DUPLICATES DETECTED</span>
                <span className="text-sm font-bold text-[#F59E0B]">
                  {activeNode.duplicatePacketsCount ?? 0}
                </span>
                <span className="text-[9px] text-[#8A8A8A] block mt-0.5">DUPLICATE SEQ #</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* System Event Timeline Log */}
      <div className="mt-4 pt-3 border-t border-[#222222]">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
          <div className="flex items-center gap-2">
            <Clock className="w-3.5 h-3.5 text-[#38BDF8]" />
            <span className="text-[11px] font-bold text-[#FFFFFF] uppercase tracking-wider">
              Real-Time Hardware Event Log
            </span>
            <span className="text-[10px] text-[#8A8A8A]">
              ({filteredEvents.length} EVENTS)
            </span>
          </div>

          {/* Filter dropdown */}
          <div className="flex items-center gap-1.5">
            <ListFilter className="w-3 h-3 text-[#8A8A8A]" />
            <select
              value={selectedEventType}
              onChange={(e) => setSelectedEventType(e.target.value)}
              aria-label="Filter events by type"
              className="bg-[#000000] text-[#FFFFFF] text-[10px] rounded border border-[#222222] px-2 py-0.5 focus:outline-none focus:border-[#38BDF8]"
            >
              <option value="ALL">ALL EVENT TYPES</option>
              <option value="PACKET_RECEIVED">PACKET_RECEIVED</option>
              <option value="PACKET_REJECTED">PACKET_REJECTED</option>
              <option value="DUPLICATE_PACKET">DUPLICATE_PACKET</option>
              <option value="OUT_OF_ORDER_PACKET">OUT_OF_ORDER_PACKET</option>
              <option value="NODE_REGISTERED">NODE_REGISTERED</option>
              <option value="NODE_STALE">NODE_STALE</option>
              <option value="NODE_OFFLINE">NODE_OFFLINE</option>
              <option value="WEBSOCKET_CONNECTED">WEBSOCKET_CONNECTED</option>
              <option value="WEBSOCKET_DISCONNECTED">WEBSOCKET_DISCONNECTED</option>
            </select>
          </div>
        </div>

        {filteredEvents.length === 0 ? (
          <div className="text-center py-4 text-xs text-[#8A8A8A] bg-[#000000] border border-[#222222] rounded">
            NO RECENT SYSTEM EVENTS
          </div>
        ) : (
          <div className="space-y-1 max-h-48 overflow-y-auto pr-1">
            {filteredEvents.map((event) => {
              let typeColor = 'text-[#38BDF8] border-[#184e70] bg-[#0d2230]';
              if (event.type === 'PACKET_REJECTED' || event.type === 'NODE_OFFLINE') {
                typeColor = 'text-[#EF4444] border-[#6b1414] bg-[#1f0505]';
              } else if (event.type === 'DUPLICATE_PACKET' || event.type === 'NODE_STALE' || event.type === 'OUT_OF_ORDER_PACKET') {
                typeColor = 'text-[#F59E0B] border-[#5e3805] bg-[#1c1203]';
              } else if (event.type === 'PACKET_RECEIVED' || event.type === 'NODE_REGISTERED') {
                typeColor = 'text-[#22C55E] border-[#1b4d29] bg-[#071a0e]';
              }

              return (
                <div
                  key={event.id}
                  className="bg-[#000000] border border-[#1a1a1a] rounded px-2.5 py-1.5 flex flex-wrap items-center justify-between gap-2 text-[11px]"
                >
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[#8A8A8A] text-[10px]">
                      {formatTimestamp(event.timestamp)}
                    </span>
                    <span className={`px-1.5 py-0.2 rounded border text-[9px] font-bold ${typeColor}`}>
                      {event.type}
                    </span>
                    {event.nodeId && (
                      <span className="text-[#38BDF8] font-bold">[{event.nodeId}]</span>
                    )}
                    <span className="text-[#B3B3B3]">{event.details}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
