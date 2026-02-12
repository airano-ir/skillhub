import { Resend } from 'resend';
import {
  buildWelcomeEmail,
  buildNewsletterWelcomeEmail,
  buildClaimSubmittedEmail,
  buildClaimStatusEmail,
} from './email-templates';

type Locale = 'en' | 'fa';

// Singleton Resend client
let resendClient: Resend | null = null;

function getResend(): Resend | null {
  if (resendClient) return resendClient;

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn('[Email] RESEND_API_KEY not configured');
    return null;
  }

  resendClient = new Resend(apiKey);
  return resendClient;
}

const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || 'SkillHub <onboarding@resend.dev>';

/**
 * Send a welcome/onboarding email to new users (first GitHub OAuth login)
 */
export async function sendWelcomeEmail(
  to: string,
  locale: Locale = 'en',
  username: string = ''
): Promise<boolean> {
  const resend = getResend();
  if (!resend) return false;

  try {
    const template = buildWelcomeEmail(locale, username || to.split('@')[0], to);
    const result = await resend.emails.send({
      from: FROM_EMAIL,
      to,
      subject: template.subject,
      html: template.html,
    });
    if (result.error) {
      console.error('[Email] Resend API error (welcome):', result.error);
      return false;
    }
    return true;
  } catch (error) {
    console.error('[Email] Failed to send welcome email:', error);
    return false;
  }
}

/**
 * Send a newsletter welcome email to new newsletter subscribers
 */
export async function sendNewsletterWelcomeEmail(
  to: string,
  locale: Locale = 'en'
): Promise<boolean> {
  const resend = getResend();
  if (!resend) return false;

  try {
    const template = buildNewsletterWelcomeEmail(locale, to);
    const result = await resend.emails.send({
      from: FROM_EMAIL,
      to,
      subject: template.subject,
      html: template.html,
    });
    if (result.error) {
      console.error('[Email] Resend API error (newsletter):', result.error);
      return false;
    }
    return true;
  } catch (error) {
    console.error('[Email] Failed to send newsletter welcome email:', error);
    return false;
  }
}

/**
 * Send a claim submission confirmation email
 */
export async function sendClaimSubmittedEmail(
  to: string,
  locale: Locale = 'en',
  type: 'add' | 'remove',
  details: { skillId?: string; repositoryUrl?: string; skillCount?: number }
): Promise<boolean> {
  const resend = getResend();
  if (!resend) return false;

  try {
    const template = buildClaimSubmittedEmail(locale, type, details);
    const result = await resend.emails.send({
      from: FROM_EMAIL,
      to,
      subject: template.subject,
      html: template.html,
    });
    if (result.error) {
      console.error('[Email] Resend API error (claim submitted):', result.error);
      return false;
    }
    return true;
  } catch (error) {
    console.error('[Email] Failed to send claim submitted email:', error);
    return false;
  }
}

/**
 * Send a claim status change notification email
 */
export async function sendClaimStatusEmail(
  to: string,
  locale: Locale = 'en',
  type: 'add' | 'remove',
  status: 'approved' | 'rejected',
  details: { skillId?: string; repositoryUrl?: string }
): Promise<boolean> {
  const resend = getResend();
  if (!resend) return false;

  try {
    const template = buildClaimStatusEmail(locale, type, status, details);
    const result = await resend.emails.send({
      from: FROM_EMAIL,
      to,
      subject: template.subject,
      html: template.html,
    });
    if (result.error) {
      console.error('[Email] Resend API error (claim status):', result.error);
      return false;
    }
    return true;
  } catch (error) {
    console.error('[Email] Failed to send claim status email:', error);
    return false;
  }
}


/**
 * Send a generic email via Resend
 */
export async function sendEmail(options: {
  to: string;
  subject: string;
  html: string;
}): Promise<boolean> {
  const resend = getResend();
  if (!resend) return false;

  try {
    const result = await resend.emails.send({
      from: FROM_EMAIL,
      to: options.to,
      subject: options.subject,
      html: options.html,
    });
    if (result.error) {
      console.error('[Email] Resend API error:', result.error);
      return false;
    }
    return true;
  } catch (error) {
    console.error('[Email] Failed to send email:', error);
    return false;
  }
}
