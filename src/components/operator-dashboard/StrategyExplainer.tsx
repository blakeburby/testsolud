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
            The bot trades <span className="text-foreground font-medium">YES contracts</span> on
            Kalshi's SOL/USD 15-minute binary markets. Each second it builds a model of where SOL
            price is likely to finish: it measures recent volatility using an exponentially-weighted
            moving average (EWMA, λ = 0.94), captures short-term momentum from the last price
            return, and adds a microstructure noise floor to prevent false certainty near expiry.
            From those inputs it runs <span className="text-foreground font-medium">100,000 Monte
            Carlo price paths</span> to produce a true-probability estimate for the current
            contract.
          </p>
          <p>
            When that estimate meaningfully disagrees with what the market is pricing — and all
            risk gates are clear — the bot places a trade to capture the mispricing.
          </p>
        </Section>

        <div className="border-t border-border/20" />

        <Section title="When the bot buys — all 5 conditions must be true simultaneously">
          <div className="space-y-2.5 pt-0.5">
            <Condition
              n={1}
              label="Model probability ≥ 90%"
              detail="The Monte Carlo simulation gives at least a 90% chance that SOL finishes on the correct side of the strike price. Below that threshold the model's confidence isn't high enough to act on."
            />
            <Condition
              n={2}
              label="Edge ≥ 5%"
              detail="Edge = model probability − market price. A 5-cent minimum gap is required between what the model believes and what the market charges. Smaller mispricings aren't worth the execution risk."
            />
            <Condition
              n={3}
              label="Time window: 1.5 – 14 minutes remaining"
              detail="Too close to expiry (under 90 seconds) and the market becomes illiquid with extreme gamma swings. Too far out (over 14 minutes) and there's too much time for the thesis to break. The sweet spot is inside that window."
            />
            <Condition
              n={4}
              label="No volatility spike"
              detail="If current EWMA volatility is more than 2× the recent historical average, the bot skips the signal entirely. Regime shifts — flash crashes, macro announcements, sudden pumps — invalidate the model's assumptions, so it sits out."
            />
            <Condition
              n={5}
              label="All risk gates clear"
              detail="Six downstream checks must pass before an order is sent. See the Risk Gates section below."
            />
          </div>
        </Section>

        <div className="border-t border-border/20" />

        <Section title="How much it bets — fractional Kelly sizing">
          <p>
            The bot sizes each position using the{' '}
            <span className="text-foreground font-medium">Kelly criterion</span>, a formula that
            maximises long-run bankroll growth by betting proportionally to your edge.
            Full Kelly fraction = <span className="font-mono text-foreground/80">edge ÷ market_price</span>.
            The bot applies <span className="text-foreground font-medium">quarter-Kelly</span> — 25%
            of the full fraction — to smooth out variance and protect against model error.
          </p>
          <p>
            For high-probability contracts the payoff is asymmetric: you might risk 90¢ to win only
            10¢. When the risk/reward ratio exceeds 5:1, an additional{' '}
            <span className="text-foreground font-medium">50% haircut</span> is applied on top. The
            resulting fraction × bankroll gives the dollar allocation, hard-capped at{' '}
            <span className="text-foreground font-medium">$1,000 per position</span>.
          </p>
        </Section>

        <div className="border-t border-border/20" />

        <Section title="What blocks a trade — risk gates">
          <p>Even when all 5 signal conditions are met, the order is blocked if any of the following apply:</p>
          <ul className="space-y-1 pt-1 pl-2">
            {[
              'Circuit breaker is active (latching — operator must manually reset)',
              'The position would exceed $1,000',
              'Already holding 5 concurrent open positions',
              'Daily realized loss has reached $500',
              'Total portfolio exposure would exceed the configured bankroll limit',
              'An open position already exists in this specific market',
            ].map((item, i) => (
              <li key={i} className="flex gap-2">
                <span className="shrink-0 text-muted-foreground/50 mt-0.5">·</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </Section>

        <div className="border-t border-border/20" />

        <Section title="Circuit breakers — automatic emergency stops">
          <p>
            Two latching stops monitor the account at all times and halt all trading the moment
            either threshold is breached. They do not reset automatically — an operator must
            review the situation and click <span className="text-foreground font-medium">Reset
            Breaker</span> above.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
            <div className="rounded border border-red-500/20 bg-red-500/5 p-2.5">
              <p className="text-foreground font-medium text-xs mb-0.5">Loss threshold</p>
              <p>Daily loss ≥ 20% of starting equity for the session.</p>
            </div>
            <div className="rounded border border-orange-500/20 bg-orange-500/5 p-2.5">
              <p className="text-foreground font-medium text-xs mb-0.5">Drawdown threshold</p>
              <p>Equity has fallen ≥ 15% from its peak value during the session.</p>
            </div>
          </div>
        </Section>

      </CardContent>
    </Card>
  );
}