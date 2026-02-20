/**
 * StrategyExplainer — plain-English breakdown of when and why the bot trades.
 * Read-only informational panel for the Operator Controls tab.
 */

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Info } from 'lucide-react';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <h3 className="text-xs font-semibold text-foreground uppercase tracking-wider">{title}</h3>
      <div className="text-xs text-muted-foreground leading-relaxed space-y-1.5">{children}</div>
    </div>
  );
}

function Condition({ n, label, detail }: { n: number; label: string; detail: string }) {
  return (
    <div className="flex gap-2.5">
      <span className="shrink-0 w-4 h-4 rounded-full bg-muted/40 text-foreground/60 text-[10px] font-bold flex items-center justify-center mt-0.5">{n}</span>
      <p><span className="text-foreground font-medium">{label}</span> — {detail}</p>
    </div>
  );
}

export function StrategyExplainer() {
  return (
    <Card className="border border-border/60">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
          <Info className="w-4 h-4" />
          Strategy Logic — When &amp; Why the Bot Trades
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">

        <Section title="Overview">
          <p>
            The bot trades <span className="text-foreground font-medium">both YES and NO contracts</span> on
            Kalshi's SOL/USD 15-minute binary markets. Each second it builds a model of where SOL
            price is likely to finish: it measures recent volatility using an exponentially-weighted
            moving average (EWMA, λ = 0.94), captures short-term momentum from the last price
            return, and adds a microstructure noise floor to prevent false certainty near expiry.
            From those inputs it computes a <span className="text-foreground font-medium">closed-form
            probability</span> (Black-Scholes digital option) — or optionally 100,000 Monte Carlo
            paths — for the current contract.
          </p>
          <p>
            When that estimate meaningfully disagrees with what the market is pricing — and all
            risk gates are clear — the bot places a bet on whichever side offers the larger edge.
          </p>
        </Section>

        <div className="border-t border-border/20" />

        <Section title="When the bot bets — all 5 conditions must be true simultaneously">
          <div className="space-y-2.5 pt-0.5">
            <Condition
              n={1}
              label="Model conviction ≥ 95%"
              detail="The model must give at least 95% probability that SOL finishes above the strike (YES bet) or at most 5% — meaning ≥ 95% implied NO probability (NO bet). Below that the uncertainty is too wide."
            />
            <Condition
              n={2}
              label="Edge ≥ 5%"
              detail="Edge = model probability − market price on the chosen side. A 5-cent minimum gap is required. YES edge = model_prob − YES_price; NO edge = (1 − model_prob) − NO_price. The side with the larger edge wins if both qualify."
            />
            <Condition
              n={3}
              label="Time window: 30 seconds – 10 minutes remaining"
              detail="Inside 30 seconds the market is illiquid with extreme gamma swings. Beyond 10 minutes there is too much time for the thesis to break. The sweet spot is inside that window."
            />
            <Condition
              n={4}
              label="No volatility spike"
              detail="If current EWMA volatility is more than 2× the recent historical average, the bot skips the signal entirely. Regime shifts — flash crashes, macro announcements, sudden pumps — invalidate the model's assumptions."
            />
            <Condition
              n={5}
              label="All seven risk gates clear"
              detail="Seven downstream checks must pass before an order is sent. See the Risk Gates section below."
            />
          </div>
        </Section>

        <div className="border-t border-border/20" />

        <Section title="How much it bets — 15% fractional Kelly sizing">
          <p>
            The bot sizes each position using the{' '}
            <span className="text-foreground font-medium">Kelly criterion</span>.
            Full Kelly fraction = <span className="font-mono text-foreground/80">edge ÷ market_price</span>.
            The bot applies <span className="text-foreground font-medium">15% Kelly</span> — 15% of
            the full fraction — to dampen variance and protect against model error.
          </p>
          <p>
            When the risk/reward ratio exceeds 5:1 (e.g. risking 90¢ to win 10¢), an additional{' '}
            <span className="text-foreground font-medium">50% haircut</span> is applied, bringing
            the effective rate to ~7.5% Kelly. The resulting fraction × bankroll gives the dollar
            allocation, then bounded by a{' '}
            <span className="text-foreground font-medium">hard floor of 0.5%</span> and a{' '}
            <span className="text-foreground font-medium">hard ceiling of 2%</span> of bankroll per
            position.
          </p>
        </Section>

        <div className="border-t border-border/20" />

        <Section title="What blocks a trade — seven risk gates">
          <p>Even when all 5 signal conditions are met, the order is blocked if any of the following apply:</p>
          <ul className="space-y-1 pt-1 pl-2">
            {[
              'Gate 1 — Circuit breaker is active (latching — operator must manually reset)',
              'Gate 2 — Trade value exceeds 2% of bankroll per-position ceiling',
              'Gate 3 — Already holding 5 concurrent open positions',
              'Gate 4 — Daily realized loss has reached 5% of bankroll (resets midnight UTC)',
              'Gate 5 — Rolling weekly drawdown has reached 10% of bankroll (resets Monday)',
              'Gate 6 — Total portfolio exposure would exceed the configured limit',
              'Gate 7 — An open position already exists in this specific market',
            ].map((item, i) => (
              <li key={i} className="flex gap-2">
                <span className="shrink-0 text-muted-foreground/50 mt-0.5">·</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </Section>

        <div className="border-t border-border/20" />

        <Section title="Circuit breakers — three-layer automatic emergency stops">
          <p>
            Three independent latching stops monitor the account and halt all trading the moment any
            threshold is breached. Each layer auto-resets on its own schedule — except Layer 3,
            which requires a manual operator reset.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
            <div className="rounded border border-red-500/20 bg-red-500/5 p-2.5">
              <p className="text-foreground font-medium text-xs mb-0.5">Layer 1 — Daily loss</p>
              <p>Daily loss ≥ 5% of bankroll. Auto-resets at UTC midnight.</p>
            </div>
            <div className="rounded border border-orange-500/20 bg-orange-500/5 p-2.5">
              <p className="text-foreground font-medium text-xs mb-0.5">Layer 2 — Weekly drawdown</p>
              <p>Drawdown ≥ 10% from Monday 00:00 UTC equity. Auto-resets each Monday.</p>
            </div>
            <div className="rounded border border-yellow-500/20 bg-yellow-500/5 p-2.5">
              <p className="text-foreground font-medium text-xs mb-0.5">Layer 3 — Session drawdown</p>
              <p>Equity down ≥ 15% from session peak. Requires manual operator reset.</p>
            </div>
          </div>
        </Section>

      </CardContent>
    </Card>
  );
}