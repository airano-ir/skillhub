import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import Link from 'next/link';
import { ArrowLeft, ArrowRight } from 'lucide-react';

export default async function CliDocsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('docs');
  const tContent = await getTranslations('docs.content');
  const isRTL = locale === 'fa';
  const ArrowIcon = isRTL ? ArrowLeft : ArrowRight;

  const commands = [
    { name: 'install <skill-id>', desc: tContent('cmdInstallDesc') },
    { name: 'search <query>', desc: tContent('cmdSearchDesc') },
    { name: 'list', desc: tContent('cmdListDesc') },
    { name: 'update [skill-name]', desc: tContent('cmdUpdateDesc') },
    { name: 'uninstall <skill-name>', desc: tContent('cmdUninstallDesc') },
    { name: 'config', desc: tContent('cmdConfigDesc') },
  ];

  const platforms = [
    { name: 'Claude', path: tContent('platformClaudePath') },
    { name: 'Codex', path: tContent('platformCodexPath') },
    { name: 'Copilot', path: tContent('platformCopilotPath') },
    { name: 'Cursor', path: tContent('platformCursorPath') },
    { name: 'Windsurf', path: tContent('platformWindsurfPath') },
  ];

  const configKeys = [
    { key: 'defaultPlatform', desc: tContent('configDefaultPlatform') },
    { key: 'apiUrl', desc: tContent('configApiUrl') },
    { key: 'githubToken', desc: tContent('configGithubToken') },
  ];

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1">
        <section className="section bg-surface">
          <div className="container-main">
            <div className="max-w-3xl mx-auto">
              <Link
                href={`/${locale}/docs`}
                className="inline-flex items-center gap-2 text-primary-600 hover:text-primary-700 mb-8"
              >
                <ArrowIcon className="w-4 h-4 rotate-180" />
                {t('title')}
              </Link>

              <h1 className="text-4xl font-bold mb-6">{t('cli.title')}</h1>
              <p className="text-lg text-text-secondary mb-8">{t('cli.description')}</p>

              <div className="prose prose-lg max-w-none">
                <h2>{tContent('installation')}</h2>
                <div className="glass-card p-4 my-4" dir="ltr">
                  <code className="text-sm font-mono text-left block">npm install -g skillhub</code>
                </div>

                <h2>{tContent('commands')}</h2>
                <div className="space-y-4 my-6" dir="ltr">
                  {commands.map((cmd, index) => (
                    <div key={index} className="glass-card p-4 text-left">
                      <code className="text-sm font-mono text-primary-600">skillhub {cmd.name}</code>
                      <p className="text-text-secondary mt-2">{cmd.desc}</p>
                    </div>
                  ))}
                </div>

                <h2>{tContent('examples')}</h2>
                <div className="glass-card p-4 my-4 space-y-4" dir="ltr">
                  {/* Install globally */}
                  <div>
                    <p className="text-sm text-text-muted mb-1">{tContent('exInstallGlobal')}</p>
                    <code className="block text-sm font-mono">
                      <span className="text-text-muted">$</span> npx skillhub install anthropics/skills/pdf
                    </code>
                    <code className="block text-sm font-mono text-success">
                      ✓ Skill installed to ~/.claude/skills/pdf/
                    </code>
                  </div>
                  {/* Install in project */}
                  <div>
                    <p className="text-sm text-text-muted mb-1">{tContent('exInstallProject')}</p>
                    <code className="block text-sm font-mono">
                      <span className="text-text-muted">$</span> npx skillhub install anthropics/skills/pdf --project
                    </code>
                    <code className="block text-sm font-mono text-success">
                      ✓ Skill installed to ./.claude/skills/pdf/
                    </code>
                  </div>
                  {/* Search */}
                  <div>
                    <p className="text-sm text-text-muted mb-1">{tContent('exSearch')}</p>
                    <code className="block text-sm font-mono">
                      <span className="text-text-muted">$</span> npx skillhub search pdf
                    </code>
                  </div>
                  {/* Search with sort */}
                  <div>
                    <p className="text-sm text-text-muted mb-1">{tContent('exSearchSort')}</p>
                    <code className="block text-sm font-mono">
                      <span className="text-text-muted">$</span> npx skillhub search &quot;code review&quot; --sort stars --limit 5
                    </code>
                  </div>
                  {/* Update all */}
                  <div>
                    <p className="text-sm text-text-muted mb-1">{tContent('exUpdateAll')}</p>
                    <code className="block text-sm font-mono">
                      <span className="text-text-muted">$</span> npx skillhub update --all
                    </code>
                  </div>
                </div>

                {/* Supported Platforms */}
                <h2>{tContent('platformsTitle')}</h2>
                <p>{tContent('platformsDesc')}</p>
                <div className="space-y-3 my-6" dir="ltr">
                  {platforms.map((p) => (
                    <div key={p.name} className="glass-card p-4 text-left flex items-center justify-between">
                      <span className="text-sm font-semibold text-text-primary">{p.name}</span>
                      <code className="text-sm font-mono text-text-secondary">{p.path}</code>
                    </div>
                  ))}
                </div>

                {/* Configuration */}
                <h2>{tContent('configTitle')}</h2>
                <p>{tContent('configDesc')}</p>
                <div className="space-y-3 my-6" dir="ltr">
                  {configKeys.map((c) => (
                    <div key={c.key} className="glass-card p-4 text-left">
                      <code className="text-sm font-mono text-primary-600">{c.key}</code>
                      <p className="text-text-secondary mt-1 text-sm">{c.desc}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
