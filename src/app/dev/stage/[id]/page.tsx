import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import DevStage from '@/components/dev/DevStage';
import { DEV_STAGE_IDS, isDevStageId } from '@/components/dev/dev-stage-types';

/**
 * Dev-Sandbox fuer die 3D-Pakete: /dev/stage/{test|hero|marke|bildschirm|papier|kopf}.
 * In Produktion immer 404.
 */

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

/**
 * Sandbox darf beim Navigieren blockieren (liest `params` ohne Suspense).
 * Schaltet die Instant-Navigation-Pruefung (cacheComponents + partialPrefetching)
 * nur fuer diese Route ab; siehe next/dist/docs/.../route-segment-config/instant.md.
 */
export const instant = false;

export function generateStaticParams(): { id: string }[] {
  return DEV_STAGE_IDS.map((id) => ({ id }));
}

export default async function DevStagePage({ params }: { params: Promise<{ id: string }> }) {
  if (process.env.NODE_ENV === 'production') notFound();
  const { id } = await params;
  if (!isDevStageId(id)) notFound();
  return <DevStage id={id} />;
}
