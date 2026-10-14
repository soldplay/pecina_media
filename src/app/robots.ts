/**
 * robots.txt (P9). Alles erlaubt; /datenschutz traegt selbst noindex und darf dafuer
 * nicht gesperrt werden (sonst sieht der Crawler das noindex nicht).
 */

import type { MetadataRoute } from 'next';
import { SITE } from '@/content/site';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: '*', allow: '/' },
    sitemap: `${SITE.url.text}/sitemap.xml`,
  };
}
