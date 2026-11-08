import React, { useState, useEffect } from 'react';
import Header from './components/Header';
import ChatPanel from './components/ChatPanel';
import PreviewPanel from './components/PreviewPanel';
import TerminalPanel from './components/TerminalPanel';
import FilesPanel from './components/FilesPanel';
import StartScreen from './components/StartScreen';
import { Globe, Terminal, Code2 } from 'lucide-react';

export default function App() {
  const [sandboxId, setSandboxId] = useState(() => {
    return localStorage.getItem('clouddev_sandbox_id') || '';
  });
  const [previewUrl, setPreviewUrl] = useState(() => {
    return localStorage.getItem('clouddev_preview_url') || '';
  });
  const [isStarting, setIsStarting] = useState(false);
  const [activeTab, setActiveTab] = useState('preview'); // 'preview' | 'terminal' | 'files'
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // Sync to localStorage
  useEffect(() => {
    if (sandboxId) {
      localStorage.setItem('clouddev_sandbox_id', sandboxId);
    } else {
      localStorage.removeItem('clouddev_sandbox_id');
    }
  }, [sandboxId]);

  useEffect(() => {
    if (previewUrl) {
      localStorage.setItem('clouddev_preview_url', previewUrl);
    } else {
      localStorage.removeItem('clouddev_preview_url');
    }
  }, [previewUrl]);

  // Handle starting a new sandbox via POST /api/sandbox/start
  const handleStartSandbox = async () => {
    setIsStarting(true);
    try {
      const response = await fetch('/api/sandbox/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!response.ok) {
        throw new Error(`Failed to start sandbox: ${response.statusText}`);
      }

      const data = await response.json();
      console.log('Sandbox started successfully:', data);

      setSandboxId(data.sandboxId);
      setPreviewUrl(data.previewUrl || `http://${data.sandboxId}.preview.localhost`);
      setActiveTab('preview');
    } catch (err) {
      console.error('Error starting sandbox:', err);
      alert(`Could not start sandbox: ${err.message}. Make sure the cluster is running.`);
    } finally {
      setIsStarting(false);
    }
  };

  // Resume with an existing sandbox ID
  const handleResumeSandbox = (id) => {
    setSandboxId(id);
    setPreviewUrl(`http://${id}.preview.localhost`);
    setActiveTab('preview');
  };

  const handleResetSandbox = () => {
    if (window.confirm('Do you want to leave this sandbox and start fresh?')) {
      setSandboxId('');
      setPreviewUrl('');
    }
  };

  const triggerPreviewRefresh = () => {
    setRefreshTrigger((prev) => prev + 1);
  };

  // If no sandbox is active, show the Launch Landing Screen
  if (!sandboxId) {
    return (
      <StartScreen
        onStartSandbox={handleStartSandbox}
        isStarting={isStarting}
        onResumeSandbox={handleResumeSandbox}
      />
    );
  }

  return (
    <div className="flex flex-col h-screen w-screen bg-slate-950 text-slate-100 overflow-hidden font-sans">
      {/* Top Header */}
      <Header
        sandboxId={sandboxId}
        previewUrl={previewUrl}
        onResetSandbox={handleResetSandbox}
      />

      {/* Main Workspace Split Layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Side: AI Coding Agent Chat (38% width) */}
        <div className="w-full sm:w-[38%] min-w-[340px] max-w-[500px] h-full flex flex-col">
          <ChatPanel sandboxId={sandboxId} onFileChange={triggerPreviewRefresh} />
        </div>

        {/* Right Side: Tabbed Multi-Viewer (Preview / Terminal / Files) */}
        <div className="flex-1 flex flex-col h-full bg-slate-950 overflow-hidden">
          {/* Navigation Tab Bar */}
          <div className="h-10 border-b border-slate-800 bg-slate-900/80 px-4 flex items-center justify-between select-none">
            <div className="flex items-center gap-1">
              <button
                onClick={() => setActiveTab('preview')}
                className={`flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors cursor-pointer ${
                  activeTab === 'preview'
                    ? 'bg-slate-800 text-indigo-400 font-semibold shadow-sm'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                }`}
              >
                <Globe className="w-3.5 h-3.5 text-indigo-400" />
                <span>Live Preview</span>
              </button>

              <button
                onClick={() => setActiveTab('terminal')}
                className={`flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors cursor-pointer ${
                  activeTab === 'terminal'
                    ? 'bg-slate-800 text-emerald-400 font-semibold shadow-sm'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                }`}
              >
                <Terminal className="w-3.5 h-3.5 text-emerald-400" />
                <span>Socket.IO Terminal</span>
              </button>

              <button
                onClick={() => setActiveTab('files')}
                className={`flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors cursor-pointer ${
                  activeTab === 'files'
                    ? 'bg-slate-800 text-purple-400 font-semibold shadow-sm'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                }`}
              >
                <Code2 className="w-3.5 h-3.5 text-purple-400" />
                <span>Files & Code</span>
              </button>
            </div>
          </div>

          {/* Active Tab View */}
          <div className="flex-1 overflow-hidden relative">
            {activeTab === 'preview' && (
              <PreviewPanel
                previewUrl={previewUrl}
                refreshTrigger={refreshTrigger}
              />
            )}

            {activeTab === 'terminal' && (
              <TerminalPanel sandboxId={sandboxId} />
            )}

            {activeTab === 'files' && (
              <FilesPanel
                sandboxId={sandboxId}
                onFileSaved={triggerPreviewRefresh}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
