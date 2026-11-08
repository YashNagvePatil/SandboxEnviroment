import React, { useState } from 'react';
import { Sparkles, ExternalLink, Copy, Check, Terminal, Globe, Plus, Layers } from 'lucide-react';

export default function Header({ sandboxId, previewUrl, onResetSandbox }) {
  const [copied, setCopied] = useState(false);

  const handleCopyId = () => {
    navigator.clipboard.writeText(sandboxId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <header className="h-14 border-b border-slate-800 bg-slate-950/80 backdrop-blur-md px-4 flex items-center justify-between select-none z-20">
      {/* Brand & Sandbox Info */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 font-bold text-white tracking-tight text-sm">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-tr from-indigo-500 to-purple-600 flex items-center justify-center text-white shadow-md shadow-indigo-500/20">
            <Layers className="w-4 h-4" />
          </div>
          <span>CloudDev<span className="text-indigo-400">Studio</span></span>
        </div>

        <div className="h-4 w-px bg-slate-800" />

        {/* Sandbox ID Pill */}
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-900 border border-slate-800 text-xs text-slate-300">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span className="font-mono text-[11px] text-slate-400">
            {sandboxId ? `${sandboxId.slice(0, 8)}...${sandboxId.slice(-6)}` : 'Connecting...'}
          </span>
          <button
            onClick={handleCopyId}
            title="Copy Sandbox ID"
            className="text-slate-400 hover:text-slate-200 transition-colors p-0.5 rounded cursor-pointer"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* Right Controls */}
      <div className="flex items-center gap-2.5">
        {previewUrl && (
          <a
            href={previewUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-xs text-slate-300 hover:text-white px-2.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 transition-colors"
          >
            <Globe className="w-3.5 h-3.5 text-indigo-400" />
            <span>Open Preview</span>
            <ExternalLink className="w-3 h-3 text-slate-500" />
          </a>
        )}

        <button
          onClick={onResetSandbox}
          className="flex items-center gap-1.5 text-xs text-slate-300 hover:text-white px-3 py-1.5 rounded-lg bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/30 transition-colors cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>New Sandbox</span>
        </button>
      </div>
    </header>
  );
}
