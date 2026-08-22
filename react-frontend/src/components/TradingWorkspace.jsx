import React, { useState, useEffect } from 'react';
import TradingViewHeader from './TradingViewHeader';
import DrawingToolbar from './DrawingToolbar';
import LightweightTradingChart from './LightweightTradingChart';
import ChartSettingsModal from './ChartSettingsModal';
import { useChartSettings } from '../hooks/useChartSettings';

export default function TradingWorkspace() {
  const [symbol, setSymbol] = useState('BTCUSDT');
  const [timeframe, setTimeframe] = useState('1m');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [candles, setCandles] = useState([]);

  const { settings, updateSetting, applyPreset, resetToDefault } = useChartSettings();

  // Generate initial historical data & mock live tick updates
  useEffect(() => {
    const initialCandles = [];
    let currentPrice = 64200.0;
    const now = Math.floor(Date.now() / 1000);

    for (let i = 200; i >= 0; i--) {
      const time = now - i * 60;
      const change = (Math.random() - 0.49) * 45;
      const open = currentPrice;
      const close = currentPrice + change;
      const high = Math.max(open, close) + Math.random() * 20;
      const low = Math.min(open, close) - Math.random() * 20;
      const volume = Math.floor(Math.random() * 150) + 10;

      initialCandles.push({ time, open, high, low, close, volume });
      currentPrice = close;
    }
    setCandles(initialCandles);

    // Live tick streamer simulation
    const interval = setInterval(() => {
      setCandles((prev) => {
        if (!prev || prev.length === 0) return prev;
        const last = { ...prev[prev.length - 1] };
        const tick = (Math.random() - 0.49) * 8;
        last.close += tick;
        last.high = Math.max(last.high, last.close);
        last.low = Math.min(last.low, last.close);
        last.volume = (last.volume || 0) + Math.random() * 2;
        return [...prev.slice(0, -1), last];
      });
    }, 400);

    return () => clearInterval(interval);
  }, [symbol, timeframe]);

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-[#131722] text-[#d1d4dc]">
      {/* 1. Top Header */}
      <TradingViewHeader
        symbol={symbol}
        timeframe={timeframe}
        onSymbolChange={setSymbol}
        onTimeframeChange={setTimeframe}
        onOpenSettings={() => setIsSettingsOpen(true)}
      />

      {/* 2. Main Work Area: Left Toolbar + Chart Canvas */}
      <div className="flex flex-1 overflow-hidden">
        <DrawingToolbar />
        <main className="flex-1 overflow-hidden">
          <LightweightTradingChart
            data={candles}
            symbol={symbol}
            timeframe={timeframe}
            settings={settings}
          />
        </main>
      </div>

      {/* 3. TradingView Chart Settings Modal */}
      <ChartSettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        settings={settings}
        updateSetting={updateSetting}
        applyPreset={applyPreset}
        resetToDefault={resetToDefault}
      />
    </div>
  );
}
