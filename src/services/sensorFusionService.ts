/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Sensor Fusion Engine combining independent CSI and Radar sensing streams.
 * 
 * Fusion Invariants:
 * - NEVER manufactures a detection result or simulates data.
 * - Combines only verified real CSI and/or verified real Radar results.
 * - Evidence States: NO_DATA, CSI_ONLY, RADAR_ONLY, MULTI_SENSOR, CONFLICT, ERROR.
 * - Final States: NO DATA, CSI DETECTED, RADAR DETECTED, MULTI-SENSOR DETECTED, CONFLICT, ERROR.
 * - Does NOT claim two sensors detecting motion equals two people.
 * - Does NOT calculate estimated people count without a validated count model.
 */

import { FastApiState } from '../types/fastApiDetection.ts';
import {
  RadarState,
  SensorFusionResult,
  FusionFinalStatus,
  FusionEvidenceSource,
  FusionState,
  FusionModalityStatus,
} from '../types/radar.ts';

export const FUSION_SYNC_WINDOW_MS = 15000; // 15s synchronization window

export function computeSensorFusion(
  csiState: FastApiState,
  radarState: RadarState
): SensorFusionResult {
  // 1. Evaluate CSI Evidence
  const csiOnline = csiState.backendOnline;
  const csiPrediction = csiState.latestPrediction;
  const csiStatusStr = csiPrediction?.status ?? (csiOnline ? 'NO DATA' : 'OFFLINE');
  const csiConfidence = csiPrediction?.confidence ?? null;

  const csiHasHuman = csiOnline && csiPrediction?.status === 'PERSON DETECTED';
  const csiHasClear = csiOnline && csiPrediction?.status === 'AREA EMPTY';
  const csiHasValidData = csiOnline && csiPrediction !== null && csiPrediction.status !== 'NO_DATA';

  const csiModalityStatus: FusionModalityStatus = csiHasHuman
    ? 'PERSON DETECTED'
    : csiHasClear
    ? 'CLEAR'
    : csiOnline
    ? 'NO DATA'
    : 'OFFLINE';

  // 2. Evaluate Radar Evidence
  const radarConnected =
    (radarState.deviceStatus.status === 'CONNECTED' || radarState.deviceStatus.connected) &&
    !radarState.isStale &&
    radarState.deviceStatus.status !== 'NOT_CONNECTED';
  const radarTelemetry = radarState.latestTelemetry;
  const radarDetection = radarState.latestDetection;
  const radarConfidence = radarDetection?.confidence ?? radarTelemetry?.dataQuality ?? radarTelemetry?.quality ?? null;

  let radarStatusStr = radarConnected ? 'NO DATA' : 'OFFLINE';
  let radarHasHuman = false;
  let radarHasClear = false;
  let radarHasValidData = false;

  if (radarConnected && (radarTelemetry || radarDetection)) {
    radarHasValidData = true;
    if (
      radarDetection?.status === 'TARGET_DETECTED' ||
      radarTelemetry?.motionDetected === true ||
      radarTelemetry?.motionState === 'MOTION_DETECTED' ||
      (radarTelemetry?.targetCount !== null && (radarTelemetry?.targetCount ?? 0) > 0)
    ) {
      radarHasHuman = true;
      radarStatusStr = 'PERSON DETECTED';
    } else if (
      radarDetection?.status === 'NO_TARGET' ||
      radarTelemetry?.motionDetected === false ||
      radarTelemetry?.motionState === 'STATIONARY'
    ) {
      radarHasClear = true;
      radarStatusStr = 'CLEAR';
    } else {
      radarStatusStr = radarDetection?.status ?? radarTelemetry?.motionState ?? 'UNCERTAIN';
    }
  }

  const radarModalityStatus: FusionModalityStatus = radarHasHuman
    ? 'PERSON DETECTED'
    : radarHasClear
    ? 'CLEAR'
    : radarConnected
    ? 'NO DATA'
    : 'OFFLINE';

  // 3. Temporal Correlation (Synchronization Window)
  const csiTs = csiPrediction?.timestamp ? new Date(csiPrediction.timestamp).getTime() : csiState.lastMessageTimestamp ?? 0;
  const radarTs = radarTelemetry?.timestamp
    ? new Date(radarTelemetry.timestamp).getTime()
    : radarState.lastMessageTimestamp ?? 0;
  const inSync = csiTs > 0 && radarTs > 0 && Math.abs(csiTs - radarTs) <= FUSION_SYNC_WINDOW_MS;

  // 4. Sensor Fusion Decision Matrix
  let finalStatus: FusionFinalStatus = 'NO DATA';
  let evidenceSource: FusionEvidenceSource = 'NO_DATA';
  let sourceDescription: 'CSI' | 'RADAR' | 'CSI + RADAR' | 'NONE' = 'NONE';
  let fusionState: FusionState = 'IDLE';
  let notes = 'Awaiting real sensor data streams.';

  // Error check
  if (csiState.error && radarState.error) {
    return {
      finalStatus: 'ERROR',
      evidenceSource: 'ERROR',
      sourceDescription: 'NONE',
      csiStatus: csiStatusStr,
      radarStatus: radarStatusStr,
      csiModalityStatus,
      radarModalityStatus,
      csiConfidence,
      radarConfidence,
      fusionState: 'INSUFFICIENT_EVIDENCE',
      lastFusionUpdate: Date.now(),
      syncWindowMs: FUSION_SYNC_WINDOW_MS,
      inSync: false,
      notes: 'Both sensing subsystems reporting communication/hardware errors.',
    };
  }

  // Case A: Both sources have valid detection data
  if (csiHasValidData && radarHasValidData) {
    if (csiHasHuman && radarHasHuman) {
      if (inSync) {
        finalStatus = 'MULTI-SENSOR DETECTED';
        evidenceSource = 'MULTI_SENSOR';
        sourceDescription = 'CSI + RADAR';
        fusionState = 'FUSED_CONCORDANT';
        notes = 'Concordant human/life evidence confirmed independently by both RF CSI and Radar within sync window.';
      } else {
        // Outside sync window: do NOT report MULTI_SENSOR
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
    } else if (csiHasClear && radarHasClear) {
      finalStatus = 'NO DATA';
      evidenceSource = 'MULTI_SENSOR';
      sourceDescription = 'CSI + RADAR';
      fusionState = 'FUSED_CONCORDANT';
      notes = 'Both RF CSI and Radar independently confirm monitored area is clear.';
    } else if (csiHasHuman && radarHasClear && inSync) {
      finalStatus = 'CONFLICT';
      evidenceSource = 'CONFLICT';
      sourceDescription = 'CSI + RADAR';
      fusionState = 'FUSED_CONFLICT';
      notes = 'Discrepancy: RF CSI model indicates PERSON DETECTED, but Radar reports CLEAR in sensing radius.';
    } else if (csiHasClear && radarHasHuman && inSync) {
      finalStatus = 'CONFLICT';
      evidenceSource = 'CONFLICT';
      sourceDescription = 'CSI + RADAR';
      fusionState = 'FUSED_CONFLICT';
      notes = 'Discrepancy: Radar detects target motion, but RF CSI model reports AREA EMPTY.';
    } else if (csiHasHuman) {
      finalStatus = 'CSI DETECTED';
      evidenceSource = 'CSI_ONLY';
      sourceDescription = 'CSI';
      fusionState = 'SINGLE_SOURCE_CSI';
      notes = 'Human detection verified via RF CSI. Radar reports no positive target.';
    } else if (radarHasHuman) {
      finalStatus = 'RADAR DETECTED';
      evidenceSource = 'RADAR_ONLY';
      sourceDescription = 'RADAR';
      fusionState = 'SINGLE_SOURCE_RADAR';
      notes = 'Target detected via Radar. RF CSI reports no positive detection.';
    } else {
      finalStatus = 'NO DATA';
      evidenceSource = 'NO_DATA';
      sourceDescription = 'NONE';
      fusionState = 'INSUFFICIENT_EVIDENCE';
      notes = 'Multi-sensor input present with partial certainty. Cross-verification ongoing.';
    }
  }
  // Case B: CSI only valid data (Radar offline/no data - OFFLINE is NOT person absent)
  else if (csiHasValidData && !radarHasValidData) {
    if (csiHasHuman) {
      finalStatus = 'CSI DETECTED';
      evidenceSource = 'CSI_ONLY';
      sourceDescription = 'CSI';
      fusionState = 'SINGLE_SOURCE_CSI';
      notes = 'Human detection verified via RF CSI 192-feature Random Forest. Radar stream offline/no data.';
    } else if (csiHasClear) {
      finalStatus = 'NO DATA';
      evidenceSource = 'CSI_ONLY';
      sourceDescription = 'CSI';
      fusionState = 'SINGLE_SOURCE_CSI';
      notes = 'RF CSI indicates area empty. Radar stream offline/no data.';
    } else {
      finalStatus = 'NO DATA';
      evidenceSource = 'CSI_ONLY';
      sourceDescription = 'CSI';
      fusionState = 'SINGLE_SOURCE_CSI';
      notes = 'RF CSI inference uncertain. Radar stream offline/no data.';
    }
  }
  // Case C: Radar only valid data (CSI offline/no data - OFFLINE is NOT person absent)
  else if (!csiHasValidData && radarHasValidData) {
    if (radarHasHuman) {
      finalStatus = 'RADAR DETECTED';
      evidenceSource = 'RADAR_ONLY';
      sourceDescription = 'RADAR';
      fusionState = 'SINGLE_SOURCE_RADAR';
      notes = 'Target motion detected via active Radar. CSI backend offline/no data.';
    } else if (radarHasClear) {
      finalStatus = 'NO DATA';
      evidenceSource = 'RADAR_ONLY';
      sourceDescription = 'RADAR';
      fusionState = 'SINGLE_SOURCE_RADAR';
      notes = 'Radar indicates area clear. CSI backend offline/no data.';
    } else {
      finalStatus = 'NO DATA';
      evidenceSource = 'RADAR_ONLY';
      fusionState = 'SINGLE_SOURCE_RADAR';
      notes = 'Radar signal present but target uncertain. CSI backend offline/no data.';
    }
  }
  // Case D: Neither source has valid data
  else {
    finalStatus = 'NO DATA';
    evidenceSource = 'NO_DATA';
    sourceDescription = 'NONE';
    fusionState = 'IDLE';
    notes = 'No active sensing streams providing valid detection data.';
  }

  const latestTs = Math.max(csiTs, radarTs);

  return {
    finalStatus,
    evidenceSource,
    sourceDescription,
    csiStatus: csiStatusStr,
    radarStatus: radarStatusStr,
    csiModalityStatus,
    radarModalityStatus,
    csiConfidence,
    radarConfidence,
    fusionState,
    lastFusionUpdate: latestTs > 0 ? latestTs : null,
    syncWindowMs: FUSION_SYNC_WINDOW_MS,
    inSync,
    notes,
  };
}
