/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Production service connecting directly to the real remote FastAPI backend.
 * Endpoints:
 * - Status:     http://192.168.1.6:8000/api/status
 * - Prediction: http://192.168.1.6:8000/api/prediction
 * - WebSocket:  ws://192.168.1.6:8000/ws
 */

import { API_BASE_URL, WS_URL, STATUS_ENDPOINT, PREDICTION_ENDPOINT } from '../config/api.ts';
import {
  FastApiWsState,
  FastApiStatusResponse,
  FastApiPredictionData,
  FastApiState,
  FastApiDetectionHistoryRecord,
} from '../types/fastApiDetection.ts';

export type FastApiStateListener = (state: FastApiState) => void;
export type FastApiPredictionListener = (
  prediction: FastApiPredictionData,
  historyRecord: FastApiDetectionHistoryRecord
) => void;

class FastApiDetectionService {
  private ws: WebSocket | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private statusPollTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectAttempts = 0;
  private readonly minReconnectDelay = 2000;
  private readonly maxReconnectDelay = 10000;
  private isIntentionallyClosed = false;

  private state: FastApiState = {
    wsState: 'DISCONNECTED',
    backendOnline: false,
    statusInfo: null,
    latestPrediction: null,
    isStale: true,
    lastMessageTimestamp: null,
    error: null,
  };

  private stateListeners = new Set<FastApiStateListener>();
  private predictionListeners = new Set<FastApiPredictionListener>();
  private history: FastApiDetectionHistoryRecord[] = [];

  constructor() {
    // Hardware-verified FastAPI client
  }

  public getState(): FastApiState {
    return { ...this.state };
  }

  public getHistory(): FastApiDetectionHistoryRecord[] {
    return [...this.history];
  }

  public onStateChange(listener: FastApiStateListener): () => void {
    this.stateListeners.add(listener);
    listener(this.getState());
    return () => this.stateListeners.delete(listener);
  }

  public onPrediction(listener: FastApiPredictionListener): () => void {
    this.predictionListeners.add(listener);
    return () => this.predictionListeners.delete(listener);
  }

  private updateState(partial: Partial<FastApiState>): void {
    this.state = { ...this.state, ...partial };
    const snapshot = this.getState();
    this.stateListeners.forEach((l) => l(snapshot));
  }

  /**
   * Starts the FastAPI service:
   * 1. Calls GET http://192.168.1.6:8000/api/status
   * 2. Initiates WebSocket connection to ws://192.168.1.6:8000/ws
   * 3. Sets up periodic status checks
   */
  public start(): void {
    if (typeof window === 'undefined') return;
    this.isIntentionallyClosed = false;

    // Initial check of real status endpoint
    this.checkStatus();

    // Start status polling (every 10s to continuously monitor real backend health)
    if (!this.statusPollTimer) {
      this.statusPollTimer = setInterval(() => {
        this.checkStatus();
      }, 10000);
    }

    // Connect to WebSocket stream
    this.connectWs();
  }

  public stop(): void {
    this.isIntentionallyClosed = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.statusPollTimer) {
      clearInterval(this.statusPollTimer);
      this.statusPollTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.updateState({
      wsState: 'DISCONNECTED',
      isStale: true,
    });
  }

