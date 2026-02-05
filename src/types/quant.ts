 // Trade record for analytics
 export interface TradeRecord {
   id: string;
   price: number;
   size: number;
   timestamp: number;
   source: 'kraken' | 'coinbase' | 'binance' | 'okx';
   side: 'buy' | 'sell' | 'unknown';
 }
 
 // Technical indicators
 export interface QuantIndicators {
   vwap: number | null;
   momentum: number | null;          // Price change over lookback period
   momentumPercent: number | null;   // Momentum as percentage
   volatility: number | null;        // Rolling standard deviation
   priceVelocity: number | null;     // Rate of price change per second
   rsi: number | null;               // 14-period RSI
   highPrice: number | null;         // Session high
   lowPrice: number | null;          // Session low
   tradeCount: number;               // Number of trades in buffer
   avgTradeSize: number | null;      // Average trade size
 }
 
 // Signal types
 export type SignalType = 'breakout' | 'mean_reversion' | 'volume_spike' | 'spread_warning';
 
 export interface Signal {
   id: string;
   type: SignalType;
   message: string;
   timestamp: number;
   severity: 'info' | 'warning' | 'critical';
 }