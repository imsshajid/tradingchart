const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Max-Age": "86400",
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "public, max-age=10, stale-while-revalidate=30",
};

const DEFAULT_TICKER = "BTCUSD";
const TICKER_PATTERN = /^[A-Z0-9.^=-]{1,24}$/;
const REQUEST_TIMEOUT_MS = 9000;
const HYPERLIQUID_INFO_URL = "https://api.hyperliquid.xyz/info";

const HYPERLIQUID_ASSETS = {
  BTCUSD: "BTC",
  ETHUSD: "ETH",
  SOLUSD: "SOL",
};

const SYMBOL_ALIASES = {
  BTCUSD: "BTC-USD",
  ETHUSD: "ETH-USD",
  SOLUSD: "SOL-USD",
  XAUUSD: "GC=F",
  USTECH: "NQ=F",
  USOIL: "CL=F",
  EURUSD: "EURUSD=X",
  GBPUSD: "GBPUSD=X",
};

const RESOLUTION_CONFIG = {
  "1m": { yahooRange: "5d", yahooInterval: "1m", hyperliquidInterval: "1m", lookbackMs: 1000 * 60 * 60 * 24 * 2 },
  "5m": { yahooRange: "1mo", yahooInterval: "5m", hyperliquidInterval: "5m", lookbackMs: 1000 * 60 * 60 * 24 * 10 },
  "15m": { yahooRange: "1mo", yahooInterval: "15m", hyperliquidInterval: "15m", lookbackMs: 1000 * 60 * 60 * 24 * 31 },
  "1h": { yahooRange: "3mo", yahooInterval: "60m", hyperliquidInterval: "1h", lookbackMs: 1000 * 60 * 60 * 24 * 90 },
  "4h": { yahooRange: "6mo", yahooInterval: "60m", yahooAggregateSeconds: 4 * 60 * 60, hyperliquidInterval: "4h", lookbackMs: 1000 * 60 * 60 * 24 * 180 },
  "1D": { yahooRange: "1y", yahooInterval: "1d", hyperliquidInterval: "1d", lookbackMs: 1000 * 60 * 60 * 24 * 365 },
};

function jsonResponse(payload, statusCode = 200) {
  return {
    statusCode,
    headers: CORS_HEADERS,
    body: JSON.stringify(payload),
  };
}

function normalizeTicker(rawTicker = DEFAULT_TICKER) {
  const ticker = String(rawTicker).trim().toUpperCase();

  if (!TICKER_PATTERN.test(ticker)) {
    throw new Error("Invalid ticker query parameter.");
  }

  return ticker;
}

function normalizeResolution(rawResolution = "15m") {
  const resolution = String(rawResolution).trim();
  return RESOLUTION_CONFIG[resolution] ? resolution : "15m";
}

