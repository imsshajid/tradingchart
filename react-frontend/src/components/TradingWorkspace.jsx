import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  ArrowUpRight,
  BarChart3,
  CandlestickChart,
  Clock3,
  Crosshair,
  Gauge,
  Layers,
  LineChart,
  Maximize2,
  MousePointer2,
  Pause,
  Play,
  RotateCcw,
  Settings,
  SkipBack,
  SkipForward,
  SlidersHorizontal,
  Square,
  Trash2,
  TrendingDown,
  TrendingUp,
  Wifi,
  WifiOff,
} from "lucide-react";
import LightweightTradingChart from "./LightweightTradingChart.jsx";
import { useHyperliquidLive } from "../hooks/useHyperliquidLive.js";
import { useWorkerMarketLive } from "../hooks/useWorkerMarketLive.js";
import {
  ASSETS,
  TIMEFRAMES,
  calculateChange,
  createFallbackCandles,
  fetchMarketHistory,
  formatCompactVolume,
  formatPrice,
  formatReplayTime,
  getAssetConfig,
  isHyperliquidAsset,
  isPollingAsset,
  isTickDbAsset,
  mergeCandle,
  normalizeTimestamp,
  resolutionToSeconds,
  updateCandleFromTrade,
} from "../lib/marketData.js";

const DRAWING_TOOLS = [
  { id: "cursor", label: "Move / Pan", shortLabel: "Move", icon: MousePointer2 },
  { id: "select", label: "Select Drawings", shortLabel: "Edit", icon: Crosshair },
  { id: "trendline", label: "Trendline", shortLabel: "Trend", icon: LineChart },
  { id: "ray", label: "Ray", shortLabel: "Ray", icon: ArrowUpRight },
  { id: "extended-line", label: "Extended Line", shortLabel: "Ext", icon: LineChart },
  { id: "horizontal-line", label: "Horizontal Line", shortLabel: "HLine", icon: Activity },
  { id: "horizontal-ray", label: "Horizontal Ray", shortLabel: "HRay", icon: ArrowUpRight },
  { id: "vertical-line", label: "Vertical Line", shortLabel: "VLine", icon: Activity },
  { id: "rectangle", label: "Rectangle", shortLabel: "Rect", icon: Square },
  { id: "arrow", label: "Arrow", shortLabel: "Arrow", icon: ArrowUpRight },
  { id: "fib-retracement", label: "Fib Retracement", shortLabel: "Fib", icon: Gauge },
  { id: "fib-extension", label: "Fib Extension", shortLabel: "FibX", icon: Gauge },
];

const TIMEZONE_OPTIONS = [
  { value: "Asia/Dhaka", label: "UTC+6 / Dhaka" },
  { value: "UTC", label: "UTC" },
  { value: "America/New_York", label: "New York" },
  { value: "Europe/London", label: "London" },
  { value: "Asia/Tokyo", label: "Tokyo" },
  { value: "Asia/Singapore", label: "Singapore" },
];

const INITIAL_PANES = [
  { id: 1, symbol: "BTCUSD", resolution: "1m" },
  { id: 2, symbol: "BTCUSD", resolution: "5m" },
  { id: 3, symbol: "ETHUSD", resolution: "15m" },
  { id: 4, symbol: "SOLUSD", resolution: "15m" },
  { id: 5, symbol: "XAUUSD", resolution: "1h" },
  { id: 6, symbol: "USTECH", resolution: "1h" },
  { id: 7, symbol: "USOIL", resolution: "4h" },
  { id: 8, symbol: "EURUSD", resolution: "1D" },
];

const DRAWING_INSTRUCTIONS = {
  trendline: "Trendline: click start, then click end.",
  ray: "Ray: click anchor, then direction.",
  "extended-line": "Extended line: click two points.",
  "horizontal-line": "Horizontal line: click price level.",
  "horizontal-ray": "Horizontal ray: click start level.",
  "vertical-line": "Vertical line: click timestamp.",
  rectangle: "Rectangle: click first corner, then opposite corner.",
  arrow: "Arrow: click tail, then head.",
  "fib-retracement": "Fib retracement: click swing high/low pair.",
  "fib-extension": "Fib extension: click start, end, then projection anchor.",
};

const WORKSPACE_STORAGE_KEY = "quantum-terminal.workspace.v2";
const EMPTY_DRAWINGS = [];
const DEFAULT_FIB_LEVELS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1, 1.618].map((value) => ({
  value,
  visible: true,
  color: "#38bdf8",
  label: "",
}));

const DEFAULT_SETTINGS = {
  sessionBreaks: false,
  timezone: "Asia/Dhaka",
  bullColor: "#10b981",
  bearColor: "#f43f5e",
  wickColor: "#94a3b8",
  chart: {
    gridVisible: true,
    verticalGridVisible: true,
    horizontalGridVisible: true,
    crosshairVisible: true,
    barSpacing: 6,
    rightOffset: 8,
  },
  volume: {
    visible: true,
    heightRatio: 0.22,
    opacity: 0.38,
    upColor: "#10b981",
    downColor: "#f43f5e",
  },
  drawings: {
    keepDrawingMode: false,
    color: "#f8fafc",
    lineWidth: 2,
    fillColor: "#60a5fa",
    fillOpacity: 0.14,
    zoneColor: "#60a5fa",
    zoneOpacity: 0.16,
    fibColor: "#38bdf8",
    fibLabelColor: "#bae6fd",
    fibFillColor: "#38bdf8",
    fibFillOpacity: 0.08,
    targetColor: "#10b981",
    stopColor: "#f43f5e",
    fibLevels: DEFAULT_FIB_LEVELS,
  },
  indicators: {
    sma: { enabled: false, length: 50, source: "close", color: "#f8fafc" },
    ema: { enabled: true, length: 21, source: "close", color: "#10b981" },
    rsi: { enabled: false, period: 14, source: "close", overbought: 70, oversold: 30, color: "#38bdf8" },
    stochastic: { enabled: false, kPeriod: 14, dPeriod: 3, slowing: 3, kColor: "#a78bfa", dColor: "#f472b6" },
    fvg: {
      enabled: true,
      minGapPercent: 0,
      extendBars: 18,
      bullColor: "#10b981",
      bearColor: "#f43f5e",
      opacity: 0.16,
    },
  },
};

function mergeSettings(saved = {}) {
  return {
    ...DEFAULT_SETTINGS,
    ...saved,
    chart: { ...DEFAULT_SETTINGS.chart, ...saved.chart },
    volume: { ...DEFAULT_SETTINGS.volume, ...saved.volume },
    drawings: {
      ...DEFAULT_SETTINGS.drawings,
      ...saved.drawings,
      fibLevels: Array.isArray(saved.drawings?.fibLevels) && saved.drawings.fibLevels.length
        ? saved.drawings.fibLevels
        : DEFAULT_SETTINGS.drawings.fibLevels,
    },
    indicators: {
      sma: { ...DEFAULT_SETTINGS.indicators.sma, ...saved.indicators?.sma },
      ema: { ...DEFAULT_SETTINGS.indicators.ema, ...saved.indicators?.ema },
      rsi: { ...DEFAULT_SETTINGS.indicators.rsi, ...saved.indicators?.rsi },
      stochastic: { ...DEFAULT_SETTINGS.indicators.stochastic, ...saved.indicators?.stochastic },
      fvg: { ...DEFAULT_SETTINGS.indicators.fvg, ...saved.indicators?.fvg },
    },
  };
}

