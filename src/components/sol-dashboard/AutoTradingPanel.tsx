/**
 * Auto Trading Panel Component
 *
 * Connects to the Python trading bot backend via WebSocket
 * and displays real-time status, trades, and controls.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Play, Pause, AlertCircle, Activity, TrendingUp, TrendingDown } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface BotStatus {
  running: boolean;
  dry_run: boolean;
  enabled_strategies: string[];
  risk_metrics: {
    total_positions: number;
    total_exposure: number;
    daily_pnl: number;
    daily_loss: number;
    circuit_breaker_triggered: boolean;
  };
  order_summary: {
    active_count: number;
    completed_count: number;
    filled_count: number;
    cancelled_count: number;
  };
}

interface TradingSignal {
  strategy_name: string;
  ticker: string;
  direction: 'yes' | 'no';
  edge: number;
  strength: 'low' | 'medium' | 'high';
  confidence: number;
  recommended_quantity: number;
  recommended_price: number;
  reasoning: string;
}

interface TradeExecution {
  trade_id: string;
  ticker: string;
  side: 'yes' | 'no';
  quantity: number;
  price: number;
  status: string;
  strategy_name: string;
  edge: number;
}

// Backend URLs - configured via VITE_BACKEND_URL env variable
// In development: set VITE_BACKEND_URL=http://localhost:8000 in .env.local
// In production: set VITE_BACKEND_URL to your Railway backend URL in Vercel env vars
const _backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000';
const _wsProtocol = _backendUrl.startsWith('https') ? 'wss' : 'ws';
const _wsBase = _backendUrl.replace(/^https?/, _wsProtocol);
const TRADING_BOT_WS_URL = `${_wsBase}/ws`;
const TRADING_BOT_API_URL = `${_backendUrl}/api`;

export function AutoTradingPanel() {
  const [ws, setWs] = useState<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const [status, setStatus] = useState<BotStatus | null>(null);
  const [recentSignals, setRecentSignals] = useState<TradingSignal[]>([]);
  const [recentTrades, setRecentTrades] = useState<TradeExecution[]>([]);
  const { toast } = useToast();

  // WebSocket connection
  useEffect(() => {
    const websocket = new WebSocket(TRADING_BOT_WS_URL);

    websocket.onopen = () => {
      console.log('Connected to trading bot');
      setConnected(true);
      // Request initial status
      websocket.send(JSON.stringify({ type: 'get_status' }));
    };

    websocket.onmessage = (event) => {
      const message = JSON.parse(event.data);

      switch (message.type) {
        case 'status_update':
          setStatus(message.data);
          break;

        case 'trading_signal':
          setRecentSignals((prev) => [message.data, ...prev].slice(0, 5));
          toast({
            title: '📊 New Trading Signal',
            description: `${message.data.strategy_name}: ${message.data.direction.toUpperCase()} on ${message.data.ticker}`,
          });
          break;

        case 'trade_execution':
          setRecentTrades((prev) => [message.data, ...prev].slice(0, 10));
          toast({
            title: '✅ Trade Executed',
            description: `${message.data.side.toUpperCase()} ${message.data.quantity} @ $${message.data.price}`,
          });
          break;

        case 'alert':
          const { level, message: alertMsg } = message.data;
          toast({
            title: level === 'critical' ? '🚨 Critical Alert' : 'ℹ️ Alert',
            description: alertMsg,
            variant: level === 'error' || level === 'critical' ? 'destructive' : 'default',
          });
          break;

        default:
          console.log('Unknown message type:', message.type);
      }
    };

    websocket.onerror = (error) => {
      console.error('WebSocket error:', error);
      setConnected(false);
    };

    websocket.onclose = () => {
      console.log('Disconnected from trading bot');
      setConnected(false);
    };

    setWs(websocket);

    return () => {
      websocket.close();
    };
  }, []);

  const sendCommand = useCallback((type: string) => {
    if (ws && connected) {
      ws.send(JSON.stringify({ type }));
    }
  }, [ws, connected]);

  const startBot = () => sendCommand('start_bot');
  const stopBot = () => sendCommand('stop_bot');

  return (
    <div className="space-y-4">
      {/* Header */}
      <Card className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Activity className={`w-6 h-6 ${connected ? 'text-green-500' : 'text-red-500'}`} />
            <div>
              <h3 className="text-lg font-semibold">Auto Trading Bot</h3>
              <p className="text-sm text-muted-foreground">
                {connected ? 'Connected' : 'Disconnected'}
                {status?.dry_run && ' • DRY RUN MODE'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {status?.running ? (
              <Button onClick={stopBot} variant="outline" size="sm">
                <Pause className="w-4 h-4 mr-2" />
                Stop
              </Button>
            ) : (
              <Button onClick={startBot} size="sm">
                <Play className="w-4 h-4 mr-2" />
                Start
              </Button>
            )}

            <Badge variant={status?.running ? 'default' : 'secondary'}>
              {status?.running ? 'Running' : 'Stopped'}
            </Badge>
          </div>
        </div>
      </Card>

      {/* Risk Metrics */}
      {status && (
        <Card className="p-4">
          <h4 className="font-semibold mb-3">Risk Metrics</h4>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-sm text-muted-foreground">Positions</p>
              <p className="text-2xl font-bold">{status.risk_metrics.total_positions}</p>
            </div>

            <div>
              <p className="text-sm text-muted-foreground">Exposure</p>
              <p className="text-2xl font-bold">${status.risk_metrics.total_exposure.toFixed(0)}</p>
            </div>

            <div>
              <p className="text-sm text-muted-foreground">Daily P&L</p>
              <p className={`text-2xl font-bold ${status.risk_metrics.daily_pnl >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                ${status.risk_metrics.daily_pnl >= 0 ? '+' : ''}{status.risk_metrics.daily_pnl.toFixed(2)}
              </p>
            </div>

            <div>
              <p className="text-sm text-muted-foreground">Status</p>
              {status.risk_metrics.circuit_breaker_triggered ? (
                <Badge variant="destructive" className="mt-1">
                  <AlertCircle className="w-3 h-3 mr-1" />
                  Circuit Breaker
                </Badge>
              ) : (
                <Badge variant="default" className="mt-1">Active</Badge>
              )}
            </div>
          </div>
        </Card>
      )}

      {/* Order Summary */}
      {status?.order_summary && (
        <Card className="p-4">
          <h4 className="font-semibold mb-3">Order Summary</h4>
          <div className="grid grid-cols-4 gap-4 text-center">
            <div>
              <p className="text-sm text-muted-foreground">Active</p>
              <p className="text-xl font-bold">{status.order_summary.active_count ?? 0}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Filled</p>
              <p className="text-xl font-bold text-green-500">{status.order_summary.filled_count ?? 0}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Cancelled</p>
              <p className="text-xl font-bold text-gray-500">{status.order_summary.cancelled_count ?? 0}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Total</p>
              <p className="text-xl font-bold">{status.order_summary.completed_count ?? 0}</p>
            </div>
          </div>
        </Card>
      )}

      {/* Recent Signals */}
      {recentSignals.length > 0 && (
        <Card className="p-4">
          <h4 className="font-semibold mb-3">Recent Signals</h4>
          <div className="space-y-2">
            {recentSignals.map((signal, idx) => (
              <div key={idx} className="flex items-center justify-between p-2 bg-secondary/50 rounded">
                <div className="flex items-center gap-2">
                  {signal.direction === 'yes' ? (
                    <TrendingUp className="w-4 h-4 text-green-500" />
                  ) : (
                    <TrendingDown className="w-4 h-4 text-red-500" />
                  )}
                  <div>
                    <p className="text-sm font-medium">{signal.ticker}</p>
                    <p className="text-xs text-muted-foreground">{signal.strategy_name}</p>
                  </div>
                </div>

                <div className="text-right">
                  <Badge variant={signal.strength === 'high' ? 'default' : 'secondary'}>
                    {signal.strength} • {(signal.edge * 100).toFixed(1)}% edge
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Enabled Strategies */}
      {status && status.enabled_strategies.length > 0 && (
        <Card className="p-4">
          <h4 className="font-semibold mb-3">Active Strategies</h4>
          <div className="flex flex-wrap gap-2">
            {status.enabled_strategies.map((strategy) => (
              <Badge key={strategy} variant="outline">
                {strategy}
              </Badge>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
