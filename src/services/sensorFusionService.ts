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
import { RadarState, SensorFusionResult, FusionFinalStatus, FusionEvidenceSource, FusionState } from '../types/radar.ts';

export function computeSensorFusion(
  csiState: FastApiState,
  radarState: RadarState
): SensorFusionResult {
  // 1. Evaluate CSI Evidence
  const csiOnline = csiState.backendOnline;
  const csiPrediction = csiState.latestPrediction;
  const csiStatusStr = csiPrediction?.status ?? (csiOnline ? 'UNCERTAIN' : 'NO DATA');
  const csiConfidence = csiPrediction?.confidence ?? null;

  const csiHasHuman = csiOnline && csiPrediction?.status === 'PERSON DETECTED';
  const csiHasClear = csiOnline && csiPrediction?.status === 'AREA EMPTY';
  const csiHasValidData = csiOnline && csiPrediction !== null && csiStatusStr !== 'NO DATA';

  // 2. Evaluate Radar Evidence
  const radarConnected = radarState.deviceStatus.connected && !radarState.isStale;
  const radarTelemetry = radarState.latestTelemetry;
  const radarDetection = radarState.latestDetection;
  const radarConfidence = radarDetection?.confidence ?? radarTelemetry?.quality ?? null;

  let radarStatusStr = 'NO DATA';
  let radarHasHuman = false;
  let radarHasClear = false;
  let radarHasValidData = false;

  if (radarConnected && (radarTelemetry || radarDetection)) {
    radarHasValidData = true;
    if (radarDetection?.status === 'TARGET_DETECTED' || radarTelemetry?.motionDetected === true) {
      radarHasHuman = true;
      radarStatusStr = 'TARGET_DETECTED';
    } else if (radarDetection?.status === 'NO_TARGET' || radarTelemetry?.motionDetected === false) {
      radarHasClear = true;
      radarStatusStr = 'NO_TARGET';
    } else {
      radarStatusStr = radarDetection?.status ?? 'UNCERTAIN';
    }
  }

  // 3. Sensor Fusion Decision Matrix
  let finalStatus: FusionFinalStatus = 'NO DATA';
  let evidenceSource: FusionEvidenceSource = 'NO_DATA';
  let fusionState: FusionState = 'IDLE';
  let notes = 'Awaiting real sensor data streams.';

  // Error check
  if (csiState.error && radarState.error) {
    return {
      finalStatus: 'ERROR',
      evidenceSource: 'ERROR',
      csiStatus: csiStatusStr,
      radarStatus: radarStatusStr,
      csiConfidence,
      radarConfidence,
      fusionState: 'INSUFFICIENT_EVIDENCE',
      lastFusionUpdate: Date.now(),
      notes: 'Both sensing subsystems reporting communication/hardware errors.',
    };
  }

  // Case A: Both sources have valid data
  if (csiHasValidData && radarHasValidData) {
    if (csiHasHuman && radarHasHuman) {
      // Concordant positive human evidence
      finalStatus = 'MULTI-SENSOR DETECTED';
      evidenceSource = 'MULTI_SENSOR';
      fusionState = 'FUSED_CONCORDANT';
      notes = 'Concordant human/life evidence confirmed independently by both RF CSI and Radar.';
    } else if (csiHasClear && radarHasClear) {
      // Concordant negative evidence
      finalStatus = 'NO DATA';
      evidenceSource = 'MULTI_SENSOR';
      fusionState = 'FUSED_CONCORDANT';
      notes = 'Both RF CSI and Radar independently confirm monitored area is clear.';
    } else if (csiHasHuman && radarHasClear) {
      // Direct conflict: CSI positive, Radar negative
      finalStatus = 'CONFLICT';
      evidenceSource = 'CONFLICT';
      fusionState = 'FUSED_CONFLICT';
      notes = 'Discrepancy: RF CSI model indicates PERSON DETECTED, but Radar reports NO TARGET in sensing radius.';
    } else if (csiHasClear && radarHasHuman) {
      // Direct conflict: CSI negative, Radar positive
      finalStatus = 'CONFLICT';
      evidenceSource = 'CONFLICT';
      fusionState = 'FUSED_CONFLICT';
      notes = 'Discrepancy: Radar detects target motion, but RF CSI model reports AREA EMPTY.';
    } else {
      // One or both uncertain
      finalStatus = csiHasHuman ? 'CSI DETECTED' : radarHasHuman ? 'RADAR DETECTED' : 'NO DATA';
      evidenceSource = 'MULTI_SENSOR';
      fusionState = 'INSUFFICIENT_EVIDENCE';
      notes = 'Multi-sensor input present with partial certainty. Cross-verification ongoing.';
    }
  }
  // Case B: CSI only valid data
  else if (csiHasValidData && !radarHasValidData) {
    if (csiHasHuman) {
      finalStatus = 'CSI DETECTED';
      evidenceSource = 'CSI_ONLY';
      fusionState = 'SINGLE_SOURCE_CSI';
      notes = 'Human detection verified via RF CSI 192-feature Random Forest. Radar stream offline/no data.';
    } else if (csiHasClear) {
      finalStatus = 'NO DATA';
      evidenceSource = 'CSI_ONLY';
      fusionState = 'SINGLE_SOURCE_CSI';
      notes = 'RF CSI indicates area empty. Radar stream offline/no data.';
    } else {
      finalStatus = 'NO DATA';
      evidenceSource = 'CSI_ONLY';
      fusionState = 'SINGLE_SOURCE_CSI';
      notes = 'RF CSI inference uncertain. Radar stream offline/no data.';
    }
  }
  // Case C: Radar only valid data
  else if (!csiHasValidData && radarHasValidData) {
    if (radarHasHuman) {
      finalStatus = 'RADAR DETECTED';
      evidenceSource = 'RADAR_ONLY';
      fusionState = 'SINGLE_SOURCE_RADAR';
      notes = 'Target motion detected via active Radar. CSI backend offline/no data.';
    } else if (radarHasClear) {
      finalStatus = 'NO DATA';
      evidenceSource = 'RADAR_ONLY';
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
    fusionState = 'IDLE';
    notes = 'No active sensing streams providing valid detection data.';
  }

  const latestTs = Math.max(
    csiState.lastMessageTimestamp ?? 0,
    radarState.lastMessageTimestamp ?? 0
  );

  return {
    finalStatus,
    evidenceSource,
    csiStatus: csiStatusStr,
    radarStatus: radarStatusStr,
    csiConfidence,
    radarConfidence,
    fusionState,
    lastFusionUpdate: latestTs > 0 ? latestTs : null,
    notes,
  };
}
