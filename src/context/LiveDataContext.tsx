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
import {
  SensorTelemetry,
  NodeStatus,
  GatewayStats,
  SystemEventLog,
  HumanDetectionResult,
  DetectionEngineStatus,
  DetectionEventRecord,
} from '../types/telemetry.ts';
import { liveTelemetryService, ConnectionStatus } from '../services/telemetryService.ts';
import { realTelemetryProcessor, RealTelemetryProcessor } from '../services/realTelemetryProcessor.ts';
import { DerivedSensorMetrics } from '../types/signalProcessing.ts';
import { fastApiDetectionService } from '../services/fastApiDetectionService.ts';
import { FastApiState, FastApiDetectionHistoryRecord } from '../types/fastApiDetection.ts';
import { radarDetectionService } from '../services/radarDetectionService.ts';
import { RadarState, SensorFusionResult } from '../types/radar.ts';
import { computeSensorFusion } from '../services/sensorFusionService.ts';

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
  detectionsByNode: Record<string, HumanDetectionResult>;
  activeDetection: HumanDetectionResult | null;
  detectionStatus: DetectionEngineStatus | null;
  detectionHistory: DetectionEventRecord[];
  telemetryHistory: SensorTelemetry[];
  systemEvents: SystemEventLog[];
  gatewayStats: GatewayStats | null;
  lastUpdateTime: number | null;
  realTelemetryProcessor: RealTelemetryProcessor;
  fastApiState: FastApiState;
  fastApiHistory: FastApiDetectionHistoryRecord[];
  radarState: RadarState;
  sensorFusionResult: SensorFusionResult;
  ingestRadarTelemetry: (raw: unknown) => boolean;
  refreshRadarStatus: () => Promise<void>;
  refreshFastApi: () => Promise<void>;
  reconnectFastApiWs: () => void;
  sendManualPacket: (packet: unknown) => Promise<{ success: boolean; message: string }>;
  refresh: () => Promise<void>;
  refreshDetection: () => Promise<void>;
}

const LiveDataContext = createContext<LiveDataContextValue | null>(null);

