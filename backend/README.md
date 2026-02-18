# Kalshi Trading Bot Backend

High-frequency automated trading system for Kalshi's 15-minute Solana (KXSOL15M) markets.

## Features

- ✅ **Automated Trading**: Executes trades based on quantitative signals
- ✅ **Multiple Strategies**: Kelly volatility arbitrage, mean reversion
- ✅ **Risk Management**: Position limits, daily loss caps, circuit breakers
- ✅ **Real-time Dashboard Integration**: WebSocket API for live monitoring
- ✅ **Paper Trading Mode**: Test strategies without risking capital
- ✅ **Secure API Key Management**: Environment-based credential storage

## Quick Start

### 1. Install Dependencies

```bash
cd backend
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt
```

### 2. Configure Environment

```bash
cp .env.example .env
```

Edit `.env` and add your credentials:

```env
# Kalshi API Credentials
KALSHI_API_KEY=your_api_key_here
KALSHI_PRIVATE_KEY_PATH=./keys/kalshi_private_key.pem

# Start in DRY RUN mode (paper trading)
DRY_RUN_MODE=true

# Risk Management
MAX_POSITION_SIZE=1000
MAX_DAILY_LOSS=500
MAX_CONCURRENT_POSITIONS=5

# Strategies
ENABLED_STRATEGIES=kelly_volatility,mean_reversion
DEFAULT_BANKROLL=10000
```

### 3. Add Your Kalshi Private Key

Create a `keys/` directory and add your private key:

```bash
mkdir keys
# Copy your Kalshi private key to keys/kalshi_private_key.pem
```

**IMPORTANT**: The `keys/` directory is git-ignored. Never commit private keys!

### 4. Run the Trading Bot

```bash
python main.py
```

The API server will start on `http://localhost:8000`

- **REST API docs**: http://localhost:8000/docs
- **WebSocket**: ws://localhost:8000/ws

## Architecture

```
backend/
├── trading_bot.py          # Main orchestrator
├── main.py                 # FastAPI entry point
├── models/                 # Data models
│   ├── config.py           # Configuration
│   ├── trade.py            # Trade/Position models
│   ├── market.py           # Market data models
│   └── strategy.py         # Strategy signal models
├── trading_engine/         # Core trading components
│   ├── kalshi_client.py    # Kalshi API client
│   ├── order_manager.py    # Order execution
│   └── risk_manager.py     # Risk management
├── strategies/             # Trading strategies
│   ├── base.py             # Base strategy class
│   ├── kelly_volatility.py # Volatility arbitrage
│   └── mean_reversion.py   # Mean reversion
├── api/                    # FastAPI routes
│   ├── routes.py           # REST endpoints
│   └── websocket.py        # WebSocket handler
└── utils/                  # Utilities
    ├── logger.py           # Logging
    └── kalshi_auth.py      # API authentication
```

## Trading Strategies

### 1. Kelly Volatility Arbitrage

Exploits mispriced probabilities by:
- Calculating true probability using EWMA volatility + Black-Scholes
- Comparing to Kalshi market prices
- Trading when edge exceeds threshold (default 3%)
- Position sizing via Kelly Criterion

**Parameters**:
- `min_edge`: Minimum edge required (default: 0.03)
- `vol_lambda`: EWMA lambda (default: 0.94)
- `microstructure_floor`: Volatility floor (default: 0.0007)

### 2. Mean Reversion

Trades against extreme price movements:
- Calculates z-score of current price vs recent mean
- Expects reversion to mean within 15-minute window
- Higher z-score = stronger signal

**Parameters**:
- `lookback_window`: Seconds to look back (default: 300)
- `zscore_threshold_high`: High confidence (default: 2.0)
- `zscore_threshold_medium`: Medium confidence (default: 1.5)

## API Endpoints

### REST API

- `GET /api/health` - Health check
- `GET /api/status` - Bot status
- `POST /api/start` - Start bot
- `POST /api/stop` - Stop bot
- `GET /api/trades` - Trade history
- `GET /api/positions` - Current positions
- `GET /api/strategies` - Strategy info
- `POST /api/circuit-breaker/reset` - Reset circuit breaker

### WebSocket

Connect to `ws://localhost:8000/ws` for real-time updates:

```javascript
const ws = new WebSocket('ws://localhost:8000/ws');

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log(data.type, data.data);
};

// Message types:
// - status_update: Bot status
// - trading_signal: New signal generated
// - trade_execution: Trade executed
// - alert: System alerts
```

## Risk Management

### Position Limits
- **Max position size**: Per-trade capital limit
- **Max concurrent positions**: Number of open positions
- **Max daily loss**: Daily loss threshold

### Circuit Breakers

Automatically halt trading if:
- Daily loss exceeds threshold (default: 20%)
- Drawdown exceeds threshold (default: 15%)

Reset via API: `POST /api/circuit-breaker/reset`

## Dry Run Mode

**Always start in dry run mode** to test strategies without risking capital:

```env
DRY_RUN_MODE=true
```

When enabled:
- ✅ All logic executes normally
- ✅ Signals generated and logged
- ❌ No real orders submitted to Kalshi
- ✅ Safe for testing and development

To enable live trading:
```env
DRY_RUN_MODE=false
```

**⚠️ WARNING**: Live trading risks real capital. Thoroughly test in dry run mode first!

## Security Best Practices

1. **Never commit** `.env` files or private keys
2. **Use environment variables** for all secrets
3. **Restrict CORS** origins in production
4. **Enable HTTPS** for production deployment
5. **Rotate API keys** regularly
6. **Monitor logs** for suspicious activity

## Monitoring & Logs

Logs are written to:
- **Console**: Color-coded by level
- **File**: `backend/logs/trading_bot_*.log`

Log levels:
- `DEBUG`: Detailed execution info
- `INFO`: Normal operations
- `WARNING`: Warnings (e.g., rejected signals)
- `ERROR`: Errors (e.g., failed API calls)
- `CRITICAL`: Circuit breaker triggers

## Dashboard Integration

The backend provides a WebSocket API for your Lovable dashboard:

1. Connect to `ws://localhost:8000/ws`
2. Receive real-time updates on trades, signals, positions
3. Send commands (start/stop bot, enable/disable strategies)

See [Dashboard Integration Guide](../docs/dashboard-integration.md) for details.

## Development

### Running Tests

```bash
pytest
```

### Type Checking

```bash
mypy backend/
```

### Adding a New Strategy

1. Create file in `strategies/`
2. Inherit from `BaseStrategy`
3. Implement `analyze()` method
4. Add to `strategies/__init__.py`
5. Enable in `.env`

Example:
```python
class MyStrategy(BaseStrategy):
    async def analyze(self, market, current_price, price_history, orderbook):
        # Your logic here
        if condition:
            return self._create_signal(...)
        return None
```

## Troubleshooting

### "Private key not found"
- Ensure `KALSHI_PRIVATE_KEY_PATH` points to valid PEM file
- Key must be in PKCS#8 format (not PKCS#1)

### "Authentication failed"
- Verify `KALSHI_API_KEY` is correct
- Check private key matches the API key

### "No active markets"
- Kalshi 15-min markets only available during trading hours
- Check market status on Kalshi website

### Circuit breaker triggered
- Check daily P&L in logs
- Reset via: `POST /api/circuit-breaker/reset`
- Review risk limits in `.env`

## Support

- **Issues**: https://github.com/blakeburby/testsolud/issues
- **Docs**: See `docs/` directory
- **Kalshi API**: https://kalshi.com/docs

## License

MIT License - See LICENSE file