function toFiniteNumber(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function isCompleteCandle(candle) {
  return (
    Number.isInteger(candle.time) &&
    Number.isFinite(candle.open) &&
    Number.isFinite(candle.high) &&
    Number.isFinite(candle.low) &&
    Number.isFinite(candle.close) &&
    Number.isFinite(candle.volume)
  );
}

function mapYahooCandles(result) {
  const timestamps = Array.isArray(result?.timestamp) ? result.timestamp : [];
  const quote = result?.indicators?.quote?.[0] || {};
  const opens = Array.isArray(quote.open) ? quote.open : [];
  const highs = Array.isArray(quote.high) ? quote.high : [];
  const lows = Array.isArray(quote.low) ? quote.low : [];
  const closes = Array.isArray(quote.close) ? quote.close : [];
  const volumes = Array.isArray(quote.volume) ? quote.volume : [];

  return timestamps
    .map((timestamp, index) => ({
      time: toFiniteNumber(timestamp),
      open: toFiniteNumber(opens[index]),
      high: toFiniteNumber(highs[index]),
      low: toFiniteNumber(lows[index]),
      close: toFiniteNumber(closes[index]),
      volume: toFiniteNumber(volumes[index]),
    }))
    .filter(isCompleteCandle);
}

function mapHyperliquidCandle(entry) {
  const candle = {
    time: Math.floor(toFiniteNumber(entry?.t) / 1000),
    open: toFiniteNumber(entry?.o),
    high: toFiniteNumber(entry?.h),
    low: toFiniteNumber(entry?.l),
    close: toFiniteNumber(entry?.c),
    volume: toFiniteNumber(entry?.v),
  };

  return isCompleteCandle(candle) ? candle : null;
}

function aggregateCandles(candles, bucketSeconds) {
  const buckets = new Map();

  for (const candle of candles) {
    const bucketTime = Math.floor(candle.time / bucketSeconds) * bucketSeconds;
    const current = buckets.get(bucketTime);

    if (!current) {
      buckets.set(bucketTime, {
        time: bucketTime,
        open: candle.open,
        high: candle.high,
        low: candle.low,
        close: candle.close,
        volume: candle.volume,
      });
      continue;
    }

    current.high = Math.max(current.high, candle.high);
    current.low = Math.min(current.low, candle.low);
    current.close = candle.close;
    current.volume += candle.volume;
  }

  return Array.from(buckets.values()).sort((a, b) => a.time - b.time);
}

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchHyperliquidHistory(ticker, resolution) {
  const coin = HYPERLIQUID_ASSETS[ticker];
  const config = RESOLUTION_CONFIG[resolution];
  if (!coin || !config?.hyperliquidInterval) {
    throw new Error("Ticker is not supported by Hyperliquid.");
  }

  const endTime = Date.now();
  const startTime = endTime - config.lookbackMs;
  const response = await fetchWithTimeout(HYPERLIQUID_INFO_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      type: "candleSnapshot",
      req: {
        coin,
        interval: config.hyperliquidInterval,
        startTime,
        endTime,
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`Hyperliquid responded with ${response.status}.`);
  }

  const payload = await response.json();
  const data = (Array.isArray(payload) ? payload : [])
    .map(mapHyperliquidCandle)
    .filter(Boolean)
    .sort((a, b) => a.time - b.time);

  if (!data.length) {
    throw new Error("Hyperliquid returned no candles.");
  }

  return {
    source: "hyperliquid",
    coin,
    interval: config.hyperliquidInterval,
    data,
  };
}

async function fetchYahooHistory(ticker, resolution) {
  const yahooTicker = SYMBOL_ALIASES[ticker] || ticker;
  const config = RESOLUTION_CONFIG[resolution];
  const yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooTicker)}?range=${config.yahooRange}&interval=${config.yahooInterval}`;
  const response = await fetchWithTimeout(yahooUrl, {
    headers: {
      Accept: "application/json",
      "User-Agent": "Mozilla/5.0 NetlifyMarketEngine/1.0",
    },
  });

  if (!response.ok) {
    throw new Error(`Yahoo Finance responded with ${response.status}.`);
  }

  const yahooJson = await response.json();
  const chart = yahooJson?.chart;
  const chartError = chart?.error;
  const result = chart?.result?.[0];

  if (chartError) {
    throw new Error(chartError.description || chartError.code || "Yahoo Finance returned an error.");
  }

  if (!result) {
    throw new Error("Yahoo Finance returned no chart result.");
  }

  const mappedCandles = mapYahooCandles(result);
  const data = config.yahooAggregateSeconds
    ? aggregateCandles(mappedCandles, config.yahooAggregateSeconds)
    : mappedCandles;

  if (!data.length) {
    throw new Error("Yahoo Finance returned no candles.");
  }

  return {
    source: "yahoo-finance",
    yahooTicker,
    range: config.yahooRange,
    interval: config.yahooInterval,
    data,
  };
}

exports.handler = async function handler(event) {
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 204,
      headers: CORS_HEADERS,
      body: "",
    };
  }

  if (event.httpMethod !== "GET") {
    return jsonResponse({ success: false, error: "Method not allowed." }, 405);
  }

  const params = event.queryStringParameters || {};
  let ticker;
  let resolution;

  try {
    ticker = normalizeTicker(params.ticker);
    resolution = normalizeResolution(params.resolution);
  } catch (error) {
    return jsonResponse({ success: false, error: error.message }, 400);
  }

  try {
    let result;
    let fallbackError = null;

    if (HYPERLIQUID_ASSETS[ticker]) {
      try {
        result = await fetchHyperliquidHistory(ticker, resolution);
      } catch (error) {
        fallbackError = error.message;
      }
    }

    if (!result) {
      result = await fetchYahooHistory(ticker, resolution);
    }

    return jsonResponse({
      success: true,
      ticker,
      resolution,
      count: result.data.length,
      fallbackError,
      ...result,
    });
  } catch (error) {
    const message = error.name === "AbortError"
      ? "Market data request timed out."
      : error.message;

    return jsonResponse({
      success: false,
      ticker,
      resolution,
      error: message,
    }, 502);
  }
};
