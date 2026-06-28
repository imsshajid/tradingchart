export type UnixTime = number;
export type FootprintTuple = [priceLevel: number, bidVolume: number, askVolume: number];

export type FootprintBar = {
  time: UnixTime;
  high: number;
  low: number;
  rows: FootprintTuple[];
};

export type FootprintCoordinateApi = {
  timeToX(time: UnixTime): number | null;
  priceToY(price: number): number | null;
  barWidth?: () => number;
};

export type FootprintLayerOptions = {
  tickSize: number;
  imbalanceRatio: number;
  minCellWidth: number;
  maxRowsPerBar: number;
  font: string;
  textColor: string;
  mutedTextColor: string;
  neutralFill: string;
  buyFill: string;
  sellFill: string;
  borderColor: string;
  opacity: number;
  showTextAtWidth: number;
};

const DEFAULT_OPTIONS: FootprintLayerOptions = {
  tickSize: 0.25,
  imbalanceRatio: 2,
  minCellWidth: 34,
  maxRowsPerBar: 120,
  font: "10px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
  textColor: "#f8fafc",
  mutedTextColor: "#a1a1aa",
  neutralFill: "rgba(31, 31, 35, 0.68)",
  buyFill: "rgba(16, 185, 129, 0.78)",
  sellFill: "rgba(244, 63, 94, 0.78)",
  borderColor: "rgba(255, 255, 255, 0.08)",
  opacity: 0.92,
  showTextAtWidth: 42,
};

type NormalizedRow = {
  price: number;
  bid: number;
  ask: number;
  total: number;
  imbalance: number;
  label: string;
};

