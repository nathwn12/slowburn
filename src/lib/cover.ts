import { convertFileSrc, invoke } from '@tauri-apps/api/core';

export async function getCover(path: string): Promise<string | null> {
  const cover = await invoke<string | null>('plugin:cover|get_cover', {
    path,
  });

  if (cover === null) {
    return null;
  }

  return cover.startsWith('data:') ? cover : convertFileSrc(cover);
}

type RGB = readonly [number, number, number];

function toHexChannel(value: number): string {
  return Math.round(Math.min(255, Math.max(0, value)))
    .toString(16)
    .padStart(2, '0');
}

/**
 * Average sampled cover pixels into a `#rrggbb` accent. Near-grey and
 * near-black pixels are skipped so monochrome artwork does not flatten the
 * accent; when every pixel is skipped, fall back to averaging everything.
 * Pure (no DOM) so it is unit-testable.
 */
export function averageAccentFromPixels(pixels: Array<RGB>): string | null {
  const vivid = pixels.filter(([r, g, b]) => {
    const spread = Math.max(r, g, b) - Math.min(r, g, b);
    return spread >= 24 && Math.max(r, g, b) >= 48;
  });

  const sample = vivid.length > 0 ? vivid : pixels;

  if (sample.length === 0) {
    return null;
  }

  let r = 0;
  let g = 0;
  let b = 0;

  for (const [pr, pg, pb] of sample) {
    r += pr;
    g += pg;
    b += pb;
  }

  const count = sample.length;

  return `#${toHexChannel(r / count)}${toHexChannel(g / count)}${toHexChannel(b / count)}`;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not load cover image'));
    img.src = src;
  });
}

/**
 * Sample the dominant accent color of a cover image URL by averaging a
 * downscaled center-crop on a canvas. Never throws: returns `null` when the
 * artwork cannot be read (missing cover, tainted canvas, no DOM).
 */
export async function sampleCoverAccent(
  coverUrl: string,
): Promise<string | null> {
  try {
    const img = await loadImage(coverUrl);
    const size = 48;
    const side = Math.min(img.naturalWidth, img.naturalHeight);

    if (side <= 0) {
      return null;
    }

    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;

    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    if (ctx === null) {
      return null;
    }

    ctx.drawImage(
      img,
      (img.naturalWidth - side) / 2,
      (img.naturalHeight - side) / 2,
      side,
      side,
      0,
      0,
      size,
      size,
    );

    const data = ctx.getImageData(0, 0, size, size).data;
    const pixels: Array<RGB> = [];

    // Every 8th pixel is plenty for a dominant-color estimate
    for (let i = 0; i + 3 < data.length; i += 4 * 8) {
      if (data[i + 3] === 0) {
        continue;
      }
      pixels.push([data[i] ?? 0, data[i + 1] ?? 0, data[i + 2] ?? 0]);
    }

    return averageAccentFromPixels(pixels);
  } catch {
    return null;
  }
}
