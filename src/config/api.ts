/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Centralized configuration for the remote FastAPI backend.
 * Verified reachable from the Windows frontend laptop.
 */

export const API_BASE_URL = 'http://192.168.1.6:8000';
export const WS_URL = 'ws://192.168.1.6:8000/ws';

export const STATUS_ENDPOINT = `${API_BASE_URL}/api/status`;
export const PREDICTION_ENDPOINT = `${API_BASE_URL}/api/prediction`;