type NormalizedBar = {
  time: UnixTime;
  high: number;
  low: number;
  rows: NormalizedRow[];
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function toFinite(value: unknown, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function hexToRgb(hex: string) {
  const clean = hex.replace("#", "");
  const value = Number.parseInt(clean.length === 3
    ? clean.split("").map((char) => char + char).join("")
    : clean, 16);

  return {
    r: (value >> 16) & 255,
    g: (value >> 8) & 255,
    b: value & 255,
  };
}

function rgbaParts(color: string) {
  if (color.startsWith("#")) {
    const { r, g, b } = hexToRgb(color);
    return { r, g, b, a: 1 };
  }

  const match = color.match(/rgba?\(([^)]+)\)/);
  if (!match) return { r: 31, g: 31, b: 35, a: 1 };

  const [r, g, b, a = 1] = match[1].split(",").map((part) => Number(part.trim()));
  return { r, g, b, a };
}

function mixColor(from: string, to: string, amount: number, opacity = 1) {
  const a = rgbaParts(from);
  const b = rgbaParts(to);
  const ratio = clamp(amount, 0, 1);

  return `rgba(${Math.round(a.r + (b.r - a.r) * ratio)}, ${Math.round(a.g + (b.g - a.g) * ratio)}, ${Math.round(a.b + (b.b - a.b) * ratio)}, ${clamp((a.a + (b.a - a.a) * ratio) * opacity, 0, 1)})`;
}

function normalizeRows(rows: FootprintTuple[], low: number, high: number, options: FootprintLayerOptions) {
  const byPrice = new Map<number, { bid: number; ask: number }>();
  const tickSize = Math.max(Number.EPSILON, options.tickSize);

  for (const [priceRaw, bidRaw, askRaw] of rows) {
    const price = Math.round(toFinite(priceRaw) / tickSize) * tickSize;
    if (price < low || price > high) continue;

    const current = byPrice.get(price) || { bid: 0, ask: 0 };
    current.bid += Math.max(0, toFinite(bidRaw));
    current.ask += Math.max(0, toFinite(askRaw));
    byPrice.set(price, current);
  }

  return Array.from(byPrice.entries())
    .sort((a, b) => b[0] - a[0])
    .slice(0, options.maxRowsPerBar)
    .map(([price, value]) => {
      const total = value.bid + value.ask;
      const imbalance = total <= 0 ? 0 : (value.ask - value.bid) / total;

      return {
        price,
        bid: value.bid,
        ask: value.ask,
        total,
        imbalance,
        label: `${Math.round(value.bid)}x${Math.round(value.ask)}`,
      };
    });
}

export class VolumeFootprintLayer {
  private canvas: HTMLCanvasElement;
  private context: CanvasRenderingContext2D;
  private coordinateApi: FootprintCoordinateApi;
  private options: FootprintLayerOptions;
  private bars: NormalizedBar[] = [];
  private animationFrame = 0;
  private dirty = true;
  private textCache = new Map<string, HTMLCanvasElement | OffscreenCanvas>();
  private resizeObserver?: ResizeObserver;

  constructor(canvas: HTMLCanvasElement, coordinateApi: FootprintCoordinateApi, options: Partial<FootprintLayerOptions> = {}) {
    const context = canvas.getContext("2d", { alpha: true });
    if (!context) throw new Error("VolumeFootprintLayer requires a 2D canvas context.");

    this.canvas = canvas;
    this.context = context;
    this.coordinateApi = coordinateApi;
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.resize();
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas);
  }

  setOptions(options: Partial<FootprintLayerOptions>) {
    this.options = { ...this.options, ...options };
    this.textCache.clear();
    this.bars = this.bars.map((bar) => ({
      ...bar,
      rows: normalizeRows(
        bar.rows.map((row) => [row.price, row.bid, row.ask]),
        bar.low,
        bar.high,
        this.options,
      ),
    }));
    this.requestRender();
  }

  setData(bars: FootprintBar[]) {
    this.bars = bars
      .map((bar) => ({
        time: toFinite(bar.time),
        high: toFinite(bar.high),
        low: toFinite(bar.low),
        rows: normalizeRows(bar.rows || [], toFinite(bar.low), toFinite(bar.high), this.options),
      }))
      .filter((bar) => bar.rows.length > 0)
      .sort((a, b) => a.time - b.time);

    this.textCache.clear();
    this.requestRender();
  }

  appendBar(bar: FootprintBar) {
    const normalized = {
      time: toFinite(bar.time),
      high: toFinite(bar.high),
      low: toFinite(bar.low),
      rows: normalizeRows(bar.rows || [], toFinite(bar.low), toFinite(bar.high), this.options),
    };

    const existingIndex = this.bars.findIndex((entry) => entry.time === normalized.time);
    if (existingIndex >= 0) this.bars[existingIndex] = normalized;
    else this.bars.push(normalized);

    this.bars.sort((a, b) => a.time - b.time);
    this.requestRender();
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    const ratio = window.devicePixelRatio || 1;
    const width = Math.max(1, Math.floor(rect.width * ratio));
    const height = Math.max(1, Math.floor(rect.height * ratio));

    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
      this.canvas.style.width = `${Math.floor(rect.width)}px`;
      this.canvas.style.height = `${Math.floor(rect.height)}px`;
      this.requestRender();
    }
  }

  requestRender() {
    this.dirty = true;
    if (this.animationFrame) return;

    this.animationFrame = window.requestAnimationFrame(() => {
      this.animationFrame = 0;
      if (!this.dirty) return;
      this.dirty = false;
      this.render();
    });
  }

  destroy() {
    if (this.animationFrame) window.cancelAnimationFrame(this.animationFrame);
    this.resizeObserver?.disconnect();
    this.textCache.clear();
    this.clear();
  }

  private clear() {
    this.context.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  private getTextBitmap(text: string, color: string) {
    const key = `${this.options.font}|${color}|${text}`;
    const cached = this.textCache.get(key);
    if (cached) return cached;

    const context = this.context;
    context.save();
    context.font = this.options.font;
    const metrics = context.measureText(text);
    context.restore();

    const width = Math.ceil(metrics.width) + 8;
    const height = 16;
    const bitmap = typeof OffscreenCanvas !== "undefined"
      ? new OffscreenCanvas(width, height)
      : document.createElement("canvas");
    bitmap.width = width;
    bitmap.height = height;

    const bitmapContext = bitmap.getContext("2d");
    if (!bitmapContext) return bitmap;

    bitmapContext.font = this.options.font;
    bitmapContext.textAlign = "center";
    bitmapContext.textBaseline = "middle";
    bitmapContext.fillStyle = color;
    bitmapContext.fillText(text, width / 2, height / 2);
    this.textCache.set(key, bitmap);

    return bitmap;
  }

  private cellFill(row: NormalizedRow) {
    const ratio = this.options.imbalanceRatio;
    const askDominance = row.bid === 0 ? row.ask : row.ask / Math.max(1, row.bid);
    const bidDominance = row.ask === 0 ? row.bid : row.bid / Math.max(1, row.ask);

    if (askDominance >= ratio) {
      return mixColor(this.options.neutralFill, this.options.buyFill, clamp((askDominance - 1) / ratio, 0, 1), this.options.opacity);
    }

    if (bidDominance >= ratio) {
      return mixColor(this.options.neutralFill, this.options.sellFill, clamp((bidDominance - 1) / ratio, 0, 1), this.options.opacity);
    }

    const directionalStrength = Math.abs(row.imbalance);
    const target = row.imbalance >= 0 ? this.options.buyFill : this.options.sellFill;
    return mixColor(this.options.neutralFill, target, directionalStrength * 0.65, this.options.opacity);
  }

  private render() {
    const ratio = window.devicePixelRatio || 1;
    const cssWidth = this.canvas.width / ratio;
    const cssHeight = this.canvas.height / ratio;
    const context = this.context;
    const defaultBarWidth = this.coordinateApi.barWidth?.() ?? 48;
    const cellWidth = Math.max(this.options.minCellWidth, Math.min(96, defaultBarWidth * 0.9));

    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, cssWidth, cssHeight);
    context.font = this.options.font;
    context.textAlign = "center";
    context.textBaseline = "middle";

    for (const bar of this.bars) {
      const x = this.coordinateApi.timeToX(bar.time);
      if (x === null || x < -cellWidth || x > cssWidth + cellWidth) continue;

      for (const row of bar.rows) {
        const yTop = this.coordinateApi.priceToY(row.price + this.options.tickSize / 2);
        const yBottom = this.coordinateApi.priceToY(row.price - this.options.tickSize / 2);
        if (yTop === null || yBottom === null) continue;

        const y = Math.min(yTop, yBottom);
        const height = Math.max(9, Math.abs(yBottom - yTop));
        if (y > cssHeight || y + height < 0) continue;

        const left = x - cellWidth / 2;
        const top = y;

        context.fillStyle = this.cellFill(row);
        context.fillRect(left, top, cellWidth, height);
        context.strokeStyle = this.options.borderColor;
        context.strokeRect(left + 0.5, top + 0.5, cellWidth - 1, height - 1);

        if (cellWidth >= this.options.showTextAtWidth && height >= 12) {
          const color = Math.abs(row.imbalance) > 0.42 ? this.options.textColor : this.options.mutedTextColor;
          const bitmap = this.getTextBitmap(row.label, color);
          const bitmapWidth = bitmap.width;
          const bitmapHeight = bitmap.height;
          context.drawImage(
            bitmap,
            left + cellWidth / 2 - bitmapWidth / 2,
            top + height / 2 - bitmapHeight / 2,
            bitmapWidth,
            bitmapHeight,
          );
        }
      }
    }
  }
}

