'use client';

import { useState, useCallback } from 'react';
import { Copy, Check } from 'lucide-react';

interface DiscoveryMode {
  key: string;
  letter: string;
  title: string;
  description: string;
  latency: string;
  quality: string;
  bestFor: string;
  recommended?: boolean;
  prompt: string;
}

interface DiscoveryModesProps {
  modes: DiscoveryMode[];
  labels: {
    latency: string;
    quality: string;
    bestFor: string;
    recommended: string;
    copyPrompt: string;
    copied: string;
    selectMode: string;
    addToFile: string;
  };
}

export function DiscoveryModes({ modes, labels }: DiscoveryModesProps) {
  const [selectedMode, setSelectedMode] = useState<string>('standard');
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for older browsers
      const textarea = document.createElement('textarea');
      textarea.value = text;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, []);

  const selected = modes.find((m) => m.key === selectedMode) || modes[0];

  return (
    <div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 my-6 not-prose">
        {modes.map((mode) => (
          <button
            key={mode.key}
            onClick={() => setSelectedMode(mode.key)}
            className={`glass-card p-4 text-start transition-all cursor-pointer ${
              selectedMode === mode.key
                ? 'ring-2 ring-primary-500 shadow-lg'
                : 'hover:ring-1 hover:ring-primary-300 opacity-70 hover:opacity-100'
            }`}
          >
            <div className="flex items-center gap-2 mb-1">
              <span className="font-semibold text-text-primary">
                {mode.letter}. {mode.title}
              </span>
              {mode.recommended && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300 font-medium">
                  {labels.recommended}
                </span>
              )}
            </div>
            <p className="text-sm text-text-secondary mb-3">{mode.description}</p>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-text-tertiary">
              <span>
                <span className="font-medium">{labels.latency}:</span> {mode.latency}
              </span>
              <span>
                <span className="font-medium">{labels.quality}:</span> {mode.quality}
              </span>
            </div>
          </button>
        ))}
      </div>

      {/* Selected mode details */}
      <div className="glass-card p-5 my-6 not-prose">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h4 className="font-semibold text-text-primary text-lg">
              {selected.letter}. {selected.title}
            </h4>
            <p className="text-sm text-text-secondary">
              {labels.bestFor}: {selected.bestFor}
            </p>
          </div>
          <button
            onClick={() => handleCopy(selected.prompt)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors bg-primary-100 text-primary-700 hover:bg-primary-200 dark:bg-primary-900/30 dark:text-primary-300 dark:hover:bg-primary-900/50"
          >
            {copied ? (
              <>
                <Check className="w-4 h-4" />
                {labels.copied}
              </>
            ) : (
              <>
                <Copy className="w-4 h-4" />
                {labels.copyPrompt}
              </>
            )}
          </button>
        </div>
        <p className="text-sm text-text-secondary mb-3">{labels.addToFile}</p>
        <div className="bg-surface-secondary rounded-lg p-4 overflow-x-auto" dir="ltr">
          <pre className="text-sm font-mono text-left whitespace-pre-wrap">{selected.prompt}</pre>
        </div>
      </div>
    </div>
  );
}
