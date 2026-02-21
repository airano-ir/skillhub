import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { DiscoveryModes } from '@/components/DiscoveryModes';
import Link from 'next/link';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { createDb, skills, sql } from '@skillhub/db';
import { formatPromptSkillCount } from '@/lib/format-number';
import { getPageAlternates } from '@/lib/seo';


export const dynamic = 'force-dynamic';

async function getSkillCount(): Promise<string> {
  try {
    const db = createDb();
    const result = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(skills)
      .where(sql`${skills.isDuplicate} = false`);
    return formatPromptSkillCount(result[0]?.count ?? 16000);
  } catch {
    return '16,000+';
  }
}

function getDiscoveryPrompts(count: string) {
  const siteUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://skills.palebluedot.live';
  return {
    standard: `## SkillHub - AI Agent Skills

${count} skills available at ${siteUrl}

Search when working with unfamiliar tech, complex workflows, or after a failed attempt:

\`\`\`bash
npx skillhub search "<query>" --limit 5
npx skillhub install <skill-id> --project
npx skillhub uninstall <skill-name>  # when done
\`\`\`

Rules:
- Only install skills with security status "Pass"
- After installing, read the SKILL.md and follow its instructions
- Search during planning phase for best results`,

    compact: `## SkillHub (${count} skills) -- ${siteUrl}

\`\`\`bash
npx skillhub search "<query>" --limit 5
npx skillhub install <skill-id> --project
npx skillhub uninstall <skill-name>
\`\`\`

Search for unfamiliar tech or complex tasks. Only install "Pass" security status. Read SKILL.md after install.`,

    oneshot: `You have access to SkillHub (${count} AI agent skills, ${siteUrl}). For unfamiliar or complex tasks: \`npx skillhub search "<query>" --limit 5\` then \`npx skillhub install <id> --project\`. Only "Pass" security. Read SKILL.md after install. Uninstall when done.`,
  };
}


export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  return {
    alternates: getPageAlternates(locale, '/docs/getting-started'),
  };
}

export default async function GettingStartedPage({
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

  const skillCount = await getSkillCount();
  const prompts = getDiscoveryPrompts(skillCount);

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

              <h1 className="text-4xl font-bold mb-6">{t('gettingStarted.title')}</h1>
              <p className="text-lg text-text-secondary mb-8">{t('gettingStarted.description')}</p>

              <div className="prose prose-lg max-w-none">
                <h2>{tContent('installation')}</h2>
                <p>{tContent('installCli')}</p>
                <div className="glass-card p-4 my-4" dir="ltr">
                  <code className="text-sm font-mono text-left block">npm install -g skillhub</code>
                </div>

                <h2>{tContent('usage')}</h2>

                <h3>{tContent('searchSkills')}</h3>
                <div className="glass-card p-4 my-4" dir="ltr">
                  <code className="text-sm font-mono text-left block">skillhub search code-review</code>
                </div>

                <h3>{tContent('installSkill')}</h3>
                <div className="glass-card p-4 my-4" dir="ltr">
                  <code className="text-sm font-mono text-left block">skillhub install anthropic/skills/code-review</code>
                </div>

                <h3>{tContent('listInstalled')}</h3>
                <div className="glass-card p-4 my-4" dir="ltr">
                  <code className="text-sm font-mono text-left block">skillhub list</code>
                </div>

                {/* Web-based Installation */}
                <hr className="my-8 border-border" />
                <h2>{tContent('webInstallTitle')}</h2>
                <p>{tContent('webInstallDesc')}</p>
                <div className="not-prose my-4 space-y-3">
                  <p className="text-text-primary">{tContent('webInstallStep1')}</p>
                  <p className="text-text-primary">{tContent('webInstallStep2')}</p>
                  <p className="text-text-primary">{tContent('webInstallStep3')}</p>
                  <ul className="list-disc list-inside space-y-2 ms-4">
                    <li className="text-text-secondary">{tContent('webInstallMethodFolder')}</li>
                    <li className="text-text-secondary">{tContent('webInstallMethodZip')}</li>
                  </ul>
                </div>

                {/* Dynamic Skill Discovery */}
                <hr className="my-8 border-border" />
                <h2>{tContent('discoveryTitle')}</h2>
                <p>{tContent('discoveryIntro')}</p>

                <h3>{tContent('discoveryModesTitle')}</h3>
                <p className="text-text-secondary">{tContent('selectMode')}</p>
                <DiscoveryModes
                  modes={[
                    {
                      key: 'standard',
                      letter: 'A',
                      title: tContent('modeStandard'),
                      description: tContent('modeStandardDesc'),
                      latency: tContent('modeStandardLatency'),
                      quality: tContent('modeStandardQuality'),
                      bestFor: tContent('modeStandardBestFor'),
                      recommended: true,
                      prompt: prompts.standard,
                    },
                    {
                      key: 'compact',
                      letter: 'B',
                      title: tContent('modeCompact'),
                      description: tContent('modeCompactDesc'),
                      latency: tContent('modeCompactLatency'),
                      quality: tContent('modeCompactQuality'),
                      bestFor: tContent('modeCompactBestFor'),
                      prompt: prompts.compact,
                    },
                    {
                      key: 'oneshot',
                      letter: 'C',
                      title: tContent('modeOneShot'),
                      description: tContent('modeOneShotDesc'),
                      latency: tContent('modeOneShotLatency'),
                      quality: tContent('modeOneShotQuality'),
                      bestFor: tContent('modeOneShotBestFor'),
                      prompt: prompts.oneshot,
                    },
                  ]}
                  labels={{
                    latency: tContent('latency'),
                    quality: tContent('qualityBoost'),
                    bestFor: tContent('bestFor'),
                    recommended: tContent('recommended'),
                    copyPrompt: tContent('copyPrompt'),
                    copied: tContent('copied'),
                    selectMode: tContent('selectMode'),
                    addToFile: tContent('addToFile'),
                  }}
                />

                <h3>{tContent('crossPlatformTitle')}</h3>
                <p>{tContent('crossPlatformDesc')}</p>
                <div className="not-prose my-4 space-y-2" dir="ltr">
                  <div className="glass-card p-3 text-sm font-mono">{tContent('platformClaude')}</div>
                  <div className="glass-card p-3 text-sm font-mono">{tContent('platformCodex')}</div>
                  <div className="glass-card p-3 text-sm font-mono">{tContent('platformCopilot')}</div>
                  <div className="glass-card p-3 text-sm font-mono">{tContent('platformCursor')}</div>
                  <div className="glass-card p-3 text-sm font-mono">{tContent('platformWindsurf')}</div>
                </div>

                <p>
                  {tContent('fullDocsLink')}{' '}
                  <Link href={`/${locale}/docs/cli`} className="text-primary-600 hover:text-primary-700 no-underline">
                    CLI Reference <ArrowIcon className="inline w-4 h-4" />
                  </Link>
                </p>
              </div>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
