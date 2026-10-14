/**
 * Feature-Paket fuer <LazyMotion> (MotionPrefProvider), asynchron nachgeladen.
 *
 * domAnimation = Animationen, Variants, Exit (AnimatePresence) und Gesten
 * (Hover, Tap, Fokus). Kein layout/drag (domMax) — wird nirgends genutzt.
 * Bis das Paket geladen ist, rendern `m.*`-Komponenten ihren Startzustand
 * (identisch zum Server-HTML); beim Laden der Seite animiert nichts, was
 * davon abhaengt (Menue, Cursor, Poster-Vorschau, Button-Hover, Akkordeon).
 */

import { domAnimation } from 'motion/react';

export default domAnimation;
