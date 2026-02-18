# 🚀 START HERE - Quick Setup Guide

## What You Have

A **complete high-frequency trading bot** for Kalshi's 15-minute Solana markets, integrated with your dashboard.

## 5-Minute Quick Start

### 1. Get Kalshi Credentials (5 min)

Go to https://kalshi.com/account/api
- Generate API key
- Download private key (.pem file)

### 2. Setup Backend (2 min)

```bash
cd backend
./setup.sh
```

### 3. Add Credentials (1 min)

```bash
# Copy your private key
cp ~/Downloads/kalshi_private_key.pem backend/keys/

# Edit .env
nano backend/.env
```

In `.env`, add:
```
KALSHI_API_KEY=your_key_here
```

### 4. Start Everything (1 min)

**Terminal 1** - Backend:
```bash
cd backend
source venv/bin/activate
python main.py
```

**Terminal 2** - Dashboard:
```bash
npm run dev
```

### 5. Verify (30 sec)

- Backend running: http://localhost:8000
- Dashboard: http://localhost:8080 (or wherever Vite serves it)
- See "Auto Trading Panel" on dashboard
- Status shows "Connected"

## ✅ You're Done!

Bot is now running in **DRY RUN MODE** (paper trading - no real money).

## What Now?

### Watch It Work

The bot will:
1. Discover active 15-minute SOL markets on Kalshi
2. Calculate probabilities using volatility models
3. Generate signals when it finds mispriced markets
4. Display them in the Auto-Trading Panel

### Understand the Signals

When you see a signal like:
```
Strategy: kelly_volatility
Direction: YES
Ticker: KXSOL15M-24FEB15-1430-T249.50
Edge: 8.5%
```

It means:
- The model thinks there's an 8.5% edge
- It wants to buy YES (price will exceed $249.50)
- In dry run mode, it logs this but doesn't execute

### Monitor Safety

Check these don't trigger (they shouldn't in dry run):
- Circuit breaker (20% daily loss)
- Position limits (max $1,000 per trade)
- Daily loss cap ($500)

## When To Go Live

**Don't rush!** Test for at least 1-2 weeks.

When ready:
1. Verify strategies are profitable in dry run
2. Start with **small capital** ($100-500)
3. In `backend/.env`, change:
   ```
   DRY_RUN_MODE=false
   ```
4. Restart backend
5. Monitor actively!

## Need Help?

📖 **Full Guide**: See [TRADING_BOT_GUIDE.md](./TRADING_BOT_GUIDE.md)
📋 **Details**: See [IMPLEMENTATION_SUMMARY.md](./IMPLEMENTATION_SUMMARY.md)
🔧 **Backend Docs**: See [backend/README.md](./backend/README.md)

## Troubleshooting

**Bot won't start?**
- Check you activated venv: `source venv/bin/activate`
- Check `.env` has your API key
- Check private key file exists in `backend/keys/`

**Dashboard not connecting?**
- Ensure backend is running on port 8000
- Check browser console for errors
- Verify WebSocket URL in `AutoTradingPanel.tsx`

**No signals appearing?**
- Kalshi markets only active during trading hours
- Wait 1-2 minutes for data to accumulate
- Check backend logs: `backend/logs/`

## Important Warnings

⚠️ **Trading involves risk of loss**
⚠️ **Test thoroughly before going live**
⚠️ **Start with money you can afford to lose**
⚠️ **Monitor actively when live**
⚠️ **Keep API keys secret**

---

**That's it! You're ready to test your trading bot.** 🎉

Check the Auto-Trading Panel on your dashboard to see it in action.

Happy (safe) trading! 📈
