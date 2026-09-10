/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Strict TypeScript contracts for the remote FastAPI ML Detection backend.
 * Directly maps verified real responses from:
 * - GET http://192.168.1.6:8000/api/status
 * - GET http://192.168.1.6:8000/api/prediction
 * - ws://192.168.1.6:8000/ws
 */

export type FastApiWsState = 'CONNECTING' | 'CONNECTED' | 'DISCONNECTED' | 'ERROR';

/** Categorized HTTP networking failure types */
export type HttpErrorCategory =
  | 'NONE'
  | 'MIXED_CONTENT_BLOCKED'
  | 'CORS_OR_NETWORK_ERROR'
  | 'HTTP_STATUS_ERROR'
  | 'BACKEND_OFFLINE';

/** Categorized WebSocket networking failure types */
export type WsErrorCategory =
  | 'NONE'
  | 'MIXED_CONTENT_BLOCKED'
  | 'CONNECTION_FAILED'
  | 'CLOSED_ABNORMALLY';

/** Detailed diagnostics for developer telemetry & network debugging */
export interface FastApiDiagnostics {
  httpStatusUrl: string;
  httpPredictionUrl: string;
  wsUrl: string;
  currentOrigin: string;
  isHttpsContext: boolean;
  mixedContentRisk: boolean;
  wsReadyState: number; // -1: NONE, 0: CONNECTING, 1: OPEN, 2: CLOSING, 3: CLOSED
  wsReadyStateLabel: string;
  httpErrorCategory: HttpErrorCategory;
  wsErrorCategory: WsErrorCategory;
  networkErrorMessage: string | null;
  wsErrorMessage: string | null;
  reconnectAttempts: number;
  maxReconnectAttempts: number;
  reconnectPaused: boolean;
  lastHttpAttemptTime: number | null;
  lastWsAttemptTime: number | null;
}

/** Real response format from GET http://192.168.1.6:8000/api/status */
export interface FastApiStatusResponse {
  backend: string; // e.g. "online"
  ml_model: string; // e.g. "loaded"
  model_type: string; // e.g. "RandomForestClassifier"
  features_required: number; // e.g. 192
}

/** Real prediction payload format from ws://192.168.1.6:8000/ws and GET /api/prediction */
export interface FastApiPredictionData {
  status: string; // e.g. "PERSON DETECTED" | "AREA EMPTY" | "UNCERTAIN"
  person_detected: boolean | null;
  person_votes: number | null;
  window_size: number | null;
  confidence: number | null; // e.g. 0.7787777777777778
  timestamp: string | null; // e.g. "2026-09-10T01:16:06.292004+00:00"
}

export interface FastApiDetectionHistoryRecord {
  id: string;
  timestamp: string | null;
  receivedAt: number;
  status: string;
  person_votes: number | null;
  window_size: number | null;
  confidence: number | null;
  model_type: string | null;
}

export interface FastApiState {
  wsState: FastApiWsState;
  backendOnline: boolean;
  statusInfo: FastApiStatusResponse | null;
  latestPrediction: FastApiPredictionData | null;
  isStale: boolean;
  lastMessageTimestamp: number | null;
  error: string | null;
  diagnostics: FastApiDiagnostics;
}
