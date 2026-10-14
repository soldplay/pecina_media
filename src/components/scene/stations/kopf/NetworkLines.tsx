'use client';

/**
 * Station IV: Netz (DESIGN_SPEC §3.3.4) — „Ein Absender. Viele Kanaele.“
 *
 * Fix-Runde 3: Vorher dutzende gerade Segmente von zufaelligen Bueste-Punkten zu
 * 6 Knoten, gestrichelt und laufend — der Faecher las sich als Stachel und
 * verdeckte den Kopf. Jetzt 6 saubere Boegen von EINEM Ursprung am Kopf (oberer
 * Hinterkopf/Schlaefe, aus der Punktprobe) zu 6 Knoten auf einer 6°-Linie
 * rechts oberhalb von Bueste und Zwilling. Durchgehende Linie gleicher Staerke
 * (uDash 0), die Boegen zeichnen sich nacheinander auf (aT = (k + t) / 6,
 * uGrow), Knoten als kleine 6°-Pillen. Erscheint bei 07 (cut1 0,55 → 0,8),
 * zieht sich bei 08 in die Knoten zurueck. Reduced: statisch, Alpha 0,3.
 * config.bustLines (120 / 60 / 40) bestimmt nur die Feinheit der Boegen.
 */

import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { COLORS, CUT_RAD, CUT_TAN } from '@/lib/brand';
import type { StationId } from '@/lib/scene/ids';
import { smoothstep } from '@/lib/scene/math';
import { stationPhases } from '@/lib/scene/stations';
import { frame } from '@/lib/scene/store';
import type { BustSample } from './BustPoints';
import { createLinesMaterial } from './point-shaders';

interface NetworkLinesProps {
  id: StationId;
  reduced: boolean;
  sample: BustSample;
  /** Tier `bustLines` (120 / 60 / 40): Segmente insgesamt */
  count: number;
}

const NODE_COUNT = 6;
/** Knoten auf einer 6°-Linie (Station-lokal): x von … bis, y am linken Ende, z */
const NODE_LINE = Object.freeze({ x0: 0.15, x1: 0.9, y0: 1.98, z: 0.1 });
/** Pille: Radius und Laenge (Achse entlang 6°) */
const NODE_PILL = Object.freeze({ radius: 0.009, length: 0.03 });
/** Ursprung: Mittel der obersten Punkte (Kopf), etwas unter dem Scheitel und nach vorn */
const ORIGIN = Object.freeze({ topBand: 0.2, below: 0.12, forward: 0.06 });
/** Bogen-Kontrollpunkt relativ zur Sehnenmitte (nach oben und zur Kamera) */
const ARC_BULGE = Object.freeze([-0.04, 0.2, 0.1] as const);
const SEGMENTS = Object.freeze({ min: 6, max: 24 });
/** Reduced: Linien statisch mit Alpha 0,3 (Shader multipliziert mit 0,8). */
const REDUCED_LINES = 0.3 / 0.8;

interface Network {
  readonly geometry: THREE.BufferGeometry;
  readonly nodes: readonly THREE.Vector3[];
}

function nodePositions(): THREE.Vector3[] {
  const { x0, x1, y0, z } = NODE_LINE;
  return Array.from({ length: NODE_COUNT }, (_, k) => {
    const x = x0 + ((x1 - x0) * k) / (NODE_COUNT - 1);
    return new THREE.Vector3(x, y0 + CUT_TAN * (x - x0), z);
  });
}

/** Ursprung am Kopf: Mittel der Punkte im obersten Band, darunter und davor versetzt. */
function originOf(sample: BustSample): THREE.Vector3 {
  let maxY = -Infinity;
  for (let i = 0; i < sample.count; i += 1) maxY = Math.max(maxY, sample.positions[i * 3 + 1]);
  const sum = new THREE.Vector3();
  let n = 0;
  for (let i = 0; i < sample.count; i += 1) {
    if (sample.positions[i * 3 + 1] < maxY - ORIGIN.topBand) continue;
    sum.x += sample.positions[i * 3];
    sum.y += sample.positions[i * 3 + 1];
    sum.z += sample.positions[i * 3 + 2];
    n += 1;
  }
  if (n === 0) return new THREE.Vector3().copy(sample.center);
  sum.divideScalar(n);
  return new THREE.Vector3(sum.x, maxY - ORIGIN.below, sum.z + ORIGIN.forward);
}

