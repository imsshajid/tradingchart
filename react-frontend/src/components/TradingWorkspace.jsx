import React, { useEffect, useMemo, useState } from "react";
import LightweightTradingChart from "./LightweightTradingChart.jsx";

const TIMEFRAMES = ["1m", "5m", "15m", "1h", "4h", "1D"];
const ASSETS = ["XAUUSD", "BTCUSD", "ETHUSD", "USTECH", "USOIL", "EURUSD", "GBPUSD"];
const TIMEZONES =
  typeof Intl !== "undefined" && typeof Intl.supportedValuesOf === "function"
    ? Intl.supportedValuesOf("timeZone")
    : ["UTC", "America/New_York", "Europe/London", "Asia/Dhaka", "Asia/Tokyo"];

function resolutionToSeconds(resolution) {
  const value = String(resolution || "1m").trim();
  const amount = Number.parseInt(value, 10) || 1;

  if (value.endsWith("D")) return amount * 24 * 60 * 60;
  if (value.endsWith("h")) return amount * 60 * 60;
  return amount * 60;
}

function normalizeTimestamp(timestamp) {
  if (timestamp instanceof Date) return Math.floor(timestamp.getTime() / 1000);

  const numeric = Number(timestamp);
  if (!Number.isFinite(numeric)) return Math.floor(Date.now() / 1000);

  return numeric > 1_000_000_000_000 ? Math.floor(numeric / 1000) : Math.floor(numeric);
}

function formatRemaining(totalSeconds) {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;

  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function createFallbackCandles(symbol) {
  const seed = symbol.split("").reduce((sum, char) => sum + char.charCodeAt(0), 0) || 1;
  const start = Math.floor(Date.now() / 1000) - 15 * 60 * 180;
  let close = symbol === "BTCUSD" ? 65000 : symbol === "XAUUSD" ? 2320 : 220;
  let random = seed;

  const next = () => {
    random = (random * 16807) % 2147483647;
    return (random - 1) / 2147483646;
  };

  return Array.from({ length: 180 }, (_, index) => {
    const open = close;
    const drift = (next() - 0.48) * close * 0.006;
    close = Math.max(0.01, open + drift);
    const spread = Math.abs(close - open) + close * (0.0015 + next() * 0.003);
    const high = Math.max(open, close) + spread * next();
    const low = Math.max(0.01, Math.min(open, close) - spread * next());

    return {
      time: start + index * 15 * 60,
      open: Number(open.toFixed(5)),
      high: Number(high.toFixed(5)),
      low: Number(low.toFixed(5)),
      close: Number(close.toFixed(5)),
      volume: Math.round(1000 + next() * 50000),
    };
  });
}

export function CountdownToBarClose({ resolution = "5m", latestTickTimestamp = Date.now() }) {
  const [nowSeconds, setNowSeconds] = useState(() => Math.floor(Date.now() / 1000));
  const intervalSeconds = useMemo(() => resolutionToSeconds(resolution), [resolution]);
  const tickSeconds = useMemo(() => normalizeTimestamp(latestTickTimestamp), [latestTickTimestamp]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNowSeconds(Math.floor(Date.now() / 1000));
    }, 1000);

    return () => window.clearInterval(timer);
  }, []);

  const barOpen = Math.floor(tickSeconds / intervalSeconds) * intervalSeconds;
  const barClose = barOpen + intervalSeconds;
  const remaining = Math.max(0, barClose - nowSeconds);

  return (
    <div className="flex items-center gap-2 rounded border border-zinc-800 bg-black/20 px-3 py-1.5 text-xs text-zinc-300 dark:border-[#30363d] dark:bg-[#161b22]">
      <span className="text-zinc-500 dark:text-zinc-500">BAR CLOSE</span>
      <span className="inline-block min-w-[7ch] text-right font-mono tabular-nums text-zinc-950 dark:text-zinc-100">
        {formatRemaining(remaining)}
      </span>
    </div>
  );
}

