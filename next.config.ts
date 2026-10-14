import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    // JS-Budget (DESIGN_SPEC §6.1): `motion/react` (motion 14.2.0) ist nur eine Huelle um
    // framer-motion 14.2.0 (exakt gepinnte Abhaengigkeit von motion) und re-exportiert per
    // `import * as fm` + `const motion = fm.motion`. Dieser Namespace-Zugriff haelt das ganze
    // Paket (inkl. drag/layout) im Bundle, LazyMotion + `m` sparen dann nichts. Der Alias
    // loest dieselben Exporte direkt aus framer-motion auf (benannte Re-Exporte, tree-shakebar).
    // Im Code bleibt der Import `motion/react` (check:rules verbietet framer-motion-Importe).
    resolveAlias: {
      "motion/react": "framer-motion",
    },
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
