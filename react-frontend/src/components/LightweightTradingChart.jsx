import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Copy,
  Palette,
  Settings,
  Trash2,
} from "lucide-react";
import {
  CandlestickSeries,
  ColorType,
  createChart,
  CrosshairMode,
  HistogramSeries,
  LineStyle,
  LineSeries,
} from "lightweight-charts";

const DARK_THEME = {
  surface: "#0d1117",
  panel: "#161b22",
  grid: "#1f1f23",
  text: "#c9d1d9",
  muted: "#8b949e",
  crosshair: "#58a6ff",
  gradient: "linear-gradient(180deg, #161b22 0%, #0d1117 55%, #090c10 100%)",
};

const LIGHT_THEME = {
  surface: "#ffffff",
  panel: "#f8fafc",
  grid: "#e5e7eb",
  text: "#0f172a",
  muted: "#64748b",
  crosshair: "#2563eb",
  gradient: "linear-gradient(180deg, #ffffff 0%, #f8fafc 58%, #eef2f7 100%)",
};

const DEFAULT_CANDLE_OPTIONS = {
  upColor: "#10b981",
  downColor: "#f43f5e",
  borderVisible: false,
  wickColor: "#94a3b8",
};

const DEFAULT_CHART_SETTINGS = {
  gridVisible: true,
  verticalGridVisible: true,
  horizontalGridVisible: true,
  crosshairVisible: true,
  barSpacing: 6,
  rightOffset: 8,
};

const DEFAULT_VOLUME_SETTINGS = {
  visible: true,
  heightRatio: 0.22,
  opacity: 0.38,
  upColor: "#10b981",
  downColor: "#f43f5e",
};

const DEFAULT_INDICATORS = {
  sma: {
    enabled: false,
    length: 50,
    source: "close",
    color: "#f8fafc",
  },
  ema: {
    enabled: true,
    length: 21,
    source: "close",
    color: "#f59e0b",
  },
  rsi: {
    enabled: true,
    period: 14,
    source: "close",
    overbought: 70,
    oversold: 30,
    color: "#38bdf8",
  },
  stochastic: {
    enabled: true,
    kPeriod: 14,
    dPeriod: 3,
    slowing: 3,
    kColor: "#a78bfa",
    dColor: "#f472b6",
  },
  fvg: {
    enabled: true,
    minGapPercent: 0,
    extendBars: 18,
    bullColor: "rgba(16, 185, 129, 0.16)",
    bearColor: "rgba(244, 63, 94, 0.16)",
  },
};

const DEFAULT_FIB_LEVELS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1, 1.618];
const DEFAULT_DRAWING_SETTINGS = {
  keepDrawingMode: false,
  magnetMode: false,
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
  fibLevels: DEFAULT_FIB_LEVELS.map((value) => ({
    value,
    visible: true,
    color: "#38bdf8",
    label: "",
  })),
};
const TOOL_TYPES = new Set([
  "cursor",
  "select",
  "trendline",
  "ray",
  "extended-line",
  "horizontal-line",
  "horizontal-ray",
  "vertical-line",
  "rectangle",
  "arrow",
  "measure",
  "fib-retracement",
  "fib-extension",
  "position",
  "long-position",
  "short-position",
]);

function getTheme(theme) {
  return theme === "light" ? LIGHT_THEME : DARK_THEME;
}

function timeKey(time) {
  return typeof time === "object" ? JSON.stringify(time) : String(time);
}

function createId(prefix = "tool") {
  return `${prefix}-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;
}

function serializeTools(tools) {
  try {
    return JSON.stringify(tools);
  } catch {
    return "";
  }
}

function clampNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp01(value, fallback = 1) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(0, Math.min(1, number));
}

function colorToRgb(color, fallback = "#ffffff") {
  const value = String(color || fallback).trim();
  const hex = value.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);

  if (hex) {
    const clean = hex[1].length === 3
      ? hex[1].split("").map((char) => char + char).join("")
      : hex[1];
    const parsed = Number.parseInt(clean, 16);

    return {
      r: (parsed >> 16) & 255,
      g: (parsed >> 8) & 255,
      b: parsed & 255,
    };
  }

  const rgb = value.match(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i);
  if (rgb) {
    return {
      r: Math.max(0, Math.min(255, Number(rgb[1]) || 0)),
      g: Math.max(0, Math.min(255, Number(rgb[2]) || 0)),
      b: Math.max(0, Math.min(255, Number(rgb[3]) || 0)),
    };
  }

  return colorToRgb(fallback, "#ffffff");
}

function colorToHex(color, fallback = "#ffffff") {
  const { r, g, b } = colorToRgb(color, fallback);
  return `#${[r, g, b].map((value) => (
    Math.round(value).toString(16).padStart(2, "0")
  )).join("")}`;
}

function rgbaFromHex(hex, alpha) {
  const { r, g, b } = colorToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${clamp01(alpha, 1)})`;
}

function normalizeFibLevels(levels, fallbackColor = DEFAULT_DRAWING_SETTINGS.fibColor) {
  const source = Array.isArray(levels) && levels.length ? levels : DEFAULT_FIB_LEVELS;

  return source
    .map((level) => {
      const rawValue = typeof level === "number" ? level : level?.value;
      const value = Number(rawValue);
      if (!Number.isFinite(value)) return null;

      return {
        value,
        visible: typeof level === "object" ? level.visible !== false : true,
        color: typeof level === "object" ? level.color || fallbackColor : fallbackColor,
        label: typeof level === "object" ? level.label || "" : "",
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.value - b.value);
}

function formatFibLevel(level) {
  const percent = level * 100;
  if (Number.isInteger(percent)) return `${percent}%`;
  return `${Number(percent.toFixed(1))}%`;
}

function formatTradeNumber(value, minimumDigits = 2, maximumDigits = 2) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "-";
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: minimumDigits,
    maximumFractionDigits: maximumDigits,
  }).format(number);
}

function formatTradePrice(value) {
  const number = Math.abs(Number(value));
  if (!Number.isFinite(number)) return "-";
  if (number >= 1000) return formatTradeNumber(value, 2, 2);
  if (number >= 100) return formatTradeNumber(value, 2, 3);
  if (number >= 1) return formatTradeNumber(value, 4, 4);
  return formatTradeNumber(value, 5, 5);
}

function inferPipSize(referencePrice) {
  const price = Math.abs(Number(referencePrice));
  if (!Number.isFinite(price)) return 1;
  if (price < 10) return 0.0001;
  if (price < 200) return 0.01;
  return 1;
}

function formatPointsAndPips(points, referencePrice) {
  const absolutePoints = Math.abs(Number(points));
  if (!Number.isFinite(absolutePoints)) return "-";
  const pipSize = inferPipSize(referencePrice);
  const formattedPoints = formatTradeNumber(absolutePoints, 2, absolutePoints >= 100 ? 2 : 4);
  if (pipSize === 1) return `${formattedPoints} pts/pips`;
  return `${formattedPoints} pts / ${formatTradeNumber(absolutePoints / pipSize, 1, 1)} pips`;
}

function drawPositionLabel(context, text, x, y, color) {
  context.save();
  context.font = "10px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
  const paddingX = 6;
  const width = context.measureText(text).width + paddingX * 2;
  const height = 18;
  const canvasWidth = context.canvas.clientWidth || context.canvas.width;
  const canvasHeight = context.canvas.clientHeight || context.canvas.height;
  const left = Math.max(4, Math.min(canvasWidth - width - 4, x));
  const top = Math.max(4, Math.min(canvasHeight - height - 4, y));

  context.fillStyle = "rgba(9, 12, 16, 0.92)";
  context.strokeStyle = color;
  context.lineWidth = 1;
  context.fillRect(left, top, width, height);
  context.strokeRect(left, top, width, height);
  context.fillStyle = "#f8fafc";
  context.fillText(text, left + paddingX, top + 12);
  context.restore();
}

function timeToUnixSeconds(time) {
  if (typeof time === "number") return time;
  if (time && typeof time === "object" && "year" in time) {
    return Math.floor(Date.UTC(time.year, time.month - 1, time.day) / 1000);
  }

  return null;
}

function formatChartTime(time, timezone = "UTC") {
  const seconds = timeToUnixSeconds(time);
  if (seconds === null) return "";

  return new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(seconds * 1000));
}

function getSourceValue(candle, source = "close") {
  if (!candle) return null;

  if (source === "open") return candle.open;
  if (source === "high") return candle.high;
  if (source === "low") return candle.low;
  if (source === "hl2") return (candle.high + candle.low) / 2;
  if (source === "hlc3") return (candle.high + candle.low + candle.close) / 3;
  if (source === "ohlc4") return (candle.open + candle.high + candle.low + candle.close) / 4;

  return candle.close;
}

export function calculateEma(candles, { length = 21, source = "close", smoothing = 2 } = {}) {
  const period = Math.max(1, Math.floor(length));
  const alpha = clampNumber(smoothing, 2) / (period + 1);
  const output = [];
  let previous = null;

  candles.forEach((candle) => {
    const value = getSourceValue(candle, source);
    if (!Number.isFinite(value)) return;

    previous = previous === null ? value : value * alpha + previous * (1 - alpha);
    output.push({ time: candle.time, value: Number(previous.toFixed(6)) });
  });

  return output;
}

export function calculateSma(candles, { length = 50, source = "close" } = {}) {
  const period = Math.max(1, Math.floor(length));
  const output = [];
  let sum = 0;
  const values = [];

  candles.forEach((candle) => {
    const value = getSourceValue(candle, source);
    values.push(value);

    if (!Number.isFinite(value)) return;

    sum += value;
    if (values.length > period) {
      sum -= values[values.length - period - 1];
    }

    if (values.length >= period) {
      output.push({ time: candle.time, value: Number((sum / period).toFixed(6)) });
    }
  });

  return output;
}