function ChartPane({ id, asset, timeframe, theme, settings }) {
  const [candles, setCandles] = useState([]);
  const [status, setStatus] = useState("loading");

  useEffect(() => {
    const controller = new AbortController();

    async function loadCandles() {
      setStatus("loading");

      try {
        const params = new URLSearchParams({ ticker: asset, resolution: timeframe });
        const response = await fetch(`/api/market-engine?${params.toString()}`, {
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(`Market data request failed with ${response.status}.`);
        }

        const payload = await response.json();
        const nextCandles = Array.isArray(payload.data) ? payload.data : [];

        if (!payload.success || nextCandles.length === 0) {
          throw new Error(payload.error || "No candles returned.");
        }

        setCandles(nextCandles);
        setStatus("live");
      } catch (error) {
        if (error.name === "AbortError") return;
        setCandles(createFallbackCandles(asset));
        setStatus("fallback");
      }
    }

    loadCandles();
    return () => controller.abort();
  }, [asset, timeframe]);

  const indicatorSettings = useMemo(() => ({
    ema: { enabled: true, length: 21, source: "close", color: "#10b981" },
    rsi: { enabled: false },
    stochastic: { enabled: false },
  }), []);

  const latestCandleTime = candles.at(-1)?.time ?? Date.now();
  const statusLabel =
    status === "live" ? "Yahoo OHLCV" : status === "loading" ? "Loading" : "Fallback candles";

  return (
    <section className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm dark:border-[#30363d] dark:bg-[#161b22]">
      <div className="flex h-11 shrink-0 items-center justify-between gap-3 border-b border-zinc-200 px-3 dark:border-[#30363d]">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-zinc-950 dark:text-zinc-100">{asset}</p>
          <p className="text-xs text-zinc-500">Pane {id} / {timeframe} / {statusLabel}</p>
        </div>
        <CountdownToBarClose resolution={timeframe} latestTickTimestamp={latestCandleTime} />
      </div>

      <div className="relative min-h-0 flex-1 bg-white dark:bg-[#0d1117]">
        <LightweightTradingChart
          data={candles}
          theme={theme}
          candleOptions={{
            upColor: settings.bullColor,
            downColor: settings.bearColor,
            borderVisible: false,
            wickColor: settings.wickColor,
          }}
          indicatorSettings={indicatorSettings}
          showToolBadge={false}
          className="h-full min-h-0 rounded-none border-0 shadow-none"
        />

        {settings.sessionBreaks && (
          <div className="pointer-events-none absolute inset-y-0 right-1/3 border-l border-dashed border-zinc-300 dark:border-[#30363d]" />
        )}
      </div>
    </section>
  );
}

function ConfigModal({ open, onClose, settings, onChange }) {
  if (!open) return null;

  const update = (patch) => onChange({ ...settings, ...patch });

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/45 p-4 backdrop-blur-sm" role="dialog" aria-modal="true">
      <div className="w-full max-w-xl rounded-xl border border-zinc-200 bg-white shadow-2xl dark:border-[#30363d] dark:bg-[#161b22]">
        <div className="flex items-center justify-between border-b border-zinc-200 px-5 py-4 dark:border-[#30363d]">
          <h2 className="text-base font-semibold text-zinc-950 dark:text-zinc-100">Chart Configuration</h2>
          <button className="rounded px-2 py-1 text-sm text-zinc-500 hover:bg-zinc-100 dark:hover:bg-[#0d1117]" onClick={onClose}>
            Close
          </button>
        </div>

        <div className="grid gap-4 p-5 sm:grid-cols-2">
          <label className="flex items-center justify-between rounded-lg border border-zinc-200 px-3 py-2 dark:border-[#30363d]">
            <span className="text-sm text-zinc-700 dark:text-zinc-300">Session breaks</span>
            <input
              type="checkbox"
              checked={settings.sessionBreaks}
              onChange={(event) => update({ sessionBreaks: event.target.checked })}
              className="h-4 w-4 accent-emerald-500"
            />
          </label>

          <label className="space-y-1 text-sm">
            <span className="text-zinc-600 dark:text-zinc-400">Timezone</span>
            <select
              value={settings.timezone}
              onChange={(event) => update({ timezone: event.target.value })}
              className="h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-zinc-950 dark:border-[#30363d] dark:bg-[#0d1117] dark:text-zinc-100"
            >
              {TIMEZONES.map((zone) => (
                <option key={zone} value={zone}>{zone}</option>
              ))}
            </select>
          </label>

          <ColorInput label="Bull candle" value={settings.bullColor} onChange={(bullColor) => update({ bullColor })} />
          <ColorInput label="Bear candle" value={settings.bearColor} onChange={(bearColor) => update({ bearColor })} />
          <ColorInput label="Wick color" value={settings.wickColor} onChange={(wickColor) => update({ wickColor })} />

          <div className="sm:col-span-2 h-px bg-zinc-200 dark:bg-[#30363d]" />
        </div>
      </div>
    </div>
  );
}

function ColorInput({ label, value, onChange }) {
  return (
    <label className="flex items-center justify-between gap-3 rounded-lg border border-zinc-200 px-3 py-2 dark:border-[#30363d]">
      <span className="text-sm text-zinc-700 dark:text-zinc-300">{label}</span>
      <input
        type="color"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-8 w-12 rounded border border-zinc-200 bg-transparent dark:border-[#30363d]"
      />
    </label>
  );
}

export default function TradingWorkspace() {
  const [theme, setTheme] = useState("dark");
  const [timeframe, setTimeframe] = useState("15m");
  const [asset, setAsset] = useState("BTCUSD");
  const [layout, setLayout] = useState("single");
  const [modalOpen, setModalOpen] = useState(false);
  const [settings, setSettings] = useState({
    sessionBreaks: true,
    bullColor: "#10b981",
    bearColor: "#f43f5e",
    wickColor: "#94a3b8",
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
  });

  const panes = layout === "single" ? [1] : [1, 2];
  const gridClass =
    layout === "split-horizontal"
      ? "grid-cols-1 grid-rows-2"
      : layout === "split-vertical"
        ? "grid-cols-1 md:grid-cols-2 md:grid-rows-1"
        : "grid-cols-1 grid-rows-1";

  return (
    <div className={theme}>
      <div className="flex h-screen min-h-0 flex-col bg-zinc-50 text-zinc-950 dark:bg-[#0d1117] dark:text-zinc-100">
        <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-zinc-200 bg-white px-4 py-3 dark:border-[#30363d] dark:bg-[#161b22]">
          <div>
            <p className="text-sm font-bold tracking-[0.24em]">QUANTUM WORKSPACE</p>
            <p className="text-xs text-zinc-500">Independent chart matrix</p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select value={timeframe} onChange={(event) => setTimeframe(event.target.value)} className="h-10 rounded-lg border border-zinc-200 bg-white px-3 text-sm dark:border-[#30363d] dark:bg-[#0d1117]">
              {TIMEFRAMES.map((frame) => <option key={frame}>{frame}</option>)}
            </select>

            <select value={asset} onChange={(event) => setAsset(event.target.value)} className="h-10 rounded-lg border border-zinc-200 bg-white px-3 text-sm dark:border-[#30363d] dark:bg-[#0d1117]">
              {ASSETS.map((symbol) => <option key={symbol}>{symbol}</option>)}
            </select>

            <select value={layout} onChange={(event) => setLayout(event.target.value)} className="h-10 rounded-lg border border-zinc-200 bg-white px-3 text-sm dark:border-[#30363d] dark:bg-[#0d1117]">
              <option value="single">Single</option>
              <option value="split-horizontal">2 horizontal</option>
              <option value="split-vertical">2 vertical</option>
            </select>

            <button onClick={() => setTheme(theme === "dark" ? "light" : "dark")} className="h-10 rounded-lg border border-zinc-200 px-3 text-sm dark:border-[#30363d]">
              {theme === "dark" ? "Light" : "Dark"}
            </button>

            <button onClick={() => setModalOpen(true)} className="h-10 rounded-lg bg-zinc-950 px-4 text-sm font-semibold text-white dark:bg-zinc-100 dark:text-zinc-950">
              Configure
            </button>
          </div>
        </header>

        <main className={`grid min-h-0 flex-1 gap-3 p-3 ${gridClass}`}>
          {panes.map((paneId) => (
            <ChartPane
              key={`${layout}-${paneId}`}
              id={paneId}
              asset={asset}
              timeframe={timeframe}
              theme={theme}
              settings={settings}
            />
          ))}
        </main>
      </div>

      <ConfigModal open={modalOpen} onClose={() => setModalOpen(false)} settings={settings} onChange={setSettings} />
    </div>
  );
}
