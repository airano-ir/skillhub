type Locale = 'en' | 'fa';

const SITE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://skills.palebluedot.live';

const COLORS = {
  primary: '#0284c7',
  primaryDark: '#0369a1',
  background: '#f8fafc',
  surface: '#ffffff',
  border: '#e2e8f0',
  text: '#1e293b',
  textSecondary: '#64748b',
  textMuted: '#94a3b8',
};

function getDir(locale: Locale): 'rtl' | 'ltr' {
  return locale === 'fa' ? 'rtl' : 'ltr';
}

function getAlign(locale: Locale): 'right' | 'left' {
  return locale === 'fa' ? 'right' : 'left';
}

function getFontFamily(locale: Locale): string {
  return locale === 'fa'
    ? 'Tahoma, Arial, sans-serif'
    : 'Arial, Helvetica, sans-serif';
}

/**
 * Shared base layout wrapper for all email templates
 */
function baseLayout(locale: Locale, bodyContent: string, footerContent: string): string {
  const dir = getDir(locale);
  const align = getAlign(locale);
  const font = getFontFamily(locale);

  return `<!DOCTYPE html>
<html lang="${locale}" dir="${dir}">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>SkillHub</title>
</head>
<body style="margin: 0; padding: 0; background-color: ${COLORS.background}; font-family: ${font}; direction: ${dir};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: ${COLORS.background};">
    <tr>
      <td align="center" style="padding: 32px 16px;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width: 600px; width: 100%;">
          <!-- Header -->
          <tr>
            <td style="background-color: ${COLORS.primary}; padding: 24px 32px; border-radius: 12px 12px 0 0;">
              <a href="${SITE_URL}" style="color: #ffffff; text-decoration: none; font-size: 24px; font-weight: bold; font-family: ${font};">
                SkillHub
              </a>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="background-color: ${COLORS.surface}; padding: 32px; text-align: ${align}; font-family: ${font};">
              ${bodyContent}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background-color: ${COLORS.background}; padding: 24px 32px; border-top: 1px solid ${COLORS.border}; border-radius: 0 0 12px 12px; text-align: center;">
              ${footerContent}
              <p style="margin: 12px 0 0 0; color: ${COLORS.textMuted}; font-size: 12px; font-family: ${font};">
                &copy; ${new Date().getFullYear()} SkillHub &mdash;
                <a href="${SITE_URL}" style="color: ${COLORS.textMuted}; text-decoration: underline;">${new URL(SITE_URL).hostname}</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function ctaButton(locale: Locale, text: string, href: string): string {
  const font = getFontFamily(locale);
  return `<a href="${href}" style="display: inline-block; background-color: ${COLORS.primary}; color: #ffffff; padding: 12px 28px; border-radius: 8px; text-decoration: none; font-weight: bold; font-size: 14px; font-family: ${font}; margin: 4px;">${text}</a>`;
}

// ============================================================================
// Translation strings
// ============================================================================

const translations = {
  en: {
    welcome: {
      subject: 'Welcome to SkillHub!',
      greeting: (username: string) => `Hi ${username},`,
      intro: 'Welcome to SkillHub — the open-source marketplace where AI agents find the expertise they need.',
      whatIs: (count: string) => `Browse ${count}+ skills that work with Claude Code, GitHub Copilot, OpenAI Codex, Cursor, and Windsurf.`,
      getStarted: 'Get started:',
      browseSkills: 'Browse Skills',
      installCli: 'Install CLI',
      docs: 'Documentation',
      newsletterCta: 'Want to stay updated? Subscribe to our newsletter for new skills, features, and tips.',
      subscribeLink: 'Subscribe to Newsletter',
      footer: 'You received this because you signed up on SkillHub with GitHub.',
    },
    newsletter: {
      subject: 'You\'re in — welcome to SkillHub Newsletter',
      greeting: 'Thanks for subscribing!',
      intro: 'You\'ll get concise updates on what matters:',
      item1: 'New and trending skills in the marketplace',
      item2: 'Feature releases and platform improvements',
      item3: 'Practical tips for AI-powered development',
      visitUs: 'Visit SkillHub',
      footer: 'You received this because you subscribed to the SkillHub newsletter.',
      unsubscribe: 'Unsubscribe',
    },
    claimSubmitted: {
      addSubject: 'Your skill request has been submitted',
      removeSubject: 'Your removal request has been processed',
      addGreeting: 'Your request has been submitted!',
      removeGreeting: 'Your removal request has been processed!',
      addIntro: (repoUrl: string, count: number) =>
        `We received your request to add <strong>${repoUrl}</strong>${count > 0 ? ` (${count} skill${count > 1 ? 's' : ''} found)` : ''}.`,
      removeIntro: (skillId: string) =>
        `Your request to remove <strong>${skillId}</strong> has been verified and processed.`,
      addPending: 'Your request is now pending review. We\'ll notify you when it\'s been processed.',
      removeApproved: 'The skill has been blocked from indexing and will no longer appear on SkillHub.',
      viewRequests: 'View My Requests',
      footer: 'You received this because you submitted a request on SkillHub.',
    },
    claimStatus: {
      approvedSubject: 'Your request has been approved',
      rejectedSubject: 'Update on your request',
      approvedGreeting: 'Good news!',
      rejectedGreeting: 'Update on your request',
      addApproved: (repoUrl: string) =>
        `Your request to add <strong>${repoUrl}</strong> has been approved and will be indexed soon.`,
      addRejected: (repoUrl: string) =>
        `After review, your request to add <strong>${repoUrl}</strong> could not be approved at this time.`,
      removeApproved: (skillId: string) =>
        `Your request to remove <strong>${skillId}</strong> has been approved. The skill has been blocked from indexing.`,
      removeRejected: (skillId: string) =>
        `After review, your request to remove <strong>${skillId}</strong> could not be approved at this time.`,
      viewRequests: 'View My Requests',
      footer: 'You received this because you submitted a request on SkillHub.',
    },
  },
  fa: {
    welcome: {
      subject: 'به SkillHub خوش آمدید!',
      greeting: (username: string) => `سلام ${username}،`,
      intro: 'به SkillHub خوش آمدید — بازار متن‌باز مهارت‌هایی که عامل‌های هوش مصنوعی به آن نیاز دارند.',
      whatIs: (count: string) => `بیش از ${count} مهارت را مرور کنید که با Claude Code، GitHub Copilot، OpenAI Codex، Cursor و Windsurf کار می‌کنند.`,
      getStarted: 'شروع کنید:',
      browseSkills: 'مرور مهارت‌ها',
      installCli: 'نصب CLI',
      docs: 'مستندات',
      newsletterCta: 'می‌خواهید به‌روز بمانید؟ در خبرنامه ما برای مهارت‌ها، ویژگی‌ها و نکات جدید عضو شوید.',
      subscribeLink: 'عضویت در خبرنامه',
      footer: 'این ایمیل به دلیل ثبت‌نام شما در SkillHub با GitHub ارسال شده است.',
    },
    newsletter: {
      subject: 'عضویت شما فعال شد — خبرنامه SkillHub',
      greeting: 'ممنون از عضویت شما!',
      intro: 'به‌روزرسانی‌های مختصر و مفید دریافت خواهید کرد:',
      item1: 'مهارت‌های جدید و پرطرفدار در بازار',
      item2: 'ویژگی‌های جدید و بهبودهای پلتفرم',
      item3: 'نکات عملی برای توسعه با هوش مصنوعی',
      visitUs: 'مشاهده SkillHub',
      footer: 'این ایمیل به دلیل عضویت شما در خبرنامه SkillHub ارسال شده است.',
      unsubscribe: 'لغو عضویت',
    },
    claimSubmitted: {
      addSubject: 'درخواست افزودن مهارت شما ثبت شد',
      removeSubject: 'درخواست حذف مهارت شما پردازش شد',
      addGreeting: 'درخواست شما ثبت شد!',
      removeGreeting: 'درخواست حذف شما پردازش شد!',
      addIntro: (repoUrl: string, count: number) =>
        `درخواست افزودن <strong>${repoUrl}</strong>${count > 0 ? ` (${count} مهارت یافت شد)` : ''} دریافت شد.`,
      removeIntro: (skillId: string) =>
        `درخواست حذف <strong>${skillId}</strong> تایید و پردازش شد.`,
      addPending: 'درخواست شما در انتظار بررسی است. پس از پردازش به شما اطلاع خواهیم داد.',
      removeApproved: 'مهارت از ایندکس شدن مسدود شد و دیگر در SkillHub نمایش داده نخواهد شد.',
      viewRequests: 'مشاهده درخواست‌ها',
      footer: 'این ایمیل به دلیل ثبت درخواست شما در SkillHub ارسال شده است.',
    },
    claimStatus: {
      approvedSubject: 'درخواست شما تایید شد',
      rejectedSubject: 'به‌روزرسانی درخواست شما',
      approvedGreeting: 'خبر خوب!',
      rejectedGreeting: 'به‌روزرسانی درخواست شما',
      addApproved: (repoUrl: string) =>
        `درخواست افزودن <strong>${repoUrl}</strong> تایید شد و به زودی ایندکس خواهد شد.`,
      addRejected: (repoUrl: string) =>
        `پس از بررسی، درخواست افزودن <strong>${repoUrl}</strong> در حال حاضر قابل تایید نیست.`,
      removeApproved: (skillId: string) =>
        `درخواست حذف <strong>${skillId}</strong> تایید شد. مهارت از ایندکس شدن مسدود شد.`,
      removeRejected: (skillId: string) =>
        `پس از بررسی، درخواست حذف <strong>${skillId}</strong> در حال حاضر قابل تایید نیست.`,
      viewRequests: 'مشاهده درخواست‌ها',
      footer: 'این ایمیل به دلیل ثبت درخواست شما در SkillHub ارسال شده است.',
    },
  },
} as const;

// ============================================================================
// Template Builders
// ============================================================================

export interface EmailTemplate {
  subject: string;
  html: string;
}

/**
 * Welcome email for new users (first GitHub OAuth login)
 */
export function buildWelcomeEmail(locale: Locale, username: string, email?: string, totalSkillCount?: number): EmailTemplate {
  const t = translations[locale].welcome;
  const dir = getDir(locale);
  const align = getAlign(locale);

  // Format skill count: dynamic if provided, fallback to "172,000+"
  const skillCountStr = totalSkillCount
    ? (locale === 'fa'
      ? totalSkillCount.toLocaleString('fa-IR')
      : totalSkillCount.toLocaleString('en-US'))
    : (locale === 'fa' ? '۱۷۲,۰۰۰' : '172,000');

  const body = `
    <h1 style="margin: 0 0 16px 0; color: ${COLORS.text}; font-size: 24px; text-align: ${align};">
      ${t.greeting(username)}
    </h1>
    <p style="margin: 0 0 12px 0; color: ${COLORS.text}; font-size: 15px; line-height: 1.6;">
      ${t.intro}
    </p>
    <p style="margin: 0 0 20px 0; color: ${COLORS.textSecondary}; font-size: 14px; line-height: 1.6;">
      ${t.whatIs(skillCountStr)}
    </p>
    <p style="margin: 0 0 12px 0; color: ${COLORS.text}; font-size: 15px; font-weight: bold;">
      ${t.getStarted}
    </p>
    <div style="text-align: center; margin: 20px 0;">
      ${ctaButton(locale, t.browseSkills, `${SITE_URL}/${locale}/browse`)}
      ${ctaButton(locale, t.docs, `${SITE_URL}/${locale}/docs`)}
    </div>
    <p style="margin: 0 0 4px 0; color: ${COLORS.textSecondary}; font-size: 13px;">
      ${locale === 'en' ? 'Install CLI:' : 'نصب CLI:'}
    </p>
    <div style="background-color: ${COLORS.background}; border: 1px solid ${COLORS.border}; border-radius: 6px; padding: 10px 14px; margin: 0 0 16px 0;" dir="ltr">
      <code style="font-family: 'Courier New', monospace; font-size: 13px; color: ${COLORS.text};">npm install -g skillhub</code>
    </div>
    <div style="border-left: 3px solid ${COLORS.primary}; padding: 0 0 0 14px; margin: 0 0 24px 0;">
      <p style="margin: 0 0 4px 0; color: ${COLORS.text}; font-size: 13px; font-weight: bold;">
        ${locale === 'en' ? '&#128161; Tip' : '&#128161; نکته'}
      </p>
      <p style="margin: 0 0 6px 0; color: ${COLORS.textSecondary}; font-size: 12px; line-height: 1.5;">
        ${locale === 'en'
          ? 'Skills work best when explicitly invoked. Try searching and installing on the fly:'
          : 'مهارت\u200Cها وقتی بهترین عملکرد را دارند که صریحاً فراخوانی شوند. جستجو و نصب لحظه\u200Cای را امتحان کنید:'}
      </p>
      <div style="background-color: #1e293b; border-radius: 4px; padding: 8px 12px; margin: 0;" dir="ltr">
        <code style="font-family: 'Courier New', monospace; font-size: 11px; color: #e2e8f0; line-height: 1.7;">
          npx skillhub search "react testing" --sort stars<br/>
          npx skillhub install &lt;skill-id&gt; --project
        </code>
      </div>
    </div>
    <div style="border-top: 1px solid ${COLORS.border}; padding-top: 20px; margin-top: 8px;">
      <p style="margin: 0 0 12px 0; color: ${COLORS.textSecondary}; font-size: 14px; line-height: 1.6;">
        ${t.newsletterCta}
      </p>
      <div style="text-align: ${dir === 'rtl' ? 'right' : 'left'};">
        <a href="${SITE_URL}/api/newsletter/subscribe?email=${email ? encodeURIComponent(email) : ''}&locale=${locale}" style="color: ${COLORS.primary}; text-decoration: underline; font-size: 14px;">
          ${t.subscribeLink} &rarr;
        </a>
      </div>
    </div>`;

  const footer = `
    <p style="margin: 0; color: ${COLORS.textMuted}; font-size: 12px;">
      ${t.footer}
    </p>`;

  return {
    subject: t.subject,
    html: baseLayout(locale, body, footer),
  };
}

/**
 * Newsletter welcome email for actual newsletter subscribers
 */
export function buildNewsletterWelcomeEmail(locale: Locale, email: string): EmailTemplate {
  const t = translations[locale].newsletter;
  const align = getAlign(locale);

  const body = `
    <h1 style="margin: 0 0 16px 0; color: ${COLORS.text}; font-size: 24px; text-align: ${align};">
      ${t.greeting}
    </h1>
    <p style="margin: 0 0 16px 0; color: ${COLORS.text}; font-size: 15px; line-height: 1.6;">
      ${t.intro}
    </p>
    <ul style="margin: 0 0 24px 0; padding: 0 0 0 ${locale === 'fa' ? '0' : '20px'}; ${locale === 'fa' ? 'padding-right: 20px; list-style-position: inside;' : ''} color: ${COLORS.textSecondary}; font-size: 14px; line-height: 2;">
      <li>${t.item1}</li>
      <li>${t.item2}</li>
      <li>${t.item3}</li>
    </ul>
    <div style="background-color: ${COLORS.background}; border-radius: 6px; padding: 12px 16px; margin: 0 0 20px 0;">
      <p style="margin: 0; color: ${COLORS.textSecondary}; font-size: 13px; line-height: 1.6;">
        &#128161; ${locale === 'en'
          ? `<strong>Tip:</strong> Skills work best when explicitly invoked. Try searching and installing on the fly: <code style="background: ${COLORS.surface}; padding: 1px 4px; border-radius: 3px; font-size: 12px;">npx skillhub search &quot;your topic&quot;</code>. After installing, read the SKILL.md and follow its instructions. <a href="${SITE_URL}/${locale}/docs/cli" style="color: ${COLORS.primary}; text-decoration: none;">See CLI docs &rarr;</a>`
          : `<strong>نکته:</strong> مهارت\u200Cها وقتی بهترین عملکرد را دارند که صریحاً فراخوانی شوند. جستجو و نصب لحظه\u200Cای را امتحان کنید: <code style="background: ${COLORS.surface}; padding: 1px 4px; border-radius: 3px; font-size: 12px;" dir="ltr">npx skillhub search &quot;your topic&quot;</code>. پس از نصب، فایل SKILL.md را بخوانید و دستورالعمل\u200Cها را دنبال کنید. <a href="${SITE_URL}/${locale}/docs/cli" style="color: ${COLORS.primary}; text-decoration: none;">مستندات CLI &rarr;</a>`}
      </p>
    </div>
    <div style="text-align: center; margin: 24px 0;">
      ${ctaButton(locale, t.visitUs, `${SITE_URL}/${locale}`)}
    </div>`;

  const unsubscribeUrl = `${SITE_URL}/api/newsletter/unsubscribe?email=${encodeURIComponent(email)}`;
  const footer = `
    <p style="margin: 0; color: ${COLORS.textMuted}; font-size: 12px;">
      ${t.footer}
      <br />
      <a href="${unsubscribeUrl}" style="color: ${COLORS.textMuted}; text-decoration: underline;">${t.unsubscribe}</a>
    </p>`;

  return {
    subject: t.subject,
    html: baseLayout(locale, body, footer),
  };
}

/**
 * Claim submission confirmation email
 */
export function buildClaimSubmittedEmail(
  locale: Locale,
  type: 'add' | 'remove',
  details: { skillId?: string; repositoryUrl?: string; skillCount?: number }
): EmailTemplate {
  const t = translations[locale].claimSubmitted;
  const align = getAlign(locale);

  const subject = type === 'add' ? t.addSubject : t.removeSubject;
  const greeting = type === 'add' ? t.addGreeting : t.removeGreeting;

  let introText: string;
  let statusText: string;

  if (type === 'add') {
    introText = t.addIntro(details.repositoryUrl || '', details.skillCount || 0);
    statusText = t.addPending;
  } else {
    introText = t.removeIntro(details.skillId || '');
    statusText = t.removeApproved;
  }

  const body = `
    <h1 style="margin: 0 0 16px 0; color: ${COLORS.text}; font-size: 24px; text-align: ${align};">
      ${greeting}
    </h1>
    <p style="margin: 0 0 12px 0; color: ${COLORS.text}; font-size: 15px; line-height: 1.6;">
      ${introText}
    </p>
    <p style="margin: 0 0 24px 0; color: ${COLORS.textSecondary}; font-size: 14px; line-height: 1.6;">
      ${statusText}
    </p>
    <div style="text-align: center; margin: 24px 0;">
      ${ctaButton(locale, t.viewRequests, `${SITE_URL}/${locale}/claim`)}
    </div>`;

  const footer = `
    <p style="margin: 0; color: ${COLORS.textMuted}; font-size: 12px;">
      ${t.footer}
    </p>`;

  return {
    subject,
    html: baseLayout(locale, body, footer),
  };
}

/**
 * Claim status change notification email
 */
export function buildClaimStatusEmail(
  locale: Locale,
  type: 'add' | 'remove',
  status: 'approved' | 'rejected',
  details: { skillId?: string; repositoryUrl?: string }
): EmailTemplate {
  const t = translations[locale].claimStatus;
  const align = getAlign(locale);

  const subject = status === 'approved' ? t.approvedSubject : t.rejectedSubject;
  const greeting = status === 'approved' ? t.approvedGreeting : t.rejectedGreeting;

  let messageText: string;
  if (type === 'add' && status === 'approved') {
    messageText = t.addApproved(details.repositoryUrl || '');
  } else if (type === 'add' && status === 'rejected') {
    messageText = t.addRejected(details.repositoryUrl || '');
  } else if (type === 'remove' && status === 'approved') {
    messageText = t.removeApproved(details.skillId || '');
  } else {
    messageText = t.removeRejected(details.skillId || '');
  }

  const body = `
    <h1 style="margin: 0 0 16px 0; color: ${COLORS.text}; font-size: 24px; text-align: ${align};">
      ${greeting}
    </h1>
    <p style="margin: 0 0 24px 0; color: ${COLORS.text}; font-size: 15px; line-height: 1.6;">
      ${messageText}
    </p>
    <div style="text-align: center; margin: 24px 0;">
      ${ctaButton(locale, t.viewRequests, `${SITE_URL}/${locale}/claim`)}
    </div>`;

  const footer = `
    <p style="margin: 0; color: ${COLORS.textMuted}; font-size: 12px;">
      ${t.footer}
    </p>`;

  return {
    subject,
    html: baseLayout(locale, body, footer),
  };
}

// ============================================================================
// Outreach Email Template (English only — for GitHub repo owners)
// ============================================================================



