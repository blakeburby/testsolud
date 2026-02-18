# Kalshi Auto-Trading Bot - Complete Guide

## Overview

This is a **high-frequency automated trading system** for Kalshi's 15-minute Solana (KXSOL15M) markets. It combines:
- Your existing **Lovable dashboard** (React/TypeScript frontend)
- New **Python trading backend** with real-time strategies
- **Real-time integration** via WebSocket API

## Architecture

```
┌─────────────────────────────────┐
│   Lovable Dashboard (React)     │
│   - Market visualization        │
│   - Auto-trading panel          │
│   - Manual trading controls     │
└─────────────┬───────────────────┘
              │ WebSocket
              ↓
┌─────────────────────────────────┐
│   Trading Bot API (FastAPI)     │
│   - REST endpoints              │
│   - WebSocket server            │
│   - Real-time status updates    │
└─────────────┬───────────────────┘
              │
              ↓
┌─────────────────────────────────┐
│   Trading Engine (Python)       │
│   - Strategy execution          │
│   - Risk management             │
│   - Order management            │
└─────────────┬───────────────────┘
              │
              ↓
┌─────────────────────────────────┐
│   Kalshi API                    │
│   - Market data                 │
│   - Order execution             │
│   - Position tracking           │
└─────────────────────────────────┘
```

## 🚀 Quick Start (Step-by-Step)

### Step 1: Get Kalshi API Credentials

