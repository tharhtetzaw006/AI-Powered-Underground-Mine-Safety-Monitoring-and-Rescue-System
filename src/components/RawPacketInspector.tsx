import React, { useState } from 'react';
import { useLiveData } from '../context/LiveDataContext.tsx';
import { Terminal, CheckCircle2, Copy, Check, ChevronDown, ChevronRight, Activity, Clock, ShieldCheck } from 'lucide-react';
import { SensorTelemetry } from '../types/telemetry.ts';

export const RawPacketInspector: React.FC = () => {
  const { telemetryHistory, gatewayStats, activeNodeId } = useLiveData();
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [expandedIndex, setExpandedIndex] = useState<number | null>(0);
  const [filterActiveNodeOnly, setFilterActiveNodeOnly] = useState(false);

  const packetsToDisplay = filterActiveNodeOnly && activeNodeId
    ? telemetryHistory.filter((p) => p.nodeId === activeNodeId)
    : telemetryHistory;

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const formatTimestamp = (ts: number | null) => {
    if (!ts) return '--';
    const d = new Date(ts);
    return `${d.toLocaleTimeString(undefined, {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })}.${String(d.getMilliseconds()).padStart(3, '0')}`;
  };

  const calculatePacketLatency = (packet: SensorTelemetry): string => {
    if (packet.timestamp === null || packet.timestamp === undefined) return '--';
    let hwMs: number | null = null;
    if (typeof packet.timestamp === 'number') {
      if (packet.timestamp > 1600000000000 && packet.timestamp <= packet.serverReceiveTime + 60000) {
        hwMs = packet.timestamp;
      }
    } else if (typeof packet.timestamp === 'string') {
      const parsed = Date.parse(packet.timestamp);
      if (!isNaN(parsed) && parsed > 1600000000000 && parsed <= packet.serverReceiveTime + 60000) {
        hwMs = parsed;
      }
    }
    if (hwMs !== null) {
      const diff = Math.max(0, packet.serverReceiveTime - hwMs);
      return `${diff} ms`;
    }
    return '--';
  };

  const getReceivedFields = (p: SensorTelemetry): string[] => {
    const fields: string[] = [];
    if (p.acceleration && (p.acceleration.x !== null || p.acceleration.y !== null || p.acceleration.z !== null)) {
      fields.push('ACCEL');
    }
    if (p.gyroscope && (p.gyroscope.x !== null || p.gyroscope.y !== null || p.gyroscope.z !== null)) {
      fields.push('GYRO');
    }
    if (p.distance !== null && p.distance !== undefined) {
      fields.push('DIST');
    }
    if (p.soundLevel !== null && p.soundLevel !== undefined) {
      fields.push('SOUND');
    }
    if (p.rssi !== null || p.packetLoss !== null) {
      fields.push('RF');
    }
    if (p.battery !== null && p.battery !== undefined) {
      fields.push('BATT');
    }
    return fields;
  };

  return (
    <div className="bg-[#080808] border border-[#222222] rounded p-3.5 font-mono text-xs">
      {/* Header and Diagnostics */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2.5 mb-3 border-b border-[#222222]">
        <div className="flex items-center gap-2">
          <Terminal className="w-4 h-4 text-[#38BDF8]" />
          <h3 className="text-xs font-bold uppercase tracking-wider text-[#FFFFFF]">
            Real Hardware Packet Inspector
          </h3>
          <span className="text-[10px] text-[#8A8A8A]">
            ({packetsToDisplay.length} BUFFERED)
          </span>
        </div>

        {activeNodeId && (
          <label className="flex items-center gap-1.5 text-xs text-[#B3B3B3] cursor-pointer">
            <input
              type="checkbox"
              checked={filterActiveNodeOnly}
              onChange={(e) => setFilterActiveNodeOnly(e.target.checked)}
              className="rounded bg-[#000000] border-[#222222] text-[#38BDF8] focus:ring-0"
            />
            <span>Filter for Node {activeNodeId}</span>
          </label>
        )}
      </div>

      {/* Gateway Communication Metrics Ribbon */}
      {gatewayStats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2 mb-3 text-[11px] bg-[#000000] p-2 rounded border border-[#222222]">
          <div>
            <span className="text-[#8A8A8A] block text-[9px]">VALID PACKETS</span>
            <span className="text-[#22C55E] font-bold">{gatewayStats.totalPacketsAccepted}</span>
          </div>
          <div>
            <span className="text-[#8A8A8A] block text-[9px]">REJECTED</span>
            <span className="text-[#EF4444] font-bold">{gatewayStats.totalPacketsRejected}</span>
          </div>
          <div>
            <span className="text-[#8A8A8A] block text-[9px]">DUPLICATES</span>
            <span className="text-[#F59E0B] font-bold">{gatewayStats.totalDuplicatesDetected}</span>
          </div>
          <div>
            <span className="text-[#8A8A8A] block text-[9px]">OUT-OF-ORDER</span>
            <span className="text-[#B3B3B3] font-bold">{gatewayStats.totalOutOfOrderDetected ?? 0}</span>
          </div>
          <div>
            <span className="text-[#8A8A8A] block text-[9px]">ACTIVE NODES</span>
            <span className="text-[#22C55E] font-bold">{gatewayStats.activeNodesCount ?? 0}</span>
          </div>
          <div>
            <span className="text-[#8A8A8A] block text-[9px]">STALE NODES</span>
            <span className="text-[#F59E0B] font-bold">{gatewayStats.staleNodesCount ?? 0}</span>
          </div>
          <div>
            <span className="text-[#8A8A8A] block text-[9px]">OFFLINE NODES</span>
            <span className="text-[#EF4444] font-bold">{gatewayStats.offlineNodesCount ?? 0}</span>
          </div>
          <div>
            <span className="text-[#8A8A8A] block text-[9px]">PACKETS / SEC</span>
            <span className="text-[#38BDF8] font-bold">
              {gatewayStats.systemPacketRateHz !== null
                ? `${gatewayStats.systemPacketRateHz.toFixed(2)}`
                : 'NO DATA'}
            </span>
          </div>
        </div>
      )}

      {/* Packet List */}
      {packetsToDisplay.length === 0 ? (
        <div className="text-center py-8 text-xs font-mono text-[#8A8A8A] border border-dashed border-[#222222] rounded bg-[#000000] flex flex-col items-center justify-center gap-2">
          <Terminal className="w-5 h-5 text-[#8A8A8A]" />
          <span className="font-bold text-[#FFFFFF] tracking-wider">NO REAL PACKETS RECEIVED</span>
          <span className="text-[11px] text-[#8A8A8A]">Awaiting hardware telemetry transmission from ESP32 gateway over Wi-Fi/LAN</span>
        </div>
      ) : (
        <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
          {packetsToDisplay.map((packet, idx) => {
            const isExpanded = expandedIndex === idx;
            const jsonString = JSON.stringify(packet, null, 2);
            const fieldsReceived = getReceivedFields(packet);
            const latencyStr = calculatePacketLatency(packet);
            const ageSeconds = ((Date.now() - packet.serverReceiveTime) / 1000).toFixed(1);
            const payloadBytes =
              packet.payloadSize ??
              new TextEncoder().encode(JSON.stringify(packet)).length;

            return (
              <div
                key={`${packet.nodeId}-${packet.serverReceiveTime}-${idx}`}
                className="bg-[#000000] border border-[#222222] rounded text-xs overflow-hidden"
              >
                <div
                  onClick={() => setExpandedIndex(isExpanded ? null : idx)}
                  className="px-3 py-2 flex flex-wrap items-center justify-between gap-2 cursor-pointer hover:bg-[#0D0D0D] transition-colors"
                >
                  <div className="flex items-center gap-2 flex-wrap">
                    {isExpanded ? (
                      <ChevronDown className="w-3.5 h-3.5 text-[#8A8A8A]" />
                    ) : (
                      <ChevronRight className="w-3.5 h-3.5 text-[#8A8A8A]" />
                    )}
                    <span className="text-[#38BDF8] font-bold">[{packet.nodeId}]</span>
                    <span className="text-[#FFFFFF] font-semibold">
                      {packet.sequenceNumber !== null && packet.sequenceNumber !== undefined
                        ? `SEQ #${packet.sequenceNumber}`
                        : 'SEQ #--'}
                    </span>
                    <span className="text-[#8A8A8A] text-[11px]">
                      RX: {formatTimestamp(packet.serverReceiveTime)}
                    </span>
                    <span className="text-[#8A8A8A] text-[10px]">
                      ({ageSeconds}s ago)
                    </span>
                    {packet.rssi !== null && packet.rssi !== undefined && (
                      <span className="text-[#38BDF8] text-[10px] bg-[#0d2230] px-1.5 py-0.5 rounded border border-[#184e70]">
                        RSSI: {packet.rssi} dBm
                      </span>
                    )}
                    <span className="text-[#B3B3B3] text-[10px] bg-[#111111] px-1.5 py-0.5 rounded border border-[#222222]">
                      {payloadBytes} B
                    </span>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    {/* Received fields badges */}
                    <div className="flex items-center gap-1">
                      {fieldsReceived.map((f) => (
                        <span
                          key={f}
                          className="text-[9px] px-1 py-0.5 rounded bg-[#111111] text-[#38BDF8] border border-[#222222]"
                        >
                          {f}
                        </span>
                      ))}
                    </div>

                    <span className="inline-flex items-center gap-1 text-[10px] text-[#22C55E] bg-[#071a0e] px-2 py-0.5 rounded border border-[#1b4d29] font-bold">
                      <CheckCircle2 className="w-3 h-3" />
                      VALID / ACCEPTED
                    </span>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleCopy(jsonString, `${idx}`);
                      }}
                      className="p-1 hover:bg-[#1a1a1a] rounded text-[#B3B3B3] hover:text-[#FFFFFF] transition-colors"
                      title="Copy JSON Payload"
                    >
                      {copiedId === `${idx}` ? (
                        <Check className="w-3.5 h-3.5 text-[#22C55E]" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>
                </div>

                {isExpanded && (
                  <div className="p-3 border-t border-[#222222] bg-[#050505] space-y-3">
                    {/* Parsed Telemetry Values Grid */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 text-[11px] bg-[#000000] p-2.5 rounded border border-[#1f1f1f]">
                      <div>
                        <span className="text-[#8A8A8A] block text-[9px]">NODE ID</span>
                        <span className="text-[#FFFFFF] font-bold">{packet.nodeId}</span>
                      </div>
                      <div>
                        <span className="text-[#8A8A8A] block text-[9px]">SEQUENCE</span>
                        <span className="text-[#FFFFFF] font-bold">
                          {packet.sequenceNumber !== null && packet.sequenceNumber !== undefined ? `#${packet.sequenceNumber}` : '--'}
                        </span>
                      </div>
                      <div>
                        <span className="text-[#8A8A8A] block text-[9px]">RECEIVE TIME</span>
                        <span className="text-[#FFFFFF]">{formatTimestamp(packet.serverReceiveTime)}</span>
                      </div>
                      <div>
                        <span className="text-[#8A8A8A] block text-[9px]">LORA RSSI</span>
                        <span className={packet.rssi !== null ? 'text-[#38BDF8] font-bold' : 'text-[#8A8A8A]'}>
                          {packet.rssi !== null ? `${packet.rssi} dBm` : '--'}
                        </span>
                      </div>
                      <div>
                        <span className="text-[#8A8A8A] block text-[9px]">PAYLOAD SIZE</span>
                        <span className="text-[#FFFFFF] font-bold">{payloadBytes} bytes</span>
                      </div>
                      <div>
                        <span className="text-[#8A8A8A] block text-[9px]">VALIDATION</span>
                        <span className="text-[#22C55E] font-bold">VALID / ACCEPTED</span>
                      </div>
                    </div>

                    {/* Parsed Sensor Values */}
                    <div className="text-[11px] bg-[#000000] p-2.5 rounded border border-[#1f1f1f] space-y-1.5">
                      <div className="text-[10px] text-[#8A8A8A] font-bold uppercase tracking-wider">
                        Parsed Sensor Measurements
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[10px]">
                        <div>
                          <span className="text-[#8A8A8A]">ACCEL (X,Y,Z): </span>
                          <span className="text-[#FFFFFF] font-mono">
                            {packet.acceleration
                              ? `${packet.acceleration.x?.toFixed(2) ?? '--'}, ${packet.acceleration.y?.toFixed(2) ?? '--'}, ${packet.acceleration.z?.toFixed(2) ?? '--'} m/s²`
                              : 'NO DATA'}
                          </span>
                        </div>
                        <div>
                          <span className="text-[#8A8A8A]">GYRO (X,Y,Z): </span>
                          <span className="text-[#FFFFFF] font-mono">
                            {packet.gyroscope
                              ? `${packet.gyroscope.x?.toFixed(2) ?? '--'}, ${packet.gyroscope.y?.toFixed(2) ?? '--'}, ${packet.gyroscope.z?.toFixed(2) ?? '--'} °/s`
                              : 'NO DATA'}
                          </span>
                        </div>
                        <div>
                          <span className="text-[#8A8A8A]">DISTANCE: </span>
                          <span className="text-[#FFFFFF] font-mono">
                            {packet.distance !== null && packet.distance !== undefined
                              ? `${packet.distance.toFixed(2)} m`
                              : 'NO DATA'}
                          </span>
                        </div>
                        <div>
                          <span className="text-[#8A8A8A]">ACOUSTIC: </span>
                          <span className="text-[#FFFFFF] font-mono">
                            {packet.soundLevel !== null && packet.soundLevel !== undefined
                              ? `${packet.soundLevel.toFixed(1)} dB`
                              : 'NO DATA'}
                          </span>
                        </div>
                        <div>
                          <span className="text-[#8A8A8A]">BATTERY: </span>
                          <span className="text-[#FFFFFF] font-mono">
                            {packet.battery !== null && packet.battery !== undefined
                              ? `${packet.battery.toFixed(0)}%`
                              : 'NO DATA'}
                          </span>
                        </div>
                        <div>
                          <span className="text-[#8A8A8A]">HW TIMESTAMP: </span>
                          <span className="text-[#FFFFFF] font-mono">
                            {packet.timestamp !== null && packet.timestamp !== undefined ? `${packet.timestamp}` : '--'}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Raw Ingested JSON */}
                    <div>
                      <div className="text-[10px] text-[#8A8A8A] font-bold uppercase tracking-wider mb-1">
                        Raw Ingested JSON Payload
                      </div>
                      <pre className="text-[11px] text-[#B3B3B3] font-mono overflow-x-auto whitespace-pre bg-[#000000] p-2.5 rounded border border-[#1f1f1f]">
                        {jsonString}
                      </pre>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
