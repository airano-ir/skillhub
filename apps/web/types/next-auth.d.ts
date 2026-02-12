import 'next-auth';
import { DefaultSession } from 'next-auth';

declare module 'next-auth' {
  interface Session {
    user: {
      githubId?: string;
      username?: string;
      avatarUrl?: string;
    } & DefaultSession['user'];
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    githubId?: string;
    username?: string;
    avatarUrl?: string;
  }
}