export function calculateFairValueGaps(
  candles,
  { minGapPercent = 0, extendBars = 18 } = {},
) {
  const minPercent = Math.max(0, Number(minGapPercent) || 0);
  const extension = Math.max(1, Math.floor(extendBars));
  const gaps = [];

  for (let index = 2; index < candles.length; index += 1) {
    const candleOne = candles[index - 2];
    const candleThree = candles[index];
    const endCandle = candles[Math.min(candles.length - 1, index + extension)] || candleThree;

    if (![candleOne?.high, candleOne?.low, candleThree?.high, candleThree?.low].every(Number.isFinite)) {
      continue;
    }

    if (candleOne.high < candleThree.low) {
      const gapPercent = ((candleThree.low - candleOne.high) / candleOne.high) * 100;
      if (gapPercent >= minPercent) {
        gaps.push({
          id: `bull-${candleThree.time}`,
          type: "bullish",
          startTime: candleOne.time,
          endTime: endCandle.time,
          top: candleThree.low,
          bottom: candleOne.high,
        });
      }
    }

    if (candleOne.low > candleThree.high) {
      const gapPercent = ((candleOne.low - candleThree.high) / candleOne.low) * 100;
      if (gapPercent >= minPercent) {
        gaps.push({
          id: `bear-${candleThree.time}`,
          type: "bearish",
          startTime: candleOne.time,
          endTime: endCandle.time,
          top: candleOne.low,
          bottom: candleThree.high,
        });
      }
    }
  }

  return gaps;
}

export function calculateRsi(candles, { period = 14, source = "close" } = {}) {
  const length = Math.max(2, Math.floor(period));
  const values = candles.map((candle) => getSourceValue(candle, source));
  const output = [];
  let averageGain = 0;
  let averageLoss = 0;

  for (let index = 1; index < values.length; index += 1) {
    const change = values[index] - values[index - 1];
    const gain = Math.max(change, 0);
    const loss = Math.max(-change, 0);

    if (index <= length) {
      averageGain += gain;
      averageLoss += loss;

      if (index === length) {
        averageGain /= length;
        averageLoss /= length;
      } else {
        continue;
      }
    } else {
      averageGain = (averageGain * (length - 1) + gain) / length;
      averageLoss = (averageLoss * (length - 1) + loss) / length;
    }

    const relativeStrength = averageLoss === 0 ? 100 : averageGain / averageLoss;
    const rsi = averageLoss === 0 ? 100 : 100 - 100 / (1 + relativeStrength);
    output.push({ time: candles[index].time, value: Number(rsi.toFixed(4)) });
  }

  return output;
}

function smaPoints(points, period) {
  const length = Math.max(1, Math.floor(period));
  const output = [];
  let sum = 0;

  points.forEach((point, index) => {
    sum += point.value;

    if (index >= length) {
      sum -= points[index - length].value;
    }

    if (index >= length - 1) {
      output.push({ time: point.time, value: Number((sum / length).toFixed(4)) });
    }
  });

  return output;
}

export function calculateStochastic(
  candles,
  { kPeriod = 14, dPeriod = 3, slowing = 3 } = {},
) {
  const kLength = Math.max(2, Math.floor(kPeriod));
  const rawK = [];

  for (let index = kLength - 1; index < candles.length; index += 1) {
    const window = candles.slice(index - kLength + 1, index + 1);
    const highestHigh = Math.max(...window.map((candle) => candle.high));
    const lowestLow = Math.min(...window.map((candle) => candle.low));
    const denominator = highestHigh - lowestLow;
    const value = denominator === 0
      ? 50
      : ((candles[index].close - lowestLow) / denominator) * 100;

    rawK.push({ time: candles[index].time, value: Number(value.toFixed(4)) });
  }

  const k = smaPoints(rawK, slowing);
  const d = smaPoints(k, dPeriod);

  return { k, d };
}

function withCandleStyles(candles, candleStyles) {
  return candles.map((candle) => {
    const style = candleStyles[timeKey(candle.time)];
    if (!style) return candle;

    return {
      ...candle,
      color: style.upColor || style.downColor || style.color,
      borderColor: style.borderColor || style.upColor || style.downColor || style.color,
      wickColor: style.wickColor || style.wickColorOverride,
    };
  });
}

function storedToolType(type) {
  if (type === "long-position" || type === "short-position") return "position";
  return type;
}

function toolDirection(type) {
  if (type === "long-position") return "long";
  if (type === "short-position") return "short";
  return null;
}

function inferPositionDirection(points = []) {
  const entryPrice = Number(points[0]?.price);
  const targetPrice = Number(points[1]?.price);
  if (!Number.isFinite(entryPrice) || !Number.isFinite(targetPrice)) return "long";
  return targetPrice < entryPrice ? "short" : "long";
}

function toolRequiredPoints(type) {
  if (type === "cursor") return 0;
  if (type === "horizontal-line" || type === "horizontal-ray" || type === "vertical-line") return 1;
  if (type === "fib-extension") return 3;
  if (type === "position" || type === "long-position" || type === "short-position") return 3;
  return 2;
}

function defaultToolStyle(type, settings = DEFAULT_DRAWING_SETTINGS) {
  const normalizedType = storedToolType(type);
  const lineWidth = Math.max(1, Math.min(8, Number(settings.lineWidth) || DEFAULT_DRAWING_SETTINGS.lineWidth));
  const baseStyle = {
    color: settings.color || DEFAULT_DRAWING_SETTINGS.color,
    fill: rgbaFromHex(
      settings.fillColor || DEFAULT_DRAWING_SETTINGS.fillColor,
      settings.fillOpacity ?? DEFAULT_DRAWING_SETTINGS.fillOpacity,
    ),
    lineWidth,
  };

  if (normalizedType === "fib-retracement" || normalizedType === "fib-extension") {
    return {
      ...baseStyle,
      color: settings.fibColor || DEFAULT_DRAWING_SETTINGS.fibColor,
      labelColor: settings.fibLabelColor || DEFAULT_DRAWING_SETTINGS.fibLabelColor,
      fill: rgbaFromHex(
        settings.fibFillColor || DEFAULT_DRAWING_SETTINGS.fibFillColor,
        settings.fibFillOpacity ?? DEFAULT_DRAWING_SETTINGS.fibFillOpacity,
      ),
    };
  }

  if (normalizedType === "rectangle") {
    return {
      ...baseStyle,
      color: settings.zoneColor || settings.color || DEFAULT_DRAWING_SETTINGS.zoneColor,
      fill: rgbaFromHex(
        settings.zoneColor || settings.fillColor || DEFAULT_DRAWING_SETTINGS.zoneColor,
        settings.zoneOpacity ?? settings.fillOpacity ?? DEFAULT_DRAWING_SETTINGS.zoneOpacity,
      ),
    };
  }

  if (normalizedType === "position") {
    return {
      ...baseStyle,
      targetColor: settings.targetColor || DEFAULT_DRAWING_SETTINGS.targetColor,
      stopColor: settings.stopColor || DEFAULT_DRAWING_SETTINGS.stopColor,
      targetFill: rgbaFromHex(
        settings.targetColor || DEFAULT_DRAWING_SETTINGS.targetColor,
        settings.zoneOpacity ?? DEFAULT_DRAWING_SETTINGS.zoneOpacity,
      ),
      stopFill: rgbaFromHex(
        settings.stopColor || DEFAULT_DRAWING_SETTINGS.stopColor,
        settings.zoneOpacity ?? DEFAULT_DRAWING_SETTINGS.zoneOpacity,
      ),
    };
  }

  return baseStyle;
}

function distanceToSegment(point, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length = dx * dx + dy * dy;
  if (length === 0) return Math.hypot(point.x - a.x, point.y - a.y);

  const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / length));
  const projection = { x: a.x + t * dx, y: a.y + t * dy };
  return Math.hypot(point.x - projection.x, point.y - projection.y);
}

