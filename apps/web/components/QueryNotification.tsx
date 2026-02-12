'use client';

import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { CheckCircle } from 'lucide-react';

const NOTIFICATIONS: Record<string, { en: string; fa: string }> = {
  unsubscribed: {
    en: 'You have been unsubscribed. You will no longer receive these emails.',
    fa: '\u0627\u0634\u062a\u0631\u0627\u06a9 \u0634\u0645\u0627 \u0644\u063a\u0648 \u0634\u062f. \u062f\u06cc\u06af\u0631 \u0627\u06cc\u0646 \u0627\u06cc\u0645\u06cc\u0644\u200c\u0647\u0627 \u0631\u0627 \u062f\u0631\u06cc\u0627\u0641\u062a \u0646\u062e\u0648\u0627\u0647\u06cc\u062f \u06a9\u0631\u062f.',
  },
  subscribed: {
    en: 'You have been subscribed to the newsletter. Welcome!',
    fa: '\u0634\u0645\u0627 \u062f\u0631 \u062e\u0628\u0631\u0646\u0627\u0645\u0647 \u0639\u0636\u0648 \u0634\u062f\u06cc\u062f. \u062e\u0648\u0634 \u0622\u0645\u062f\u06cc\u062f!',
  },
};

export function QueryNotification() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [message, setMessage] = useState<string | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const locale = pathname.startsWith('/fa') ? 'fa' : 'en';

    for (const [key, texts] of Object.entries(NOTIFICATIONS)) {
      if (searchParams.get(key) === 'true') {
        setMessage(texts[locale]);
        // Trigger entrance animation after mount
        requestAnimationFrame(() => setVisible(true));

        // Clean URL without reloading
        const params = new URLSearchParams(searchParams.toString());
        params.delete(key);
        const newUrl = params.toString() ? `${pathname}?${params}` : pathname;
        router.replace(newUrl, { scroll: false });
        break;
      }
    }
  }, [searchParams, pathname, router]);

  useEffect(() => {
    if (message) {
      const timer = setTimeout(() => {
        setVisible(false);
        setTimeout(() => setMessage(null), 300);
      }, 6000);
      return () => clearTimeout(timer);
    }
  }, [message]);

  if (!message) return null;

  return (
    <div
      className="fixed top-20 left-1/2 z-[60] transition-all duration-300"
      style={{
        transform: visible ? 'translate(-50%, 0)' : 'translate(-50%, -20px)',
        opacity: visible ? 1 : 0,
      }}
    >
      <div className="flex items-center gap-3 bg-success-bg border border-success/30 rounded-lg px-5 py-3 shadow-lg backdrop-blur-sm">
        <CheckCircle className="w-5 h-5 text-success shrink-0" />
        <p className="text-sm font-medium text-text-primary">{message}</p>
        <button
          onClick={() => {
            setVisible(false);
            setTimeout(() => setMessage(null), 300);
          }}
          className="ml-2 text-text-muted hover:text-text-primary transition-colors text-lg leading-none"
          aria-label="Close"
        >
          &times;
        </button>
      </div>
    </div>
  );
}
