import React, { useState, useMemo } from 'react';
import { useLiveData } from '../context/LiveDataContext.tsx';
import { StatusBadge, AlertSeverity } from './StatusBadge.tsx';
import { ShieldAlert, CheckCircle2, BellOff, Check } from 'lucide-react';
import { EmptyState } from './EmptyState.tsx';
import { SIGNAL_CONFIG } from '../config/signalProcessingConfig.ts';

export interface AlertItem {
  id: string;
  severity: AlertSeverity;
  time: number;
  nodeId: string;
  event: string;
  status: 'ACTIVE' | 'ACKNOWLEDGED';
}

interface AlertListProps {
  id?: string;
}

export const AlertList: React.FC<AlertListProps> = ({ id }) => {
  const { nodes, activeTelemetry, connectionStatus, activeDerivedMetrics } = useLiveData();
  const [acknowledgedIds, setAcknowledgedIds] = useState<Set<string>>(new Set());

  // Deterministically derive real alerts from actual system & hardware state
  const alerts = useMemo<AlertItem[]>(() => {
    const list: AlertItem[] = [];

    // Gateway connection issues
    if (connectionStatus === 'ERROR') {
      list.push({
        id: 'gw-error',
        severity: 'CRITICAL',
        time: Date.now(),
        nodeId: 'GATEWAY',
        event: 'Gateway connection protocol error detected',
        status: acknowledgedIds.has('gw-error') ? 'ACKNOWLEDGED' : 'ACTIVE',
      });
    } else if (connectionStatus === 'DISCONNECTED') {
      list.push({
        id: 'gw-disconnected',
        severity: 'CRITICAL',
        time: Date.now(),
        nodeId: 'GATEWAY',
        event: 'Telemetry gateway disconnected',
        status: acknowledgedIds.has('gw-disconnected') ? 'ACKNOWLEDGED' : 'ACTIVE',
      });
    }

    // Node connection & battery conditions
    nodes.forEach((node) => {
      if (node.status === 'OFFLINE') {
        const alertId = `node-offline-${node.nodeId}`;
        list.push({
          id: alertId,
          severity: 'CRITICAL',
          time: node.lastSeen || Date.now(),
          nodeId: node.nodeId,
          event: 'RF link lost. Node silent for > 30 seconds',
          status: acknowledgedIds.has(alertId) ? 'ACKNOWLEDGED' : 'ACTIVE',
        });
      } else if (node.status === 'STALE') {
        const alertId = `node-stale-${node.nodeId}`;
        list.push({
          id: alertId,
          severity: 'WARNING',
          time: node.lastSeen || Date.now(),
          nodeId: node.nodeId,
          event: 'Telemetry stream stale (> 10s packet silence)',
          status: acknowledgedIds.has(alertId) ? 'ACKNOWLEDGED' : 'ACTIVE',
        });
      }

      if (node.battery !== null) {
        if (node.battery <= 15) {
          const alertId = `node-batt-crit-${node.nodeId}`;
          list.push({
            id: alertId,
            severity: 'CRITICAL',
            time: node.lastSeen || Date.now(),
            nodeId: node.nodeId,
            event: `Critical battery depletion (${node.battery}%)`,
            status: acknowledgedIds.has(alertId) ? 'ACKNOWLEDGED' : 'ACTIVE',
          });
        } else if (node.battery <= 25) {
          const alertId = `node-batt-warn-${node.nodeId}`;
          list.push({
            id: alertId,
            severity: 'WARNING',
            time: node.lastSeen || Date.now(),
            nodeId: node.nodeId,
            event: `Low battery reserve (${node.battery}%)`,
            status: acknowledgedIds.has(alertId) ? 'ACKNOWLEDGED' : 'ACTIVE',
          });
        }
      }

      if (node.packetLoss !== null && node.packetLoss >= 20) {
        const alertId = `node-loss-${node.nodeId}`;
        list.push({
          id: alertId,
          severity: 'WARNING',
          time: node.lastSeen || Date.now(),
          nodeId: node.nodeId,
          event: `Elevated RF packet loss (${node.packetLoss.toFixed(1)}%)`,
          status: acknowledgedIds.has(alertId) ? 'ACKNOWLEDGED' : 'ACTIVE',
        });
      }

      if (node.rssi !== null && node.rssi < -115) {
        const alertId = `node-rf-weak-${node.nodeId}`;
        list.push({
          id: alertId,
          severity: 'WARNING',
          time: node.lastSeen || Date.now(),
          nodeId: node.nodeId,
          event: `Weak LoRa RF link (${node.rssi} dBm${node.snr !== null && node.snr !== undefined ? `, SNR: ${node.snr} dB` : ''})`,
          status: acknowledgedIds.has(alertId) ? 'ACKNOWLEDGED' : 'ACTIVE',
        });
      }
    });

    // Sensor threshold conditions on active telemetry & derived features
    if (activeTelemetry) {
      const accelMag = activeDerivedMetrics?.accelerationMagnitude ?? null;
      if (accelMag !== null && (accelMag > 25.0 || accelMag < 1.0)) {
        const alertId = `sens-accel-${activeTelemetry.nodeId}`;
        list.push({
          id: alertId,
          severity: 'WARNING',
          time: activeTelemetry.serverReceiveTime,
          nodeId: activeTelemetry.nodeId,
          event: `Abnormal measured acceleration (${accelMag.toFixed(2)} m/s²)`,
          status: acknowledgedIds.has(alertId) ? 'ACKNOWLEDGED' : 'ACTIVE',
        });
      }
      if (
        activeTelemetry.distance !== null &&
        activeTelemetry.distance < SIGNAL_CONFIG.DISTANCE.CRITICAL_M
      ) {
        const alertId = `sens-prox-${activeTelemetry.nodeId}`;
        list.push({
          id: alertId,
          severity: 'WARNING',
          time: activeTelemetry.serverReceiveTime,
          nodeId: activeTelemetry.nodeId,
          event: `Obstacle proximity warning (${activeTelemetry.distance.toFixed(2)}m)`,
          status: acknowledgedIds.has(alertId) ? 'ACKNOWLEDGED' : 'ACTIVE',
        });
      }

      if (
        activeTelemetry.soundLevel !== null &&
        activeTelemetry.soundLevel > SIGNAL_CONFIG.ACOUSTIC.HIGH_MIN_DB
      ) {
        const alertId = `sens-sound-${activeTelemetry.nodeId}`;
        list.push({
          id: alertId,
          severity: 'WARNING',
          time: activeTelemetry.serverReceiveTime,
          nodeId: activeTelemetry.nodeId,
          event: `High acoustic level detected (${activeTelemetry.soundLevel.toFixed(1)} dB SPL)`,
          status: acknowledgedIds.has(alertId) ? 'ACKNOWLEDGED' : 'ACTIVE',
        });
      }

      if (activeDerivedMetrics?.sensorQuality === 'ERROR') {
        const alertId = `sens-quality-err-${activeTelemetry.nodeId}`;
        list.push({
          id: alertId,
          severity: 'CRITICAL',
          time: activeTelemetry.serverReceiveTime,
          nodeId: activeTelemetry.nodeId,
          event: 'Sensor signal processing integrity error',
          status: acknowledgedIds.has(alertId) ? 'ACKNOWLEDGED' : 'ACTIVE',
        });
      }
    }

    return list;
  }, [nodes, activeTelemetry, connectionStatus, activeDerivedMetrics, acknowledgedIds]);

  const toggleAcknowledge = (alertId: string) => {
    setAcknowledgedIds((prev) => {
      const next = new Set(prev);
      if (next.has(alertId)) {
        next.delete(alertId);
      } else {
        next.add(alertId);
      }
      return next;
    });
  };

  const formatTime = (ts: number) => {
    const d = new Date(ts);
    return d.toLocaleTimeString(undefined, {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  if (alerts.length === 0) {
    return (
      <EmptyState
        id={id}
        icon={BellOff}
        title="NO ACTIVE ALERTS"
        message="All monitored systems, node RF links, and sensory thresholds are within normal operating tolerances."
        compact
      />
    );
  }

  return (
    <div id={id} className="border border-[#222222] bg-[#080808] rounded overflow-hidden font-mono text-xs">
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-[#222222] bg-[#0D0D0D] text-[#B3B3B3] text-[11px] uppercase tracking-wider select-none">
              <th className="py-2.5 px-3">Severity</th>
              <th className="py-2.5 px-3">Time</th>
              <th className="py-2.5 px-3">Node</th>
              <th className="py-2.5 px-3">Event Description</th>
              <th className="py-2.5 px-3">Status</th>
              <th className="py-2.5 px-3 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#222222]">
            {alerts.map((alert) => {
              const isAck = alert.status === 'ACKNOWLEDGED';
              return (
                <tr
                  key={alert.id}
                  className={`transition-colors ${
                    isAck
                      ? 'bg-[#080808] text-[#8A8A8A]'
                      : alert.severity === 'CRITICAL'
                      ? 'bg-[#1f0505]/40 text-[#FFFFFF]'
                      : 'bg-[#1c1203]/40 text-[#FFFFFF]'
                  }`}
                >
                  {/* Severity */}
                  <td className="py-2.5 px-3">
                    <StatusBadge status={alert.severity} size="xs" />
                  </td>

                  {/* Time */}
                  <td className="py-2.5 px-3 text-[11px] text-[#B3B3B3] whitespace-nowrap">
                    {formatTime(alert.time)}
                  </td>

                  {/* Node */}
                  <td className="py-2.5 px-3 font-semibold text-[#FFFFFF]">
                    {alert.nodeId}
                  </td>

                  {/* Event */}
                  <td className="py-2.5 px-3 font-normal">
                    {alert.event}
                  </td>

                  {/* Status */}
                  <td className="py-2.5 px-3">
                    <StatusBadge status={alert.status} size="xs" />
                  </td>

                  {/* Action */}
                  <td className="py-2.5 px-3 text-right">
                    <button
                      type="button"
                      onClick={() => toggleAcknowledge(alert.id)}
                      className={`px-2 py-1 rounded text-[10px] uppercase font-semibold border transition-colors ${
                        isAck
                          ? 'bg-[#0D0D0D] border-[#222222] text-[#B3B3B3] hover:text-[#FFFFFF]'
                          : 'bg-[#38BDF8]/20 border-[#38BDF8]/60 text-[#38BDF8] hover:bg-[#38BDF8]/30'
                      }`}
                    >
                      {isAck ? 'UNACK' : 'ACK'}
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
