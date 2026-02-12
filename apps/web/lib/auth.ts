import NextAuth from 'next-auth';
import GitHub from 'next-auth/providers/github';
import { createDb, userQueries } from '@skillhub/db';
import { sendWelcomeEmail } from './email';

// Determine secure cookie prefix based on AUTH_URL protocol
const useSecureCookies = process.env.AUTH_URL?.startsWith('https://') ?? process.env.NODE_ENV === 'production';
const cookiePrefix = useSecureCookies ? '__Secure-' : '';

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    GitHub({
      clientId: process.env.GITHUB_CLIENT_ID!,
      clientSecret: process.env.GITHUB_CLIENT_SECRET!,
      // Custom profile to prevent "Cannot read properties of undefined (reading 'toString')"
      // when GitHub API returns unexpected data (e.g. after a failed token exchange)
      profile(profile) {
        return {
          id: String(profile.id ?? ''),
          name: (profile.name ?? profile.login) as string,
          email: profile.email as string | null,
          image: profile.avatar_url as string | null,
        };
      },
    }),
  ],
  trustHost: true, // Trust Host header from reverse proxy (Coolify, Nginx, etc.)
  session: { strategy: 'jwt' },
  // Explicit cookie config to ensure PKCE works behind reverse proxies
  cookies: {
    pkceCodeVerifier: {
      name: `${cookiePrefix}authjs.pkce.code_verifier`,
      options: {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: useSecureCookies,
        maxAge: 900, // 15 minutes
      },
    },
  },
  callbacks: {
    async signIn({ profile }) {
      if (!profile?.id) return false;

      // On mirror servers the database is a read-only replica,
      // so skip the upsert. The user session still works via JWT.
      const isPrimary = process.env.IS_PRIMARY_SERVER !== 'false';
      if (isPrimary) {
        try {
          const db = createDb();

          // Check if user already exists (to detect first login)
          const existingUser = await userQueries.getByGithubId(db, String(profile.id));

          // Check if user is in the admin list
          const adminUsers = (process.env.ADMIN_GITHUB_USERS || '')
            .split(',')
            .map((u) => u.trim().toLowerCase())
            .filter(Boolean);
          const isAdmin = adminUsers.includes((profile.login as string).toLowerCase());

          await userQueries.upsertFromGithub(db, {
            githubId: String(profile.id),
            username: profile.login as string,
            displayName: profile.name as string | undefined,
            email: profile.email as string | undefined,
            avatarUrl: profile.avatar_url as string | undefined,
            isAdmin,
          });

          // For new users with an email, send welcome/onboarding email
          // (no auto-subscribe to newsletter — user can opt-in via link in the email)
          if (!existingUser && profile.email) {
            const email = (profile.email as string).toLowerCase().trim();
            sendWelcomeEmail(email, 'en', profile.login as string).catch((err) => {
              console.error('[Auth] Failed to send welcome email:', err);
            });
          }
        } catch (err) {
          console.error('[Auth] Database error during sign-in (allowing login anyway):', err);
        }
      }

      return true;
    },
    async jwt({ token, profile }) {
      if (profile) {
        token.githubId = String(profile.id);
        token.username = profile.login;
        token.avatarUrl = profile.avatar_url;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.githubId = token.githubId as string;
        session.user.username = token.username as string;
        session.user.avatarUrl = token.avatarUrl as string;
      }
      return session;
    },
  },
  // Use default NextAuth pages - no custom pages needed
});
