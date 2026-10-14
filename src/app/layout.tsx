import type { Metadata, Viewport } from 'next';
import { Archivo, Comfortaa } from 'next/font/google';
import MotionPrefProvider from '@/components/a11y/MotionPrefProvider';
import SmoothScroll from '@/components/a11y/SmoothScroll';
import DraftMarker from '@/components/layout/DraftMarker';
import Footer from '@/components/layout/Footer';
import GrainOverlay from '@/components/layout/GrainOverlay';
import Header from '@/components/layout/Header';
import PageTransition from '@/components/layout/PageTransition';
import RouteFocus from '@/components/layout/RouteFocus';
import SkipLink from '@/components/layout/SkipLink';
import { COPY, SITE } from '@/content/site';
import { MOTION_INIT_SCRIPT } from '@/lib/a11y/motion';
import './globals.css';

// next/font laedt die Dateien beim Build und liefert sie selbst aus:
// keine Requests an Google zur Laufzeit.
const archivo = Archivo({
  subsets: ['latin', 'latin-ext'],
  axes: ['wdth'],
  display: 'swap',
  variable: '--font-archivo',
});

const comfortaa = Comfortaa({
  subsets: ['latin', 'latin-ext'],
  display: 'swap',
  variable: '--font-comfortaa',
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE.url.text),
  // Texte aus content/site.ts (COPY.meta, Status entwurf, Kundenfreigabe offen).
  title: {
    default: COPY.meta.title.text,
    template: `%s – ${SITE.legalName}`,
  },
  description: COPY.meta.description.text,
  openGraph: {
    locale: 'de_AT',
    type: 'website',
    siteName: SITE.legalName,
    title: COPY.meta.title.text,
    description: COPY.meta.description.text,
  },
  robots: { index: true },
};

export const viewport: Viewport = {
  themeColor: '#0E0E0E',
  colorScheme: 'dark',
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html
      lang="de-AT"
      className={`${archivo.variable} ${comfortaa.variable}`}
      data-motion="full"
      data-scene="pending"
      suppressHydrationWarning
    >
      <head>
        {/* Setzt html.js und data-motion vor dem ersten Paint (statischer String, keine Nutzerdaten). */}
        <script dangerouslySetInnerHTML={{ __html: MOTION_INIT_SCRIPT }} />
      </head>
      <body className="bg-ink text-paper font-sans antialiased">
        <MotionPrefProvider>
          <SmoothScroll>
            <SkipLink />
            <Header />
            <main id="main" tabIndex={-1}>
              {children}
            </main>
            <Footer />
            {/* Kein Cursor-Begleiter (layout/Cursor.tsx bleibt erhalten): Kunden-Feedback
                14.10.2026 – nichts soll dem Mauszeiger folgen. */}
            <GrainOverlay />
            <PageTransition />
            <RouteFocus />
            <DraftMarker />
          </SmoothScroll>
        </MotionPrefProvider>
      </body>
    </html>
  );
}
