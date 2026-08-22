import React from 'react';
import {
  Search,
  ChevronDown,
  BarChart2,
  TrendingUp,
  SlidersHorizontal,
  Maximize2,
} from 'lucide-react';

export default function TradingViewHeader({
  symbol = 'BTCUSDT',
  setSymbol,
  timeframe = '1m',
  setTimeframe,
  onOpenSettings,
}) {
  const timeframes = ['1s', '1m', '5m', '15m', '1h', '4h', '1D'];

  return (
    <header className="flex h-12 w-full items-center justify-between border-b border-[#2a2e39] bg-[#131722] px-3 text-[#d1d4dc] select-none shrink-0 z-30">
      {/* Left Group */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => {
            const next = prompt('Enter Ticker Symbol (e.g. BTCUSDT, ETHUSDT, SOLUSDT):', symbol);
            if (next && setSymbol) setSymbol(next.toUpperCase().trim());
          }}
          className="flex items-center gap-2 rounded px-2.5 py-1.5 text-xs font-bold text-white transition-colors hover:bg-[#2a2e39]"
        >
          <Search size={14} className="text-[#787b86]" />
          <span>{symbol}</span>
          <ChevronDown size={14} className="text-[#787b86]" />
        </button>

        <div className="h-4 w-[1px] bg-[#2a2e39]" />

        {/* Timeframe selector */}
        <div className="flex items-center gap-0.5">
          {timeframes.map((tf) => (
            <button
              key={tf}
              onClick={() => setTimeframe && setTimeframe(tf)}
              className={`rounded px-2 py-1 text-xs font-semibold transition-colors ${
                timeframe === tf
                  ? 'bg-[#2962ff] text-white'
                  : 'text-[#787b86] hover:bg-[#2a2e39] hover:text-[#d1d4dc]'
              }`}
            >
              {tf}
            </button>
          ))}
        </div>

        <div className="h-4 w-[1px] bg-[#2a2e39]" />

        {/* Chart type & Indicators */}
        <button className="flex items-center gap-1.5 rounded px-2 py-1 text-xs font-medium text-[#787b86] transition-colors hover:bg-[#2a2e39] hover:text-[#d1d4dc]">
          <BarChart2 size={15} />
          <span>Candles</span>
        </button>

        <button className="flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium text-[#787b86] transition-colors hover:bg-[#2a2e39] hover:text-[#d1d4dc]">
          <TrendingUp size={15} />
          <span>Indicators</span>
        </button>
      </div>

      {/* Right Group */}
      <div className="flex items-center gap-1">
        <button
          onClick={onOpenSettings}
          title="Chart Settings"
          className="flex items-center gap-1.5 rounded px-2.5 py-1.5 text-xs font-medium text-[#d1d4dc] transition-colors hover:bg-[#2a2e39] hover:text-white"
        >
          <SlidersHorizontal size={15} className="text-[#2962ff]" />
          <span>Settings</span>
        </button>

        <div className="h-4 w-[1px] bg-[#2a2e39]" />

        <button
          onClick={() => {
            if (!document.fullscreenElement) {
              document.documentElement.requestFullscreen();
            } else {
              document.exitFullscreen();
            }
          }}
          title="Fullscreen"
          className="rounded p-1.5 text-[#787b86] transition-colors hover:bg-[#2a2e39] hover:text-white"
        >
          <Maximize2 size={16} />
        </button>
      </div>
    </header>
  );
}
