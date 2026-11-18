import { headers } from 'next/headers';
import { getAuth } from './better-auth';

export interface SessionIdentity {
  subject: string;
  email: string;
  emailVerified: boolean;
  displayName: string | null;
  twoFactorEnabled: boolean;
}

/** Lit la session Better Auth courante. Point unique de contact avec le fournisseur d'identité. */
export async function getSessionIdentity(): Promise<SessionIdentity | null> {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) return null;
  return {
    subject: session.user.id,
    email: session.user.email,
    emailVerified: session.user.emailVerified,
    displayName: session.user.name || null,
    twoFactorEnabled: session.user.twoFactorEnabled === true,
  };
}