1. Go to [Kalshi.com](https://kalshi.com)
2. Create an account (if you don't have one)
3. Navigate to **Account → API**
4. Generate an API key and download your private key

**IMPORTANT**: Keep your private key safe! Never commit it to git.

### Step 2: Setup Backend

```bash
# Navigate to backend directory
cd backend

# Run setup script
./setup.sh

# Or manually:
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

### Step 3: Configure Environment

```bash
# Copy environment template
cp .env.example .env

# Edit .env
nano .env  # or your favorite editor
```

**Critical settings in `.env`**:

```env
# Your Kalshi credentials
KALSHI_API_KEY=your_key_here
KALSHI_PRIVATE_KEY_PATH=./keys/kalshi_private_key.pem

# ALWAYS start with dry run!
DRY_RUN_MODE=true

# Risk limits (adjust based on your capital)
MAX_POSITION_SIZE=1000
MAX_DAILY_LOSS=500
MAX_CONCURRENT_POSITIONS=5

# Strategies to enable
ENABLED_STRATEGIES=kelly_volatility,mean_reversion
DEFAULT_BANKROLL=10000
```

### Step 4: Add Private Key

```bash
# Create keys directory
mkdir -p keys

# Copy your Kalshi private key
cp ~/Downloads/kalshi_private_key.pem keys/

# Ensure correct permissions
chmod 600 keys/kalshi_private_key.pem
```

### Step 5: Test Backend

```bash
# Make sure virtual environment is activated
source venv/bin/activate

# Start the trading bot API
python main.py
```

You should see:
```
INFO | Trading bot API ready
INFO | Trading bot initialized with 2 strategies
INFO | Uvicorn running on http://0.0.0.0:8000
```

**Test the API**:
- Open http://localhost:8000 in your browser
- Visit http://localhost:8000/docs for interactive API docs
- Check http://localhost:8000/api/health

### Step 6: Test Dashboard Integration

```bash
# In a new terminal, navigate to project root
cd ..

# Install frontend dependencies (if not already done)
npm install

# Start the dashboard
npm run dev
```

Visit http://localhost:8080 (or whatever port Vite uses)

You should now see the **Auto Trading Panel** on your dashboard!

## 📊 How It Works

### Trading Strategies

#### 1. Kelly Volatility Arbitrage

**What it does**:
- Calculates "true" probability using EWMA volatility + Black-Scholes model
- Compares to Kalshi market prices
- Trades when there's a mispricing (edge > 3%)

**When it trades**:
- Edge exceeds minimum threshold (default: 3%)
- Time remaining in 15-min window: 1-14 minutes
- Sufficient price history for volatility calculation

**Example**:
- Current SOL price: $249.50
- Strike: $250.00
- Time left: 10 minutes
- Model says: 65% chance of exceeding strike
- Kalshi price: 55¢ (55% implied probability)
- **Edge: 10%** → SIGNAL TO BUY YES

#### 2. Mean Reversion

**What it does**:
- Monitors short-term price movements
- Trades against extreme deviations from mean
- Expects reversion within 15-minute window

**When it trades**:
- Z-score > 1.0 (price deviates significantly)
- Higher z-score = stronger signal
- Trades opposite direction of deviation

**Example**:
- Recent mean price: $250
- Current price: $252 (z-score = +2.5)
- **Price is HIGH** → expect reversion DOWN
- If strike is $251 → **SIGNAL TO BUY NO**

### Risk Management

The bot has multiple safety layers:

1. **Position Limits**
   - Max position size: $1,000 per trade
   - Max concurrent positions: 5
   - Max total exposure: $5,000

2. **Daily Loss Limits**
   - Max daily loss: $500
   - Circuit breaker at 20% loss
   - Auto-stops trading if exceeded

3. **Signal Filtering**
   - Minimum edge: 3% (after fees & uncertainty)
   - Minimum confidence: 50%
   - Only trades in active 15-min window

4. **Circuit Breakers**
   - Triggers on:
     - Daily loss > 20%
     - Drawdown > 15%
   - Halts all trading
   - Requires manual reset

### Order Execution

1. **Signal Generation**: Strategy analyzes market and generates signal
2. **Risk Check**: Risk manager validates against limits
3. **Order Placement**: Order manager submits to Kalshi
4. **Monitoring**: Tracks order status until filled/cancelled
5. **Position Tracking**: Updates P&L and risk metrics

## 💻 Using the Dashboard

### Auto-Trading Panel

The new panel shows:

- **Bot Status**: Running/Stopped, Connected/Disconnected
- **Risk Metrics**: Positions, Exposure, Daily P&L
- **Order Summary**: Active, Filled, Cancelled
- **Recent Signals**: Latest trading signals from strategies
- **Active Strategies**: Which strategies are enabled

### Controls

- **Start/Stop Button**: Control bot execution
- **Strategy Toggles**: Enable/disable individual strategies
- **Circuit Breaker Reset**: Reset after triggered

### WebSocket Messages

The dashboard receives real-time updates:

```typescript
// Status updates (every few seconds)
{
  type: 'status_update',
  data: {
    running: true,
    risk_metrics: { ... },
    positions: [ ... ]
  }
}

// New trading signal
{
  type: 'trading_signal',
  data: {
    strategy_name: 'kelly_volatility',
    ticker: 'KXSOL15M-...',
    direction: 'yes',
    edge: 0.08
  }
}

// Trade execution
{
  type: 'trade_execution',
  data: {
    trade_id: '...',
    side: 'yes',
    quantity: 10,
    price: 0.55
  }
}
```

## 🛡️ Safety Features

### Dry Run Mode (Paper Trading)

**ALWAYS start here!**

When `DRY_RUN_MODE=true`:
- ✅ All strategies run normally
- ✅ Signals generated and logged
- ✅ Risk checks performed
- ❌ No real orders submitted to Kalshi
- ✅ Safe for testing

**To enable live trading**:
1. Test thoroughly in dry run mode for at least 1 week
2. Verify signals are profitable
3. Start with small bankroll ($100-500)
4. Set `DRY_RUN_MODE=false`

### Monitoring

**Logs**: Backend writes detailed logs to `backend/logs/`

**Watch for**:
- ✅ Signals being generated
- ✅ Trades being executed
- ⚠️ Risk warnings
- 🚨 Circuit breaker triggers

**Example log output**:
```
INFO | 📊 Signal from kelly_volatility: YES on KXSOL15M-... (edge: 0.085)
INFO | ✅ Trade executed: trade_abc123
INFO | 🚨 CIRCUIT BREAKER TRIGGERED: Daily loss 20.5% exceeds threshold
```

## 🔧 Customization

### Adjust Strategy Parameters

Edit strategies in backend code or add to `.env`:

```python
# In strategies/kelly_volatility.py
self.min_edge = params.get("min_edge", 0.03)  # 3% minimum edge
self.vol_lambda = params.get("vol_lambda", 0.94)  # EWMA smoothing
```

### Add New Strategy

1. Create `backend/strategies/my_strategy.py`
2. Inherit from `BaseStrategy`
3. Implement `analyze()` method
4. Add to `strategies/__init__.py`
5. Enable in `.env`: `ENABLED_STRATEGIES=kelly_volatility,my_strategy`

### Adjust Risk Limits

In `.env`:
```env
MAX_POSITION_SIZE=500      # Lower for conservative
MAX_DAILY_LOSS=200         # Lower for safety
MAX_CONCURRENT_POSITIONS=3 # Fewer positions
```

## 📈 Performance Tracking

### View Trade History

**Via API**:
```bash
curl http://localhost:8000/api/trades?limit=20
```

**Via Dashboard**:
Recent trades appear in the Auto-Trading Panel

### Metrics

Monitor:
- **Win Rate**: % of profitable trades
- **Average Edge**: Average edge per trade
- **Daily P&L**: Daily profit/loss
- **Sharpe Ratio**: Risk-adjusted returns

### Backtesting

TODO: Add backtesting framework to test strategies on historical data

## ⚠️ Important Warnings

### Financial Risks

- **Trading involves risk of loss**
- **Start with small capital** you can afford to lose
- **Thoroughly test in dry run mode** first
- **Monitor actively** when live
- **Set conservative limits** initially

### Technical Risks

- **API failures**: Kalshi API may be slow/unavailable
- **WebSocket disconnects**: Monitor connection status
- **System crashes**: Bot may miss opportunities
- **Bugs**: Code may have errors - report issues!

### Security

- ⚠️ **NEVER commit API keys** to git
- ⚠️ **NEVER share your private key**
- ⚠️ **Use strong passwords** for Kalshi account
- ⚠️ **Enable 2FA** on Kalshi
- ⚠️ **Restrict CORS** in production

## 🐛 Troubleshooting

### Bot won't start

**Check**:
1. Virtual environment activated: `source venv/bin/activate`
2. Dependencies installed: `pip install -r requirements.txt`
3. `.env` file exists with correct values
4. Private key file exists and readable

### "Authentication failed"

**Fix**:
- Verify `KALSHI_API_KEY` in `.env`
- Check private key path is correct
- Ensure private key is in PKCS#8 format (not PKCS#1)
- Convert if needed: `openssl pkcs8 -topk8 -in old.pem -out new.pem -nocrypt`

### Dashboard not connecting

**Fix**:
1. Ensure backend is running: `python main.py`
2. Check WebSocket URL: `ws://localhost:8000/ws`
3. Check browser console for errors
4. Verify CORS settings in `backend/main.py`

### No signals generated

**Check**:
- Kalshi markets are active (trading hours)
- Strategies are enabled in `.env`
- Sufficient price history (>10 samples)
- Edge threshold not too high

### Circuit breaker triggered

**Fix**:
1. Review trades in logs
2. Analyze what went wrong
3. Adjust risk limits or strategy parameters
4. Reset via API: `POST /api/circuit-breaker/reset`

## 📚 Next Steps

1. ✅ **Test in dry run mode** for at least 1-2 weeks
2. ✅ **Monitor signal quality** - are they profitable?
3. ✅ **Backtest strategies** on historical data (coming soon)
4. ✅ **Start with small bankroll** when going live
5. ✅ **Monitor actively** for first few days
6. ✅ **Gradually increase** capital as confidence builds

## 🤝 Support

- **GitHub Issues**: [Report bugs](https://github.com/blakeburby/testsolud/issues)
- **Kalshi API Docs**: https://kalshi.com/docs
- **Backend README**: See `backend/README.md`

## ⚖️ Disclaimer

This software is provided for educational and research purposes. Trading involves substantial risk of loss. The authors are not responsible for any financial losses incurred through use of this software. Always conduct thorough testing and never trade with money you cannot afford to lose.

---

**Good luck and trade safely!** 🚀
