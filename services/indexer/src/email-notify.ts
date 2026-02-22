/**
 * Email notification for skill indexing completion
 * Sends notification to users who submitted add-requests
 */

import { Resend } from 'resend';

const SITE_URL =
  process.env.NEXT_PUBLIC_APP_URL || 'https://skills.palebluedot.live';
const FROM_EMAIL =
  process.env.RESEND_FROM_EMAIL || 'SkillHub <onboarding@resend.dev>';

// Lazy-init Resend client (returns null if API key not configured)
let resendClient: Resend | null = null;

function getResend(): Resend | null {
  if (resendClient) return resendClient;
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return null;
  resendClient = new Resend(apiKey);
  return resendClient;
}

interface SkillIndexedDetails {
  skillId: string;
  skillName: string;
  repositoryUrl: string;
}

const translations = {
  en: {
    subject: 'Your skill has been indexed on SkillHub!',
    greeting: 'Good news!',
    intro: (name: string, repo: string) =>
      `Your skill <strong>${name}</strong> from <strong>${repo}</strong> has been successfully indexed on SkillHub.`,
    status:
      'Your skill is now searchable and installable by developers.',
    cta: 'View Skill',
    footer:
      'You received this because you submitted an add request on SkillHub.',
  },
  fa: {
    subject: 'مهارت شما در SkillHub ایندکس شد!',
    greeting: 'خبر خوب!',
    intro: (name: string, repo: string) =>
      `مهارت <strong>${name}</strong> از مخزن <strong>${repo}</strong> با موفقیت در SkillHub ایندکس شد.`,
    status:
      'مهارت شما اکنون قابل جستجو و نصب توسط توسعه‌دهندگان است.',
    cta: 'مشاهده مهارت',
    footer:
      'این ایمیل به دلیل ثبت درخواست افزودن مهارت شما در SkillHub ارسال شده است.',
  },
} as const;

function buildHtml(
  locale: 'en' | 'fa',
  details: SkillIndexedDetails
): string {
  const t = translations[locale];
  const isRtl = locale === 'fa';
  const dir = isRtl ? 'rtl' : 'ltr';
  const fontFamily = isRtl ? 'Tahoma, Arial, sans-serif' : 'Arial, sans-serif';
  const encodedId = details.skillId
    .split('/')
    .map(encodeURIComponent)
    .join('/');
  const skillUrl = `${SITE_URL}/${locale}/skill/${encodedId}`;

  return `<!DOCTYPE html>
<html lang="${locale}" dir="${dir}">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
</head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:${fontFamily};">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;padding:32px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
          <!-- Header -->
          <tr>
            <td style="background-color:#0284c7;padding:24px 32px;border-radius:8px 8px 0 0;">
              <h1 style="margin:0;color:#ffffff;font-size:22px;font-family:${fontFamily};">SkillHub</h1>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="background-color:#ffffff;padding:32px;border-radius:0 0 8px 8px;">
              <h2 style="margin:0 0 16px;color:#18181b;font-size:20px;font-family:${fontFamily};">
                ${t.greeting}
              </h2>
              <p style="margin:0 0 16px;color:#3f3f46;font-size:16px;line-height:1.6;font-family:${fontFamily};">
                ${t.intro(details.skillName, details.repositoryUrl)}
              </p>
              <p style="margin:0 0 24px;color:#3f3f46;font-size:16px;line-height:1.6;font-family:${fontFamily};">
                ${t.status}
              </p>
              <!-- CTA Button -->
              <table cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
                <tr>
                  <td style="background-color:#0284c7;border-radius:6px;padding:12px 24px;">
                    <a href="${skillUrl}" style="color:#ffffff;text-decoration:none;font-size:16px;font-weight:bold;font-family:${fontFamily};">
                      ${t.cta}
                    </a>
                  </td>
                </tr>
              </table>
              <!-- Footer -->
              <p style="margin:0;color:#a1a1aa;font-size:13px;line-height:1.5;font-family:${fontFamily};">
                ${t.footer}
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

/**
 * Send email notification when a skill has been indexed
 */
export async function sendSkillIndexedEmail(
  to: string,
  locale: 'en' | 'fa',
  details: SkillIndexedDetails
): Promise<boolean> {
  const resend = getResend();
  if (!resend) return false;

  try {
    const t = translations[locale];
    const html = buildHtml(locale, details);

    const result = await resend.emails.send({
      from: FROM_EMAIL,
      to,
      subject: t.subject,
      html,
    });

    if (result.error) {
      console.error('[Email] Resend error (indexed):', result.error);
      return false;
    }

    console.log(
      `[Email] Sent skill-indexed notification to ${to} for ${details.skillId}`
    );
    return true;
  } catch (error) {
    console.error('[Email] Failed to send indexed email:', error);
    return false;
  }
}
