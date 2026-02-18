import type { PriceKline } from '@/types/sol-markets';

/**
 * Fetch historical SOL/USD 1-minute candles from market window start to now.
 * Tries Binance.US first, falls back to Kraken. Returns [] on failure.
 */
export async function fetchHistoricalSOLPrice(
  startTime: Date,
  endTime: Date
): Promise<PriceKline[]> {
  try {
    return await fetchFromBinance(startTime, endTime);
  } catch {
    try {
      return await fetchFromKraken(startTime, endTime);
    } catch {
      return [];
    }
  }
}

async function fetchFromBinance(startTime: Date, endTime: Date): Promise<PriceKline[]> {
  const url = new URL('https://api.binance.us/api/v3/klines');
  url.searchParams.set('symbol', 'SOLUSD');
  url.searchParams.set('interval', '1m');
  url.searchParams.set('startTime', String(startTime.getTime()));
  url.searchParams.set('endTime', String(endTime.getTime()));
  url.searchParams.set('limit', '1000');

  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`Binance error ${res.status}`);
  const data: unknown[][] = await res.json();

  return data.map((k) => ({
    time: Number(k[0]),       // open time ms
    open: parseFloat(k[1] as string),
    high: parseFloat(k[2] as string),
    low: parseFloat(k[3] as string),
    close: parseFloat(k[4] as string),
    volume: parseFloat(k[5] as string),
  }));
}

async function fetchFromKraken(startTime: Date, endTime: Date): Promise<PriceKline[]> {
  const since = Math.floor(startTime.getTime() / 1000);
  const url = `https://api.kraken.com/0/public/OHLC?pair=SOLUSD&interval=1&since=${since}`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Kraken error ${res.status}`);
  const json = await res.json();

  if (json.error?.length) throw new Error(json.error[0]);

  const rows: unknown[][] = json.result?.SOLUSD ?? json.result?.XSOLUSD ?? [];
  const endMs = endTime.getTime();

  return rows
    .map((k) => ({
      time: Number(k[0]) * 1000,   // Kraken gives Unix seconds
      open: parseFloat(k[1] as string),
      high: parseFloat(k[2] as string),
      low: parseFloat(k[3] as string),
      close: parseFloat(k[4] as string),
      volume: parseFloat(k[6] as string),
    }))
    .filter((k) => k.time <= endMs);
}
