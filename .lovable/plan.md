

# Fix: Make Simulation Continuously Recalculate

## Problem

The Monte Carlo simulation appears static because the `useEffect` in `QuantEngineContext` has rapidly-changing values (`currentPrice`, `priceHistory`) in its dependency array. Every WebSocket tick (multiple times per second) tears down and recreates the `setInterval`, preventing the 1-second compute cycle from ever completing. The simulation runs once on effect setup, then gets interrupted before the interval fires.

## Root Cause

```text
useEffect dependency array:
[currentPrice, priceHistory, selectedMarket, selectedSlot, simMode, bankroll]
     ^               ^
     |               |
     Changes 5-10x/sec from WebSocket
     Each change: clearInterval -> new setInterval -> never fires
```

## Solution

Move rapidly-changing values into `useRef` so they are always current without triggering effect re-runs. The `setInterval` becomes stable and fires every second reliably.

## Changes

### File: `src/contexts/QuantEngineContext.tsx`

1. Store `currentPrice`, `priceHistory`, `selectedMarket`, `selectedSlot` in `useRef` values that update on every render
2. Keep only `simMode` and `bankroll` in the `useEffect` dependency array (these change rarely, on user action)
3. The `compute()` function reads from refs instead of closure-captured values
4. Add a separate `useEffect` to sync context values into refs
5. This ensures the `setInterval` is stable and fires every 1000ms without interruption

### Technical Detail

```text
Before:
  useEffect(() => {
    const compute = () => { /* uses currentPrice from closure */ };
    compute();
    const interval = setInterval(compute, 1000);
    return () => clearInterval(interval);
  }, [currentPrice, priceHistory, ...]);  // tears down on every tick

After:
  const priceRef = useRef(currentPrice);
  priceRef.current = currentPrice;  // always fresh

  useEffect(() => {
    const compute = () => { /* reads priceRef.current */ };
    compute();
    const interval = setInterval(compute, 1000);
    return () => clearInterval(interval);
  }, [simMode, bankroll]);  // stable, only changes on user action
```

This is the standard React pattern for stable intervals with live data.

