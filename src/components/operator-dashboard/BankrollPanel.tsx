/**
 * BankrollPanel — capital allocation and Kelly sizing controls.
 */

import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { DollarSign, TrendingUp } from 'lucide-react';
import { useTradingBotState, useTradingBotActions } from '@/contexts/TradingBotContext';
import { useToast } from '@/hooks/use-toast';

const API = (import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000') + '/api';

interface BankrollData {
  bankroll: number;
  max_position_size: number;
  max_daily_loss: number;
  max_concurrent_positions: number;
  kelly_fraction: number;
  total_exposure: number;
  remaining_capacity: number;
  daily_pnl: number;
}

function fmt(n: number) {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function pct(n: number) {
  return (n * 100).toFixed(1) + '%';
}

export function BankrollPanel() {
  const { balance, status } = useTradingBotState();
  const { updateBankroll } = useTradingBotActions();
  const { toast } = useToast();

  const [data, setData] = useState<BankrollData | null>(null);
  const [bankrollInput, setBankrollInput] = useState('');
  const [kelly, setKelly] = useState(25);               // 0–100 displayed as %
  const [maxPosition, setMaxPosition] = useState('');
  const [maxDailyLoss, setMaxDailyLoss] = useState('');
  const [busy, setBusy] = useState(false);

  // Fetch current bankroll settings
  useEffect(() => {
    fetch(`${API}/bankroll`)
      .then(r => r.json())
      .then((d: BankrollData) => {
        setData(d);
        setBankrollInput(d.bankroll.toString());
        setKelly(Math.round(d.kelly_fraction * 100));
        setMaxPosition(d.max_position_size.toString());
        setMaxDailyLoss(d.max_daily_loss.toString());
      })
      .catch(() => {});
  }, []);

  // Derived sizing preview
  const bankrollNum = parseFloat(bankrollInput) || 0;
  const kellyFrac = kelly / 100;

  // Assume typical edge of 5% and p=0.90 for preview calculation
  const previewP = 0.90;
  const previewEdge = 0.05;
  const rawKelly = previewEdge / (1 - previewP);  // simplified Kelly fraction for binary
  const kellySized = bankrollNum * kellyFrac * rawKelly;
  const riskPerTrade = Math.min(kellySized, parseFloat(maxPosition) || Infinity);

  const handleSave = async () => {
    const b = parseFloat(bankrollInput);
    if (!b || b <= 0) {
      toast({ title: 'Invalid bankroll', variant: 'destructive' });
      return;
    }
    setBusy(true);
    try {
      await updateBankroll(
        b,
        kellyFrac,
        parseFloat(maxPosition) || undefined,
        parseFloat(maxDailyLoss) || undefined,
      );
      toast({ title: 'Bankroll settings saved' });
      // Refresh
      const res = await fetch(`${API}/bankroll`);
      setData(await res.json());
    } catch (err) {
      toast({ title: 'Save failed', description: String(err), variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  const exposure = data?.total_exposure ?? status?.risk_metrics?.total_exposure ?? 0;
  const remaining = data?.remaining_capacity ?? Math.max(0, bankrollNum - exposure);
  const dailyPnl = data?.daily_pnl ?? status?.risk_metrics?.daily_pnl ?? 0;
  const balanceDollars = balance?.balance_dollars ?? 0;
  const portfolioValue = balance?.portfolio_value_dollars ?? 0;

  return (
    <Card className="border border-border/60">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
          <DollarSign className="w-4 h-4" />
          Bankroll Management
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">

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
                bankrollNum > 0 && exposure / bankrollNum > 0.8
                  ? 'bg-red-500'
                  : bankrollNum > 0 && exposure / bankrollNum > 0.5
                  ? 'bg-yellow-500'
                  : 'bg-green-500'
              }`}
              style={{ width: bankrollNum > 0 ? `${Math.min(100, (exposure / bankrollNum) * 100)}%` : '0%' }}
            />
          </div>
        </div>

        {/* Inputs */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">Bankroll ($)</Label>
            <Input
              type="number"
              min="0"
              step="500"
              value={bankrollInput}
              onChange={e => setBankrollInput(e.target.value)}
              className="mt-1 h-8 text-sm"
            />
          </div>
          <div>
            <Label className="text-xs">Max Position ($)</Label>
            <Input
              type="number"
              min="0"
              step="50"
              value={maxPosition}
              onChange={e => setMaxPosition(e.target.value)}
              className="mt-1 h-8 text-sm"
            />
          </div>
          <div>
            <Label className="text-xs">Max Daily Loss ($)</Label>
            <Input
              type="number"
              min="0"
              step="50"
              value={maxDailyLoss}
              onChange={e => setMaxDailyLoss(e.target.value)}
              className="mt-1 h-8 text-sm"
            />
          </div>
          <div>
            <Label className="text-xs">Kelly Fraction: {kelly}%</Label>
            <Slider
              min={5}
              max={100}
              step={5}
              value={[kelly]}
              onValueChange={([v]) => setKelly(v)}
              className="mt-2"
            />
          </div>
        </div>

        {/* Position sizing preview */}
        <div className="rounded border border-border/40 p-3 bg-muted/20 space-y-1">
          <div className="flex items-center gap-1 text-xs font-medium text-muted-foreground mb-2">
            <TrendingUp className="w-3 h-3" />
            Position Sizing Preview (p=90%, edge=5%)
          </div>
          {[
            ['Kelly raw', pct(rawKelly)],
            ['Kelly sized', `$${fmt(kellySized)}`],
            ['Risk per trade', `$${fmt(riskPerTrade)}`],
            ['Max loss exposure', `$${fmt(riskPerTrade)}`],
          ].map(([label, value]) => (
            <div key={label} className="flex justify-between text-xs">
              <span className="text-muted-foreground">{label}</span>
              <span className="font-mono font-medium">{value}</span>
            </div>
          ))}
        </div>

        <Button onClick={handleSave} disabled={busy} className="w-full h-8 text-sm">
          {busy ? 'Saving...' : 'Save Settings'}
        </Button>
      </CardContent>
    </Card>
  );
}