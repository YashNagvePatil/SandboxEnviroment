import React, { useState, useEffect } from 'react';
import { Folder, FileCode, RefreshCw, Save, Check, FileText, ChevronRight } from 'lucide-react';

export default function FilesPanel({ sandboxId, onFileSaved }) {
  const [files, setFiles] = useState([]);
  const [selectedFile, setSelectedFile] = useState(null);
  const [fileContent, setFileContent] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const fetchFiles = async () => {
    if (!sandboxId) return;
    setIsLoading(true);
    try {
      const res = await fetch(`http://${sandboxId}.agent.localhost/list-files`);
      if (res.ok) {
        const data = await res.json();
        setFiles(data.files || []);
        if (!selectedFile && data.files?.length > 0) {
          // Select App.jsx by default if available
          const defaultFile = data.files.find((f) => f.includes('App.jsx')) || data.files[0];
          handleSelectFile(defaultFile);
        }
      }
    } catch (err) {
      console.warn('Failed to list files:', err.message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchFiles();
  }, [sandboxId]);

  const handleSelectFile = async (filePath) => {
    setSelectedFile(filePath);
    setSaveSuccess(false);
    try {
      const res = await fetch(
        `http://${sandboxId}.agent.localhost/read-files?files=${encodeURIComponent(filePath)}`
      );
      if (res.ok) {
        const data = await res.json();
        const content = data.results?.[0]?.[filePath] || '';
        setFileContent(content);
      }
    } catch (err) {
      console.warn('Failed to read file:', err.message);
    }
  };

  const handleSaveFile = async () => {
    if (!selectedFile || isSaving) return;
    setIsSaving(true);
    try {
      const res = await fetch(`http://${sandboxId}.agent.localhost/update-files`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          files: [{ file: selectedFile, content: fileContent }],
        }),
      });
      if (res.ok) {
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 2000);
        onFileSaved?.();
      }
    } catch (err) {
      console.error('Failed to save file:', err);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="flex h-full bg-slate-950 text-slate-200">
      {/* File Tree Sidebar */}
      <div className="w-56 border-r border-slate-800 bg-slate-900/60 flex flex-col">
        <div className="p-3 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-300">
            <Folder className="w-3.5 h-3.5 text-indigo-400" />
            <span>Workspace</span>
          </div>
          <button
            onClick={fetchFiles}
            title="Refresh Files"
            className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-indigo-400' : ''}`} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
          {files.map((file) => (
            <button
              key={file}
              onClick={() => handleSelectFile(file)}
              className={`w-full text-left px-2.5 py-1.5 rounded-md text-xs font-mono flex items-center gap-2 truncate transition-colors cursor-pointer ${
                selectedFile === file
                  ? 'bg-indigo-600/20 text-indigo-300 font-medium'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <FileCode className="w-3.5 h-3.5 shrink-0 text-slate-500" />
              <span className="truncate">{file}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Code Editor / Viewer */}
      <div className="flex-1 flex flex-col bg-slate-950">
        {selectedFile ? (
          <>
            {/* Editor Top Bar */}
            <div className="h-10 px-4 border-b border-slate-800 bg-slate-900/90 flex items-center justify-between">
              <span className="font-mono text-xs text-slate-300 font-medium">{selectedFile}</span>
              <button
                onClick={handleSaveFile}
                disabled={isSaving}
                className="flex items-center gap-1.5 px-3 py-1 rounded bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium transition-colors cursor-pointer disabled:opacity-50"
              >
                {saveSuccess ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-300" />
                    <span>Saved!</span>
                  </>
                ) : (
                  <>
                    <Save className="w-3.5 h-3.5" />
                    <span>Save File</span>
                  </>
                )}
              </button>
            </div>

            {/* Textarea Code Editor */}
            <div className="flex-1 p-2">
              <textarea
                value={fileContent}
                onChange={(e) => setFileContent(e.target.value)}
                className="w-full h-full bg-slate-950 text-slate-200 font-mono text-xs leading-relaxed p-4 rounded border border-slate-800 focus:outline-none focus:border-indigo-500 resize-none"
                spellCheck="false"
              />
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-slate-500 text-xs">
            Select a file from the explorer to view and edit code.
          </div>
        )}
      </div>
    </div>
  );
}
