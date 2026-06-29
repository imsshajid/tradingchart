import { DurableObject } from "cloudflare:workers";

export interface Env {
  MARKET_STREAM_ROOM: DurableObjectNamespace<MarketStreamRoom>;
  DATA_PROVIDER_BASE_URL?: string;
  TICKDB_API_KEY?: string;
}

type Resolution = "1m" | "5m" | "15m" | "1h" | "4h" | "1D";

type OhlcvBar = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

type SubscribeMessage = {
  action: "subscribe" | "unsubscribe" | "ping";
  symbol?: string;
};

type TickMessage = {
  type: "tick";
  provider?: string;
  symbol: string;
  time: number;
  price: number;
  volume: number;
  bid?: number;
  ask?: number;
};

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Max-Age": "86400",
};

const JSON_HEADERS = {
  ...CORS_HEADERS,
  "Content-Type": "application/json; charset=utf-8",
};

const RESOLUTION_SECONDS: Record<Resolution, number> = {
  "1m": 60,
  "5m": 5 * 60,
  "15m": 15 * 60,
  "1h": 60 * 60,
  "4h": 4 * 60 * 60,
  "1D": 24 * 60 * 60,
};

const YAHOO_INTERVAL: Record<Resolution, string> = {
  "1m": "1m",
  "5m": "5m",
  "15m": "15m",
  "1h": "60m",
  "4h": "60m",
  "1D": "1d",
};

const PROVIDER_SYMBOLS: Record<string, string> = {
  BTCUSD: "BTC-USD",
  ETHUSD: "ETH-USD",
  XAUUSD: "GC=F",
  USTECH: "NQ=F",
  USOIL: "CL=F",
  EURUSD: "EURUSD=X",
  EURJPY: "EURJPY=X",
  USDJPY: "USDJPY=X",
  GBPJPY: "GBPJPY=X",
  GBPUSD: "GBPUSD=X",
  AUDUSD: "AUDUSD=X",
};

const TICKDB_REALTIME_URL = "wss://api.tickdb.ai/v1/realtime";

const TICKDB_SYMBOLS: Record<string, string> = {
  XAUUSD: "XAUUSD",
  EURUSD: "EURUSD",
};

function json(payload: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(payload), {
    ...init,
    headers: {
      ...JSON_HEADERS,
      ...(init.headers || {}),
    },
  });
}

function error(message: string, status = 400) {
  return json({ success: false, error: message }, { status });
}

function normalizeSymbol(value: string | null) {
  const symbol = (value || "").trim().toUpperCase();
  if (!/^[A-Z0-9.=^-]{2,24}$/.test(symbol)) {
    throw new Error("Invalid or missing symbol.");
  }
  return symbol;
}

function normalizeResolution(value: string | null): Resolution {
  if (!value || !(value in RESOLUTION_SECONDS)) {
    throw new Error("Invalid resolution. Supported values: 1m, 5m, 15m, 1h, 4h, 1D.");
  }
  return value as Resolution;
}

function parseTimestamp(value: string | null, label: string) {
  const timestamp = Number(value);
  if (!Number.isInteger(timestamp) || timestamp <= 0) {
    throw new Error(`Invalid ${label} timestamp.`);
  }
  return timestamp;
}

function providerSymbol(symbol: string) {
  return PROVIDER_SYMBOLS[symbol] || symbol;
}

function tickDbSymbol(symbol: string) {
  return TICKDB_SYMBOLS[symbol] || null;
}

function publicSymbolFromTickDb(symbol: string) {
  const normalized = symbol.trim().toUpperCase();
  const match = Object.entries(TICKDB_SYMBOLS).find(([, provider]) => provider === normalized);
  return match?.[0] || normalized;
}

function normalizeProviderTimestamp(value: unknown) {
  if (typeof value === "string" && Number.isNaN(Number(value))) {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? Math.floor(parsed / 1000) : Math.floor(Date.now() / 1000);
  }

  const number = Number(value);
  if (!Number.isFinite(number)) return Math.floor(Date.now() / 1000);
  return number > 1_000_000_000_000 ? Math.floor(number / 1000) : Math.floor(number);
}

