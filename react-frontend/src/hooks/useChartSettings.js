import { useState, useEffect } from 'react';

export const DEFAULT_CHART_SETTINGS = {
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

export const COLOR_PRESETS = {
  tradingview_dark: {
    name: 'TradingView Dark',
    settings: {
      backgroundColor: '#131722',
      gridVertColor: '#1e222d',
      gridHorzColor: '#1e222d',
      upColor: '#089981',
      downColor: '#f23645',
      borderUpColor: '#089981',
      borderDownColor: '#f23645',
      wickUpColor: '#089981',
      wickDownColor: '#f23645',
      lastPriceLineColor: '#2962ff',
    },
  },
  neon_cyberpunk: {
    name: 'Neon Cyberpunk',
    settings: {
      backgroundColor: '#0a0b10',
      gridVertColor: '#16192b',
      gridHorzColor: '#16192b',
      upColor: '#00ffcc',
      downColor: '#ff007f',
      borderUpColor: '#00ffcc',
      borderDownColor: '#ff007f',
      wickUpColor: '#00ffcc',
      wickDownColor: '#ff007f',
      lastPriceLineColor: '#00ffcc',
    },
  },
  monochrome: {
    name: 'Monochrome Pro',
    settings: {
      backgroundColor: '#121212',
      gridVertColor: '#1f1f1f',
      gridHorzColor: '#1f1f1f',
      upColor: '#e0e0e0',
      downColor: '#424242',
      borderUpColor: '#ffffff',
      borderDownColor: '#616161',
      wickUpColor: '#ffffff',
      wickDownColor: '#616161',
      lastPriceLineColor: '#ffffff',
    },
  },
};

export function useChartSettings() {
  const [settings, setSettings] = useState(() => {
    try {
      const saved = localStorage.getItem('tv_chart_settings');
      return saved ? { ...DEFAULT_CHART_SETTINGS, ...JSON.parse(saved) } : DEFAULT_CHART_SETTINGS;
    } catch {
      return DEFAULT_CHART_SETTINGS;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('tv_chart_settings', JSON.stringify(settings));
    } catch (e) {
      console.warn('Could not save settings to localStorage:', e);
    }
  }, [settings]);

  const updateSetting = (key, value) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  const applyPreset = (presetKey) => {
    const preset = COLOR_PRESETS[presetKey];
    if (preset) {
      setSettings((prev) => ({ ...prev, ...preset.settings }));
    }
  };

  const resetToDefault = () => {
    setSettings(DEFAULT_CHART_SETTINGS);
  };

  return { settings, updateSetting, applyPreset, resetToDefault };
}

export default useChartSettings;
