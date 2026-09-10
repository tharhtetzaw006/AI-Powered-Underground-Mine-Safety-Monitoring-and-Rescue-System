/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Centralized configuration for the remote FastAPI backend.
 * Default points to the dedicated LAN machine running FastAPI Human Detection service:
 * http://192.168.1.6:8000 & ws://192.168.1.6:8000/ws
 */

export const API_BASE_URL =
  import.meta.env.VITE_FASTAPI_BASE_URL ||
  import.meta.env.VITE_FASTAPI_URL ||
  'http://192.168.1.6:8000';

export const WS_URL =
  import.meta.env.VITE_FASTAPI_WS_URL ||
  'ws://192.168.1.6:8000/ws';

export const STATUS_URL = `${API_BASE_URL}/api/status`;
export const STATUS_ENDPOINT = STATUS_URL;

export const PREDICTION_URL = `${API_BASE_URL}/api/prediction`;
export const PREDICTION_ENDPOINT = PREDICTION_URL;
