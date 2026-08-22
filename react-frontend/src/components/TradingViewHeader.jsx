import React, { useState } from 'react';
import {
  Search,
  ChevronDown,
  BarChart2,
  TrendingUp,
  SlidersHorizontal,
  Camera,
  Maximize2,
  Undo2,
  Redo2,
  Play,
  RotateCcw,
  LayoutGrid,
  Bell,
  Save,
} from 'lucide-react';

const TIMEFRAMES = [
  { label: '1s', value: '1s' },
  { label: '1m', value: '1m' },
  { label: '5m', value: '5m' },
  { label: '15m', value: '15m' },
  { label: '1h', value: '1h' },
  { label: '4h', value: '4h' },
  { label: '1D', value: '1D' },
  { label: '1W', value: '1W' },
];

export default function TradingViewHeader({
  symbol = 'BTCUSDT',
  timeframe = '1m',
  onSymbolChange,
  onTimeframeChange,
  onOpenSettings,
  onTakeScreenshot,
}) {
  const [isSymbolOpen, setIsSymbolOpen] = useState(false);
  const [isReplaying, setIsReplaying] = useState(false);

  return (
    <header className="flex h-12 w-full items-center justify-between border-b border-[#2a2e39] bg-[#181b24] px-3 text-[#d1d4dc]">
      {/* Left Section: Symbol, Timeframes, Chart Style, Indicators */}
      <div className="flex items-center gap-1.5">
        {/* Symbol Search Trigger */}
        <button
          onClick={() => setIsSymbolOpen(!isSymbolOpen)}
          className="flex items-center gap-2 rounded-lg bg-[#222631] px-3 py-1.5 text-xs font-bold text-white transition-colors hover:bg-[#2a2e39]"
        >
          <Search size={14} className="text-[#2962ff]" />
          <span>{symbol}</span>
          <ChevronDown size={14} className="text-[#787b86]" />
        </button>

        <div className="mx-1 h-5 w-[1px] bg-[#2a2e39]" />

        {/* Timeframe Selectors */}
        <div className="flex items-center gap-0.5">
          {TIMEFRAMES.map((tf) => (
            <button
              key={tf.value}
              onClick={() => onTimeframeChange(tf.value)}
              className={`rounded px-2.5 py-1 text-xs font-semibold transition-colors ${
                timeframe === tf.value
                  ? 'bg-[#2962ff] text-white'
                  : 'text-[#787b86] hover:bg-[#222631] hover:text-white'
              }`}
            >
              {tf.label}
            </button>
          ))}
        </div>

        <div className="mx-1 h-5 w-[1px] bg-[#2a2e39]" />

        {/* Indicators Trigger */}
        <button className="flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-semibold text-[#b2b5be] transition-colors hover:bg-[#222631] hover:text-white">
          <TrendingUp size={14} className="text-[#2962ff]" />
          <span>Indicators</span>
        </button>

        {/* Bar Replay Trigger */}
        <button
          onClick={() => setIsReplaying(!isReplaying)}
          className={`flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-semibold transition-colors ${
            isReplaying ? 'bg-[#ff9800] text-black font-bold' : 'text-[#b2b5be] hover:bg-[#222631] hover:text-white'
          }`}
        >
          <RotateCcw size={14} />
          <span>Replay</span>
        </button>
      </div>

      {/* Right Section: Undo/Redo, Settings, Camera, Fullscreen */}
      <div className="flex items-center gap-1">
        <button className="rounded p-1.5 text-[#787b86] hover:bg-[#222631] hover:text-white" title="Undo (Ctrl+Z)">
          <Undo2 size={16} />
        </button>
        <button className="rounded p-1.5 text-[#787b86] hover:bg-[#222631] hover:text-white" title="Redo (Ctrl+Y)">
          <Redo2 size={16} />
        </button>

        <div className="mx-1 h-5 w-[1px] bg-[#2a2e39]" />

        <button className="flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium text-[#b2b5be] hover:bg-[#222631] hover:text-white">
          <Save size={14} />
          <span className="hidden sm:inline">Save</span>
        </button>

        {/* Chart Settings Gear Icon */}
        <button
          onClick={onOpenSettings}
          className="rounded p-1.5 text-[#787b86] transition-colors hover:bg-[#222631] hover:text-white"
          title="Chart Settings"
        >
          <SlidersHorizontal size={16} />
        </button>

        {/* Screenshot Tool */}
        <button
          onClick={onTakeScreenshot}
          className="rounded p-1.5 text-[#787b86] transition-colors hover:bg-[#222631] hover:text-white"
          title="Take a Snapshot"
        >
          <Camera size={16} />
        </button>

        {/* Fullscreen */}
        <button
          onClick={() => {
            if (!document.fullscreenElement) {
              document.documentElement.requestFullscreen();
            } else {
              document.exitFullscreen();
            }
          }}
          className="rounded p-1.5 text-[#787b86] transition-colors hover:bg-[#222631] hover:text-white"
          title="Fullscreen Mode"
        >
          <Maximize2 size={16} />
        </button>
      </div>
    </header>
  );
}
