

# Make SOL Trading Dashboard the Home Page

The trading dashboard is fully built but currently only accessible at `/sol-trading`. This plan will make it the default home page.

---

## What Will Change

### Route Update
The SOL Trading dashboard will become the home page at `/` instead of the placeholder "Welcome to Your Blank App" page.

---

## Implementation

### 1. Update App.tsx Routing
- Change the root route (`/`) to render `SOLTrading` component instead of `Index`
- Remove the separate `/sol-trading` route (no longer needed)
- Keep the Index page file for reference or remove it

### 2. Files to Modify
- **src/App.tsx** - Update the route configuration

---

## Result
When you visit the app, you'll immediately see the SOL Trading dashboard with:
- Live SOL/USD price from Binance
- Price to beat from Kalshi markets
- Countdown timer
- Price chart
- Time slot selection pills
- Trading buttons (Yes/No)
- Orderbook ladder

