export const TIMEFRAMES = ["1m", "5m", "15m", "1h", "4h", "1D"];

export const ASSETS = [
  { symbol: "BTCUSD", label: "Bitcoin", source: "Hyperliquid", coin: "BTC", pricePrecision: 1 },
  { symbol: "ETHUSD", label: "Ethereum", source: "Hyperliquid", coin: "ETH", pricePrecision: 2 },
  { symbol: "SOLUSD", label: "Solana", source: "Hyperliquid", coin: "SOL", pricePrecision: 3 },
  { symbol: "XAUUSD", label: "Gold Futures", source: "Yahoo", pricePrecision: 2 },
  { symbol: "USTECH", label: "Nasdaq Futures", source: "Yahoo", pricePrecision: 2 },
  { symbol: "USOIL", label: "Crude Oil", source: "Yahoo", pricePrecision: 2 },
  { symbol: "EURUSD", label: "Euro / Dollar", source: "Yahoo", pricePrecision: 5 },
  { symbol: "GBPUSD", label: "Pound / Dollar", source: "Yahoo", pricePrecision: 5 },
];

export const HYPERLIQUID_ASSETS = ASSETS
  .filter((asset) => asset.source === "Hyperliquid")
  .reduce((map, asset) => ({ ...map, [asset.symbol]: asset }), {});

export function getAssetConfig(symbol) {
  return ASSETS.find((asset) => asset.symbol === symbol) || ASSETS[0];
}

export function isHyperliquidAsset(symbol) {
  return Boolean(HYPERLIQUID_ASSETS[symbol]);
}

export function resolutionToSeconds(resolution) {
  const value = String(resolution || "1m").trim();
  const amount = Number.parseInt(value, 10) || 1;

  if (value.endsWith("D") || value.endsWith("d")) return amount * 24 * 60 * 60;
  if (value.endsWith("h")) return amount * 60 * 60;
  return amount * 60;
}

export function resolutionToHyperliquidInterval(resolution) {
  return resolution === "1D" ? "1d" : resolution;
}

export function formatPrice(value, symbol) {
  const precision = getAssetConfig(symbol).pricePrecision ?? 2;
  const number = Number(value);
  if (!Number.isFinite(number)) return "--";

  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: Math.min(precision, 2),
    maximumFractionDigits: precision,
  }).format(number);
}

export function formatCompactVolume(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "--";

  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 2,
  }).format(number);
}

export function normalizeTimestamp(timestamp) {
  if (timestamp instanceof Date) return Math.floor(timestamp.getTime() / 1000);

  const numeric = Number(timestamp);
  if (!Number.isFinite(numeric)) return Math.floor(Date.now() / 1000);

  return numeric > 1_000_000_000_000 ? Math.floor(numeric / 1000) : Math.floor(numeric);
}

export function formatReplayTime(timestamp) {
  if (!timestamp) return "--";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(normalizeTimestamp(timestamp) * 1000));
}

export function calculateChange(candles) {
  if (!candles || candles.length < 2) return { value: 0, percent: 0 };

  const previous = candles[candles.length - 2].close;
  const latest = candles[candles.length - 1].close;
  const value = latest - previous;
  const percent = previous === 0 ? 0 : (value / previous) * 100;

  return { value, percent };
}

export async function fetchMarketHistory(symbol, resolution, signal) {
  const params = new URLSearchParams({ ticker: symbol, resolution });
  const response = await fetch(`/api/market-engine?${params.toString()}`, { signal });

  if (!response.ok) {
    throw new Error(`Market data request failed with ${response.status}.`);
  }

  const payload = await response.json();
  const candles = Array.isArray(payload.data) ? payload.data : [];

  if (!payload.success || candles.length === 0) {
    throw new Error(payload.error || "No candles returned.");
  }

  return {
    ...payload,
    data: candles.map((candle) => ({
      time: Number(candle.time),
      open: Number(candle.open),
      high: Number(candle.high),
      low: Number(candle.low),
      close: Number(candle.close),
      volume: Number(candle.volume ?? 0),
    })),
  };
}

export function createFallbackCandles(symbol, resolution = "15m", length = 260) {
  const seed = symbol.split("").reduce((sum, char) => sum + char.charCodeAt(0), 0) || 1;
  const step = resolutionToSeconds(resolution);
  const start = Math.floor(Date.now() / 1000) - step * length;
  let close = symbol === "BTCUSD" ? 65000 : symbol === "ETHUSD" ? 3500 : symbol === "XAUUSD" ? 2320 : 220;
  let random = seed;

  const next = () => {
    random = (random * 16807) % 2147483647;
    return (random - 1) / 2147483646;
  };

  return Array.from({ length }, (_, index) => {
    const open = close;
    const drift = (next() - 0.48) * close * 0.006;
    close = Math.max(0.01, open + drift);
    const spread = Math.abs(close - open) + close * (0.0015 + next() * 0.003);
    const high = Math.max(open, close) + spread * next();
    const low = Math.max(0.01, Math.min(open, close) - spread * next());

    return {
      time: start + index * step,
      open: Number(open.toFixed(5)),
      high: Number(high.toFixed(5)),
      low: Number(low.toFixed(5)),
      close: Number(close.toFixed(5)),
      volume: Math.round(1000 + next() * 50000),
    };
  });
}

export function mergeCandle(candles, nextCandle) {
  if (!nextCandle || !Number.isFinite(Number(nextCandle.time))) return candles;

  const candle = {
    time: Number(nextCandle.time),
    open: Number(nextCandle.open),
    high: Number(nextCandle.high),
    low: Number(nextCandle.low),
    close: Number(nextCandle.close),
    volume: Number(nextCandle.volume ?? 0),
  };

  if (![candle.open, candle.high, candle.low, candle.close].every(Number.isFinite)) {
    return candles;
  }

  const existingIndex = candles.findIndex((entry) => entry.time === candle.time);
  if (existingIndex >= 0) {
    const next = [...candles];
    next[existingIndex] = candle;
    return next.sort((a, b) => a.time - b.time);
  }

  return [...candles, candle].sort((a, b) => a.time - b.time).slice(-5000);
}

export function updateCandleFromTrade(candles, trade, resolution) {
  const price = Number(trade.price);
  if (!Number.isFinite(price)) return candles;

  const size = Number(trade.size ?? 0);
  const timestamp = normalizeTimestamp(trade.time ?? Date.now());
  const step = resolutionToSeconds(resolution);
  const bucketTime = Math.floor(timestamp / step) * step;
  const last = candles[candles.length - 1];

  if (last && last.time === bucketTime) {
    const next = [...candles];
    next[next.length - 1] = {
      ...last,
      high: Math.max(last.high, price),
      low: Math.min(last.low, price),
      close: price,
      volume: Number(last.volume ?? 0) + size,
    };
    return next;
  }

  if (last && bucketTime < last.time) return candles;

  return [
    ...candles,
    {
      time: bucketTime,
      open: last?.close ?? price,
      high: Math.max(last?.close ?? price, price),
      low: Math.min(last?.close ?? price, price),
      close: price,
      volume: size,
    },
  ].slice(-5000);
}

export function buildVisibleReplayCandles(candles, replay) {
  if (!replay.enabled) return candles;
  if (!candles.length) return [];

  const index = Math.max(0, Math.min(replay.index, candles.length - 1));
  return candles.slice(0, index + 1);
}