export const LightweightTradingChart = forwardRef(function LightweightTradingChart(
  {
    data = [],
    theme = "dark",
    candleOptions = DEFAULT_CANDLE_OPTIONS,
    indicatorSettings = DEFAULT_INDICATORS,
    fibLevels = DEFAULT_FIB_LEVELS,
    drawingSettings = DEFAULT_DRAWING_SETTINGS,
    initialTools = [],
    activeTool = "cursor",
    onToolsChange,
    onToolChange,
    onToolComplete,
    onSelectedToolChange,
    onToolSettingsRequest,
    onVisibleLogicalRangeChange,
    showToolBadge = true,
    fitContentToken,
    followLive = true,
    chartSettings = DEFAULT_CHART_SETTINGS,
    volumeSettings = DEFAULT_VOLUME_SETTINGS,
    timezone = "UTC",
    onChartTimeClick,
    className = "",
  },
  ref,
) {
  const rootRef = useRef(null);
  const chartHostRef = useRef(null);
  const overlayRef = useRef(null);
  const chartRef = useRef(null);
  const candleSeriesRef = useRef(null);
  const volumeSeriesRef = useRef(null);
  const smaSeriesRef = useRef(null);
  const emaSeriesRef = useRef(null);
  const rsiSeriesRef = useRef(null);
  const stochasticKSeriesRef = useRef(null);
  const stochasticDSeriesRef = useRef(null);
  const resizeObserverRef = useRef(null);
  const interactionRef = useRef(null);
  const transientMeasureRef = useRef(null);
  const dataRef = useRef(data);
  const lastFitTokenRef = useRef(fitContentToken);
  const hasInitialFitRef = useRef(false);
  const onChartTimeClickRef = useRef(onChartTimeClick);
  const onToolsChangeRef = useRef(onToolsChange);
  const onVisibleLogicalRangeChangeRef = useRef(onVisibleLogicalRangeChange);
  const onSelectedToolChangeRef = useRef(onSelectedToolChange);
  const onToolSettingsRequestRef = useRef(onToolSettingsRequest);
  const lastEmittedToolsRef = useRef(null);
  const emittedToolSerializationsRef = useRef(new Set());
  const redrawOverlayRef = useRef(() => {});
  const [toolMode, setToolMode] = useState(TOOL_TYPES.has(activeTool) ? activeTool : "cursor");
  const [tools, setTools] = useState(() => (Array.isArray(initialTools) ? initialTools : []));
  const [selectedToolId, setSelectedToolId] = useState(null);
  const [selectedToolbarPosition, setSelectedToolbarPosition] = useState(null);
  const [draftTool, setDraftTool] = useState(null);
  const [draftPoint, setDraftPoint] = useState(null);
  const [transientMeasure, setTransientMeasure] = useState(null);
  const [barStyles, setBarStyles] = useState({});
  const mergedCandleOptions = useMemo(
    () => ({ ...DEFAULT_CANDLE_OPTIONS, ...candleOptions }),
    [candleOptions],
  );
  const mergedIndicators = useMemo(
    () => ({
      sma: { ...DEFAULT_INDICATORS.sma, ...indicatorSettings.sma },
      ema: { ...DEFAULT_INDICATORS.ema, ...indicatorSettings.ema },
      rsi: { ...DEFAULT_INDICATORS.rsi, ...indicatorSettings.rsi },
      stochastic: { ...DEFAULT_INDICATORS.stochastic, ...indicatorSettings.stochastic },
      fvg: { ...DEFAULT_INDICATORS.fvg, ...indicatorSettings.fvg },
    }),
    [indicatorSettings],
  );
  const mergedChartSettings = useMemo(
    () => ({ ...DEFAULT_CHART_SETTINGS, ...chartSettings }),
    [chartSettings],
  );
  const mergedVolumeSettings = useMemo(
    () => ({ ...DEFAULT_VOLUME_SETTINGS, ...volumeSettings }),
    [volumeSettings],
  );
  const mergedDrawingSettings = useMemo(
    () => {
      const next = { ...DEFAULT_DRAWING_SETTINGS, ...drawingSettings };
      return {
        ...next,
        fibLevels: normalizeFibLevels(next.fibLevels || fibLevels, next.fibColor),
      };
    },
    [drawingSettings, fibLevels],
  );
  const effectiveFibLevels = useMemo(
    () => normalizeFibLevels(fibLevels || mergedDrawingSettings.fibLevels, mergedDrawingSettings.fibColor),
    [fibLevels, mergedDrawingSettings.fibColor, mergedDrawingSettings.fibLevels],
  );

  const styledData = useMemo(() => withCandleStyles(data, barStyles), [data, barStyles]);
  const volumeData = useMemo(
    () => data.map((candle) => ({
      time: candle.time,
      value: candle.volume ?? 0,
      color: candle.close >= candle.open
        ? rgbaFromHex(mergedVolumeSettings.upColor, mergedVolumeSettings.opacity)
        : rgbaFromHex(mergedVolumeSettings.downColor, mergedVolumeSettings.opacity),
    })),
    [data, mergedVolumeSettings.downColor, mergedVolumeSettings.opacity, mergedVolumeSettings.upColor],
  );
  const smaData = useMemo(() => {
    if (!mergedIndicators.sma.enabled) return [];
    return calculateSma(data, mergedIndicators.sma);
  }, [data, mergedIndicators.sma]);
  const emaData = useMemo(() => {
    if (!mergedIndicators.ema.enabled) return [];
    return calculateEma(data, mergedIndicators.ema);
  }, [data, mergedIndicators.ema]);
  const rsiData = useMemo(() => {
    if (!mergedIndicators.rsi.enabled) return [];
    return calculateRsi(data, mergedIndicators.rsi);
  }, [data, mergedIndicators.rsi]);
  const stochasticData = useMemo(() => {
    if (!mergedIndicators.stochastic.enabled) return { k: [], d: [] };
    return calculateStochastic(data, mergedIndicators.stochastic);
  }, [data, mergedIndicators.stochastic]);
  const fvgData = useMemo(() => {
    if (!mergedIndicators.fvg.enabled) return [];
    return calculateFairValueGaps(data, mergedIndicators.fvg);
  }, [data, mergedIndicators.fvg]);

  const commitTools = useCallback((updater) => {
    setTools((current) => (typeof updater === "function" ? updater(current) : updater));
  }, []);

  const completeTool = useCallback((newTool) => {
    commitTools((current) => [...current, newTool]);
    setSelectedToolId(newTool.id);
    onToolComplete?.(newTool);

    if (!mergedDrawingSettings.keepDrawingMode) {
      setToolMode("cursor");
      onToolChange?.("cursor");
    }
  }, [commitTools, mergedDrawingSettings.keepDrawingMode, onToolChange, onToolComplete]);

  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  useEffect(() => {
    onToolsChangeRef.current = onToolsChange;
  }, [onToolsChange]);

  useEffect(() => {
    const serialized = serializeTools(tools) || String(Date.now());

    if (lastEmittedToolsRef.current === serialized) return;
    lastEmittedToolsRef.current = serialized;
    emittedToolSerializationsRef.current.add(serialized);
    if (emittedToolSerializationsRef.current.size > 80) {
      const first = emittedToolSerializationsRef.current.values().next().value;
      emittedToolSerializationsRef.current.delete(first);
    }
    onToolsChangeRef.current?.(tools);
  }, [tools]);

  useEffect(() => {
    if (!Array.isArray(initialTools)) return;

    const serialized = serializeTools(initialTools);
    if (serialized && emittedToolSerializationsRef.current.has(serialized)) return;

    setTools((current) => {
      const currentSerialized = serializeTools(current);
      return currentSerialized === serialized ? current : initialTools;
    });
  }, [initialTools]);

  useEffect(() => {
    onSelectedToolChangeRef.current?.(tools.find((tool) => tool.id === selectedToolId) || null);
  }, [selectedToolId, tools]);

  const resize = useCallback(() => {
    const host = chartHostRef.current;
    const chart = chartRef.current;
    const overlay = overlayRef.current;
    if (!host || !chart || !overlay) return;

    const rect = host.getBoundingClientRect();
    const width = Math.max(1, Math.floor(rect.width));
    const height = Math.max(1, Math.floor(rect.height));
    const ratio = window.devicePixelRatio || 1;

    chart.resize(width, height);
    overlay.width = Math.floor(width * ratio);
    overlay.height = Math.floor(height * ratio);
    overlay.style.width = `${width}px`;
    overlay.style.height = `${height}px`;
  }, []);

  const dataPointToCanvasPoint = useCallback((point) => {
    const chart = chartRef.current;
    const series = candleSeriesRef.current;
    if (!chart || !series) return null;

    const timeScale = chart.timeScale();
    let x = null;

    if (Number.isFinite(Number(point.logical)) && typeof timeScale.logicalToCoordinate === "function") {
      x = timeScale.logicalToCoordinate(Number(point.logical));
    }

    if (x === null && point.time !== undefined) {
      x = timeScale.timeToCoordinate(point.time);
    }

    const y = series.priceToCoordinate(point.price);

    return x === null || y === null ? null : { x, y };
  }, []);

  const logicalToNearestTime = useCallback((logical) => {
    const candles = dataRef.current;
    if (!Number.isFinite(Number(logical)) || !candles.length) return null;

    const index = Math.max(0, Math.min(candles.length - 1, Math.round(Number(logical))));
    return candles[index]?.time ?? null;
  }, []);

  const pointToLogical = useCallback((point) => {
    if (Number.isFinite(Number(point?.logical))) return Number(point.logical);

    const chart = chartRef.current;
    if (!chart || point?.time === undefined) return null;

    const x = chart.timeScale().timeToCoordinate(point.time);
    if (x === null || typeof chart.timeScale().coordinateToLogical !== "function") return null;

    const logical = chart.timeScale().coordinateToLogical(x);
    return Number.isFinite(logical) ? logical : null;
  }, []);

  const priceToCanvasY = useCallback((price) => {
    const series = candleSeriesRef.current;
    if (!series || !Number.isFinite(Number(price))) return null;
    return series.priceToCoordinate(price);
  }, []);

  const canvasPointToDataPoint = useCallback((event) => {
    const overlay = overlayRef.current;
    const chart = chartRef.current;
    const series = candleSeriesRef.current;
    if (!overlay || !chart || !series) return null;

    const rect = overlay.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const timeScale = chart.timeScale();
    const logical = typeof timeScale.coordinateToLogical === "function"
      ? timeScale.coordinateToLogical(x)
      : null;
    let time = timeScale.coordinateToTime(x);
    const price = series.coordinateToPrice(y);

    if (time === null && Number.isFinite(logical)) {
      time = logicalToNearestTime(logical);
    }

    if (time === null || price === null) return null;
    return {
      time,
      price,
      ...(Number.isFinite(logical) ? { logical } : {}),
    };
  }, [logicalToNearestTime]);

  const applyMagnetToPoint = useCallback((point) => {
    if (!mergedDrawingSettings.magnetMode || !point) return point;

    const candles = dataRef.current;
    if (!candles.length || !Number.isFinite(Number(point.logical))) return point;

    const index = Math.max(0, Math.min(candles.length - 1, Math.round(Number(point.logical))));
    const candle = candles[index];
    if (!candle) return point;

    const candidates = [candle.open, candle.high, candle.low, candle.close].filter(Number.isFinite);
    if (!candidates.length) return point;

    const price = candidates.reduce((best, candidate) => (
      Math.abs(candidate - point.price) < Math.abs(best - point.price) ? candidate : best
    ), candidates[0]);

    return {
      ...point,
      logical: index,
      time: candle.time,
      price,
    };
  }, [mergedDrawingSettings.magnetMode]);

  const selectedTool = useMemo(
    () => tools.find((tool) => tool.id === selectedToolId) || null,
    [selectedToolId, tools],
  );

  const getToolBounds = useCallback((tool) => {
    const overlay = overlayRef.current;
    if (!overlay || !tool?.points?.length) return null;

    const width = overlay.clientWidth;
    const height = overlay.clientHeight;
    const points = tool.points.map(dataPointToCanvasPoint).filter(Boolean);
    const firstPriceY = priceToCanvasY(tool.points[0]?.price);

    if (tool.type === "horizontal-line" && firstPriceY !== null) {
      return { left: 0, right: width, top: firstPriceY, bottom: firstPriceY };
    }

    if (tool.type === "vertical-line" && points[0]) {
      return { left: points[0].x, right: points[0].x, top: 0, bottom: height };
    }

    if (!points.length) return null;

    return {
      left: Math.min(...points.map((point) => point.x)),
      right: Math.max(...points.map((point) => point.x)),
      top: Math.min(...points.map((point) => point.y)),
      bottom: Math.max(...points.map((point) => point.y)),
    };
  }, [dataPointToCanvasPoint, priceToCanvasY]);

  const updateSelectedToolbarPosition = useCallback(() => {
    const overlay = overlayRef.current;
    if (!overlay || !selectedTool) {
      setSelectedToolbarPosition(null);
      return;
    }

    const bounds = getToolBounds(selectedTool);
    if (!bounds) {
      setSelectedToolbarPosition(null);
      return;
    }

    const toolbarWidth = 294;
    const x = Math.max(10, Math.min(
      overlay.clientWidth - toolbarWidth - 10,
      (bounds.left + bounds.right) / 2 - toolbarWidth / 2,
    ));
    const preferredY = selectedTool.type === "position" && bounds.bottom + 52 < overlay.clientHeight
      ? bounds.bottom + 10
      : bounds.top - 52;
    const y = Math.max(10, Math.min(
      overlay.clientHeight - 50,
      preferredY,
    ));
    const next = { x: Math.round(x), y: Math.round(y) };

    setSelectedToolbarPosition((current) => (
      current?.x === next.x && current?.y === next.y ? current : next
    ));
  }, [getToolBounds, selectedTool]);

  const drawTool = useCallback((context, tool, selected = false) => {
    if (tool.visible === false) return;

    const points = tool.points.map(dataPointToCanvasPoint).filter(Boolean);
    const firstPriceY = priceToCanvasY(tool.points[0]?.price);
    if (!points.length && firstPriceY === null) return;

    const levels = normalizeFibLevels(tool.levels || effectiveFibLevels, tool.color || mergedDrawingSettings.fibColor);
    const lineWidth = Math.max(1, Math.min(10, Number(tool.lineWidth) || mergedDrawingSettings.lineWidth || 2));
    context.save();
    context.lineWidth = selected ? lineWidth + 0.75 : lineWidth;
    context.strokeStyle = tool.color || mergedDrawingSettings.color || "#94a3b8";
    context.fillStyle = tool.fill || rgbaFromHex(
      mergedDrawingSettings.fillColor,
      mergedDrawingSettings.fillOpacity,
    );
    context.lineCap = "round";
    context.lineJoin = "round";
    context.font = "11px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
    context.setLineDash(tool.dashed ? [6, 6] : []);

    if (tool.type === "horizontal-line") {
      context.beginPath();
      context.moveTo(0, firstPriceY);
      context.lineTo(context.canvas.clientWidth, firstPriceY);
      context.stroke();
    }

    if (tool.type === "vertical-line" && points[0]) {
      context.beginPath();
      context.moveTo(points[0].x, 0);
      context.lineTo(points[0].x, context.canvas.clientHeight);
      context.stroke();
    }

    if (tool.type === "horizontal-ray" && points[0]) {
      context.beginPath();
      context.moveTo(points[0].x, points[0].y);
      context.lineTo(context.canvas.clientWidth, points[0].y);
      context.stroke();
    }

    if (tool.type === "trendline" && points[1]) {
      context.beginPath();
      context.moveTo(points[0].x, points[0].y);
      context.lineTo(points[1].x, points[1].y);
      context.stroke();
    }

    if ((tool.type === "ray" || tool.type === "extended-line") && points[1]) {
      drawExtendedLine(context, points[0], points[1], tool.type === "ray");
    }

    if (tool.type === "rectangle" && points[1]) {
      const x = Math.min(points[0].x, points[1].x);
      const y = Math.min(points[0].y, points[1].y);
      const width = Math.abs(points[1].x - points[0].x);
      const height = Math.abs(points[1].y - points[0].y);
      context.fillRect(x, y, width, height);
      context.strokeRect(x, y, width, height);
    }

    if (tool.type === "arrow" && points[1]) {
      drawArrow(context, points[0], points[1]);
    }

    if (tool.type === "measure" && points[1]) {
      drawMeasureTool(context, points[0], points[1], tool);
    }

    if (tool.type === "fib-retracement" && points[1]) {
      drawFibRetracement(context, points[0], points[1], levels, tool);
    }

    if (tool.type === "fib-extension" && points[2]) {
      drawFibExtension(context, points[0], points[1], points[2], levels, tool);
    }

    if (tool.type === "position" && points[1] && points[2]) {
      drawPositionTool(context, points[0], points[1], points[2], tool);
    }

    if (selected && points.length) {
      context.setLineDash([]);
      context.fillStyle = "#60a5fa";
      points.forEach((point) => {
        context.beginPath();
        context.arc(point.x, point.y, 4, 0, Math.PI * 2);
        context.fill();
      });
    }

    context.restore();
  }, [
    dataPointToCanvasPoint,
    effectiveFibLevels,
    mergedDrawingSettings.color,
    mergedDrawingSettings.fibColor,
    mergedDrawingSettings.fillColor,
    mergedDrawingSettings.fillOpacity,
    mergedDrawingSettings.lineWidth,
    priceToCanvasY,
  ]);

  const drawFairValueGap = useCallback((context, gap) => {
    const topLeft = dataPointToCanvasPoint({ time: gap.startTime, price: gap.top });
    const bottomRight = dataPointToCanvasPoint({ time: gap.endTime, price: gap.bottom });
    if (!topLeft || !bottomRight) return;

    const x = Math.min(topLeft.x, bottomRight.x);
    const y = Math.min(topLeft.y, bottomRight.y);
    const width = Math.abs(bottomRight.x - topLeft.x);
    const height = Math.abs(bottomRight.y - topLeft.y);

    if (width < 1 || height < 1) return;

    context.save();
    context.fillStyle = rgbaFromHex(
      gap.type === "bullish" ? mergedIndicators.fvg.bullColor : mergedIndicators.fvg.bearColor,
      mergedIndicators.fvg.opacity ?? 0.16,
    );
    context.strokeStyle = gap.type === "bullish"
      ? rgbaFromHex(mergedIndicators.fvg.bullColor, 0.36)
      : rgbaFromHex(mergedIndicators.fvg.bearColor, 0.36);
    context.lineWidth = 1;
    context.fillRect(x, y, width, height);
    context.strokeRect(x, y, width, height);
    context.restore();
  }, [
    dataPointToCanvasPoint,
    mergedIndicators.fvg.bearColor,
    mergedIndicators.fvg.bullColor,
    mergedIndicators.fvg.opacity,
  ]);

  const redrawOverlay = useCallback(() => {
    const overlay = overlayRef.current;
    if (!overlay) return;

    const context = overlay.getContext("2d");
    const ratio = window.devicePixelRatio || 1;
    const width = overlay.width;
    const height = overlay.height;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, width / ratio, height / ratio);

    fvgData.forEach((gap) => drawFairValueGap(context, gap));
    tools.forEach((tool) => drawTool(context, tool, tool.id === selectedToolId));

    if (draftTool) {
      const preview = {
        ...draftTool,
        points: draftPoint ? [...draftTool.points, draftPoint] : draftTool.points,
        dashed: true,
      };
      drawTool(context, preview, true);
    }

    if (transientMeasure) {
      drawTool(context, transientMeasure, true);
    }
    updateSelectedToolbarPosition();
  }, [
    draftPoint,
    draftTool,
    drawFairValueGap,
    drawTool,
    fvgData,
    selectedToolId,
    tools,
    transientMeasure,
    updateSelectedToolbarPosition,
  ]);

  useEffect(() => {
    redrawOverlayRef.current = redrawOverlay;
  }, [redrawOverlay]);

  useEffect(() => {
    onChartTimeClickRef.current = onChartTimeClick;
  }, [onChartTimeClick]);

  useEffect(() => {
    onVisibleLogicalRangeChangeRef.current = onVisibleLogicalRangeChange;
  }, [onVisibleLogicalRangeChange]);

  useEffect(() => {
    onSelectedToolChangeRef.current = onSelectedToolChange;
  }, [onSelectedToolChange]);

  useEffect(() => {
    onToolSettingsRequestRef.current = onToolSettingsRequest;
  }, [onToolSettingsRequest]);

  const patchSelectedTool = useCallback((patch) => {
    if (!selectedToolId) return;
    commitTools((current) => current.map((tool) => (
      tool.id === selectedToolId ? { ...tool, ...patch } : tool
    )));
  }, [commitTools, selectedToolId]);

  const deleteSelectedToolById = useCallback(() => {
    if (!selectedToolId) return;
    commitTools((current) => current.filter((tool) => tool.id !== selectedToolId));
    setSelectedToolId(null);
  }, [commitTools, selectedToolId]);

  const duplicateSelectedTool = useCallback(() => {
    if (!selectedTool) return;

    const duplicate = {
      ...selectedTool,
      id: createId(selectedTool.type || "tool"),
      points: selectedTool.points.map((point) => ({
        ...point,
        price: point.price * 1.002,
      })),
    };
    commitTools((current) => [...current, duplicate]);
    setSelectedToolId(duplicate.id);
  }, [commitTools, selectedTool]);

  const requestSelectedToolSettings = useCallback(() => {
    if (!selectedTool) return;
    onToolSettingsRequestRef.current?.(selectedTool);
  }, [selectedTool]);

  const beginToolInteraction = useCallback((event, hit, point) => {
    setSelectedToolId(hit.tool.id);
    interactionRef.current = {
      type: "drag",
      toolId: hit.tool.id,
      handleIndex: hit.handleIndex,
      startPoint: point,
      startCursor: hit.cursor,
      hasMoved: false,
      originalTool: hit.tool,
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }, []);

  const hitTestTool = useCallback((event) => {
    const overlay = overlayRef.current;
    if (!overlay) return null;

    const rect = overlay.getBoundingClientRect();
    const cursor = { x: event.clientX - rect.left, y: event.clientY - rect.top };

    for (let toolIndex = tools.length - 1; toolIndex >= 0; toolIndex -= 1) {
      const tool = tools[toolIndex];
      if (tool.visible === false) continue;

      const points = tool.points.map(dataPointToCanvasPoint).filter(Boolean);
      const firstPriceY = priceToCanvasY(tool.points[0]?.price);

      for (let pointIndex = 0; pointIndex < points.length; pointIndex += 1) {
        if (Math.hypot(points[pointIndex].x - cursor.x, points[pointIndex].y - cursor.y) <= 8) {
          return { tool, handleIndex: pointIndex, cursor };
        }
      }

      if (tool.type === "horizontal-line" && firstPriceY !== null && Math.abs(firstPriceY - cursor.y) <= 6) {
        return { tool, handleIndex: null, cursor };
      }

      if (tool.type === "vertical-line" && points[0] && Math.abs(points[0].x - cursor.x) <= 6) {
        return { tool, handleIndex: null, cursor };
      }

      if (tool.type === "horizontal-ray" && points[0] && cursor.x >= points[0].x && Math.abs(points[0].y - cursor.y) <= 6) {
        return { tool, handleIndex: null, cursor };
      }

      if (tool.type === "fib-retracement" && points[0] && points[1]) {
        const left = Math.min(points[0].x, points[1].x);
        const right = Math.max(points[0].x, points[1].x);
        const top = Math.min(points[0].y, points[1].y);
        const bottom = Math.max(points[0].y, points[1].y);
        const levels = normalizeFibLevels(tool.levels || effectiveFibLevels, tool.color || DEFAULT_DRAWING_SETTINGS.fibColor);

        for (const level of levels) {
          if (level.visible === false) continue;
          const y = points[0].y + (points[1].y - points[0].y) * Number(level.value);
          if (cursor.x >= left - 8 && cursor.x <= right + 120 && Math.abs(y - cursor.y) <= 7) {
            return { tool, handleIndex: null, cursor };
          }
        }

        if (cursor.x >= left && cursor.x <= right && cursor.y >= top && cursor.y <= bottom) {
          return { tool, handleIndex: null, cursor };
        }
      }

      if (tool.type === "fib-extension" && points[0] && points[1] && points[2]) {
        const left = Math.min(points[1].x, points[2].x);
        const right = Math.max(points[1].x, points[2].x) + 160;
        const priceVectorY = points[1].y - points[0].y;
        const levels = normalizeFibLevels(tool.levels || effectiveFibLevels, tool.color || DEFAULT_DRAWING_SETTINGS.fibColor);

        for (const level of levels) {
          if (level.visible === false) continue;
          const y = points[2].y + priceVectorY * Number(level.value);
          if (cursor.x >= left - 8 && cursor.x <= right + 120 && Math.abs(y - cursor.y) <= 7) {
            return { tool, handleIndex: null, cursor };
          }
        }
      }

      if (points[0] && points[1] && distanceToSegment(cursor, points[0], points[1]) <= 7) {
        return { tool, handleIndex: null, cursor };
      }

      if ((tool.type === "rectangle" || tool.type === "measure") && points[0] && points[1]) {
        const left = Math.min(points[0].x, points[1].x);
        const right = Math.max(points[0].x, points[1].x);
        const top = Math.min(points[0].y, points[1].y);
        const bottom = Math.max(points[0].y, points[1].y);
        if (cursor.x >= left && cursor.x <= right && cursor.y >= top && cursor.y <= bottom) {
          return { tool, handleIndex: null, cursor };
        }
      }

      if (tool.type === "position" && points[0] && points[1] && points[2]) {
        const left = Math.min(points[0].x, points[1].x, points[2].x);
        const right = Math.max(points[0].x, points[1].x, points[2].x);
        const top = Math.min(points[0].y, points[1].y, points[2].y);
        const bottom = Math.max(points[0].y, points[1].y, points[2].y);
        if (cursor.x >= left && cursor.x <= right && cursor.y >= top && cursor.y <= bottom) {
          return { tool, handleIndex: null, cursor };
        }
      }
    }

    return null;
  }, [dataPointToCanvasPoint, effectiveFibLevels, priceToCanvasY, tools]);

  useImperativeHandle(ref, () => ({
    get chart() {
      return chartRef.current;
    },
    get candlestickSeries() {
      return candleSeriesRef.current;
    },
    get volumeSeries() {
      return volumeSeriesRef.current;
    },
    applyCandleOptions(options) {
      candleSeriesRef.current?.applyOptions(options);
    },
    styleCandle(time, style) {
      setBarStyles((current) => ({
        ...current,
        [timeKey(time)]: style,
      }));
    },
    clearCandleStyle(time) {
      setBarStyles((current) => {
        const next = { ...current };
        delete next[timeKey(time)];
        return next;
      });
    },
    setToolMode(mode) {
      setToolMode(TOOL_TYPES.has(mode) ? mode : "cursor");
      setDraftTool(null);
      setDraftPoint(null);
    },
    getTools() {
      return tools;
    },
    addTool(tool) {
      const nextTool = {
        ...defaultToolStyle(tool.type || "trendline", mergedDrawingSettings),
        id: createId(tool.type || "tool"),
        levels: effectiveFibLevels,
        ...tool,
      };
      commitTools((current) => [...current, nextTool]);
      setSelectedToolId(nextTool.id);
      return nextTool.id;
    },
    getSelectedTool() {
      return tools.find((tool) => tool.id === selectedToolId) || null;
    },
    setSelectedTool(id) {
      setSelectedToolId(id || null);
    },
    updateTool(id, patch) {
      commitTools((current) => current.map((tool) => (
        tool.id === id ? { ...tool, ...patch } : tool
      )));
    },
    deleteTool(id) {
      commitTools((current) => current.filter((tool) => tool.id !== id));
      setSelectedToolId((current) => (current === id ? null : current));
    },
    deleteSelectedTool() {
      if (!selectedToolId) return;
      commitTools((current) => current.filter((tool) => tool.id !== selectedToolId));
      setSelectedToolId(null);
    },
    clearTools() {
      commitTools([]);
      setSelectedToolId(null);
    },
    fitContent() {
      chartRef.current?.timeScale().fitContent();
    },
    scrollToRealTime() {
      chartRef.current?.timeScale().scrollToRealTime();
    },
  }), [commitTools, effectiveFibLevels, mergedDrawingSettings, selectedToolId, tools]);

  useEffect(() => {
    setToolMode(TOOL_TYPES.has(activeTool) ? activeTool : "cursor");
  }, [activeTool]);

  useEffect(() => {
    const host = chartHostRef.current;
    if (!host) return undefined;

    const themeConfig = getTheme(theme);
    host.style.background = themeConfig.gradient;

    const chart = createChart(host, {
      autoSize: false,
      layout: {
        background: { type: ColorType.Solid, color: themeConfig.surface },
        textColor: themeConfig.text,
        fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
      },
      grid: {
        vertLines: {
          color: themeConfig.grid,
          visible: mergedChartSettings.gridVisible && mergedChartSettings.verticalGridVisible,
        },
        horzLines: {
          color: themeConfig.grid,
          visible: mergedChartSettings.gridVisible && mergedChartSettings.horizontalGridVisible,
        },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: {
          visible: mergedChartSettings.crosshairVisible,
          color: themeConfig.crosshair,
          labelBackgroundColor: themeConfig.panel,
        },
        horzLine: {
          visible: mergedChartSettings.crosshairVisible,
          color: themeConfig.crosshair,
          labelBackgroundColor: themeConfig.panel,
        },
      },
      rightPriceScale: {
        borderColor: themeConfig.grid,
        scaleMargins: { top: 0.08, bottom: 0.28 },
      },
      timeScale: {
        borderColor: themeConfig.grid,
        timeVisible: true,
        secondsVisible: false,
        rightOffset: mergedChartSettings.rightOffset,
        barSpacing: mergedChartSettings.barSpacing,
        tickMarkFormatter: (time) => formatChartTime(time, timezone),
      },
      localization: {
        timeFormatter: (time) => formatChartTime(time, timezone),
      },
      handleScroll: true,
      handleScale: true,
      kineticScroll: {
        touch: true,
        mouse: true,
      },
    });

    chartRef.current = chart;
    candleSeriesRef.current = chart.addSeries(CandlestickSeries, mergedCandleOptions);
    volumeSeriesRef.current = chart.addSeries(HistogramSeries, {
      priceFormat: { type: "volume" },
      priceScaleId: "volume",
      lastValueVisible: false,
      priceLineVisible: false,
    });
    smaSeriesRef.current = chart.addSeries(LineSeries, {
      color: mergedIndicators.sma.color,
      lineWidth: 2,
      priceLineVisible: false,
    });
    emaSeriesRef.current = chart.addSeries(LineSeries, {
      color: mergedIndicators.ema.color,
      lineWidth: 2,
      priceLineVisible: false,
    });
    rsiSeriesRef.current = chart.addSeries(LineSeries, {
      color: mergedIndicators.rsi.color,
      lineWidth: 1,
      priceScaleId: "rsi",
      priceLineVisible: false,
    });
    stochasticKSeriesRef.current = chart.addSeries(LineSeries, {
      color: mergedIndicators.stochastic.kColor,
      lineWidth: 1,
      priceScaleId: "oscillator",
      priceLineVisible: false,
    });
    stochasticDSeriesRef.current = chart.addSeries(LineSeries, {
      color: mergedIndicators.stochastic.dColor,
      lineWidth: 1,
      priceScaleId: "oscillator",
      priceLineVisible: false,
    });

    chart.priceScale("volume").applyOptions({
      scaleMargins: {
        top: Math.max(0.55, 1 - Math.max(0.08, Math.min(0.42, mergedVolumeSettings.heightRatio))),
        bottom: 0,
      },
      borderVisible: false,
      visible: mergedVolumeSettings.visible,
    });
    chart.priceScale("rsi").applyOptions({
      scaleMargins: { top: 0.58, bottom: 0.22 },
      borderVisible: false,
      visible: true,
    });
    chart.priceScale("oscillator").applyOptions({
      scaleMargins: { top: 0.58, bottom: 0.22 },
      borderVisible: false,
      visible: true,
    });

    const redrawFromSubscription = (range) => {
      redrawOverlayRef.current();
      onVisibleLogicalRangeChangeRef.current?.(range);
    };
    const clickSubscription = (param) => {
      const seconds = timeToUnixSeconds(param?.time);
      if (seconds !== null) onChartTimeClickRef.current?.(seconds);
    };

    resizeObserverRef.current = new ResizeObserver(() => {
      resize();
      redrawOverlayRef.current();
    });
    resizeObserverRef.current.observe(host);
    chart.timeScale().subscribeVisibleLogicalRangeChange(redrawFromSubscription);
    chart.subscribeClick(clickSubscription);
    resize();

    return () => {
      chart.timeScale().unsubscribeVisibleLogicalRangeChange(redrawFromSubscription);
      chart.unsubscribeClick(clickSubscription);
      resizeObserverRef.current?.disconnect();
      resizeObserverRef.current = null;
      chart.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
      volumeSeriesRef.current = null;
      smaSeriesRef.current = null;
      emaSeriesRef.current = null;
      rsiSeriesRef.current = null;
      stochasticKSeriesRef.current = null;
      stochasticDSeriesRef.current = null;
    };
  }, []);

  useEffect(() => {
    const chart = chartRef.current;
    const host = chartHostRef.current;
    if (!chart || !host) return;

    const themeConfig = getTheme(theme);
    host.style.background = themeConfig.gradient;
    chart.applyOptions({
      layout: {
        background: { type: ColorType.Solid, color: themeConfig.surface },
        textColor: themeConfig.text,
      },
      grid: {
        vertLines: {
          color: themeConfig.grid,
          visible: mergedChartSettings.gridVisible && mergedChartSettings.verticalGridVisible,
        },
        horzLines: {
          color: themeConfig.grid,
          visible: mergedChartSettings.gridVisible && mergedChartSettings.horizontalGridVisible,
        },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: {
          visible: mergedChartSettings.crosshairVisible,
          color: themeConfig.crosshair,
          labelBackgroundColor: themeConfig.panel,
        },
        horzLine: {
          visible: mergedChartSettings.crosshairVisible,
          color: themeConfig.crosshair,
          labelBackgroundColor: themeConfig.panel,
        },
      },
      rightPriceScale: { borderColor: themeConfig.grid },
      timeScale: {
        borderColor: themeConfig.grid,
        rightOffset: mergedChartSettings.rightOffset,
        barSpacing: mergedChartSettings.barSpacing,
        tickMarkFormatter: (time) => formatChartTime(time, timezone),
      },
      localization: {
        timeFormatter: (time) => formatChartTime(time, timezone),
      },
    });
    redrawOverlayRef.current();
  }, [mergedChartSettings, theme, timezone]);

  useEffect(() => {
    candleSeriesRef.current?.applyOptions(mergedCandleOptions);
  }, [mergedCandleOptions]);

  useEffect(() => {
    candleSeriesRef.current?.setData(styledData);
    volumeSeriesRef.current?.setData(mergedVolumeSettings.visible ? volumeData : []);
    chartRef.current?.priceScale("volume").applyOptions({
      scaleMargins: {
        top: Math.max(0.55, 1 - Math.max(0.08, Math.min(0.42, mergedVolumeSettings.heightRatio))),
        bottom: 0,
      },
      borderVisible: false,
      visible: mergedVolumeSettings.visible,
    });
    if (followLive) {
      chartRef.current?.timeScale().scrollToRealTime();
    }
    if (!hasInitialFitRef.current && styledData.length > 0) {
      hasInitialFitRef.current = true;
      chartRef.current?.timeScale().fitContent();
    }
    redrawOverlayRef.current();
  }, [followLive, mergedVolumeSettings.heightRatio, mergedVolumeSettings.visible, styledData, volumeData]);

  useEffect(() => {
    if (lastFitTokenRef.current === fitContentToken) return;
    lastFitTokenRef.current = fitContentToken;
    chartRef.current?.timeScale().fitContent();
    redrawOverlayRef.current();
  }, [fitContentToken]);

  useEffect(() => {
    smaSeriesRef.current?.applyOptions({ color: mergedIndicators.sma.color });
    smaSeriesRef.current?.setData(smaData);
  }, [mergedIndicators.sma.color, smaData]);

  useEffect(() => {
    emaSeriesRef.current?.applyOptions({ color: mergedIndicators.ema.color });
    emaSeriesRef.current?.setData(emaData);
  }, [emaData, mergedIndicators.ema.color]);

  useEffect(() => {
    chartRef.current?.priceScale("rsi").applyOptions({ visible: Boolean(mergedIndicators.rsi.enabled) });
    rsiSeriesRef.current?.applyOptions({ color: mergedIndicators.rsi.color });
    rsiSeriesRef.current?.setData(rsiData);

    const series = rsiSeriesRef.current;
    if (!series) return undefined;

    const overbought = series.createPriceLine({
      price: mergedIndicators.rsi.overbought,
      color: "rgba(244, 63, 94, 0.72)",
      lineWidth: 1,
      lineStyle: LineStyle.Dashed,
      axisLabelVisible: true,
      title: "OB",
    });
    const oversold = series.createPriceLine({
      price: mergedIndicators.rsi.oversold,
      color: "rgba(16, 185, 129, 0.72)",
      lineWidth: 1,
      lineStyle: LineStyle.Dashed,
      axisLabelVisible: true,
      title: "OS",
    });

    return () => {
      series.removePriceLine(overbought);
      series.removePriceLine(oversold);
    };
  }, [mergedIndicators.rsi.color, mergedIndicators.rsi.overbought, mergedIndicators.rsi.oversold, rsiData]);

  useEffect(() => {
    chartRef.current?.priceScale("oscillator").applyOptions({ visible: Boolean(mergedIndicators.stochastic.enabled) });
    stochasticKSeriesRef.current?.applyOptions({ color: mergedIndicators.stochastic.kColor });
    stochasticDSeriesRef.current?.applyOptions({ color: mergedIndicators.stochastic.dColor });
    stochasticKSeriesRef.current?.setData(stochasticData.k);
    stochasticDSeriesRef.current?.setData(stochasticData.d);
  }, [mergedIndicators.stochastic.dColor, mergedIndicators.stochastic.kColor, stochasticData]);

  useEffect(() => {
    redrawOverlay();
  }, [redrawOverlay]);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        setDraftTool(null);
        setDraftPoint(null);
        setToolMode("cursor");
        onToolChange?.("cursor");
        return;
      }

      if ((event.key === "Delete" || event.key === "Backspace") && selectedToolId) {
        commitTools((current) => current.filter((tool) => tool.id !== selectedToolId));
        setSelectedToolId(null);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [commitTools, onToolChange, selectedToolId]);

  const handlePointerDown = useCallback((event) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);

    const rawPoint = canvasPointToDataPoint(event);
    if (!rawPoint) return;

    if (toolMode === "cursor") return;

    if (toolMode === "select") {
      const hit = hitTestTool(event);
      setSelectedToolId(hit?.tool.id || null);
      interactionRef.current = hit
        ? {
          type: "drag",
          toolId: hit.tool.id,
          handleIndex: hit.handleIndex,
          startPoint: rawPoint,
          startCursor: hit.cursor,
          hasMoved: false,
          originalTool: hit.tool,
        }
        : null;
      return;
    }

    const point = applyMagnetToPoint(rawPoint);
    const requiredPoints = toolRequiredPoints(toolMode);
    const toolType = storedToolType(toolMode);
    const direction = toolDirection(toolMode);
    if (!draftTool) {
      if (requiredPoints === 1) {
        const newTool = {
          id: createId(toolType),
          type: toolType,
          ...(direction ? { direction } : {}),
          points: [point],
          levels: effectiveFibLevels,
          ...defaultToolStyle(toolType, mergedDrawingSettings),
        };
        completeTool(newTool);
        return;
      }

      setDraftTool({
        id: createId(toolType),
        type: toolType,
        ...(direction ? { direction } : {}),
        points: [point],
        levels: effectiveFibLevels,
        ...defaultToolStyle(toolType, mergedDrawingSettings),
      });
      setDraftPoint(point);
      return;
    }

    const nextPoints = [...draftTool.points, point];
    if (nextPoints.length >= requiredPoints) {
      const newTool = {
        ...draftTool,
        points: nextPoints,
        ...(draftTool.type === "position" && !draftTool.direction
          ? { direction: inferPositionDirection(nextPoints) }
          : {}),
      };
      completeTool(newTool);
      setDraftTool(null);
      setDraftPoint(null);
    } else {
      setDraftTool({ ...draftTool, points: nextPoints });
      setDraftPoint(point);
    }
  }, [
    applyMagnetToPoint,
    canvasPointToDataPoint,
    completeTool,
    draftTool,
    effectiveFibLevels,
    hitTestTool,
    mergedDrawingSettings,
    toolMode,
  ]);

  const handlePointerMove = useCallback((event) => {
    const rawPoint = canvasPointToDataPoint(event);
    if (!rawPoint) return;

    if (draftTool) {
      setDraftPoint(applyMagnetToPoint(rawPoint));
      return;
    }

    const interaction = interactionRef.current;
    if (!interaction) return;

    if (!interaction.hasMoved && interaction.startCursor) {
      const overlay = overlayRef.current;
      const rect = overlay?.getBoundingClientRect();
      const cursor = rect
        ? { x: event.clientX - rect.left, y: event.clientY - rect.top }
        : null;

      if (cursor && Math.hypot(cursor.x - interaction.startCursor.x, cursor.y - interaction.startCursor.y) < 4) {
        return;
      }

      interaction.hasMoved = true;
    }

    commitTools((current) => current.map((tool) => {
      if (tool.id !== interaction.toolId) return tool;

      const points = [...interaction.originalTool.points];
      if (interaction.handleIndex !== null) {
        points[interaction.handleIndex] = applyMagnetToPoint(rawPoint);
      } else {
        const priceDelta = rawPoint.price - interaction.startPoint.price;
        const startLogical = pointToLogical(interaction.startPoint);
        const currentLogical = pointToLogical(rawPoint);
        const logicalDelta = Number.isFinite(startLogical) && Number.isFinite(currentLogical)
          ? currentLogical - startLogical
          : null;
        const timeDelta = logicalDelta === null && typeof rawPoint.time === "number" && typeof interaction.startPoint.time === "number"
          ? rawPoint.time - interaction.startPoint.time
          : null;

        points.forEach((toolPoint, index) => {
          const originalLogical = pointToLogical(toolPoint);
          const nextLogical = logicalDelta !== null && Number.isFinite(originalLogical)
            ? originalLogical + logicalDelta
            : null;
          const nextTime = nextLogical !== null
            ? logicalToNearestTime(nextLogical) ?? toolPoint.time
            : typeof toolPoint.time === "number" && timeDelta !== null
              ? toolPoint.time + timeDelta
              : toolPoint.time;

          points[index] = {
            time: nextTime,
            price: toolPoint.price + priceDelta,
            ...(nextLogical !== null ? { logical: nextLogical } : {}),
          };
        });
      }

      return { ...tool, points };
    }));
  }, [applyMagnetToPoint, canvasPointToDataPoint, commitTools, draftTool, logicalToNearestTime, pointToLogical]);

  const handlePointerUp = useCallback((event) => {
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture?.(event.pointerId);
    }
    interactionRef.current = null;
  }, []);

  const handleRootPointerDownCapture = useCallback((event) => {
    if (event.target.closest?.("[data-drawing-toolbar='true']")) return;
    if (event.button !== 0) return;

    const point = canvasPointToDataPoint(event);

    if (event.shiftKey && point) {
      event.preventDefault();
      event.stopPropagation();
      const measure = {
        id: "transient-measure",
        type: "measure",
        points: [point, point],
        levels: effectiveFibLevels,
        dashed: true,
        ...defaultToolStyle("measure", mergedDrawingSettings),
      };
      transientMeasureRef.current = { pointerId: event.pointerId };
      setTransientMeasure(measure);
      event.currentTarget.setPointerCapture?.(event.pointerId);
      return;
    }

    if (draftTool) return;
    if (toolMode !== "cursor" && toolMode !== "select") return;

    const hit = hitTestTool(event);

    if (hit && point) {
      event.preventDefault();
      event.stopPropagation();
      beginToolInteraction(event, hit, point);
      return;
    }

    if (toolMode === "select") {
      event.preventDefault();
      event.stopPropagation();
    }

    setSelectedToolId(null);
  }, [
    beginToolInteraction,
    canvasPointToDataPoint,
    draftTool,
    effectiveFibLevels,
    hitTestTool,
    mergedDrawingSettings,
    toolMode,
  ]);

  const handleRootDoubleClickCapture = useCallback((event) => {
    if (event.target.closest?.("[data-drawing-toolbar='true']")) return;
    if (toolMode !== "cursor" && toolMode !== "select") return;

    const hit = hitTestTool(event);
    if (!hit) return;

    event.preventDefault();
    event.stopPropagation();
    setSelectedToolId(hit.tool.id);
    onToolSettingsRequestRef.current?.(hit.tool);
  }, [hitTestTool, toolMode]);

  const handleRootPointerMove = useCallback((event) => {
    if (transientMeasureRef.current) {
      const point = canvasPointToDataPoint(event);
      if (!point) return;
      event.preventDefault();
      event.stopPropagation();
      setTransientMeasure((current) => (
        current ? { ...current, points: [current.points[0], point] } : current
      ));
      return;
    }

    if (toolMode !== "cursor" && toolMode !== "select") return;
    if (!interactionRef.current) return;
    event.preventDefault();
    handlePointerMove(event);
  }, [canvasPointToDataPoint, handlePointerMove, toolMode]);

  const handleRootPointerUp = useCallback((event) => {
    if (transientMeasureRef.current) {
      if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
        event.currentTarget.releasePointerCapture?.(event.pointerId);
      }
      transientMeasureRef.current = null;
      setTransientMeasure(null);
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    if (toolMode !== "cursor" && toolMode !== "select") return;
    if (!interactionRef.current) return;
    handlePointerUp(event);
  }, [handlePointerUp, toolMode]);

  return (
    <div
      ref={rootRef}
      className={`relative isolate h-full min-h-0 w-full overflow-hidden rounded-xl border shadow-sm ${className}`}
      style={{
        borderColor: getTheme(theme).grid,
        background: getTheme(theme).gradient,
      }}
      onPointerDownCapture={handleRootPointerDownCapture}
      onDoubleClickCapture={handleRootDoubleClickCapture}
      onPointerMove={handleRootPointerMove}
      onPointerUp={handleRootPointerUp}
      onPointerLeave={handleRootPointerUp}
    >
      <div ref={chartHostRef} className="absolute inset-0 z-0" />
      <canvas
        ref={overlayRef}
        className="absolute inset-0 z-20"
        style={{
          pointerEvents: toolMode === "cursor" || toolMode === "select" ? "none" : "auto",
          cursor: toolMode === "cursor" ? "default" : "crosshair",
          touchAction: "none",
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
      />
      {selectedTool && selectedToolbarPosition && (
        <div
          data-drawing-toolbar="true"
          className="absolute z-30 flex h-10 items-center gap-1 rounded-md border px-1.5 shadow-xl backdrop-blur"
          style={{
            left: `${selectedToolbarPosition.x}px`,
            top: `${selectedToolbarPosition.y}px`,
            borderColor: getTheme(theme).grid,
            background: theme === "dark" ? "rgba(9, 12, 16, 0.94)" : "rgba(255, 255, 255, 0.94)",
            color: getTheme(theme).text,
          }}
          onPointerDown={(event) => {
            event.stopPropagation();
          }}
          onDoubleClick={(event) => {
            event.stopPropagation();
          }}
        >
          <label className="grid h-8 w-8 cursor-pointer place-items-center rounded border border-transparent text-zinc-300 hover:border-[#2f363d] hover:bg-white/5" title="Line color">
            <Palette className="h-4 w-4" aria-hidden="true" />
            <input
              type="color"
              value={colorToHex(selectedTool.color || mergedDrawingSettings.color)}
              onChange={(event) => patchSelectedTool({ color: event.target.value })}
              className="sr-only"
              aria-label="Selected drawing line color"
            />
          </label>

          <select
            value={String(selectedTool.lineWidth || mergedDrawingSettings.lineWidth || 2)}
            onChange={(event) => patchSelectedTool({ lineWidth: Number(event.target.value) })}
            className="h-8 rounded border border-[#2f363d] bg-[#09090b] px-2 text-xs text-zinc-100 outline-none"
            aria-label="Selected drawing line width"
            title="Line width"
          >
            {[1, 2, 3, 4, 5, 6, 8].map((width) => (
              <option key={width} value={width}>{width}px</option>
            ))}
          </select>

          <button
            type="button"
            onClick={duplicateSelectedTool}
            className="grid h-8 w-8 place-items-center rounded border border-transparent text-zinc-300 hover:border-[#2f363d] hover:bg-white/5"
            aria-label="Duplicate drawing"
            title="Duplicate"
          >
            <Copy className="h-4 w-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={requestSelectedToolSettings}
            className="grid h-8 w-8 place-items-center rounded border border-transparent text-zinc-300 hover:border-[#2f363d] hover:bg-white/5"
            aria-label="Drawing settings"
            title="Settings"
          >
            <Settings className="h-4 w-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={deleteSelectedToolById}
            className="grid h-8 w-8 place-items-center rounded border border-transparent text-zinc-300 hover:border-[#2f363d] hover:bg-white/5 hover:text-rose-300"
            aria-label="Delete drawing"
            title="Delete"
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      )}
      {showToolBadge && (
        <div className="pointer-events-none absolute left-3 top-3 rounded-md border px-2 py-1 text-xs font-medium shadow-sm backdrop-blur"
          style={{
            borderColor: getTheme(theme).grid,
            color: getTheme(theme).text,
            background: theme === "dark" ? "rgba(22, 27, 34, 0.78)" : "rgba(255, 255, 255, 0.78)",
          }}
        >
          Tool: {toolMode}
        </div>
      )}
    </div>
  );
});

