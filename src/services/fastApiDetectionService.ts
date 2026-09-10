/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Production service connecting directly to the real remote FastAPI backend.
 * Endpoints:
 * - Status:     http://192.168.1.6:8000/api/status
 * - Prediction: http://192.168.1.6:8000/api/prediction
 * - WebSocket:  ws://192.168.1.6:8000/ws
 * 
 * Strict Networking & Diagnostic Guarantees:
 * - Direct connection to real remote FastAPI backend (no simulated data, no fake success).
 * - Distinguishes Mixed-Content security blocks, CORS failures, HTTP status codes, and WS handshake errors.
 * - Prevents duplicate WebSocket connections and duplicate HTTP requests from React StrictMode.
 * - Bounded exponential backoff with previous WebSocket cleanup and pause upon max retries.
 * - Truth-in-data: only sets CONNECTED when actual WebSocket onopen fires.
 */

import { API_BASE_URL, WS_URL, STATUS_URL, PREDICTION_URL } from '../config/api.ts';
import {
  FastApiWsState,
  FastApiStatusResponse,
  FastApiPredictionData,
  FastApiState,
  FastApiDetectionHistoryRecord,
  FastApiDiagnostics,
  HttpErrorCategory,
  WsErrorCategory,
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
  private isStarted = false;
  private isIntentionallyClosed = false;

  // Bounded exponential backoff settings
  private reconnectAttempts = 0;
  private readonly maxReconnectAttempts = 5;
  private readonly minReconnectDelay = 3000;
  private readonly maxReconnectDelay = 15000;
  private reconnectPaused = false;

  // Request deduping and throttling
  private statusInFlightPromise: Promise<FastApiStatusResponse | null> | null = null;
  private predictionInFlightPromise: Promise<FastApiPredictionData | null> | null = null;
  private lastStatusCheckTimestamp = 0;
  private readonly minStatusIntervalMs = 2500;

  private state: FastApiState = {
    wsState: 'DISCONNECTED',
    backendOnline: false,
    statusInfo: null,
    latestPrediction: null,
    isStale: true,
    lastMessageTimestamp: null,
    error: null,
    diagnostics: this.createInitialDiagnostics(),
  };

  private stateListeners = new Set<FastApiStateListener>();
  private predictionListeners = new Set<FastApiPredictionListener>();
  private history: FastApiDetectionHistoryRecord[] = [];

  constructor() {
    // Initialized with real backend configuration
  }

  private isHttps(): boolean {
    return typeof window !== 'undefined' && window.location.protocol === 'https:';
  }

  private getCurrentOrigin(): string {
    return typeof window !== 'undefined' ? window.location.origin : 'unknown';
  }

  private getWsReadyState(): { code: number; label: string } {
    if (!this.ws) {
      return { code: -1, label: '-1 (NONE)' };
    }
    switch (this.ws.readyState) {
      case WebSocket.CONNECTING:
        return { code: 0, label: '0 (CONNECTING)' };
      case WebSocket.OPEN:
        return { code: 1, label: '1 (OPEN)' };
      case WebSocket.CLOSING:
        return { code: 2, label: '2 (CLOSING)' };
      case WebSocket.CLOSED:
        return { code: 3, label: '3 (CLOSED)' };
      default:
        return { code: this.ws.readyState, label: `${this.ws.readyState} (UNKNOWN)` };
    }
  }

  private createInitialDiagnostics(): FastApiDiagnostics {
    const isHttpsContext = this.isHttps();
    const mixedContentRisk = isHttpsContext && (STATUS_URL.startsWith('http:') || WS_URL.startsWith('ws:'));

    return {
      httpStatusUrl: STATUS_URL,
      httpPredictionUrl: PREDICTION_URL,
      wsUrl: WS_URL,
      currentOrigin: this.getCurrentOrigin(),
      isHttpsContext,
      mixedContentRisk,
      wsReadyState: -1,
      wsReadyStateLabel: '-1 (NONE)',
      httpErrorCategory: 'NONE',
      wsErrorCategory: 'NONE',
      networkErrorMessage: mixedContentRisk
        ? 'HTTPS context detected: Browsers block unencrypted HTTP/WS requests to LAN IPs (Mixed Content policy).'
        : null,
      wsErrorMessage: mixedContentRisk
        ? 'Browser blocks insecure ws:// from HTTPS origins. Run frontend locally over HTTP.'
        : null,
      reconnectAttempts: 0,
      maxReconnectAttempts: this.maxReconnectAttempts,
      reconnectPaused: false,
      lastHttpAttemptTime: null,
      lastWsAttemptTime: null,
    };
  }

  public getState(): FastApiState {
    return {
      ...this.state,
      diagnostics: {
        ...this.state.diagnostics,
        ...this.getWsReadyStateObj(),
      },
    };
  }

  private getWsReadyStateObj(): { wsReadyState: number; wsReadyStateLabel: string } {
    const rs = this.getWsReadyState();
    return {
      wsReadyState: rs.code,
      wsReadyStateLabel: rs.label,
    };
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
    this.state = {
      ...this.state,
      ...partial,
      diagnostics: {
        ...this.state.diagnostics,
        ...(partial.diagnostics || {}),
        ...this.getWsReadyStateObj(),
      },
    };
    const snapshot = this.getState();
    this.stateListeners.forEach((l) => l(snapshot));
  }

  private updateDiagnostics(partial: Partial<FastApiDiagnostics>): void {
    this.state = {
      ...this.state,
      diagnostics: {
        ...this.state.diagnostics,
        ...partial,
        ...this.getWsReadyStateObj(),
      },
    };
    const snapshot = this.getState();
    this.stateListeners.forEach((l) => l(snapshot));
  }

  /**
   * Starts the service (idempotent, safe against React StrictMode duplicate calls):
   * 1. Checks GET http://192.168.1.6:8000/api/status
   * 2. Initiates WebSocket stream to ws://192.168.1.6:8000/ws
   * 3. Sets up status health-check interval (10s)
   */
  public start(): void {
    if (typeof window === 'undefined') return;

    this.isIntentionallyClosed = false;
    if (this.isStarted) {
      // Already running; refresh status once and ensure WS is connected or connecting
      this.checkStatus();
      if (!this.ws || (this.ws.readyState !== WebSocket.OPEN && this.ws.readyState !== WebSocket.CONNECTING)) {
        this.connectWs();
      }
      return;
    }

    this.isStarted = true;

    // Trigger initial status check
    this.checkStatus();

    // Start 10s health check polling
    if (!this.statusPollTimer) {
      this.statusPollTimer = setInterval(() => {
        this.checkStatus();
      }, 10000);
    }

    // Connect to real WebSocket stream
    this.connectWs();
  }

  /**
   * Cleans up previous WebSocket instance safely, removing handlers
   * to avoid zombie callbacks or race conditions.
   */
  private cleanupWs(): void {
    if (this.ws) {
      this.ws.onopen = null;
      this.ws.onmessage = null;
      this.ws.onerror = null;
      this.ws.onclose = null;
      try {
        if (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING) {
          this.ws.close();
        }
      } catch {
        // Ignore close exceptions during teardown
      }
      this.ws = null;
    }
  }

  /**
   * Stops the service and cleans up all sockets and timers.
   */
  public stop(): void {
    this.isStarted = false;
    this.isIntentionallyClosed = true;

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.statusPollTimer) {
      clearInterval(this.statusPollTimer);
      this.statusPollTimer = null;
    }

    this.cleanupWs();

    this.updateState({
      wsState: 'DISCONNECTED',
      isStale: true,
    });
  }

  /**
   * Polls GET http://192.168.1.6:8000/api/status.
   * Fully deduplicates concurrent calls and throttles repeated rapid calls.
   * Correctly categorizes failure (Mixed Content vs. CORS/Network vs. HTTP status).
   */
  public async checkStatus(force = false): Promise<FastApiStatusResponse | null> {
    // Return in-flight promise if another check is already running
    if (this.statusInFlightPromise) {
      return this.statusInFlightPromise;
    }

    const now = Date.now();
    if (!force && this.lastStatusCheckTimestamp > 0 && now - this.lastStatusCheckTimestamp < this.minStatusIntervalMs) {
      return this.state.statusInfo;
    }

    const isHttpsContext = this.isHttps();
    const isTargetHttp = STATUS_URL.startsWith('http:');

    this.statusInFlightPromise = (async () => {
      this.lastStatusCheckTimestamp = Date.now();
      this.updateDiagnostics({ lastHttpAttemptTime: this.lastStatusCheckTimestamp });

      try {
        const res = await fetch(STATUS_URL, {
          method: 'GET',
          headers: { Accept: 'application/json' },
        });

        if (!res.ok) {
          const statusText = res.statusText || 'Unknown';
          throw new Error(`HTTP ${res.status}: ${statusText}`);
        }

        const data: FastApiStatusResponse = await res.json();
        console.log('[FASTAPI] Status request successful', data);

        const isOnline = Boolean(data && (data.backend === 'online' || data.backend === 'ONLINE'));

        this.updateState({
          backendOnline: isOnline,
          statusInfo: data,
          error: isOnline ? null : `Backend status: ${data.backend}`,
          diagnostics: {
            ...this.state.diagnostics,
            httpErrorCategory: isOnline ? 'NONE' : 'BACKEND_OFFLINE',
            networkErrorMessage: isOnline ? null : `FastAPI responded but reported: "${data.backend}"`,
          },
        });

        // Trigger REST sync of latest prediction if online and none yet received
        if (isOnline && !this.state.latestPrediction) {
          this.fetchLatestPrediction();
        }

        return data;
      } catch (err) {
        console.warn('[FASTAPI] Status request failed', err);
        let httpErrorCategory: HttpErrorCategory = 'CORS_OR_NETWORK_ERROR';
        let displayError = err instanceof Error ? err.message : 'Network request failed';

        if (isHttpsContext && isTargetHttp) {
          httpErrorCategory = 'MIXED_CONTENT_BLOCKED';
          displayError = 'Browser blocked insecure HTTP from HTTPS page (Active Mixed Content restriction). Run frontend locally over HTTP at http://localhost:5173 to reach 192.168.1.6:8000.';
        } else if (displayError.includes('HTTP ')) {
          httpErrorCategory = 'HTTP_STATUS_ERROR';
        } else {
          httpErrorCategory = 'CORS_OR_NETWORK_ERROR';
          displayError = 'Connection failed (FastAPI offline, host 192.168.1.6 unreachable, or CORS missing).';
        }

        this.updateState({
          backendOnline: false,
          error: displayError,
          diagnostics: {
            ...this.state.diagnostics,
            httpErrorCategory,
            networkErrorMessage: displayError,
          },
        });

        return null;
      } finally {
        this.statusInFlightPromise = null;
      }
    })();

    return this.statusInFlightPromise;
  }

  /**
   * Fetches latest prediction via REST GET http://192.168.1.6:8000/api/prediction
   * Deduplicates concurrent calls.
   */
  public async fetchLatestPrediction(): Promise<FastApiPredictionData | null> {
    if (this.predictionInFlightPromise) {
      return this.predictionInFlightPromise;
    }

    this.predictionInFlightPromise = (async () => {
      try {
        const res = await fetch(PREDICTION_URL, {
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
      } finally {
        this.predictionInFlightPromise = null;
      }
    })();

    return this.predictionInFlightPromise;
  }

  /**
   * Connects to ws://192.168.1.6:8000/ws
   * - Cleans up previous socket if existing.
   * - Prevents duplicate connection if already CONNECTING or OPEN.
   * - Emits truthful logs:
   *   [FASTAPI] Connecting
   *   [FASTAPI] Connected (only upon onopen)
   *   [FASTAPI] Message received
   *   [FASTAPI] Disconnected
   *   [FASTAPI] Reconnecting
   *   [FASTAPI] Error
   */
  public connectWs(isManualRetry = false): void {
    if (this.isIntentionallyClosed) return;

    if (isManualRetry) {
      this.reconnectAttempts = 0;
      this.reconnectPaused = false;
      if (this.reconnectTimer) {
        clearTimeout(this.reconnectTimer);
        this.reconnectTimer = null;
      }
    }

    // Guard against duplicate connection creation
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    // Clean up any stale or closed socket
    this.cleanupWs();

    const isHttpsContext = this.isHttps();
    const isTargetWs = WS_URL.startsWith('ws:');

    console.log('[FASTAPI] Connecting');
    this.updateState({
      wsState: 'CONNECTING',
      diagnostics: {
        ...this.state.diagnostics,
        lastWsAttemptTime: Date.now(),
        reconnectAttempts: this.reconnectAttempts,
        reconnectPaused: this.reconnectPaused,
        wsErrorCategory: 'NONE',
        wsErrorMessage: null,
      },
    });

    try {
      const socket = new WebSocket(WS_URL);
      this.ws = socket;

      socket.onopen = () => {
        // Ensure this callback belongs to the current active socket
        if (this.ws !== socket) return;

        console.log('[FASTAPI] Connected');
        this.reconnectAttempts = 0;
        this.reconnectPaused = false;

        this.updateState({
          wsState: 'CONNECTED',
          error: null,
          isStale: false,
          diagnostics: {
            ...this.state.diagnostics,
            wsErrorCategory: 'NONE',
            wsErrorMessage: null,
            reconnectAttempts: 0,
            reconnectPaused: false,
          },
        });

        // Trigger REST snapshot upon connection
        this.fetchLatestPrediction();
      };

      socket.onmessage = (event: MessageEvent) => {
        if (this.ws !== socket) return;
        console.log('[FASTAPI] Message received', event.data);

        try {
          const raw = JSON.parse(event.data);
          const parsed = this.parseRawPrediction(raw);
          if (parsed) {
            this.handleNewPrediction(parsed);
          }
        } catch (parseErr) {
          console.error('[FASTAPI] Error parsing WebSocket message JSON:', parseErr);
        }
      };

      socket.onerror = (event: Event) => {
        if (this.ws !== socket) return;
        console.error('[FASTAPI] Error', event);

        let wsErrorCategory: WsErrorCategory = 'CONNECTION_FAILED';
        let wsErrorMessage = 'WebSocket connection failed (connection refused or host unreachable).';

        if (isHttpsContext && isTargetWs) {
          wsErrorCategory = 'MIXED_CONTENT_BLOCKED';
          wsErrorMessage = 'Browser blocked insecure WebSocket (ws://) from HTTPS page (Mixed Content security policy).';
        }

        this.updateState({
          wsState: 'ERROR',
          error: wsErrorMessage,
          diagnostics: {
            ...this.state.diagnostics,
            wsErrorCategory,
            wsErrorMessage,
          },
        });
      };

      socket.onclose = (event: CloseEvent) => {
        if (this.ws !== socket) return;
        console.log('[FASTAPI] Disconnected');

        this.ws = null;

        const isMixedContent = isHttpsContext && isTargetWs;

        this.updateState({
          wsState: 'DISCONNECTED',
          isStale: true,
          diagnostics: {
            ...this.state.diagnostics,
            wsErrorCategory: isMixedContent ? 'MIXED_CONTENT_BLOCKED' : 'CLOSED_ABNORMALLY',
            wsErrorMessage: isMixedContent
              ? 'Blocked by browser Mixed-Content policy: HTTPS context cannot connect to ws://. Run locally over HTTP.'
              : `WebSocket disconnected (code: ${event.code || 1006}).`,
          },
        });

        if (!this.isIntentionallyClosed) {
          this.scheduleReconnect();
        }
      };
    } catch (err) {
      console.error('[FASTAPI] Error', err);
      const isMixedContent = isHttpsContext && isTargetWs;
      const errMsg = isMixedContent
        ? 'Insecure WebSocket rejected by browser in secure HTTPS context.'
        : err instanceof Error ? err.message : 'WebSocket initialization failed';

      this.updateState({
        wsState: 'ERROR',
        error: errMsg,
        diagnostics: {
          ...this.state.diagnostics,
          wsErrorCategory: isMixedContent ? 'MIXED_CONTENT_BLOCKED' : 'CONNECTION_FAILED',
          wsErrorMessage: errMsg,
        },
      });

      if (!this.isIntentionallyClosed) {
        this.scheduleReconnect();
      }
    }
  }

  /**
   * Schedules reconnection using bounded exponential backoff.
   * If in an HTTPS context with mixed content, or if max attempts are reached,
   * pauses automatic attempts to avoid infinite aggressive loops.
   */
  private scheduleReconnect(): void {
    if (this.reconnectTimer || this.isIntentionallyClosed) return;

    const isHttpsContext = this.isHttps();
    const isTargetWs = WS_URL.startsWith('ws:');

    // If running in HTTPS and target is ws://, browser security will NEVER allow it.
    // Pause immediately to prevent noisy infinite reconnect loops.
    if (isHttpsContext && isTargetWs) {
      this.reconnectPaused = true;
      this.updateDiagnostics({
        reconnectPaused: true,
        wsErrorMessage: 'Auto-reconnect paused: Browser Mixed-Content policy permanently blocks ws:// from HTTPS. Run frontend locally over HTTP.',
      });
      return;
    }

    // Check bounded attempts
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.reconnectPaused = true;
      this.updateDiagnostics({
        reconnectPaused: true,
        wsErrorMessage: `Auto-reconnect paused after ${this.maxReconnectAttempts} attempts. Use "Connect WS" button to retry.`,
      });
      console.log(`[FASTAPI] Reconnect attempts capped (${this.maxReconnectAttempts}/${this.maxReconnectAttempts}). Pausing auto-reconnect.`);
      return;
    }

    const delay = Math.min(
      this.minReconnectDelay * Math.pow(1.6, this.reconnectAttempts),
      this.maxReconnectDelay
    );
    this.reconnectAttempts++;

    console.log('[FASTAPI] Reconnecting');
    this.updateDiagnostics({
      reconnectAttempts: this.reconnectAttempts,
      reconnectPaused: false,
    });

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connectWs();
    }, delay);
  }

  /**
   * Parse real WebSocket JSON messages.
   * Strictly maps real backend fields without inventing synthetic values.
   */
  public parseRawPrediction(raw: unknown): FastApiPredictionData | null {
    if (!raw || typeof raw !== 'object') return null;
    const obj = raw as Record<string, unknown>;

    // Support direct or enveloped payload
    const payload = (obj.prediction && typeof obj.prediction === 'object'
      ? obj.prediction
      : obj.data && typeof obj.data === 'object'
      ? obj.data
      : obj) as Record<string, unknown>;

    const statusVal = payload.status;
    const personDetectedVal = payload.person_detected;
    const personVotesVal = payload.person_votes;
    const windowSizeVal = payload.window_size;
    const confidenceVal = payload.confidence;
    const timestampVal = payload.timestamp;

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

    // Store genuine verified records only
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
