'use client';

import Link from 'next/link';
import { useTranslations, useLocale } from 'next-intl';
import { Github, Heart } from 'lucide-react';
import Image from 'next/image';

export function Footer() {
  const t = useTranslations('footer');
  const locale = useLocale();
  const currentYear = new Date().getFullYear();

  const footerLinks = {
    product: [
      { name: t('links.browseSkills'), href: `/${locale}/browse` },
      { name: t('links.categories'), href: `/${locale}/categories` },
      { name: t('links.featured'), href: `/${locale}/featured` },
      { name: t('links.newSkills'), href: `/${locale}/new` },
    ],
    resources: [
      { name: t('links.documentation'), href: `/${locale}/docs` },
      { name: t('links.gettingStarted'), href: `/${locale}/docs/getting-started` },
      { name: t('links.apiReference'), href: `/${locale}/docs/api` },
      { name: t('links.cliTool'), href: `/${locale}/docs/cli` },
    ],
    company: [
      { name: t('links.about'), href: `/${locale}/about`, external: false },
      { name: t('links.airano'), href: 'https://airano.ir', external: true },
      { name: t('links.paleBlueDot'), href: 'https://palebluedot.live', external: true },
      { name: t('links.support'), href: `/${locale}/support`, external: false, isSupport: true },
    ],
    legal: [
      { name: t('links.privacyPolicy'), href: `/${locale}/privacy` },
      { name: t('links.termsOfService'), href: `/${locale}/terms` },
      { name: t('links.attribution'), href: `/${locale}/attribution` },
      { name: t('links.manageSkills'), href: `/${locale}/claim` },
    ],
  };

  return (
    <footer className="bg-surface-muted border-t border-border">
      <div className="container-main py-12 lg:py-16">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-8 lg:gap-12">
          {/* Brand */}
          <div className="col-span-2 md:col-span-1">
            <Link href={`/${locale}`} className="flex items-center gap-2 mb-4">
              <Image src="/logo.svg" alt="SkillHub" width={36} height={36} className="rounded-xl" />
              <span className="text-xl font-bold text-text-primary">
                Skill<span className="text-primary-500">Hub</span>
              </span>
            </Link>
            <p className="text-text-secondary text-sm mb-4">
              {t('description')}
            </p>
            <div className="flex gap-3">
              <a
                href="https://github.com/airano-ir/skillhub"
                target="_blank"
                rel="noopener noreferrer"
                className="p-2 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-subtle transition-colors"
                title={t('sourceCode')}
              >
                <Github className="w-5 h-5" />
              </a>
            </div>
          </div>

          {/* Product */}
          <div>
            <h3 className="font-semibold text-text-primary mb-4">
              {t('links.product')}
            </h3>
            <ul className="space-y-3">
              {footerLinks.product.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-text-secondary hover:text-primary-600 transition-colors text-sm"
                  >
                    {link.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Resources */}
          <div>
            <h3 className="font-semibold text-text-primary mb-4">
              {t('links.resources')}
            </h3>
            <ul className="space-y-3">
              {footerLinks.resources.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-text-secondary hover:text-primary-600 transition-colors text-sm"
                  >
                    {link.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Company */}
          <div>
            <h3 className="font-semibold text-text-primary mb-4">
              {t('links.company')}
            </h3>
            <ul className="space-y-3">
              {footerLinks.company.map((link) => (
                <li key={link.href}>
                  {link.external ? (
                    <a
                      href={link.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-text-secondary hover:text-primary-600 transition-colors text-sm"
                    >
                      {link.name}
                    </a>
                  ) : (
                    <Link
                      href={link.href}
                      className="text-text-secondary hover:text-primary-600 transition-colors text-sm"
                    >
                      {link.isSupport ? (
                        <span className="inline-flex items-center gap-1">
                          {link.name}
                          <Heart className="w-3 h-3 text-error fill-current" />
                        </span>
                      ) : (
                        link.name
                      )}
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </div>

          {/* Legal */}
          <div>
            <h3 className="font-semibold text-text-primary mb-4">
              {t('links.legal')}
            </h3>
            <ul className="space-y-3">
              {footerLinks.legal.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-text-secondary hover:text-primary-600 transition-colors text-sm"
                  >
                    {link.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Bottom */}
        <div className="mt-12 pt-8 border-t border-border">
          <p className="text-text-muted text-sm text-center">
            {t('copyright', { year: currentYear })}
          </p>
        </div>
      </div>
    </footer>
  );
}
