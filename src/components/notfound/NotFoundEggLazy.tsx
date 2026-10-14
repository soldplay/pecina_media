'use client';

/**
 * Lazy-Einstieg fuer das 404-Easter-Egg (JS-Budget, DESIGN_SPEC §6.1).
 *
 * Das Root-not-found steht im RSC-Payload jeder Seite (Next rendert es als Fallback der
 * Layout-Grenze). Ein direkter Import von NotFoundEgg zog dessen Chunk (inkl. einer
 * zweiten Kopie von Button) deshalb auch auf `/` ins Initial-JS. Hinter next/dynamic
 * laedt er nur, wenn die 404 tatsaechlich gerendert wird. SSR bleibt an: Auf der 404
 * steht das Egg im HTML und Next legt einen Preload fuer den Chunk an.
 */

import dynamic from 'next/dynamic';

const NotFoundEgg = dynamic(() => import('./NotFoundEgg'));

export default function NotFoundEggLazy() {
  return <NotFoundEgg />;
}
