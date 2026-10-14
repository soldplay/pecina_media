import SceneLoader from '@/components/perf/SceneLoader';
import SceneScrollChannel from '@/components/scene-channel/SceneScrollChannel';
import Preloader from '@/components/scene-dom/Preloader';
import ArbeitenSection from '@/components/sections/ArbeitenSection';
import HaltungSection from '@/components/sections/HaltungSection';
import KlartextSection from '@/components/sections/KlartextSection';
import KontaktSection from '@/components/sections/KontaktSection';
import LeistungenSection from '@/components/sections/LeistungenSection';
import ProzessSection from '@/components/sections/ProzessSection';
import StartSection from '@/components/sections/StartSection';
import JsonLd from '@/components/seo/JsonLd';

/**
 * Startseite (One-Pager). Server Component mit dem gesamten SEO-Text; das 3D
 * laedt SceneLoader clientseitig. Reihenfolge laut F_foundation / DESIGN_SPEC §3.0.
 */
export default function Home() {
  return (
    <>
      <SceneLoader />
      <Preloader />
      <StartSection />
      <HaltungSection />
      <LeistungenSection />
      {/* paper-wall--dark-end: KLARTEXT! ist das letzte Kind und laeuft bis an die Unterkante der Wand. */}
      <div data-scene-anchor="cover" data-covers-canvas="" className="paper-wall paper-wall--dark-end">
        <ArbeitenSection />
        <ProzessSection />
        <KlartextSection />
      </div>
      <KontaktSection />
      <SceneScrollChannel />
      <JsonLd />
    </>
  );
}
