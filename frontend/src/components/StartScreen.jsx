import React, { useState } from 'react';
import { Sparkles, Terminal, Code2, Globe, Cpu, ArrowRight, CheckCircle2, RefreshCw } from 'lucide-react';

export default function StartScreen({ onStartSandbox, isStarting, onResumeSandbox }) {
  const [customId, setCustomId] = useState('');
  const [showCustomInput, setShowCustomInput] = useState(false);

  const handleResumeSubmit = (e) => {
    e.preventDefault();
    if (customId.trim()) {
      onResumeSandbox(customId.trim());
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-6 relative overflow-hidden">
      {/* Background Glow Effects */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-gradient-to-tr from-indigo-600/20 via-purple-600/20 to-pink-500/20 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-32 -left-32 w-96 h-96 bg-blue-600/10 rounded-full blur-3xl pointer-events-none" />

      {/* Main Container */}
      <div className="max-w-3xl w-full text-center relative z-10 flex flex-col items-center">
        {/* Badge */}
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-900/80 border border-slate-800 text-xs font-medium text-indigo-400 mb-6 backdrop-blur-md">
          <Sparkles className="w-3.5 h-3.5" />
          <span>Next-Gen Cloud WebContainer Environment</span>
        </div>

        {/* Hero Title */}
        <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight text-white mb-6 leading-tight">
          AI Full-Stack Sandbox <br />
          <span className="bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
            Build & Preview in Real-Time
          </span>
        </h1>

        <p className="text-slate-400 text-lg max-w-xl mb-10 leading-relaxed">
          Spin up an isolated cloud sandbox pod with live Vite HMR, real-time interactive terminal access via Socket.IO, and AI streaming orchestration.
        </p>

        {/* Action Button */}
        <div className="flex flex-col sm:flex-row items-center gap-4 w-full justify-center max-w-md">
          <button
            onClick={onStartSandbox}
            disabled={isStarting}
            className="w-full sm:w-auto px-8 py-4 rounded-xl bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 hover:from-indigo-600 hover:via-purple-600 hover:to-pink-600 text-white font-semibold text-base shadow-lg shadow-indigo-500/25 flex items-center justify-center gap-3 transition-all duration-200 transform hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-50 disabled:pointer-events-none cursor-pointer"
          >
            {isStarting ? (
              <>
                <RefreshCw className="w-5 h-5 animate-spin" />
                <span>Provisioning Sandbox Pod...</span>
              </>
            ) : (
              <>
                <span>Launch New Sandbox</span>
                <ArrowRight className="w-5 h-5" />
              </>
            )}
          </button>

          <button
            type="button"
            onClick={() => setShowCustomInput(!showCustomInput)}
            className="text-xs text-slate-400 hover:text-slate-200 underline underline-offset-4 py-2 transition-colors cursor-pointer"
          >
            {showCustomInput ? 'Hide ID input' : 'Or connect to existing Sandbox ID'}
          </button>
        </div>

        {/* Resume Existing Sandbox Input */}
        {showCustomInput && (
          <form onSubmit={handleResumeSubmit} className="mt-6 flex items-center gap-2 max-w-md w-full">
            <input
              type="text"
              placeholder="e.g. 01a1b631-d2de-73db-8b5c-34ce931a6abc"
              value={customId}
              onChange={(e) => setCustomId(e.target.value)}
              className="flex-1 bg-slate-900 border border-slate-800 rounded-lg px-4 py-2.5 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
            />
            <button
              type="submit"
              disabled={!customId.trim()}
              className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-sm font-medium rounded-lg text-white transition-colors cursor-pointer"
            >
              Connect
            </button>
          </form>
        )}

        {/* Feature Cards Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-16 text-left w-full">
          <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800/80 backdrop-blur-sm">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/10 text-indigo-400 flex items-center justify-center mb-4">
              <Sparkles className="w-5 h-5" />
            </div>
            <h3 className="font-semibold text-slate-200 mb-1.5 text-sm">Streaming AI Agent</h3>
            <p className="text-slate-400 text-xs leading-relaxed">
              Real-time token streaming with automatic fallback chain and file manipulation tools.
            </p>
          </div>

          <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800/80 backdrop-blur-sm">
            <div className="w-10 h-10 rounded-xl bg-purple-500/10 text-purple-400 flex items-center justify-center mb-4">
              <Globe className="w-5 h-5" />
            </div>
            <h3 className="font-semibold text-slate-200 mb-1.5 text-sm">Live Hot-Reload</h3>
            <p className="text-slate-400 text-xs leading-relaxed">
              Vite dev server instant preview with responsive controls and auto-refresh.
            </p>
          </div>

          <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800/80 backdrop-blur-sm">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center mb-4">
              <Terminal className="w-5 h-5" />
            </div>
            <h3 className="font-semibold text-slate-200 mb-1.5 text-sm">Interactive PTY Shell</h3>
            <p className="text-slate-400 text-xs leading-relaxed">
              Bi-directional terminal shell over Socket.IO with ANSI color streams and command execution.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
