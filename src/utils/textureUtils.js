import * as THREE from 'three';

/**
 * Texture budget helpers.
 *
 * The source art on disk is 8K (e.g. 8192x4096 Earth maps ≈ 134MB of VRAM each
 * once decoded). createImageBitmap lets us decode AND downscale off the main
 * thread, so the GPU only ever sees the budgeted resolution while the original
 * files stay untouched.
 */

const texturePromises = new Map(); // `${url}@${maxWidth}` -> Promise<Texture>

function loadWithTextureLoader(url) {
  return new Promise((resolve, reject) => {
    new THREE.TextureLoader().load(url, resolve, undefined, reject);
  });
}

export async function loadDownscaledTexture(url, {
  maxWidth = 4096,
  maxHeight = 4096,
  colorSpace = THREE.SRGBColorSpace,
} = {}) {
  if (typeof createImageBitmap !== 'function') {
    const fallback = await loadWithTextureLoader(url);
    fallback.colorSpace = colorSpace;
    return fallback;
  }

  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const blob = await response.blob();

    // WebGL ignores UNPACK_FLIP_Y for ImageBitmap sources, so the flip is
    // baked in at decode time and the texture keeps flipY = false.
    let bitmap = await createImageBitmap(blob, { imageOrientation: 'flipY' });

    if (bitmap.width > maxWidth || bitmap.height > maxHeight) {
      const scale = Math.min(maxWidth / bitmap.width, maxHeight / bitmap.height);
      const resized = await createImageBitmap(bitmap, {
        resizeWidth: Math.max(1, Math.round(bitmap.width * scale)),
        resizeHeight: Math.max(1, Math.round(bitmap.height * scale)),
        resizeQuality: 'high',
      });
      bitmap.close();
      bitmap = resized;
    }

    const texture = new THREE.Texture(bitmap);
    texture.colorSpace = colorSpace;
    texture.flipY = false;
    texture.needsUpdate = true;
    return texture;
  } catch (error) {
    console.warn(`[textures] downscaled load failed for ${url}, falling back to full size`, error);
    const fallback = await loadWithTextureLoader(url);
    fallback.colorSpace = colorSpace;
    return fallback;
  }
}

/** Memoized variant so repeated callers share one decode per url+budget. */
export function getDownscaledTexture(url, budget = 4096, colorSpace = THREE.SRGBColorSpace) {
  const key = `${url}@${budget}`;
  let promise = texturePromises.get(key);
  if (!promise) {
    promise = loadDownscaledTexture(url, {
      maxWidth: budget,
      maxHeight: Math.max(1, Math.round(budget / 2)), // equirect maps are 2:1
      colorSpace,
    });
    texturePromises.set(key, promise);
  }
  return promise;
}
