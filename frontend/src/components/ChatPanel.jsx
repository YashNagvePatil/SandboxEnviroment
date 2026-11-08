import React, { useState, useRef, useEffect } from 'react';
import { Send, Bot, User, Sparkles, Loader2, CheckCircle2, AlertCircle, Wrench, ChevronDown, ChevronRight } from 'lucide-react';

export default function ChatPanel({ sandboxId, onFileChange }) {
  const [messages, setMessages] = useState([
    {
      id: 'welcome',
      role: 'assistant',
      content: "Hello! I am your AI Full-Stack Developer. I have direct access to your sandbox workspace. What would you like to build? (e.g. 'Build a Snake Game with score & sound', 'Create a Todo app with tags')",
      events: [],
    },
  ]);
  const [input, setInput] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [currentTimeline, setCurrentTimeline] = useState([]);
  const messagesEndRef = useRef(null);
  const abortControllerRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, currentTimeline]);

  const handleSend = async (textToSend) => {
    const text = textToSend || input;
    if (!text.trim() || isGenerating) return;

    const userMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: text,
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsGenerating(true);
    setCurrentTimeline([]);

    const assistantMsgId = (Date.now() + 1).toString();
    // Add empty placeholder assistant message
    setMessages((prev) => [
      ...prev,
      {
        id: assistantMsgId,
        role: 'assistant',
        content: '',
        events: [],
      },
    ]);

    try {
      abortControllerRef.current = new AbortController();

      const response = await fetch('/api/ai/invoke', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'text/event-stream',
        },
        body: JSON.stringify({
          sandboxId,
          stream: true,
          messages: [{ role: 'user', content: text }],
        }),
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok) {
        throw new Error(`Server returned ${response.status}: ${response.statusText}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';
      let accumulatedText = '';
      const capturedEvents = [];

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // Keep partial line in buffer

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('data:')) continue;

          try {
            const dataStr = trimmed.replace(/^data:\s*/, '');
            if (dataStr === '{}') continue;

            const payload = JSON.parse(dataStr);

            if (payload.event === 'token' && payload.text) {
              accumulatedText += payload.text;
              setMessages((prev) =>
                prev.map((msg) =>
                  msg.id === assistantMsgId ? { ...msg, content: accumulatedText } : msg
                )
              );
            } else if (payload.event) {
              capturedEvents.push(payload);
              setCurrentTimeline([...capturedEvents]);

              // If tool_end completed updateFiles, trigger preview refresh!
              if (payload.event === 'tool_end' && payload.tool === 'updateFiles') {
                onFileChange?.();
              }
            }

            if (payload.event === 'completed') {
              if (payload.response && !accumulatedText) {
                accumulatedText = payload.response;
              }
              onFileChange?.();
            }
          } catch (err) {
            // Non-JSON line or incomplete chunk
          }
        }
      }

      // Finalize assistant message with events
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === assistantMsgId
            ? { ...msg, content: accumulatedText || 'Task completed.', events: capturedEvents }
            : msg
        )
      );
    } catch (err) {
      if (err.name !== 'AbortError') {
        console.error('AI invocation error:', err);
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === assistantMsgId
              ? {
                  ...msg,
                  content: `❌ Error: ${err.message || 'Failed to generate code'}. Please try again.`,
                }
              : msg
          )
        );
      }
    } finally {
      setIsGenerating(false);
      setCurrentTimeline([]);
    }
  };

  const handleStop = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      setIsGenerating(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-900/50 border-r border-slate-800 relative">
      {/* Header */}
      <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-indigo-400" />
          <span className="text-xs font-semibold text-slate-200 uppercase tracking-wider">AI Coding Agent</span>
        </div>
        {isGenerating && (
          <div className="flex items-center gap-2 text-xs text-indigo-400 bg-indigo-500/10 px-2.5 py-1 rounded-full border border-indigo-500/20">
            <Loader2 className="w-3 h-3 animate-spin" />
            <span>Agent working...</span>
          </div>
        )}
      </div>

      {/* Message List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((msg) => (
          <div key={msg.id} className="flex flex-col gap-1.5">
            <div className="flex items-center gap-2 text-xs text-slate-400 font-medium">
              {msg.role === 'assistant' ? (
                <>
                  <div className="w-5 h-5 rounded-md bg-indigo-600/30 text-indigo-400 flex items-center justify-center">
                    <Bot className="w-3.5 h-3.5" />
                  </div>
                  <span>CloudDev AI</span>
                </>
              ) : (
                <>
                  <div className="w-5 h-5 rounded-md bg-slate-800 text-slate-300 flex items-center justify-center">
                    <User className="w-3.5 h-3.5" />
                  </div>
                  <span>You</span>
                </>
              )}
            </div>

            {/* Bubble */}
            <div
              className={`p-3.5 rounded-xl text-xs sm:text-sm leading-relaxed max-w-[95%] whitespace-pre-wrap ${
                msg.role === 'assistant'
                  ? 'bg-slate-800/80 border border-slate-700/60 text-slate-200 rounded-tl-sm'
                  : 'bg-indigo-600 text-white rounded-tr-sm ml-auto shadow-md shadow-indigo-600/20'
              }`}
            >
              {msg.content || (isGenerating && msg.id === messages[messages.length - 1]?.id ? (
                <span className="inline-flex items-center gap-1.5 text-slate-400">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" /> Generating code...
                </span>
              ) : '')}
            </div>

            {/* Milestone Events List for this message */}
            {msg.events && msg.events.length > 0 && (
              <div className="mt-1 space-y-1">
                {msg.events.map((evt, idx) => (
                  <div
                    key={idx}
                    className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-mono bg-slate-950/60 border border-slate-800/80 text-slate-400 mr-1.5"
                  >
                    {evt.event.includes('tool') ? (
                      <Wrench className="w-2.5 h-2.5 text-amber-400" />
                    ) : (
                      <CheckCircle2 className="w-2.5 h-2.5 text-emerald-400" />
                    )}
                    <span>{evt.message || `${evt.event} (${evt.tool || ''})`}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}

        {/* Live Active Timeline during streaming */}
        {isGenerating && currentTimeline.length > 0 && (
          <div className="p-2.5 rounded-lg bg-slate-950/70 border border-slate-800 text-xs space-y-1.5 animate-fadeIn">
            <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Live Agent Progress</span>
            {currentTimeline.slice(-3).map((evt, i) => (
              <div key={i} className="flex items-center gap-2 text-slate-300 text-[11px] font-mono">
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-ping" />
                <span>{evt.message || evt.event}</span>
              </div>
            ))}
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Suggested Prompts */}
      {messages.length <= 2 && !isGenerating && (
        <div className="px-4 pb-2 flex flex-wrap gap-1.5">
          {[
            '🎮 Snake Game with score & levels',
            '🧮 Modern Calculator with history',
            '⏱️ Pomodoro Timer with sound',
            '🎨 Gradient Color Palette Generator',
          ].map((prompt, i) => (
            <button
              key={i}
              onClick={() => handleSend(prompt)}
              className="text-[11px] px-2.5 py-1 rounded-full bg-slate-800/80 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-700/60 transition-colors cursor-pointer"
            >
              {prompt}
            </button>
          ))}
        </div>
      )}

      {/* Input Box */}
      <div className="p-3 border-t border-slate-800 bg-slate-950/60">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSend();
          }}
          className="relative flex items-center"
        >
          <input
            type="text"
            placeholder={isGenerating ? 'AI is writing code...' : 'Describe what to build or modify...'}
            value={input}
            disabled={isGenerating}
            onChange={(e) => setInput(e.target.value)}
            className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-3.5 pr-20 py-2.5 text-xs sm:text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all disabled:opacity-50"
          />

          <div className="absolute right-1.5 flex items-center gap-1">
            {isGenerating ? (
              <button
                type="button"
                onClick={handleStop}
                className="p-1.5 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/30 text-xs font-medium px-2.5 cursor-pointer"
              >
                Stop
              </button>
            ) : (
              <button
                type="submit"
                disabled={!input.trim()}
                className="p-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-30 disabled:hover:bg-indigo-600 text-white transition-colors cursor-pointer"
              >
                <Send className="w-4 h-4" />
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
