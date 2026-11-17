import type { Metadata } from 'next';
import '@passness/ui/tokens.css';
import { SpeedInsights } from '@vercel/speed-insights/next';
import { SmoothScroll } from '@/components/smooth-scroll';

export const metadata: Metadata = {
  title: 'Passness',
  description: 'Plateforme B2B2C de location d\u2019équipements.',
};

// Rendu dynamique : l'application lit la session à chaque requête.
export const dynamic = 'force-dynamic';

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <html lang="fr">
      <head>
        <link
          rel="preload"
          href="/fonts/chillax/chillax-variable.woff2"
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
      </head>
      <body>
        <SmoothScroll>{children}</SmoothScroll>
        <SpeedInsights />
      </body>
    </html>
  );
}
