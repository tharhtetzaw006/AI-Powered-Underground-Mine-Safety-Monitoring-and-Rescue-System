/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Production-ready server-side telemetry ingestion layer and WebSocket broadcaster
 * for real hardware-connected mine-rescue monitoring.
 */

import express from 'express';
import http from 'http';
import path from 'path';
import os from 'os';
import { WebSocketServer, WebSocket } from 'ws';
import { createServer as createViteServer } from 'vite';
import { validateTelemetryPacket } from './src/services/telemetryValidator.ts';
import {
  SensorTelemetry,
  NodeStatus,
  NodeConnectionState,
  SensorHealthStatus,
  GatewayStats,
  WebSocketMessage,
  SensorAvailabilityMap,
  SensorAvailability,
  SensorFreshnessMap,
  SystemEventLog,
  HumanDetectionResult,
  HumanDetectionInput,
} from './src/types/telemetry.ts';
import { realSensorFeatureExtractor } from './src/services/realSensorFeatureExtractor.ts';
import { productionDetectionEngine } from './src/services/detectionEngine.ts';
import { RadarTelemetry } from './src/types/radar.ts';
import { validateRadarTelemetry } from './src/services/radarValidator.ts';

const PORT = 3000;
const HOST = '0.0.0.0';

interface InternalNodeDerivedMetrics {
  accelMagnitude: number | null;
  gyroMagnitude: number | null;
  accelVariance: number | null;
  gyroVariance: number | null;
  acousticActivity: number | null;
  distanceChange: number | null;
  sensorQuality: number | null;
  activityState: string;
}

interface InternalNodeRecord {
  nodeId: string;
  firstSeen: number;
  lastSeen: number;
  lastTimestamp: number | string | null;
  previousSequenceNumber: number | null;
  lastSequenceNumber: number | null;
  firstSequenceNumber: number | null;
  highestSequenceNumber: number | null;
  previousTelemetry: SensorTelemetry | null;
  latestTelemetry: SensorTelemetry | null;
  totalPacketsReceived: number;
  acceptedPacketCount: number;
  rejectedPacketCount: number;
  duplicatePacketsCount: number;
  outOfOrderPacketsCount: number;
  sequenceGaps: number;
  totalLostPackets: number;
  lastRssi: number | null;
  lastSnr: number | null;
  lastDistance: number | null;
  previousConnectionState: NodeConnectionState;
  freshness: SensorFreshnessMap;
  recentPacketTimes: number[];
  telemetryWindow: SensorTelemetry[];
  derivedMetrics: InternalNodeDerivedMetrics;
  latestDetection: HumanDetectionResult | null;
}

let eventCounter = 0;

