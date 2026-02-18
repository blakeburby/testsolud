import type { PriceKline } from '@/types/sol-markets';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000';

/**
 * Fetch historical SOL/USD 1-minute candles from market window start to now.
 * Tries backend proxy first (no CORS), then Binance global, then Kraken, then Coinbase.
 * Returns [] on total failure so real-time WebSocket still works.
 */
export async function fetchHistoricalSOLPrice(
  startTime: Date,
  endTime: Date
): Promise<PriceKline[]> {
  try {
    return await fetchFromBackend(startTime, endTime);
  } catch {
    try {
      return await fetchFromBinance(startTime, endTime);
    } catch {
      try {
        return await fetchFromKraken(startTime, endTime);
      } catch {
        try {
          return await fetchFromCoinbase(startTime, endTime);
        } catch {
          return [];
        }
      }
    }
  }
}

// Primary: backend proxy — server-side call, no CORS restrictions
async function fetchFromBackend(startTime: Date, endTime: Date): Promise<PriceKline[]> {
  const url = new URL(`${BACKEND_URL}/api/price-history`);
  url.searchParams.set('startTime', String(startTime.getTime()));
  url.searchParams.set('endTime', String(endTime.getTime()));

  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`Backend price-history error ${res.status}`);
  const data: unknown[][] = await res.json();

  return data.map((k) => ({
    time: Number(k[0]),
    open: parseFloat(k[1] as string),
    high: parseFloat(k[2] as string),
    low: parseFloat(k[3] as string),
    close: parseFloat(k[4] as string),
    volume: parseFloat(k[5] as string),
  }));
}

// Fallback 1: Binance global (api.binance.com) — sets Access-Control-Allow-Origin: *
async function fetchFromBinance(startTime: Date, endTime: Date): Promise<PriceKline[]> {
  const url = new URL('https://api.binance.com/api/v3/klines');
  url.searchParams.set('symbol', 'SOLUSDT');
  url.searchParams.set('interval', '1m');
  url.searchParams.set('startTime', String(startTime.getTime()));
  url.searchParams.set('endTime', String(endTime.getTime()));
  url.searchParams.set('limit', '1000');

  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`Binance error ${res.status}`);
  const data: unknown[][] = await res.json();

  return data.map((k) => ({
    time: Number(k[0]),
    open: parseFloat(k[1] as string),
    high: parseFloat(k[2] as string),
    low: parseFloat(k[3] as string),
    close: parseFloat(k[4] as string),
    volume: parseFloat(k[5] as string),
  }));
}

// Fallback 2: Kraken public REST
async function fetchFromKraken(startTime: Date, endTime: Date): Promise<PriceKline[]> {
  const since = Math.floor(startTime.getTime() / 1000);
  const url = `https://api.kraken.com/0/public/OHLC?pair=SOLUSD&interval=1&since=${since}`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Kraken error ${res.status}`);
  const json = await res.json();

  if (json.error?.length) throw new Error(json.error[0]);

  const rows: unknown[][] =
    json.result?.SOLUSD ??
    json.result?.XSOLUSD ??
    json.result?.SOLUSDT ??
    (Object.values(json.result ?? {}).find((v) => Array.isArray(v)) as unknown[][] | undefined) ??
    [];

  const endMs = endTime.getTime();

  return rows
    .map((k) => ({
      time: Number(k[0]) * 1000,
      open: parseFloat(k[1] as string),
      high: parseFloat(k[2] as string),
      low: parseFloat(k[3] as string),
      close: parseFloat(k[4] as string),
      volume: parseFloat(k[6] as string),
    }))
    .filter((k) => k.time <= endMs);
}

// Fallback 3: Coinbase Exchange public REST
async function fetchFromCoinbase(startTime: Date, endTime: Date): Promise<PriceKline[]> {
  const url = new URL('https://api.exchange.coinbase.com/products/SOL-USD/candles');
  url.searchParams.set('granularity', '60');
  url.searchParams.set('start', startTime.toISOString());
  url.searchParams.set('end', endTime.toISOString());

  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`Coinbase error ${res.status}`);
  const data: unknown[][] = await res.json();

  // Coinbase returns [time_sec, low, high, open, close, volume] newest-first
  return data
    .map((k) => ({
      time: Number(k[0]) * 1000,
      open: parseFloat(k[3] as string),
      high: parseFloat(k[2] as string),
      low: parseFloat(k[1] as string),
      close: parseFloat(k[4] as string),
      volume: parseFloat(k[5] as string),
    }))
    .sort((a, b) => a.time - b.time);
}