function buildNetwork(sample: BustSample, count: number): Network {
  const nodes = nodePositions();
  const origin = originOf(sample);
  const segments = Math.min(SEGMENTS.max, Math.max(SEGMENTS.min, Math.round(count / NODE_COUNT)));
  const total = NODE_COUNT * segments;
  const positions = new Float32Array(total * 6);
  const dist = new Float32Array(total * 2);
  const t = new Float32Array(total * 2);
  const curve = new THREE.QuadraticBezierCurve3();
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  nodes.forEach((node, k) => {
    const control = origin.clone().add(node).multiplyScalar(0.5).add(new THREE.Vector3(...ARC_BULGE));
    curve.v0.copy(origin);
    curve.v1.copy(control);
    curve.v2.copy(node);
    let travelled = 0;
    for (let s = 0; s < segments; s += 1) {
      curve.getPoint(s / segments, a);
      curve.getPoint((s + 1) / segments, b);
      const i = k * segments + s;
      const length = a.distanceTo(b);
      positions.set([a.x, a.y, a.z, b.x, b.y, b.z], i * 6);
      dist.set([travelled, travelled + length], i * 2);
      // Nacheinander: Bogen k waechst im k-ten Sechstel von uGrow.
      t.set([(k + s / segments) / NODE_COUNT, (k + (s + 1) / segments) / NODE_COUNT], i * 2);
      travelled += length;
    }
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('aDist', new THREE.BufferAttribute(dist, 1));
  geometry.setAttribute('aT', new THREE.BufferAttribute(t, 1));
  return { geometry, nodes };
}

function createNodes(nodes: readonly THREE.Vector3[]): THREE.InstancedMesh {
  const geometry = new THREE.CapsuleGeometry(NODE_PILL.radius, NODE_PILL.length, 3, 8);
  // Achse (y) auf die 6°-Richtung drehen: Pillen liegen auf der Linie.
  geometry.rotateZ(-(Math.PI / 2 - CUT_RAD));
  const material = new THREE.MeshBasicMaterial({
    color: COLORS.glow,
    toneMapped: false,
    transparent: true,
    opacity: 0,
    depthWrite: false,
  });
  const mesh = new THREE.InstancedMesh(geometry, material, nodes.length);
  const m = new THREE.Matrix4();
  nodes.forEach((n, i) => mesh.setMatrixAt(i, m.makeTranslation(n.x, n.y, n.z)));
  mesh.instanceMatrix.needsUpdate = true;
  mesh.frustumCulled = false;
  return mesh;
}

function disposeNodes(mesh: THREE.InstancedMesh): void {
  mesh.geometry.dispose();
  const material = mesh.material;
  if (Array.isArray(material)) material.forEach((m) => m.dispose());
  else material.dispose();
  mesh.dispose();
}

/** Linien-Uniforms und Knoten-Deckkraft (three-Objekte, Hot Path). */
function applyNetwork(lines: THREE.ShaderMaterial, nodes: THREE.InstancedMesh, cut1: number, cut2: number, reduced: boolean): void {
  const u = lines.uniforms;
  const material = nodes.material;
  const nodeMaterial = Array.isArray(material) ? material[0] : material;
  if (reduced) {
    lines.visible = true;
    u.uLines.value = REDUCED_LINES;
    u.uGrow.value = 1;
    u.uRetract.value = 0;
    if (nodeMaterial) {
      nodeMaterial.opacity = 1;
      nodeMaterial.visible = true;
    }
    return;
  }
  u.uLines.value = smoothstep(0.55, 0.9, cut1) * (1 - smoothstep(0.1, 0.4, cut2));
  // unsichtbar → kein Draw Call
  lines.visible = u.uLines.value > 0.001;
  u.uGrow.value = smoothstep(0.55, 0.8, cut1);
  u.uRetract.value = smoothstep(0.1, 0.4, cut2);
  if (!nodeMaterial) return;
  nodeMaterial.opacity = smoothstep(0.55, 0.75, cut1) * (1 - smoothstep(0.25, 0.45, cut2));
  // unsichtbar → kein Draw Call
  nodeMaterial.visible = nodeMaterial.opacity > 0.001;
}

export default function NetworkLines({ id, reduced, sample, count }: NetworkLinesProps) {
  const network = useMemo(() => buildNetwork(sample, count), [sample, count]);
  const material = useMemo(() => {
    const m = createLinesMaterial();
    // Durchgehende Linie statt laufender Striche (ruhiger, Fix-Runde 3).
    m.uniforms.uDash.value = 0;
    return m;
  }, []);
  const nodes = useMemo(() => createNodes(network.nodes), [network]);

  useEffect(() => () => network.geometry.dispose(), [network]);
  useEffect(() => () => material.dispose(), [material]);
  useEffect(() => () => disposeNodes(nodes), [nodes]);

  useFrame(() => {
    if (!frame.stationVisible[id]) return;
    const { cut1, cut2 } = stationPhases(frame.beats[`${id}:a`], frame.beats[`${id}:b`], reduced);
    applyNetwork(material, nodes, cut1, cut2, reduced);
  });

  return (
    <>
      <lineSegments geometry={network.geometry} material={material} frustumCulled={false} />
      <primitive object={nodes} />
    </>
  );
}
