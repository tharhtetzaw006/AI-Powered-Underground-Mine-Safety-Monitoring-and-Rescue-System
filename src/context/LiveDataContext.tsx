/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * LiveDataProvider: The ONLY data source for the mine-rescue monitoring dashboard.
 * - Receives telemetry strictly from real hardware via backend API / WebSocket.
 * - No mock data.
 * - No simulated data generators.
 * - Preserves null/undefined sensor values without conversion to zero.
 */

import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
import { SensorTelemetry, NodeStatus, GatewayStats, SystemEventLog } from '../types/telemetry.ts';
import { liveTelemetryService, ConnectionStatus } from '../services/telemetryService.ts';
import { realTelemetryProcessor, RealTelemetryProcessor } from '../services/realTelemetryProcessor.ts';
import { DerivedSensorMetrics } from '../types/signalProcessing.ts';

export interface LiveDataContextValue {
  connectionStatus: ConnectionStatus;
  connectionError: string | null;
  nodes: NodeStatus[];
  activeNodeId: string | null;
  setActiveNodeId: (nodeId: string | null) => void;
  latestTelemetryByNode: Record<string, SensorTelemetry>;
  activeTelemetry: SensorTelemetry | null;
  derivedMetricsByNode: Record<string, DerivedSensorMetrics>;
  activeDerivedMetrics: DerivedSensorMetrics | null;
  telemetryHistory: SensorTelemetry[];
  systemEvents: SystemEventLog[];
  gatewayStats: GatewayStats | null;
  lastUpdateTime: number | null;
  realTelemetryProcessor: RealTelemetryProcessor;
  sendManualPacket: (packet: unknown) => Promise<{ success: boolean; message: string }>;
  refresh: () => Promise<void>;
}

const LiveDataContext = createContext<LiveDataContextValue | null>(null);

export const LiveDataProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('CONNECTING');
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [nodes, setNodes] = useState<NodeStatus[]>([]);
  const [activeNodeId, setActiveNodeId] = useState<string | null>(null);
  const [latestTelemetryByNode, setLatestTelemetryByNode] = useState<Record<string, SensorTelemetry>>({});
  const [derivedMetricsByNode, setDerivedMetricsByNode] = useState<Record<string, DerivedSensorMetrics>>({});
  const [telemetryHistory, setTelemetryHistory] = useState<SensorTelemetry[]>([]);
  const [systemEvents, setSystemEvents] = useState<SystemEventLog[]>([]);
  const [gatewayStats, setGatewayStats] = useState<GatewayStats | null>(null);
  const [lastUpdateTime, setLastUpdateTime] = useState<number | null>(null);

  // Auto-select first active node if activeNodeId is null or becomes invalid
  useEffect(() => {
    if (nodes.length > 0) {
      if (!activeNodeId || !nodes.some((n) => n.nodeId === activeNodeId)) {
        setActiveNodeId(nodes[0].nodeId);
      }
    } else {
      setActiveNodeId(null);
      realTelemetryProcessor.clearAll();
      setDerivedMetricsByNode({});
    }
  }, [nodes, activeNodeId]);

  useEffect(() => {
    // Start live telemetry transport service
    liveTelemetryService.connect();

    const unsubConnection = liveTelemetryService.onConnectionChange((status, error) => {
      setConnectionStatus(status);
      setConnectionError(error || null);
    });

    const unsubNodes = liveTelemetryService.onNodeStatus((newNodes) => {
      setNodes(newNodes);
      if (newNodes.length === 0) {
        realTelemetryProcessor.clearAll();
        setDerivedMetricsByNode({});
      }
    });

    const unsubTelemetry = liveTelemetryService.onTelemetry((telemetry) => {
      if (!telemetry || !telemetry.nodeId) return;

      // Event-driven real signal processing on genuine incoming telemetry
      const derived = realTelemetryProcessor.processTelemetry(telemetry);

      setLatestTelemetryByNode((prev) => ({
        ...prev,
        [telemetry.nodeId]: telemetry,
      }));

      setDerivedMetricsByNode((prev) => ({
        ...prev,
        [telemetry.nodeId]: derived,
      }));

      setLastUpdateTime(telemetry.serverReceiveTime);

      setTelemetryHistory((prev) => {
        // Keep up to 50 real incoming packets for history/inspector
        const updated = [telemetry, ...prev];
        return updated.slice(0, 50);
      });
    });

    const unsubStats = liveTelemetryService.onGatewayStats((stats) => {
      setGatewayStats(stats);
    });

    const unsubEvents = liveTelemetryService.onEventLog((event) => {
      setSystemEvents((prev) => {
        const filtered = prev.filter((e) => e.id !== event.id);
        return [event, ...filtered].slice(0, 100);
      });
    });

    return () => {
      unsubConnection();
      unsubNodes();
      unsubTelemetry();
      unsubStats();
      unsubEvents();
      liveTelemetryService.disconnect();
    };
  }, []);

  const refresh = useCallback(async () => {
    try {
      const [fetchedNodes, fetchedStats, fetchedEvents] = await Promise.all([
        liveTelemetryService.fetchAllNodes(),
        liveTelemetryService.fetchGatewayStats(),
        liveTelemetryService.fetchSystemEvents(),
      ]);
      setNodes(fetchedNodes);
      if (fetchedStats) setGatewayStats(fetchedStats);
      if (fetchedEvents) setSystemEvents(fetchedEvents);
      if (fetchedNodes.length === 0) {
        realTelemetryProcessor.clearAll();
        setDerivedMetricsByNode({});
      }
    } catch (err) {
      setConnectionError(err instanceof Error ? err.message : 'Error refreshing telemetry');
    }
  }, []);

  const sendManualPacket = useCallback(async (packet: unknown) => {
    return await liveTelemetryService.sendTelemetryPacket(packet);
  }, []);

  const activeTelemetry = useMemo(() => {
    if (!activeNodeId) return null;
    return latestTelemetryByNode[activeNodeId] || null;
  }, [activeNodeId, latestTelemetryByNode]);

  const activeDerivedMetrics = useMemo(() => {
    if (!activeNodeId) return null;
    return derivedMetricsByNode[activeNodeId] || null;
  }, [activeNodeId, derivedMetricsByNode]);

  const value = useMemo<LiveDataContextValue>(() => ({
    connectionStatus,
    connectionError,
    nodes,
    activeNodeId,
    setActiveNodeId,
    latestTelemetryByNode,
    activeTelemetry,
    derivedMetricsByNode,
    activeDerivedMetrics,
    telemetryHistory,
    systemEvents,
    gatewayStats,
    lastUpdateTime,
    realTelemetryProcessor,
    sendManualPacket,
    refresh,
  }), [
    connectionStatus,
    connectionError,
    nodes,
    activeNodeId,
    latestTelemetryByNode,
    activeTelemetry,
    derivedMetricsByNode,
    activeDerivedMetrics,
    telemetryHistory,
    systemEvents,
    gatewayStats,
    lastUpdateTime,
    sendManualPacket,
    refresh,
  ]);

  return <LiveDataContext.Provider value={value}>{children}</LiveDataContext.Provider>;
};

export const useLiveData = (): LiveDataContextValue => {
  const context = useContext(LiveDataContext);
  if (!context) {
    throw new Error('useLiveData must be used within a LiveDataProvider');
  }
  return context;
};