function drawArrow(context, start, end) {
  const angle = Math.atan2(end.y - start.y, end.x - start.x);
  const arrowSize = 12;

  context.beginPath();
  context.moveTo(start.x, start.y);
  context.lineTo(end.x, end.y);
  context.stroke();

  context.beginPath();
  context.moveTo(end.x, end.y);
  context.lineTo(
    end.x - arrowSize * Math.cos(angle - Math.PI / 6),
    end.y - arrowSize * Math.sin(angle - Math.PI / 6),
  );
  context.lineTo(
    end.x - arrowSize * Math.cos(angle + Math.PI / 6),
    end.y - arrowSize * Math.sin(angle + Math.PI / 6),
  );
  context.closePath();
  context.fill();
}

function drawExtendedLine(context, start, end, rayOnly) {
  const width = context.canvas.clientWidth;
  const dx = end.x - start.x;
  const dy = end.y - start.y;

  if (Math.abs(dx) < 0.001) {
    context.beginPath();
    context.moveTo(start.x, rayOnly ? start.y : 0);
    context.lineTo(start.x, rayOnly ? context.canvas.clientHeight : context.canvas.clientHeight);
    context.stroke();
    return;
  }

  const slope = dy / dx;
  const leftX = rayOnly ? start.x : 0;
  const rightX = width;
  const leftY = start.y + slope * (leftX - start.x);
  const rightY = start.y + slope * (rightX - start.x);

  context.beginPath();
  context.moveTo(leftX, leftY);
  context.lineTo(rightX, rightY);
  context.stroke();
}