function normalizeTickDbTicker(message: unknown): TickMessage[] {
  const wrapper = message as {
    channel?: string;
    data?: unknown;
    symbol?: string;
  };
  const payload = wrapper.data ?? message;
  const entries = Array.isArray(payload) ? payload : [payload];

  return entries
    .map((entry) => {
      const data = entry as Record<string, unknown>;
      const rawSymbol = String(data.symbol ?? wrapper.symbol ?? "").toUpperCase();
      const symbol = publicSymbolFromTickDb(rawSymbol);
      const price = toFiniteNumber(data.last_price ?? data.price ?? data.last ?? data.close ?? data.mid);
      if (!symbol || price === null) return null;

      const bid = toFiniteNumber(data.bid_price ?? data.bid);
      const ask = toFiniteNumber(data.ask_price ?? data.ask);
      const volume = toFiniteNumber(data.volume ?? data.last_volume ?? data.size) ?? 0;

      return {
        type: "tick" as const,
        provider: "TickDB",
        symbol,
        time: normalizeProviderTimestamp(data.timestamp ?? data.ts ?? data.time),
        price,
        volume,
        bid: bid ?? undefined,
        ask: ask ?? undefined,
      };
    })
    .filter((tick): tick is TickMessage => Boolean(tick));
}

function isFiniteCandle(bar: {
  time: number | null;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number | null;
  volume: number | null;
}): bar is OhlcvBar {
  return (
    Number.isInteger(bar.time) &&
    Number.isFinite(bar.open) &&
    Number.isFinite(bar.high) &&
    Number.isFinite(bar.low) &&
    Number.isFinite(bar.close) &&
    Number.isFinite(bar.volume)
  );
}

function toFiniteNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function mapYahooBars(payload: unknown): OhlcvBar[] {
  const chart = payload as {
    chart?: {
      result?: Array<{
        timestamp?: number[];
        indicators?: {
          quote?: Array<{
            open?: Array<number | null>;
            high?: Array<number | null>;
            low?: Array<number | null>;
            close?: Array<number | null>;
            volume?: Array<number | null>;
          }>;
        };
      }>;
      error?: { code?: string; description?: string };
    };
  };

  if (chart.chart?.error) {
    throw new Error(chart.chart.error.description || chart.chart.error.code || "Provider returned an error.");
  }

  const result = chart.chart?.result?.[0];
  const timestamps = result?.timestamp || [];
  const quote = result?.indicators?.quote?.[0] || {};
  const opens = quote.open || [];
  const highs = quote.high || [];
  const lows = quote.low || [];
  const closes = quote.close || [];
  const volumes = quote.volume || [];

  return timestamps
    .map((time, index) => ({
      time: toFiniteNumber(time),
      open: toFiniteNumber(opens[index]),
      high: toFiniteNumber(highs[index]),
      low: toFiniteNumber(lows[index]),
      close: toFiniteNumber(closes[index]),
      volume: toFiniteNumber(volumes[index]) ?? 0,
    }))
    .filter(isFiniteCandle);
}

function alignTimestamp(timestamp: number, seconds: number) {
  return Math.floor(timestamp / seconds) * seconds;
}

function aggregateBars(bars: OhlcvBar[], resolutionSeconds: number): OhlcvBar[] {
  const buckets = new Map<number, OhlcvBar>();

  for (const bar of bars) {
    const bucketTime = alignTimestamp(bar.time, resolutionSeconds);
    const existing = buckets.get(bucketTime);

    if (!existing) {
      buckets.set(bucketTime, { ...bar, time: bucketTime });
      continue;
    }

    existing.high = Math.max(existing.high, bar.high);
    existing.low = Math.min(existing.low, bar.low);
    existing.close = bar.close;
    existing.volume += bar.volume;
  }

  return [...buckets.values()].sort((a, b) => a.time - b.time);
}

async function fetchHistoricalBars(symbol: string, resolution: Resolution, from: number, to: number, env: Env) {
  const providerBase = env.DATA_PROVIDER_BASE_URL || "https://query1.finance.yahoo.com/v8/finance/chart";
  const interval = YAHOO_INTERVAL[resolution];
  const targetResolutionSeconds = RESOLUTION_SECONDS[resolution];
  const url = new URL(`${providerBase}/${encodeURIComponent(providerSymbol(symbol))}`);
  url.searchParams.set("period1", String(from));
  url.searchParams.set("period2", String(to));
  url.searchParams.set("interval", interval);
  url.searchParams.set("includePrePost", "true");
  url.searchParams.set("events", "history");

  const providerResponse = await fetch(url.toString(), {
    cf: {
      cacheTtl: 30,
      cacheEverything: false,
    },
    headers: {
      Accept: "application/json",
      "User-Agent": "CloudflareWorkerMarketData/1.0",
    },
  });

  if (!providerResponse.ok) {
    throw new Error(`Data provider responded with HTTP ${providerResponse.status}.`);
  }

  const bars = mapYahooBars(await providerResponse.json());
  const normalized = resolution === "4h" ? aggregateBars(bars, targetResolutionSeconds) : bars;

  return normalized.filter((bar) => bar.time >= from && bar.time <= to);
}

