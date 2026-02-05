 export interface SOLMarket {
   ticker: string;
   eventTicker: string;
   title: string;
   strikePrice: number;
   direction: 'up' | 'down';
   windowStart: Date;
   windowEnd: Date;
   closeTime: Date;
   status: 'open' | 'closed';
   yesPrice: number | null;
   noPrice: number | null;
   yesBid: number | null;
   yesAsk: number | null;
   noBid: number | null;
   noAsk: number | null;
   volume: number;
   volume24h: number;
   lastUpdated: Date;
 }
 
 export interface TimeSlot {
   windowStart: Date;
   windowEnd: Date;
   markets: SOLMarket[];
   isActive: boolean;
   isPast: boolean;
 }
 
 export interface OrderbookLevel {
   price: number;
   size: number;
   side: 'yes' | 'no';
 }
 
 export interface PriceKline {
   time: number;
   open: number;
   high: number;
   low: number;
   close: number;
   volume: number;
 }
 
 export interface SOLDashboardState {
   currentPrice: number | null;
   priceHistory: PriceKline[];
   markets: SOLMarket[];
   timeSlots: TimeSlot[];
   selectedSlot: TimeSlot | null;
   selectedDirection: 'up' | 'down';
   selectedMarket: SOLMarket | null;
   isLoading: boolean;
   error: string | null;
   lastRefresh: Date | null;
   isLive: boolean;
 }
 
 export interface KalshiMarketResponse {
   market_ticker: string;
   event_ticker: string;
   title: string;
   status: string;
   close_time: string;
   expiration_time: string;
   last_price?: number;
   yes_bid?: number;
   yes_ask?: number;
   no_bid?: number;
   no_ask?: number;
   volume: number;
   volume_24h: number;
 }