function drawFibRetracement(context, start, end, levels, tool) {
  const left = Math.min(start.x, end.x);
  const right = Math.max(start.x, end.x);
  const top = Math.min(start.y, end.y);
  const height = Math.abs(end.y - start.y);

  if (height > 1) {
    context.save();
    context.setLineDash([]);
    context.fillStyle = tool.fill || "rgba(56, 189, 248, 0.08)";
    context.fillRect(left, top, right - left, height);
    context.restore();
  }

  levels.forEach((level) => {
    if (level.visible === false) return;
    const value = Number(level.value);
    const y = start.y + (end.y - start.y) * value;
    context.strokeStyle = level.color || tool.color || context.strokeStyle;
    context.beginPath();
    context.moveTo(left, y);
    context.lineTo(right, y);
    context.stroke();
    context.fillStyle = tool.labelColor || context.strokeStyle;
    context.fillText(level.label || formatFibLevel(value), right + 6, y - 3);
  });
}

function drawFibExtension(context, start, end, anchor, levels, tool) {
  const priceVectorY = end.y - start.y;
  const left = Math.min(end.x, anchor.x);
  const right = Math.max(end.x, anchor.x) + 160;

  levels.forEach((level) => {
    if (level.visible === false) return;
    const value = Number(level.value);
    const y = anchor.y + priceVectorY * value;
    context.strokeStyle = level.color || tool.color || context.strokeStyle;
    context.beginPath();
    context.moveTo(left, y);
    context.lineTo(right, y);
    context.stroke();
    context.fillStyle = tool.labelColor || context.strokeStyle;
    context.fillText(level.label || formatFibLevel(value), right + 6, y - 3);
  });
}

