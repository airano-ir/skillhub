'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useTranslations, useLocale } from 'next-intl';
import { useRouter, usePathname } from '@/i18n/navigation';
import { Menu, X, Globe, Github, Search } from 'lucide-react';
import Image from 'next/image';
import { clsx } from 'clsx';
import { AuthButton } from './AuthButton';
import { ThemeToggle } from './ThemeToggle';

export function Header() {
  const t = useTranslations('nav');
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navigation = [
    { name: t('home'), href: `/${locale}` },
    { name: t('browse'), href: `/${locale}/browse` },
    { name: t('categories'), href: `/${locale}/categories` },
    { name: t('docs'), href: `/${locale}/docs` },
  ];

  const otherLocale = locale === 'fa' ? 'en' : 'fa';
  const otherLocaleName = locale === 'fa' ? 'EN' : 'فا';

  const switchLanguage = () => {
    router.replace(pathname, { locale: otherLocale });
  };

  return (
    <header className="sticky top-0 z-50 bg-surface/80 backdrop-blur-lg border-b border-border">
      <nav className="container-main">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link href={`/${locale}`} className="flex items-center gap-2">
            <Image src="/logo.svg" alt="SkillHub" width={36} height={36} className="rounded-xl" />
            <span className="text-xl font-bold text-text-primary">
              Skill<span className="text-primary-500">Hub</span>
            </span>
          </Link>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center gap-1">
            {navigation.map((item) => (
              <Link
                key={item.name}
                href={item.href}
                className="px-4 py-2 rounded-lg text-text-secondary hover:text-text-primary hover:bg-surface-subtle transition-colors"
              >
                {item.name}
              </Link>
            ))}
          </div>

          {/* Right side */}
          <div className="flex items-center gap-2">
            {/* Search button - navigates to browse page (hidden on mobile) */}
            <Link
              href={`/${locale}/browse`}
              className="hidden sm:flex p-2 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-subtle transition-colors"
              title={t('browse')}
            >
              <Search className="w-5 h-5" />
            </Link>

            {/* Language switcher */}
            <button
              onClick={switchLanguage}
              data-testid="lang-switch"
              aria-label={t('switchLanguage')}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-text-secondary hover:text-text-primary hover:bg-surface-subtle transition-colors"
            >
              <Globe className="w-4 h-4" />
              <span className="text-sm font-medium">{otherLocaleName}</span>
            </button>

            {/* Theme toggle */}
            <ThemeToggle />

            {/* Auth button */}
            <AuthButton />

            {/* GitHub repo link - hidden on mobile, visible on desktop */}
            <a
              href="https://github.com/airano-ir/skillhub"
              target="_blank"
              rel="noopener noreferrer"
              className="hidden sm:flex p-2 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-subtle transition-colors"
              title={t('sourceCode')}
            >
              <Github className="w-5 h-5" />
            </a>

            {/* Mobile menu button */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden p-2 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-subtle"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Mobile Navigation */}
        <div
          className={clsx(
            'md:hidden overflow-hidden transition-all duration-300',
            mobileMenuOpen ? 'max-h-80 pb-4' : 'max-h-0'
          )}
        >
          <div className="flex flex-col gap-1 pt-2">
            {navigation.map((item) => (
              <Link
                key={item.name}
                href={item.href}
                onClick={() => setMobileMenuOpen(false)}
                className="px-4 py-3 rounded-lg text-text-secondary hover:text-text-primary hover:bg-surface-subtle transition-colors"
              >
                {item.name}
              </Link>
            ))}
            {/* GitHub repo link in mobile menu */}
            <a
              href="https://github.com/airano-ir/skillhub"
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setMobileMenuOpen(false)}
              className="flex items-center gap-2 px-4 py-3 rounded-lg text-text-secondary hover:text-text-primary hover:bg-surface-subtle transition-colors sm:hidden"
            >
              <Github className="w-5 h-5" />
              {t('sourceCodeShort')}
            </a>
          </div>
        </div>
      </nav>
    </header>
  );
}
