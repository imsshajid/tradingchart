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
const TOOL_TYPES = new Set([
  "cursor",
  "select",
  "trendline",
  "horizontal-line",
  "rectangle",
  "arrow",
  "fib-retracement",
  "fib-extension",
  "position",
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

function clampNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function hexToRgb(hex) {
  const clean = String(hex || "#ffffff").replace("#", "");
  const value = Number.parseInt(clean.length === 3
    ? clean.split("").map((char) => char + char).join("")
    : clean, 16);

  return {
    r: (value >> 16) & 255,
    g: (value >> 8) & 255,
    b: value & 255,
  };
}

function rgbaFromHex(hex, alpha) {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${Math.max(0, Math.min(1, Number(alpha)))})`;
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

function toolRequiredPoints(type) {
  if (type === "cursor") return 0;
  if (type === "horizontal-line") return 1;
  if (type === "fib-extension") return 3;
  return 2;
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
    initialTools = [],
    activeTool = "cursor",
    onToolsChange,
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
  const lastFitTokenRef = useRef(fitContentToken);
  const hasInitialFitRef = useRef(false);
  const onChartTimeClickRef = useRef(onChartTimeClick);
  const redrawOverlayRef = useRef(() => {});
  const [toolMode, setToolMode] = useState(TOOL_TYPES.has(activeTool) ? activeTool : "cursor");
  const [tools, setTools] = useState(initialTools);
  const [selectedToolId, setSelectedToolId] = useState(null);
  const [draftTool, setDraftTool] = useState(null);
  const [draftPoint, setDraftPoint] = useState(null);
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

  const emitToolsChange = useCallback((nextTools) => {
    onToolsChange?.(nextTools);
    return nextTools;
  }, [onToolsChange]);

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

    const x = chart.timeScale().timeToCoordinate(point.time);
    const y = series.priceToCoordinate(point.price);

    return x === null || y === null ? null : { x, y };
  }, []);

  const canvasPointToDataPoint = useCallback((event) => {
    const overlay = overlayRef.current;
    const chart = chartRef.current;
    const series = candleSeriesRef.current;
    if (!overlay || !chart || !series) return null;

    const rect = overlay.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const time = chart.timeScale().coordinateToTime(x);
    const price = series.coordinateToPrice(y);

    if (time === null || price === null) return null;
    return { time, price };
  }, []);

  const drawTool = useCallback((context, tool, selected = false) => {
    const points = tool.points.map(dataPointToCanvasPoint).filter(Boolean);
    if (!points.length) return;

    const levels = tool.levels || fibLevels;
    context.save();
    context.lineWidth = selected ? 2 : 1.35;
    context.strokeStyle = selected ? "#60a5fa" : tool.color || "#94a3b8";
    context.fillStyle = tool.fill || "rgba(96, 165, 250, 0.12)";
    context.setLineDash(tool.dashed ? [6, 6] : []);

    if (tool.type === "horizontal-line") {
      context.beginPath();
      context.moveTo(0, points[0].y);
      context.lineTo(context.canvas.clientWidth, points[0].y);
      context.stroke();
    }

    if (tool.type === "trendline" && points[1]) {
      context.beginPath();
      context.moveTo(points[0].x, points[0].y);
      context.lineTo(points[1].x, points[1].y);
      context.stroke();
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

    if (tool.type === "fib-retracement" && points[1]) {
      drawFibRetracement(context, points[0], points[1], levels, tool);
    }

    if (tool.type === "fib-extension" && points[2]) {
      drawFibExtension(context, points[0], points[1], points[2], levels, tool);
    }

    if (tool.type === "position" && points[1] && points[2]) {
      drawPositionTool(context, points[0], points[1], points[2], tool);
    }

    if (selected) {
      context.setLineDash([]);
      context.fillStyle = "#60a5fa";
      points.forEach((point) => {
        context.beginPath();
        context.arc(point.x, point.y, 4, 0, Math.PI * 2);
        context.fill();
      });
    }

    context.restore();
  }, [dataPointToCanvasPoint, fibLevels]);

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
    context.fillStyle = gap.type === "bullish"
      ? mergedIndicators.fvg.bullColor
      : mergedIndicators.fvg.bearColor;
    context.strokeStyle = gap.type === "bullish"
      ? "rgba(16, 185, 129, 0.36)"
      : "rgba(244, 63, 94, 0.36)";
    context.lineWidth = 1;
    context.fillRect(x, y, width, height);
    context.strokeRect(x, y, width, height);
    context.restore();
  }, [
    dataPointToCanvasPoint,
    mergedIndicators.fvg.bearColor,
    mergedIndicators.fvg.bullColor,
  ]);

  const redrawOverlay = useCallback(() => {
    resize();
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
  }, [draftPoint, draftTool, drawFairValueGap, drawTool, fvgData, resize, selectedToolId, tools]);

  useEffect(() => {
    redrawOverlayRef.current = redrawOverlay;
  }, [redrawOverlay]);

  useEffect(() => {
    onChartTimeClickRef.current = onChartTimeClick;
  }, [onChartTimeClick]);

  const hitTestTool = useCallback((event) => {
    const overlay = overlayRef.current;
    if (!overlay) return null;

    const rect = overlay.getBoundingClientRect();
    const cursor = { x: event.clientX - rect.left, y: event.clientY - rect.top };

    for (let toolIndex = tools.length - 1; toolIndex >= 0; toolIndex -= 1) {
      const tool = tools[toolIndex];
      const points = tool.points.map(dataPointToCanvasPoint).filter(Boolean);

      for (let pointIndex = 0; pointIndex < points.length; pointIndex += 1) {
        if (Math.hypot(points[pointIndex].x - cursor.x, points[pointIndex].y - cursor.y) <= 8) {
          return { tool, handleIndex: pointIndex, cursor };
        }
      }

      if (tool.type === "horizontal-line" && points[0] && Math.abs(points[0].y - cursor.y) <= 6) {
        return { tool, handleIndex: null, cursor };
      }

      if (points[0] && points[1] && distanceToSegment(cursor, points[0], points[1]) <= 7) {
        return { tool, handleIndex: null, cursor };
      }

      if (tool.type === "rectangle" && points[0] && points[1]) {
        const left = Math.min(points[0].x, points[1].x);
        const right = Math.max(points[0].x, points[1].x);
        const top = Math.min(points[0].y, points[1].y);
        const bottom = Math.max(points[0].y, points[1].y);
        if (cursor.x >= left && cursor.x <= right && cursor.y >= top && cursor.y <= bottom) {
          return { tool, handleIndex: null, cursor };
        }
      }
    }

    return null;
  }, [dataPointToCanvasPoint, tools]);

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
      const nextTool = { id: createId(tool.type || "tool"), levels: fibLevels, ...tool };
      setTools((current) => emitToolsChange([...current, nextTool]));
      return nextTool.id;
    },
    updateTool(id, patch) {
      setTools((current) => emitToolsChange(
        current.map((tool) => (tool.id === id ? { ...tool, ...patch } : tool)),
      ));
    },
    deleteTool(id) {
      setTools((current) => emitToolsChange(current.filter((tool) => tool.id !== id)));
      setSelectedToolId((current) => (current === id ? null : current));
    },
    deleteSelectedTool() {
      if (!selectedToolId) return;
      setTools((current) => emitToolsChange(current.filter((tool) => tool.id !== selectedToolId)));
      setSelectedToolId(null);
    },
    clearTools() {
      setTools(emitToolsChange([]));
      setSelectedToolId(null);
    },
    fitContent() {
      chartRef.current?.timeScale().fitContent();
    },
  }), [emitToolsChange, fibLevels, selectedToolId, tools]);

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

    const redrawFromSubscription = () => redrawOverlayRef.current();
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
    redrawOverlay();
  }, [mergedChartSettings, redrawOverlay, theme, timezone]);

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
    redrawOverlay();
  }, [followLive, mergedVolumeSettings.heightRatio, mergedVolumeSettings.visible, redrawOverlay, styledData, volumeData]);

  useEffect(() => {
    if (lastFitTokenRef.current === fitContentToken) return;
    lastFitTokenRef.current = fitContentToken;
    chartRef.current?.timeScale().fitContent();
    redrawOverlay();
  }, [fitContentToken, redrawOverlay]);

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
      if ((event.key === "Delete" || event.key === "Backspace") && selectedToolId) {
        setTools((current) => emitToolsChange(current.filter((tool) => tool.id !== selectedToolId)));
        setSelectedToolId(null);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [emitToolsChange, selectedToolId]);

  const handlePointerDown = useCallback((event) => {
    const point = canvasPointToDataPoint(event);
    if (!point) return;

    if (toolMode === "cursor") return;

    if (toolMode === "select") {
      const hit = hitTestTool(event);
      setSelectedToolId(hit?.tool.id || null);
      interactionRef.current = hit
        ? {
          type: "drag",
          toolId: hit.tool.id,
          handleIndex: hit.handleIndex,
          startPoint: point,
          originalTool: hit.tool,
        }
        : null;
      return;
    }

    const requiredPoints = toolRequiredPoints(toolMode);
    if (!draftTool) {
      if (requiredPoints === 1) {
        const newTool = {
          id: createId(toolMode),
          type: toolMode,
          points: [point],
          levels: fibLevels,
        };
        setTools((current) => emitToolsChange([...current, newTool]));
        setSelectedToolId(newTool.id);
        return;
      }

      setDraftTool({
        id: createId(toolMode),
        type: toolMode,
        points: [point],
        levels: fibLevels,
      });
      setDraftPoint(point);
      return;
    }

    const nextPoints = [...draftTool.points, point];
    if (nextPoints.length >= requiredPoints) {
      const newTool = { ...draftTool, points: nextPoints };
      setTools((current) => emitToolsChange([...current, newTool]));
      setSelectedToolId(newTool.id);
      setDraftTool(null);
      setDraftPoint(null);
    } else {
      setDraftTool({ ...draftTool, points: nextPoints });
      setDraftPoint(point);
    }
  }, [canvasPointToDataPoint, draftTool, emitToolsChange, fibLevels, hitTestTool, toolMode]);

  const handlePointerMove = useCallback((event) => {
    const point = canvasPointToDataPoint(event);
    if (!point) return;

    if (draftTool) {
      setDraftPoint(point);
      return;
    }

    const interaction = interactionRef.current;
    if (!interaction) return;

    setTools((current) => emitToolsChange(current.map((tool) => {
      if (tool.id !== interaction.toolId) return tool;

      const points = [...interaction.originalTool.points];
      if (interaction.handleIndex !== null) {
        points[interaction.handleIndex] = point;
      } else {
        const priceDelta = point.price - interaction.startPoint.price;
        const timeDelta = typeof point.time === "number" && typeof interaction.startPoint.time === "number"
          ? point.time - interaction.startPoint.time
          : 0;
        points.forEach((toolPoint, index) => {
          points[index] = {
            time: typeof toolPoint.time === "number" ? toolPoint.time + timeDelta : toolPoint.time,
            price: toolPoint.price + priceDelta,
          };
        });
      }

      return { ...tool, points };
    })));
  }, [canvasPointToDataPoint, draftTool, emitToolsChange]);

  const handlePointerUp = useCallback(() => {
    interactionRef.current = null;
  }, []);

  return (
    <div
      ref={rootRef}
      className={`relative h-full min-h-0 w-full overflow-hidden rounded-xl border shadow-sm ${className}`}
      style={{
        borderColor: getTheme(theme).grid,
        background: getTheme(theme).gradient,
      }}
    >
      <div ref={chartHostRef} className="absolute inset-0" />
      <canvas
        ref={overlayRef}
        className="absolute inset-0 cursor-crosshair"
        style={{ pointerEvents: toolMode === "cursor" ? "none" : "auto" }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
      />
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

function drawFibRetracement(context, start, end, levels, tool) {
  const left = Math.min(start.x, end.x);
  const right = Math.max(start.x, end.x);

  levels.forEach((level) => {
    const y = start.y + (end.y - start.y) * level;
    context.beginPath();
    context.moveTo(left, y);
    context.lineTo(right, y);
    context.stroke();
    context.fillStyle = tool.labelColor || context.strokeStyle;
    context.fillText(String(level), right + 6, y - 3);
  });
}

function drawFibExtension(context, start, end, anchor, levels, tool) {
  const priceVectorY = end.y - start.y;
  const left = Math.min(end.x, anchor.x);
  const right = Math.max(end.x, anchor.x) + 160;

  levels.forEach((level) => {
    const y = anchor.y + priceVectorY * level;
    context.beginPath();
    context.moveTo(left, y);
    context.lineTo(right, y);
    context.stroke();
    context.fillStyle = tool.labelColor || context.strokeStyle;
    context.fillText(String(level), right + 6, y - 3);
  });
}

function drawPositionTool(context, entry, target, stop, tool) {
  const left = Math.min(entry.x, target.x, stop.x);
  const right = Math.max(entry.x, target.x, stop.x);
  const rewardTop = Math.min(entry.y, target.y);
  const rewardHeight = Math.abs(target.y - entry.y);
  const riskTop = Math.min(entry.y, stop.y);
  const riskHeight = Math.abs(stop.y - entry.y);
  const isShort = tool.direction === "short";

  context.save();
  context.setLineDash([]);
  context.fillStyle = isShort ? "rgba(244, 63, 94, 0.18)" : "rgba(16, 185, 129, 0.18)";
  context.fillRect(left, rewardTop, right - left, rewardHeight);
  context.fillStyle = isShort ? "rgba(16, 185, 129, 0.14)" : "rgba(244, 63, 94, 0.14)";
  context.fillRect(left, riskTop, right - left, riskHeight);

  context.strokeStyle = tool.color || "#d4d4d8";
  context.lineWidth = 1;
  context.beginPath();
  context.moveTo(left, entry.y);
  context.lineTo(right, entry.y);
  context.stroke();

  context.strokeStyle = isShort ? "#f43f5e" : "#10b981";
  context.beginPath();
  context.moveTo(left, target.y);
  context.lineTo(right, target.y);
  context.stroke();

  context.strokeStyle = isShort ? "#10b981" : "#f43f5e";
  context.beginPath();
  context.moveTo(left, stop.y);
  context.lineTo(right, stop.y);
  context.stroke();

  context.fillStyle = "#f8fafc";
  context.font = "11px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
  context.fillText(isShort ? "SHORT" : "LONG", left + 6, entry.y - 7);
  context.restore();
}

export default LightweightTradingChart;
