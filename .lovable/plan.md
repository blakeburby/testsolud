

# Orderbook UI/UX Enhancement Plan

This plan outlines improvements to transform the orderbook from a static data display into an interactive, professional-grade trading tool that matches the quality expected on platforms like Kalshi, Binance, or Robinhood.

---

## Current State Analysis

The existing orderbook displays:
- Bid/ask levels with price, size, and total columns
- Basic depth bars showing relative volume
- Spread and last price in a separator row
- Trade Up/Down tabs for switching contract sides
- Loading, error, and empty states

**Pain Points Identified:**
1. No click-to-trade functionality - users must use separate buttons
2. Depth bars don't show cumulative liquidity
3. No visual feedback when prices update in real-time
4. Mid-price is buried in the spread row instead of being prominent
5. No hover states or interaction affordances
6. Missing cumulative totals for understanding market depth
7. No indication of user's position or pending orders

---

## Proposed Enhancements

### 1. Prominent Mid-Price Display
Add a visually distinct center section showing:
- Current mid-price with large typography
- Spread displayed prominently (in cents and percentage)
- Up/down arrow indicating price direction with color coding

### 2. Cumulative Depth Visualization
Replace the current per-level bars with cumulative depth bars:
- Each row shows total liquidity at that price AND all better prices
- Creates a "staircase" effect that reveals liquidity walls
- Use gradient opacity to show density (darker = more volume)

### 3. Click-to-Trade Rows
Make each orderbook row interactive:
- Hovering highlights the entire row
- Clicking a bid row pre-fills a "Buy at X" limit order
- Clicking an ask row pre-fills a "Sell at X" limit order
- Cursor changes to pointer on hover
- Tooltip shows "Click to trade at this price"

### 4. Real-Time Update Animations
Add micro-animations for price changes:
- Brief green flash when size increases
- Brief red flash when size decreases
- Smooth number transitions using CSS animations
- Pulse effect on spread when it narrows/widens

### 5. Improved Visual Hierarchy
Restructure the layout for faster comprehension:
- Larger, bolder price column with color coding
- Smaller, muted size/total columns
- Add "My Size" column placeholder for future order display
- Best bid/ask rows get subtle highlight background

### 6. Enhanced Header with Key Metrics
Expand the collapsed header to show:
- Total bid depth (sum of all bids in dollars)
- Total ask depth (sum of all asks in dollars)
- Bid/Ask imbalance ratio visualization (bar showing lean)
- Refresh timestamp with "Live" indicator

### 7. Keyboard Navigation (Accessibility)
Add keyboard controls for power users:
- Arrow keys to navigate between price levels
- Enter to select price for order entry
- Escape to deselect
- Focus ring styling for selected row

### 8. Depth Chart Mini-Visualization
Add an optional collapsed view showing:
- Small area chart of cumulative depth
- Bids stacking from center-left, asks from center-right
- Quick visual indicator of market balance

---

## Technical Implementation

### New Files
- `src/components/sol-dashboard/orderbook/OrderbookRow.tsx` - Individual row component with hover/click handling
- `src/components/sol-dashboard/orderbook/DepthBar.tsx` - Cumulative depth bar component
- `src/components/sol-dashboard/orderbook/MidPriceDisplay.tsx` - Prominent center section
- `src/components/sol-dashboard/orderbook/OrderbookHeader.tsx` - Enhanced header with metrics
- `src/hooks/useOrderbookAnimations.ts` - Hook for managing price change animations

### Modified Files
- `src/components/sol-dashboard/OrderbookLadder.tsx` - Refactor to use new sub-components
- `src/contexts/SOLMarketsContext.tsx` - Add `pendingOrderPrice` state for click-to-trade
- `src/index.css` - Add keyframe animations for price flashes
- `tailwind.config.ts` - Add new animation utilities

### State Changes
```text
+------------------------------------------+
|  SOLMarketsContext                       |
|  +-----------------+                     |
|  | pendingOrder    |  <- Click-to-trade  |
|  |   price: number |     pre-fill state  |
|  |   side: 'buy'   |                     |
|  |        | 'sell' |                     |
|  +-----------------+                     |
+------------------------------------------+
```

### CSS Animations
```text
+-- Keyframes --+
| flash-green   | -> 0.3s background pulse for size increase
| flash-red     | -> 0.3s background pulse for size decrease
| number-tick   | -> 0.15s subtle scale for changing numbers
| pulse-spread  | -> 0.5s glow effect for spread changes
+---------------+
```

---

## Component Structure

```text
OrderbookLadder
+-- OrderbookHeader (collapsed summary + metrics)
+-- TabSwitcher (Trade Up / Trade Down)
|
+-- ScrollArea (fixed height, scrollable)
|   +-- Ask Rows (reversed, highest first)
|   |   +-- OrderbookRow (per level)
|   |       +-- DepthBar (cumulative background)
|   |       +-- Price | Size | Total | My Size
|   |
|   +-- MidPriceDisplay (sticky center)
|   |   +-- Mid Price (large)
|   |   +-- Spread (cents + %)
|   |   +-- Direction Arrow
|   |
|   +-- Bid Rows (highest first)
|       +-- OrderbookRow (per level)
|           +-- DepthBar (cumulative background)
|           +-- Price | Size | Total | My Size
|
+-- DepthMiniChart (optional, toggle)
```

---

## Implementation Priority

| Priority | Enhancement | Impact | Effort |
|----------|-------------|--------|--------|
| 1 | Prominent mid-price display | High | Low |
| 2 | Click-to-trade rows | High | Medium |
| 3 | Real-time update animations | Medium | Medium |
| 4 | Cumulative depth bars | High | Medium |
| 5 | Enhanced header metrics | Medium | Low |
| 6 | Keyboard navigation | Medium | Medium |
| 7 | Depth chart mini-viz | Low | High |

---

## Summary

This enhancement transforms the orderbook from a passive data display into an active trading interface. The key improvements are:

1. **Visual clarity** - Mid-price and spread become immediately scannable
2. **Interactivity** - Click any row to start a trade at that price
3. **Market insight** - Cumulative depth reveals liquidity walls at a glance
4. **Responsiveness** - Animations draw attention to real-time changes
5. **Accessibility** - Keyboard navigation for power users

