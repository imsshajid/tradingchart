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

const TOOLS = [
  { id: 'crosshair', icon: <Crosshair size={17} />, label: 'Crosshair' },
  { id: 'trendline', icon: <TrendingUp size={17} />, label: 'Trend Line' },
  { id: 'fib', icon: <Maximize2 size={17} />, label: 'Fib Retracement' },
  { id: 'box', icon: <Square size={17} />, label: 'Order Block / FVG Box' },
  { id: 'text', icon: <Type size={17} />, label: 'Text Note' },
  { id: 'ruler', icon: <Ruler size={17} />, label: 'Measure Range' },
];

export default function DrawingToolbar() {
  const [activeTool, setActiveTool] = useState('crosshair');
  const [isMagnet, setIsMagnet] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const [isHidden, setIsHidden] = useState(false);

  return (
    <aside className="flex w-12 flex-col items-center justify-between border-r border-[#2a2e39] bg-[#181b24] py-2 text-[#787b86]">
      {/* Top Drawing Tools */}
      <div className="flex flex-col items-center gap-1">
        {TOOLS.map((tool) => (
          <button
            key={tool.id}
            onClick={() => setActiveTool(tool.id)}
            className={`rounded-lg p-2 transition-all ${
              activeTool === tool.id
                ? 'bg-[#2962ff] text-white shadow-sm'
                : 'hover:bg-[#222631] hover:text-[#d1d4dc]'
            }`}
            title={tool.label}
          >
            {tool.icon}
          </button>
        ))}
      </div>

      {/* Bottom Utilities */}
      <div className="flex flex-col items-center gap-1 border-t border-[#2a2e39] pt-2">
        <button
          onClick={() => setIsMagnet(!isMagnet)}
          className={`rounded-lg p-2 transition-colors ${
            isMagnet ? 'bg-[#2962ff]/20 text-[#2962ff]' : 'hover:bg-[#222631] hover:text-[#d1d4dc]'
          }`}
          title="Magnet Mode"
        >
          <Magnet size={17} />
        </button>

        <button
          onClick={() => setIsLocked(!isLocked)}
          className={`rounded-lg p-2 transition-colors ${
            isLocked ? 'bg-[#ff9800]/20 text-[#ff9800]' : 'hover:bg-[#222631] hover:text-[#d1d4dc]'
          }`}
          title="Lock All Drawings"
        >
          <Lock size={17} />
        </button>

        <button
          onClick={() => setIsHidden(!isHidden)}
          className={`rounded-lg p-2 transition-colors ${
            isHidden ? 'bg-[#f23645]/20 text-[#f23645]' : 'hover:bg-[#222631] hover:text-[#d1d4dc]'
          }`}
          title="Hide All Drawings"
        >
          <Eye size={17} />
        </button>

        <button
          className="rounded-lg p-2 text-[#787b86] transition-colors hover:bg-[#222631] hover:text-[#f23645]"
          title="Delete All Drawings"
        >
          <Trash2 size={17} />
        </button>
      </div>
    </aside>
  );
}