function drawMeasureTool(context, start, end, tool) {
  const left = Math.min(start.x, end.x);
  const right = Math.max(start.x, end.x);
  const top = Math.min(start.y, end.y);
  const bottom = Math.max(start.y, end.y);
  const width = Math.max(1, right - left);
  const height = Math.max(1, bottom - top);
  const [startData, endData] = tool.points || [];
  const priceDelta = Number(endData?.price) - Number(startData?.price);
  const percent = Number.isFinite(priceDelta) && Number(startData?.price)
    ? (priceDelta / Number(startData.price)) * 100
    : 0;
  const startLogical = Number(startData?.logical);
  const endLogical = Number(endData?.logical);
  const bars = Number.isFinite(startLogical) && Number.isFinite(endLogical)
    ? Math.abs(Math.round(endLogical - startLogical))
    : Math.abs(Math.round((Number(endData?.time) - Number(startData?.time)) / 60)) || 0;
  const label = `${priceDelta >= 0 ? "+" : ""}${priceDelta.toFixed(2)} (${percent >= 0 ? "+" : ""}${percent.toFixed(2)}%)  ${bars} bars`;

  context.save();
  context.setLineDash([5, 5]);
  context.strokeStyle = tool.color || "#f8fafc";
  context.fillStyle = tool.fill || "rgba(96, 165, 250, 0.12)";
  context.lineWidth = Math.max(1, Number(tool.lineWidth) || 1);
  context.fillRect(left, top, width, height);
  context.strokeRect(left, top, width, height);
  context.setLineDash([]);
  context.beginPath();
  context.moveTo(start.x, start.y);
  context.lineTo(end.x, end.y);
  context.stroke();

  context.font = "11px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
  const textWidth = context.measureText(label).width;
  const labelX = Math.max(4, Math.min(context.canvas.clientWidth - textWidth - 14, (left + right) / 2 - textWidth / 2 - 7));
  const labelY = Math.max(4, top - 26);
  context.fillStyle = "rgba(9, 12, 16, 0.92)";
  context.fillRect(labelX, labelY, textWidth + 14, 20);
  context.strokeStyle = "rgba(148, 163, 184, 0.45)";
  context.strokeRect(labelX, labelY, textWidth + 14, 20);
  context.fillStyle = tool.color || "#f8fafc";
  context.fillText(label, labelX + 7, labelY + 14);
  context.restore();
}

