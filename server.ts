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
} from './src/types/telemetry.ts';

const PORT = 3000;
const HOST = '0.0.0.0';

interface InternalNodeRecord {
  nodeId: string;
  firstSeen: number;
  lastSeen: number;
  lastTimestamp: number | string | null;
  lastSequenceNumber: number | null;
  latestTelemetry: SensorTelemetry | null;
  totalPacketsReceived: number;
  acceptedPacketCount: number;
  rejectedPacketCount: number;
  duplicatePacketsCount: number;
  outOfOrderPacketsCount: number;
  freshness: SensorFreshnessMap;
  recentPacketTimes: number[];
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

  // Handle WebSocket connections
  wss.on('connection', (ws) => {
    clients.add(ws);
    recordSystemEvent('WEBSOCKET_CONNECTED', undefined, `Client connected (${clients.size} active)`);

    // Prepare initial snapshot
    const latestMap: Record<string, SensorTelemetry> = {};
    for (const [id, rec] of nodeRegistry.entries()) {
      if (rec.latestTelemetry) {
        latestMap[id] = rec.latestTelemetry;
      }
    }

    const initMessage: WebSocketMessage = {
      type: 'INIT_SNAPSHOT',
      payload: {
        nodes: getAllNodeStatuses(),
        latestTelemetry: latestMap,
        gatewayStats: getGatewayStats(),
        events: systemEventsBuffer,
      },
    };

    try {
      ws.send(JSON.stringify(initMessage));
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
        lastSequenceNumber: null,
        latestTelemetry: null,
        totalPacketsReceived: 0,
        acceptedPacketCount: 0,
        rejectedPacketCount: 0,
        duplicatePacketsCount: 0,
        outOfOrderPacketsCount: 0,
        freshness: {
          lastTelemetryReceived: telemetry.serverReceiveTime,
          lastImuUpdate: telemetry.acceleration || telemetry.gyroscope ? telemetry.serverReceiveTime : null,
          lastDistanceUpdate: telemetry.distance !== null && telemetry.distance !== undefined ? telemetry.serverReceiveTime : null,
          lastAcousticUpdate: telemetry.soundLevel !== null && telemetry.soundLevel !== undefined ? telemetry.serverReceiveTime : null,
          lastRfUpdate: telemetry.rssi !== null || telemetry.packetLoss !== null ? telemetry.serverReceiveTime : null,
          lastBatteryUpdate: telemetry.battery !== null && telemetry.battery !== undefined ? telemetry.serverReceiveTime : null,
        },
        recentPacketTimes: [],
      };
      nodeRegistry.set(nodeId, nodeRecord);
      recordSystemEvent('NODE_REGISTERED', nodeId, 'Node registered from real hardware telemetry packet');
    }

    // Duplicate detection check
    let isDuplicate = false;
    if (
      nodeRecord.totalPacketsReceived > 0 &&
      telemetry.sequenceNumber !== null &&
      telemetry.sequenceNumber !== undefined &&
      nodeRecord.lastSequenceNumber !== null &&
      nodeRecord.lastSequenceNumber === telemetry.sequenceNumber
    ) {
      isDuplicate = true;
    } else if (
      nodeRecord.totalPacketsReceived > 0 &&
      (telemetry.sequenceNumber === null || telemetry.sequenceNumber === undefined) &&
      telemetry.timestamp !== null &&
      nodeRecord.lastTimestamp !== null &&
      nodeRecord.lastTimestamp === telemetry.timestamp
    ) {
      isDuplicate = true;
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

    // Out-of-order check: older packets must never replace newer telemetry as the latest state
    let isStaleOrder = false;
    if (
      nodeRecord.totalPacketsReceived > 0 &&
      telemetry.sequenceNumber !== null &&
      telemetry.sequenceNumber !== undefined &&
      nodeRecord.lastSequenceNumber !== null &&
      telemetry.sequenceNumber < nodeRecord.lastSequenceNumber
    ) {
      isStaleOrder = true;
    } else if (
      nodeRecord.totalPacketsReceived > 0 &&
      telemetry.timestamp !== null &&
      nodeRecord.lastTimestamp !== null &&
      typeof telemetry.timestamp === 'number' &&
      typeof nodeRecord.lastTimestamp === 'number' &&
      telemetry.timestamp < nodeRecord.lastTimestamp
    ) {
      isStaleOrder = true;
    }

    if (isStaleOrder) {
      totalOutOfOrderDetected++;
      nodeRecord.outOfOrderPacketsCount++;
      recordSystemEvent('OUT_OF_ORDER_PACKET', nodeId, `Out-of-order sequence #${telemetry.sequenceNumber ?? 'N/A'}`);
    }

    // Update node record with real telemetry
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
        nodeRecord.lastSequenceNumber = telemetry.sequenceNumber;
      }
      nodeRecord.latestTelemetry = telemetry;
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

    recordSystemEvent('PACKET_RECEIVED', nodeId, `Sequence #${telemetry.sequenceNumber ?? 'N/A'}`);

    // Push to telemetry history buffer
    telemetryHistoryBuffer.unshift(telemetry);
    if (telemetryHistoryBuffer.length > MAX_HISTORY) {
      telemetryHistoryBuffer.pop();
    }

    // Broadcast to dashboard clients
    broadcast({
      type: 'TELEMETRY_UPDATE',
      payload: telemetry,
    });

    broadcast({
      type: 'NODE_STATUS_UPDATE',
      payload: getAllNodeStatuses(),
    });

    return {
      accepted: true,
      success: true,
      message: 'Telemetry packet successfully ingested',
      telemetry,
    };
  }

  // Periodic node staleness evaluation (every 2 seconds)
  setInterval(() => {
    if (nodeRegistry.size > 0 && clients.size > 0) {
      broadcast({
        type: 'NODE_STATUS_UPDATE',
        payload: getAllNodeStatuses(),
      });
      broadcast({
        type: 'GATEWAY_STATS',
        payload: getGatewayStats(),
      });
    }
  }, 2000);

  // ---------------- REST API ROUTES ----------------

  // Health check endpoint: Real application/backend health state
  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      service: 'mine-rescue-telemetry-ingestion',
      uptimeSeconds: Math.floor((Date.now() - serverStartTime) / 1000),
      webSocketClientsCount: clients.size,
      registeredNodesCount: nodeRegistry.size,
      validTelemetryCount: totalPacketsAccepted,
      rejectedTelemetryCount: totalPacketsRejected,
      duplicatesCount: totalDuplicatesDetected,
      mostRecentNodeId: mostRecentNodeId ?? null,
      lastTelemetryReceiveTime: lastIngestionTime ?? null,
      latestPacketStatus: lastIngestionTime ? 'RECEIVED' : 'NO DATA',
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
    recordSystemEvent('NODE_REGISTERED', undefined, 'Node registry cleared for field calibration');
    broadcast({
      type: 'INIT_SNAPSHOT',
      payload: {
        nodes: [],
        latestTelemetry: {},
        gatewayStats: getGatewayStats(),
        events: systemEventsBuffer,
      },
    });
    res.json({ success: true, message: 'Node registry cleared.' });
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
