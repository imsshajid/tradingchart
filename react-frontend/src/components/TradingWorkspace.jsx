import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  ArrowUpRight,
  BarChart3,
  CandlestickChart,
  Clock3,
  Crosshair,
  Gauge,
  LineChart,
  Maximize2,
  MousePointer2,
  Pause,
  Play,
  RotateCcw,
  Settings,
  SkipBack,
  SkipForward,
  Square,
  Trash2,
  Wifi,
  WifiOff,
} from "lucide-react";
import LightweightTradingChart from "./LightweightTradingChart.jsx";
import { useHyperliquidLive } from "../hooks/useHyperliquidLive.js";
import {
  ASSETS,
  TIMEFRAMES,
  buildVisibleReplayCandles,
  calculateChange,
  createFallbackCandles,
  fetchMarketHistory,
  formatCompactVolume,
  formatPrice,
  formatReplayTime,
  getAssetConfig,
  isHyperliquidAsset,
  mergeCandle,
  normalizeTimestamp,
  resolutionToSeconds,
  updateCandleFromTrade,
} from "../lib/marketData.js";

const DRAWING_TOOLS = [
  { id: "select", label: "Select", icon: MousePointer2 },
  { id: "trendline", label: "Trendline", icon: LineChart },
  { id: "horizontal-line", label: "Horizontal", icon: Crosshair },
  { id: "rectangle", label: "Rectangle", icon: Square },
  { id: "arrow", label: "Arrow", icon: ArrowUpRight },
  { id: "fib-retracement", label: "Fib", icon: Gauge },
];

const TIMEZONES =
  typeof Intl !== "undefined" && typeof Intl.supportedValuesOf === "function"
    ? Intl.supportedValuesOf("timeZone")
    : ["UTC", "America/New_York", "Europe/London", "Asia/Dhaka", "Asia/Tokyo"];

function formatRemaining(totalSeconds) {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;

  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function CountdownToBarClose({ resolution = "15m", latestTickTimestamp = Date.now() }) {
  const [nowSeconds, setNowSeconds] = useState(() => Math.floor(Date.now() / 1000));
  const intervalSeconds = useMemo(() => resolutionToSeconds(resolution), [resolution]);
  const tickSeconds = useMemo(() => normalizeTimestamp(latestTickTimestamp), [latestTickTimestamp]);
  const barOpen = Math.floor(tickSeconds / intervalSeconds) * intervalSeconds;
  const barClose = barOpen + intervalSeconds;
  const remaining = Math.max(0, barClose - nowSeconds);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNowSeconds(Math.floor(Date.now() / 1000));
    }, 1000);

    return () => window.clearInterval(timer);
  }, []);

  return (
    <div className="flex h-8 items-center gap-2 rounded border border-[#1f1f23] bg-[#09090b] px-2.5 font-mono text-[11px] text-zinc-300">
      <Clock3 className="h-3.5 w-3.5 text-zinc-500" aria-hidden="true" />
      <span className="text-zinc-500">BAR</span>
      <span className="inline-block min-w-[5ch] text-right tabular-nums text-zinc-100">
        {formatRemaining(remaining)}
      </span>
    </div>
  );
}

function IconButton({ active = false, disabled = false, label, icon: Icon, onClick }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={`grid h-9 w-9 place-items-center rounded border text-zinc-400 transition-none ${
        active
          ? "border-emerald-500/70 bg-emerald-500/10 text-emerald-300"
          : "border-transparent hover:border-[#1f1f23] hover:bg-[#111114] hover:text-zinc-100"
      } ${disabled ? "cursor-not-allowed opacity-35" : ""}`}
    >
      <Icon className="h-4 w-4" aria-hidden="true" />
    </button>
  );
}

