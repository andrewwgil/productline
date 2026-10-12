import { CanvasTexture, RepeatWrapping, SRGBColorSpace, type Texture } from "three";

export type WheelSlice = { id: string; label: string; fills: string[] };

function canvasPoint(cx: number, cy: number, angle: number, radius: number): [number, number] {
  return [cx + Math.cos(angle) * radius, cy - Math.sin(angle) * radius];
}

function ink(hex: string) {
  const value = Number.parseInt(hex.replace("#", ""), 16);
  if (!Number.isFinite(value)) return "#fff8ee";
  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;
  return (r * 299 + g * 587 + b * 114) / 1000 > 155 ? "#1a120c" : "#fff8ee";
}

function linesFor(label: string, maxChars: number) {
  const words = label.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > maxChars && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }
  if (current) lines.push(current);
  return lines.slice(0, 2).map((line) => (line.length > maxChars + 1 ? `${line.slice(0, maxChars - 1)}…` : line));
}

/** Wheel face. Angle 0 is +X and increases counter-clockwise, matching forwardLanding. */
export function makeWheelTexture(segments: WheelSlice[]): Texture {
  const size = 1024;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not draw the wheel.");
  const cx = size / 2;
  const cy = size / 2;
  const radius = size * 0.47;
  const slices = segments.length ? segments : [{ id: "empty", label: "", fills: ["#2a2030"] }];
  const n = slices.length;
  const sweep = (Math.PI * 2) / n;
  const fontSize = n > 18 ? 26 : n > 10 ? 34 : n > 5 ? 46 : 58;
  const maxChars = n > 18 ? 12 : n > 10 ? 14 : 18;

  ctx.clearRect(0, 0, size, size);
  slices.forEach((segment, index) => {
    const start = index * sweep;
    const fills = segment.fills.length ? segment.fills : ["#c81d4a"];
    fills.forEach((fill, band) => {
      const bandStart = start + (sweep * band) / fills.length;
      const bandSweep = sweep / fills.length;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      const steps = 10;
      for (let step = 0; step <= steps; step++) {
        const [x, y] = canvasPoint(cx, cy, bandStart + (bandSweep * step) / steps, radius);
        ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.fillStyle = fill;
      ctx.fill();
    });
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    const [ax, ay] = canvasPoint(cx, cy, start, radius);
    ctx.lineTo(ax, ay);
    ctx.strokeStyle = "rgba(20, 10, 16, 0.55)";
    ctx.lineWidth = 3;
    ctx.stroke();

    if (!segment.label) return;
    const mid = start + sweep / 2;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(-mid);
    ctx.fillStyle = ink(fills[0]);
    ctx.font = `700 ${fontSize}px Arial, sans-serif`;
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    const lines = linesFor(segment.label, maxChars);
    lines.forEach((line, lineIndex) => {
      const y = (lineIndex - (lines.length - 1) / 2) * (fontSize * 0.92);
      ctx.fillText(line, radius - 46, y);
    });
    ctx.restore();

    const [px, py] = canvasPoint(cx, cy, start, radius * 0.955);
    ctx.beginPath();
    ctx.arc(px, py, n > 16 ? 7 : 11, 0, Math.PI * 2);
    ctx.fillStyle = "#fff6d2";
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = "#6b5420";
    ctx.stroke();
  });

  ctx.beginPath();
  ctx.arc(cx, cy, radius * 0.16, 0, Math.PI * 2);
  ctx.fillStyle = "#140e12";
  ctx.fill();

  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 8;
  texture.needsUpdate = true;
  return texture;
}

export function makeMarqueeTexture(subtitle: string): Texture {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 280;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not draw the marquee.");
  const sky = ctx.createLinearGradient(0, 0, 0, 280);
  sky.addColorStop(0, "#4a1024");
  sky.addColorStop(0.45, "#1a0812");
  sky.addColorStop(1, "#2c1230");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, 1024, 280);
  for (let i = 0; i < 26; i++) {
    const x = 28 + i * 38;
    ctx.fillStyle = i % 3 === 0 ? "#3dfff2" : i % 3 === 1 ? "#ff2bd6" : "#ffe56a";
    ctx.beginPath();
    ctx.arc(x, 24, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x, 256, 8, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#ffe56a";
  ctx.font = "700 96px Arial, sans-serif";
  ctx.fillText("ARCADE", 512, 118);
  ctx.fillStyle = "#fff7ee";
  ctx.font = "700 40px Arial, sans-serif";
  ctx.fillText(subtitle.toUpperCase().slice(0, 28), 512, 196);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  return texture;
}

export function makeWoodTexture(): Texture {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 512;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not draw the cabinet.");
  ctx.fillStyle = "#3a2418";
  ctx.fillRect(0, 0, 256, 512);
  for (let y = 0; y < 512; y++) {
    const band = 0.08 + (Math.sin(y * 0.18) * 0.5 + 0.5) * 0.16 + ((y * 3) % 7) * 0.012;
    ctx.fillStyle = `rgba(18, 8, 4, ${band})`;
    ctx.fillRect(0, y, 256, 1);
  }
  for (let i = 0; i < 18; i++) {
    ctx.strokeStyle = `rgba(90, 52, 28, ${0.15 + (i % 3) * 0.08})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, 20 + i * 28);
    ctx.bezierCurveTo(80, 10 + i * 28, 160, 36 + i * 28, 256, 16 + i * 28);
    ctx.stroke();
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.repeat.set(1, 2);
  texture.needsUpdate = true;
  return texture;
}

export function makeBulbTexture(): Texture {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 64;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not draw the lights.");
  ctx.clearRect(0, 0, 512, 64);
  for (let i = 0; i < 16; i++) {
    const x = 16 + i * 32;
    ctx.fillStyle = i % 2 === 0 ? "#ffe56a" : "#ff4d8d";
    ctx.beginPath();
    ctx.arc(x, 32, 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.8)";
    ctx.beginPath();
    ctx.arc(x - 3, 28, 3.5, 0, Math.PI * 2);
    ctx.fill();
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.wrapS = RepeatWrapping;
  texture.needsUpdate = true;
  return texture;
}
