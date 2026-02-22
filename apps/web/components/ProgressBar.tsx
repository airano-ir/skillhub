'use client';

import { useEffect, useRef } from 'react';

export function ProgressBar() {
  const barRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isRunningRef = useRef(false);
  const currentUrlRef = useRef('');

  useEffect(() => {
    const bar = barRef.current;
    if (!bar) return;

    currentUrlRef.current = location.pathname + location.search;

    function clearTimers() {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    }

    function start() {
      clearTimers();
      isRunningRef.current = true;

      bar!.style.transition = 'none';
      bar!.style.width = '0%';
      bar!.style.opacity = '1';

      // Force reflow so browser registers 0% before animating
      void bar!.offsetWidth;

      bar!.style.transition = 'width 2s cubic-bezier(0.1, 0.5, 0.3, 1)';
      bar!.style.width = '80%';

      // Safety: auto-complete after 10s
      timerRef.current = setTimeout(done, 10000);
    }

    function done() {
      clearTimers();
      isRunningRef.current = false;

      bar!.style.transition = 'width 200ms ease-out';
      bar!.style.width = '100%';

      timerRef.current = setTimeout(() => {
        if (!barRef.current) return;
        barRef.current.style.transition = 'opacity 300ms ease-out';
        barRef.current.style.opacity = '0';
      }, 250);
    }

    // Called when URL has changed (navigation completed)
    function onUrlChange() {
      const newUrl = location.pathname + location.search;
      if (newUrl === currentUrlRef.current) return;
      currentUrlRef.current = newUrl;

      if (isRunningRef.current) {
        // Bar was started by click handler — complete it
        done();
      } else {
        // Programmatic navigation (search, filters, router.push/replace)
        // Show a quick fill animation as feedback
        start();
        requestAnimationFrame(() => requestAnimationFrame(() => done()));
      }
    }

    // 1. Intercept <a> tag clicks (for Link components)
    const handleClick = (e: MouseEvent) => {
      const anchor = (e.target as HTMLElement).closest('a');
      if (!anchor) return;

      const href = anchor.getAttribute('href');
      if (!href) return;

      if (
        href.startsWith('http') ||
        href.startsWith('#') ||
        href.startsWith('mailto:') ||
        anchor.target === '_blank' ||
        e.ctrlKey ||
        e.metaKey ||
        e.shiftKey
      ) {
        return;
      }

      if (href === currentUrlRef.current) return;
      start();
    };
    document.addEventListener('click', handleClick, true);

    // 2. Monkey-patch pushState/replaceState for programmatic navigation
    const origPushState = history.pushState;
    const origReplaceState = history.replaceState;

    history.pushState = function (
      data: unknown,
      unused: string,
      url?: string | URL | null,
    ) {
      origPushState.call(this, data, unused, url);
      onUrlChange();
    };

    history.replaceState = function (
      data: unknown,
      unused: string,
      url?: string | URL | null,
    ) {
      origReplaceState.call(this, data, unused, url);
      onUrlChange();
    };

    // 3. Back/forward navigation
    const handlePopState = () => onUrlChange();
    window.addEventListener('popstate', handlePopState);

    return () => {
      clearTimers();
      document.removeEventListener('click', handleClick, true);
      history.pushState = origPushState;
      history.replaceState = origReplaceState;
      window.removeEventListener('popstate', handlePopState);
    };
  }, []);

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 99999,
        pointerEvents: 'none',
        height: '3px',
      }}
    >
      <div
        ref={barRef}
        style={{
          height: '100%',
          background: 'linear-gradient(90deg, #0284c7, #38bdf8)',
          width: '0%',
          opacity: '0',
          boxShadow: '0 0 8px rgba(2, 132, 199, 0.4)',
        }}
      />
    </div>
  );
}
