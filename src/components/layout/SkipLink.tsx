/**
 * Skip-Link (P7, DESIGN_SPEC §4.8). Server Component, funktioniert ohne JS.
 *
 * Erstes fokussierbares Element im <body>, Ziel #main (tabindex -1 im Root-Layout).
 * Wrapper mit id SKIP_LINK_WRAPPER_ID: wird bei offenem Menue inert (Header, INERT_IDS).
 * Unsichtbar ausserhalb des Viewports, bei Fokus oben links sichtbar: Paper-Text auf Ink, z 80.
 */

import { COPY } from '@/content/site';

/** Id des Wrappers; Header setzt ihn bei offenem Menue inert (wie main, Header, Footer). */
export const SKIP_LINK_WRAPPER_ID = 'site-skip';

const SKIP_CSS = `
.pm-skip {
  position: fixed; top: 8px; left: 8px; z-index: 80;
  display: inline-flex; align-items: center; min-height: 44px; padding: 10px 16px;
  background: var(--color-ink); color: var(--color-paper);
  border: 1px solid var(--color-line-dark);
  font-family: var(--font-sans); font-weight: 600; font-size: 1rem; line-height: 1.2;
  text-decoration: underline; text-decoration-thickness: 1px; text-underline-offset: 0.25em;
  transform: translateY(calc(-100% - 24px));
}
.pm-skip:focus, .pm-skip:focus-visible { transform: none; }
`;

export default function SkipLink() {
  return (
    <>
      <style href="pm-p7-skip" precedence="pm-p7">
        {SKIP_CSS}
      </style>
      <div id={SKIP_LINK_WRAPPER_ID}>
        <a href="#main" className="pm-skip" data-copy-status={COPY.ui.meta.status}>
          {COPY.ui.skip}
        </a>
      </div>
    </>
  );
}
