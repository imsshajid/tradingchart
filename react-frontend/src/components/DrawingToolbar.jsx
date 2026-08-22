import React, { useState } from 'react';
import {
  Crosshair,
  TrendingUp,
  Maximize2,
  Square,
  Type,
  Smile,
  Ruler,
  ZoomIn,
  Magnet,
  Lock,
  Eye,
  Trash2,
} from 'lucide-react';

export default function DrawingToolbar() {
  const [activeTool, setActiveTool] = useState('crosshair');

  const tools = [
    { id: 'crosshair', icon: <Crosshair size={18} />, label: 'Cursor' },
    { id: 'trendline', icon: <TrendingUp size={18} />, label: 'Trend Line' },
    { id: 'fib', icon: <Maximize2 size={18} />, label: 'Fibonacci' },
    { id: 'rectangle', icon: <Square size={18} />, label: 'Box / Zone' },
    { id: 'text', icon: <Type size={18} />, label: 'Text' },
    { id: 'emoji', icon: <Smile size={18} />, label: 'Icon' },
    { id: 'measure', icon: <Ruler size={18} />, label: 'Measure' },
    { id: 'zoom', icon: <ZoomIn size={18} />, label: 'Zoom' },
  ];

  return (
    <aside className="flex w-12 flex-col items-center justify-between border-r border-[#2a2e39] bg-[#131722] py-2 text-[#787b86] select-none shrink-0 z-20">
      <div className="flex flex-col items-center gap-1 w-full">
        {tools.map((tool) => (
          <button
            key={tool.id}
            onClick={() => setActiveTool(tool.id)}
            title={tool.label}
            className={`flex h-9 w-9 items-center justify-center rounded-lg transition-colors ${
              activeTool === tool.id
                ? 'bg-[#2962ff] text-white shadow'
                : 'hover:bg-[#2a2e39] hover:text-[#d1d4dc]'
            }`}
          >
            {tool.icon}
          </button>
        ))}
      </div>

      <div className="flex flex-col items-center gap-1 border-t border-[#2a2e39] pt-2 w-full">
        <button
          title="Magnet Mode"
          className="flex h-9 w-9 items-center justify-center rounded-lg hover:bg-[#2a2e39] hover:text-[#d1d4dc] transition-colors"
        >
          <Magnet size={17} />
        </button>
        <button
          title="Lock All Drawings"
          className="flex h-9 w-9 items-center justify-center rounded-lg hover:bg-[#2a2e39] hover:text-[#d1d4dc] transition-colors"
        >
          <Lock size={17} />
        </button>
        <button
          title="Hide All Drawings"
          className="flex h-9 w-9 items-center justify-center rounded-lg hover:bg-[#2a2e39] hover:text-[#d1d4dc] transition-colors"
        >
          <Eye size={17} />
        </button>
        <button
          title="Remove Drawings"
          className="flex h-9 w-9 items-center justify-center rounded-lg hover:bg-[#2a2e39] hover:text-[#f23645] transition-colors"
        >
          <Trash2 size={17} />
        </button>
      </div>
    </aside>
  );
}
