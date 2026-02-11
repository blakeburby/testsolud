import { useState } from 'react';
import { ChevronDown, ChevronRight, BookOpen } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Section {
  title: string;
  content: string;
}

const SECTIONS: Section[] = [
  {
    title: '1. Core Framework',
    content: `This strategy models Solana price as Geometric Brownian Motion (GBM):

  dS = μS dt + σS dW

where S is the spot price, μ is the drift (momentum-adjusted), σ is volatility, and dW is a Wiener process.

Probability of finishing above the strike K is derived via Monte Carlo simulation of 100,000 terminal price paths, or equivalently via the Digital Black-Scholes closed-form:

  d₂ = [ln(S₀/K) + (μ − ½σ²)T] / (σ√T)
  P(up) ≈ N(d₂)

The model continuously recomputes every second using live exchange data.`,
  },
  {
    title: '2. Time Decay Physics',
    content: `Variance scales linearly with time:

  Var ∝ σ² × T

Standard deviation scales with √T:

  σ_effective = σ × √T

As T → 0, the distribution tightens and probabilities harden toward 0 or 1. This creates the "last-minute edge" phenomenon — late-stage mispricings occur because market makers cannot update quotes fast enough as uncertainty collapses.

Time is converted for crypto's 24/7 schedule:

  T = minutes_remaining / (60 × 24 × 365)`,
  },
  {
    title: '3. Volatility Clustering',
    content: `Crypto markets exhibit strong volatility clustering — large moves beget large moves. The EWMA (Exponentially Weighted Moving Average) model captures this:

  σ²_t = λσ²_{t-1} + (1 − λ)r²_t

with λ = 0.94 (RiskMetrics standard). This gives ~94% weight to prior variance and ~6% to the latest observation, allowing rapid adaptation to regime changes.

Annualization uses crypto's continuous trading:

  σ_annual = σ_1min × √525,600

Regime classification:
  • Low: < 40% annualized
  • Medium: 40–80% annualized  
  • High: > 80% annualized`,
  },
  {
    title: '4. Momentum Drift',
    content: `Short-term continuation bias is incorporated when recent moves exceed a threshold:

  If |r_last| > 0.15%:  μ_adj = 0.5 × r_last
  Otherwise:              μ_adj = 0

This captures the empirical observation that crypto prices exhibit short-horizon momentum — a large move in the last minute is slightly more likely to continue than reverse.

The β = 0.5 scaling ensures drift remains conservative and does not dominate the stochastic component.`,
  },
  {
    title: '5. Microstructure Floor',
    content: `Real markets cannot have variance → 0, even as time approaches zero. Bid-ask spreads, order book friction, and execution latency create a noise floor:

  Var_total = σ² × T + η²

where η = 0.0005–0.001 represents the irreducible microstructure noise.

This prevents the model from becoming overconfident in the final seconds of a contract, where the closed-form solution would otherwise push probabilities to near-certainty.`,
  },
  {
    title: '6. Kelly Optimization',
    content: `Position sizing uses the Kelly Criterion, which maximizes long-run geometric growth:

  f* = (b × p − q) / b

where b is the payout ratio, p is the true probability, and q = 1 − p.

For binary Kalshi markets with ~1:1 payout, this simplifies to:

  f* = 2p − 1  (when p > 0.5 on the chosen side)

Safety measures:
  • Quarter Kelly cap (f*/4) reduces variance by 16× vs full Kelly
  • Fee buffer: minimum 2% edge required to overcome transaction costs
  • Uncertainty buffer: additional 3% margin for model error
  • Maximum allocation: 25% of bankroll per trade`,
  },
  {
    title: '7. Risk Considerations',
    content: `Key risks this model does NOT fully account for:

  • Volatility misestimation: EWMA is backward-looking and may lag sudden regime shifts
  • Black swan events: GBM assumes log-normal returns; crypto has fat tails
  • Liquidity gaps: Kalshi orderbook may be thin, causing slippage
  • Model overconfidence: Monte Carlo assumes known parameters; true uncertainty is higher
  • Exchange execution latency: Time between signal and fill can erode edge
  • Correlation breaks: Multi-source price feeds may temporarily diverge
  • Regulatory risk: Market structure changes can invalidate assumptions

The quarter Kelly sizing and trade filters are designed to provide a margin of safety against these risks.`,
  },
];

export function StrategySummary() {
  const [isOpen, setIsOpen] = useState(false);
  const [openSections, setOpenSections] = useState<Set<number>>(new Set());

  const toggleSection = (idx: number) => {
    setOpenSections(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between p-5 hover:bg-muted/30 transition-colors"
      >
        <div className="flex items-center gap-2">
          <BookOpen className="h-4 w-4 text-[hsl(var(--gold))]" />
          <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider">Strategy Summary</h3>
        </div>
        <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", isOpen && "rotate-180")} />
      </button>

      {isOpen && (
        <div className="border-t border-border">
          {SECTIONS.map((section, idx) => (
            <div key={idx} className="border-b border-border last:border-b-0">
              <button
                onClick={() => toggleSection(idx)}
                className="w-full flex items-center gap-2 px-5 py-3 hover:bg-muted/20 transition-colors"
              >
                {openSections.has(idx) ? (
                  <ChevronDown className="h-3.5 w-3.5 text-[hsl(var(--gold))]" />
                ) : (
                  <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                )}
                <span className="text-sm font-medium text-foreground">{section.title}</span>
              </button>
              {openSections.has(idx) && (
                <div className="px-5 pb-4 pl-10">
                  <pre className="text-xs text-muted-foreground whitespace-pre-wrap font-mono leading-relaxed">
                    {section.content}
                  </pre>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
