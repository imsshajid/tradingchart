const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Max-Age": "86400",
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "public, max-age=15, stale-while-revalidate=60",
};

const DEFAULT_TICKER = "AAPL";
const TICKER_PATTERN = /^[A-Z0-9.^-]{1,16}$/;
const YAHOO_TIMEOUT_MS = 9000;
const RANGE = "1mo";
const INTERVAL = "15m";

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: CORS_HEADERS,
  });
}

function getTickerFromRequest(requestUrl) {
  const url = new URL(requestUrl);
  const rawTicker = url.searchParams.get("ticker") || DEFAULT_TICKER;
  const ticker = rawTicker.trim().toUpperCase();

  if (!TICKER_PATTERN.test(ticker)) {
    throw new Error("Invalid ticker query parameter.");
  }

  return ticker;
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

export default async function handler(request) {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: CORS_HEADERS,
    });
  }

  if (request.method !== "GET") {
    return jsonResponse({ success: false, error: "Method not allowed." }, 405);
  }

  let ticker;

  try {
    ticker = getTickerFromRequest(request.url);
  } catch (error) {
    return jsonResponse({ success: false, error: error.message }, 400);
  }

  const yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?range=${RANGE}&interval=${INTERVAL}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), YAHOO_TIMEOUT_MS);

  try {
    const yahooResponse = await fetch(yahooUrl, {
      signal: controller.signal,
      headers: {
        "Accept": "application/json",
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

    const data = mapYahooCandles(result);

    return jsonResponse({
      success: true,
      source: "yahoo-finance",
      ticker,
      range: RANGE,
      interval: INTERVAL,
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
      range: RANGE,
      interval: INTERVAL,
      error: message,
    }, 502);
  } finally {
    clearTimeout(timeout);
  }
}

export const config = {
  path: "/api/market-engine",
};
