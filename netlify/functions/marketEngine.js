const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Max-Age": "86400",
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "public, max-age=15, stale-while-revalidate=60",
};

const DEFAULT_TICKER = "BTCUSD";
const TICKER_PATTERN = /^[A-Z0-9.^=-]{1,24}$/;
const YAHOO_TIMEOUT_MS = 9000;

const SYMBOL_ALIASES = {
  BTCUSD: "BTC-USD",
  ETHUSD: "ETH-USD",
  XAUUSD: "GC=F",
  USTECH: "NQ=F",
  USOIL: "CL=F",
  EURUSD: "EURUSD=X",
  GBPUSD: "GBPUSD=X",
};

const RESOLUTION_CONFIG = {
  "1m": { range: "5d", interval: "1m" },
  "5m": { range: "1mo", interval: "5m" },
  "15m": { range: "1mo", interval: "15m" },
  "1h": { range: "3mo", interval: "60m" },
  "4h": { range: "6mo", interval: "60m", aggregateSeconds: 4 * 60 * 60 },
  "1D": { range: "1y", interval: "1d" },
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

  const yahooTicker = SYMBOL_ALIASES[ticker] || ticker;
  const config = RESOLUTION_CONFIG[resolution];
  const yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooTicker)}?range=${config.range}&interval=${config.interval}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), YAHOO_TIMEOUT_MS);

  try {
    const yahooResponse = await fetch(yahooUrl, {
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        "User-Agent": "Mozilla/5.0 NetlifyMarketEngine/1.0",
      },
    });

    if (!yahooResponse.ok) {
      throw new Error(`Yahoo Finance responded with ${yahooResponse.status}.`);
    }

    const yahooJson = await yahooResponse.json();
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
    const data = config.aggregateSeconds
      ? aggregateCandles(mappedCandles, config.aggregateSeconds)
      : mappedCandles;

    return jsonResponse({
      success: true,
      source: "yahoo-finance",
      ticker,
      yahooTicker,
      resolution,
      range: config.range,
      interval: config.interval,
      count: data.length,
      data,
    });
  } catch (error) {
    const message = error.name === "AbortError"
      ? "Yahoo Finance request timed out."
      : error.message;

    return jsonResponse({
      success: false,
      ticker,
      yahooTicker,
      resolution,
      error: message,
    }, 502);
  } finally {
    clearTimeout(timeout);
  }
};