function drawPositionTool(context, entry, target, stop, tool) {
  const left = Math.min(entry.x, target.x, stop.x);
  const right = Math.max(entry.x, target.x, stop.x);
  const rewardTop = Math.min(entry.y, target.y);
  const rewardHeight = Math.abs(target.y - entry.y);
  const riskTop = Math.min(entry.y, stop.y);
  const riskHeight = Math.abs(stop.y - entry.y);
  const [entryData, targetData, stopData] = tool.points || [];
  const entryPrice = Number(entryData?.price);
  const targetPrice = Number(targetData?.price);
  const stopPrice = Number(stopData?.price);
  const inferredDirection = tool.direction || inferPositionDirection(tool.points);
  const isShort = inferredDirection === "short";
  const rewardPoints = isShort ? entryPrice - targetPrice : targetPrice - entryPrice;
  const riskPoints = isShort ? stopPrice - entryPrice : entryPrice - stopPrice;
  const reward = Math.abs(Number(rewardPoints));
  const risk = Math.abs(Number(riskPoints));
  const rr = risk > 0 ? reward / risk : 0;
  const rewardPercent = Number.isFinite(entryPrice) && Math.abs(entryPrice) > 0
    ? (reward / Math.abs(entryPrice)) * 100
    : 0;
  const riskPercent = Number.isFinite(entryPrice) && Math.abs(entryPrice) > 0
    ? (risk / Math.abs(entryPrice)) * 100
    : 0;
  const targetColor = tool.targetColor || "#10b981";
  const stopColor = tool.stopColor || "#f43f5e";

  context.save();
  context.setLineDash([]);
  context.fillStyle = tool.targetFill || "rgba(16, 185, 129, 0.18)";
  context.fillRect(left, rewardTop, right - left, rewardHeight);
  context.fillStyle = tool.stopFill || "rgba(244, 63, 94, 0.14)";
  context.fillRect(left, riskTop, right - left, riskHeight);

  context.strokeStyle = tool.color || "#d4d4d8";
  context.lineWidth = Math.max(1, Number(tool.lineWidth) || 1);
  context.beginPath();
  context.moveTo(left, entry.y);
  context.lineTo(right, entry.y);
  context.stroke();

  context.strokeStyle = targetColor;
  context.beginPath();
  context.moveTo(left, target.y);
  context.lineTo(right, target.y);
  context.stroke();

  context.strokeStyle = stopColor;
  context.beginPath();
  context.moveTo(left, stop.y);
  context.lineTo(right, stop.y);
  context.stroke();

  context.restore();

  const targetText = `TP ${formatTradePrice(targetPrice)} | +${formatPointsAndPips(reward, entryPrice)} (+${formatTradeNumber(rewardPercent, 2, 2)}%) | RR ${Number.isFinite(rr) ? formatTradeNumber(rr, 2, 2) : "-"}`;
  const stopText = `SL ${formatTradePrice(stopPrice)} | -${formatPointsAndPips(risk, entryPrice)} (-${formatTradeNumber(riskPercent, 2, 2)}%)`;
  const labelX = left + 6;

  drawPositionLabel(context, targetText, labelX, target.y - 22, targetColor);
  drawPositionLabel(context, stopText, labelX, stop.y + 4, stopColor);
}

export default LightweightTradingChart;
