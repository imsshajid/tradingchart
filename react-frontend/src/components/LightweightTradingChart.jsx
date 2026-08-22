import React, { useEffect, useRef, useState } from 'react';
import { createChart, ColorType, CrosshairMode } from 'lightweight-charts';

const FALLBACK_SETTINGS = {
  upColor: '#089981',
  downColor: '#f23645',
  borderVisible: true,
  borderUpColor: '#089981',
  borderDownColor: '#f23645',
  wickVisible: true,
  wickUpColor: '#089981',
  wickDownColor: '#f23645',
  lastPriceLineVisible: true,
  lastPriceLineColor: '#2962ff',
  showLastPriceLabel: true,
  showSymbolLogo: true,
  showOpenMarketStatus: true,
  showOHLC: true,
  showBarChange: true,
  showVolume: true,
  showCountdownToBarClose: true,
  priceScalePlacement: 'right',
  backgroundColor: '#131722',
  gridVertColor: '#1e222d',
  gridHorzColor: '#1e222d',
  crosshairColor: '#758696',
  watermarkVisible: false,
  showBuySellButtons: true,
};

export default function LightweightTradingChart({
  data = [],
  symbol = 'BTCUSDT',
  timeframe = '1m',
  settings = FALLBACK_SETTINGS,
}) {
  const activeSettings = { ...FALLBACK_SETTINGS, ...settings };
  const chartContainerRef = useRef(null);
  const chartRef = useRef(null);
  const seriesRef = useRef(null);
  const volumeSeriesRef = useRef(null);

  const [currentOHLC, setCurrentOHLC] = useState({
    open: 0,
    high: 0,
    low: 0,
    close: 0,
    volume: 0,
    change: 0,
    changePercent: 0,
  });
  const [countdown, setCountdown] = useState('00:00');

  useEffect(() => {
    if (!chartContainerRef.current) return;

    const width = chartContainerRef.current.clientWidth || window.innerWidth - 48;
    const height = chartContainerRef.current.clientHeight || window.innerHeight - 48;

    const chart = createChart(chartContainerRef.current, {
      width: width,
      height: height,
      layout: {
        background: { type: ColorType.Solid, color: activeSettings.backgroundColor },
        textColor: '#d1d4dc',
        fontSize: 12,
      },
      grid: {
        vertLines: { color: activeSettings.gridVertColor },
        horzLines: { color: activeSettings.gridHorzColor },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: activeSettings.crosshairColor, labelBackgroundColor: '#2a2e39' },
        horzLine: { color: activeSettings.crosshairColor, labelBackgroundColor: '#2a2e39' },
      },
      rightPriceScale: {
        visible: activeSettings.priceScalePlacement === 'right',
        borderColor: '#2a2e39',
      },
      leftPriceScale: {
        visible: activeSettings.priceScalePlacement === 'left',
        borderColor: '#2a2e39',
      },
      timeScale: {
        borderColor: '#2a2e39',
        timeVisible: true,
      },
    });

    chartRef.current = chart;

    const mainSeries = chart.addCandlestickSeries({
      upColor: activeSettings.upColor,
      downColor: activeSettings.downColor,
      borderVisible: activeSettings.borderVisible,
      borderUpColor: activeSettings.borderUpColor,
      borderDownColor: activeSettings.borderDownColor,
      wickVisible: activeSettings.wickVisible,
      wickUpColor: activeSettings.wickUpColor,
      wickDownColor: activeSettings.wickDownColor,
      lastValueVisible: activeSettings.showLastPriceLabel,
      priceLineVisible: activeSettings.lastPriceLineVisible,
      priceLineColor: activeSettings.lastPriceLineColor,
    });
    seriesRef.current = mainSeries;

    const volumeSeries = chart.addHistogramSeries({
      color: '#26a69a',
      priceFormat: { type: 'volume' },
      priceScaleId: '',
    });
    volumeSeriesRef.current = volumeSeries;

    chart.priceScale('').applyOptions({
      scaleMargins: { top: 0.82, bottom: 0 },
    });

    chart.subscribeCrosshairMove((param) => {
      if (!param || !param.time) return;
      const candle = param.seriesData.get(mainSeries);
      const vol = param.seriesData.get(volumeSeries);
      if (candle && typeof candle.close === 'number') {
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

    const resizeObserver = new ResizeObserver((entries) => {
      if (!entries || !entries[0] || !chartRef.current) return;
      const { width: w, height: h } = entries[0].contentRect;
      if (w > 0 && h > 0) {
        chartRef.current.applyOptions({ width: w, height: h });
      }
    });

    resizeObserver.observe(chartContainerRef.current);

    return () => {
      resizeObserver.disconnect();
      chart.remove();
    };
  }, []);

  useEffect(() => {
    if (!chartRef.current || !seriesRef.current) return;

    chartRef.current.applyOptions({
      layout: { background: { type: ColorType.Solid, color: activeSettings.backgroundColor } },
      grid: { vertLines: { color: activeSettings.gridVertColor }, horzLines: { color: activeSettings.gridHorzColor } },
      rightPriceScale: { visible: activeSettings.priceScalePlacement === 'right' },
      leftPriceScale: { visible: activeSettings.priceScalePlacement === 'left' },
    });

    seriesRef.current.applyOptions({
      upColor: activeSettings.upColor,
      downColor: activeSettings.downColor,
      borderVisible: activeSettings.borderVisible,
      borderUpColor: activeSettings.borderUpColor,
      borderDownColor: activeSettings.borderDownColor,
      wickVisible: activeSettings.wickVisible,
      wickUpColor: activeSettings.wickUpColor,
      wickDownColor: activeSettings.wickDownColor,
      priceLineVisible: activeSettings.lastPriceLineVisible,
      priceLineColor: activeSettings.lastPriceLineColor,
      lastValueVisible: activeSettings.showLastPriceLabel,
    });
  }, [settings, symbol, timeframe]);

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

  useEffect(() => {
    if (!activeSettings.showCountdownToBarClose) return;

    const interval = setInterval(() => {
      const now = new Date();
      const seconds = 60 - now.getSeconds();
      setCountdown(`00:${seconds < 10 ? '0' : ''}${seconds}`);
    }, 1000);

    return () => clearInterval(interval);
  }, [activeSettings.showCountdownToBarClose]);

  const isBullish = currentOHLC.change >= 0;

  return (
    <div className="relative h-full w-full select-none overflow-hidden bg-[#131722]">
      {/* Status Line */}
      <div className="absolute left-4 top-3 z-20 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-mono pointer-events-none">
        {activeSettings.showSymbolLogo && (
          <div className="flex items-center gap-1.5 font-bold text-white tracking-wide">
            <span className="flex h-2 w-2 rounded-full bg-[#089981]" />
            <span>{symbol}</span>
            <span className="rounded bg-[#2a2e39] px-1.5 py-0.5 text-[11px] font-medium text-[#787b86]">{timeframe}</span>
          </div>
        )}

        {activeSettings.showOHLC && (
          <div className="flex items-center gap-3 text-xs text-[#787b86]">
            <div>O <span className={isBullish ? 'text-[#089981]' : 'text-[#f23645]'}>{(currentOHLC?.open || 0).toFixed(2)}</span></div>
            <div>H <span className={isBullish ? 'text-[#089981]' : 'text-[#f23645]'}>{(currentOHLC?.high || 0).toFixed(2)}</span></div>
            <div>L <span className={isBullish ? 'text-[#089981]' : 'text-[#f23645]'}>{(currentOHLC?.low || 0).toFixed(2)}</span></div>
            <div>C <span className={isBullish ? 'text-[#089981]' : 'text-[#f23645]'}>{(currentOHLC?.close || 0).toFixed(2)}</span></div>
            {activeSettings.showBarChange && (
              <div className={isBullish ? 'text-[#089981]' : 'text-[#f23645]'}>
                {isBullish ? '+' : ''}{(currentOHLC?.change || 0).toFixed(2)} ({(currentOHLC?.changePercent || 0).toFixed(2)}%)
              </div>
            )}
          </div>
        )}
      </div>

      {activeSettings.showCountdownToBarClose && (
        <div className="absolute right-14 bottom-8 z-20 rounded bg-[#2a2e39] px-2 py-0.5 text-[11px] font-mono text-white shadow">
          {countdown}
        </div>
      )}

      <div ref={chartContainerRef} className="h-full w-full min-h-[300px]" />
    </div>
  );
}
