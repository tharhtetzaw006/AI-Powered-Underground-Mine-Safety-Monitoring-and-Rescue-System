/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Centralized configuration for the remote FastAPI backend.
 *
 * FastAPI HTTP:
 *   http://172.20.10.3:8000
 *
 * FastAPI WebSocket:
 *   ws://172.20.10.3:8000/ws
 */

export const API_BASE_URL =
  import.meta.env.VITE_FASTAPI_BASE_URL ||
  import.meta.env.VITE_FASTAPI_URL ||
  "http://172.20.10.3:8000";

export const WS_URL =
  import.meta.env.VITE_FASTAPI_WS_URL || "ws://172.20.10.3:8000/ws";

export const STATUS_URL = `${API_BASE_URL}/api/status`;
export const STATUS_ENDPOINT = STATUS_URL;

export const PREDICTION_URL = `${API_BASE_URL}/api/prediction`;
export const PREDICTION_ENDPOINT = PREDICTION_URL;
