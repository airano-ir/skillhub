'use client';

import { Share2, Check } from 'lucide-react';
import { useState, useCallback, useMemo } from 'react';

interface ShareButtonProps {
  title: string;
  path: string; // Relative path like /en/skill/anthropic/skills/pdf
  translations: {
    share: string;
    copied: string;
    copyLink: string;
  };
}

export function ShareButton({ title, path, translations }: ShareButtonProps) {
  const [copied, setCopied] = useState(false);

  // Construct full URL on client side
  const fullUrl = useMemo(() => {
    if (typeof window === 'undefined') return path;
    return `${window.location.origin}${path}`;
  }, [path]);

  const handleShare = useCallback(async () => {
    // Try native share API first (mobile + some desktop browsers)
    if (navigator.share) {
      try {
        await navigator.share({
          title,
          url: fullUrl,
        });
        return;
      } catch (err) {
        // User cancelled or share failed - fall back to clipboard
        if (err instanceof Error && err.name === 'AbortError') {
          return; // User cancelled, don't fall back
        }
      }
    }

    // Fall back to clipboard
    try {
      await navigator.clipboard.writeText(fullUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  }, [title, fullUrl]);

  return (
    <button
      onClick={handleShare}
      className="flex items-center gap-2 px-4 py-2 text-sm border border-border rounded-lg hover:bg-surface-subtle transition-colors"
      title={copied ? translations.copied : translations.share}
    >
      {copied ? (
        <>
          <Check className="w-4 h-4 text-success" />
          <span className="text-success">{translations.copied}</span>
        </>
      ) : (
        <>
          <Share2 className="w-4 h-4" />
          <span>{translations.share}</span>
        </>
      )}
    </button>
  );
}
