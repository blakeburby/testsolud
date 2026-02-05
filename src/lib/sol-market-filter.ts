 import type { SOLMarket, KalshiMarketResponse, TimeSlot } from '@/types/sol-markets';
 
 // Matches tickers like: SOLUSDUP-26FEB05-T1645, SOLUSDDOWN-26FEB05-T1645
 const SOL_15MIN_PATTERN = /^SOLUSD(UP|DOWN)-\d{2}[A-Z]{3}\d{2}-T\d{4}$/;
 
 export function isSOL15MinMarket(ticker: string): boolean {
   return SOL_15MIN_PATTERN.test(ticker);
 }
 
 export function parseSOLTicker(ticker: string): {
   direction: 'up' | 'down';
   date: string;
   time: string;
 } | null {
   const match = ticker.match(/^SOLUSD(UP|DOWN)-(\d{2}[A-Z]{3}\d{2})-T(\d{4})$/);
   if (!match) return null;
 
   return {
     direction: match[1].toLowerCase() as 'up' | 'down',
     date: match[2],
     time: match[3],
   };
 }
 
 export function extractStrikePrice(title: string): number | null {
   // Title format: "SOL above $195.50 at 4:45 PM ET?"
   const match = title.match(/\$(\d+(?:\.\d+)?)/);
   return match ? parseFloat(match[1]) : null;
 }
 
 export function parseWindowTime(ticker: string): { start: Date; end: Date } | null {
   const parsed = parseSOLTicker(ticker);
   if (!parsed) return null;
 
   const { date, time } = parsed;
 
   // Parse date like "26FEB05" -> 2025-02-26
   const dayStr = date.slice(0, 2);
   const monthStr = date.slice(2, 5);
   const yearStr = date.slice(5, 7);
 
   const monthMap: Record<string, number> = {
     JAN: 0, FEB: 1, MAR: 2, APR: 3, MAY: 4, JUN: 5,
     JUL: 6, AUG: 7, SEP: 8, OCT: 9, NOV: 10, DEC: 11,
   };
 
   const day = parseInt(dayStr, 10);
   const month = monthMap[monthStr];
   const year = 2000 + parseInt(yearStr, 10);
 
   // Parse time like "1645" -> 16:45
   const hours = parseInt(time.slice(0, 2), 10);
   const minutes = parseInt(time.slice(2, 4), 10);
 
   // Create dates (assuming ET timezone, approximating as local for now)
   const end = new Date(year, month, day, hours, minutes);
   const start = new Date(end.getTime() - 15 * 60 * 1000);
 
   return { start, end };
 }
 
 export function filterSOL15MinMarkets(markets: KalshiMarketResponse[]): SOLMarket[] {
   return markets
     .filter(m => isSOL15MinMarket(m.market_ticker))
     .map(m => {
       const parsed = parseSOLTicker(m.market_ticker);
       if (!parsed) return null;
 
       const windowTime = parseWindowTime(m.market_ticker);
       if (!windowTime) return null;
 
       return {
         ticker: m.market_ticker,
         eventTicker: m.event_ticker,
         title: m.title,
         strikePrice: extractStrikePrice(m.title) ?? 0,
         direction: parsed.direction,
         windowStart: windowTime.start,
         windowEnd: windowTime.end,
         closeTime: new Date(m.close_time),
         status: m.status === 'open' ? 'open' : 'closed',
         yesPrice: m.last_price ? m.last_price / 100 : null,
         noPrice: m.last_price ? (100 - m.last_price) / 100 : null,
         yesBid: m.yes_bid ? m.yes_bid / 100 : null,
         yesAsk: m.yes_ask ? m.yes_ask / 100 : null,
         noBid: m.no_bid ? m.no_bid / 100 : null,
         noAsk: m.no_ask ? m.no_ask / 100 : null,
         volume: m.volume,
         volume24h: m.volume_24h,
         lastUpdated: new Date(),
       } as SOLMarket;
     })
     .filter(Boolean) as SOLMarket[];
 }
 
 export function groupMarketsIntoTimeSlots(markets: SOLMarket[]): TimeSlot[] {
   const now = new Date();
   const slotMap = new Map<string, SOLMarket[]>();
 
   markets.forEach(market => {
     const key = market.windowEnd.toISOString();
     const existing = slotMap.get(key) || [];
     existing.push(market);
     slotMap.set(key, existing);
   });
 
   return Array.from(slotMap.entries())
     .map(([, slotMarkets]) => {
       const first = slotMarkets[0];
       const isPast = first.windowEnd < now;
       const isActive = first.windowStart <= now && first.windowEnd > now;
 
       return {
         windowStart: first.windowStart,
         windowEnd: first.windowEnd,
         markets: slotMarkets,
         isActive,
         isPast,
       };
     })
     .sort((a, b) => a.windowEnd.getTime() - b.windowEnd.getTime());
 }