function makeHistoryCacheKey(request: Request, symbol: string, resolution: Resolution, from: number, to: number) {
  const url = new URL(request.url);
  url.pathname = "/api/history";
  url.search = "";
  url.searchParams.set("symbol", symbol);
  url.searchParams.set("resolution", resolution);
  url.searchParams.set("from", String(from));
  url.searchParams.set("to", String(to));
  return new Request(url.toString(), { method: "GET" });
}

async function handleHistory(request: Request, env: Env, ctx: ExecutionContext) {
  const url = new URL(request.url);

  let symbol: string;
  let resolution: Resolution;
  let from: number;
  let to: number;

  try {
    symbol = normalizeSymbol(url.searchParams.get("symbol"));
    resolution = normalizeResolution(url.searchParams.get("resolution"));
    from = parseTimestamp(url.searchParams.get("from"), "from");
    to = parseTimestamp(url.searchParams.get("to"), "to");
  } catch (caught) {
    return error(caught instanceof Error ? caught.message : "Invalid request.", 400);
  }

  if (from >= to) return error("Parameter 'from' must be earlier than 'to'.", 400);

  const resolutionSeconds = RESOLUTION_SECONDS[resolution];
  const maxLookbackSeconds = resolution === "1m" ? 7 * 24 * 60 * 60 : 90 * 24 * 60 * 60;
  if (to - from > maxLookbackSeconds) {
    return error(`Requested interval is too large for ${resolution}.`, 413);
  }

  const now = Math.floor(Date.now() / 1000);
  const immutableInterval = to < now - resolutionSeconds * 2;
  const cacheKey = makeHistoryCacheKey(request, symbol, resolution, from, to);

  if (immutableInterval) {
    const cached = await caches.default.match(cacheKey);
    if (cached) {
      return new Response(cached.body, {
        status: cached.status,
        headers: {
          ...JSON_HEADERS,
          "Cache-Control": "public, max-age=300",
          "X-Cache": "HIT",
        },
      });
    }
  }

  try {
    const bars = await fetchHistoricalBars(symbol, resolution, from, to, env);
    const response = json(bars, {
      status: 200,
      headers: {
        "Cache-Control": immutableInterval ? "public, max-age=300" : "no-store",
        "X-Cache": immutableInterval ? "MISS" : "BYPASS",
      },
    });

    if (immutableInterval) {
      ctx.waitUntil(caches.default.put(cacheKey, response.clone()));
    }

    return response;
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "Failed to load historical bars.";
    return error(message, 502);
  }
}

async function handleLive(request: Request, env: Env) {
  if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
    return error("Expected WebSocket upgrade request.", 426);
  }

  const room = env.MARKET_STREAM_ROOM.getByName("global-market-stream");
  return room.fetch(request);
}

function handleOptions() {
  return new Response(null, {
    status: 204,
    headers: CORS_HEADERS,
  });
}

function handleHealth(request: Request) {
  const url = new URL(request.url);
  const liveUrl = `wss://${url.host}/api/live`;

  return json({
    success: true,
    service: "quantum-market-worker",
    status: "ready",
    routes: {
      history: "/api/history?symbol=XAUUSD&resolution=1m&from=UNIX_SECONDS&to=UNIX_SECONDS",
      live: "/api/live",
    },
    websocket: {
      endpoint: liveUrl,
      subscribe: { action: "subscribe", symbol: "XAUUSD" },
      supportedLiveSymbols: Object.keys(TICKDB_SYMBOLS),
    },
  }, {
    status: 200,
    headers: {
      "Cache-Control": "no-store",
    },
  });
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") return handleOptions();

    if (url.pathname === "/" && request.method === "GET") {
      return handleHealth(request);
    }

    if (url.pathname === "/api/history" && request.method === "GET") {
      return handleHistory(request, env, ctx);
    }

    if (url.pathname === "/api/live" && request.method === "GET") {
      return handleLive(request, env);
    }

    return error("Not found.", 404);
  },
};

