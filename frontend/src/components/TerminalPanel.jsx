import React, { useEffect, useState, useRef } from 'react';
import { io } from 'socket.io-client';
import { Terminal as TerminalIcon, Play, Trash2, CornerDownLeft, RefreshCw, Circle } from 'lucide-react';

export default function TerminalPanel({ sandboxId }) {
  const [outputLines, setOutputLines] = useState([
    'Connecting to sandbox PTY bash shell over Socket.IO...',
  ]);
  const [inputCommand, setInputCommand] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const terminalEndRef = useRef(null);
  const inputRef = useRef(null);
  const socketRef = useRef(null);

  useEffect(() => {
    if (!sandboxId) return;

    // Connect to sandbox agent Socket.IO endpoint
    // Browser automatically resolves *.agent.localhost to 127.0.0.1
    const socketUrl = `http://${sandboxId}.agent.localhost`;

    console.log('[Terminal] Connecting to Socket.IO at:', socketUrl);

    const socket = io(socketUrl, {
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 10,
      reconnectionDelay: 2000,
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      setIsConnected(true);
      setOutputLines((prev) => [
        ...prev,
        `\x1b[32m✔ Connected to Sandbox Shell (Socket ID: ${socket.id})\x1b[0m`,
        'Type any bash command below or use quick action chips.\n',
      ]);
    });

    socket.on('terminal-output', (data) => {
      setOutputLines((prev) => [...prev, data]);
    });

    socket.on('disconnect', () => {
      setIsConnected(false);
      setOutputLines((prev) => [
        ...prev,
        '\x1b[31m✖ Disconnected from terminal shell.\x1b[0m',
      ]);
    });

    socket.on('connect_error', (err) => {
      console.warn('[Terminal Socket Error]:', err.message);
      // Fallback message for user
      setOutputLines((prev) => [
        ...prev,
        `\x1b[33m[Notice] Connecting to ${socketUrl}... (${err.message})\x1b[0m`,
      ]);
    });

    return () => {
      socket.disconnect();
    };
  }, [sandboxId]);

  useEffect(() => {
    terminalEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [outputLines]);

  const handleSendCommand = (cmdToSend) => {
    const cmd = cmdToSend ?? inputCommand;
    if (!cmd.trim() && cmdToSend === undefined) return;

    if (cmd.trim() === 'clear') {
      setOutputLines([]);
      setInputCommand('');
      return;
    }

    if (socketRef.current && socketRef.current.connected) {
      // Send command with newline to PTY bash
      socketRef.current.emit('terminal-input', cmd + '\n');
    } else {
      setOutputLines((prev) => [
        ...prev,
        '\x1b[31mSocket not connected yet. Waiting for reconnection...\x1b[0m',
      ]);
    }

    setInputCommand('');
  };

  // Convert raw ANSI codes into readable clean styled spans
  const formatAnsi = (text) => {
    if (typeof text !== 'string') return text;
    // Replace standard ANSI colors with Tailwind color classes
    const cleaned = text
      .replace(/\x1b\[0m/g, '</span>')
      .replace(/\x1b\[1m/g, '<span class="font-bold text-white">')
      .replace(/\x1b\[31m/g, '<span class="text-rose-400">')
      .replace(/\x1b\[32m/g, '<span class="text-emerald-400">')
      .replace(/\x1b\[33m/g, '<span class="text-amber-400">')
      .replace(/\x1b\[34m/g, '<span class="text-indigo-400">')
      .replace(/\x1b\[35m/g, '<span class="text-purple-400">')
      .replace(/\x1b\[36m/g, '<span class="text-cyan-400">')
      .replace(/\x1b\[37m/g, '<span class="text-slate-200">')
      .replace(/\x1b\[[0-9;]*m/g, ''); // strip remaining ANSI sequences

    return <span dangerouslySetInnerHTML={{ __html: cleaned }} />;
  };

  return (
    <div
      className="flex flex-col h-full bg-slate-950 text-slate-200 font-mono text-xs select-text"
      onClick={() => inputRef.current?.focus()}
    >
      {/* Terminal Bar */}
      <div className="h-10 px-4 border-b border-slate-800 bg-slate-900/90 flex items-center justify-between select-none">
        <div className="flex items-center gap-2">
          <TerminalIcon className="w-4 h-4 text-emerald-400" />
          <span className="font-semibold text-xs text-slate-300">bash /workspace</span>
          <div className="flex items-center gap-1.5 ml-2 px-2 py-0.5 rounded-full bg-slate-800 text-[10px]">
            <span
              className={`w-2 h-2 rounded-full ${
                isConnected ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'
              }`}
            />
            <span className="text-slate-400">{isConnected ? 'Online' : 'Reconnecting...'}</span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setOutputLines([])}
            title="Clear terminal"
            className="p-1 text-slate-400 hover:text-slate-200 rounded hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Terminal Output Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-0.5 font-mono leading-relaxed whitespace-pre-wrap break-all">
        {outputLines.map((line, idx) => (
          <div key={idx} className="leading-tight">
            {formatAnsi(line)}
          </div>
        ))}
        <div ref={terminalEndRef} />
      </div>

      {/* Quick Command Chips */}
      <div className="px-4 py-1.5 border-t border-slate-900 bg-slate-900/40 flex items-center gap-1.5 overflow-x-auto select-none">
        <span className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold mr-1">Quick:</span>
        {['ls -la', 'pwd', 'cat package.json', 'pnpm --version', 'clear'].map((cmd) => (
          <button
            key={cmd}
            onClick={(e) => {
              e.stopPropagation();
              handleSendCommand(cmd);
            }}
            className="px-2 py-0.5 rounded bg-slate-800/80 hover:bg-slate-800 text-[11px] text-slate-300 hover:text-white border border-slate-700/50 transition-colors cursor-pointer"
          >
            {cmd}
          </button>
        ))}
      </div>

      {/* Terminal Input Line */}
      <div className="p-2 border-t border-slate-800 bg-slate-900/90 flex items-center gap-2">
        <span className="text-emerald-400 font-bold pl-2 select-none">$</span>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSendCommand();
          }}
          className="flex-1 flex items-center"
        >
          <input
            ref={inputRef}
            type="text"
            value={inputCommand}
            onChange={(e) => setInputCommand(e.target.value)}
            placeholder="Type a bash command (e.g. ls, cat package.json)..."
            className="w-full bg-transparent border-none text-slate-100 placeholder-slate-600 focus:outline-none focus:ring-0 text-xs font-mono"
            autoFocus
          />
          <button
            type="submit"
            disabled={!inputCommand.trim()}
            className="p-1 text-slate-400 hover:text-white disabled:opacity-30 cursor-pointer"
          >
            <CornerDownLeft className="w-3.5 h-3.5" />
          </button>
        </form>
      </div>
    </div>
  );
}
