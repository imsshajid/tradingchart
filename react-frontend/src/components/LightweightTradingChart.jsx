import React, { useEffect, useRef, useState } from 'react';
import { createChart, ColorType, CrosshairMode } from 'lightweight-charts';

export default function LightweightTradingChart({
  data = [],
  symbol = 'BTCUSDT',
  timeframe = '1m',
  settings,
  onPriceUpdate,
}) {
  const chartContainerRef = useRef(null);
  const chartRef = useRef(null);
  const seriesRef = useRef(null);
  const volumeSeriesRef = useRef(null);

  const [currentOHLC, setCurrentOHLC] = useState({ open: 0, high: 0, low: 0, close: 0, volume: 0, change: 0, changePercent: 0 });
  const [countdown, setCountdown] = useState('00:00');

  // --- Initialize & Update Chart Options ---
  useEffect(() => {
    if (!chartContainerRef.current) return;

    // Create Chart instance
    const chart = createChart(chartContainerRef.current, {
      width: chartContainerRef.current.clientWidth,
      height: chartContainerRef.current.clientHeight,
      layout: {
        background: {
          type: ColorType.Solid,
          color: settings.backgroundColor,
        },
        textColor: '#d1d4dc',
        fontSize: 12,
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Trebuchet MS', Roboto, Ubuntu, sans-serif",
      },
      grid: {
        vertLines: {
          color: settings.gridVertColor,
          style: settings.gridLineStyle,
        },
        horzLines: {
          color: settings.gridHorzColor,
          style: settings.gridLineStyle,
        },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: {
          color: settings.crosshairColor,
          width: 1,
          style: 3,
          labelBackgroundColor: '#2a2e39',
        },
        horzLine: {
          color: settings.crosshairColor,
          width: 1,
          style: 3,
          labelBackgroundColor: '#2a2e39',
        },
      },
      rightPriceScale: {
        visible: settings.priceScalePlacement === 'right',
        borderColor: '#2a2e39',
        autoScale: true,
      },
      leftPriceScale: {
        visible: settings.priceScalePlacement === 'left',
        borderColor: '#2a2e39',
        autoScale: true,
      },
      timeScale: {
        borderColor: '#2a2e39',
        timeVisible: true,
        secondsVisible: timeframe.includes('s'),
        barSpacing: settings.barSpacing,
      },
      watermark: {
        visible: settings.watermarkVisible,
        fontSize: settings.watermarkFontSize,
        horzAlign: 'center',
        vertAlign: 'center',
        color: settings.watermarkColor,
        text: `${symbol} • ${timeframe}`,
      },
    });

    chartRef.current = chart;

    // Create Candlestick / Main Price Series
    const mainSeries = chart.addCandlestickSeries({
      upColor: settings.upColor,
      downColor: settings.downColor,
      borderVisible: settings.borderVisible,
      borderUpColor: settings.borderUpColor,
      borderDownColor: settings.borderDownColor,
      wickVisible: settings.wickVisible,
      wickUpColor: settings.wickUpColor,
      wickDownColor: settings.wickDownColor,
      lastValueVisible: settings.showLastPriceLabel,
      priceLineVisible: settings.lastPriceLineVisible,
      priceLineColor: settings.lastPriceLineColor,
      priceFormat: settings.priceFormat,
    });

    seriesRef.current = mainSeries;

    // Create Volume Series
    const volumeSeries = chart.addHistogramSeries({
      color: '#26a69a',
      priceFormat: { type: 'volume' },
      priceScaleId: '', // Overlay pane
    });
    volumeSeries.priceScale().applyOptions({
      scaleMargins: {
        top: 0.82,
        bottom: 0,
      },
    });
    volumeSeriesRef.current = volumeSeries;

    // Crosshair move listener for Live Status Line
    chart.subscribeCrosshairMove((param) => {
      if (!param || !param.time) {
        if (data.length > 0) {
          const last = data[data.length - 1];
          const prev = data.length > 1 ? data[data.length - 2] : last;
          const chg = last.close - prev.close;
          const pct = prev.close !== 0 ? (chg / prev.close) * 100 : 0;
          setCurrentOHLC({
            open: last.open,
            high: last.high,
            low: last.low,
            close: last.close,
            volume: last.volume || 0,
            change: chg,
            changePercent: pct,
          });
        }
        return;
      }
      const candle = param.seriesData.get(mainSeries);
      const vol = param.seriesData.get(volumeSeries);
      if (candle) {
        const chg = candle.close - candle.open;
        const pct = candle.open !== 0 ? (chg / candle.open) * 100 : 0;
        setCurrentOHLC({
          open: candle.open,
          high: candle.high,
          low: candle.low,
          close: candle.close,
          volume: vol?.value || 0,
          change: chg,
          changePercent: pct,
        });
      }
    });

    // Handle Window Resize
    const handleResize = () => {
      if (chartContainerRef.current) {
        chart.applyOptions({
          width: chartContainerRef.current.clientWidth,
          height: chartContainerRef.current.clientHeight,
        });
      }
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
    };
  }, []);

  // --- Reactive Settings Updates ---
  useEffect(() => {
    if (!chartRef.current || !seriesRef.current) return;

    chartRef.current.applyOptions({
      layout: {
        background: { type: ColorType.Solid, color: settings.backgroundColor },
      },
      grid: {
        vertLines: { color: settings.gridVertColor, style: settings.gridLineStyle },
        horzLines: { color: settings.gridHorzColor, style: settings.gridLineStyle },
      },
      crosshair: {
        vertLine: { color: settings.crosshairColor },
        horzLine: { color: settings.crosshairColor },
      },
      watermark: {
        visible: settings.watermarkVisible,
        color: settings.watermarkColor,
        text: `${symbol} • ${timeframe}`,
      },
      rightPriceScale: { visible: settings.priceScalePlacement === 'right' },
      leftPriceScale: { visible: settings.priceScalePlacement === 'left' },
    });

    seriesRef.current.applyOptions({
      upColor: settings.upColor,
      downColor: settings.downColor,
      borderVisible: settings.borderVisible,
      borderUpColor: settings.borderUpColor,
      borderDownColor: settings.borderDownColor,
      wickVisible: settings.wickVisible,
      wickUpColor: settings.wickUpColor,
      wickDownColor: settings.wickDownColor,
      priceLineVisible: settings.lastPriceLineVisible,
      priceLineColor: settings.lastPriceLineColor,
      lastValueVisible: settings.showLastPriceLabel,
      priceFormat: settings.priceFormat,
    });
  }, [settings, symbol, timeframe]);

  // --- Load Data into Series ---
  useEffect(() => {
    if (!seriesRef.current || !data || data.length === 0) return;

    seriesRef.current.setData(data);

    if (volumeSeriesRef.current) {
      const volData = data.map((d) => ({
        time: d.time,
        value: d.volume || 0,
        color: d.close >= d.open ? 'rgba(8, 153, 129, 0.3)' : 'rgba(242, 54, 69, 0.3)',
      }));
      volumeSeriesRef.current.setData(volData);
    }

    const last = data[data.length - 1];
    const prev = data.length > 1 ? data[data.length - 2] : last;
    const chg = last.close - prev.close;
    const pct = prev.close !== 0 ? (chg / prev.close) * 100 : 0;
    setCurrentOHLC({
      open: last.open,
      high: last.high,
      low: last.low,
      close: last.close,
      volume: last.volume || 0,
      change: chg,
      changePercent: pct,
    });
  }, [data]);

  // --- Live Bar Countdown Timer ---
  useEffect(() => {
    if (!settings.showCountdownToBarClose) return;

    const interval = setInterval(() => {
      const now = new Date();
      const seconds = 60 - now.getSeconds();
      const formatted = `00:${seconds < 10 ? '0' : ''}${seconds}`;
      setCountdown(formatted);
    }, 1000);

    return () => clearInterval(interval);
  }, [settings.showCountdownToBarClose]);

  const isBullish = currentOHLC.change >= 0;

  return (
    <div className="relative h-full w-full select-none overflow-hidden bg-[#131722]">
      {/* 1:1 TradingView Status Line (Top Left Overlay) */}
      <div className="absolute left-4 top-3 z-20 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] font-mono pointer-events-none">
        {settings.showSymbolLogo && (
          <div className="flex items-center gap-1.5 font-bold text-white tracking-wide">
            <span className="flex h-2 w-2 rounded-full bg-[#089981]" />
            <span>{symbol}</span>
            <span className="rounded bg-[#2a2e39] px-1.5 py-0.2 text-[11px] font-medium text-[#787b86]">{timeframe}</span>
          </div>
        )}

        {settings.showOHLC && (
          <div className="flex items-center gap-3 text-xs text-[#787b86]">
            <div>O <span className={isBullish ? 'text-[#089981]' : 'text-[#f23645]'}>{currentOHLC.open.toFixed(settings.priceFormat.precision)}</span></div>
            <div>H <span className={isBullish ? 'text-[#089981]' : 'text-[#f23645]'}>{currentOHLC.high.toFixed(settings.priceFormat.precision)}</span></div>
            <div>L <span className={isBullish ? 'text-[#089981]' : 'text-[#f23645]'}>{currentOHLC.low.toFixed(settings.priceFormat.precision)}</span></div>
            <div>C <span className={isBullish ? 'text-[#089981]' : 'text-[#f23645]'}>{currentOHLC.close.toFixed(settings.priceFormat.precision)}</span></div>
            {settings.showBarChange && (
              <div className={isBullish ? 'text-[#089981]' : 'text-[#f23645]'}>
                {isBullish ? '+' : ''}{currentOHLC.change.toFixed(settings.priceFormat.precision)} ({isBullish ? '+' : ''}{currentOHLC.changePercent.toFixed(2)}%)
              </div>
            )}
            {settings.showVolume && currentOHLC.volume > 0 && (
              <div>Vol <span className="text-[#d1d4dc]">{currentOHLC.volume.toLocaleString()}</span></div>
            )}
          </div>
        )}
      </div>

      {/* Quick Buy / Sell Execution Buttons (Top Left) */}
      {settings.showBuySellButtons && (
        <div className="absolute left-4 top-12 z-20 flex items-center gap-1 rounded-lg border border-[#2a2e39] bg-[#181b24]/90 p-1 shadow-lg backdrop-blur">
          <button className="flex flex-col items-center justify-center rounded bg-[#f23645]/20 px-3 py-1 text-left transition-colors hover:bg-[#f23645]/30">
            <span className="text-[10px] font-semibold text-[#f23645]">SELL</span>
            <span className="text-xs font-bold text-white font-mono">{(currentOHLC.close * 0.9999).toFixed(settings.priceFormat.precision)}</span>
          </button>
          <div className="px-1 text-[11px] font-mono text-[#787b86]">0.01</div>
          <button className="flex flex-col items-center justify-center rounded bg-[#089981]/20 px-3 py-1 text-left transition-colors hover:bg-[#089981]/30">
            <span className="text-[10px] font-semibold text-[#089981]">BUY</span>
            <span className="text-xs font-bold text-white font-mono">{(currentOHLC.close * 1.0001).toFixed(settings.priceFormat.precision)}</span>
          </button>
        </div>
      )}

      {/* Countdown pill next to price scale */}
      {settings.showCountdownToBarClose && (
        <div
          className={`absolute z-20 rounded bg-[#2a2e39] px-1.5 py-0.5 text-[11px] font-mono text-white shadow ${
            settings.priceScalePlacement === 'right' ? 'right-14 bottom-10' : 'left-14 bottom-10'
          }`}
        >
          {countdown}
        </div>
      )}

      {/* Chart Canvas */}
      <div ref={chartContainerRef} className="h-full w-full" />
    </div>
  );
}
