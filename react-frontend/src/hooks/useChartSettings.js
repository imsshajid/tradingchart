import { useState, useEffect } from 'react';

export const DEFAULT_SETTINGS = {
  // --- Symbol / Candle Styles ---
  candleType: 'candlestick', // 'candlestick' | 'hollow' | 'bar' | 'line' | 'area' | 'heikin-ashi'
  upColor: '#089981',         // TradingView Green
  downColor: '#f23645',       // TradingView Red
  borderVisible: true,
  borderUpColor: '#089981',
  borderDownColor: '#f23645',
  wickVisible: true,
  wickUpColor: '#089981',
  wickDownColor: '#f23645',
  lastPriceLineVisible: true,
  lastPriceLineColor: '#2962ff',
  prevClosePriceLineVisible: false,
  highLowPriceLinesVisible: false,
  priceFormat: {
    type: 'price',
    precision: 2,
    minMove: 0.01,
  },

  // --- Status Line ---
  showSymbolLogo: true,
  showOpenMarketStatus: true,
  showOHLC: true,
  showBarChange: true,
  showVolume: true,
  showIndicators: true,

  // --- Scales (Axes) ---
  priceScalePlacement: 'right', // 'right' | 'left'
  showCountdownToBarClose: true,
  showSymbolLabel: true,
  showLastPriceLabel: true,
  showHighLowLabels: false,
  lockPriceToBarRatio: false,
  scaleMode: 0, // 0: Normal, 1: Logarithmic, 2: Percentage

  // --- Appearance / Canvas ---
  backgroundType: 'solid', // 'solid' | 'gradient'
  backgroundColor: '#131722', // Official TV dark background
  backgroundGradientTop: '#131722',
  backgroundGradientBottom: '#0c0d14',
  gridVertColor: 'rgba(42, 46, 57, 0.4)',
  gridHorzColor: 'rgba(42, 46, 57, 0.4)',
  gridLineStyle: 2, // 0: Solid, 1: Dotted, 2: Dashed, 3: LargeDashed
  crosshairColor: '#758696',
  crosshairStyle: 1,
  crosshairMode: 1, // 0: Normal, 1: Magnet
  watermarkVisible: true,
  watermarkColor: 'rgba(255, 255, 255, 0.03)',
  watermarkFontSize: 48,
  topMargin: 0.12,
  bottomMargin: 0.12,
  rightOffset: 12,
  barSpacing: 8,

  // --- Trading / Execution ---
  showBuySellButtons: true,
  showPositions: true,
  showOrders: true,
};

export const COLOR_PRESETS = {
  tradingview_dark: {
    name: 'TradingView Dark',
    upColor: '#089981',
    downColor: '#f23645',
    borderUpColor: '#089981',
    borderDownColor: '#f23645',
    wickUpColor: '#089981',
    wickDownColor: '#f23645',
    backgroundColor: '#131722',
    gridVertColor: 'rgba(42, 46, 57, 0.4)',
    gridHorzColor: 'rgba(42, 46, 57, 0.4)',
  },
  tradingview_light: {
    name: 'TradingView Light',
    upColor: '#089981',
    downColor: '#f23645',
    borderUpColor: '#089981',
    borderDownColor: '#f23645',
    wickUpColor: '#089981',
    wickDownColor: '#f23645',
    backgroundColor: '#ffffff',
    gridVertColor: 'rgba(240, 243, 250, 0.8)',
    gridHorzColor: 'rgba(240, 243, 250, 0.8)',
  },
  neon_cyber: {
    name: 'Neon Cyberpunk',
    upColor: '#00ffcc',
    downColor: '#ff007f',
    borderUpColor: '#00ffcc',
    borderDownColor: '#ff007f',
    wickUpColor: '#00ffcc',
    wickDownColor: '#ff007f',
    backgroundColor: '#0a0a12',
    gridVertColor: 'rgba(0, 255, 204, 0.08)',
    gridHorzColor: 'rgba(255, 0, 127, 0.08)',
  },
  matrix: {
    name: 'Monochrome Matrix',
    upColor: '#22c55e',
    downColor: '#15803d',
    borderUpColor: '#4ade80',
    borderDownColor: '#166534',
    wickUpColor: '#4ade80',
    wickDownColor: '#166534',
    backgroundColor: '#020617',
    gridVertColor: 'rgba(34, 197, 94, 0.1)',
    gridHorzColor: 'rgba(34, 197, 94, 0.1)',
  },
};

const STORAGE_KEY = 'tc_tv_chart_settings_v1';

export function useChartSettings() {
  const [settings, setSettings] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? { ...DEFAULT_SETTINGS, ...JSON.parse(saved) } : DEFAULT_SETTINGS;
    } catch {
      return DEFAULT_SETTINGS;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch (e) {
      console.error('Failed to save chart settings:', e);
    }
  }, [settings]);

  const updateSetting = (key, value) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  const applyPreset = (presetKey) => {
    if (COLOR_PRESETS[presetKey]) {
      setSettings((prev) => ({
        ...prev,
        ...COLOR_PRESETS[presetKey],
      }));
    }
  };

  const resetToDefault = () => {
    setSettings(DEFAULT_SETTINGS);
  };

  return {
    settings,
    updateSetting,
    applyPreset,
    resetToDefault,
  };
}
