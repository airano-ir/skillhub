'use client';

import { useTheme } from 'next-themes';
import { Sun, Moon, Monitor } from 'lucide-react';
import { useEffect, useState } from 'react';

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  // Avoid hydration mismatch
  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <button className="p-2 rounded-lg text-text-muted" aria-label="Toggle theme">
        <Monitor className="w-5 h-5" />
      </button>
    );
  }

  const cycleTheme = () => {
    if (theme === 'light') setTheme('dark');
    else if (theme === 'dark') setTheme('system');
    else setTheme('light');
  };

  const getIcon = () => {
    switch (theme) {
      case 'dark':
        return <Moon className="w-5 h-5" />;
      case 'light':
        return <Sun className="w-5 h-5" />;
      default:
        return <Monitor className="w-5 h-5" />;
    }
  };

  const getTitle = () => {
    switch (theme) {
      case 'dark':
        return 'Dark mode';
      case 'light':
        return 'Light mode';
      default:
        return 'System theme';
    }
  };

  return (
    <button
      onClick={cycleTheme}
      className="p-2 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-subtle transition-colors"
      title={getTitle()}
      aria-label={getTitle()}
    >
      {getIcon()}
    </button>
  );
}
