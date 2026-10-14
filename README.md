# Pecina Media – Website

3D-Website der Kreativagentur Pecina Media KG (Wien). Next.js 16, React 19,
React Three Fiber, GSAP, Lenis, Tailwind 4.

## Starten

```bash
npm ci
npm run dev
```

Produktion: `npm run build` und danach `npm run start`. Vor jedem Build prüft
`scripts/check-asset-budget.mjs` die 3D-Assets (Groesse, Dateinamen).

Node 20.9 oder neuer. Die Versionen in `package.json` sind bewusst exakt
festgelegt (three < 0.187, React < 19.4), bitte nicht einzeln anheben.

## Inhalte

Alle Texte stehen in `src/content/site.ts`. Mit `?entwurf=1` werden Entwürfe,
Beispiele und offene Punkte auf der Seite markiert. Die Cases unter „Arbeiten“
sind Beispiele, bis echte Projekte freigegeben sind.

## Lizenzen

3D-Modelle und HDRI: Poly Haven, CC0 (siehe `CREDITS.md`).
Schriften: Archivo und Comfortaa, SIL Open Font License.
