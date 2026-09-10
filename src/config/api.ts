/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Centralized configuration for the remote FastAPI backend or integrated telemetry server.
 */

const getBrowserOrigin = (): string => {
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin;
  }
  return 'http://localhost:3000';
};

const getBrowserWsUrl = (): string => {
  if (typeof window !== 'undefined' && window.location?.host) {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//${window.location.host}/ws`;
  }
  return 'ws://localhost:3000/ws';
};

export const API_BASE_URL =
  import.meta.env.VITE_FASTAPI_BASE_URL ||
  import.meta.env.VITE_FASTAPI_URL ||
  getBrowserOrigin();

export const WS_URL =
  import.meta.env.VITE_FASTAPI_WS_URL ||
  getBrowserWsUrl();

export const STATUS_URL = `${API_BASE_URL}/api/status`;
export const STATUS_ENDPOINT = STATUS_URL;

export const PREDICTION_URL = `${API_BASE_URL}/api/prediction`;
export const PREDICTION_ENDPOINT = PREDICTION_URL;
