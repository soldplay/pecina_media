'use client';

/**
 * Logo-Plakette im Header (P7, DESIGN_SPEC §4.2).
 *
 * - Original pm_logo.png (580 × 213) per next/image, unveraendert ausgeliefert
 *   (`unoptimized`: kein Neu-Encodieren, das PNG bleibt Zeichen fuer Zeichen das Original).
 *   Anzeige 112 × 41, mobil 96 × 35; `preload` ersetzt das in Next 16 veraltete `priority`.
 * - Paper-Flaeche, Padding 6/8 px, Radius 6 px, 1 px Rahmen --color-line-light,
 *   untere rechte Ecke per clip-path im 6°-Winkel abgeschnitten („Etikett“).
 *   Der Schnitt liegt auf der inneren Plakette, damit der Fokusring am Link sichtbar bleibt.
 * - Link auf /; auf der Startseite scrollToTarget('start'), sonst Seitenwechsel per TransitionLink.
 */

import Image from 'next/image';
import type { MouseEvent } from 'react';
import { COPY } from '@/content/site';
import { scrollToTarget } from '@/lib/a11y/navigation';
import { isOnHome, isPlainLeftClick } from './transition-bus';
import { TransitionLink } from './TransitionLink';

const LOGO_SRC = '/brand/pm_logo.png';
const LOGO_WIDTH = 112;
const LOGO_HEIGHT = 41;

const LOGO_CSS = `
.pm-logo { display: inline-flex; flex: none; border-radius: var(--radius-plate); }
.pm-logo__plate {
  /* Laenge des Schnitts entlang der Unterkante; Anstieg = tan 6° · Laenge */
  --pm-logo-run: 56px;
  display: block; padding: 6px 8px;
  background: var(--color-paper);
  border: 1px solid var(--color-line-light);
  border-radius: var(--radius-plate);
  clip-path: polygon(
    0 0, 100% 0,
    100% calc(100% - var(--pm-logo-run) * 0.1051),
    calc(100% - var(--pm-logo-run)) 100%,
    0 100%
  );
}
.pm-logo__img { display: block; width: ${LOGO_WIDTH}px; height: ${LOGO_HEIGHT}px; }
@media (max-width: 1023.98px) {
  .pm-logo__plate { --pm-logo-run: 48px; }
  .pm-logo__img { width: 96px; height: 35px; }
}
@media (forced-colors: active) {
  .pm-logo__plate { forced-color-adjust: none; background: #f4f1ea; }
}
`;

export function LogoPlate() {
  const handleClick = (event: MouseEvent<HTMLAnchorElement>): void => {
    if (!isPlainLeftClick(event) || !isOnHome()) return;
    event.preventDefault();
    if (!scrollToTarget('start')) window.scrollTo({ top: 0 });
  };

  return (
    <>
      <style href="pm-p7-logo" precedence="pm-p7">
        {LOGO_CSS}
      </style>
      <TransitionLink
        href="/"
        aria-label={COPY.ui.logoLabel}
        className="pm-logo"
        onClick={handleClick}
      >
        <span className="pm-logo__plate">
          <Image
            src={LOGO_SRC}
            alt=""
            width={LOGO_WIDTH}
            height={LOGO_HEIGHT}
            unoptimized
            preload
            className="pm-logo__img"
          />
        </span>
      </TransitionLink>
    </>
  );
}