export function createFootprintOverlay(container: HTMLElement, coordinateApi: FootprintCoordinateApi, options?: Partial<FootprintLayerOptions>) {
  const canvas = document.createElement("canvas");
  canvas.setAttribute("aria-hidden", "true");
  Object.assign(canvas.style, {
    position: "absolute",
    inset: "0",
    width: "100%",
    height: "100%",
    pointerEvents: "none",
    zIndex: "5",
  });

  const currentPosition = window.getComputedStyle(container).position;
  if (currentPosition === "static") container.style.position = "relative";

  container.appendChild(canvas);
  const layer = new VolumeFootprintLayer(canvas, coordinateApi, options);

  return {
    canvas,
    layer,
    destroy() {
      layer.destroy();
      canvas.remove();
    },
  };
}

export function createLightweightChartsFootprintAdapter(chart: any, candleSeries: any): FootprintCoordinateApi {
  return {
    timeToX(time) {
      return chart.timeScale().timeToCoordinate(time);
    },
    priceToY(price) {
      return candleSeries.priceToCoordinate(price);
    },
    barWidth() {
      const width = chart.timeScale().width?.() || 0;
      const logicalRange = chart.timeScale().getVisibleLogicalRange?.();
      if (!logicalRange || width <= 0) return 48;

      const visibleBars = Math.max(1, logicalRange.to - logicalRange.from);
      return width / visibleBars;
    },
  };
}

export function simulateFootprintRows(low: number, high: number, tickSize: number, seed = 1): FootprintTuple[] {
  const rows: FootprintTuple[] = [];
  let random = seed;
  const next = () => {
    random = (random * 16807) % 2147483647;
    return (random - 1) / 2147483646;
  };

  for (let price = low; price <= high + tickSize / 2; price += tickSize) {
    const bid = Math.round(40 + next() * 520);
    const ask = Math.round(40 + next() * 520);
    rows.push([Number(price.toFixed(8)), bid, ask]);
  }

  return rows;
}

/*
Usage with Lightweight Charts:

const overlay = createFootprintOverlay(
  chartContainer,
  createLightweightChartsFootprintAdapter(chart, candlestickSeries),
  { tickSize: 0.25, imbalanceRatio: 2 }
);

overlay.layer.setData([
  {
    time: 1715601600,
    low: 2384.25,
    high: 2388.75,
    rows: [
      [2384.25, 120, 450],
      [2384.50, 310, 90],
    ],
  },
]);

chart.timeScale().subscribeVisibleLogicalRangeChange(() => overlay.layer.requestRender());
*/
