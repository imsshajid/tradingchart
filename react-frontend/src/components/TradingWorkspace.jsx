import React, { useState, useEffect } from 'react';
import LightweightTradingChart from './LightweightTradingChart';
import TradingViewHeader from './TradingViewHeader';
import DrawingToolbar from './DrawingToolbar';
import ChartSettingsModal from './ChartSettingsModal';
import { useChartSettings } from '../hooks/useChartSettings';

export default function TradingWorkspace() {
  const [candles, setCandles] = useState([]);
  const [symbol, setSymbol] = useState('BTCUSDT');
  const [timeframe, setTimeframe] = useState('1m');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const { settings, updateSetting, applyPreset, resetToDefault } = useChartSettings();

  useEffect(() => {
    const initialCandles = [];
    const now = Math.floor(Date.now() / 1000);
    let currentPrice = 64500.0;

    for (let i = 200; i >= 0; i--) {
      const time = now - i * 60;
      const variation = (Math.random() - 0.48) * 45;
      const open = currentPrice;
      const close = open + variation;
      const high = Math.max(open, close) + Math.random() * 25;
      const low = Math.min(open, close) - Math.random() * 25;
      const volume = Math.floor(Math.random() * 80) + 10;

      initialCandles.push({ time, open, high, low, close, volume });
      currentPrice = close;
    }

    setCandles(initialCandles);

    const interval = setInterval(() => {
      setCandles((prev) => {
        if (!prev || prev.length === 0) return prev;
        const last = { ...prev[prev.length - 1] };
        const tick = (Math.random() - 0.49) * 8;
        last.close += tick;
        last.high = Math.max(last.high, last.close);
        last.low = Math.min(last.low, last.close);
        last.volume = (last.volume || 0) + Math.floor(Math.random() * 2);
        return [...prev.slice(0, -1), last];
      });
    }, 500);

    return () => clearInterval(interval);
  }, [symbol, timeframe]);

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-[#131722] text-[#d1d4dc]">
      <TradingViewHeader
        symbol={symbol}
        setSymbol={setSymbol}
        timeframe={timeframe}
        setTimeframe={setTimeframe}
        onOpenSettings={() => setIsSettingsOpen(true)}
      />

      <div className="flex flex-1 min-h-0 w-full overflow-hidden">
        <DrawingToolbar />

        <main className="relative flex-1 h-full min-h-0 w-full overflow-hidden">
          <LightweightTradingChart
            data={candles}
            symbol={symbol}
            timeframe={timeframe}
            settings={settings}
          />
        </main>
      </div>

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
