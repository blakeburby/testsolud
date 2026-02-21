/**
 * BankrollPanel — read-only live capital snapshot from backend.
 */

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DollarSign } from 'lucide-react';
import { useTradingBotState } from '@/contexts/TradingBotContext';

const API = (import.meta.env.VITE_BACKEND_URL || 'https://testsolud-v1-production.up.railway.app') + '/api';

interface BankrollData {
  bankroll: number;
  max_position_size: number;
  max_daily_loss: number;
  kelly_fraction: number;
  total_exposure: number;
  remaining_capacity: number;
  daily_pnl: number;
}

function fmt(n: number) {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function BankrollPanel() {
  const { balance, status } = useTradingBotState();
  const [data, setData] = useState<BankrollData | null>(null);

  useEffect(() => {
    fetch(`${API}/bankroll`)
      .then(r => r.json())
      .then((d: BankrollData) => setData(d))
      .catch(() => {});

    const id = setInterval(() => {
      fetch(`${API}/bankroll`)
        .then(r => r.json())
        .then((d: BankrollData) => setData(d))
        .catch(() => {});
    }, 5000);
    return () => clearInterval(id);
  }, []);

  const bankroll = data?.bankroll ?? 0;
  const exposure = data?.total_exposure ?? status?.risk_metrics?.total_exposure ?? 0;
  const remaining = data?.remaining_capacity ?? Math.max(0, bankroll - exposure);
  const dailyPnl = data?.daily_pnl ?? status?.risk_metrics?.daily_pnl ?? 0;
  const balanceDollars = balance?.balance_dollars ?? 0;
  const portfolioValue = balance?.portfolio_value_dollars ?? 0;

  return (
    <Card className="border border-border/60">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
          <DollarSign className="w-4 h-4" />
          Capital Overview
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">

        {/* Live account snapshot */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'Available Cash', value: `$${fmt(balanceDollars)}`, color: 'text-foreground' },
            { label: 'Portfolio Value', value: `$${fmt(portfolioValue)}`, color: 'text-foreground' },
            { label: 'Daily P&L', value: `${dailyPnl >= 0 ? '+' : ''}$${fmt(dailyPnl)}`, color: dailyPnl >= 0 ? 'text-green-400' : 'text-red-400' },
          ].map(({ label, value, color }) => (
            <div key={label} className="p-2 rounded bg-muted/30 text-center">
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className={`text-base font-bold ${color}`}>{value}</p>
            </div>
          ))}
        </div>

        {/* Exposure bar */}
        <div>
          <div className="flex justify-between text-xs text-muted-foreground mb-1">
            <span>Exposure: ${fmt(exposure)}</span>
            <span>Remaining: ${fmt(remaining)}</span>
          </div>
          <div className="h-2 rounded-full bg-muted overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${
                bankroll > 0 && exposure / bankroll > 0.8
                  ? 'bg-red-500'
                  : bankroll > 0 && exposure / bankroll > 0.5
                  ? 'bg-yellow-500'
                  : 'bg-green-500'
              }`}
              style={{ width: bankroll > 0 ? `${Math.min(100, (exposure / bankroll) * 100)}%` : '0%' }}
            />
          </div>
        </div>

        {/* Config snapshot (read-only) */}
        {data && (
          <div className="rounded border border-border/40 p-3 bg-muted/20 space-y-1">
            <p className="text-xs font-medium text-muted-foreground mb-2">Risk Limits</p>
            {[
              ['Bankroll', `$${fmt(data.bankroll)}`],
              ['Max Position (2%)', `$${fmt(data.max_position_size)}`],
              ['Max Daily Loss (5%)', `$${fmt(data.max_daily_loss)}`],
              ['Kelly Fraction', `${(data.kelly_fraction * 100).toFixed(0)}%`],
            ].map(([label, value]) => (
              <div key={label} className="flex justify-between text-xs">
                <span className="text-muted-foreground">{label}</span>
                <span className="font-mono font-medium">{value}</span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}