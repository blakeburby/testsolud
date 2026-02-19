/**
 * TradingBotContext — single source of truth for the operator dashboard.
 *
 * Manages:
 *  - WebSocket connection and real-time message dispatch
 *  - Periodic REST polling (status, balance, positions)
 *  - All API action functions (start, stop, cancel, halt, etc.)
 *  - Stable references so panels don't re-render on every poll
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type TradingMode = 'dry_run' | 'paper' | 'live';

export interface RiskMetrics {
  total_positions: number;
  open_orders_count: number;
  total_exposure: number;
  daily_pnl: number;
  daily_loss: number;
  unrealized_pnl: number;
  realized_pnl: number;
  max_drawdown: number;
  current_drawdown: number;
  win_rate: number;
  ev_per_trade: number;
  circuit_breaker_triggered: boolean;
  circuit_breaker_reason: string;
  exposure_per_market: Record<string, number>;
  last_updated: string;
}

export interface OrderSummary {
  active_count: number;
  completed_count: number;
  filled_count: number;
  cancelled_count: number;
  failed_count: number;
}

export interface ActiveTrade {
  trade_id: string;
  order_id?: string;
  ticker: string;
  side: 'yes' | 'no';
  quantity: number;
  price?: number;
  status: string;
  strategy_name: string;
  edge?: number;
  confidence?: number;
  submitted_at?: string;
  created_at: string;
  dry_run: boolean;
}

export interface StrategyInfo {
  name: string;
  enabled: boolean;
  signal_count: number;
  last_signal_time?: string;
  config?: Record<string, unknown>;
}

export interface StrategySignal {
  strategy_name: string;
  ticker: string;
  direction: 'yes' | 'no';
  edge: number;
  strength: 'low' | 'medium' | 'high';
  confidence: number;
  recommended_quantity: number;
  recommended_price: number;
  true_probability: number;
  market_probability: number;
  kelly_fraction: number;
  reasoning: string;
}

export interface SystemHealth {
  api_connected: boolean;
  auth_ok: boolean;
  last_successful_request: string | null;
  consecutive_errors: number;
  total_requests: number;
  circuit_breaker_active: boolean;
  circuit_breaker_reason: string;
  bot_running: boolean;
  dry_run_mode: boolean;
  open_orders: number;
  timestamp: string;
}

export interface Balance {
  balance_cents: number;
  portfolio_value_cents: number;
  balance_dollars: number;
  portfolio_value_dollars: number;
  total_value_dollars: number;
}

export interface BotStatus {
  running: boolean;
  dry_run: boolean;
  enabled_strategies: string[];
  risk_metrics: RiskMetrics;
  order_summary: OrderSummary;
  position_summary: { count: number; positions: unknown[]; total_exposure: number };
  client_health: { healthy: boolean; consecutive_errors: number };
  timestamp: string;
}

export interface TradingBotState {
  // Connection
  connected: boolean;
  wsError: string | null;

  // Bot state
  status: BotStatus | null;
  mode: TradingMode;
  health: SystemHealth | null;
  balance: Balance | null;

  // Orders & trades
  activeTrades: ActiveTrade[];
  strategies: StrategyInfo[];
  recentSignals: StrategySignal[];

  // Alert log
  alerts: Array<{ level: string; message: string; timestamp: string }>;
}

export interface TradingBotActions {
  startBot: () => Promise<void>;
  stopBot: () => Promise<void>;
  emergencyHalt: () => Promise<void>;
  cancelAllOrders: () => Promise<void>;
  cancelTrade: (tradeId: string) => Promise<void>;
  decreaseTrade: (tradeId: string, reduceBy?: number, reduceTo?: number) => Promise<void>;
  amendTrade: (tradeId: string, newPrice?: number, newQuantity?: number) => Promise<void>;
  setMode: (mode: TradingMode, bankroll?: number) => Promise<void>;
  resetCircuitBreaker: () => Promise<void>;
  enableStrategy: (name: string) => Promise<void>;
  disableStrategy: (name: string) => Promise<void>;
  updateBankroll: (bankroll: number, kellFraction?: number, maxPositionSize?: number, maxDailyLoss?: number) => Promise<void>;
  refreshBalance: () => Promise<void>;
  refreshStatus: () => Promise<void>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Context
// ─────────────────────────────────────────────────────────────────────────────

const TradingBotStateCtx = createContext<TradingBotState | null>(null);
const TradingBotActionsCtx = createContext<TradingBotActions | null>(null);

// ─────────────────────────────────────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────────────────────────────────────

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000';
const API = `${BACKEND_URL}/api`;
const WS_URL = BACKEND_URL.replace(/^https?/, BACKEND_URL.startsWith('https') ? 'wss' : 'ws') + '/ws';
const POLL_INTERVAL_MS = 5000;
const MAX_SIGNALS = 10;
const MAX_ALERTS = 50;

// ─────────────────────────────────────────────────────────────────────────────
// Provider
// ─────────────────────────────────────────────────────────────────────────────

export function TradingBotProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<TradingBotState>({
    connected: false,
    wsError: null,
    status: null,
    mode: 'dry_run',
    health: null,
    balance: null,
    activeTrades: [],
    strategies: [],
    recentSignals: [],
    alerts: [],
  });

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── REST helpers ──────────────────────────────────────────────────

  const apiGet = useCallback(async (path: string) => {
    const res = await fetch(`${API}${path}`);
    if (!res.ok) throw new Error(`GET ${path} → ${res.status}`);
    return res.json();
  }, []);

  const apiPost = useCallback(async (path: string, body?: unknown) => {
    const res = await fetch(`${API}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(err.detail || `POST ${path} → ${res.status}`);
    }
    return res.json();
  }, []);

  // ── Poll REST endpoints ───────────────────────────────────────────

  const refreshStatus = useCallback(async () => {
    try {
      const data: BotStatus = await apiGet('/status');
      setState(prev => ({
        ...prev,
        status: data,
        mode: data.dry_run ? 'dry_run' : 'live',
        activeTrades: [], // refreshed separately
      }));
    } catch (_) { /* swallow — WS is primary */ }
  }, [apiGet]);

  const refreshBalance = useCallback(async () => {
    try {
      const data: Balance = await apiGet('/balance');
      setState(prev => ({ ...prev, balance: data }));
    } catch (_) { /* swallow */ }
  }, [apiGet]);

  const refreshHealth = useCallback(async () => {
    try {
      const data: SystemHealth = await apiGet('/system/health');
      setState(prev => ({ ...prev, health: data }));
    } catch (_) { /* swallow */ }
  }, [apiGet]);

  const refreshActiveTrades = useCallback(async () => {
    try {
      const data: ActiveTrade[] = await apiGet('/trades/active');
      setState(prev => ({ ...prev, activeTrades: data }));
    } catch (_) { /* swallow */ }
  }, [apiGet]);

  const refreshStrategies = useCallback(async () => {
    try {
      const data: StrategyInfo[] = await apiGet('/strategies');
      setState(prev => ({ ...prev, strategies: data }));
    } catch (_) { /* swallow */ }
  }, [apiGet]);

  // ── WebSocket ─────────────────────────────────────────────────────

  const connectWS = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      setState(prev => ({ ...prev, connected: true, wsError: null }));
      ws.send(JSON.stringify({ type: 'get_status' }));
    };

    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data as string);
        switch (msg.type) {
          case 'status_update':
            setState(prev => ({
              ...prev,
              status: msg.data,
              mode: msg.data?.dry_run ? 'dry_run' : 'live',
            }));
            break;
          case 'trading_signal':
            setState(prev => ({
              ...prev,
              recentSignals: [msg.data as StrategySignal, ...prev.recentSignals].slice(0, MAX_SIGNALS),
            }));
            break;
          case 'trade_execution':
            // Refresh active trades on any execution
            refreshActiveTrades();
            break;
          case 'alert':
            setState(prev => ({
              ...prev,
              alerts: [
                { level: msg.data.level, message: msg.data.message, timestamp: new Date().toISOString() },
                ...prev.alerts,
              ].slice(0, MAX_ALERTS),
            }));
            break;
        }
      } catch (_) { /* malformed message */ }
    };

    ws.onerror = () => {
      setState(prev => ({ ...prev, wsError: 'WebSocket connection error' }));
    };

    ws.onclose = () => {
      setState(prev => ({ ...prev, connected: false }));
      // Reconnect after 5 s
      reconnectTimer.current = setTimeout(connectWS, 5000);
    };
  }, [refreshActiveTrades]);

  // ── Lifecycle ─────────────────────────────────────────────────────

  useEffect(() => {
    connectWS();
    refreshStatus();
    refreshBalance();
    refreshHealth();
    refreshActiveTrades();
    refreshStrategies();

    const pollTimer = setInterval(() => {
      refreshStatus();
      refreshBalance();
      refreshHealth();
      refreshActiveTrades();
    }, POLL_INTERVAL_MS);

    return () => {
      clearInterval(pollTimer);
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Actions ───────────────────────────────────────────────────────

  const actions: TradingBotActions = {
    startBot: async () => {
      await apiPost('/start');
      await refreshStatus();
    },
    stopBot: async () => {
      await apiPost('/stop');
      await refreshStatus();
    },
    emergencyHalt: async () => {
      await apiPost('/emergency/halt');
      await refreshStatus();
      await refreshActiveTrades();
    },
    cancelAllOrders: async () => {
      await apiPost('/emergency/cancel-all');
      await refreshActiveTrades();
    },
    cancelTrade: async (tradeId) => {
      await apiPost(`/trades/${tradeId}/cancel`);
      await refreshActiveTrades();
    },
    decreaseTrade: async (tradeId, reduceBy, reduceTo) => {
      await apiPost(`/trades/${tradeId}/decrease`, { reduce_by: reduceBy, reduce_to: reduceTo });
      await refreshActiveTrades();
    },
    amendTrade: async (tradeId, newPrice, newQuantity) => {
      await apiPost(`/trades/${tradeId}/amend`, { new_price: newPrice, new_quantity: newQuantity });
      await refreshActiveTrades();
    },
    setMode: async (mode, bankroll) => {
      await apiPost('/mode', {
        mode,
        confirmed_bankroll: bankroll,
        risk_acknowledged: mode === 'live',
      });
      await refreshStatus();
    },
    resetCircuitBreaker: async () => {
      await apiPost('/circuit-breaker/reset');
      await refreshStatus();
    },
    enableStrategy: async (name) => {
      await apiPost(`/strategies/${name}/enable`);
      await refreshStrategies();
    },
    disableStrategy: async (name) => {
      await apiPost(`/strategies/${name}/disable`);
      await refreshStrategies();
    },
    updateBankroll: async (bankroll, kellyFraction, maxPositionSize, maxDailyLoss) => {
      await apiPost('/bankroll', {
        bankroll,
        kelly_fraction: kellyFraction,
        max_position_size: maxPositionSize,
        max_daily_loss: maxDailyLoss,
      });
      await refreshStatus();
    },
    refreshBalance,
    refreshStatus,
  };

  return (
    <TradingBotStateCtx.Provider value={state}>
      <TradingBotActionsCtx.Provider value={actions}>
        {children}
      </TradingBotActionsCtx.Provider>
    </TradingBotStateCtx.Provider>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Hooks
// ─────────────────────────────────────────────────────────────────────────────

export function useTradingBotState(): TradingBotState {
  const ctx = useContext(TradingBotStateCtx);
  if (!ctx) throw new Error('useTradingBotState must be used inside TradingBotProvider');
  return ctx;
}

export function useTradingBotActions(): TradingBotActions {
  const ctx = useContext(TradingBotActionsCtx);
  if (!ctx) throw new Error('useTradingBotActions must be used inside TradingBotProvider');
  return ctx;
}