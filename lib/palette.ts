import { rasterPixels } from "./images";

type RGB = [number, number, number];

const NEAR_WHITE_LUM = 242;
const NEAR_WHITE_CHROMA = 16;

function luminance([r, g, b]: RGB) {
  return (r * 299 + g * 587 + b * 114) / 1000;
}

function chroma([r, g, b]: RGB) {
  return Math.max(r, g, b) - Math.min(r, g, b);
}

export function isNearWhite(rgb: RGB) {
  return luminance(rgb) >= NEAR_WHITE_LUM && chroma(rgb) <= NEAR_WHITE_CHROMA;
}

function toHex([r, g, b]: RGB) {
  return `#${[r, g, b].map((n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0")).join("")}`;
}

function dist2(a: RGB, b: RGB) {
  const dr = a[0] - b[0];
  const dg = a[1] - b[1];
  const db = a[2] - b[2];
  return dr * dr + dg * dg + db * db;
}

function at(data: Uint8Array, width: number, x: number, y: number): RGB {
  const i = (y * width + x) * 3;
  return [data[i], data[i + 1], data[i + 2]];
}

/** Flat interior pixels only, so antialiased edges do not invent extra swatches. */
export function interiorSamples(data: Uint8Array, width: number, height: number): RGB[] {
  const pixels: RGB[] = [];
  const x1 = Math.max(1, width - 1);
  const y1 = Math.max(1, height - 1);
  for (let y = 1; y < y1; y++) {
    for (let x = 1; x < x1; x++) {
      const rgb = at(data, width, x, y);
      if (isNearWhite(rgb)) continue;
      if (dist2(rgb, at(data, width, x + 1, y)) > 36 * 36) continue;
      if (dist2(rgb, at(data, width, x, y + 1)) > 36 * 36) continue;
      pixels.push(rgb);
    }
  }
  return pixels;
}

function kmeans(pixels: RGB[], k: number): { rgb: RGB; count: number }[] {
  const seeds: RGB[] = [[...pixels[Math.floor(pixels.length / 2)]]];
  while (seeds.length < k) {
    let best = 0;
    let bestD = -1;
    const step = Math.max(1, Math.floor(pixels.length / 900));
    for (let i = 0; i < pixels.length; i += step) {
      let nearest = Infinity;
      for (const seed of seeds) nearest = Math.min(nearest, dist2(pixels[i], seed));
      if (nearest > bestD) {
        bestD = nearest;
        best = i;
      }
    }
    if (bestD < 32 * 32) break;
    seeds.push([...pixels[best]]);
  }

  let centers = seeds;
  const sums = centers.map(() => [0, 0, 0, 0]);
  for (let iter = 0; iter < 10; iter++) {
    for (const sum of sums) sum.fill(0);
    for (const pixel of pixels) {
      let bi = 0;
      let bd = Infinity;
      for (let c = 0; c < centers.length; c++) {
        const d = dist2(pixel, centers[c]);
        if (d < bd) {
          bd = d;
          bi = c;
        }
      }
      sums[bi][0] += pixel[0];
      sums[bi][1] += pixel[1];
      sums[bi][2] += pixel[2];
      sums[bi][3] += 1;
    }
    centers = sums.map((sum, i) => sum[3]
      ? [Math.round(sum[0] / sum[3]), Math.round(sum[1] / sum[3]), Math.round(sum[2] / sum[3])] as RGB
      : centers[i]);
  }

  return centers
    .map((rgb, i) => ({ rgb, count: sums[i][3] }))
    .filter((cluster) => cluster.count > 0 && !isNearWhite(cluster.rgb));
}

/** K-means on RGB samples. Near-white background pixels are ignored. */
export function paletteFromPixels(pixels: RGB[], count = 6): { name: string; hex: string }[] {
  if (pixels.length < 8) return [];

  const clusters = kmeans(pixels, Math.max(count, 6))
    .filter((cluster) => cluster.count >= Math.max(4, pixels.length * 0.015))
    .sort((a, b) => b.count - a.count);

  const merged: { rgb: RGB; count: number }[] = [];
  for (const cluster of clusters) {
    const hit = merged.find((item) => dist2(item.rgb, cluster.rgb) < 26 * 26);
    if (!hit) {
      merged.push({ rgb: [...cluster.rgb], count: cluster.count });
      continue;
    }
    const total = hit.count + cluster.count;
    hit.rgb = [
      Math.round((hit.rgb[0] * hit.count + cluster.rgb[0] * cluster.count) / total),
      Math.round((hit.rgb[1] * hit.count + cluster.rgb[1] * cluster.count) / total),
      Math.round((hit.rgb[2] * hit.count + cluster.rgb[2] * cluster.count) / total),
    ];
    hit.count = total;
  }

  merged.sort((a, b) => b.count - a.count);
  const floor = Math.max(8, Math.round(pixels.length * 0.04));
  const popular = merged.filter((cluster) => cluster.count >= floor);
  const picked = (popular.length >= 3 ? popular : merged).slice(0, count);
  picked.sort((a, b) => luminance(a.rgb) - luminance(b.rgb));

  if (picked.length && luminance(picked[picked.length - 1].rgb) < 200) {
    if (picked.length >= count) {
      let drop = 1;
      for (let i = 2; i < picked.length; i++) {
        if (picked[i].count < picked[drop].count) drop = i;
      }
      if (drop > 0 && drop < picked.length) picked.splice(drop, 1);
    }
    picked.push({ rgb: [244, 239, 230], count: 0 });
  }

  return nameSwatches(picked.map((item) => item.rgb)).slice(0, count);
}

function nameSwatches(colors: RGB[]): { name: string; hex: string }[] {
  const used = new Map<string, number>();
  return colors.map((rgb) => {
    const base = colorName(rgb);
    const seen = used.get(base) ?? 0;
    used.set(base, seen + 1);
    const name = seen === 0 ? base : `Soft ${base}`;
    return { name, hex: toHex(rgb) };
  });
}

function colorName([r, g, b]: RGB) {
  const light = luminance([r, g, b]);
  const span = chroma([r, g, b]);
  if (light < 32) return "Ink Black";
  if (span < 18) {
    if (light > 225) return "Cream";
    if (light > 170) return "Stone";
    if (light > 90) return "Graphite";
    return "Ink Black";
  }
  let hue = 0;
  const max = Math.max(r, g, b);
  if (max === r) hue = ((g - b) / span) % 6;
  else if (max === g) hue = (b - r) / span + 2;
  else hue = (r - g) / span + 4;
  hue *= 60;
  if (hue < 0) hue += 360;
  if (hue < 18 || hue >= 345) return light > 70 ? "Signal Red" : "Crimson";
  if (hue < 42) return "Rust";
  if (hue < 70) return light > 150 ? "Sun Yellow" : "Gold";
  if (hue < 160) return light > 140 ? "Leaf" : "Green";
  if (hue < 200) return "Teal";
  if (hue < 255) return light > 50 ? "Cobalt" : "Navy";
  if (hue < 290) return "Violet";
  return light > 150 ? "Rose" : "Wine";
}

export async function paletteFromSources(sources: string[], count = 6): Promise<{ name: string; hex: string }[]> {
  const rasters = await Promise.all(sources.slice(0, 8).map((src) => rasterPixels(src)));
  const pixels = rasters.flatMap((raster) => raster ? interiorSamples(raster.data, raster.width, raster.height) : []);
  return paletteFromPixels(pixels, count);
}