function loadWorkspaceState() {
  if (typeof window === "undefined") return {};

  try {
    return JSON.parse(window.localStorage.getItem(WORKSPACE_STORAGE_KEY) || "{}");
  } catch {
    return {};
  }
}

function sanitizeDrawingsByPane(value) {
  if (!value || typeof value !== "object") return {};

  return Object.fromEntries(
    Object.entries(value)
      .filter(([, drawings]) => Array.isArray(drawings))
      .map(([paneId, drawings]) => [paneId, drawings]),
  );
}

function colorInputValue(value, fallback = "#ffffff") {
  const color = String(value || "").trim();
  if (/^#[0-9a-f]{6}$/i.test(color)) return color;
  if (/^#[0-9a-f]{3}$/i.test(color)) {
    return `#${color.slice(1).split("").map((char) => char + char).join("")}`;
  }

  const rgb = color.match(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i);
  if (!rgb) return fallback;

  return `#${[rgb[1], rgb[2], rgb[3]].map((part) => (
    Math.max(0, Math.min(255, Math.round(Number(part) || 0))).toString(16).padStart(2, "0")
  )).join("")}`;
}

function rgbaFromHex(hex, alpha) {
  const clean = colorInputValue(hex).slice(1);
  const r = Number.parseInt(clean.slice(0, 2), 16);
  const g = Number.parseInt(clean.slice(2, 4), 16);
  const b = Number.parseInt(clean.slice(4, 6), 16);
  const safeAlpha = Math.max(0, Math.min(1, Number(alpha) || 0));

  return `rgba(${r}, ${g}, ${b}, ${safeAlpha})`;
}

function formatRemaining(totalSeconds) {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;

  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function findCandleAtOrBefore(candles, timestamp) {
  if (!candles.length || timestamp == null) return null;

  let low = 0;
  let high = candles.length - 1;
  let answer = null;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    if (candles[mid].time <= timestamp) {
      answer = candles[mid];
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  return answer;
}

function indexAtOrBefore(candles, timestamp) {
  if (!candles.length || timestamp == null) return -1;

  let low = 0;
  let high = candles.length - 1;
  let answer = -1;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    if (candles[mid].time <= timestamp) {
      answer = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  return answer;
}

function visibleCandlesForReplay(candles, replay) {
  if (!replay.enabled || !replay.playhead) return candles;
  const index = indexAtOrBefore(candles, replay.playhead);
  return index >= 0 ? candles.slice(0, index + 1) : [];
}

function getLayoutClass(count, splitMode = "vertical") {
  if (count === 1) return "grid-cols-1 grid-rows-1";
  if (count === 2) {
    return splitMode === "horizontal"
      ? "grid-cols-1 grid-rows-2"
      : "grid-cols-1 md:grid-cols-2 md:grid-rows-1";
  }
  if (count === 4) return "grid-cols-1 md:grid-cols-2 md:grid-rows-2";
  if (count === 6) return "grid-cols-1 md:grid-cols-2 xl:grid-cols-3 xl:grid-rows-2";
  return "grid-cols-1 md:grid-cols-2 xl:grid-cols-4 xl:grid-rows-2";
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

function IconButton({ active = false, disabled = false, label, shortLabel, icon: Icon, onClick }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={`grid place-items-center rounded border text-zinc-400 transition-none ${
        shortLabel ? "h-11 w-12 py-1" : "h-9 w-9"
      } ${
        active
          ? "border-emerald-500/70 bg-emerald-500/10 text-emerald-300"
          : "border-transparent hover:border-[#1f1f23] hover:bg-[#111114] hover:text-zinc-100"
      } ${disabled ? "cursor-not-allowed opacity-35" : ""}`}
    >
      <Icon className="h-4 w-4" aria-hidden="true" />
      {shortLabel && <span className="mt-0.5 text-[8px] font-semibold leading-none">{shortLabel}</span>}
    </button>
  );
}

function FormRow({ label, children }) {
  return (
    <label className="grid gap-1.5 text-xs text-zinc-500">
      <span>{label}</span>
      {children}
    </label>
  );
}

function CheckboxRow({ label, checked, onChange }) {
  return (
    <label className="flex h-9 items-center justify-between gap-3 rounded border border-[#1f1f23] bg-[#09090b] px-3 text-xs text-zinc-300">
      <span>{label}</span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="h-4 w-4 accent-emerald-500"
      />
    </label>
  );
}

function NumberInput({ value, onChange, min, max, step = 1 }) {
  return (
    <input
      value={value}
      min={min}
      max={max}
      step={step}
      onChange={(event) => onChange(Number(event.target.value))}
      type="number"
      className="h-9 rounded border border-[#1f1f23] bg-[#09090b] px-2 text-xs text-zinc-100 outline-none"
    />
  );
}

function ConfigModal({
  open,
  onClose,
  settings,
  onChange,
  selectedDrawing,
  onSelectedDrawingChange,
}) {
  const [tab, setTab] = useState("chart");
  if (!open) return null;

  const update = (patch) => onChange({ ...settings, ...patch });
  const updateChart = (patch) => update({ chart: { ...settings.chart, ...patch } });
  const updateVolume = (patch) => update({ volume: { ...settings.volume, ...patch } });
  const updateDrawings = (patch) => update({ drawings: { ...settings.drawings, ...patch } });
  const updateIndicator = (name, patch) => update({
    indicators: {
      ...settings.indicators,
      [name]: { ...settings.indicators[name], ...patch },
    },
  });
  const updateFibLevel = (index, patch) => {
    updateDrawings({
      fibLevels: settings.drawings.fibLevels.map((level, levelIndex) => (
        levelIndex === index ? { ...level, ...patch } : level
      )),
    });
  };
  const removeFibLevel = (index) => {
    updateDrawings({
      fibLevels: settings.drawings.fibLevels.filter((_, levelIndex) => levelIndex !== index),
    });
  };
  const addFibLevel = () => {
    updateDrawings({
      fibLevels: [
        ...settings.drawings.fibLevels,
        { value: 0.705, visible: true, color: settings.drawings.fibColor, label: "" },
      ].sort((a, b) => Number(a.value) - Number(b.value)),
    });
  };
  const selectedTool = selectedDrawing?.tool || null;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/55 p-4 backdrop-blur-sm" role="dialog" aria-modal="true">
      <div className="flex max-h-[86vh] w-full max-w-4xl flex-col overflow-hidden rounded-lg border border-[#1f1f23] bg-[#0c0c0e] shadow-2xl">
        <div className="flex items-center justify-between border-b border-[#1f1f23] px-5 py-4">
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="h-4 w-4 text-emerald-400" aria-hidden="true" />
            <h2 className="text-sm font-semibold text-zinc-100">Chart Settings</h2>
          </div>
          <button className="rounded border border-[#1f1f23] px-2.5 py-1 text-xs text-zinc-400 hover:text-zinc-100" onClick={onClose}>
            Close
          </button>
        </div>

        <div className="flex border-b border-[#1f1f23] px-4">
          {[
            ["chart", "Chart"],
            ["volume", "Volume"],
            ["drawings", "Drawings"],
            ["indicators", "Indicators"],
            ["time", "Time"],
          ].map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={`h-11 px-4 text-xs font-semibold ${tab === key ? "text-emerald-300" : "text-zinc-500 hover:text-zinc-200"}`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="overflow-auto p-5">
          {tab === "chart" && (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <CheckboxRow label="Grid" checked={settings.chart.gridVisible} onChange={(gridVisible) => updateChart({ gridVisible })} />
              <CheckboxRow label="Vertical grid" checked={settings.chart.verticalGridVisible} onChange={(verticalGridVisible) => updateChart({ verticalGridVisible })} />
              <CheckboxRow label="Horizontal grid" checked={settings.chart.horizontalGridVisible} onChange={(horizontalGridVisible) => updateChart({ horizontalGridVisible })} />
              <CheckboxRow label="Crosshair" checked={settings.chart.crosshairVisible} onChange={(crosshairVisible) => updateChart({ crosshairVisible })} />
              <CheckboxRow label="Session marker" checked={settings.sessionBreaks} onChange={(sessionBreaks) => update({ sessionBreaks })} />
              <FormRow label="Bar spacing">
                <input type="range" min="2" max="18" value={settings.chart.barSpacing} onChange={(event) => updateChart({ barSpacing: Number(event.target.value) })} className="accent-emerald-500" />
              </FormRow>
              <FormRow label="Right offset">
                <input type="range" min="0" max="40" value={settings.chart.rightOffset} onChange={(event) => updateChart({ rightOffset: Number(event.target.value) })} className="accent-emerald-500" />
              </FormRow>
              <ColorInput label="Bull candle" value={settings.bullColor} onChange={(bullColor) => update({ bullColor })} />
              <ColorInput label="Bear candle" value={settings.bearColor} onChange={(bearColor) => update({ bearColor })} />
              <ColorInput label="Wick color" value={settings.wickColor} onChange={(wickColor) => update({ wickColor })} />
            </div>
          )}

          {tab === "volume" && (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <CheckboxRow label="Show volume" checked={settings.volume.visible} onChange={(visible) => updateVolume({ visible })} />
              <FormRow label={`Height ${(settings.volume.heightRatio * 100).toFixed(0)}%`}>
                <input type="range" min="0.08" max="0.42" step="0.01" value={settings.volume.heightRatio} onChange={(event) => updateVolume({ heightRatio: Number(event.target.value) })} className="accent-emerald-500" />
              </FormRow>
              <FormRow label={`Opacity ${(settings.volume.opacity * 100).toFixed(0)}%`}>
                <input type="range" min="0.08" max="1" step="0.02" value={settings.volume.opacity} onChange={(event) => updateVolume({ opacity: Number(event.target.value) })} className="accent-emerald-500" />
              </FormRow>
              <ColorInput label="Volume up" value={settings.volume.upColor} onChange={(upColor) => updateVolume({ upColor })} />
              <ColorInput label="Volume down" value={settings.volume.downColor} onChange={(downColor) => updateVolume({ downColor })} />
            </div>
          )}

          {tab === "drawings" && (
            <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(22rem,0.9fr)]">
              <div className="grid gap-5">
                <section className="grid gap-3 rounded border border-[#1f1f23] bg-[#09090b] p-3">
                  <h3 className="font-mono text-xs font-semibold uppercase tracking-[0.16em] text-zinc-300">Defaults</h3>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    <CheckboxRow
                      label="Keep drawing"
                      checked={settings.drawings.keepDrawingMode}
                      onChange={(keepDrawingMode) => updateDrawings({ keepDrawingMode })}
                    />
                    <ColorInput label="Line color" value={settings.drawings.color} onChange={(color) => updateDrawings({ color })} />
                    <FormRow label="Line width">
                      <NumberInput value={settings.drawings.lineWidth} min={1} max={8} onChange={(lineWidth) => updateDrawings({ lineWidth })} />
                    </FormRow>
                    <ColorInput label="Fill color" value={settings.drawings.fillColor} onChange={(fillColor) => updateDrawings({ fillColor })} />
                    <FormRow label={`Fill opacity ${(settings.drawings.fillOpacity * 100).toFixed(0)}%`}>
                      <input type="range" min="0" max="0.8" step="0.02" value={settings.drawings.fillOpacity} onChange={(event) => updateDrawings({ fillOpacity: Number(event.target.value) })} className="accent-emerald-500" />
                    </FormRow>
                    <ColorInput label="Zone color" value={settings.drawings.zoneColor} onChange={(zoneColor) => updateDrawings({ zoneColor })} />
                    <FormRow label={`Zone opacity ${(settings.drawings.zoneOpacity * 100).toFixed(0)}%`}>
                      <input type="range" min="0" max="0.8" step="0.02" value={settings.drawings.zoneOpacity} onChange={(event) => updateDrawings({ zoneOpacity: Number(event.target.value) })} className="accent-emerald-500" />
                    </FormRow>
                    <ColorInput label="Target" value={settings.drawings.targetColor} onChange={(targetColor) => updateDrawings({ targetColor })} />
                    <ColorInput label="Stop" value={settings.drawings.stopColor} onChange={(stopColor) => updateDrawings({ stopColor })} />
                  </div>
                </section>

                <section className="grid gap-3 rounded border border-[#1f1f23] bg-[#09090b] p-3">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="font-mono text-xs font-semibold uppercase tracking-[0.16em] text-zinc-300">Fibonacci</h3>
                    <button type="button" onClick={addFibLevel} className="h-8 rounded border border-[#1f1f23] px-3 text-xs font-semibold text-zinc-300 hover:text-white">
                      Add Level
                    </button>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <ColorInput label="Fib line" value={settings.drawings.fibColor} onChange={(fibColor) => updateDrawings({ fibColor })} />
                    <ColorInput label="Fib labels" value={settings.drawings.fibLabelColor} onChange={(fibLabelColor) => updateDrawings({ fibLabelColor })} />
                    <ColorInput label="Fib fill" value={settings.drawings.fibFillColor} onChange={(fibFillColor) => updateDrawings({ fibFillColor })} />
                    <FormRow label={`Fib fill ${(settings.drawings.fibFillOpacity * 100).toFixed(0)}%`}>
                      <input type="range" min="0" max="0.6" step="0.02" value={settings.drawings.fibFillOpacity} onChange={(event) => updateDrawings({ fibFillOpacity: Number(event.target.value) })} className="accent-emerald-500" />
                    </FormRow>
                  </div>
                  <div className="grid gap-2">
                    {settings.drawings.fibLevels.map((level, index) => (
                      <div key={`${level.value}-${index}`} className="grid gap-2 rounded border border-[#1f1f23] bg-[#0c0c0e] p-2 sm:grid-cols-[auto_minmax(5rem,0.6fr)_minmax(6rem,1fr)_auto_auto] sm:items-center">
                        <input
                          type="checkbox"
                          checked={level.visible !== false}
                          onChange={(event) => updateFibLevel(index, { visible: event.target.checked })}
                          className="h-4 w-4 accent-emerald-500"
                          aria-label="Toggle fib level"
                        />
                        <NumberInput value={level.value} min={-5} max={5} step={0.001} onChange={(value) => updateFibLevel(index, { value })} />
                        <input
                          value={level.label || ""}
                          onChange={(event) => updateFibLevel(index, { label: event.target.value })}
                          placeholder={`${Number(level.value * 100).toFixed(1)}%`}
                          className="h-9 rounded border border-[#1f1f23] bg-[#09090b] px-2 text-xs text-zinc-100 outline-none"
                        />
                        <input
                          type="color"
                          value={colorInputValue(level.color || settings.drawings.fibColor)}
                          onChange={(event) => updateFibLevel(index, { color: event.target.value })}
                          className="h-7 w-10 rounded border border-[#1f1f23] bg-transparent"
                          aria-label="Fib level color"
                        />
                        <button type="button" onClick={() => removeFibLevel(index)} className="h-8 rounded border border-[#1f1f23] px-2 text-xs text-zinc-500 hover:text-rose-300">
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                </section>
              </div>

              <section className="grid content-start gap-3 rounded border border-[#1f1f23] bg-[#09090b] p-3">
                <h3 className="font-mono text-xs font-semibold uppercase tracking-[0.16em] text-zinc-300">Selected Drawing</h3>
                {selectedTool ? (
                  <div className="grid gap-3">
                    <div className="rounded border border-[#1f1f23] bg-[#0c0c0e] px-3 py-2 font-mono text-xs text-zinc-300">
                      Pane {selectedDrawing.paneId} / {selectedTool.type}
                    </div>
                    <ColorInput label="Line color" value={selectedTool.color || settings.drawings.color} onChange={(color) => onSelectedDrawingChange?.({ color })} />
                    <FormRow label="Line width">
                      <NumberInput
                        value={selectedTool.lineWidth || settings.drawings.lineWidth}
                        min={1}
                        max={8}
                        onChange={(lineWidth) => onSelectedDrawingChange?.({ lineWidth })}
                      />
                    </FormRow>
                    {(selectedTool.type === "rectangle" || selectedTool.type === "position") && (
                      <ColorInput
                        label="Zone color"
                        value={selectedTool.color || settings.drawings.zoneColor}
                        onChange={(color) => onSelectedDrawingChange?.({
                          color,
                          fill: rgbaFromHex(color, settings.drawings.zoneOpacity),
                        })}
                      />
                    )}
                    {(selectedTool.type === "fib-retracement" || selectedTool.type === "fib-extension") && (
                      <>
                        <ColorInput label="Label color" value={selectedTool.labelColor || settings.drawings.fibLabelColor} onChange={(labelColor) => onSelectedDrawingChange?.({ labelColor })} />
                        <ColorInput
                          label="Fib fill"
                          value={selectedTool.fill || settings.drawings.fibFillColor}
                          onChange={(fillColor) => onSelectedDrawingChange?.({
                            fill: rgbaFromHex(fillColor, settings.drawings.fibFillOpacity),
                          })}
                        />
                      </>
                    )}
                  </div>
                ) : (
                  <div className="rounded border border-[#1f1f23] bg-[#0c0c0e] p-3 text-xs leading-5 text-zinc-500">
                    Use the edit tool, select a drawing, then adjust its properties here.
                  </div>
                )}
              </section>
            </div>
          )}

          {tab === "indicators" && (
            <div className="grid gap-5 lg:grid-cols-2 xl:grid-cols-5">
              <IndicatorCard title="SMA">
                <CheckboxRow label="Enabled" checked={settings.indicators.sma.enabled} onChange={(enabled) => updateIndicator("sma", { enabled })} />
                <FormRow label="Length"><NumberInput value={settings.indicators.sma.length} min={1} max={500} onChange={(length) => updateIndicator("sma", { length })} /></FormRow>
                <FormRow label="Source">
                  <select value={settings.indicators.sma.source} onChange={(event) => updateIndicator("sma", { source: event.target.value })} className="h-9 rounded border border-[#1f1f23] bg-[#09090b] px-2 text-xs text-zinc-100 outline-none">
                    {["close", "open", "high", "low", "hl2", "hlc3", "ohlc4"].map((source) => <option key={source}>{source}</option>)}
                  </select>
                </FormRow>
                <ColorInput label="Color" value={settings.indicators.sma.color} onChange={(color) => updateIndicator("sma", { color })} />
              </IndicatorCard>

              <IndicatorCard title="EMA">
                <CheckboxRow label="Enabled" checked={settings.indicators.ema.enabled} onChange={(enabled) => updateIndicator("ema", { enabled })} />
                <FormRow label="Length"><NumberInput value={settings.indicators.ema.length} min={1} max={400} onChange={(length) => updateIndicator("ema", { length })} /></FormRow>
                <FormRow label="Source">
                  <select value={settings.indicators.ema.source} onChange={(event) => updateIndicator("ema", { source: event.target.value })} className="h-9 rounded border border-[#1f1f23] bg-[#09090b] px-2 text-xs text-zinc-100 outline-none">
                    {["close", "open", "high", "low", "hl2", "hlc3", "ohlc4"].map((source) => <option key={source}>{source}</option>)}
                  </select>
                </FormRow>
                <ColorInput label="Color" value={settings.indicators.ema.color} onChange={(color) => updateIndicator("ema", { color })} />
              </IndicatorCard>

              <IndicatorCard title="RSI">
                <CheckboxRow label="Enabled" checked={settings.indicators.rsi.enabled} onChange={(enabled) => updateIndicator("rsi", { enabled })} />
                <FormRow label="Period"><NumberInput value={settings.indicators.rsi.period} min={2} max={100} onChange={(period) => updateIndicator("rsi", { period })} /></FormRow>
                <FormRow label="Overbought"><NumberInput value={settings.indicators.rsi.overbought} min={50} max={100} onChange={(overbought) => updateIndicator("rsi", { overbought })} /></FormRow>
                <FormRow label="Oversold"><NumberInput value={settings.indicators.rsi.oversold} min={0} max={50} onChange={(oversold) => updateIndicator("rsi", { oversold })} /></FormRow>
                <ColorInput label="Color" value={settings.indicators.rsi.color} onChange={(color) => updateIndicator("rsi", { color })} />
              </IndicatorCard>

              <IndicatorCard title="Stochastic">
                <CheckboxRow label="Enabled" checked={settings.indicators.stochastic.enabled} onChange={(enabled) => updateIndicator("stochastic", { enabled })} />
                <FormRow label="%K"><NumberInput value={settings.indicators.stochastic.kPeriod} min={2} max={100} onChange={(kPeriod) => updateIndicator("stochastic", { kPeriod })} /></FormRow>
                <FormRow label="%D"><NumberInput value={settings.indicators.stochastic.dPeriod} min={1} max={50} onChange={(dPeriod) => updateIndicator("stochastic", { dPeriod })} /></FormRow>
                <FormRow label="Slowing"><NumberInput value={settings.indicators.stochastic.slowing} min={1} max={50} onChange={(slowing) => updateIndicator("stochastic", { slowing })} /></FormRow>
                <ColorInput label="%K color" value={settings.indicators.stochastic.kColor} onChange={(kColor) => updateIndicator("stochastic", { kColor })} />
                <ColorInput label="%D color" value={settings.indicators.stochastic.dColor} onChange={(dColor) => updateIndicator("stochastic", { dColor })} />
              </IndicatorCard>

              <IndicatorCard title="FVG">
                <CheckboxRow label="Enabled" checked={settings.indicators.fvg.enabled} onChange={(enabled) => updateIndicator("fvg", { enabled })} />
                <FormRow label="Min gap %"><NumberInput value={settings.indicators.fvg.minGapPercent} min={0} max={10} step={0.05} onChange={(minGapPercent) => updateIndicator("fvg", { minGapPercent })} /></FormRow>
                <FormRow label="Extend bars"><NumberInput value={settings.indicators.fvg.extendBars} min={1} max={200} onChange={(extendBars) => updateIndicator("fvg", { extendBars })} /></FormRow>
                <ColorInput label="Bull zone" value={settings.indicators.fvg.bullColor} onChange={(bullColor) => updateIndicator("fvg", { bullColor })} />
                <ColorInput label="Bear zone" value={settings.indicators.fvg.bearColor} onChange={(bearColor) => updateIndicator("fvg", { bearColor })} />
                <FormRow label={`Opacity ${(settings.indicators.fvg.opacity * 100).toFixed(0)}%`}>
                  <input type="range" min="0.04" max="0.5" step="0.02" value={settings.indicators.fvg.opacity} onChange={(event) => updateIndicator("fvg", { opacity: Number(event.target.value) })} className="accent-emerald-500" />
                </FormRow>
                <div className="rounded border border-[#1f1f23] bg-[#0c0c0e] p-2 text-[11px] leading-4 text-zinc-500">
                  Bullish and bearish gaps are drawn as non-interactive chart zones behind your drawings.
                </div>
              </IndicatorCard>
            </div>
          )}

          {tab === "time" && (
            <div className="grid gap-4 sm:grid-cols-2">
              <FormRow label="Timezone">
                <select value={settings.timezone} onChange={(event) => update({ timezone: event.target.value })} className="h-10 rounded border border-[#1f1f23] bg-[#09090b] px-3 text-sm text-zinc-100 outline-none">
                  {TIMEZONE_OPTIONS.map((zone) => (
                    <option key={zone.value} value={zone.value}>{zone.label}</option>
                  ))}
                </select>
              </FormRow>
              <div className="rounded border border-[#1f1f23] bg-[#09090b] p-3 text-xs leading-5 text-zinc-400">
                Chart timestamps remain synchronized in absolute UNIX time. Labels and replay readouts are formatted in the selected timezone.
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function IndicatorCard({ title, children }) {
  return (
    <section className="grid gap-3 rounded border border-[#1f1f23] bg-[#09090b] p-3">
      <h3 className="font-mono text-xs font-semibold uppercase tracking-[0.16em] text-zinc-300">{title}</h3>
      {children}
    </section>
  );
}

function ColorInput({ label, value, onChange }) {
  return (
    <label className="flex h-9 items-center justify-between gap-3 rounded border border-[#1f1f23] bg-[#09090b] px-3">
      <span className="text-xs text-zinc-400">{label}</span>
      <input
        type="color"
        value={colorInputValue(value)}
        onChange={(event) => onChange(event.target.value)}
        className="h-6 w-10 rounded border border-[#1f1f23] bg-transparent"
      />
    </label>
  );
}

function DrawingToolbar({ activeTool, onToolChange, onClear }) {
  return (
    <aside className="flex w-16 shrink-0 flex-col items-center gap-1 overflow-y-auto border-r border-[#1f1f23] bg-[#09090b] py-3">
      {DRAWING_TOOLS.map((tool) => (
        <IconButton
          key={tool.id}
          label={tool.label}
          shortLabel={tool.shortLabel}
          icon={tool.icon}
          active={activeTool === tool.id}
          onClick={() => onToolChange(tool.id)}
        />
      ))}
      <div className="my-1 h-px w-10 bg-[#1f1f23]" />
      <IconButton label="Clear Drawings" shortLabel="Clear" icon={Trash2} onClick={onClear} />
    </aside>
  );
}

function ChartPane({
  config,
  paneCount,
  active,
  settings,
  paneDrawings,
  activeTool,
  clearToolsSignal,
  replay,
  onActivate,
  onToolChange,
  onToolsChange,
  onSelectedToolChange,
  onConfigChange,
  onCandlesChange,
  onMarketSnapshot,
  onReplayPick,
}) {
  const chartRef = useRef(null);
  const [candles, setCandles] = useState([]);
  const [marketSource, setMarketSource] = useState("loading");
  const [lastTick, setLastTick] = useState(null);
  const [fitToken, setFitToken] = useState(0);
  const [pollStatus, setPollStatus] = useState("idle");
  const [autoFollow, setAutoFollow] = useState(false);

  const compact = paneCount >= 4;
  const refit = useCallback(() => setFitToken((value) => value + 1), []);
  const handleVisibleRangeChange = useCallback((range) => {
    if (!autoFollow || !range || !Number.isFinite(range.to)) return;

    const lastIndex = visibleCandlesForReplay(candles, replay).length - 1;
    if (lastIndex > 0 && range.to < lastIndex - 1.5) {
      setAutoFollow(false);
    }
  }, [autoFollow, candles, replay]);

  useEffect(() => {
    const controller = new AbortController();

    async function loadCandles() {
      setMarketSource("loading");

      try {
        const payload = await fetchMarketHistory(config.symbol, config.resolution, controller.signal);
        setCandles(payload.data);
        setLastTick(payload.data[payload.data.length - 1] || null);
        setMarketSource(payload.source === "hyperliquid" ? "Hyperliquid" : isTickDbAsset(config.symbol) ? "TickDB" : "Yahoo Poll");
        setPollStatus(isPollingAsset(config.symbol) ? "live" : "idle");
        refit();
      } catch (error) {
        if (error.name === "AbortError") return;
        const fallback = createFallbackCandles(config.symbol, config.resolution);
        setCandles(fallback);
        setLastTick(fallback[fallback.length - 1] || null);
        setMarketSource("Fallback");
        refit();
      }
    }

    loadCandles();
    return () => controller.abort();
  }, [config.resolution, config.symbol, refit]);

  useEffect(() => {
    onCandlesChange(config.id, candles);
  }, [candles, config.id, onCandlesChange]);

  const replayLocked = replay.enabled || replay.selecting;

  const handleLiveCandle = useCallback((candle) => {
    if (replayLocked) return;
    setCandles((current) => mergeCandle(current, candle));
    setLastTick(candle);
  }, [replayLocked]);

  const handleLiveTrade = useCallback((trade) => {
    if (replayLocked) return;
    setCandles((current) => updateCandleFromTrade(current, trade, config.resolution));
    setLastTick((current) => ({
      ...(current || {}),
      time: trade.time,
      close: trade.price,
      volume: Number(current?.volume ?? 0) + Number(trade.size ?? 0),
    }));
  }, [config.resolution, replayLocked]);

  const liveStatus = useHyperliquidLive({
    symbol: config.symbol,
    resolution: config.resolution,
    enabled: !replayLocked && isHyperliquidAsset(config.symbol) && marketSource !== "loading",
    onCandle: handleLiveCandle,
    onTrade: handleLiveTrade,
  });

  const workerLiveStatus = useWorkerMarketLive({
    symbol: config.symbol,
    enabled: !replayLocked && isTickDbAsset(config.symbol) && marketSource !== "loading",
    onTick: handleLiveTrade,
  });

  useEffect(() => {
    const tickDbFallback = isTickDbAsset(config.symbol)
      && ["offline", "unconfigured", "error", "reconnecting"].includes(workerLiveStatus);
    const shouldPoll = isPollingAsset(config.symbol) || tickDbFallback;

    if (replayLocked || !shouldPoll || marketSource === "loading") {
      setPollStatus("idle");
      return undefined;
    }

    let disposed = false;
    let busy = false;
    let controller = null;
    const refreshMs = resolutionToSeconds(config.resolution) <= 300 ? 10_000 : 30_000;

    const refresh = async () => {
      if (busy || disposed) return;
      busy = true;
      controller = new AbortController();
      setPollStatus("polling");

      try {
        const payload = await fetchMarketHistory(config.symbol, config.resolution, controller.signal);
        if (disposed) return;
        const nextData = payload.data;
        setCandles(nextData);
        setLastTick(nextData[nextData.length - 1] || null);
        setMarketSource("Yahoo Poll");
        setPollStatus("live");
      } catch (error) {
        if (!disposed && error.name !== "AbortError") {
          setPollStatus("delayed");
        }
      } finally {
        busy = false;
      }
    };

    const interval = window.setInterval(refresh, refreshMs);

    return () => {
      disposed = true;
      window.clearInterval(interval);
      controller?.abort();
    };
  }, [config.resolution, config.symbol, marketSource, replayLocked, workerLiveStatus]);

  useEffect(() => {
    if (clearToolsSignal > 0) {
      chartRef.current?.clearTools?.();
    }
  }, [clearToolsSignal]);

  const visibleCandles = useMemo(() => visibleCandlesForReplay(candles, replay), [candles, replay]);
  const latestCandle = visibleCandles[visibleCandles.length - 1];
  const change = useMemo(() => calculateChange(visibleCandles), [visibleCandles]);
  const price = latestCandle?.close ?? lastTick?.close ?? 0;
  const volume = latestCandle?.volume ?? 0;
  const liveLabel = replay.enabled
    ? "Replay"
    : replay.selecting
      ? "Pick start"
      : isHyperliquidAsset(config.symbol)
        ? liveStatus === "live" ? "Live ticks" : liveStatus
        : isTickDbAsset(config.symbol)
          ? workerLiveStatus === "live" ? "TickDB live" : pollStatus === "live" ? "Polling fallback" : workerLiveStatus
        : pollStatus === "live" ? "Polling live" : pollStatus === "polling" ? "Refreshing" : "Delayed";
  const statusIsLive = liveLabel === "Live ticks" || liveLabel === "TickDB live" || liveLabel === "Polling live" || liveLabel === "Polling fallback";

  useEffect(() => {
    if (!active) return;
    onMarketSnapshot?.({
      symbol: config.symbol,
      resolution: config.resolution,
      source: marketSource,
      liveStatus: liveLabel,
      price,
      change,
      volume,
      bars: visibleCandles.length,
    });
  }, [active, change, config.resolution, config.symbol, liveLabel, marketSource, onMarketSnapshot, price, visibleCandles.length, volume]);

  const addQuickPlot = (type) => {
    const candle = latestCandle || candles[candles.length - 1];
    if (!candle) return;

    const step = resolutionToSeconds(config.resolution);
    const endTime = candle.time + step * 30;

    if (type === "line") {
      chartRef.current?.addTool?.({
        type: "horizontal-line",
        color: "#f8fafc",
        points: [{ time: candle.time, price: candle.close }],
      });
      return;
    }

    const isShort = type === "short";
    chartRef.current?.addTool?.({
      type: "position",
      direction: isShort ? "short" : "long",
      color: "#f8fafc",
      points: [
        { time: candle.time, price: candle.close },
        { time: endTime, price: candle.close * (isShort ? 0.982 : 1.018) },
        { time: endTime, price: candle.close * (isShort ? 1.01 : 0.99) },
      ],
    });
  };

  return (
    <section
      onPointerDown={onActivate}
      className={`flex min-h-0 min-w-0 flex-col overflow-hidden border bg-[#0c0c0e] ${
        active ? "border-emerald-500/50" : "border-[#1f1f23]"
      }`}
    >
      <div className="flex min-h-[50px] shrink-0 flex-wrap items-center justify-between gap-2 border-b border-[#1f1f23] px-2 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <select
            value={config.symbol}
            onChange={(event) => onConfigChange(config.id, { symbol: event.target.value })}
            className="h-8 rounded border border-[#1f1f23] bg-[#09090b] px-2 font-mono text-xs font-semibold text-zinc-100 outline-none"
            aria-label={`Pane ${config.id} symbol`}
          >
            {ASSETS.map((asset) => (
              <option key={asset.symbol} value={asset.symbol}>{asset.symbol}</option>
            ))}
          </select>
          <select
            value={config.resolution}
            onChange={(event) => onConfigChange(config.id, { resolution: event.target.value })}
            className="h-8 rounded border border-[#1f1f23] bg-[#09090b] px-2 text-xs text-zinc-100 outline-none"
            aria-label={`Pane ${config.id} timeframe`}
          >
            {TIMEFRAMES.map((frame) => <option key={frame}>{frame}</option>)}
          </select>
          <span className={`hidden rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase md:inline ${
            replay.enabled ? "bg-amber-500/10 text-amber-300" : statusIsLive ? "bg-emerald-500/10 text-emerald-300" : "bg-zinc-500/10 text-zinc-400"
          }`}>
            {liveLabel}
          </span>
        </div>

        {!compact && (
          <div className="flex items-center gap-2">
            <div className="rounded border border-[#1f1f23] bg-[#09090b] px-2 py-1 text-right">
              <p className="font-mono text-xs font-semibold text-zinc-100">{formatPrice(price, config.symbol)}</p>
              <p className={`font-mono text-[10px] ${change.value >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                {change.value >= 0 ? "+" : ""}{formatPrice(change.value, config.symbol)} / {change.percent.toFixed(2)}%
              </p>
            </div>
            <CountdownToBarClose resolution={config.resolution} latestTickTimestamp={latestCandle?.time ?? lastTick?.time ?? Date.now()} />
            <button
              type="button"
              onClick={() => {
                setAutoFollow((current) => {
                  const next = !current;
                  if (next) chartRef.current?.scrollToRealTime?.();
                  return next;
                });
              }}
              className={`h-8 rounded border px-2 text-[10px] font-semibold uppercase ${
                autoFollow
                  ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-300"
                  : "border-[#1f1f23] bg-[#09090b] text-zinc-500 hover:text-zinc-100"
              }`}
            >
              Follow
            </button>
            <IconButton label="Fit Content" icon={Maximize2} onClick={refit} />
          </div>
        )}
      </div>

      <div className="relative min-h-0 flex-1">
        <LightweightTradingChart
          ref={chartRef}
          data={visibleCandles}
          theme="dark"
          activeTool={replay.selecting ? "cursor" : activeTool}
          candleOptions={{
            upColor: settings.bullColor,
            downColor: settings.bearColor,
            borderVisible: false,
            wickColor: settings.wickColor,
          }}
          indicatorSettings={settings.indicators}
          fibLevels={settings.drawings.fibLevels}
          drawingSettings={settings.drawings}
          initialTools={paneDrawings}
          chartSettings={settings.chart}
          volumeSettings={settings.volume}
          timezone={settings.timezone}
          onChartTimeClick={(time) => onReplayPick(config.id, time)}
          onToolChange={onToolChange}
          onToolsChange={(tools) => onToolsChange(config.id, tools)}
          onSelectedToolChange={(tool) => {
            if (active || tool) onSelectedToolChange(config.id, tool);
          }}
          onVisibleLogicalRangeChange={handleVisibleRangeChange}
          showToolBadge={!compact}
          fitContentToken={fitToken}
          followLive={autoFollow && !replay.enabled}
          className="h-full min-h-0 rounded-none border-0 shadow-none"
        />

        {replay.selecting && active && (
          <div className="pointer-events-none absolute left-3 top-3 rounded border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs font-semibold text-amber-200">
            Click a candle to set replay start
          </div>
        )}

        {active && !replay.selecting && DRAWING_INSTRUCTIONS[activeTool] && (
          <div className="pointer-events-none absolute left-3 top-3 max-w-[18rem] rounded border border-sky-500/35 bg-sky-500/10 px-3 py-2 text-xs font-semibold text-sky-100">
            {DRAWING_INSTRUCTIONS[activeTool]}
          </div>
        )}

        {settings.sessionBreaks && (
          <div className="pointer-events-none absolute inset-y-0 right-1/3 border-l border-dashed border-zinc-700/60" />
        )}
      </div>

      <div className="flex min-h-[40px] flex-wrap items-center justify-between gap-2 border-t border-[#1f1f23] bg-[#09090b] px-2 py-1.5">
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => addQuickPlot("line")} className="h-7 rounded border border-[#1f1f23] px-2 text-[10px] font-semibold text-zinc-400 hover:text-zinc-100">
            HLine
          </button>
          <button type="button" onClick={() => addQuickPlot("long")} className="flex h-7 items-center gap-1 rounded border border-emerald-500/40 px-2 text-[10px] font-semibold text-emerald-300">
            <TrendingUp className="h-3 w-3" /> Long
          </button>
          <button type="button" onClick={() => addQuickPlot("short")} className="flex h-7 items-center gap-1 rounded border border-rose-500/40 px-2 text-[10px] font-semibold text-rose-300">
            <TrendingDown className="h-3 w-3" /> Short
          </button>
        </div>
        <div className="flex items-center gap-3 font-mono text-[10px] text-zinc-500">
          <span>VOL {formatCompactVolume(volume)}</span>
          <span>BARS {visibleCandles.length}</span>
        </div>
      </div>
    </section>
  );
}

function ReplayControlBar({
  replay,
  onReplayChange,
  onStartSelecting,
  onExit,
  onStep,
  masterCandles,
  timezone,
}) {
  const index = replay.playhead ? indexAtOrBefore(masterCandles, replay.playhead) : masterCandles.length - 1;
  const safeIndex = Math.max(0, Math.min(index, Math.max(0, masterCandles.length - 1)));
  const progress = masterCandles.length <= 1 ? 0 : (safeIndex / (masterCandles.length - 1)) * 100;
  const activeTime = replay.playhead || masterCandles[safeIndex]?.time;

  return (
    <div className="flex min-h-[58px] items-center gap-3 border-t border-[#1f1f23] bg-[#0c0c0e] px-3">
      <button
        type="button"
        onClick={replay.enabled || replay.selecting ? onExit : onStartSelecting}
        className={`h-9 rounded border px-3 text-xs font-semibold ${
          replay.enabled || replay.selecting
            ? "border-rose-500/50 bg-rose-500/10 text-rose-200"
            : "border-[#1f1f23] bg-[#09090b] text-zinc-200 hover:text-white"
        }`}
      >
        {replay.enabled || replay.selecting ? "Exit Replay" : "Bar Replay"}
      </button>

      <div className="flex items-center gap-1">
        <IconButton label="Step Back" icon={SkipBack} disabled={!replay.enabled} onClick={() => onStep(-1)} />
        <IconButton
          label={replay.status === "playing" ? "Pause Replay" : "Play Replay"}
          icon={replay.status === "playing" ? Pause : Play}
          disabled={!replay.enabled}
          active={replay.enabled && replay.status === "playing"}
          onClick={() => onReplayChange((current) => ({ ...current, status: current.status === "playing" ? "paused" : "playing" }))}
        />
        <IconButton label="Step Forward" icon={SkipForward} disabled={!replay.enabled} onClick={() => onStep(1)} />
        <IconButton
          label="Reset Replay"
          icon={RotateCcw}
          disabled={!replay.enabled}
          onClick={() => onReplayChange((current) => ({
            ...current,
            playhead: masterCandles[0]?.time ?? current.playhead,
            status: "paused",
          }))}
        />
      </div>

      <div className="min-w-0 flex-1">
        <input
          type="range"
          min="0"
          max={Math.max(0, masterCandles.length - 1)}
          value={safeIndex}
          disabled={!replay.enabled}
          onChange={(event) => {
            const candle = masterCandles[Number(event.target.value)];
            if (candle) onReplayChange((current) => ({ ...current, playhead: candle.time, status: "paused" }));
          }}
          className="h-1 w-full accent-emerald-500"
          style={{ background: `linear-gradient(90deg, #10b981 ${progress}%, #1f1f23 ${progress}%)` }}
          aria-label="Replay synchronized playhead"
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

      <div className="hidden min-w-[16rem] text-right font-mono text-[11px] text-zinc-500 lg:block">
        {replay.selecting
          ? "Click any visible chart candle to choose replay start"
          : `${formatReplayTime(activeTime, timezone)} / ${safeIndex + 1} base bars`}
      </div>
    </div>
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
              asset.source === "Hyperliquid" || asset.source === "TickDB" ? "bg-emerald-500/10 text-emerald-300" : "bg-zinc-500/10 text-zinc-400"
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
  const persistedRef = useRef(null);
  if (persistedRef.current === null) {
    persistedRef.current = loadWorkspaceState();
  }

  const persisted = persistedRef.current;
  const [paneCount, setPaneCount] = useState(() => persisted.paneCount || 2);
  const [splitMode, setSplitMode] = useState(() => persisted.splitMode || "vertical");
  const [panes, setPanes] = useState(() => (
    Array.isArray(persisted.panes) && persisted.panes.length
      ? INITIAL_PANES.map((pane, index) => ({ ...pane, ...persisted.panes[index] }))
      : INITIAL_PANES
  ));
  const [activePaneId, setActivePaneId] = useState(() => persisted.activePaneId || 1);
  const [activeTool, setActiveTool] = useState(() => persisted.activeTool || "cursor");
  const [clearToolsSignal, setClearToolsSignal] = useState(0);
  const [modalOpen, setModalOpen] = useState(false);
  const [snapshot, setSnapshot] = useState({});
  const [paneCandles, setPaneCandles] = useState({});
  const [drawingsByPaneId, setDrawingsByPaneId] = useState(() => sanitizeDrawingsByPane(persisted.drawingsByPaneId));
  const [selectedDrawing, setSelectedDrawing] = useState(null);
  const [replay, setReplay] = useState({
    enabled: false,
    selecting: false,
    status: "paused",
    playhead: null,
    speed: 1,
  });
  const [settings, setSettings] = useState(() => mergeSettings(persisted.settings));

  const visiblePanes = useMemo(() => panes.slice(0, paneCount), [paneCount, panes]);
  const activePane = panes.find((pane) => pane.id === activePaneId) || panes[0];

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    const timer = window.setTimeout(() => {
      window.localStorage.setItem(WORKSPACE_STORAGE_KEY, JSON.stringify({
        paneCount,
        splitMode,
        panes,
        activePaneId,
        activeTool,
        settings,
        drawingsByPaneId,
      }));
    }, 250);

    return () => window.clearTimeout(timer);
  }, [activePaneId, activeTool, drawingsByPaneId, paneCount, panes, settings, splitMode]);

  const updatePaneConfig = useCallback((paneId, patch) => {
    setPanes((current) => current.map((pane) => (pane.id === paneId ? { ...pane, ...patch } : pane)));
  }, []);

  const handleToolsChange = useCallback((paneId, tools) => {
    setDrawingsByPaneId((current) => {
      try {
        if (JSON.stringify(current[paneId] || EMPTY_DRAWINGS) === JSON.stringify(tools)) {
          return current;
        }
      } catch {
        // Fall through and accept the update if serialization fails.
      }

      return {
        ...current,
        [paneId]: tools,
      };
    });
  }, []);

  const handleSelectedToolChange = useCallback((paneId, tool) => {
    setSelectedDrawing(tool ? { paneId, tool } : null);
  }, []);

  const updateSelectedDrawing = useCallback((patch) => {
    if (!selectedDrawing?.tool?.id) return;

    setDrawingsByPaneId((current) => {
      const paneTools = current[selectedDrawing.paneId] || [];
      return {
        ...current,
        [selectedDrawing.paneId]: paneTools.map((tool) => (
          tool.id === selectedDrawing.tool.id ? { ...tool, ...patch } : tool
        )),
      };
    });
    setSelectedDrawing((current) => (
      current?.tool?.id === selectedDrawing.tool.id
        ? { ...current, tool: { ...current.tool, ...patch } }
        : current
    ));
  }, [selectedDrawing]);

  const clearAllDrawings = useCallback(() => {
    setDrawingsByPaneId({});
    setClearToolsSignal((value) => value + 1);
    setSelectedDrawing(null);
  }, []);

  const handleCandlesChange = useCallback((paneId, candles) => {
    setPaneCandles((current) => ({ ...current, [paneId]: candles }));
  }, []);

  const masterPane = useMemo(() => {
    const candidates = visiblePanes
      .map((pane) => ({
        pane,
        candles: paneCandles[pane.id] || [],
        seconds: resolutionToSeconds(pane.resolution),
      }))
      .filter((entry) => entry.candles.length > 0)
      .sort((a, b) => a.seconds - b.seconds);

    return candidates[0] || { pane: visiblePanes[0], candles: [], seconds: 60 };
  }, [paneCandles, visiblePanes]);

  const stepReplay = useCallback((direction) => {
    setReplay((current) => {
      if (!current.enabled || !masterPane.candles.length) return current;

      const currentIndex = indexAtOrBefore(masterPane.candles, current.playhead);
      const nextIndex = direction > 0
        ? Math.min(masterPane.candles.length - 1, currentIndex + 1)
        : Math.max(0, currentIndex - 1);

      return {
        ...current,
        playhead: masterPane.candles[nextIndex]?.time ?? current.playhead,
        status: nextIndex >= masterPane.candles.length - 1 ? "paused" : current.status,
      };
    });
  }, [masterPane.candles]);

  useEffect(() => {
    if (!replay.enabled || replay.status !== "playing") return undefined;

    const timer = window.setInterval(() => {
      stepReplay(1);
    }, Math.max(70, 1000 / replay.speed));

    return () => window.clearInterval(timer);
  }, [replay.enabled, replay.speed, replay.status, stepReplay]);

  const startReplaySelection = () => {
    setReplay((current) => ({
      ...current,
      enabled: false,
      selecting: true,
      status: "paused",
      playhead: null,
    }));
    setActiveTool("cursor");
  };

  const exitReplay = () => {
    setReplay((current) => ({
      ...current,
      enabled: false,
      selecting: false,
      status: "paused",
      playhead: null,
    }));
  };

  const handleReplayPick = (paneId, time) => {
    if (!replay.selecting) return;

    const candles = paneCandles[paneId] || [];
    const snapped = findCandleAtOrBefore(candles, time);
    const playhead = snapped?.time ?? time;

    setReplay((current) => ({
      ...current,
      enabled: true,
      selecting: false,
      status: "paused",
      playhead,
    }));
    setActivePaneId(paneId);
  };

  const selectedSymbol = activePane.symbol;
  const activeAsset = getAssetConfig(selectedSymbol);
  const isLiveCapable = isHyperliquidAsset(selectedSymbol) || isTickDbAsset(selectedSymbol) || isPollingAsset(selectedSymbol);
  const activeFeedLabel = isHyperliquidAsset(selectedSymbol)
    ? "HYPERLIQUID LIVE"
    : isTickDbAsset(selectedSymbol)
      ? "TICKDB LIVE"
      : `${activeAsset.source.toUpperCase()} LIVE`;

  return (
    <div className="dark">
      <div className="flex h-screen min-h-0 overflow-hidden bg-[#09090b] text-zinc-100">
        <DrawingToolbar
          activeTool={activeTool}
          onToolChange={setActiveTool}
          onClear={clearAllDrawings}
        />

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex min-h-[64px] shrink-0 flex-wrap items-center justify-between gap-3 border-b border-[#1f1f23] bg-[#0c0c0e] px-4 py-2">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <CandlestickChart className="h-5 w-5 text-emerald-400" aria-hidden="true" />
                <p className="font-mono text-sm font-bold uppercase tracking-[0.24em] text-zinc-100">QUANTUM TERMINAL</p>
              </div>
              <p className="mt-1 text-xs text-zinc-500">Synchronized replay, live ticks, custom plotting</p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <select
                value={paneCount}
                onChange={(event) => setPaneCount(Number(event.target.value))}
                className="h-10 rounded border border-[#1f1f23] bg-[#09090b] px-3 text-sm text-zinc-100 outline-none"
                aria-label="Layout count"
              >
                {[1, 2, 4, 6, 8].map((count) => <option key={count} value={count}>{count} chart{count > 1 ? "s" : ""}</option>)}
              </select>

              {paneCount === 2 && (
                <select
                  value={splitMode}
                  onChange={(event) => setSplitMode(event.target.value)}
                  className="h-10 rounded border border-[#1f1f23] bg-[#09090b] px-3 text-sm text-zinc-100 outline-none"
                  aria-label="Two pane split direction"
                >
                  <option value="vertical">Vertical split</option>
                  <option value="horizontal">Horizontal split</option>
                </select>
              )}

              <div className={`flex h-10 items-center gap-2 rounded border px-3 text-xs font-semibold ${
                isLiveCapable ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300" : "border-[#1f1f23] bg-[#09090b] text-zinc-400"
              }`}>
                {isLiveCapable ? <Wifi className="h-4 w-4" aria-hidden="true" /> : <WifiOff className="h-4 w-4" aria-hidden="true" />}
                {isLiveCapable ? activeFeedLabel : `${activeAsset.source} DELAYED`}
              </div>

              <div className="flex h-10 items-center gap-2 rounded border border-[#1f1f23] bg-[#09090b] px-3 text-xs font-semibold text-zinc-300">
                <Layers className="h-4 w-4 text-zinc-500" aria-hidden="true" />
                Active pane {activePaneId}
              </div>

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

          <main className={`grid min-h-0 flex-1 gap-2 p-2 ${getLayoutClass(paneCount, splitMode)}`}>
            {visiblePanes.map((pane) => (
              <ChartPane
                key={pane.id}
                config={pane}
                paneCount={paneCount}
                active={activePaneId === pane.id}
                settings={settings}
                paneDrawings={drawingsByPaneId[pane.id] || EMPTY_DRAWINGS}
                activeTool={activeTool}
                clearToolsSignal={clearToolsSignal}
                replay={replay}
                onActivate={() => setActivePaneId(pane.id)}
                onToolChange={setActiveTool}
                onToolsChange={handleToolsChange}
                onSelectedToolChange={handleSelectedToolChange}
                onConfigChange={updatePaneConfig}
                onCandlesChange={handleCandlesChange}
                onMarketSnapshot={setSnapshot}
                onReplayPick={handleReplayPick}
              />
            ))}
          </main>

          <ReplayControlBar
            replay={replay}
            onReplayChange={setReplay}
            onStartSelecting={startReplaySelection}
            onExit={exitReplay}
            onStep={stepReplay}
            masterCandles={masterPane.candles}
            timezone={settings.timezone}
          />
        </div>

        <Watchlist
          activeSymbol={selectedSymbol}
          onSelect={(symbol) => updatePaneConfig(activePaneId, { symbol })}
          snapshot={snapshot}
        />

        <ConfigModal
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          settings={settings}
          onChange={setSettings}
          selectedDrawing={selectedDrawing}
          onSelectedDrawingChange={updateSelectedDrawing}
        />
      </div>
    </div>
  );
}