function ConfigModal({ open, onClose, settings, onChange }) {
  if (!open) return null;

  const update = (patch) => onChange({ ...settings, ...patch });

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/55 p-4 backdrop-blur-sm" role="dialog" aria-modal="true">
      <div className="w-full max-w-xl rounded-lg border border-[#1f1f23] bg-[#0c0c0e] shadow-2xl">
        <div className="flex items-center justify-between border-b border-[#1f1f23] px-5 py-4">
          <h2 className="text-sm font-semibold text-zinc-100">Chart Configuration</h2>
          <button className="rounded border border-[#1f1f23] px-2.5 py-1 text-xs text-zinc-400 hover:text-zinc-100" onClick={onClose}>
            Close
          </button>
        </div>

        <div className="grid gap-4 p-5 sm:grid-cols-2">
          <label className="flex items-center justify-between rounded border border-[#1f1f23] px-3 py-2">
            <span className="text-sm text-zinc-300">Session breaks</span>
            <input
              type="checkbox"
              checked={settings.sessionBreaks}
              onChange={(event) => update({ sessionBreaks: event.target.checked })}
              className="h-4 w-4 accent-emerald-500"
            />
          </label>

          <label className="space-y-1 text-sm">
            <span className="text-zinc-500">Timezone</span>
            <select
              value={settings.timezone}
              onChange={(event) => update({ timezone: event.target.value })}
              className="h-10 w-full rounded border border-[#1f1f23] bg-[#09090b] px-3 text-zinc-100 outline-none"
            >
              {TIMEZONES.map((zone) => (
                <option key={zone} value={zone}>{zone}</option>
              ))}
            </select>
          </label>

          <ColorInput label="Bull candle" value={settings.bullColor} onChange={(bullColor) => update({ bullColor })} />
          <ColorInput label="Bear candle" value={settings.bearColor} onChange={(bearColor) => update({ bearColor })} />
          <ColorInput label="Wick color" value={settings.wickColor} onChange={(wickColor) => update({ wickColor })} />
        </div>
      </div>
    </div>
  );
}

