import * as THREE from "three";
import { RADIUS } from "./habitat.js";
import { DISTRICT_BOUNDS } from "./district-layout.js";

const TRANSITION_DURATION = 1.2;
const CACHE_KEY = "district-lighting-v1";
const DIR_LIGHT_INFO_SNIPPET =
  "getDirectionalLightInfo( directionalLight, directLight );";

function isSupportedLitMaterial(mat) {
  return Boolean(
    mat &&
      (mat.isMeshStandardMaterial ||
        mat.isMeshPhysicalMaterial ||
        mat.isMeshLambertMaterial ||
        mat.isMeshPhongMaterial),
  );
}

function buildLightsBeginChunk() {
  const base = THREE.ShaderChunk.lights_fragment_begin;
  if (!base || !base.includes(DIR_LIGHT_INFO_SNIPPET)) {
    throw new Error(
      "Unsupported Three.js lights_fragment_begin chunk layout for district lighting.",
    );
  }
  const expanded = base.replace(
    DIR_LIGHT_INFO_SNIPPET,
    `${DIR_LIGHT_INFO_SNIPPET}\n\t\tdirectLight.color *= districtDaylightFactor;`,
  );
  return /* glsl */ `
float districtRadial = length( vDistrictWorldPos.xz );
float districtS = ( districtRadial > 0.001 ) ? atan( vDistrictWorldPos.x, -vDistrictWorldPos.z ) * ${RADIUS.toFixed(1)} : 0.0;
vec2 districtOutside = max(
	vec2( ${DISTRICT_BOUNDS.minS.toFixed(1)} - districtS, ${DISTRICT_BOUNDS.minY.toFixed(1)} - vDistrictWorldPos.y ),
	vec2( districtS - ${DISTRICT_BOUNDS.maxS.toFixed(1)}, vDistrictWorldPos.y - ${DISTRICT_BOUNDS.maxY.toFixed(1)} )
);
districtOutside = max( districtOutside, 0.0 );
float districtBoxMask = 1.0 - smoothstep( 0.0, 14.0, length( districtOutside ) );
float districtShellMask = smoothstep( 100.0, 120.0, districtRadial ) * ( 1.0 - smoothstep( 180.1, 181.0, districtRadial ) );
float districtCoverage = districtBoxMask * districtShellMask;
vec3 districtDaylightFactor = mix( vec3( 1.0 ), vec3( 0.045, 0.075, 0.12 ), districtCoverage * uDistrictEmergency );
${expanded}
#if defined( RE_IndirectDiffuse )
	irradiance *= districtDaylightFactor;
#endif
`;
}

const LIGHTS_FRAGMENT_BEGIN_PATCHED = buildLightsBeginChunk();

const WORLD_POS_VERTEX_PATCH = /* glsl */ `
#include <worldpos_vertex>
vec4 districtWorldPos = vec4( transformed, 1.0 );
#ifdef USE_BATCHING
	districtWorldPos = batchingMatrix * districtWorldPos;
#endif
#ifdef USE_INSTANCING
	districtWorldPos = instanceMatrix * districtWorldPos;
#endif
districtWorldPos = modelMatrix * districtWorldPos;
vDistrictWorldPos = districtWorldPos.xyz;
`;

export function createDistrictLighting(worldRoot, initialOnline) {
  const emergencyUniform = { value: initialOnline ? 0 : 1 };
  const clonedMaterials = new Map();

  function patchMaterial(sourceMat) {
    if (!isSupportedLitMaterial(sourceMat)) return sourceMat;
    let cloned = clonedMaterials.get(sourceMat);
    if (cloned) return cloned;

    cloned = sourceMat.clone();
    const prevOnBeforeCompile =
      sourceMat.onBeforeCompile !== THREE.Material.prototype.onBeforeCompile
        ? sourceMat.onBeforeCompile
        : null;
    const prevCustomCacheKey =
      sourceMat.customProgramCacheKey !==
      THREE.Material.prototype.customProgramCacheKey
        ? sourceMat.customProgramCacheKey
        : null;

    cloned.onBeforeCompile = function onBeforeCompile(shader, renderer) {
      if (prevOnBeforeCompile) {
        prevOnBeforeCompile.call(this, shader, renderer);
      }
      shader.uniforms.uDistrictEmergency = emergencyUniform;

      shader.vertexShader = shader.vertexShader
        .replace(
          "#include <common>",
          "#include <common>\nvarying vec3 vDistrictWorldPos;",
        )
        .replace("#include <worldpos_vertex>", WORLD_POS_VERTEX_PATCH);

      shader.fragmentShader = shader.fragmentShader
        .replace(
          "#include <common>",
          "#include <common>\nuniform float uDistrictEmergency;\nvarying vec3 vDistrictWorldPos;",
        )
        .replace(
          "#include <lights_fragment_begin>",
          LIGHTS_FRAGMENT_BEGIN_PATCHED,
        );
    };

    cloned.customProgramCacheKey = function customProgramCacheKey() {
      if (prevCustomCacheKey) {
        return `${prevCustomCacheKey.call(this)}|${CACHE_KEY}`;
      }
      if (prevOnBeforeCompile) {
        return `${prevOnBeforeCompile.toString()}|${CACHE_KEY}`;
      }
      return CACHE_KEY;
    };

    clonedMaterials.set(sourceMat, cloned);
    return cloned;
  }

  worldRoot.traverse((node) => {
    if (!node.isMesh) return;
    if ((node.layers.mask & 1) === 0 && node.layers.isEnabled(1)) return;
    if (!node.material) return;

    if (Array.isArray(node.material)) {
      let changed = false;
      const next = node.material.map((mat) => {
        const patched = patchMaterial(mat);
        if (patched !== mat) changed = true;
        return patched;
      });
      if (changed) node.material = next;
    } else {
      const patched = patchMaterial(node.material);
      if (patched !== node.material) node.material = patched;
    }
  });

  function update(dt, online) {
    const target = online ? 0 : 1;
    const current = emergencyUniform.value;
    if (current === target) return;
    if (!Number.isFinite(dt) || dt <= 0) return;

    const step = dt / TRANSITION_DURATION;
    emergencyUniform.value =
      current < target
        ? Math.min(target, current + step)
        : Math.max(target, current - step);
  }

  return { update };
}
