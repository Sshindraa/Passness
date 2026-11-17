import { NextResponse, type NextRequest } from 'next/server';
import { getSessionIdentity } from '@/lib/auth-session';

const PUBLIC_ROUTES = [
  '/',
  '/fr/search(.*)',
  '/en/search(.*)',
  '/fr/offers(.*)',
  '/en/offers(.*)',
  '/fr/terms(.*)',
  '/en/terms(.*)',
  '/fr/rental-terms(.*)',
  '/en/rental-terms(.*)',
  '/fr/privacy(.*)',
  '/en/privacy(.*)',
  '/fr/legal(.*)',
  '/en/legal(.*)',
  '/fr/pro-terms(.*)',
  '/en/pro-terms(.*)',
  '/cgu(.*)',
  '/cgv(.*)',
  '/politique-de-confidentialite(.*)',
  '/mentions-legales(.*)',
  '/conditions-pro(.*)',
  '/pro-terms(.*)',
  '/terms(.*)',
  '/privacy(.*)',
  '/legal(.*)',
  '/api/public/search(.*)',
  '/api/public/product-photos(.*)',
  // Les webhooks sont authentifiés par la signature Stripe dans leur route.
  // Ils doivent rester accessibles sans session Passness pour que Stripe puisse
  // les livrer à l'application.
  '/api/webhooks/stripe(.*)',
  '/sign-in(.*)',
  '/sign-up(.*)',
  '/forgot-password(.*)',
  '/reset-password(.*)',
  '/two-factor(.*)',
  '/api/auth(.*)',
  '/photo-coach-demo(.*)',
].map((pattern) => new RegExp(`^${pattern}$`));

function isPublicRoute(req: NextRequest): boolean {
  const { pathname } = req.nextUrl;
  return PUBLIC_ROUTES.some((re) => re.test(pathname));
}

export async function proxy(req: NextRequest): Promise<NextResponse> {
  if (!isPublicRoute(req)) {
    // Validation complète de la session (base de données) : fail-closed.
    const identity = await getSessionIdentity().catch(() => null);
    if (!identity) {
      if (req.nextUrl.pathname.startsWith('/api/')) {
        return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });
      }
      const url = req.nextUrl.clone();
      url.pathname = '/sign-in';
      url.search = `?redirect_url=${encodeURIComponent(req.nextUrl.pathname + req.nextUrl.search)}`;
      return NextResponse.redirect(url);
    }
  }

  const pathname = req.nextUrl.pathname;
  if (pathname === '/cgu' || pathname === '/terms') {
    const url = req.nextUrl.clone();
    url.pathname = '/fr/terms';
    return NextResponse.redirect(url, 308);
  }
  if (pathname === '/cgv' || pathname === '/rental-terms') {
    const url = req.nextUrl.clone();
    url.pathname = '/fr/rental-terms';
    return NextResponse.redirect(url, 308);
  }
  if (pathname === '/conditions-pro' || pathname === '/pro-terms') {
    const url = req.nextUrl.clone();
    url.pathname = '/fr/pro-terms';
    return NextResponse.redirect(url, 308);
  }
  if (pathname === '/politique-de-confidentialite' || pathname === '/privacy') {
    const url = req.nextUrl.clone();
    url.pathname = '/fr/privacy';
    return NextResponse.redirect(url, 308);
  }
  if (pathname === '/mentions-legales' || pathname === '/legal') {
    const url = req.nextUrl.clone();
    url.pathname = '/fr/legal';
    return NextResponse.redirect(url, 308);
  }

  if (/^\/dashboard\/[^/]+\/operations$/.test(pathname)) {
    const url = req.nextUrl.clone();
    url.pathname = url.pathname.replace(/\/operations$/, '/bookings');
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!.*\\..*|_next).*)', '/', '/(api|trpc)(.*)'],
};