function ColorInput({ label, value, onChange }) {
  return (
    <label className="flex items-center justify-between gap-3 rounded border border-[#1f1f23] px-3 py-2">
      <span className="text-sm text-zinc-300">{label}</span>
      <input
        type="color"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-8 w-12 rounded border border-[#1f1f23] bg-transparent"
      />
    </label>
  );
}

function ReplayStrip({ candles, replay, onReplayChange, onFit }) {
  const maxIndex = Math.max(0, candles.length - 1);
  const activeCandle = replay.enabled ? candles[replay.index] : candles[maxIndex];
  const progress = maxIndex === 0 ? 0 : ((replay.enabled ? replay.index : maxIndex) / maxIndex) * 100;

  useEffect(() => {
    if (!replay.enabled || replay.status !== "playing") return undefined;

    const timer = window.setInterval(() => {
      onReplayChange((current) => {
        if (!current.enabled) return current;
        const nextIndex = Math.min(maxIndex, current.index + 1);
        return {
          ...current,
          index: nextIndex,
          status: nextIndex >= maxIndex ? "paused" : "playing",
        };
      });
    }, Math.max(80, 1000 / replay.speed));

    return () => window.clearInterval(timer);
  }, [maxIndex, onReplayChange, replay.enabled, replay.speed, replay.status]);

  const startReplay = () => {
    onReplayChange({
      enabled: true,
      status: "paused",
      index: Math.max(0, Math.floor(candles.length * 0.35)),
      speed: replay.speed,
    });
    onFit();
  };

  const exitReplay = () => {
    onReplayChange((current) => ({
      ...current,
      enabled: false,
      status: "paused",
      index: maxIndex,
    }));
    onFit();
  };

  return (
    <div className="flex min-h-[54px] items-center gap-3 border-t border-[#1f1f23] bg-[#0c0c0e] px-3">
      <button
        type="button"
        onClick={replay.enabled ? exitReplay : startReplay}
        className={`h-9 rounded border px-3 text-xs font-semibold ${
          replay.enabled
            ? "border-rose-500/50 bg-rose-500/10 text-rose-200"
            : "border-[#1f1f23] bg-[#09090b] text-zinc-200 hover:text-white"
        }`}
      >
        {replay.enabled ? "Exit Replay" : "Replay"}
      </button>

      <div className="flex items-center gap-1">
        <IconButton
          label="Step Back"
          icon={SkipBack}
          disabled={!replay.enabled}
          onClick={() => onReplayChange((current) => ({ ...current, index: Math.max(0, current.index - 1), status: "paused" }))}
        />
        <IconButton
          label={replay.status === "playing" ? "Pause Replay" : "Play Replay"}
          icon={replay.status === "playing" ? Pause : Play}
          disabled={!replay.enabled}
          active={replay.enabled && replay.status === "playing"}
          onClick={() => onReplayChange((current) => ({ ...current, status: current.status === "playing" ? "paused" : "playing" }))}
        />
        <IconButton
          label="Step Forward"
          icon={SkipForward}
          disabled={!replay.enabled}
          onClick={() => onReplayChange((current) => ({ ...current, index: Math.min(maxIndex, current.index + 1), status: "paused" }))}
        />
        <IconButton
          label="Reset Replay"
          icon={RotateCcw}
          disabled={!replay.enabled}
          onClick={() => onReplayChange((current) => ({ ...current, index: 0, status: "paused" }))}
        />
      </div>

      <div className="min-w-0 flex-1">
        <input
          type="range"
          min="0"
          max={maxIndex}
          value={replay.enabled ? replay.index : maxIndex}
          disabled={!replay.enabled}
          onChange={(event) => onReplayChange((current) => ({ ...current, index: Number(event.target.value), status: "paused" }))}
          className="h-1 w-full accent-emerald-500"
          style={{ background: `linear-gradient(90deg, #10b981 ${progress}%, #1f1f23 ${progress}%)` }}
          aria-label="Replay playhead"
        />
      </div>

      <select
        value={replay.speed}
        disabled={!replay.enabled}
        onChange={(event) => onReplayChange((current) => ({ ...current, speed: Number(event.target.value) }))}
        className="h-9 rounded border border-[#1f1f23] bg-[#09090b] px-2 text-xs text-zinc-100 outline-none"
        aria-label="Replay speed"
      >
        <option value={0.5}>0.5x</option>
        <option value={1}>1x</option>
        <option value={2}>2x</option>
        <option value={4}>4x</option>
        <option value={8}>8x</option>
      </select>

      <div className="hidden min-w-[13rem] text-right font-mono text-[11px] text-zinc-500 md:block">
        {formatReplayTime(activeCandle?.time)} / {replay.enabled ? replay.index + 1 : candles.length} bars
      </div>
    </div>
  );
}

function ChartPane({
  paneId,
  symbol,
  resolution,
  theme,
  settings,
  activeTool,
  clearToolsSignal,
  onMarketSnapshot,
}) {
  const chartRef = useRef(null);
  const [candles, setCandles] = useState([]);
  const [marketSource, setMarketSource] = useState("loading");
  const [lastTick, setLastTick] = useState(null);
  const [fitToken, setFitToken] = useState(0);
  const [replay, setReplay] = useState({ enabled: false, status: "paused", index: 0, speed: 1 });
  const [indicators, setIndicators] = useState({
    ema: true,
    rsi: false,
    stochastic: false,
  });

  const refit = useCallback(() => setFitToken((value) => value + 1), []);

  useEffect(() => {
    const controller = new AbortController();

    async function loadCandles() {
      setMarketSource("loading");
      setReplay((current) => ({ ...current, enabled: false, status: "paused", index: 0 }));

      try {
        const payload = await fetchMarketHistory(symbol, resolution, controller.signal);
        setCandles(payload.data);
        setLastTick(payload.data[payload.data.length - 1] || null);
        setMarketSource(payload.source === "hyperliquid" ? "Hyperliquid" : "Yahoo");
        refit();
      } catch (error) {
        if (error.name === "AbortError") return;
        const fallback = createFallbackCandles(symbol, resolution);
        setCandles(fallback);
        setLastTick(fallback[fallback.length - 1] || null);
        setMarketSource("Fallback");
        refit();
      }
    }

    loadCandles();
    return () => controller.abort();
  }, [refit, resolution, symbol]);

  const handleLiveCandle = useCallback((candle) => {
    if (replay.enabled) return;
    setCandles((current) => mergeCandle(current, candle));
    setLastTick(candle);
  }, [replay.enabled]);

  const handleLiveTrade = useCallback((trade) => {
    if (replay.enabled) return;
    setCandles((current) => updateCandleFromTrade(current, trade, resolution));
    setLastTick((current) => ({
      ...(current || {}),
      time: trade.time,
      close: trade.price,
      volume: Number(current?.volume ?? 0) + Number(trade.size ?? 0),
    }));
  }, [replay.enabled, resolution]);

  const liveStatus = useHyperliquidLive({
    symbol,
    resolution,
    enabled: !replay.enabled && isHyperliquidAsset(symbol) && marketSource !== "loading",
    onCandle: handleLiveCandle,
    onTrade: handleLiveTrade,
  });

  useEffect(() => {
    if (clearToolsSignal > 0) {
      chartRef.current?.clearTools?.();
    }
  }, [clearToolsSignal]);

  useEffect(() => {
    setReplay((current) => ({
      ...current,
      index: Math.min(current.index, Math.max(0, candles.length - 1)),
    }));
  }, [candles.length]);

  const visibleCandles = useMemo(() => buildVisibleReplayCandles(candles, replay), [candles, replay]);
  const latestCandle = visibleCandles[visibleCandles.length - 1];
  const change = useMemo(() => calculateChange(visibleCandles), [visibleCandles]);
  const price = latestCandle?.close ?? lastTick?.close ?? 0;
  const liveLabel = replay.enabled
    ? "Replay"
    : isHyperliquidAsset(symbol)
      ? liveStatus === "live" ? "Live ticks" : liveStatus
      : "Delayed";

  const indicatorSettings = useMemo(() => ({
    ema: { enabled: indicators.ema, length: 21, source: "close", color: "#10b981" },
    rsi: { enabled: indicators.rsi, period: 14, source: "close", overbought: 70, oversold: 30, color: "#38bdf8" },
    stochastic: { enabled: indicators.stochastic, kPeriod: 14, dPeriod: 3, slowing: 3, kColor: "#a78bfa", dColor: "#f472b6" },
  }), [indicators]);

  useEffect(() => {
    onMarketSnapshot?.({
      symbol,
      source: marketSource,
      liveStatus: liveLabel,
      price,
      change,
      volume: latestCandle?.volume ?? 0,
      bars: visibleCandles.length,
    });
  }, [change, latestCandle?.volume, liveLabel, marketSource, onMarketSnapshot, price, symbol, visibleCandles.length]);

  return (
    <section className="flex min-h-0 min-w-0 flex-col overflow-hidden border border-[#1f1f23] bg-[#0c0c0e]">
      <div className="flex min-h-[54px] shrink-0 flex-wrap items-center justify-between gap-3 border-b border-[#1f1f23] px-3 py-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-mono text-sm font-bold text-zinc-100">{symbol}</span>
            <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${
              replay.enabled ? "bg-amber-500/10 text-amber-300" : liveStatus === "live" ? "bg-emerald-500/10 text-emerald-300" : "bg-zinc-500/10 text-zinc-400"
            }`}>
              {liveLabel}
            </span>
          </div>
          <p className="mt-0.5 text-xs text-zinc-500">Pane {paneId} / {resolution} / {marketSource}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="rounded border border-[#1f1f23] bg-[#09090b] px-2.5 py-1.5 text-right">
            <p className="font-mono text-sm font-semibold text-zinc-100">{formatPrice(price, symbol)}</p>
            <p className={`font-mono text-[11px] ${change.value >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
              {change.value >= 0 ? "+" : ""}{formatPrice(change.value, symbol)} / {change.percent.toFixed(2)}%
            </p>
          </div>
          <CountdownToBarClose resolution={resolution} latestTickTimestamp={latestCandle?.time ?? lastTick?.time ?? Date.now()} />
          <IconButton label="Fit Content" icon={Maximize2} onClick={refit} />
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        <div className="relative min-h-0 flex-1">
          <LightweightTradingChart
            ref={chartRef}
            data={visibleCandles}
            theme={theme}
            activeTool={activeTool}
            candleOptions={{
              upColor: settings.bullColor,
              downColor: settings.bearColor,
              borderVisible: false,
              wickColor: settings.wickColor,
            }}
            indicatorSettings={indicatorSettings}
            showToolBadge
            fitContentToken={fitToken}
            followLive={!replay.enabled}
            className="h-full min-h-0 rounded-none border-0 shadow-none"
          />

          {settings.sessionBreaks && (
            <div className="pointer-events-none absolute inset-y-0 right-1/3 border-l border-dashed border-zinc-700/60" />
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#1f1f23] bg-[#09090b] px-3 py-2">
        <div className="flex flex-wrap items-center gap-2">
          {[
            ["ema", "EMA"],
            ["rsi", "RSI"],
            ["stochastic", "STOCH"],
          ].map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setIndicators((current) => ({ ...current, [key]: !current[key] }))}
              className={`h-8 rounded border px-2.5 text-[11px] font-semibold ${
                indicators[key]
                  ? "border-emerald-500/60 bg-emerald-500/10 text-emerald-300"
                  : "border-[#1f1f23] text-zinc-500 hover:text-zinc-200"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3 font-mono text-[11px] text-zinc-500">
          <span>VOL {formatCompactVolume(latestCandle?.volume ?? 0)}</span>
          <span>BARS {visibleCandles.length}</span>
        </div>
      </div>

      <ReplayStrip candles={candles} replay={replay} onReplayChange={setReplay} onFit={refit} />
    </section>
  );
}

function DrawingToolbar({ activeTool, onToolChange, onClear }) {
  return (
    <aside className="flex w-12 shrink-0 flex-col items-center gap-1 border-r border-[#1f1f23] bg-[#09090b] py-3">
      {DRAWING_TOOLS.map((tool) => (
        <IconButton
          key={tool.id}
          label={tool.label}
          icon={tool.icon}
          active={activeTool === tool.id}
          onClick={() => onToolChange(tool.id)}
        />
      ))}
      <div className="my-1 h-px w-7 bg-[#1f1f23]" />
      <IconButton label="Clear Drawings" icon={Trash2} onClick={onClear} />
    </aside>
  );
}

function Watchlist({ activeSymbol, onSelect, snapshot }) {
  return (
    <aside className="hidden w-72 shrink-0 border-l border-[#1f1f23] bg-[#0c0c0e] xl:flex xl:flex-col">
      <div className="border-b border-[#1f1f23] px-4 py-3">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.22em] text-zinc-400">
          <BarChart3 className="h-4 w-4" aria-hidden="true" />
          Watchlist
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        {ASSETS.map((asset) => (
          <button
            key={asset.symbol}
            type="button"
            onClick={() => onSelect(asset.symbol)}
            className={`flex w-full items-center justify-between border-b border-[#1f1f23] px-4 py-3 text-left ${
              activeSymbol === asset.symbol ? "bg-emerald-500/7" : "hover:bg-[#111114]"
            }`}
          >
            <div>
              <p className="font-mono text-sm font-semibold text-zinc-100">{asset.symbol}</p>
              <p className="text-xs text-zinc-500">{asset.label}</p>
            </div>
            <span className={`rounded px-2 py-1 text-[10px] font-semibold uppercase ${
              asset.source === "Hyperliquid" ? "bg-emerald-500/10 text-emerald-300" : "bg-zinc-500/10 text-zinc-400"
            }`}>
              {asset.source}
            </span>
          </button>
        ))}
      </div>

      <div className="border-t border-[#1f1f23] p-4">
        <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">
          <Activity className="h-4 w-4" aria-hidden="true" />
          Market Tape
        </div>
        <dl className="space-y-2 text-sm">
          <TapeRow label="Symbol" value={snapshot.symbol || "--"} />
          <TapeRow label="Price" value={formatPrice(snapshot.price, snapshot.symbol)} />
          <TapeRow label="Source" value={snapshot.source || "--"} />
          <TapeRow label="Stream" value={snapshot.liveStatus || "--"} />
          <TapeRow label="Bars" value={String(snapshot.bars || 0)} />
        </dl>
      </div>
    </aside>
  );
}

function TapeRow({ label, value }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-xs text-zinc-500">{label}</dt>
      <dd className="font-mono text-xs text-zinc-200">{value}</dd>
    </div>
  );
}

export default function TradingWorkspace() {
  const [theme, setTheme] = useState("dark");
  const [resolution, setResolution] = useState("15m");
  const [symbol, setSymbol] = useState("BTCUSD");
  const [layout, setLayout] = useState("single");
  const [activeTool, setActiveTool] = useState("select");
  const [clearToolsSignal, setClearToolsSignal] = useState(0);
  const [modalOpen, setModalOpen] = useState(false);
  const [snapshot, setSnapshot] = useState({});
  const [settings, setSettings] = useState({
    sessionBreaks: false,
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
  const assetConfig = getAssetConfig(symbol);
  const isLiveCapable = isHyperliquidAsset(symbol);

  return (
    <div className={theme}>
      <div className="flex h-screen min-h-0 overflow-hidden bg-[#09090b] text-zinc-100">
        <DrawingToolbar
          activeTool={activeTool}
          onToolChange={setActiveTool}
          onClear={() => setClearToolsSignal((value) => value + 1)}
        />

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex min-h-[64px] shrink-0 flex-wrap items-center justify-between gap-3 border-b border-[#1f1f23] bg-[#0c0c0e] px-4 py-2">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <CandlestickChart className="h-5 w-5 text-emerald-400" aria-hidden="true" />
                <p className="font-mono text-sm font-bold uppercase tracking-[0.24em] text-zinc-100">QUANTUM TERMINAL</p>
              </div>
              <p className="mt-1 text-xs text-zinc-500">Live charting, replay, drawings, indicators</p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <select
                value={symbol}
                onChange={(event) => setSymbol(event.target.value)}
                className="h-10 rounded border border-[#1f1f23] bg-[#09090b] px-3 font-mono text-sm font-semibold text-zinc-100 outline-none"
                aria-label="Symbol"
              >
                {ASSETS.map((asset) => (
                  <option key={asset.symbol} value={asset.symbol}>{asset.symbol}</option>
                ))}
              </select>

              <div className="flex overflow-hidden rounded border border-[#1f1f23] bg-[#09090b]">
                {TIMEFRAMES.map((frame) => (
                  <button
                    key={frame}
                    type="button"
                    onClick={() => setResolution(frame)}
                    className={`h-10 px-3 text-xs font-semibold ${
                      resolution === frame ? "bg-zinc-100 text-zinc-950" : "text-zinc-400 hover:bg-[#111114] hover:text-zinc-100"
                    }`}
                  >
                    {frame}
                  </button>
                ))}
              </div>

              <select
                value={layout}
                onChange={(event) => setLayout(event.target.value)}
                className="h-10 rounded border border-[#1f1f23] bg-[#09090b] px-3 text-sm text-zinc-100 outline-none"
                aria-label="Layout"
              >
                <option value="single">Single</option>
                <option value="split-horizontal">2 horizontal</option>
                <option value="split-vertical">2 vertical</option>
              </select>

              <div className={`flex h-10 items-center gap-2 rounded border px-3 text-xs font-semibold ${
                isLiveCapable ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300" : "border-[#1f1f23] bg-[#09090b] text-zinc-400"
              }`}>
                {isLiveCapable ? <Wifi className="h-4 w-4" aria-hidden="true" /> : <WifiOff className="h-4 w-4" aria-hidden="true" />}
                {isLiveCapable ? "HYPERLIQUID LIVE" : `${assetConfig.source} DELAYED`}
              </div>

              <button
                type="button"
                onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                className="h-10 rounded border border-[#1f1f23] bg-[#09090b] px-3 text-sm text-zinc-200 hover:text-white"
              >
                {theme === "dark" ? "Light" : "Dark"}
              </button>

              <button
                type="button"
                onClick={() => setModalOpen(true)}
                className="grid h-10 w-10 place-items-center rounded border border-[#1f1f23] bg-[#09090b] text-zinc-300 hover:text-white"
                aria-label="Open settings"
                title="Settings"
              >
                <Settings className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          </header>

          <main className={`grid min-h-0 flex-1 gap-2 p-2 ${gridClass}`}>
            {panes.map((paneId) => (
              <ChartPane
                key={`${layout}-${paneId}-${symbol}-${resolution}`}
                paneId={paneId}
                symbol={symbol}
                resolution={resolution}
                theme={theme}
                settings={settings}
                activeTool={activeTool}
                clearToolsSignal={clearToolsSignal}
                onMarketSnapshot={paneId === 1 ? setSnapshot : undefined}
              />
            ))}
          </main>
        </div>

        <Watchlist activeSymbol={symbol} onSelect={setSymbol} snapshot={snapshot} />

        <ConfigModal open={modalOpen} onClose={() => setModalOpen(false)} settings={settings} onChange={setSettings} />
      </div>
    </div>
  );
}