  /**
   * On application load and periodically, call GET http://192.168.1.6:8000/api/status
   * Use actual response to determine backend/model availability.
   * Only set BACKEND ONLINE when this real request succeeds.
   */
  public async checkStatus(): Promise<FastApiStatusResponse | null> {
    try {
      const res = await fetch(STATUS_ENDPOINT, {
        method: 'GET',
        headers: { Accept: 'application/json' },
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }

      const data: FastApiStatusResponse = await res.json();
      const isOnline = data && data.backend === 'online';

      this.updateState({
        backendOnline: isOnline,
        statusInfo: data,
        error: isOnline ? null : 'Backend reported non-online status',
      });

      // Also attempt to fetch latest prediction REST snapshot if online and no prediction yet
      if (isOnline && !this.state.latestPrediction) {
        this.fetchLatestPrediction();
      }

      return data;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to reach FastAPI status endpoint';
      this.updateState({
        backendOnline: false,
        error: msg,
      });
      return null;
    }
  }

  /**
   * Fetches latest prediction via REST GET http://192.168.1.6:8000/api/prediction
   */
  public async fetchLatestPrediction(): Promise<FastApiPredictionData | null> {
    try {
      const res = await fetch(PREDICTION_ENDPOINT, {
        method: 'GET',
        headers: { Accept: 'application/json' },
      });

      if (!res.ok) return null;
      const raw = await res.json();
      const parsed = this.parseRawPrediction(raw);

      if (parsed) {
        this.handleNewPrediction(parsed);
      }
      return parsed;
    } catch {
      return null;
    }
  }

  /**
   * Connects to ws://192.168.1.6:8000/ws
   * Emits required console logs:
   * [BACKEND] Connecting
   * [BACKEND] Connected
   * [BACKEND] Message received
   * [BACKEND] Disconnected
   * [BACKEND] Reconnecting
   * [BACKEND] Error
   */
  private connectWs(): void {
    if (this.isIntentionallyClosed) return;

    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    console.log('[BACKEND] Connecting to', WS_URL);
    this.updateState({ wsState: 'CONNECTING' });

    try {
      this.ws = new WebSocket(WS_URL);

      this.ws.onopen = () => {
        // [BACKEND] Connected
        console.log('[BACKEND] Connected');
        this.reconnectAttempts = 0;
        // Do not claim connection success before onopen
        this.updateState({
          wsState: 'CONNECTED',
          error: null,
          isStale: false,
        });

        // Trigger REST sync in case WS broadcast only fires on inference events
        this.fetchLatestPrediction();
      };

      this.ws.onmessage = (event: MessageEvent) => {
        // [BACKEND] Message received
        console.log('[BACKEND] Message received:', event.data);

        try {
          const raw = JSON.parse(event.data);
          const parsed = this.parseRawPrediction(raw);
          if (parsed) {
            this.handleNewPrediction(parsed);
          }
        } catch (parseErr) {
          console.error('[BACKEND] Error parsing WebSocket message JSON:', parseErr);
        }
      };

      this.ws.onerror = (event: Event) => {
        // [BACKEND] Error
        console.error('[BACKEND] Error on WebSocket connection:', event);
        this.updateState({
          wsState: 'ERROR',
          error: 'WebSocket encountered connection error',
        });
      };

      this.ws.onclose = (event: CloseEvent) => {
        // [BACKEND] Disconnected
        console.log('[BACKEND] Disconnected (code:', event.code, 'reason:', event.reason, ')');
        this.ws = null;

        // When the backend is disconnected, do not show old prediction data as if it were current
        this.updateState({
          wsState: 'DISCONNECTED',
          isStale: true,
        });

        if (!this.isIntentionallyClosed) {
          this.scheduleReconnect();
        }
      };
    } catch (err) {
      console.error('[BACKEND] Error initializing WebSocket:', err);
      this.updateState({
        wsState: 'ERROR',
        error: err instanceof Error ? err.message : 'WebSocket initialization failed',
      });
      this.scheduleReconnect();
    }
  }

  /**
   * Reconnect with bounded exponential backoff
   */
  private scheduleReconnect(): void {
    if (this.reconnectTimer || this.isIntentionallyClosed) return;

    const delay = Math.min(
      this.minReconnectDelay * Math.pow(1.5, this.reconnectAttempts),
      this.maxReconnectDelay
    );
    this.reconnectAttempts++;

    // [BACKEND] Reconnecting
    console.log(`[BACKEND] Reconnecting (attempt ${this.reconnectAttempts}) in ${delay}ms`);

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connectWs();
    }, delay);
  }

  /**
   * Parse real WebSocket JSON messages.
   * Expected fields:
   * - status
   * - person_detected
   * - person_votes
   * - window_size
   * - confidence
   * - timestamp
   * 
   * Adapts to actual message structure (direct fields or envelope).
   * Does NOT invent additional backend fields.
   */
  public parseRawPrediction(raw: unknown): FastApiPredictionData | null {
    if (!raw || typeof raw !== 'object') return null;
    const obj = raw as Record<string, unknown>;

    // Check if envelope wrapping exists
    const payload = (obj.prediction && typeof obj.prediction === 'object'
      ? obj.prediction
      : obj.data && typeof obj.data === 'object'
      ? obj.data
      : obj) as Record<string, unknown>;

    // Map strictly real fields
    const statusVal = payload.status;
    const personDetectedVal = payload.person_detected;
    const personVotesVal = payload.person_votes;
    const windowSizeVal = payload.window_size;
    const confidenceVal = payload.confidence;
    const timestampVal = payload.timestamp;

    // Validate that at least one recognizable detection field exists
    if (
      statusVal === undefined &&
      personDetectedVal === undefined &&
      personVotesVal === undefined &&
      confidenceVal === undefined
    ) {
      return null;
    }

    const status =
      typeof statusVal === 'string'
        ? statusVal
        : personDetectedVal === true
        ? 'PERSON DETECTED'
        : personDetectedVal === false
        ? 'AREA EMPTY'
        : 'UNCERTAIN';

    const person_detected =
      typeof personDetectedVal === 'boolean'
        ? personDetectedVal
        : null;

    const person_votes =
      typeof personVotesVal === 'number' && !isNaN(personVotesVal)
        ? personVotesVal
        : null;

    const window_size =
      typeof windowSizeVal === 'number' && !isNaN(windowSizeVal)
        ? windowSizeVal
        : null;

    const confidence =
      typeof confidenceVal === 'number' && !isNaN(confidenceVal)
        ? confidenceVal
        : null;

    const timestamp =
      typeof timestampVal === 'string'
        ? timestampVal
        : typeof timestampVal === 'number'
        ? new Date(timestampVal).toISOString()
        : null;

    return {
      status,
      person_detected,
      person_votes,
      window_size,
      confidence,
      timestamp,
    };
  }

  private handleNewPrediction(prediction: FastApiPredictionData): void {
    const historyRecord: FastApiDetectionHistoryRecord = {
      id: `fastapi-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      timestamp: prediction.timestamp,
      receivedAt: Date.now(),
      status: prediction.status,
      person_votes: prediction.person_votes,
      window_size: prediction.window_size,
      confidence: prediction.confidence,
      model_type: this.state.statusInfo?.model_type ?? 'RandomForestClassifier',
    };

    // Store up to 100 genuine history records
    this.history = [historyRecord, ...this.history].slice(0, 100);

    this.updateState({
      latestPrediction: prediction,
      isStale: false,
      lastMessageTimestamp: Date.now(),
    });

    this.predictionListeners.forEach((l) => l(prediction, historyRecord));
  }
}

export const fastApiDetectionService = new FastApiDetectionService();