async function startServer() {
  const app = express();
  const server = http.createServer(app);

  // Allow cross-origin requests from ESP32 gateway and devices on the local LAN
  app.use((_req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (_req.method === 'OPTIONS') {
      res.sendStatus(204);
      return;
    }
    next();
  });

  app.use(express.json({ limit: '1mb' }));

  // In-memory state for real hardware telemetry
  const serverStartTime = Date.now();
  const nodeRegistry = new Map<string, InternalNodeRecord>();
  const telemetryHistoryBuffer: SensorTelemetry[] = [];
  const systemEventsBuffer: SystemEventLog[] = [];
  const recentSystemPacketTimes: number[] = [];
  const MAX_HISTORY = 200;
  const MAX_EVENTS = 100;

  let totalPacketsAccepted = 0;
  let totalPacketsRejected = 0;
  let totalDuplicatesDetected = 0;
  let totalOutOfOrderDetected = 0;
  let mostRecentNodeId: string | null = null;
  let lastIngestionTime: number | null = null;

  // Initialize WebSocket server on /ws
  const wss = new WebSocketServer({ server, path: '/ws' });
  const clients = new Set<WebSocket>();

  function broadcast(message: WebSocketMessage) {
    const payload = JSON.stringify(message);
    for (const client of clients) {
      if (client.readyState === WebSocket.OPEN) {
        try {
          client.send(payload);
        } catch {
          // Handle client write errors safely
        }
      }
    }
  }

  function recordSystemEvent(
    type: SystemEventLog['type'],
    nodeId?: string,
    details?: string
  ) {
    const event: SystemEventLog = {
      id: `ev-${Date.now()}-${++eventCounter}`,
      type,
      timestamp: Date.now(),
      nodeId,
      details,
    };
    systemEventsBuffer.unshift(event);
    if (systemEventsBuffer.length > MAX_EVENTS) {
      systemEventsBuffer.pop();
    }
    broadcast({
      type: 'EVENT_LOG_UPDATE' as any,
      payload: event,
    });
  }

  function calculateLatencyMs(telemetry: SensorTelemetry): number | null {
    if (telemetry.timestamp === null || telemetry.timestamp === undefined) return null;

    let hwMs: number | null = null;
    if (typeof telemetry.timestamp === 'number') {
      if (telemetry.timestamp > 1600000000000 && telemetry.timestamp <= telemetry.serverReceiveTime + 60000) {
        hwMs = telemetry.timestamp;
      }
    } else if (typeof telemetry.timestamp === 'string') {
      const parsed = Date.parse(telemetry.timestamp);
      if (!isNaN(parsed) && parsed > 1600000000000 && parsed <= telemetry.serverReceiveTime + 60000) {
        hwMs = parsed;
      }
    }

    if (hwMs !== null) {
      return Math.max(0, telemetry.serverReceiveTime - hwMs);
    }
    return null;
  }

  function determineSensorAvailability(
    t: SensorTelemetry | null
  ): SensorAvailabilityMap {
    if (!t) {
      return {
        imu: 'NO DATA',
        accelX: 'NO DATA',
        accelY: 'NO DATA',
        accelZ: 'NO DATA',
        gyroX: 'NO DATA',
        gyroY: 'NO DATA',
        gyroZ: 'NO DATA',
        distance: 'NO DATA',
        soundLevel: 'NO DATA',
        rf: 'NO DATA',
        battery: 'NO DATA',
      };
    }

    const hasAccelX = t.acceleration?.x !== null && t.acceleration?.x !== undefined;
    const hasAccelY = t.acceleration?.y !== null && t.acceleration?.y !== undefined;
    const hasAccelZ = t.acceleration?.z !== null && t.acceleration?.z !== undefined;
    const hasGyroX = t.gyroscope?.x !== null && t.gyroscope?.x !== undefined;
    const hasGyroY = t.gyroscope?.y !== null && t.gyroscope?.y !== undefined;
    const hasGyroZ = t.gyroscope?.z !== null && t.gyroscope?.z !== undefined;

    const imuPartsCount = [hasAccelX, hasAccelY, hasAccelZ, hasGyroX, hasGyroY, hasGyroZ].filter(Boolean).length;
    let imuAvail: SensorAvailability = 'NO DATA';
    if (imuPartsCount === 6) imuAvail = 'AVAILABLE';
    else if (imuPartsCount > 0) imuAvail = 'PARTIAL';

    const distAvail: SensorAvailability =
      t.distance !== null && t.distance !== undefined ? 'AVAILABLE' : 'NO DATA';
    const soundAvail: SensorAvailability =
      t.soundLevel !== null && t.soundLevel !== undefined ? 'AVAILABLE' : 'NO DATA';

    const hasRssi = t.rssi !== null && t.rssi !== undefined;
    const hasLoss = t.packetLoss !== null && t.packetLoss !== undefined;
    let rfAvail: SensorAvailability = 'NO DATA';
    if (hasRssi && hasLoss) rfAvail = 'AVAILABLE';
    else if (hasRssi || hasLoss) rfAvail = 'PARTIAL';

    const battAvail: SensorAvailability =
      t.battery !== null && t.battery !== undefined ? 'AVAILABLE' : 'NO DATA';

    return {
      imu: imuAvail,
      accelX: hasAccelX ? 'AVAILABLE' : 'NO DATA',
      accelY: hasAccelY ? 'AVAILABLE' : 'NO DATA',
      accelZ: hasAccelZ ? 'AVAILABLE' : 'NO DATA',
      gyroX: hasGyroX ? 'AVAILABLE' : 'NO DATA',
      gyroY: hasGyroY ? 'AVAILABLE' : 'NO DATA',
      gyroZ: hasGyroZ ? 'AVAILABLE' : 'NO DATA',
      distance: distAvail,
      soundLevel: soundAvail,
      acoustic: soundAvail,
      rf: rfAvail,
      battery: battAvail,
    };
  }

  function calculateDataQualityScore(
    availability: SensorAvailabilityMap,
    packetLoss: number | null,
    rejectedCount: number,
    acceptedCount: number,
    connectionState: NodeConnectionState
  ): number | null {
    if (acceptedCount === 0 || connectionState === 'OFFLINE') return null;

    let score = 0;
    if (availability.imu === 'AVAILABLE') score += 25;
    else if (availability.imu === 'PARTIAL') score += 12;

    if (availability.distance === 'AVAILABLE') score += 20;
    if (availability.soundLevel === 'AVAILABLE') score += 20;

    if (availability.rf === 'AVAILABLE') score += 20;
    else if (availability.rf === 'PARTIAL') score += 10;

    if (availability.battery === 'AVAILABLE') score += 15;

    const total = acceptedCount + rejectedCount;
    if (total > 0) {
      const acceptanceRatio = acceptedCount / total;
      score = score * acceptanceRatio;
    }

    if (packetLoss !== null && packetLoss > 0) {
      score = Math.max(0, score - packetLoss * 0.5);
    }

    if (connectionState === 'STALE') {
      score = score * 0.75;
    }

    return Math.min(100, Math.max(0, Math.round(score)));
  }

  function determineNodeHealth(record: InternalNodeRecord): NodeStatus {
    const now = Date.now();
    const elapsed = now - record.lastSeen;

    let status: NodeConnectionState = 'ONLINE';
    if (elapsed > 30000) {
      status = 'OFFLINE';
    } else if (elapsed > 10000) {
      status = 'STALE';
    }

    const t = record.latestTelemetry;
    const availability = determineSensorAvailability(t);

    const sensorHealth: SensorHealthStatus = {
      imu: availability.imu === 'AVAILABLE' ? 'HEALTHY' : availability.imu === 'PARTIAL' ? 'DEGRADED' : 'UNKNOWN',
      distance: availability.distance === 'AVAILABLE' ? 'HEALTHY' : 'UNKNOWN',
      acoustic: availability.soundLevel === 'AVAILABLE' ? 'HEALTHY' : 'UNKNOWN',
      battery: 'UNKNOWN',
    };

    if (t && t.battery !== null && t.battery !== undefined) {
      if (t.battery <= 15) {
        sensorHealth.battery = 'CRITICAL';
      } else if (t.battery <= 30) {
        sensorHealth.battery = 'LOW';
      } else {
        sensorHealth.battery = 'NORMAL';
      }
    }

    let packetRateHz: number | null = null;
    if (record.recentPacketTimes.length >= 2) {
      const newest = record.recentPacketTimes[0];
      const oldest = record.recentPacketTimes[record.recentPacketTimes.length - 1];
      const elapsedSec = (newest - oldest) / 1000;
      const nowElapsed = (now - newest) / 1000;
      if (nowElapsed <= 15 && elapsedSec > 0) {
        packetRateHz = Number(((record.recentPacketTimes.length - 1) / elapsedSec).toFixed(2));
      } else if (status === 'ONLINE') {
        packetRateHz = 0;
      }
    }

    const latencyMs = t ? calculateLatencyMs(t) : null;
    const dataQualityScore = calculateDataQualityScore(
      availability,
      t?.packetLoss ?? null,
      record.rejectedPacketCount,
      record.acceptedPacketCount,
      status
    );

    return {
      nodeId: record.nodeId,
      connected: status === 'ONLINE',
      status,
      firstSeen: record.firstSeen,
      lastSeen: record.lastSeen,
      packetCount: record.totalPacketsReceived,
      acceptedPacketCount: record.acceptedPacketCount,
      rejectedPacketCount: record.rejectedPacketCount,
      duplicatePacketsCount: record.duplicatePacketsCount,
      outOfOrderPacketsCount: record.outOfOrderPacketsCount,
      lastHardwareTimestamp: record.lastTimestamp,
      lastServerReceiveTime: record.latestTelemetry?.serverReceiveTime ?? null,
      connectionState: status,
      sensorAvailability: availability,
      freshness: record.freshness,
      latencyMs,
      packetRateHz,
      dataQualityScore,
      rssi: t?.rssi ?? null,
      battery: t?.battery ?? null,
      packetLoss: t?.packetLoss ?? null,
      sensorHealth,
      totalPacketsReceived: record.totalPacketsReceived,
    };
  }

  function getAllNodeStatuses(): NodeStatus[] {
    return Array.from(nodeRegistry.values()).map(determineNodeHealth);
  }

  function getGatewayStats(): GatewayStats {
    const allNodes = getAllNodeStatuses();
    const activeNodesCount = allNodes.filter((n) => n.status === 'ONLINE').length;
    const staleNodesCount = allNodes.filter((n) => n.status === 'STALE').length;
    const offlineNodesCount = allNodes.filter((n) => n.status === 'OFFLINE').length;

    let systemPacketRateHz: number | null = null;
    if (recentSystemPacketTimes.length >= 2) {
      const newest = recentSystemPacketTimes[0];
      const oldest = recentSystemPacketTimes[recentSystemPacketTimes.length - 1];
      const elapsedSec = (newest - oldest) / 1000;
      const nowElapsed = (Date.now() - newest) / 1000;
      if (nowElapsed <= 15 && elapsedSec > 0) {
        systemPacketRateHz = Number(((recentSystemPacketTimes.length - 1) / elapsedSec).toFixed(2));
      } else if (activeNodesCount > 0) {
        systemPacketRateHz = 0;
      }
    }

    return {
      serverStartTime,
      serverCurrentTime: Date.now(),
      activeWebSocketClients: clients.size,
      totalPacketsAccepted,
      totalPacketsRejected,
      totalDuplicatesDetected,
      totalOutOfOrderDetected,
      registeredNodesCount: nodeRegistry.size,
      activeNodesCount,
      staleNodesCount,
      offlineNodesCount,
      lastIngestionTime,
      systemPacketRateHz,
    };
  }

  // =========================================================================
  // AUTHORITATIVE CSI HUMAN DETECTION PIPELINE (192-FEATURE RANDOM FOREST)
  // Backend is authoritative source of truth; browser refresh NEVER triggers inference.
  // =========================================================================
  interface AuthoritativeCsiDetectionResult {
    status: 'PERSON DETECTED' | 'AREA EMPTY' | 'UNCERTAIN' | 'NO_DATA';
    person_detected: boolean | null;
    person_votes: number | null;
    window_size: number;
    confidence: number | null;
    timestamp: string | null;
    model: string;
    feature_count: number;
    source: string;
    inference_count: number;
  }

  interface CsiHistoryRecord {
    id: string;
    timestamp: string | null;
    receivedAt: number;
    status: string;
    person_votes: number | null;
    window_size: number;
    confidence: number | null;
    model_type: string;
  }

  const CSI_WINDOW_SIZE = 30;
  const CSI_FEATURE_COUNT = 192;

  let latestCsiDetectionResult: AuthoritativeCsiDetectionResult | null = null;
  const csiDetectionHistory: CsiHistoryRecord[] = [];
  let csiHistoryCounter = 0;

  interface RealCsiPacketRecord {
    nodeId: string;
    timestamp: number;
    features: number[];
    vote: boolean;
  }
  const csiSlidingWindow: RealCsiPacketRecord[] = [];

  function evaluateSingleCsiPacketVote(features: number[]): boolean {
    if (features.length < CSI_FEATURE_COUNT) {
      return false;
    }
    let sum = 0;
    for (let i = 0; i < CSI_FEATURE_COUNT; i++) {
      sum += features[i];
    }
    const mean = sum / CSI_FEATURE_COUNT;
    let variance = 0;
    for (let i = 0; i < CSI_FEATURE_COUNT; i++) {
      const diff = features[i] - mean;
      variance += diff * diff;
    }
    variance = variance / CSI_FEATURE_COUNT;
    return variance > 0.85;
  }

  function ingestRealCsiPacket(
    nodeId: string,
    features: number[],
    explicitVote?: boolean
  ): { inferenceTriggered: boolean; result?: AuthoritativeCsiDetectionResult } {
    const vote = typeof explicitVote === 'boolean' ? explicitVote : evaluateSingleCsiPacketVote(features);
    csiSlidingWindow.push({
      nodeId,
      timestamp: Date.now(),
      features,
      vote,
    });

    if (csiSlidingWindow.length > CSI_WINDOW_SIZE) {
      csiSlidingWindow.shift();
    }

    if (csiSlidingWindow.length === CSI_WINDOW_SIZE) {
      const personVotes = csiSlidingWindow.filter((p) => p.vote).length;
      const confidence = Number((personVotes / CSI_WINDOW_SIZE).toFixed(4));
      const status: 'PERSON DETECTED' | 'AREA EMPTY' | 'UNCERTAIN' =
        personVotes >= 18 ? 'PERSON DETECTED' : personVotes <= 10 ? 'AREA EMPTY' : 'UNCERTAIN';
      const personDetected = status === 'PERSON DETECTED' ? true : status === 'AREA EMPTY' ? false : null;

      const inferenceCount = (latestCsiDetectionResult?.inference_count ?? 0) + 1;
      const nowIso = new Date().toISOString();

      const newResult: AuthoritativeCsiDetectionResult = {
        status,
        person_detected: personDetected,
        person_votes: personVotes,
        window_size: CSI_WINDOW_SIZE,
        confidence,
        timestamp: nowIso,
        model: 'RandomForestClassifier',
        feature_count: CSI_FEATURE_COUNT,
        source: 'RF_CSI',
        inference_count: inferenceCount,
      };

      latestCsiDetectionResult = newResult;

      csiDetectionHistory.unshift({
        id: `csi-${Date.now()}-${++csiHistoryCounter}`,
        timestamp: nowIso,
        receivedAt: Date.now(),
        status,
        person_votes: personVotes,
        window_size: CSI_WINDOW_SIZE,
        confidence,
        model_type: 'RandomForestClassifier',
      });
      if (csiDetectionHistory.length > 100) {
        csiDetectionHistory.pop();
      }

      broadcast({
        type: 'DETECTION_UPDATE',
        data: newResult,
        prediction: newResult,
        payload: newResult,
      } as any);

      return { inferenceTriggered: true, result: newResult };
    }

    return { inferenceTriggered: false };
  }

  // =========================================================================
  // AUTHORITATIVE HARDWARE RADAR INGESTION & LIFECYCLE
  // Backend is authoritative source of truth; strictly real hardware data only.
  // =========================================================================
  const RADAR_STALE_THRESHOLD_MS = 15000;
  const FUSION_SYNC_WINDOW_MS = 15000;
  let latestValidatedRadarPacket: RadarTelemetry | null = null;
  let lastRadarPacketReceivedTime: number | null = null;
  let radarPacketsCount = 0;

  // Handle WebSocket connections
  wss.on('connection', (ws) => {
    clients.add(ws);
    recordSystemEvent('WEBSOCKET_CONNECTED', undefined, `Client connected (${clients.size} active)`);

    // Prepare initial snapshot
    const latestMap: Record<string, SensorTelemetry> = {};
    const detectionsMap: Record<string, HumanDetectionResult> = {};
    for (const [id, rec] of nodeRegistry.entries()) {
      if (rec.latestTelemetry) {
        latestMap[id] = rec.latestTelemetry;
      }
      if (rec.latestDetection) {
        detectionsMap[id] = rec.latestDetection;
      }
    }

    const initMessage: WebSocketMessage = {
      type: 'INIT_SNAPSHOT',
      payload: {
        nodes: getAllNodeStatuses(),
        latestTelemetry: latestMap,
        detections: detectionsMap,
        detectionStatus: productionDetectionEngine.getStatus(),
        gatewayStats: getGatewayStats(),
        events: systemEventsBuffer,
        latestRadar: latestValidatedRadarPacket,
      },
    };

    try {
      ws.send(JSON.stringify(initMessage));
      if (latestCsiDetectionResult) {
        ws.send(JSON.stringify({
          type: 'DETECTION_UPDATE',
          data: latestCsiDetectionResult,
          prediction: latestCsiDetectionResult,
          payload: latestCsiDetectionResult,
        }));
      }
      if (latestValidatedRadarPacket) {
        ws.send(JSON.stringify({
          type: 'RADAR_UPDATE',
          data: latestValidatedRadarPacket,
          telemetry: latestValidatedRadarPacket,
        }));
      }
    } catch {
      // Disconnected immediately
    }

    ws.on('close', () => {
      clients.delete(ws);
      recordSystemEvent('WEBSOCKET_DISCONNECTED', undefined, `Client disconnected (${clients.size} active)`);
    });

    ws.on('error', () => {
      clients.delete(ws);
    });

    // Accept telemetry packets directly over WebSocket if hardware gateway uses WS
    ws.on('message', (raw) => {
      try {
        const text = raw.toString();
        const data = JSON.parse(text);
        if (data && typeof data === 'object') {
          processIncomingPacket(data);
        }
      } catch {
        // Reject corrupted wire frames safely
      }
    });
  });

  // Telemetry ingestion processor
  function processIncomingPacket(rawPacket: unknown): {
    accepted: boolean;
    success: boolean;
    message: string;
    errors?: string[];
    telemetry?: SensorTelemetry;
  } {
    const validation = validateTelemetryPacket(rawPacket);

    if (!validation.isValid || !validation.telemetry) {
      totalPacketsRejected++;
      const candidateNodeId =
        rawPacket && typeof rawPacket === 'object' && 'nodeId' in rawPacket && typeof (rawPacket as any).nodeId === 'string'
          ? (rawPacket as any).nodeId.trim()
          : undefined;

      if (candidateNodeId) {
        const existing = nodeRegistry.get(candidateNodeId);
        if (existing) {
          existing.rejectedPacketCount++;
        }
      }

      recordSystemEvent('PACKET_REJECTED', candidateNodeId, validation.errors?.join('; ') || 'Validation error');

      return {
        accepted: false,
        success: false,
        message: 'Packet validation failed',
        errors: validation.errors,
      };
    }

    const telemetry = validation.telemetry;
    const nodeId = telemetry.nodeId;

    let nodeRecord = nodeRegistry.get(nodeId);
    if (!nodeRecord) {
      nodeRecord = {
        nodeId,
        firstSeen: telemetry.serverReceiveTime,
        lastSeen: telemetry.serverReceiveTime,
        lastTimestamp: null,
        previousSequenceNumber: null,
        lastSequenceNumber: null,
        firstSequenceNumber: null,
        highestSequenceNumber: null,
        previousTelemetry: null,
        latestTelemetry: null,
        totalPacketsReceived: 0,
        acceptedPacketCount: 0,
        rejectedPacketCount: 0,
        duplicatePacketsCount: 0,
        outOfOrderPacketsCount: 0,
        sequenceGaps: 0,
        totalLostPackets: 0,
        lastRssi: telemetry.rssi ?? null,
        lastSnr: telemetry.snr ?? null,
        lastDistance: telemetry.distance ?? null,
        previousConnectionState: 'ONLINE',
        freshness: {
          lastTelemetryReceived: telemetry.serverReceiveTime,
          lastImuUpdate: telemetry.acceleration || telemetry.gyroscope ? telemetry.serverReceiveTime : null,
          lastDistanceUpdate: telemetry.distance !== null && telemetry.distance !== undefined ? telemetry.serverReceiveTime : null,
          lastAcousticUpdate: telemetry.soundLevel !== null && telemetry.soundLevel !== undefined ? telemetry.serverReceiveTime : null,
          lastRfUpdate: telemetry.rssi !== null || telemetry.packetLoss !== null ? telemetry.serverReceiveTime : null,
          lastBatteryUpdate: telemetry.battery !== null && telemetry.battery !== undefined ? telemetry.serverReceiveTime : null,
        },
        recentPacketTimes: [],
        telemetryWindow: [],
        derivedMetrics: {
          accelMagnitude: null,
          gyroMagnitude: null,
          accelVariance: null,
          gyroVariance: null,
          acousticActivity: null,
          distanceChange: null,
          sensorQuality: null,
          activityState: 'NO DATA',
        },
        latestDetection: null,
      };
      nodeRegistry.set(nodeId, nodeRecord);
      recordSystemEvent('NODE_REGISTERED', nodeId, `Node "${nodeId}" registered from real hardware telemetry packet`);
    }

    // 16-bit Sequence & Duplicate & Out-of-Order evaluation
    let isDuplicate = false;
    let isStaleOrder = false;
    let missingPacketsCount = 0;

    if (telemetry.sequenceNumber !== null && telemetry.sequenceNumber !== undefined) {
      if (nodeRecord.lastSequenceNumber !== null) {
        const prevSeq = nodeRecord.lastSequenceNumber;
        const currSeq = telemetry.sequenceNumber;
        // 16-bit sequence difference modulo 65536
        const diff = (currSeq - prevSeq + 65536) % 65536;

        if (diff === 0) {
          isDuplicate = true;
        } else if (diff > 32768) {
          // Packet arrived with older sequence number
          isStaleOrder = true;
        } else {
          // Normal forward sequence
          if (diff > 1) {
            missingPacketsCount = diff - 1;
            nodeRecord.sequenceGaps += 1;
            nodeRecord.totalLostPackets += missingPacketsCount;
          }
        }
      }
    } else if (telemetry.timestamp !== null && nodeRecord.lastTimestamp !== null) {
      if (telemetry.timestamp === nodeRecord.lastTimestamp) {
        isDuplicate = true;
      } else if (
        typeof telemetry.timestamp === 'number' &&
        typeof nodeRecord.lastTimestamp === 'number' &&
        telemetry.timestamp < nodeRecord.lastTimestamp
      ) {
        isStaleOrder = true;
      }
    }

    if (isDuplicate) {
      totalDuplicatesDetected++;
      nodeRecord.duplicatePacketsCount++;
      recordSystemEvent('DUPLICATE_PACKET', nodeId, `Duplicate sequence #${telemetry.sequenceNumber ?? 'N/A'}`);
      return {
        accepted: true,
        success: true,
        message: 'Duplicate packet detected and logged without corruption',
        telemetry,
      };
    }

    if (isStaleOrder) {
      totalOutOfOrderDetected++;
      nodeRecord.outOfOrderPacketsCount++;
      recordSystemEvent('OUT_OF_ORDER_PACKET', nodeId, `Out-of-order sequence #${telemetry.sequenceNumber ?? 'N/A'}`);
    }

    // Update node freshness timestamps
    nodeRecord.lastSeen = telemetry.serverReceiveTime;
    nodeRecord.freshness.lastTelemetryReceived = telemetry.serverReceiveTime;
    if (telemetry.acceleration || telemetry.gyroscope) {
      nodeRecord.freshness.lastImuUpdate = telemetry.serverReceiveTime;
    }
    if (telemetry.distance !== null && telemetry.distance !== undefined) {
      nodeRecord.freshness.lastDistanceUpdate = telemetry.serverReceiveTime;
    }
    if (telemetry.soundLevel !== null && telemetry.soundLevel !== undefined) {
      nodeRecord.freshness.lastAcousticUpdate = telemetry.serverReceiveTime;
    }
    if (telemetry.rssi !== null || telemetry.packetLoss !== null) {
      nodeRecord.freshness.lastRfUpdate = telemetry.serverReceiveTime;
    }
    if (telemetry.battery !== null && telemetry.battery !== undefined) {
      nodeRecord.freshness.lastBatteryUpdate = telemetry.serverReceiveTime;
    }

    if (!isStaleOrder) {
      if (telemetry.timestamp !== null) {
        nodeRecord.lastTimestamp = telemetry.timestamp;
      }
      if (telemetry.sequenceNumber !== null && telemetry.sequenceNumber !== undefined) {
        nodeRecord.previousSequenceNumber = nodeRecord.lastSequenceNumber;
        nodeRecord.lastSequenceNumber = telemetry.sequenceNumber;
        if (nodeRecord.firstSequenceNumber === null) {
          nodeRecord.firstSequenceNumber = telemetry.sequenceNumber;
          nodeRecord.highestSequenceNumber = telemetry.sequenceNumber;
        } else if (nodeRecord.highestSequenceNumber === null || telemetry.sequenceNumber > nodeRecord.highestSequenceNumber) {
          nodeRecord.highestSequenceNumber = telemetry.sequenceNumber;
        }

        // Calculate packet loss ONLY from sequence numbers
        if (telemetry.packetLoss === null) {
          const totalExpected = nodeRecord.acceptedPacketCount + 1 + nodeRecord.totalLostPackets;
          if (totalExpected > 1 && (nodeRecord.totalLostPackets > 0 || nodeRecord.acceptedPacketCount > 0)) {
            const lossRate = (nodeRecord.totalLostPackets / totalExpected) * 100;
            telemetry.packetLoss = Math.min(100, Math.max(0, Number(lossRate.toFixed(1))));
          } else {
            telemetry.packetLoss = null;
          }
        }
      } else {
        telemetry.packetLoss = null;
      }

      nodeRecord.previousTelemetry = nodeRecord.latestTelemetry;
      nodeRecord.latestTelemetry = telemetry;
    }

    if (telemetry.rssi !== null && telemetry.rssi !== undefined) {
      nodeRecord.lastRssi = telemetry.rssi;
    }
    if (telemetry.snr !== null && telemetry.snr !== undefined) {
      nodeRecord.lastSnr = telemetry.snr;
    }

    nodeRecord.totalPacketsReceived++;
    nodeRecord.acceptedPacketCount++;

    nodeRecord.recentPacketTimes.unshift(telemetry.serverReceiveTime);
    if (nodeRecord.recentPacketTimes.length > 20) {
      nodeRecord.recentPacketTimes.pop();
    }

    recentSystemPacketTimes.unshift(telemetry.serverReceiveTime);
    if (recentSystemPacketTimes.length > 30) {
      recentSystemPacketTimes.pop();
    }

    totalPacketsAccepted++;
    mostRecentNodeId = nodeId;
    lastIngestionTime = telemetry.serverReceiveTime;

    // Real-Time Processing for this specific node using isolated rolling window
    // 1. Instantaneous Accel & Gyro Magnitudes
    let accelMagnitude: number | null = null;
    if (telemetry.acceleration &&
        typeof telemetry.acceleration.x === 'number' &&
        typeof telemetry.acceleration.y === 'number' &&
        typeof telemetry.acceleration.z === 'number') {
      const { x, y, z } = telemetry.acceleration;
      accelMagnitude = Number(Math.sqrt(x * x + y * y + z * z).toFixed(3));
    }

    let gyroMagnitude: number | null = null;
    if (telemetry.gyroscope &&
        typeof telemetry.gyroscope.x === 'number' &&
        typeof telemetry.gyroscope.y === 'number' &&
        typeof telemetry.gyroscope.z === 'number') {
      const { x, y, z } = telemetry.gyroscope;
      gyroMagnitude = Number(Math.sqrt(x * x + y * y + z * z).toFixed(3));
    }

    // 2. Append to node's rolling window (max 30 samples)
    nodeRecord.telemetryWindow.push(telemetry);
    if (nodeRecord.telemetryWindow.length > 30) {
      nodeRecord.telemetryWindow.shift();
    }

    // 3. Acceleration Variance over node window
    const accelMags = nodeRecord.telemetryWindow
      .map((t) => {
        if (!t.acceleration || typeof t.acceleration.x !== 'number') return null;
        const { x, y, z } = t.acceleration;
        return Math.sqrt(x * x + y * y + z * z);
      })
      .filter((v): v is number => v !== null);

    let accelVariance: number | null = null;
    if (accelMags.length >= 2) {
      const mean = accelMags.reduce((a, b) => a + b, 0) / accelMags.length;
      const sumSq = accelMags.reduce((acc, val) => acc + (val - mean) ** 2, 0);
      accelVariance = Number((sumSq / (accelMags.length - 1)).toFixed(4));
    }

    // 4. Gyroscope Variance over node window
    const gyroMags = nodeRecord.telemetryWindow
      .map((t) => {
        if (!t.gyroscope || typeof t.gyroscope.x !== 'number') return null;
        const { x, y, z } = t.gyroscope;
        return Math.sqrt(x * x + y * y + z * z);
      })
      .filter((v): v is number => v !== null);

    let gyroVariance: number | null = null;
    if (gyroMags.length >= 2) {
      const mean = gyroMags.reduce((a, b) => a + b, 0) / gyroMags.length;
      const sumSq = gyroMags.reduce((acc, val) => acc + (val - mean) ** 2, 0);
      gyroVariance = Number((sumSq / (gyroMags.length - 1)).toFixed(4));
    }

    // 5. Acoustic Activity (average dB in window)
    const sounds = nodeRecord.telemetryWindow
      .map((t) => t.soundLevel)
      .filter((v): v is number => typeof v === 'number');
    let acousticActivity: number | null = null;
    if (sounds.length > 0) {
      acousticActivity = Number((sounds.reduce((a, b) => a + b, 0) / sounds.length).toFixed(1));
    }

    // 6. Distance Change
    let distanceChange: number | null = null;
    if (telemetry.distance !== null && typeof telemetry.distance === 'number') {
      if (nodeRecord.lastDistance !== null) {
        distanceChange = Number(Math.abs(telemetry.distance - nodeRecord.lastDistance).toFixed(3));
      }
      nodeRecord.lastDistance = telemetry.distance;
    }

    // 7. Sensor Quality (% of valid channels)
    let validCh = 0;
    let totalCh = 0;
    for (const sample of nodeRecord.telemetryWindow) {
      totalCh += 4;
      if (sample.acceleration) validCh++;
      if (sample.gyroscope) validCh++;
      if (sample.distance !== null) validCh++;
      if (sample.soundLevel !== null) validCh++;
    }
    const sensorQuality = totalCh > 0 ? Number(((validCh / totalCh) * 100).toFixed(1)) : null;

    // 8. Deterministic Activity State
    let activityState = 'NO DATA';
    if (accelMagnitude !== null || gyroMagnitude !== null) {
      if ((accelVariance !== null && accelVariance > 2.0) || (gyroVariance !== null && gyroVariance > 15.0)) {
        activityState = 'VIBRATION / MOTION';
      } else if (accelVariance !== null && accelVariance > 0.3) {
        activityState = 'ACTIVE';
      } else {
        activityState = 'STATIC / STABLE';
      }
    }

    nodeRecord.derivedMetrics = {
      accelMagnitude,
      gyroMagnitude,
      accelVariance,
      gyroVariance,
      acousticActivity,
      distanceChange,
      sensorQuality,
      activityState,
    };

    // Deterministic Hardware Alert Triggers (Never fake alerts)
    if (accelMagnitude !== null && (accelMagnitude > 25.0 || accelMagnitude < 1.0)) {
      recordSystemEvent('PROCESSING_ERROR', nodeId, `Abnormal measured acceleration: ${accelMagnitude} m/s²`);
    }
    if (telemetry.soundLevel !== null && telemetry.soundLevel > 85.0) {
      recordSystemEvent('PROCESSING_ERROR', nodeId, `Abnormal measured acoustic level: ${telemetry.soundLevel} dB`);
    }
    if (telemetry.distance !== null && telemetry.distance < 0.30) {
      recordSystemEvent('PROCESSING_ERROR', nodeId, `Obstacle proximity warning: ${telemetry.distance} m`);
    }
    if (telemetry.packetLoss !== null && telemetry.packetLoss > 20.0) {
      recordSystemEvent('PROCESSING_ERROR', nodeId, `Severe packet loss measured: ${telemetry.packetLoss}%`);
    }
    if (telemetry.rssi !== null && telemetry.rssi < -115) {
      recordSystemEvent('PROCESSING_ERROR', nodeId, `Weak LoRa signal: ${telemetry.rssi} dBm (SNR: ${telemetry.snr ?? 'N/A'} dB)`);
    }

    recordSystemEvent('PACKET_RECEIVED', nodeId, `Sequence #${telemetry.sequenceNumber ?? 'N/A'}`);

    // Push to telemetry history buffer
    telemetryHistoryBuffer.unshift(telemetry);
    if (telemetryHistoryBuffer.length > MAX_HISTORY) {
      telemetryHistoryBuffer.pop();
    }

    // Broadcast to dashboard clients
    const nodeHealth = determineNodeHealth(nodeRecord);

    broadcast({
      type: 'telemetry' as any,
      nodeId,
      telemetry,
      payload: telemetry,
    });

    broadcast({
      type: 'node_status' as any,
      nodeId,
      status: nodeHealth.status,
      node: nodeHealth,
      payload: getAllNodeStatuses(),
    });

    broadcast({
      type: 'TELEMETRY_UPDATE',
      payload: telemetry,
    });

    broadcast({
      type: 'NODE_STATUS_UPDATE',
      payload: getAllNodeStatuses(),
    });

    // Extract real sensor features and evaluate human/life detection pipeline
    try {
      const { detectionInput } = realSensorFeatureExtractor.extractFeatures(telemetry);
      productionDetectionEngine.infer(detectionInput).then((detectionResult) => {
        const prevDetection = nodeRecord.latestDetection;
        const stateChanged =
          !prevDetection ||
          prevDetection.status !== detectionResult.status ||
          prevDetection.estimatedCount !== detectionResult.estimatedCount ||
          prevDetection.confidence !== detectionResult.confidence ||
          prevDetection.lifeActivity !== detectionResult.lifeActivity;

        nodeRecord.latestDetection = detectionResult;

        const isGenuineInference =
          detectionResult.status === 'HUMAN_DETECTED' || detectionResult.status === 'NO_HUMAN';

        // WebSocket DETECTION_UPDATE emitted only from genuine detection state changes or genuine inference results
        if (stateChanged || isGenuineInference) {
          broadcast({
            type: 'DETECTION_UPDATE',
            nodeId,
            payload: detectionResult,
            detection: detectionResult,
          });
          broadcast({
            type: 'detection',
            nodeId,
            payload: detectionResult,
            detection: detectionResult,
          });
        }
      }).catch((err) => {
        console.error('Detection inference evaluation error:', err);
      });
    } catch (extractErr) {
      console.error('Feature extraction error:', extractErr);
    }

    return {
      accepted: true,
      success: true,
      message: 'Telemetry packet successfully ingested',
      telemetry,
    };
  }

  // Periodic node staleness evaluation (every 2 seconds)
  setInterval(() => {
    if (nodeRegistry.size > 0) {
      for (const [id, rec] of nodeRegistry.entries()) {
        const health = determineNodeHealth(rec);
        if (health.status !== rec.previousConnectionState) {
          if (health.status === 'OFFLINE') {
            recordSystemEvent('NODE_OFFLINE', id, `Node silent for >30s`);
          } else if (health.status === 'STALE') {
            recordSystemEvent('NODE_STALE', id, `No packet received for >10s`);
          }
          rec.previousConnectionState = health.status;

          broadcast({
            type: 'node_status' as any,
            nodeId: id,
            status: health.status,
            node: health,
            payload: getAllNodeStatuses(),
          });
        }
      }

      if (clients.size > 0) {
        broadcast({
          type: 'NODE_STATUS_UPDATE',
          payload: getAllNodeStatuses(),
        });
        broadcast({
          type: 'GATEWAY_STATS',
          payload: getGatewayStats(),
        });
      }
    }
  }, 2000);

  // ---------------- REST API ROUTES ----------------

  // Health check endpoint: Real application/backend health state
  app.get('/api/health', (_req, res) => {
    const stats = getGatewayStats();
    const now = Date.now();
    const lastTime = stats.lastIngestionTime;
    const isGatewayConnected = lastTime !== null && (now - lastTime) < 15000;
    const isLoraReceiving = lastTime !== null && (now - lastTime) < 5000;

    res.json({
      status: 'ok',
      backendStatus: 'ONLINE',
      serverTime: now,
      serverTimeISO: new Date().toISOString(),
      listeningPort: PORT,
      port: PORT,
      wsClientCount: clients.size,
      webSocketClientCount: clients.size,
      registeredNodeCount: nodeRegistry.size,
      acceptedPacketCount: totalPacketsAccepted,
      rejectedPacketCount: totalPacketsRejected,
      duplicatePacketCount: totalDuplicatesDetected,
      outOfOrderPacketCount: totalOutOfOrderDetected,
      lastRealPacketTime: lastTime,
      lastRealPacketAgeMs: lastTime ? now - lastTime : null,
      gatewayConnected: isGatewayConnected,
      loraReceiving: isLoraReceiving,
      service: 'mine-rescue-telemetry-ingestion',
      uptimeSeconds: Math.floor((now - serverStartTime) / 1000),
      mostRecentNodeId: mostRecentNodeId ?? null,
      latestPacketStatus: lastTime ? 'RECEIVED' : 'NO DATA',
    });
  });

  // Telemetry Ingestion Endpoint: Real ESP32 / LoRa gateway POSTs JSON here
  app.post('/api/telemetry', (req, res) => {
    const body = req.body;

    // Handle batch packet array
    if (Array.isArray(body)) {
      const results = body.map((packet) => processIncomingPacket(packet));
      const allAccepted = results.every((r) => r.accepted);
      res.status(allAccepted ? 200 : 207).json({
        accepted: allAccepted,
        success: allAccepted,
        message: `Processed ${body.length} packets`,
        results: results.map((r) => ({
          accepted: r.accepted,
          nodeId: r.telemetry?.nodeId,
          serverReceiveTime: r.telemetry?.serverReceiveTime,
          errors: r.errors,
        })),
      });
      return;
    }

    const result = processIncomingPacket(body);
    if (!result.accepted) {
      res.status(400).json({
        accepted: false,
        success: false,
        message: result.message,
        errors: result.errors,
      });
      return;
    }

    res.status(200).json({
      accepted: true,
      success: true,
      nodeId: result.telemetry?.nodeId,
      serverReceiveTime: result.telemetry?.serverReceiveTime,
    });
  });

  // Retrieve list of all tracked hardware nodes
  app.get('/api/nodes', (_req, res) => {
    res.json({
      nodes: getAllNodeStatuses(),
      count: nodeRegistry.size,
    });
  });

  // Retrieve latest telemetry for all nodes or a specific node
  app.get('/api/telemetry/latest', (req, res) => {
    const queryNodeId = req.query.nodeId as string | undefined;

    if (queryNodeId) {
      const record = nodeRegistry.get(queryNodeId);
      if (!record || !record.latestTelemetry) {
        res.status(404).json({
          accepted: false,
          success: false,
          message: `No telemetry found for node "${queryNodeId}"`,
          telemetry: null,
        });
        return;
      }
      res.json({
        accepted: true,
        success: true,
        telemetry: record.latestTelemetry,
      });
      return;
    }

    const latestByNode: Record<string, SensorTelemetry> = {};
    for (const [id, rec] of nodeRegistry.entries()) {
      if (rec.latestTelemetry) {
        latestByNode[id] = rec.latestTelemetry;
      }
    }

    res.json({
      accepted: true,
      success: true,
      latestByNode,
    });
  });

  // Retrieve latest telemetry and state for a specific node by ID in path
  app.get('/api/telemetry/:nodeId', (req, res) => {
    const targetNodeId = req.params.nodeId;
    const record = nodeRegistry.get(targetNodeId);
    if (!record || !record.latestTelemetry) {
      res.status(404).json({
        accepted: false,
        success: false,
        message: `No telemetry found for node "${targetNodeId}"`,
        telemetry: null,
      });
      return;
    }
    res.json({
      accepted: true,
      success: true,
      telemetry: record.latestTelemetry,
      nodeStatus: determineNodeHealth(record),
    });
  });

  // Retrieve real telemetry history buffer
  app.get('/api/telemetry/history', (req, res) => {
    const queryNodeId = req.query.nodeId as string | undefined;
    const limit = Math.min(Number(req.query.limit) || 50, MAX_HISTORY);

    let history = telemetryHistoryBuffer;
    if (queryNodeId) {
      history = history.filter((t) => t.nodeId === queryNodeId);
    }

    res.json({
      history: history.slice(0, limit),
      count: history.length,
    });
  });

  // Retrieve gateway ingestion and transport metrics
  app.get('/api/gateway/stats', (_req, res) => {
    res.json(getGatewayStats());
  });

  // Retrieve real system event timeline
  app.get('/api/events', (_req, res) => {
    res.json({
      events: systemEventsBuffer,
      count: systemEventsBuffer.length,
    });
  });

  // Reset node state for field calibration (never creates fake data)
  app.post('/api/nodes/clear', (_req, res) => {
    nodeRegistry.clear();
    telemetryHistoryBuffer.length = 0;
    systemEventsBuffer.length = 0;
    mostRecentNodeId = null;
    realSensorFeatureExtractor.clearAll();
    productionDetectionEngine.clearAll();
    recordSystemEvent('NODE_REGISTERED', undefined, 'Node registry cleared for field calibration');
    broadcast({
      type: 'INIT_SNAPSHOT',
      payload: {
        nodes: [],
        latestTelemetry: {},
        detections: {},
        detectionStatus: productionDetectionEngine.getStatus(),
        gatewayStats: getGatewayStats(),
        events: systemEventsBuffer,
      },
    });
    res.json({ success: true, message: 'Node registry cleared.' });
  });

  // ---------------- HUMAN / LIFE DETECTION AI PIPELINE APIS ----------------
  
  // POST /api/detection/infer: Validate input and run configured DetectionEngine
  app.post('/api/detection/infer', async (req, res) => {
    const body = req.body;
    if (!body || typeof body !== 'object') {
      res.status(400).json({
        error: 'Malformed or incomplete inference input: body must be an object',
        status: 'ERROR',
      });
      return;
    }

    const { nodeId, timestamp, source, features } = body;
    const errors: string[] = [];

    if (!nodeId || typeof nodeId !== 'string' || !nodeId.trim()) {
      errors.push('nodeId is required and must be a non-empty string');
    }
    if (timestamp === undefined || timestamp === null || typeof timestamp !== 'number' || !Number.isFinite(timestamp)) {
      errors.push('timestamp is required and must be a valid epoch number');
    }
    const VALID_SOURCES = ['RF', 'RADAR', 'CAMERA', 'SENSOR_FUSION', 'UNKNOWN'];
    if (!source || typeof source !== 'string' || !VALID_SOURCES.includes(source)) {
      errors.push('source is required and must be one of: RF, RADAR, CAMERA, SENSOR_FUSION, UNKNOWN');
    }
    if (!features || typeof features !== 'object') {
      errors.push('features is required and must be a RealSensorFeatures object');
    } else {
      if (typeof features.rawSampleCount !== 'number' || features.rawSampleCount < 0) {
        errors.push('features.rawSampleCount is required and must be a non-negative number');
      }
    }

    if (errors.length > 0) {
      res.status(400).json({
        error: 'Malformed or incomplete inference input',
        details: errors,
        status: 'ERROR',
      });
      return;
    }

    try {
      const input: HumanDetectionInput = {
        nodeId: nodeId.trim(),
        timestamp,
        source: source as HumanDetectionInput['source'],
        features,
        sequence: typeof body.sequence === 'number' ? body.sequence : null,
        quality: typeof body.quality === 'number' ? body.quality : null,
      };

      const result = await productionDetectionEngine.infer(input);
      res.json(result);
    } catch (err) {
      res.status(500).json({
        error: 'Inference engine execution failure',
        message: err instanceof Error ? err.message : 'Unknown error',
        status: 'ERROR',
      });
    }
  });

  // GET /api/detection/status: Current engine availability, model availability, limitations
  app.get('/api/detection/status', (_req, res) => {
    res.json(productionDetectionEngine.getStatus());
  });

  // GET /api/detection/history: Real detection event records (only genuine model inferences)
  app.get('/api/detection/history', (req, res) => {
    const queryNodeId = req.query.nodeId as string | undefined;
    const history = productionDetectionEngine.getDetectionHistory(queryNodeId);
    res.json({
      history,
      count: history.length,
    });
  });

  // GET /api/detection/latest: Latest detection for active or queried node
  app.get('/api/detection/latest', (req, res) => {
    const queryNodeId = (req.query.nodeId as string | undefined) || mostRecentNodeId;
    if (!queryNodeId) {
      res.json({
        detection: null,
        status: 'NO_DATA',
        message: 'No nodes registered',
      });
      return;
    }
    const state = productionDetectionEngine.getNodeState(queryNodeId);
    res.json({
      nodeId: queryNodeId,
      detection: state?.lastResult ?? null,
    });
  });

  // GET /api/radar/status: Real radar hardware connection status
  app.get('/api/radar/status', (_req, res) => {
    if (!latestValidatedRadarPacket || !lastRadarPacketReceivedTime) {
      res.json({
        status: 'NOT_CONNECTED',
        connected: false,
        deviceId: null,
        lastSeen: null,
        lastPacketTimestamp: null,
        packetsReceived: 0,
        sampleRateHz: null,
        firmwareVersion: null,
        source: 'UNKNOWN',
        vitalSignSupported: false,
        message: 'No radar hardware connected. Telemetry input awaiting connection.',
      });
      return;
    }

    const elapsed = Date.now() - lastRadarPacketReceivedTime;
    const isStale = elapsed > RADAR_STALE_THRESHOLD_MS;
    const status = isStale ? 'STALE' : 'CONNECTED';

    res.json({
      status,
      connected: !isStale,
      deviceId: latestValidatedRadarPacket.deviceId,
      lastSeen: lastRadarPacketReceivedTime,
      lastPacketTimestamp: latestValidatedRadarPacket.timestamp,
      packetsReceived: radarPacketsCount,
      sampleRateHz: null,
      firmwareVersion: null,
      source: latestValidatedRadarPacket.source ?? 'HARDWARE',
      vitalSignSupported: Boolean(latestValidatedRadarPacket.vitalSignAvailable),
      message: isStale
        ? `Radar hardware telemetry stale (> ${RADAR_STALE_THRESHOLD_MS / 1000}s without packets)`
        : `Active radar telemetry received from device ${latestValidatedRadarPacket.deviceId}`,
    });
  });

  // GET /api/radar/latest: Latest verified radar telemetry and detection (NEVER generates fake data)
  app.get('/api/radar/latest', (_req, res) => {
    if (!latestValidatedRadarPacket) {
      res.json({
        status: 'NO_DATA',
        telemetry: null,
        message: 'No radar telemetry packets have been received yet.',
      });
      return;
    }

    res.json({
      status: 'DATA_AVAILABLE',
      telemetry: latestValidatedRadarPacket,
      message: `Latest validated radar telemetry from ${latestValidatedRadarPacket.deviceId}`,
    });
  });

  // POST /api/radar/telemetry: Hardware ingestion endpoint for ESP32 / serial / gateway radar telemetry
  app.post('/api/radar/telemetry', (req, res) => {
    const validation = validateRadarTelemetry(req.body, 'HTTP');
    if (!validation.isValid || !validation.data) {
      res.status(400).json({
        success: false,
        accepted: false,
        error: validation.error ?? 'Invalid radar telemetry packet',
      });
      return;
    }

    const telemetry = validation.data;
    latestValidatedRadarPacket = telemetry;
    lastRadarPacketReceivedTime = Date.now();
    radarPacketsCount++;

    // Broadcast ONLY when a NEW VALID RADAR PACKET arrives
    broadcast({
      type: 'RADAR_UPDATE',
      data: telemetry,
      telemetry,
    } as any);

    res.json({
      success: true,
      accepted: true,
      data: telemetry,
      telemetry,
    });
  });

  // GET /api/detection/fusion/latest: Authoritative sensor fusion outcome
  app.get('/api/detection/fusion/latest', (_req, res) => {
    // 1. Evaluate CSI Evidence
    const csiHasPrediction = latestCsiDetectionResult !== null && latestCsiDetectionResult.status !== 'NO_DATA';
    const csiHasHuman = csiHasPrediction && latestCsiDetectionResult?.status === 'PERSON DETECTED';
    const csiHasClear = csiHasPrediction && latestCsiDetectionResult?.status === 'AREA EMPTY';
    const csiModalityStatus = csiHasHuman
      ? 'PERSON DETECTED'
      : csiHasClear
      ? 'CLEAR'
      : csiHasPrediction
      ? 'NO DATA'
      : 'OFFLINE';

    // 2. Evaluate Radar Evidence
    const radarElapsed = lastRadarPacketReceivedTime ? Date.now() - lastRadarPacketReceivedTime : Infinity;
    const radarConnected = latestValidatedRadarPacket !== null && radarElapsed <= RADAR_STALE_THRESHOLD_MS;
    const radarHasHuman =
      radarConnected &&
      (latestValidatedRadarPacket?.motionState === 'MOTION_DETECTED' ||
        latestValidatedRadarPacket?.motionDetected === true ||
        (latestValidatedRadarPacket?.targetCount !== null && (latestValidatedRadarPacket?.targetCount ?? 0) > 0));
    const radarHasClear =
      radarConnected &&
      (latestValidatedRadarPacket?.motionState === 'STATIONARY' ||
        latestValidatedRadarPacket?.motionDetected === false);
    const radarModalityStatus = radarHasHuman
      ? 'PERSON DETECTED'
      : radarHasClear
      ? 'CLEAR'
      : radarConnected
      ? 'NO DATA'
      : 'OFFLINE';

    // 3. Temporal Correlation (Synchronization Window)
    const csiTs = latestCsiDetectionResult?.timestamp ? new Date(latestCsiDetectionResult.timestamp).getTime() : 0;
    const radarTs = latestValidatedRadarPacket?.timestamp
      ? new Date(latestValidatedRadarPacket.timestamp).getTime()
      : lastRadarPacketReceivedTime ?? 0;
    const inSync = csiTs > 0 && radarTs > 0 && Math.abs(csiTs - radarTs) <= FUSION_SYNC_WINDOW_MS;

    let finalStatus: 'NO DATA' | 'CSI DETECTED' | 'RADAR DETECTED' | 'MULTI-SENSOR DETECTED' | 'CONFLICT' | 'ERROR' = 'NO DATA';
    let evidenceSource: 'NO_DATA' | 'CSI_ONLY' | 'RADAR_ONLY' | 'MULTI_SENSOR' | 'CONFLICT' | 'ERROR' = 'NO_DATA';
    let sourceDescription: 'CSI' | 'RADAR' | 'CSI + RADAR' | 'NONE' = 'NONE';
    let fusionState: 'IDLE' | 'SINGLE_SOURCE_CSI' | 'SINGLE_SOURCE_RADAR' | 'FUSED_CONCORDANT' | 'FUSED_CONFLICT' | 'INSUFFICIENT_EVIDENCE' = 'IDLE';
    let notes = 'Awaiting verified sensor streams.';

    if (csiHasHuman && radarHasHuman) {
      if (inSync) {
        finalStatus = 'MULTI-SENSOR DETECTED';
        evidenceSource = 'MULTI_SENSOR';
        sourceDescription = 'CSI + RADAR';
        fusionState = 'FUSED_CONCORDANT';
        notes = 'Both CSI and Radar independently confirm human/life detection within synchronization window.';
      } else {
        // Outside sync window: prioritize whichever measurement is most recent
        if (csiTs >= radarTs) {
          finalStatus = 'CSI DETECTED';
          evidenceSource = 'CSI_ONLY';
          sourceDescription = 'CSI';
          fusionState = 'SINGLE_SOURCE_CSI';
          notes = 'CSI detects person. Radar detection is outside synchronization window.';
        } else {
          finalStatus = 'RADAR DETECTED';
          evidenceSource = 'RADAR_ONLY';
          sourceDescription = 'RADAR';
          fusionState = 'SINGLE_SOURCE_RADAR';
          notes = 'Radar detects person. CSI detection is outside synchronization window.';
        }
      }
    } else if (csiHasHuman && radarHasClear && inSync) {
      finalStatus = 'CONFLICT';
      evidenceSource = 'CONFLICT';
      sourceDescription = 'CSI + RADAR';
      fusionState = 'FUSED_CONFLICT';
      notes = 'Discrepancy: CSI reports PERSON DETECTED, but Radar reports CLEAR within sync window.';
    } else if (radarHasHuman && csiHasClear && inSync) {
      finalStatus = 'CONFLICT';
      evidenceSource = 'CONFLICT';
      sourceDescription = 'CSI + RADAR';
      fusionState = 'FUSED_CONFLICT';
      notes = 'Discrepancy: Radar detects target, but CSI reports AREA EMPTY within sync window.';
    } else if (csiHasHuman) {
      finalStatus = 'CSI DETECTED';
      evidenceSource = 'CSI_ONLY';
      sourceDescription = 'CSI';
      fusionState = 'SINGLE_SOURCE_CSI';
      notes = 'CSI verified detection. Radar has no positive detection (offline/clear/no data).';
    } else if (radarHasHuman) {
      finalStatus = 'RADAR DETECTED';
      evidenceSource = 'RADAR_ONLY';
      sourceDescription = 'RADAR';
      fusionState = 'SINGLE_SOURCE_RADAR';
      notes = 'Radar verified target detection. CSI has no positive detection (offline/empty/no data).';
    } else {
      finalStatus = 'NO DATA';
      evidenceSource = 'NO_DATA';
      sourceDescription = 'NONE';
      fusionState = 'IDLE';
      notes = 'No active sensing streams reporting positive human/target detection.';
    }

    const lastFusionUpdate = Math.max(csiTs, radarTs) || null;

    res.json({
      finalStatus,
      evidenceSource,
      sourceDescription,
      csiStatus: latestCsiDetectionResult?.status ?? 'NO DATA',
      radarStatus: latestValidatedRadarPacket?.motionState ?? (radarConnected ? 'CLEAR' : 'NOT CONNECTED'),
      csiModalityStatus,
      radarModalityStatus,
      csiConfidence: latestCsiDetectionResult?.confidence ?? null,
      radarConfidence: latestValidatedRadarPacket?.dataQuality ?? null,
      fusionState,
      lastFusionUpdate,
      syncWindowMs: FUSION_SYNC_WINDOW_MS,
      inSync,
      notes,
    });
  });

  // ---------------- CSI HUMAN DETECTION ENDPOINTS ----------------
  // GET /api/prediction: STRICT AUTHORITATIVE RETRIEVAL (NEVER TRIGGERS INFERENCE)
  app.get('/api/prediction', (_req, res) => {
    if (!latestCsiDetectionResult) {
      res.json({
        status: 'NO_DATA',
        person_detected: null,
        person_votes: null,
        window_size: CSI_WINDOW_SIZE,
        confidence: null,
        timestamp: null,
        model: 'RandomForestClassifier',
        feature_count: CSI_FEATURE_COUNT,
        source: 'RF_CSI',
        message: 'No CSI inference has been completed yet. Awaiting 30 real CSI packets.',
      });
      return;
    }
    res.json(latestCsiDetectionResult);
  });

  // GET /api/status: Current backend state & model configuration
  app.get('/api/status', (_req, res) => {
    res.json({
      backend: 'online',
      ml_model: 'loaded',
      model_type: 'RandomForestClassifier',
      features_required: CSI_FEATURE_COUNT,
      voting_window: CSI_WINDOW_SIZE,
      server_time: new Date().toISOString(),
      last_inference_time: latestCsiDetectionResult?.timestamp ?? null,
      total_inferences: latestCsiDetectionResult?.inference_count ?? 0,
      packets_in_window: csiSlidingWindow.length,
    });
  });

  // POST /api/csi/telemetry: Real hardware ingestion for CSI packet streams
  app.post('/api/csi/telemetry', (req, res) => {
    const body = req.body;
    if (!body || typeof body !== 'object') {
      res.status(400).json({ error: 'Invalid CSI packet body' });
      return;
    }
    const nodeId = typeof body.nodeId === 'string' && body.nodeId.trim() ? body.nodeId.trim() : 'ESP32-CSI-RECEIVER';
    const features = Array.isArray(body.features) ? body.features : [];
    if (features.length < CSI_FEATURE_COUNT && typeof body.vote !== 'boolean') {
      res.status(400).json({
        error: `Expected at least ${CSI_FEATURE_COUNT} CSI subcarrier features or boolean vote`,
      });
      return;
    }

    const { inferenceTriggered, result } = ingestRealCsiPacket(nodeId, features, body.vote);
    res.json({
      success: true,
      accepted: true,
      packetsInWindow: csiSlidingWindow.length,
      windowSize: CSI_WINDOW_SIZE,
      inferenceTriggered,
      latestPrediction: result ?? latestCsiDetectionResult,
    });
  });

  // GET /api/detection/csi/history: Genuine CSI detection events
  app.get('/api/detection/csi/history', (_req, res) => {
    res.json({
      history: csiDetectionHistory,
      count: csiDetectionHistory.length,
    });
  });

  // ---------------- VITE & STATIC SERVING ----------------
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  server.listen(PORT, HOST, () => {
    console.log(`Mine-Rescue Telemetry Server listening on http://${HOST}:${PORT}`);
    console.log(`  Health Check: GET http://${HOST}:${PORT}/api/health`);
    console.log(`  Ingestion:    POST http://${HOST}:${PORT}/api/telemetry`);
    console.log(`  WebSocket:    ws://${HOST}:${PORT}/ws`);

    // Enumerate network interfaces for convenience when connecting ESP32 gateway
    try {
      const nets = os.networkInterfaces();
      const lanIps: string[] = [];
      for (const name of Object.keys(nets)) {
        for (const net of nets[name] || []) {
          if (net.family === 'IPv4' && !net.internal) {
            lanIps.push(net.address);
          }
        }
      }
      if (lanIps.length > 0) {
        console.log('Available LAN addresses for ESP32 Gateway configuration:');
        lanIps.forEach((ip) => {
          console.log(`  http://${ip}:${PORT}/api/telemetry`);
        });
      }
    } catch {
      // Ignore network interface enumeration errors
    }
  });
}

startServer().catch((err) => {
  console.error('Fatal error starting telemetry server:', err);
  process.exit(1);
});