export const LiveDataProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('CONNECTING');
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [nodes, setNodes] = useState<NodeStatus[]>([]);
  const [activeNodeId, setActiveNodeId] = useState<string | null>(null);
  const [latestTelemetryByNode, setLatestTelemetryByNode] = useState<Record<string, SensorTelemetry>>({});
  const [derivedMetricsByNode, setDerivedMetricsByNode] = useState<Record<string, DerivedSensorMetrics>>({});
  const [detectionsByNode, setDetectionsByNode] = useState<Record<string, HumanDetectionResult>>({});
  const [detectionStatus, setDetectionStatus] = useState<DetectionEngineStatus | null>(null);
  const [detectionHistory, setDetectionHistory] = useState<DetectionEventRecord[]>([]);
  const [telemetryHistory, setTelemetryHistory] = useState<SensorTelemetry[]>([]);
  const [systemEvents, setSystemEvents] = useState<SystemEventLog[]>([]);
  const [gatewayStats, setGatewayStats] = useState<GatewayStats | null>(null);
  const [lastUpdateTime, setLastUpdateTime] = useState<number | null>(null);

  // Real remote FastAPI Human Detection state
  const [fastApiState, setFastApiState] = useState<FastApiState>(fastApiDetectionService.getState());
  const [fastApiHistory, setFastApiHistory] = useState<FastApiDetectionHistoryRecord[]>(fastApiDetectionService.getHistory());

  // Real Radar Detection state
  const [radarState, setRadarState] = useState<RadarState>(radarDetectionService.getState());


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
      setDetectionsByNode({});
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

    const unsubDetection = liveTelemetryService.onDetection((detection) => {
      if (!detection || !detection.nodeId) return;
      setDetectionsByNode((prev) => ({
        ...prev,
        [detection.nodeId]: detection,
      }));
      if (detection.status === 'HUMAN_DETECTED' || detection.status === 'NO_HUMAN') {
        setDetectionHistory((prev) => [
          {
            id: `det-${detection.nodeId}-${Date.now()}`,
            nodeId: detection.nodeId,
            timestamp: detection.inferenceTimestamp || Date.now(),
            status: detection.status,
            estimatedCount: detection.estimatedCount,
            confidence: detection.confidence,
            lifeActivity: detection.lifeActivity,
            modelVersion: detection.modelVersion,
            inputQuality: detection.inputQuality,
          },
          ...prev,
        ].slice(0, 100));
      }
    });

    // Fetch initial detection status
    liveTelemetryService.fetchDetectionStatus().then((status) => {
      if (status) setDetectionStatus(status);
    }).catch(() => {});

    // Start FastAPI remote Human Detection service (http://192.168.1.6:8000 & ws://192.168.1.6:8000/ws)
    fastApiDetectionService.start();

    const unsubFastApiState = fastApiDetectionService.onStateChange((state) => {
      setFastApiState(state);
      setFastApiHistory(fastApiDetectionService.getHistory());
    });

    const unsubFastApiPred = fastApiDetectionService.onPrediction(() => {
      setFastApiHistory(fastApiDetectionService.getHistory());
    });

    // Radar service subscription & initial status check
    const unsubRadar = radarDetectionService.onStateChange((state) => {
      setRadarState(state);
    });
    const unsubRadarWs = liveTelemetryService.onRadar((radar) => {
      radarDetectionService.ingestTelemetry(radar, 'WEBSOCKET');
    });
    radarDetectionService.pollHttp('/api/radar/status', '/api/radar/latest');

    return () => {
      unsubConnection();
      unsubNodes();
      unsubTelemetry();
      unsubStats();
      unsubEvents();
      unsubDetection();
      unsubFastApiState();
      unsubFastApiPred();
      unsubRadar();
      unsubRadarWs();
      fastApiDetectionService.stop();
      liveTelemetryService.disconnect();
    };
  }, []);

  const refreshFastApi = useCallback(async () => {
    await fastApiDetectionService.checkStatus(true);
    await fastApiDetectionService.fetchLatestPrediction();
  }, []);

  const reconnectFastApiWs = useCallback(() => {
    fastApiDetectionService.connectWs(true);
  }, []);

  const refreshRadarStatus = useCallback(async () => {
    await radarDetectionService.pollHttp('/api/radar/status', '/api/radar/latest');
  }, []);

  const ingestRadarTelemetry = useCallback((raw: unknown) => {
    return radarDetectionService.ingestTelemetry(raw);
  }, []);

  const sensorFusionResult = useMemo(() => {
    return computeSensorFusion(fastApiState, radarState);
  }, [fastApiState, radarState]);

  const refreshDetection = useCallback(async () => {
    try {
      const [status, history] = await Promise.all([
        liveTelemetryService.fetchDetectionStatus(),
        liveTelemetryService.fetchDetectionHistory(activeNodeId || undefined),
        refreshFastApi(),
      ]);
      if (status) setDetectionStatus(status);
      if (history) setDetectionHistory(history);
    } catch {
      // Ignore network errors during refresh
    }
  }, [activeNodeId, refreshFastApi]);

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
        setDetectionsByNode({});
      }
      await refreshDetection();
    } catch (err) {
      setConnectionError(err instanceof Error ? err.message : 'Error refreshing telemetry');
    }
  }, [refreshDetection]);

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

  const activeDetection = useMemo(() => {
    if (!activeNodeId) return null;
    return detectionsByNode[activeNodeId] || null;
  }, [activeNodeId, detectionsByNode]);

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
    detectionsByNode,
    activeDetection,
    detectionStatus,
    detectionHistory,
    telemetryHistory,
    systemEvents,
    gatewayStats,
    lastUpdateTime,
    realTelemetryProcessor,
    fastApiState,
    fastApiHistory,
    radarState,
    sensorFusionResult,
    ingestRadarTelemetry,
    refreshRadarStatus,
    refreshFastApi,
    reconnectFastApiWs,
    sendManualPacket,
    refresh,
    refreshDetection,
  }), [
    connectionStatus,
    connectionError,
    nodes,
    activeNodeId,
    latestTelemetryByNode,
    activeTelemetry,
    derivedMetricsByNode,
    activeDerivedMetrics,
    detectionsByNode,
    activeDetection,
    detectionStatus,
    detectionHistory,
    telemetryHistory,
    systemEvents,
    gatewayStats,
    lastUpdateTime,
    fastApiState,
    fastApiHistory,
    radarState,
    sensorFusionResult,
    ingestRadarTelemetry,
    refreshRadarStatus,
    refreshFastApi,
    reconnectFastApiWs,
    sendManualPacket,
    refresh,
    refreshDetection,
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
