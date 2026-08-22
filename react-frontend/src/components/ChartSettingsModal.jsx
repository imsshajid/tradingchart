import React, { useState } from 'react';
import { X, RotateCcw, Check, Sparkles, Sliders, Eye, Grid, DollarSign, Layers } from 'lucide-react';
import { COLOR_PRESETS } from '../hooks/useChartSettings';

export default function ChartSettingsModal({ isOpen, onClose, settings, updateSetting, applyPreset, resetToDefault }) {
  const [activeTab, setActiveTab] = useState('symbol');

  if (!isOpen) return null;

  const tabs = [
    { id: 'symbol', label: 'Symbol', icon: <Sliders size={16} /> },
    { id: 'status_line', label: 'Status Line', icon: <Eye size={16} /> },
    { id: 'scales', label: 'Scales', icon: <Layers size={16} /> },
    { id: 'appearance', label: 'Appearance', icon: <Grid size={16} /> },
    { id: 'trading', label: 'Trading', icon: <DollarSign size={16} /> },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="relative w-full max-w-2xl overflow-hidden rounded-xl border border-[#2a2e39] bg-[#1e222d] text-[#d1d4dc] shadow-2xl animate-in fade-in zoom-in-95 duration-150">
        
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-[#2a2e39] px-6 py-4">
          <div className="flex items-center gap-3">
            <h2 className="text-base font-semibold tracking-tight text-white">Chart Settings</h2>
            <span className="rounded bg-[#2a2e39] px-2 py-0.5 text-xs font-medium text-[#787b86]">v2.4</span>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-[#787b86] transition-colors hover:bg-[#2a2e39] hover:text-white"
          >
            <X size={18} />
          </button>
        </div>

        {/* Modal Body: Sidebar Tabs + Content */}
        <div className="flex h-[440px]">
          {/* Sidebar Tabs */}
          <div className="w-48 border-r border-[#2a2e39] bg-[#181b24] p-2">
            <div className="space-y-1">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-xs font-medium transition-all ${
                    activeTab === tab.id
                      ? 'bg-[#2962ff] text-white shadow-sm'
                      : 'text-[#9598a1] hover:bg-[#222631] hover:text-white'
                  }`}
                >
                  {tab.icon}
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Presets Selector */}
            <div className="mt-8 border-t border-[#2a2e39] pt-4">
              <div className="mb-2 flex items-center gap-1.5 px-3 text-[11px] font-semibold uppercase tracking-wider text-[#787b86]">
                <Sparkles size={12} /> Presets
              </div>
              <div className="space-y-1">
                {Object.entries(COLOR_PRESETS).map(([key, preset]) => (
                  <button
                    key={key}
                    onClick={() => applyPreset(key)}
                    className="w-full truncate rounded px-3 py-1.5 text-left text-xs text-[#b2b5be] transition-colors hover:bg-[#222631] hover:text-white"
                  >
                    {preset.name}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Tab Content Panel */}
          <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
            {/* 1. SYMBOL TAB */}
            {activeTab === 'symbol' && (
              <div className="space-y-6">
                <div>
                  <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-[#787b86]">Candle Colors</h3>
                  <div className="grid grid-cols-2 gap-4 rounded-lg border border-[#2a2e39] bg-[#141720] p-4">
                    {/* Body Color */}
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-[#d1d4dc]">Body</span>
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          value={settings.upColor}
                          onChange={(e) => updateSetting('upColor', e.target.value)}
                          className="h-6 w-6 cursor-pointer rounded border-0 bg-transparent"
                          title="Bullish Body Color"
                        />
                        <input
                          type="color"
                          value={settings.downColor}
                          onChange={(e) => updateSetting('downColor', e.target.value)}
                          className="h-6 w-6 cursor-pointer rounded border-0 bg-transparent"
                          title="Bearish Body Color"
                        />
                      </div>
                    </div>

                    {/* Borders Color */}
                    <div className="flex items-center justify-between">
                      <label className="flex items-center gap-2 text-xs text-[#d1d4dc] cursor-pointer">
                        <input
                          type="checkbox"
                          checked={settings.borderVisible}
                          onChange={(e) => updateSetting('borderVisible', e.target.checked)}
                          className="rounded border-[#363a45] bg-[#2a2e39] text-[#2962ff] focus:ring-0"
                        />
                        Borders
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          disabled={!settings.borderVisible}
                          value={settings.borderUpColor}
                          onChange={(e) => updateSetting('borderUpColor', e.target.value)}
                          className={`h-6 w-6 rounded border-0 bg-transparent ${settings.borderVisible ? 'cursor-pointer' : 'opacity-30'}`}
                        />
                        <input
                          type="color"
                          disabled={!settings.borderVisible}
                          value={settings.borderDownColor}
                          onChange={(e) => updateSetting('borderDownColor', e.target.value)}
                          className={`h-6 w-6 rounded border-0 bg-transparent ${settings.borderVisible ? 'cursor-pointer' : 'opacity-30'}`}
                        />
                      </div>
                    </div>

                    {/* Wick Color */}
                    <div className="flex items-center justify-between">
                      <label className="flex items-center gap-2 text-xs text-[#d1d4dc] cursor-pointer">
                        <input
                          type="checkbox"
                          checked={settings.wickVisible}
                          onChange={(e) => updateSetting('wickVisible', e.target.checked)}
                          className="rounded border-[#363a45] bg-[#2a2e39] text-[#2962ff] focus:ring-0"
                        />
                        Wick
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          disabled={!settings.wickVisible}
                          value={settings.wickUpColor}
                          onChange={(e) => updateSetting('wickUpColor', e.target.value)}
                          className={`h-6 w-6 rounded border-0 bg-transparent ${settings.wickVisible ? 'cursor-pointer' : 'opacity-30'}`}
                        />
                        <input
                          type="color"
                          disabled={!settings.wickVisible}
                          value={settings.wickDownColor}
                          onChange={(e) => updateSetting('wickDownColor', e.target.value)}
                          className={`h-6 w-6 rounded border-0 bg-transparent ${settings.wickVisible ? 'cursor-pointer' : 'opacity-30'}`}
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Price Lines */}
                <div>
                  <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-[#787b86]">Price Lines</h3>
                  <div className="space-y-3 rounded-lg border border-[#2a2e39] bg-[#141720] p-4">
                    <div className="flex items-center justify-between">
                      <label className="flex items-center gap-2 text-xs text-[#d1d4dc] cursor-pointer">
                        <input
                          type="checkbox"
                          checked={settings.lastPriceLineVisible}
                          onChange={(e) => updateSetting('lastPriceLineVisible', e.target.checked)}
                          className="rounded border-[#363a45] bg-[#2a2e39] text-[#2962ff] focus:ring-0"
                        />
                        Last Price Line
                      </label>
                      <input
                        type="color"
                        value={settings.lastPriceLineColor}
                        onChange={(e) => updateSetting('lastPriceLineColor', e.target.value)}
                        className="h-6 w-6 cursor-pointer rounded border-0 bg-transparent"
                      />
                    </div>

                    <div className="flex items-center justify-between">
                      <label className="flex items-center gap-2 text-xs text-[#d1d4dc] cursor-pointer">
                        <input
                          type="checkbox"
                          checked={settings.prevClosePriceLineVisible}
                          onChange={(e) => updateSetting('prevClosePriceLineVisible', e.target.checked)}
                          className="rounded border-[#363a45] bg-[#2a2e39] text-[#2962ff] focus:ring-0"
                        />
                        Previous Day Close Price Line
                      </label>
                    </div>

                    <div className="flex items-center justify-between">
                      <label className="flex items-center gap-2 text-xs text-[#d1d4dc] cursor-pointer">
                        <input
                          type="checkbox"
                          checked={settings.highLowPriceLinesVisible}
                          onChange={(e) => updateSetting('highLowPriceLinesVisible', e.target.checked)}
                          className="rounded border-[#363a45] bg-[#2a2e39] text-[#2962ff] focus:ring-0"
                        />
                        High and Low Price Lines
                      </label>
                    </div>
                  </div>
                </div>

                {/* Precision */}
                <div>
                  <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-[#787b86]">Precision</h3>
                  <select
                    value={settings.priceFormat.precision}
                    onChange={(e) =>
                      updateSetting('priceFormat', {
                        ...settings.priceFormat,
                        precision: parseInt(e.target.value),
                        minMove: 1 / Math.pow(10, parseInt(e.target.value)),
                      })
                    }
                    className="w-full rounded border border-[#2a2e39] bg-[#141720] px-3 py-2 text-xs text-white outline-none focus:border-[#2962ff]"
                  >
                    <option value={0}>0 (1)</option>
                    <option value={1}>1 (0.1)</option>
                    <option value={2}>2 (0.01) - Default</option>
                    <option value={3}>3 (0.001)</option>
                    <option value={4}>4 (0.0001)</option>
                    <option value={5}>5 (0.00001)</option>
                    <option value={8}>8 (0.00000001 Crypto)</option>
                  </select>
                </div>
              </div>
            )}

            {/* 2. STATUS LINE TAB */}
            {activeTab === 'status_line' && (
              <div className="space-y-4">
                <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-[#787b86]">Header Info</h3>
                <div className="space-y-3 rounded-lg border border-[#2a2e39] bg-[#141720] p-4">
                  {[
                    { key: 'showSymbolLogo', label: 'Symbol Logo & Ticker' },
                    { key: 'showOpenMarketStatus', label: 'Open Market Status Dot' },
                    { key: 'showOHLC', label: 'OHLC Values (Open, High, Low, Close)' },
                    { key: 'showBarChange', label: 'Bar Change Values & Percentage' },
                    { key: 'showVolume', label: 'Volume' },
                    { key: 'showIndicators', label: 'Indicator Titles & Live Arguments' },
                  ].map(({ key, label }) => (
                    <label key={key} className="flex items-center gap-3 text-xs text-[#d1d4dc] cursor-pointer">
                      <input
                        type="checkbox"
                        checked={settings[key]}
                        onChange={(e) => updateSetting(key, e.target.checked)}
                        className="rounded border-[#363a45] bg-[#2a2e39] text-[#2962ff] focus:ring-0"
                      />
                      {label}
                    </label>
                  ))}
                </div>
              </div>
            )}

            {/* 3. SCALES TAB */}
            {activeTab === 'scales' && (
              <div className="space-y-4">
                <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-[#787b86]">Price Scale Options</h3>
                <div className="space-y-3 rounded-lg border border-[#2a2e39] bg-[#141720] p-4">
                  <label className="flex items-center gap-3 text-xs text-[#d1d4dc] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={settings.showCountdownToBarClose}
                      onChange={(e) => updateSetting('showCountdownToBarClose', e.target.checked)}
                      className="rounded border-[#363a45] bg-[#2a2e39] text-[#2962ff] focus:ring-0"
                    />
                    Countdown to Bar Close
                  </label>
                  <label className="flex items-center gap-3 text-xs text-[#d1d4dc] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={settings.showSymbolLabel}
                      onChange={(e) => updateSetting('showSymbolLabel', e.target.checked)}
                      className="rounded border-[#363a45] bg-[#2a2e39] text-[#2962ff] focus:ring-0"
                    />
                    Symbol Name Label
                  </label>
                  <label className="flex items-center gap-3 text-xs text-[#d1d4dc] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={settings.showLastPriceLabel}
                      onChange={(e) => updateSetting('showLastPriceLabel', e.target.checked)}
                      className="rounded border-[#363a45] bg-[#2a2e39] text-[#2962ff] focus:ring-0"
                    />
                    Symbol Last Value Label
                  </label>
                  <div className="flex items-center justify-between pt-2">
                    <span className="text-xs text-[#d1d4dc]">Scale Placement</span>
                    <select
                      value={settings.priceScalePlacement}
                      onChange={(e) => updateSetting('priceScalePlacement', e.target.value)}
                      className="rounded border border-[#2a2e39] bg-[#1e222d] px-2.5 py-1 text-xs text-white"
                    >
                      <option value="right">Right</option>
                      <option value="left">Left</option>
                    </select>
                  </div>
                </div>
              </div>
            )}

            {/* 4. APPEARANCE TAB */}
            {activeTab === 'appearance' && (
              <div className="space-y-6">
                <div>
                  <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-[#787b86]">Canvas Background</h3>
                  <div className="flex items-center justify-between rounded-lg border border-[#2a2e39] bg-[#141720] p-4">
                    <span className="text-xs text-[#d1d4dc]">Background Color</span>
                    <input
                      type="color"
                      value={settings.backgroundColor}
                      onChange={(e) => updateSetting('backgroundColor', e.target.value)}
                      className="h-6 w-6 cursor-pointer rounded border-0 bg-transparent"
                    />
                  </div>
                </div>

                {/* Gridlines */}
                <div>
                  <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-[#787b86]">Grid Lines</h3>
                  <div className="grid grid-cols-2 gap-4 rounded-lg border border-[#2a2e39] bg-[#141720] p-4">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-[#d1d4dc]">Vertical</span>
                      <input
                        type="color"
                        value={settings.gridVertColor.startsWith('#') ? settings.gridVertColor : '#2a2e39'}
                        onChange={(e) => updateSetting('gridVertColor', e.target.value)}
                        className="h-6 w-6 cursor-pointer rounded border-0 bg-transparent"
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-[#d1d4dc]">Horizontal</span>
                      <input
                        type="color"
                        value={settings.gridHorzColor.startsWith('#') ? settings.gridHorzColor : '#2a2e39'}
                        onChange={(e) => updateSetting('gridHorzColor', e.target.value)}
                        className="h-6 w-6 cursor-pointer rounded border-0 bg-transparent"
                      />
                    </div>
                  </div>
                </div>

                {/* Watermark */}
                <div>
                  <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-[#787b86]">Watermark</h3>
                  <div className="flex items-center justify-between rounded-lg border border-[#2a2e39] bg-[#141720] p-4">
                    <label className="flex items-center gap-3 text-xs text-[#d1d4dc] cursor-pointer">
                      <input
                        type="checkbox"
                        checked={settings.watermarkVisible}
                        onChange={(e) => updateSetting('watermarkVisible', e.target.checked)}
                        className="rounded border-[#363a45] bg-[#2a2e39] text-[#2962ff] focus:ring-0"
                      />
                      Show Symbol Watermark
                    </label>
                  </div>
                </div>
              </div>
            )}

            {/* 5. TRADING TAB */}
            {activeTab === 'trading' && (
              <div className="space-y-4">
                <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-[#787b86]">On-Chart Order Controls</h3>
                <div className="space-y-3 rounded-lg border border-[#2a2e39] bg-[#141720] p-4">
                  <label className="flex items-center gap-3 text-xs text-[#d1d4dc] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={settings.showBuySellButtons}
                      onChange={(e) => updateSetting('showBuySellButtons', e.target.checked)}
                      className="rounded border-[#363a45] bg-[#2a2e39] text-[#2962ff] focus:ring-0"
                    />
                    Show Quick Buy / Sell Execution Buttons
                  </label>
                  <label className="flex items-center gap-3 text-xs text-[#d1d4dc] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={settings.showPositions}
                      onChange={(e) => updateSetting('showPositions', e.target.checked)}
                      className="rounded border-[#363a45] bg-[#2a2e39] text-[#2962ff] focus:ring-0"
                    />
                    Show Open Position Lines on Chart
                  </label>
                  <label className="flex items-center gap-3 text-xs text-[#d1d4dc] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={settings.showOrders}
                      onChange={(e) => updateSetting('showOrders', e.target.checked)}
                      className="rounded border-[#363a45] bg-[#2a2e39] text-[#2962ff] focus:ring-0"
                    />
                    Show Working Limit / Stop Orders
                  </label>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between border-t border-[#2a2e39] bg-[#181b24] px-6 py-3.5">
          <button
            onClick={resetToDefault}
            className="flex items-center gap-1.5 text-xs text-[#787b86] transition-colors hover:text-white"
          >
            <RotateCcw size={14} /> Reset Defaults
          </button>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="rounded-lg bg-[#2a2e39] px-4 py-1.5 text-xs font-medium text-white transition-colors hover:bg-[#363a45]"
            >
              Cancel
            </button>
            <button
              onClick={onClose}
              className="flex items-center gap-1.5 rounded-lg bg-[#2962ff] px-5 py-1.5 text-xs font-medium text-white shadow-md transition-colors hover:bg-[#1e53e5]"
            >
              <Check size={14} /> Ok
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
