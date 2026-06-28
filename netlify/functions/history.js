export default async (request, context) => {
  // Extract ticker from query parameters (e.g., /api/history?ticker=AAPL)
  const url = new URL(request.url);
  const ticker = url.searchParams.get("ticker")?.toUpperCase() || "AAPL";

  const yfUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?range=1mo&interval=1d`;

  try {
    const response = await fetch(yfUrl);
    if (!response.ok) throw new Error("Failed to fetch from Yahoo Finance");

    const json = await response.json();
    const result = json.chart.result[0];
    const timestamps = result.timestamp;
    const indicators = result.indicators.quote[0];

    // Format the data perfectly for our Lightweight Charts frontend
    const historyData = timestamps
      .map((time, idx) => ({
        time: time,
        open: indicators.open[idx],
        high: indicators.high[idx],
        low: indicators.low[idx],
        close: indicators.close[idx],
        volume: indicators.volume[idx],
      }))
      .filter((candle) => candle.open !== null && candle.close !== null); // Clean bad entries

    return new Response(JSON.stringify({ success: true, data: historyData }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};

// Route mapping configuration for Netlify
export const config = {
  path: "/api/history"
};