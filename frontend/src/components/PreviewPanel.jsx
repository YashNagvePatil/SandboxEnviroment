import React, { useState, useRef } from 'react';
import { RotateCw, ExternalLink, Monitor, Tablet, Smartphone, Globe, ShieldCheck } from 'lucide-react';

export default function PreviewPanel({ previewUrl, refreshTrigger }) {
  const [device, setDevice] = useState('desktop'); // desktop, tablet, mobile
  const [key, setKey] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const iframeRef = useRef(null);

  const handleRefresh = () => {
    setIsLoading(true);
    setKey((prev) => prev + 1);
  };

  // If parent triggers refresh (e.g. AI updated files), reload iframe
  React.useEffect(() => {
    if (refreshTrigger) {
      handleRefresh();
    }
  }, [refreshTrigger]);

  const getDeviceWidthClass = () => {
    switch (device) {
      case 'mobile':
        return 'w-[375px] shadow-2xl rounded-2xl border-4 border-slate-800 my-4';
      case 'tablet':
        return 'w-[768px] shadow-2xl rounded-xl border-4 border-slate-800 my-4';
      default:
        return 'w-full h-full';
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-950 overflow-hidden">
      {/* Top Preview Bar */}
      <div className="h-10 px-4 border-b border-slate-800 bg-slate-900/90 flex items-center justify-between select-none">
        {/* Device Switcher */}
        <div className="flex items-center gap-1 bg-slate-950 p-0.5 rounded-lg border border-slate-800">
          <button
            onClick={() => setDevice('desktop')}
            className={`p-1 rounded ${device === 'desktop' ? 'bg-slate-800 text-indigo-400' : 'text-slate-500 hover:text-slate-300'} transition-colors cursor-pointer`}
            title="Desktop View"
          >
            <Monitor className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setDevice('tablet')}
            className={`p-1 rounded ${device === 'tablet' ? 'bg-slate-800 text-indigo-400' : 'text-slate-500 hover:text-slate-300'} transition-colors cursor-pointer`}
            title="Tablet View (768px)"
          >
            <Tablet className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setDevice('mobile')}
            className={`p-1 rounded ${device === 'mobile' ? 'bg-slate-800 text-indigo-400' : 'text-slate-500 hover:text-slate-300'} transition-colors cursor-pointer`}
            title="Mobile View (375px)"
          >
            <Smartphone className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Address Bar */}
        <div className="flex-1 max-w-md mx-4">
          <div className="flex items-center gap-2 bg-slate-950 px-3 py-1 rounded-md border border-slate-800/80 text-[11px] text-slate-400 font-mono truncate">
            <Globe className="w-3 h-3 text-emerald-400 shrink-0" />
            <span className="truncate">{previewUrl}</span>
          </div>
        </div>

        {/* Refresh & Open Actions */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={handleRefresh}
            className="p-1.5 text-slate-400 hover:text-white rounded-md hover:bg-slate-800 transition-colors cursor-pointer"
            title="Refresh Preview"
          >
            <RotateCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-indigo-400' : ''}`} />
          </button>

          <a
            href={previewUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="p-1.5 text-slate-400 hover:text-white rounded-md hover:bg-slate-800 transition-colors"
            title="Open in new window"
          >
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
      </div>

      {/* Frame Container */}
      <div className="flex-1 bg-slate-900/40 flex items-center justify-center p-0 relative overflow-auto">
        <iframe
          key={key}
          ref={iframeRef}
          src={previewUrl}
          title="Sandbox Preview"
          onLoad={() => setIsLoading(false)}
          className={`bg-white transition-all duration-300 border-none ${getDeviceWidthClass()}`}
          style={{ height: device === 'desktop' ? '100%' : '90%' }}
        />
      </div>
    </div>
  );
}
