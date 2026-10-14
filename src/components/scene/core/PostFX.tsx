'use client';

/**
 * Postprocessing (DESIGN_SPEC §5.2), nur bei config.composer (High, quality 1).
 *
 * Farbtreue (#D17F0C): Der EffectComposer erzwingt waehrend seiner Lebenszeit
 * gl.toneMapping = NoToneMapping (und Scene setzt es bei composer ohnehin so);
 * das einzige Tonemapping ist der ToneMapping-Effekt (NEUTRAL) am Ende der
 * Kette, die sRGB-Kodierung macht der letzte Pass. Kein Doppel-Tonemapping.
 * Faellt der Composer weg (Governor), stellt Scene NeutralToneMapping am
 * Renderer wieder her.
 */

import { Bloom, EffectComposer, ToneMapping, Vignette } from '@react-three/postprocessing';
import { ToneMappingMode } from 'postprocessing';

/**
 * Bloom (Abnahme 14.10.2026): Schwelle ueber Weiss (lineare Luminanz 1,05), damit
 * nur Emissive-Akzente bluehen (6°-Naht ~1,3, Klingenkern), nicht beleuchtetes
 * Papier, Marmor oder die orange Skulptur. Kleinerer Radius: Saum statt Schleier.
 */
export const POST_FX = Object.freeze({
  multisampling: 4,
  bloom: Object.freeze({ luminanceThreshold: 1.05, luminanceSmoothing: 0.12, intensity: 0.55, radius: 0.6, levels: 6 }),
  vignette: Object.freeze({ offset: 0.3, darkness: 0.35 }),
});

export default function PostFX() {
  const { bloom } = POST_FX;
  return (
    <EffectComposer multisampling={POST_FX.multisampling} enableNormalPass={false}>
      <Bloom
        mipmapBlur
        luminanceThreshold={bloom.luminanceThreshold}
        luminanceSmoothing={bloom.luminanceSmoothing}
        intensity={bloom.intensity}
        radius={bloom.radius}
        levels={bloom.levels}
      />
      <Vignette offset={POST_FX.vignette.offset} darkness={POST_FX.vignette.darkness} />
      <ToneMapping mode={ToneMappingMode.NEUTRAL} />
    </EffectComposer>
  );
}
