// The Nova X-1: the original detailed neon starfighter from earlier versions
// of the game, kept as the airbase's experimental prototype. A faceted hull
// with a glowing canopy, long forked wings and twin nacelles. Point lights
// were replaced by emissive geometry so it costs little to draw.

import * as THREE from 'three';

const COL_HULL = 0x1a0f3a, COL_HULL_LIT = 0x2a1360, COL_CYAN = 0x00eaff, COL_MAGENTA = 0xff2bbf, COL_ENGINE = 0xff43c8, COL_CANOPY = 0xb84dff;

function neon(geo, color, opacity = 1) {
  const edges = new THREE.EdgesGeometry(geo, 24);
  return new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false }));
}
const hullMat = (lit) => new THREE.MeshStandardMaterial({ color: lit ? COL_HULL_LIT : COL_HULL, metalness: 0.82, roughness: 0.28, emissive: 0x140a33, emissiveIntensity: 0.55, flatShading: true });
const glow = (color, opacity) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });

// Returns { group, engines } with the nose along +Z.
export function buildNova() {
  const outer = new THREE.Group();
  const body = new THREE.Group();
  body.rotation.y = Math.PI; // original nose pointed down -Z
  outer.add(body);
  const engines = [];

  const mat = hullMat(false);
  const noseGeo = new THREE.ConeGeometry(1.55, 6.6, 8); noseGeo.rotateX(-Math.PI / 2); noseGeo.translate(0, 0, -1.7);
  body.add(new THREE.Mesh(noseGeo, mat), neon(noseGeo, COL_CYAN, 0.9));
  const midGeo = new THREE.CylinderGeometry(1.55, 1.15, 3.6, 8); midGeo.rotateX(Math.PI / 2); midGeo.rotateZ(Math.PI / 8); midGeo.translate(0, 0, 2.0);
  body.add(new THREE.Mesh(midGeo, hullMat(true)), neon(midGeo, COL_CYAN, 0.85));
  const keelGeo = new THREE.CylinderGeometry(0.0, 0.9, 5.4, 3); keelGeo.rotateX(Math.PI / 2); keelGeo.rotateZ(Math.PI); keelGeo.scale(1, 0.5, 1); keelGeo.translate(0, -1.15, 0.4);
  body.add(new THREE.Mesh(keelGeo, mat), neon(keelGeo, COL_MAGENTA, 0.5));
  for (const dir of [1, -1]) {
    const strake = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 3.6), glow(COL_CYAN, 0.85));
    strake.position.set(dir * 1.0, 0.15, 1.2); strake.rotation.y = dir * 0.13; body.add(strake);
  }

  const canopyGeo = new THREE.SphereGeometry(1.15, 12, 8); canopyGeo.scale(0.92, 0.98, 2.05); canopyGeo.translate(0, 0.5, -0.7);
  const canopyMat = new THREE.MeshStandardMaterial({ color: 0x230d44, emissive: COL_CANOPY, emissiveIntensity: 1.2, metalness: 0.45, roughness: 0.12, transparent: true, opacity: 0.9 });
  body.add(new THREE.Mesh(canopyGeo, canopyMat), neon(canopyGeo, COL_MAGENTA, 0.55));

  const pts = [[0.4, -1.3], [3.5, -0.85], [6.5, -0.6], [8.6, -0.6], [9.7, -1.55], [11.6, 0.0], [9.7, 1.55], [8.6, 0.6], [6.5, 0.65], [3.5, 0.95], [0.4, 1.3]];
  const shape = new THREE.Shape();
  shape.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) shape.lineTo(pts[i][0], pts[i][1]);
  shape.closePath();
  const wingGeo = new THREE.ExtrudeGeometry(shape, { depth: 0.24, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.06, bevelSegments: 1, steps: 1 });
  wingGeo.rotateX(-Math.PI / 2); wingGeo.translate(0, -0.12, 0);
  const wingMat = new THREE.MeshStandardMaterial({ color: 0x241452, metalness: 0.82, roughness: 0.28, emissive: 0x1a0940, emissiveIntensity: 0.55, side: THREE.DoubleSide, flatShading: true });
  for (const dir of [1, -1]) {
    const wing = new THREE.Mesh(wingGeo, wingMat);
    wing.scale.x = dir; wing.position.set(dir * 1.1, 0.05, 0.2); wing.rotation.z = dir * 0.08;
    body.add(wing);
    wing.add(neon(wingGeo, COL_MAGENTA, 0.5));
    const top = new THREE.Mesh(new THREE.BoxGeometry(10.9, 0.09, 0.5), glow(COL_MAGENTA, 0.95));
    top.position.set(dir * 5.6, 0.15, -0.42); top.rotation.y = dir * -0.06; wing.add(top);
    const bot = new THREE.Mesh(new THREE.BoxGeometry(10.4, 0.09, 0.5), glow(COL_CYAN, 0.9));
    bot.position.set(dir * 5.3, -0.15, 0.5); bot.rotation.y = dir * -0.06; wing.add(bot);
  }
  // Contrasting hinged elevons make pitch and roll visible on this tailless
  // prototype instead of leaving the broad wing as one rigid slab.
  const elevonMat = new THREE.MeshStandardMaterial({ color: 0x3c1d67, metalness: 0.72, roughness: 0.32, emissive: 0x11072b, emissiveIntensity: 0.45 });
  const elevons = [1, -1].map((dir) => {
    const elevon = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.12, 0.68), elevonMat);
    elevon.position.set(dir * 7.5, 0.15, 0.72);
    elevon.userData.flightSurface = 'elevon';
    body.add(elevon);
    return elevon;
  });

  const nacMat = hullMat(true);
  for (const dir of [1, -1]) {
    const housingGeo = new THREE.CylinderGeometry(0.8, 0.98, 3.2, 8); housingGeo.rotateX(Math.PI / 2);
    const housing = new THREE.Mesh(housingGeo, nacMat);
    housing.position.set(dir * 1.3, -0.12, 2.5); housing.rotation.z = dir * -0.09;
    body.add(housing); housing.add(neon(housingGeo, COL_CYAN, 0.7));
    for (let k = 0; k < 3; k++) {
      const louver = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.07, 0.5), glow(COL_CANOPY, 0.8));
      louver.position.set(dir * 1.32, -0.7 + k * 0.5, 3.55); louver.rotation.z = dir * -0.09; body.add(louver);
    }
    const disc = new THREE.Mesh(new THREE.CircleGeometry(0.82, 20), glow(COL_ENGINE, 0.95));
    disc.position.set(dir * 1.25, -0.15, 4.15); body.add(disc);
    const core = new THREE.Mesh(new THREE.CircleGeometry(0.42, 16), glow(0xffd9ff, 0.95));
    core.position.set(dir * 1.25, -0.15, 4.17); body.add(core);
    const plumeGeo = new THREE.ConeGeometry(0.72, 3.6, 14, 1, true); plumeGeo.rotateX(-Math.PI / 2); plumeGeo.translate(0, 0, 2.0);
    const plume = new THREE.Mesh(plumeGeo, glow(COL_ENGINE, 0.6));
    plume.position.set(dir * 1.25, -0.15, 4.2); body.add(plume);
    engines.push({ disc, core, plume });
  }
  const cDisc = new THREE.Mesh(new THREE.CircleGeometry(0.62, 22), glow(COL_ENGINE, 0.95));
  cDisc.position.set(0, -0.32, 4.0); body.add(cDisc);
  const cCore = new THREE.Mesh(new THREE.CircleGeometry(0.3, 18), glow(0xffe6ff, 0.98));
  cCore.position.set(0, -0.32, 4.03); body.add(cCore);
  const cPlumeGeo = new THREE.ConeGeometry(0.5, 4.4, 16, 1, true); cPlumeGeo.rotateX(-Math.PI / 2); cPlumeGeo.translate(0, 0, 2.3);
  const cPlume = new THREE.Mesh(cPlumeGeo, glow(COL_ENGINE, 0.6));
  cPlume.position.set(0, -0.32, 4.0); body.add(cPlume);
  engines.push({ disc: cDisc, core: cCore, plume: cPlume });

  const finShape = new THREE.Shape();
  finShape.moveTo(0, 0); finShape.lineTo(0, 2.1); finShape.lineTo(1.5, 2.9); finShape.lineTo(1.9, 2.7); finShape.lineTo(0.7, 0); finShape.closePath();
  const finGeo = new THREE.ExtrudeGeometry(finShape, { depth: 0.14, bevelEnabled: false, steps: 1 });
  finGeo.translate(-0.07, 0, 0);
  for (const dir of [1, -1]) {
    const fin = new THREE.Mesh(finGeo, mat);
    fin.scale.x = dir; fin.position.set(dir * 0.55, 0.2, 2.7); fin.rotation.z = dir * -0.32;
    body.add(fin); fin.add(neon(finGeo, COL_CYAN, 0.8));
  }

  body.traverse((o) => { if (o.isMesh && !o.material.transparent) o.castShadow = true; });
  body.scale.setScalar(0.68);
  return { group: outer, engines, canopyMat, flightSurfaces: { ailerons: elevons, elevators: [], rudder: null } };
}
