 import { useMemo } from 'react';
 import type { TradeRecord, QuantIndicators } from '@/types/quant';
 
 const MOMENTUM_LOOKBACK_MS = 30000; // 30 seconds
 const VOLATILITY_WINDOW_MS = 60000; // 1 minute
 const RSI_PERIOD = 14;
 
 export function useQuantAnalytics(trades: TradeRecord[]): QuantIndicators {
   return useMemo(() => {
     if (trades.length === 0) {
       return {
         vwap: null,
         momentum: null,
         momentumPercent: null,
         volatility: null,
         priceVelocity: null,
         rsi: null,
         highPrice: null,
         lowPrice: null,
         tradeCount: 0,
         avgTradeSize: null,
       };
     }
 
     const now = Date.now();
     
     // Calculate VWAP (Volume-Weighted Average Price)
     let totalPriceVolume = 0;
     let totalVolume = 0;
     let highPrice = -Infinity;
     let lowPrice = Infinity;
     
     for (const trade of trades) {
       const volume = trade.size || 1;
       totalPriceVolume += trade.price * volume;
       totalVolume += volume;
       highPrice = Math.max(highPrice, trade.price);
       lowPrice = Math.min(lowPrice, trade.price);
     }
     
     const vwap = totalVolume > 0 ? totalPriceVolume / totalVolume : null;
     const avgTradeSize = trades.length > 0 ? totalVolume / trades.length : null;
 
     // Get current price and price from lookback period
     const currentPrice = trades[trades.length - 1].price;
     const lookbackTime = now - MOMENTUM_LOOKBACK_MS;
     const oldTrades = trades.filter(t => t.timestamp <= lookbackTime);
     const oldPrice = oldTrades.length > 0 ? oldTrades[oldTrades.length - 1].price : null;
     
     // Calculate momentum
     const momentum = oldPrice !== null ? currentPrice - oldPrice : null;
     const momentumPercent = oldPrice !== null && oldPrice !== 0 
       ? ((currentPrice - oldPrice) / oldPrice) * 100 
       : null;
 
     // Calculate price velocity (change per second)
     let priceVelocity: number | null = null;
     if (trades.length >= 2) {
       const firstTrade = trades[0];
       const lastTrade = trades[trades.length - 1];
       const timeDiffSeconds = (lastTrade.timestamp - firstTrade.timestamp) / 1000;
       if (timeDiffSeconds > 0) {
         priceVelocity = (lastTrade.price - firstTrade.price) / timeDiffSeconds;
       }
     }
 
     // Calculate volatility (rolling standard deviation of returns)
     const volatilityTrades = trades.filter(t => t.timestamp >= now - VOLATILITY_WINDOW_MS);
     let volatility: number | null = null;
     if (volatilityTrades.length >= 3) {
       const returns: number[] = [];
       for (let i = 1; i < volatilityTrades.length; i++) {
         const ret = (volatilityTrades[i].price - volatilityTrades[i - 1].price) / volatilityTrades[i - 1].price;
         returns.push(ret);
       }
       if (returns.length > 0) {
         const meanReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
         const variance = returns.reduce((sum, r) => sum + Math.pow(r - meanReturn, 2), 0) / returns.length;
         volatility = Math.sqrt(variance) * 100; // As percentage
       }
     }
 
     // Calculate RSI
     let rsi: number | null = null;
     if (trades.length >= RSI_PERIOD + 1) {
       const recentTrades = trades.slice(-(RSI_PERIOD + 1));
       let gains = 0;
       let losses = 0;
       
       for (let i = 1; i < recentTrades.length; i++) {
         const change = recentTrades[i].price - recentTrades[i - 1].price;
         if (change > 0) {
           gains += change;
         } else {
           losses += Math.abs(change);
         }
       }
       
       const avgGain = gains / RSI_PERIOD;
       const avgLoss = losses / RSI_PERIOD;
       
       if (avgLoss === 0) {
         rsi = 100;
       } else {
         const rs = avgGain / avgLoss;
         rsi = 100 - (100 / (1 + rs));
       }
     }
 
     return {
       vwap,
       momentum,
       momentumPercent,
       volatility,
       priceVelocity,
       rsi,
       highPrice: highPrice === -Infinity ? null : highPrice,
       lowPrice: lowPrice === Infinity ? null : lowPrice,
       tradeCount: trades.length,
       avgTradeSize,
     };
   }, [trades]);
 }