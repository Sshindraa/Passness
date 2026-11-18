'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, opts: Record<string, unknown>) => string;
      reset: (id?: string) => void;
    };
  }
}

const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

/** Anti-faux-comptes (Cloudflare Turnstile). Sans clé publique (dev), aucun widget. */
export function Turnstile({
  onToken,
}: {
  onToken: (token: string | null) => void;
}): React.ReactElement | null {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!SITE_KEY || !ref.current) return;
    const el = ref.current;
    const mount = (): void => {
      window.turnstile?.render(el, {
        sitekey: SITE_KEY,
        callback: (t: string) => onToken(t),
        'expired-callback': () => onToken(null),
        'error-callback': () => onToken(null),
      });
    };
    if (window.turnstile) return mount();
    const s = document.createElement('script');
    s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    s.async = true;
    s.onload = mount;
    document.head.appendChild(s);
  }, [onToken]);
  return SITE_KEY ? <div ref={ref} /> : null;
}

export const captchaRequired = Boolean(SITE_KEY);

export function captchaHeaders(token: string | null): Record<string, string> {
  return token ? { 'x-captcha-response': token } : {};
}

/** Jeton Turnstile à usage unique : `reset` le vide et relance le widget avant chaque envoi. */
export function useCaptcha(): {
  token: string | null;
  onToken: (t: string | null) => void;
  reset: () => void;
} {
  const [token, setToken] = useState<string | null>(null);
  const onToken = useCallback((t: string | null) => setToken(t), []);
  const reset = useCallback(() => {
    setToken(null);
    window.turnstile?.reset();
  }, []);
  return { token, onToken, reset };
}
