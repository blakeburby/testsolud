 import type { SOLMarket, KalshiMarketResponse, TimeSlot, KalshiFullMarketResponse } from '@/types/sol-markets';
 
// Matches various SOL market tickers:
// - 15-min format: SOLUSDUP-26FEB05-T1645, SOLUSDDOWN-26FEB05-T1645
// - Kalshi format: KXSOLD26-27JAN0100, KXSOLMAXY-25T199.99
// - General SOL: SOL*, KXSOL*
 // - KXSOL15M format: KXSOL15M-26FEB042215-15 (actual API format)
const SOL_15MIN_PATTERN = /^SOLUSD(UP|DOWN)-\d{2}[A-Z]{3}\d{2}-T\d{4}$/;
 // Pattern: KXSOL15M-DDMMMYYHHMM-NN where NN is a suffix
 const KXSOL15M_PATTERN = /^KXSOL15M-\d{2}[A-Z]{3}\d{6}-\d+$/;
const SOL_GENERAL_PATTERN = /^(KX)?SOL/i;
 
 export function isSOL15MinMarket(ticker: string): boolean {
   return SOL_15MIN_PATTERN.test(ticker) || KXSOL15M_PATTERN.test(ticker);
 }
 
export function isSOLMarket(ticker: string): boolean {
  return SOL_GENERAL_PATTERN.test(ticker);
}

 export function parseSOLTicker(ticker: string): {
   direction: 'up' | 'down';
   date: string;
   time: string;
 } | null {
  // Try 15-min format first
  const match15min = ticker.match(/^SOLUSD(UP|DOWN)-(\d{2}[A-Z]{3}\d{2})-T(\d{4})$/);
  if (match15min) {
    return {
      direction: match15min[1].toLowerCase() as 'up' | 'down',
      date: match15min[2],
      time: match15min[3],
    };
  }
 
  // For general SOL markets, derive direction from title or default to 'up'
  return null;
 }
 
 // Parse KXSOL15M ticker format: KXSOL15M-05FEB26-T1645
 export function parseKXSOL15MTicker(ticker: string): {
   date: string;
   time: string;
   windowEnd: Date;
 } | null {
   // Format: KXSOL15M-26FEB042215-15
   const match = ticker.match(/^KXSOL15M-(\d{2})([A-Z]{3})(\d{2})(\d{4})-\d+$/);
   if (!match) return null;
   
   const [, day, month, year, time] = match;
   
   const monthMap: Record<string, number> = {
     JAN: 0, FEB: 1, MAR: 2, APR: 3, MAY: 4, JUN: 5,
     JUL: 6, AUG: 7, SEP: 8, OCT: 9, NOV: 10, DEC: 11,
   };
   
   const dayNum = parseInt(day, 10);
   const monthNum = monthMap[month];
   const yearNum = 2000 + parseInt(year, 10);
   const hours = parseInt(time.slice(0, 2), 10);
   const minutes = parseInt(time.slice(2, 4), 10);
   
   // The time in ticker is the start, add 15 min to get end
   const windowStart = new Date(yearNum, monthNum, dayNum, hours, minutes);
   const windowEnd = new Date(windowStart.getTime() + 15 * 60 * 1000);
   
   return {
     date: `${day}${month}${year}`,
     time,
     windowEnd,
   };
 }
 
 // Parse full Kalshi market response into SOLMarket
 export function parseKalshiFullMarket(m: KalshiFullMarketResponse): SOLMarket | null {
   // Use close_time from API for accuracy
   const closeTime = new Date(m.close_time);
   
   // Window end is the close time, start is 15 min before
   const windowEnd = closeTime;
   const windowStart = new Date(windowEnd.getTime() - 15 * 60 * 1000);
   
   // Get strike from functional_strike or extract from title
  let strikePrice = 0;
  if (m.functional_strike) {
    strikePrice = parseFloat(m.functional_strike);
  } else if (m.floor_strike) {
    strikePrice = m.floor_strike;
  } else if (m.cap_strike) {
    strikePrice = m.cap_strike;
  } else if (m.yes_sub_title) {
    // Parse from "Price to beat: $90.7959"
    const match = m.yes_sub_title.match(/\$(\d+\.?\d*)/);
    if (match) strikePrice = parseFloat(match[1]);
  } else {
    strikePrice = extractStrikePrice(m.title) ?? 0;
  }
   
   // Determine direction from strike_type or title
   let direction: 'up' | 'down' = 'up';
   if (m.strike_type) {
     direction = m.strike_type === 'greater' ? 'up' : 'down';
  } else if (m.floor_strike) {
    direction = 'up'; // floor_strike means price must go above
  } else if (m.cap_strike) {
    direction = 'down'; // cap_strike means price must go below
  } else {
     const titleLower = m.title.toLowerCase();
     if (titleLower.includes('down') || titleLower.includes('below') || titleLower.includes('less')) {
       direction = 'down';
     }
   }
   
   // Parse prices - prefer dollar format for accuracy
   const yesBid = m.yes_bid_dollars ? parseFloat(m.yes_bid_dollars) : (m.yes_bid ? m.yes_bid / 100 : null);
   const yesAsk = m.yes_ask_dollars ? parseFloat(m.yes_ask_dollars) : (m.yes_ask ? m.yes_ask / 100 : null);
   const noBid = m.no_bid_dollars ? parseFloat(m.no_bid_dollars) : (m.no_bid ? m.no_bid / 100 : null);
   const noAsk = m.no_ask_dollars ? parseFloat(m.no_ask_dollars) : (m.no_ask ? m.no_ask / 100 : null);
   const lastPrice = m.last_price_dollars ? parseFloat(m.last_price_dollars) : (m.last_price ? m.last_price / 100 : null);
   
   return {
     ticker: m.ticker,
     eventTicker: m.event_ticker,
     title: m.title,
     strikePrice,
     direction,
     windowStart,
     windowEnd,
     closeTime,
     status: m.status === 'open' || m.status === 'active' ? 'open' : 'closed',
     yesPrice: lastPrice,
     noPrice: lastPrice !== null ? 1 - lastPrice : null,
     yesBid,
     yesAsk,
     noBid,
     noAsk,
     volume: m.volume,
     volume24h: m.volume_24h,
     lastUpdated: new Date(),
   };
 }
 
 export function extractStrikePrice(title: string): number | null {
  // Title formats:
  // - "SOL above $195.50 at 4:45 PM ET?"
  // - "SOL price on Jan 1, 2027?"
  // - "Solana to reach $200?"
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
 
// Parse any SOL market into a generic format
export function parseGenericSOLMarket(m: KalshiMarketResponse): SOLMarket | null {
  const strikePrice = extractStrikePrice(m.title);
  
  // Parse close time
  const closeTime = new Date(m.close_time);
  
  // For non-15min markets, use close time as window end
  const windowEnd = closeTime;
  const windowStart = new Date(windowEnd.getTime() - 15 * 60 * 1000);
  
  // Determine direction from title
  const titleLower = m.title.toLowerCase();
  const direction: 'up' | 'down' = titleLower.includes('above') || titleLower.includes('reach') || titleLower.includes('over') ? 'up' : 'down';
  
  return {
    ticker: m.market_ticker,
    eventTicker: m.event_ticker,
    title: m.title,
    strikePrice: strikePrice ?? 0,
    direction,
    windowStart,
    windowEnd,
    closeTime,
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
  };
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
 
// Filter for any SOL market (relaxed pattern)
export function filterSOLMarkets(markets: KalshiMarketResponse[]): SOLMarket[] {
  return markets
    .filter(m => isSOLMarket(m.market_ticker))
    .map(m => {
      // Try 15-min format first
      const parsed = parseSOLTicker(m.market_ticker);
      if (parsed) {
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
      }
      
      // Fall back to generic parsing
      return parseGenericSOLMarket(m);
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