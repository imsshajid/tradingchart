(() => {
  "use strict";

  const COLORS = {
    bg: "#09090b",
    card: "#0c0c0e",
    border: "#1f1f23",
    text: "#e4e4e7",
    muted: "#a1a1aa",
    dim: "#71717a",
    green: "#10b981",
    red: "#f43f5e",
    amber: "#f59e0b",
  };

  const DEFAULT_TICKER = "AAPL";
  const DEFAULT_PANEL_COUNT = 1;
  const SMA_PERIOD = 20;
  const MAX_FVG_BOXES = 64;
  const FVG_EXTEND_BARS = 12;
  const PANEL_COUNTS = new Set([1, 2, 4, 6, 8]);
  const DATA_ENDPOINT = "/api/market-engine";

  const dashboard = {
    workspace: null,
    layoutPicker: null,
    statusLabel: null,
    panes: [],
    workspaceObserver: null,
    activePanelCount: DEFAULT_PANEL_COUNT,
  };

  function qs(selector, root = document) {
    return root.querySelector(selector);
  }

  function createElement(tagName, options = {}) {
    const element = document.createElement(tagName);

    if (options.className) element.className = options.className;
    if (options.textContent !== undefined) element.textContent = options.textContent;
    if (options.attributes) {
      for (const [key, value] of Object.entries(options.attributes)) {
        element.setAttribute(key, value);
      }
    }
    if (options.styles) {
      Object.assign(element.style, options.styles);
    }

    return element;
  }

  function setStatus(message, tone = "neutral") {
    if (!dashboard.statusLabel) return;

    dashboard.statusLabel.textContent = message;
    dashboard.statusLabel.style.color = tone === "error"
      ? COLORS.red
      : tone === "success"
        ? COLORS.green
        : COLORS.text;
  }

  function sanitizeTicker(value) {
    const ticker = String(value || DEFAULT_TICKER).trim().toUpperCase();
    return /^[A-Z0-9.^-]{1,16}$/.test(ticker) ? ticker : DEFAULT_TICKER;
  }

  function toFiniteNumber(value) {
    if (value === null || value === undefined || value === "") return null;

    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  function normalizeCandle(candle) {
    return {
      time: toFiniteNumber(candle.time),
      open: toFiniteNumber(candle.open),
      high: toFiniteNumber(candle.high),
      low: toFiniteNumber(candle.low),
      close: toFiniteNumber(candle.close),
      volume: toFiniteNumber(candle.volume),
    };
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

  async function fetchCandles(ticker) {
    const query = new URLSearchParams({ ticker }).toString();
    let lastError = null;

    try {
      const response = await fetch(`${DATA_ENDPOINT}?${query}`, {
        method: "GET",
        headers: { Accept: "application/json" },
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error(`${DATA_ENDPOINT} returned ${response.status}`);
      }

      const payload = await response.json();
      if (!payload?.success || !Array.isArray(payload.data)) {
        throw new Error(payload?.error || `${DATA_ENDPOINT} returned malformed data`);
      }

      return payload.data.map(normalizeCandle).filter(isCompleteCandle);
    } catch (error) {
      lastError = error;
    }

    throw lastError || new Error("No market data endpoint responded.");
  }

  function calculateSma(candles, period = SMA_PERIOD) {
    if (!Number.isInteger(period) || period < 2) return [];

    const points = [];
    let sum = 0;

    for (let index = 0; index < candles.length; index += 1) {
      sum += candles[index].close;

      if (index >= period) {
        sum -= candles[index - period].close;
      }

      if (index >= period - 1) {
        points.push({
          time: candles[index].time,
          value: Number((sum / period).toFixed(4)),
        });
      }
    }

    return points;
  }

  function calculateFairValueGaps(candles) {
    const gaps = [];

    for (let index = 2; index < candles.length; index += 1) {
      const first = candles[index - 2];
      const third = candles[index];
      const endIndex = Math.min(candles.length - 1, index + FVG_EXTEND_BARS);

      if (first.high < third.low) {
        gaps.push({
          type: "bullish",
          startTime: first.time,
          endTime: candles[endIndex].time,
          top: third.low,
          bottom: first.high,
          fill: "rgba(16, 185, 129, 0.14)",
          stroke: "rgba(16, 185, 129, 0.34)",
        });
      }

      if (first.low > third.high) {
        gaps.push({
          type: "bearish",
          startTime: first.time,
          endTime: candles[endIndex].time,
          top: first.low,
          bottom: third.high,
          fill: "rgba(244, 63, 94, 0.13)",
          stroke: "rgba(244, 63, 94, 0.34)",
        });
      }
    }

    return gaps.slice(-MAX_FVG_BOXES);
  }

  function drawFvgBoxes(context, boxes, chart, series, horizontalRatio, verticalRatio) {
    if (!chart || !series || !boxes.length) return;

    for (const box of boxes) {
      const xStart = chart.timeScale().timeToCoordinate(box.startTime);
      const xEnd = chart.timeScale().timeToCoordinate(box.endTime);
      const yTop = series.priceToCoordinate(box.top);
      const yBottom = series.priceToCoordinate(box.bottom);

      if ([xStart, xEnd, yTop, yBottom].some((value) => value === null)) {
        continue;
      }

      const x = Math.round(Math.min(xStart, xEnd) * horizontalRatio);
      const y = Math.round(Math.min(yTop, yBottom) * verticalRatio);
      const width = Math.max(2, Math.round(Math.abs(xEnd - xStart) * horizontalRatio));
      const height = Math.max(2, Math.round(Math.abs(yBottom - yTop) * verticalRatio));

      context.fillStyle = box.fill;
      context.strokeStyle = box.stroke;
      context.lineWidth = Math.max(1, Math.round(horizontalRatio));
      context.fillRect(x, y, width, height);
      context.strokeRect(x + 0.5, y + 0.5, Math.max(1, width - 1), Math.max(1, height - 1));
    }
  }

  class FvgPaneRenderer {
    constructor() {
      this.chart = null;
      this.series = null;
      this.boxes = [];
    }

    update(chart, series, boxes) {
      this.chart = chart;
      this.series = series;
      this.boxes = boxes;
    }

    draw(target) {
      target.useBitmapCoordinateSpace((scope) => {
        drawFvgBoxes(
          scope.context,
          this.boxes,
          this.chart,
          this.series,
          scope.horizontalPixelRatio,
          scope.verticalPixelRatio,
        );
      });
    }
  }

  class FvgPaneView {
    constructor(renderer) {
      this.rendererInstance = renderer;
    }

    update(chart, series, boxes) {
      this.rendererInstance.update(chart, series, boxes);
    }

    renderer() {
      return this.rendererInstance;
    }
  }

  class FvgPrimitive {
    constructor(boxes) {
      this.boxes = boxes;
      this.chart = null;
      this.series = null;
      this.requestUpdate = null;
      this.rendererInstance = new FvgPaneRenderer();
      this.view = new FvgPaneView(this.rendererInstance);
    }

    attached(params) {
      this.chart = params.chart;
      this.series = params.series;
      this.requestUpdate = params.requestUpdate;
      this.requestUpdate?.();
    }

    detached() {
      this.chart = null;
      this.series = null;
      this.requestUpdate = null;
    }

    updateAllViews() {
      this.view.update(this.chart, this.series, this.boxes);
    }

    paneViews() {
      return [this.view];
    }

    setBoxes(boxes) {
      this.boxes = boxes;
      this.requestUpdate?.();
    }
  }

  function createCanvasFvgRenderer(pane, boxes) {
    const canvas = createElement("canvas", {
      attributes: { "aria-hidden": "true" },
      styles: {
        position: "absolute",
        inset: "0",
        width: "100%",
        height: "100%",
        pointerEvents: "none",
        zIndex: "3",
      },
    });

    const context = canvas.getContext("2d");
    let activeBoxes = boxes;
    let frame = 0;

    pane.chartHost.appendChild(canvas);

    const render = () => {
      frame = 0;
      const rect = pane.chartHost.getBoundingClientRect();
      const ratio = window.devicePixelRatio || 1;
      const width = Math.max(1, Math.floor(rect.width));
      const height = Math.max(1, Math.floor(rect.height));

      canvas.width = Math.floor(width * ratio);
      canvas.height = Math.floor(height * ratio);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;

      context.clearRect(0, 0, canvas.width, canvas.height);
      drawFvgBoxes(context, activeBoxes, pane.chart, pane.candleSeries, ratio, ratio);
    };

    const requestRender = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(render);
    };

    const observer = new ResizeObserver(requestRender);
    observer.observe(pane.chartHost);
    pane.chart.timeScale().subscribeVisibleTimeRangeChange(requestRender);
    requestRender();

    return {
      update(nextBoxes) {
        activeBoxes = nextBoxes;
        requestRender();
      },
      detach() {
        observer.disconnect();
        pane.chart.timeScale().unsubscribeVisibleTimeRangeChange(requestRender);
        if (frame) window.cancelAnimationFrame(frame);
        canvas.remove();
      },
    };
  }

  function attachFvgRenderer(pane, boxes) {
    if (typeof pane.candleSeries.attachPrimitive === "function") {
      const primitive = new FvgPrimitive(boxes);
      pane.candleSeries.attachPrimitive(primitive);

      return {
        update(nextBoxes) {
          primitive.setBoxes(nextBoxes);
        },
        detach() {
          if (typeof pane.candleSeries.detachPrimitive === "function") {
            pane.candleSeries.detachPrimitive(primitive);
          }
        },
      };
    }

    return createCanvasFvgRenderer(pane, boxes);
  }

  function createChartOptions() {
    return {
      autoSize: false,
      layout: {
        background: { type: "solid", color: COLORS.bg },
        textColor: COLORS.text,
        fontFamily: "JetBrains Mono, SFMono-Regular, ui-monospace, monospace",
        fontSize: 11,
        attributionLogo: false,
      },
      grid: {
        vertLines: { color: "rgba(31, 31, 35, 0.35)" },
        horzLines: { color: "rgba(31, 31, 35, 0.35)" },
      },
      crosshair: {
        mode: window.LightweightCharts?.CrosshairMode?.Normal ?? 0,
        vertLine: {
          color: COLORS.border,
          width: 1,
          labelBackgroundColor: COLORS.card,
        },
        horzLine: {
          color: COLORS.border,
          width: 1,
          labelBackgroundColor: COLORS.card,
        },
      },
      rightPriceScale: {
        borderColor: COLORS.border,
        scaleMargins: { top: 0.12, bottom: 0.12 },
      },
      timeScale: {
        borderColor: COLORS.border,
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 6,
        barSpacing: 9,
      },
      handleScroll: {
        mouseWheel: true,
        pressedMouseMove: true,
        horzTouchDrag: true,
        vertTouchDrag: false,
      },
      handleScale: {
        axisPressedMouseMove: true,
        mouseWheel: true,
        pinch: true,
      },
    };
  }

  function addCandlestickSeries(chart) {
    const options = {
      upColor: COLORS.green,
      downColor: COLORS.red,
      borderUpColor: COLORS.green,
      borderDownColor: COLORS.red,
      wickUpColor: COLORS.green,
      wickDownColor: COLORS.red,
      borderVisible: false,
      priceLineColor: "rgba(228, 228, 231, 0.36)",
    };

    if (typeof chart.addSeries === "function" && window.LightweightCharts?.CandlestickSeries) {
      return chart.addSeries(window.LightweightCharts.CandlestickSeries, options);
    }

    return chart.addCandlestickSeries(options);
  }

  function addSmaSeries(chart) {
    const options = {
      color: COLORS.amber,
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false,
    };

    if (typeof chart.addSeries === "function" && window.LightweightCharts?.LineSeries) {
      return chart.addSeries(window.LightweightCharts.LineSeries, options);
    }

    return chart.addLineSeries(options);
  }

  function getMatrixSizing(count, width) {
    let columns = 1;

    if (width >= 760) {
      columns = count === 1 ? 1 : 2;
    }

    if (width >= 1180) {
      if (count === 6) columns = 3;
      if (count === 8) columns = 4;
    }

    const rows = Math.ceil(count / columns);
    const basis = `calc(${(100 / columns).toFixed(4)}% - ${columns === 1 ? 0 : 8}px)`;
    const height = `calc(${(100 / rows).toFixed(4)}% - ${rows === 1 ? 0 : 8}px)`;

    return { basis, height };
  }

  function applyWorkspaceFlex() {
    if (!dashboard.workspace) return;

    Object.assign(dashboard.workspace.style, {
      display: "flex",
      flexWrap: "wrap",
      alignContent: "stretch",
      alignItems: "stretch",
      justifyContent: "stretch",
      gap: "8px",
      padding: "8px",
      overflow: "hidden",
    });

    const { basis, height } = getMatrixSizing(
      dashboard.activePanelCount,
      dashboard.workspace.clientWidth,
    );

    for (const pane of dashboard.panes) {
      Object.assign(pane.root.style, {
        flex: `1 1 ${basis}`,
        width: basis,
        height,
      });
    }
  }

  function createToolbar(index) {
    const toolbar = createElement("div", {
      className: "chart-pane-toolbar",
      styles: {
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "8px",
        height: "38px",
        flex: "0 0 38px",
        padding: "0 8px",
        borderBottom: `1px solid ${COLORS.border}`,
        background: COLORS.card,
      },
    });

    const tickerInput = createElement("input", {
      className: "chart-pane-ticker",
      attributes: {
        type: "text",
        value: DEFAULT_TICKER,
        maxlength: "16",
        spellcheck: "false",
        "aria-label": `Pane ${index + 1} ticker`,
      },
      styles: {
        width: "76px",
        minWidth: "64px",
        height: "26px",
        padding: "0 7px",
        border: `1px solid ${COLORS.border}`,
        borderRadius: "3px",
        background: COLORS.bg,
        color: COLORS.text,
        font: "700 11px JetBrains Mono, SFMono-Regular, ui-monospace, monospace",
        textTransform: "uppercase",
        outline: "none",
      },
    });

    const leftGroup = createElement("div", {
      styles: {
        display: "flex",
        alignItems: "center",
        gap: "8px",
        minWidth: "0",
      },
    });

    const paneLabel = createElement("span", {
      textContent: `P${index + 1}`,
      styles: {
        color: COLORS.dim,
        font: "700 10px JetBrains Mono, SFMono-Regular, ui-monospace, monospace",
      },
    });

    leftGroup.append(paneLabel, tickerInput);

    const indicatorGroup = createElement("div", {
      styles: {
        display: "flex",
        alignItems: "center",
        gap: "8px",
        flex: "0 0 auto",
      },
    });

    const smaControl = createIndicatorControl("SMA", true);
    const fvgControl = createIndicatorControl("Fair Value Gap", true);

    indicatorGroup.append(smaControl.label, fvgControl.label);
    toolbar.append(leftGroup, indicatorGroup);

    return {
      toolbar,
      tickerInput,
      smaCheckbox: smaControl.checkbox,
      fvgCheckbox: fvgControl.checkbox,
    };
  }

  function createIndicatorControl(labelText, checked) {
    const label = createElement("label", {
      styles: {
        display: "inline-flex",
        alignItems: "center",
        gap: "5px",
        color: COLORS.muted,
        font: "700 10px JetBrains Mono, SFMono-Regular, ui-monospace, monospace",
        whiteSpace: "nowrap",
        cursor: "pointer",
        userSelect: "none",
      },
    });

    const checkbox = createElement("input", {
      attributes: {
        type: "checkbox",
      },
      styles: {
        width: "12px",
        height: "12px",
        accentColor: COLORS.green,
      },
    });

    checkbox.checked = checked;
    label.append(checkbox, document.createTextNode(labelText));

    return { label, checkbox };
  }

  function createPane(index) {
    const root = createElement("section", {
      className: "chart-pane",
      attributes: {
        "data-pane-index": String(index),
        "data-dashboard-scroll": "true",
      },
    });

    const toolbar = createToolbar(index);
    const chartHost = createElement("div", {
      className: "chart-pane-host",
      styles: {
        position: "relative",
        minWidth: "0",
        minHeight: "0",
        flex: "1 1 auto",
        overflow: "hidden",
        background: COLORS.bg,
      },
    });

    root.append(toolbar.toolbar, chartHost);
    dashboard.workspace.appendChild(root);

    const chart = window.LightweightCharts.createChart(chartHost, createChartOptions());
    const candleSeries = addCandlestickSeries(chart);
    const smaSeries = addSmaSeries(chart);

    const pane = {
      root,
      chartHost,
      chart,
      candleSeries,
      smaSeries,
      tickerInput: toolbar.tickerInput,
      smaCheckbox: toolbar.smaCheckbox,
      fvgCheckbox: toolbar.fvgCheckbox,
      candles: [],
      fvgBoxes: [],
      fvgRenderer: null,
      resizeObserver: null,
      requestToken: 0,
    };

    pane.resizeObserver = new ResizeObserver(() => {
      resizePane(pane);
    });
    pane.resizeObserver.observe(chartHost);

    bindPaneToolbar(pane);

    window.requestAnimationFrame(() => {
      resizePane(pane);
      loadPaneTicker(pane, pane.tickerInput.value);
    });

    return pane;
  }

  function bindPaneToolbar(pane) {
    pane.tickerInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        loadPaneTicker(pane, pane.tickerInput.value);
      }
    });

    pane.tickerInput.addEventListener("blur", () => {
      loadPaneTicker(pane, pane.tickerInput.value);
    });

    pane.smaCheckbox.addEventListener("change", () => {
      renderIndicators(pane);
    });

    pane.fvgCheckbox.addEventListener("change", () => {
      renderIndicators(pane);
    });
  }

  function resizePane(pane) {
    const rect = pane.chartHost.getBoundingClientRect();
    const width = Math.max(1, Math.floor(rect.width));
    const height = Math.max(1, Math.floor(rect.height));

    pane.chart.resize(width, height);
    pane.fvgRenderer?.update(pane.fvgCheckbox.checked ? pane.fvgBoxes : []);
  }

  function renderIndicators(pane) {
    if (!pane.candles.length) return;

    if (pane.smaCheckbox.checked) {
      pane.smaSeries.setData(calculateSma(pane.candles));
    } else {
      pane.smaSeries.setData([]);
    }

    if (!pane.fvgRenderer) {
      pane.fvgRenderer = attachFvgRenderer(pane, pane.fvgCheckbox.checked ? pane.fvgBoxes : []);
    } else {
      pane.fvgRenderer.update(pane.fvgCheckbox.checked ? pane.fvgBoxes : []);
    }
  }

  async function loadPaneTicker(pane, rawTicker) {
    const ticker = sanitizeTicker(rawTicker);
    const token = pane.requestToken + 1;
    pane.requestToken = token;
    pane.tickerInput.value = ticker;
    setStatus(`LOADING_${ticker}`, "neutral");

    try {
      const candles = await fetchCandles(ticker);
      if (pane.requestToken !== token) return;

      pane.candles = candles;
      pane.fvgBoxes = calculateFairValueGaps(candles);
      pane.candleSeries.setData(candles);
      renderIndicators(pane);
      pane.chart.timeScale().fitContent();
      resizePane(pane);
      setStatus("DATA_STREAM_CONNECTED", "success");
    } catch (error) {
      if (pane.requestToken !== token) return;

      console.error("Panel data load failed:", error);
      pane.candleSeries.setData([]);
      pane.smaSeries.setData([]);
      pane.fvgRenderer?.update([]);
      setStatus("DATA_STREAM_ERROR", "error");
    }
  }

  function destroyPane(pane) {
    pane.resizeObserver?.disconnect();
    pane.fvgRenderer?.detach();
    pane.chart?.remove();
    pane.root?.remove();
  }

  function rebuildMatrix(count) {
    const nextCount = PANEL_COUNTS.has(count) ? count : DEFAULT_PANEL_COUNT;

    for (const pane of dashboard.panes) {
      destroyPane(pane);
    }

    dashboard.panes = [];
    dashboard.activePanelCount = nextCount;
    dashboard.workspace.replaceChildren();
    applyWorkspaceFlex();

    for (let index = 0; index < nextCount; index += 1) {
      dashboard.panes.push(createPane(index));
    }

    applyWorkspaceFlex();
  }

  function bindMatrixSelector() {
    dashboard.layoutPicker?.addEventListener("change", (event) => {
      const nextCount = Number.parseInt(event.target.value, 10);
      rebuildMatrix(nextCount);
    });
  }

  function bindWorkspaceResize() {
    dashboard.workspaceObserver?.disconnect();

    dashboard.workspaceObserver = new ResizeObserver(() => {
      applyWorkspaceFlex();

      for (const pane of dashboard.panes) {
        resizePane(pane);
      }
    });

    dashboard.workspaceObserver.observe(dashboard.workspace);
  }

  function boot() {
    dashboard.workspace = qs("#chartWorkspace");
    dashboard.layoutPicker = qs("#layoutPicker");
    dashboard.statusLabel = qs("[data-stream-status-text]") || qs("[role='status'] span:last-child");

    if (!dashboard.workspace || !dashboard.layoutPicker) {
      console.error("Dashboard boot failed: missing workspace or layout picker.");
      return;
    }

    if (!window.LightweightCharts?.createChart) {
      setStatus("CHART_RUNTIME_MISSING", "error");
      console.error("Dashboard boot failed: Lightweight Charts is unavailable.");
      return;
    }

    bindMatrixSelector();
    bindWorkspaceResize();
    rebuildMatrix(Number.parseInt(dashboard.layoutPicker.value, 10));
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();