export class MarketStreamRoom extends DurableObject<Env> {
  private subscriptions = new Map<WebSocket, Set<string>>();
  private timers = new Map<string, number>();
  private lastPrices = new Map<string, number>();
  private tickDbSocket: WebSocket | null = null;
  private tickDbReady = false;
  private tickDbReconnectTimer: number | null = null;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);

    for (const ws of this.ctx.getWebSockets()) {
      const attachment = ws.deserializeAttachment() as { symbols?: string[] } | undefined;
      const symbols = new Set(attachment?.symbols || []);
      this.subscriptions.set(ws, symbols);

      for (const symbol of symbols) {
        if (tickDbSymbol(symbol)) {
          this.ensureTickDbConnection();
        } else {
          this.ensureSymbolTimer(symbol);
        }
      }
    }
  }

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
      return error("Expected WebSocket upgrade request.", 426);
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    this.ctx.acceptWebSocket(server);
    this.subscriptions.set(server, new Set());
    server.serializeAttachment({ symbols: [] });
    server.send(JSON.stringify({ type: "connected", heartbeatMs: 15000 }));

    return new Response(null, {
      status: 101,
      webSocket: client,
    });
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    if (typeof message !== "string") return;

    let parsed: SubscribeMessage;
    try {
      parsed = JSON.parse(message) as SubscribeMessage;
    } catch {
      ws.send(JSON.stringify({ type: "error", error: "Invalid JSON message." }));
      return;
    }

    if (parsed.action === "ping") {
      ws.send(JSON.stringify({ type: "pong", time: Math.floor(Date.now() / 1000) }));
      return;
    }

    if (parsed.action !== "subscribe" && parsed.action !== "unsubscribe") {
      ws.send(JSON.stringify({ type: "error", error: "Unsupported action." }));
      return;
    }

    let symbol: string;
    try {
      symbol = normalizeSymbol(parsed.symbol || null);
    } catch (caught) {
      ws.send(JSON.stringify({ type: "error", error: caught instanceof Error ? caught.message : "Invalid symbol." }));
      return;
    }

    const current = this.subscriptions.get(ws) || new Set<string>();
    if (parsed.action === "subscribe") {
      current.add(symbol);
      this.subscriptions.set(ws, current);
      ws.serializeAttachment({ symbols: [...current] });
      if (tickDbSymbol(symbol)) {
        this.ensureTickDbConnection();
        this.syncTickDbSubscriptions();
      } else {
        this.ensureSymbolTimer(symbol);
      }
      ws.send(JSON.stringify({ type: "subscribed", symbol }));
    } else {
      current.delete(symbol);
      this.subscriptions.set(ws, current);
      ws.serializeAttachment({ symbols: [...current] });
      if (tickDbSymbol(symbol)) {
        this.syncTickDbSubscriptions();
        this.closeTickDbIfUnused();
      } else {
        this.stopSymbolTimerIfUnused(symbol);
      }
      ws.send(JSON.stringify({ type: "unsubscribed", symbol }));
    }
  }

  async webSocketClose(ws: WebSocket, code: number, reason: string): Promise<void> {
    const symbols = this.subscriptions.get(ws);
    this.subscriptions.delete(ws);
    ws.close(code, reason);

    if (symbols) {
      for (const symbol of symbols) {
        if (tickDbSymbol(symbol)) {
          this.syncTickDbSubscriptions();
          this.closeTickDbIfUnused();
        } else {
          this.stopSymbolTimerIfUnused(symbol);
        }
      }
    }
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    const symbols = this.subscriptions.get(ws);
    this.subscriptions.delete(ws);

    if (symbols) {
      for (const symbol of symbols) {
        if (tickDbSymbol(symbol)) {
          this.syncTickDbSubscriptions();
          this.closeTickDbIfUnused();
        } else {
          this.stopSymbolTimerIfUnused(symbol);
        }
      }
    }
  }

  private activeTickDbSymbols() {
    const symbols = new Set<string>();

    for (const subscribed of this.subscriptions.values()) {
      for (const symbol of subscribed) {
        if (tickDbSymbol(symbol)) symbols.add(symbol);
      }
    }

    return [...symbols];
  }

  private ensureTickDbConnection() {
    const activeSymbols = this.activeTickDbSymbols();
    if (!activeSymbols.length || this.tickDbSocket || this.tickDbReconnectTimer !== null) return;

    if (!this.env.TICKDB_API_KEY) {
      this.broadcastError("TickDB is not configured. Set the TICKDB_API_KEY Worker secret.");
      return;
    }

    const url = new URL(TICKDB_REALTIME_URL);
    url.searchParams.set("api_key", this.env.TICKDB_API_KEY);
    const socket = new WebSocket(url.toString());

    this.tickDbSocket = socket;
    this.tickDbReady = false;

    socket.addEventListener("open", () => {
      this.tickDbReady = true;
      this.syncTickDbSubscriptions();
    });

    socket.addEventListener("message", (event) => {
      if (typeof event.data !== "string") return;

      let message: unknown;
      try {
        message = JSON.parse(event.data);
      } catch {
        return;
      }

      const ticks = normalizeTickDbTicker(message);
      for (const tick of ticks) this.broadcastTick(tick);
    });

    const reconnect = () => {
      this.tickDbSocket = null;
      this.tickDbReady = false;
      if (!this.activeTickDbSymbols().length || this.tickDbReconnectTimer !== null) return;

      this.tickDbReconnectTimer = setTimeout(() => {
        this.tickDbReconnectTimer = null;
        this.ensureTickDbConnection();
      }, 1500) as unknown as number;
    };

    socket.addEventListener("close", reconnect);
    socket.addEventListener("error", reconnect);
  }

  private syncTickDbSubscriptions() {
    const providerSymbols = this.activeTickDbSymbols()
      .map((symbol) => tickDbSymbol(symbol))
      .filter((symbol): symbol is string => Boolean(symbol));

    if (!providerSymbols.length) return;
    this.ensureTickDbConnection();

    if (!this.tickDbSocket || !this.tickDbReady) return;

    this.tickDbSocket.send(JSON.stringify({
      cmd: "subscribe",
      data: {
        channel: "ticker",
        symbols: providerSymbols,
      },
    }));
  }

  private closeTickDbIfUnused() {
    if (this.activeTickDbSymbols().length) return;

    if (this.tickDbReconnectTimer !== null) {
      clearTimeout(this.tickDbReconnectTimer);
      this.tickDbReconnectTimer = null;
    }

    this.tickDbReady = false;
    this.tickDbSocket?.close();
    this.tickDbSocket = null;
  }

  private ensureSymbolTimer(symbol: string) {
    if (this.timers.has(symbol)) return;

    const timer = setInterval(() => {
      const tick = this.makeSyntheticTick(symbol);
      this.broadcastTick(tick);
    }, 1000) as unknown as number;

    this.timers.set(symbol, timer);
  }

  private stopSymbolTimerIfUnused(symbol: string) {
    for (const symbols of this.subscriptions.values()) {
      if (symbols.has(symbol)) return;
    }

    const timer = this.timers.get(symbol);
    if (timer !== undefined) {
      clearInterval(timer);
      this.timers.delete(symbol);
    }
  }

  private broadcastTick(tick: TickMessage) {
    const payload = JSON.stringify(tick);

    for (const ws of this.ctx.getWebSockets()) {
      const symbols = this.subscriptions.get(ws) || new Set<string>(
        ((ws.deserializeAttachment() as { symbols?: string[] } | undefined)?.symbols || []),
      );

      if (symbols.has(tick.symbol)) {
        try {
          ws.send(payload);
        } catch {
          this.subscriptions.delete(ws);
        }
      }
    }
  }

  private broadcastError(errorMessage: string) {
    const payload = JSON.stringify({ type: "error", error: errorMessage });

    for (const ws of this.ctx.getWebSockets()) {
      try {
        ws.send(payload);
      } catch {
        this.subscriptions.delete(ws);
      }
    }
  }

  private makeSyntheticTick(symbol: string): TickMessage {
    const base = this.lastPrices.get(symbol) || this.initialPrice(symbol);
    const drift = Math.sin(Date.now() / 9000 + symbol.length) * 0.0009;
    const noise = (crypto.getRandomValues(new Uint32Array(1))[0] / 0xffffffff - 0.5) * 0.0016;
    const price = Math.max(0.0001, base * (1 + drift + noise));
    const rounded = Number(price.toFixed(symbol.includes("USD") && !symbol.includes("BTC") ? 2 : 4));
    const spread = Math.max(0.01, rounded * 0.00008);

    this.lastPrices.set(symbol, rounded);

    return {
      type: "tick",
      symbol,
      time: Math.floor(Date.now() / 1000),
      price: rounded,
      volume: Math.round(100 + crypto.getRandomValues(new Uint32Array(1))[0] % 2500),
      bid: Number((rounded - spread / 2).toFixed(4)),
      ask: Number((rounded + spread / 2).toFixed(4)),
    };
  }

  private initialPrice(symbol: string) {
    if (symbol === "BTCUSD") return 65000;
    if (symbol === "ETHUSD") return 3500;
    if (symbol === "XAUUSD") return 2320;
    if (symbol === "USTECH") return 20000;
    if (symbol === "USOIL") return 78;
    if (symbol.endsWith("USD")) return 1.08;
    return 100;
  }
}
