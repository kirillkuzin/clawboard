/**
 * Programmatic Pixel-Art Sprite Generator
 *
 * Generates all sprites at runtime using Canvas 2D drawing.
 * No external image assets required.
 */

import type { AgentStatus } from "@/lib/types/events";

// ── Color Palettes (expanded for maximum visual distinction) ─

const SKIN_COLORS = [
  "#fde7d0", "#f5d6b8", "#e8c49a", "#d4a574", "#c68642",
  "#e0ac69", "#b87333", "#8d5524", "#6b3a1f", "#a0704e",
  "#f0c8a0", "#d9a066",
];
const HAIR_COLORS = [
  "#2c1810", "#4a3728", "#1a1a2e", "#8b4513", "#d4a017",
  "#c0392b", "#e74c3c", "#2980b9", "#3498db", "#8e44ad",
  "#1abc9c", "#f39c12", "#e67e22", "#95a5a6", "#ecf0f1",
  "#d35400", "#16a085", "#2c3e50", "#7f8c8d", "#27ae60",
];
const SHIRT_COLORS = [
  "#3498db", "#e74c3c", "#2ecc71", "#f39c12", "#9b59b6",
  "#1abc9c", "#e67e22", "#34495e", "#c0392b", "#2980b9",
  "#d35400", "#16a085", "#8e44ad", "#27ae60", "#f1c40f",
  "#2c3e50", "#7f8c8d", "#1a5276", "#922b21", "#196f3d",
  "#7d3c98", "#b9770e", "#117a65", "#2e4053",
];
const PANTS_COLORS = [
  "#2c3e50", "#1a1a2e", "#34495e", "#2c2c54", "#1e3a5f",
  "#4a235a", "#1b4f72", "#0e6655", "#784212", "#283747",
  "#1c2833", "#512e5f",
];
const SHOE_COLORS = [
  "#1a1a2e", "#2c1810", "#34495e", "#4a3728", "#7b241c",
  "#1b4f72", "#0b5345", "#6c3483",
];
const EYE_COLORS = [
  "#1a1a2e", "#2c3e50", "#1b4f72", "#0e6251", "#6c3483",
  "#922b21",
];
const ACCESSORY_COLORS = [
  "#e74c3c", "#f39c12", "#3498db", "#2ecc71", "#9b59b6",
  "#e67e22", "#1abc9c", "#ecf0f1",
];

const STATUS_COLORS: Record<AgentStatus, string> = {
  idle: "#2ecc71",
  busy: "#f39c12",
  error: "#e74c3c",
  offline: "#95a5a6",
  starting: "#3498db",
};

const STATUS_GLOW: Record<AgentStatus, string> = {
  idle: "rgba(46, 204, 113, 0.4)",
  busy: "rgba(243, 156, 18, 0.4)",
  error: "rgba(231, 76, 60, 0.4)",
  offline: "rgba(149, 165, 166, 0.2)",
  starting: "rgba(52, 152, 219, 0.4)",
};

// ── Deterministic seeded random ─────────────────────────────

function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return Math.abs(hash);
}

function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 16807 + 0) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

/** Use different bit ranges of the hash for each trait to avoid correlated picks */
function pickFromSeed<T>(arr: T[], seed: number, offset = 0): T {
  // Rotate the seed by different amounts per offset to decorrelate selections
  const rotated = ((seed >>> (offset * 3)) ^ (seed >>> (offset * 7 + 5))) >>> 0;
  return arr[rotated % arr.length];
}

/** Mix two hash values for extra decorrelation */
function mixHash(a: number, b: number): number {
  return ((a * 2654435761) ^ b) >>> 0;
}

// ── Pixel drawing helpers ───────────────────────────────────

function drawPixel(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, color: string) {
  ctx.fillStyle = color;
  ctx.fillRect(x * size, y * size, size, size);
}

function drawPixelRow(ctx: CanvasRenderingContext2D, y: number, startX: number, pixels: string[], size: number) {
  for (let i = 0; i < pixels.length; i++) {
    if (pixels[i] !== "") {
      drawPixel(ctx, startX + i, y, size, pixels[i]);
    }
  }
}

// ── Agent Sprite Sheet ──────────────────────────────────────

export interface AgentAppearance {
  skinColor: string;
  hairColor: string;
  shirtColor: string;
  pantsColor: string;
  shoeColor: string;
  eyeColor: string;
  hairStyle: number;   // 0-5 (flat, spiky, side-part, bald, mohawk, long)
  hasGlasses: boolean;
  hasHeadband: boolean;
  headbandColor: string;
  hasBadge: boolean;
  badgeColor: string;
  bodyWidth: number;   // 0=slim, 1=normal, 2=broad
}

export function getAppearanceForAgent(agentId: string): AgentAppearance {
  const hash = hashCode(agentId);
  const h2 = mixHash(hash, 0xDEADBEEF);
  const h3 = mixHash(hash, 0xCAFEBABE);
  return {
    skinColor: pickFromSeed(SKIN_COLORS, hash, 0),
    hairColor: pickFromSeed(HAIR_COLORS, hash, 1),
    shirtColor: pickFromSeed(SHIRT_COLORS, hash, 2),
    pantsColor: pickFromSeed(PANTS_COLORS, hash, 3),
    shoeColor: pickFromSeed(SHOE_COLORS, hash, 4),
    eyeColor: pickFromSeed(EYE_COLORS, hash, 5),
    hairStyle: ((hash >>> 8) ^ (h2 >>> 3)) % 6,
    hasGlasses: (h2 >>> 12) % 5 === 0,       // ~20% chance
    hasHeadband: (h2 >>> 16) % 7 === 0,       // ~14% chance
    headbandColor: pickFromSeed(ACCESSORY_COLORS, h2, 0),
    hasBadge: (h3 >>> 4) % 6 === 0,           // ~17% chance
    badgeColor: pickFromSeed(ACCESSORY_COLORS, h3, 1),
    bodyWidth: ((h3 >>> 10) % 3),             // 0, 1, or 2
  };
}

/** Darken a hex color by a fraction (0-1) */
function darkenColor(hex: string, amount: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const f = 1 - amount;
  return `rgb(${Math.floor(r * f)},${Math.floor(g * f)},${Math.floor(b * f)})`;
}

/** Lighten a hex color by a fraction (0-1) */
function lightenColor(hex: string, amount: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgb(${Math.floor(r + (255 - r) * amount)},${Math.floor(g + (255 - g) * amount)},${Math.floor(b + (255 - b) * amount)})`;
}

export function drawAgentFrame(
  ctx: CanvasRenderingContext2D,
  appearance: AgentAppearance,
  frame: number,
  status: AgentStatus,
  scale: number = 3,
  offsetX: number = 0,
  offsetY: number = 0,
): void {
  const s = scale;
  const {
    skinColor, hairColor, shirtColor, pantsColor, shoeColor,
    eyeColor, hairStyle, hasGlasses, hasHeadband, headbandColor,
    hasBadge, badgeColor, bodyWidth,
  } = appearance;

  const skinDark = darkenColor(skinColor, 0.15);
  const shirtDark = darkenColor(shirtColor, 0.2);
  const shirtLight = lightenColor(shirtColor, 0.2);

  ctx.save();
  ctx.translate(offsetX, offsetY);

  // Walking bob
  const bobY = (frame % 2 === 0) ? 0 : -s;

  // Body width adjustments: 0=slim(-1px each side), 1=normal, 2=broad(+1px each side)
  const bwOffset = bodyWidth === 0 ? 1 : bodyWidth === 2 ? -1 : 0;
  const bodyLeft = 4 + bwOffset;
  const bodyRight = 11 - bwOffset;
  const bodyW = bodyRight - bodyLeft + 1;

  // ── Hair (rows 0-1) ─────
  if (hairStyle === 0) {
    // Flat top
    drawPixelRow(ctx, 0 + bobY / s, 5, [hairColor, hairColor, hairColor, hairColor, hairColor, hairColor], s);
    drawPixelRow(ctx, 1 + bobY / s, 4, [hairColor, hairColor, hairColor, hairColor, hairColor, hairColor, hairColor, hairColor], s);
  } else if (hairStyle === 1) {
    // Spiky
    drawPixelRow(ctx, 0 + bobY / s, 5, ["", hairColor, "", hairColor, "", hairColor], s);
    drawPixelRow(ctx, 1 + bobY / s, 4, [hairColor, hairColor, hairColor, hairColor, hairColor, hairColor, hairColor, hairColor], s);
  } else if (hairStyle === 2) {
    // Side part
    drawPixelRow(ctx, 0 + bobY / s, 4, [hairColor, hairColor, hairColor, hairColor, hairColor, hairColor, hairColor, hairColor], s);
    drawPixelRow(ctx, 1 + bobY / s, 4, [hairColor, hairColor, hairColor, hairColor, hairColor, hairColor, hairColor, hairColor], s);
  } else if (hairStyle === 3) {
    // Bald / buzz cut
    drawPixelRow(ctx, 1 + bobY / s, 5, [hairColor, hairColor, hairColor, hairColor, hairColor, hairColor], s);
  } else if (hairStyle === 4) {
    // Mohawk — center strip
    drawPixelRow(ctx, -1 + bobY / s, 6, ["", hairColor, hairColor, ""], s);
    drawPixelRow(ctx, 0 + bobY / s, 6, [hairColor, hairColor, hairColor, hairColor], s);
    drawPixelRow(ctx, 1 + bobY / s, 5, ["", hairColor, hairColor, hairColor, hairColor, ""], s);
  } else {
    // Long / flowing hair — extends down sides
    drawPixelRow(ctx, 0 + bobY / s, 4, [hairColor, hairColor, hairColor, hairColor, hairColor, hairColor, hairColor, hairColor], s);
    drawPixelRow(ctx, 1 + bobY / s, 4, [hairColor, hairColor, hairColor, hairColor, hairColor, hairColor, hairColor, hairColor], s);
    // Side locks extending down
    drawPixel(ctx, 4, 2 + bobY / s, s, hairColor);
    drawPixel(ctx, 11, 2 + bobY / s, s, hairColor);
    drawPixel(ctx, 4, 3 + bobY / s, s, hairColor);
    drawPixel(ctx, 11, 3 + bobY / s, s, hairColor);
    drawPixel(ctx, 3, 4 + bobY / s, s, hairColor);
    drawPixel(ctx, 12, 4 + bobY / s, s, hairColor);
  }

  // ── Headband accessory ─────
  if (hasHeadband) {
    drawPixelRow(ctx, 1 + bobY / s, 4, [headbandColor, headbandColor, headbandColor, headbandColor, headbandColor, headbandColor, headbandColor, headbandColor], s);
  }

  // ── Head / face (rows 2-5) ─────
  const headY = 2 + bobY / s;
  drawPixelRow(ctx, headY, 5, [skinColor, skinColor, skinColor, skinColor, skinColor, skinColor], s);
  drawPixelRow(ctx, headY + 1, 4, [skinDark, skinColor, skinColor, skinColor, skinColor, skinColor, skinColor, skinDark], s);

  // Eyes — use unique eye color
  const blinkFrame = frame % 16 === 0; // blink every 16 frames
  if (!blinkFrame) {
    drawPixel(ctx, 5, headY + 1, s, eyeColor);
    drawPixel(ctx, 7, headY + 1, s, eyeColor);
    // Eye whites/highlights
    drawPixel(ctx, 6, headY + 1, s, skinColor);

    // Mouth based on status
    if (status === "error") {
      drawPixel(ctx, 6, headY + 2, s, "#c0392b");
    } else if (status === "busy") {
      drawPixelRow(ctx, headY + 2, 5, ["", skinColor, "#c0392b", skinColor], s);
    }
  } else {
    // Blink - just skin where eyes were
    drawPixel(ctx, 5, headY + 1, s, skinDark);
    drawPixel(ctx, 7, headY + 1, s, skinDark);
  }

  drawPixelRow(ctx, headY + 2, 5, [skinColor, skinColor, skinColor, skinColor, skinColor, skinColor], s);

  // ── Glasses accessory ─────
  if (hasGlasses) {
    const glassColor = "#424242";
    // Left lens frame
    drawPixel(ctx, 5, headY + 1 - 1, s, glassColor);
    // Bridge
    drawPixel(ctx, 6, headY + 1 - 1, s, glassColor);
    // Right lens frame
    drawPixel(ctx, 7, headY + 1 - 1, s, glassColor);
    // Side frames
    drawPixel(ctx, 4, headY + 1, s, glassColor);
    drawPixel(ctx, 8, headY + 1, s, glassColor);
  }

  // ── Neck (row 6) ─────
  drawPixelRow(ctx, 6 + bobY / s, 6, [skinColor, skinColor, skinColor, skinColor], s);

  // ── Torso / shirt (rows 7-9) ─────
  const torsoY = 7 + bobY / s;
  const shirtRow = Array(bodyW).fill(shirtColor);
  // Add collar highlight
  const collarRow = [...shirtRow];
  if (collarRow.length >= 3) {
    collarRow[1] = shirtLight;
    collarRow[2] = shirtLight;
  }
  drawPixelRow(ctx, torsoY, bodyLeft, collarRow, s);
  // Side shading on torso
  const shadedRow = shirtRow.map((c, i) => i === 0 || i === shirtRow.length - 1 ? shirtDark : c);
  drawPixelRow(ctx, torsoY + 1, bodyLeft, shadedRow, s);
  drawPixelRow(ctx, torsoY + 2, bodyLeft + 1, shirtRow.slice(1, -1), s);

  // ── Badge accessory on shirt ─────
  if (hasBadge) {
    drawPixel(ctx, bodyLeft + 1, torsoY + 1, s, badgeColor);
  }

  // Arms (animate when walking)
  const armY = torsoY;
  if (status === "busy" && frame % 4 < 2) {
    // Typing animation - arms forward
    drawPixel(ctx, bodyLeft - 1, armY, s, skinColor);
    drawPixel(ctx, bodyRight + 1, armY, s, skinColor);
    drawPixel(ctx, bodyLeft - 1, armY + 1, s, skinColor);
    drawPixel(ctx, bodyRight + 1, armY + 1, s, skinColor);
  } else if (frame % 4 < 2) {
    drawPixel(ctx, bodyLeft - 1, armY + 1, s, skinColor);
    drawPixel(ctx, bodyRight + 1, armY + 1, s, skinColor);
  } else {
    drawPixel(ctx, bodyLeft - 1, armY, s, skinColor);
    drawPixel(ctx, bodyRight + 1, armY, s, skinColor);
  }

  // ── Pants (rows 10-12) ─────
  const pantsY = 10;
  drawPixelRow(ctx, pantsY, 5, [pantsColor, pantsColor, pantsColor, pantsColor, pantsColor, pantsColor], s);

  // Legs animate when walking
  if (status !== "idle" && status !== "offline") {
    if (frame % 4 < 2) {
      drawPixelRow(ctx, pantsY + 1, 5, [pantsColor, pantsColor, "", "", pantsColor, pantsColor], s);
      drawPixelRow(ctx, pantsY + 2, 5, [shoeColor, shoeColor, "", "", shoeColor, shoeColor], s);
    } else {
      drawPixelRow(ctx, pantsY + 1, 6, [pantsColor, pantsColor, "", pantsColor, pantsColor], s);
      drawPixelRow(ctx, pantsY + 2, 6, [shoeColor, shoeColor, "", shoeColor, shoeColor], s);
    }
  } else {
    drawPixelRow(ctx, pantsY + 1, 5, [pantsColor, pantsColor, "", "", pantsColor, pantsColor], s);
    drawPixelRow(ctx, pantsY + 2, 5, [shoeColor, shoeColor, "", "", shoeColor, shoeColor], s);
  }

  ctx.restore();
}

// ── Desk Sprite ─────────────────────────────────────────────

export function drawDesk(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  scale: number = 3,
  occupied: boolean = false,
  status?: AgentStatus,
): void {
  const s = scale;
  ctx.save();
  ctx.translate(x, y);

  const deskColor = "#8b6914";
  const deskLight = "#a0822a";
  const deskDark = "#6b4f10";
  const legColor = "#5c4033";

  // Desktop surface (6x3 pixels)
  for (let px = 0; px < 10; px++) {
    drawPixel(ctx, px, 0, s, deskLight);
    drawPixel(ctx, px, 1, s, deskColor);
    drawPixel(ctx, px, 2, s, deskDark);
  }

  // Legs
  drawPixel(ctx, 0, 3, s, legColor);
  drawPixel(ctx, 0, 4, s, legColor);
  drawPixel(ctx, 9, 3, s, legColor);
  drawPixel(ctx, 9, 4, s, legColor);

  // Monitor on desk
  if (occupied) {
    const monitorColor = "#2c3e50";
    const screenColor = status === "busy" ? "#27ae60" :
                        status === "error" ? "#c0392b" :
                        status === "starting" ? "#2980b9" : "#34495e";

    // Monitor frame
    drawPixelRow(ctx, -3, 3, [monitorColor, monitorColor, monitorColor, monitorColor], s);
    drawPixelRow(ctx, -2, 3, [monitorColor, screenColor, screenColor, monitorColor], s);
    drawPixelRow(ctx, -1, 3, [monitorColor, screenColor, screenColor, monitorColor], s);
    // Stand
    drawPixelRow(ctx, 0, 4, [monitorColor, monitorColor], s);
  }

  ctx.restore();
}

// ── Status Indicator ────────────────────────────────────────

export function drawStatusBubble(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  status: AgentStatus,
  frame: number,
  scale: number = 3,
): void {
  const s = scale;
  const color = STATUS_COLORS[status];
  const glow = STATUS_GLOW[status];

  ctx.save();
  ctx.translate(x, y);

  // Floating animation
  const floatY = Math.sin(frame * 0.15) * 2;

  // Glow
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(s * 2, floatY + s * 1, s * 2.5, 0, Math.PI * 2);
  ctx.fill();

  // Dot
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(s * 2, floatY + s * 1, s * 1.2, 0, Math.PI * 2);
  ctx.fill();

  // Pulse for busy/starting
  if (status === "busy" || status === "starting") {
    const pulse = Math.sin(frame * 0.2) * 0.5 + 0.5;
    ctx.globalAlpha = pulse * 0.6;
    ctx.beginPath();
    ctx.arc(s * 2, floatY + s * 1, s * 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  ctx.restore();
}

// ── Office Furniture ────────────────────────────────────────

export function drawPlant(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  scale: number = 3,
): void {
  const s = scale;
  ctx.save();
  ctx.translate(x, y);

  const potColor = "#a0522d";
  const leafColor = "#27ae60";
  const leafDark = "#1e8449";

  // Pot
  drawPixelRow(ctx, 3, 1, [potColor, potColor, potColor], s);
  drawPixelRow(ctx, 4, 0, [potColor, potColor, potColor, potColor, potColor], s);

  // Leaves
  drawPixelRow(ctx, 0, 1, [leafColor, leafDark, leafColor], s);
  drawPixelRow(ctx, 1, 0, [leafDark, leafColor, leafColor, leafDark, leafColor], s);
  drawPixelRow(ctx, 2, 1, [leafColor, leafColor, leafColor], s);

  ctx.restore();
}

export function drawWaterCooler(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  scale: number = 3,
): void {
  const s = scale;
  ctx.save();
  ctx.translate(x, y);

  const bodyColor = "#ecf0f1";
  const waterColor = "#3498db";
  const baseColor = "#bdc3c7";

  // Water jug
  drawPixelRow(ctx, 0, 1, [waterColor, waterColor], s);
  drawPixelRow(ctx, 1, 1, [waterColor, waterColor], s);

  // Body
  drawPixelRow(ctx, 2, 0, [bodyColor, bodyColor, bodyColor, bodyColor], s);
  drawPixelRow(ctx, 3, 0, [bodyColor, bodyColor, bodyColor, bodyColor], s);
  drawPixelRow(ctx, 4, 0, [bodyColor, bodyColor, bodyColor, bodyColor], s);

  // Base
  drawPixelRow(ctx, 5, 0, [baseColor, baseColor, baseColor, baseColor], s);

  // Legs
  drawPixel(ctx, 0, 6, s, baseColor);
  drawPixel(ctx, 3, 6, s, baseColor);

  ctx.restore();
}

// ── Floor Tile ──────────────────────────────────────────────

export function drawFloorTile(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  tileSize: number,
  isDark: boolean,
): void {
  ctx.fillStyle = isDark ? "#1e1e2e" : "#252536";
  ctx.fillRect(x, y, tileSize, tileSize);

  // Subtle grid lines
  ctx.strokeStyle = "rgba(255,255,255,0.03)";
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, tileSize - 1, tileSize - 1);
}

// ── Name Tag ────────────────────────────────────────────────

export function drawNameTag(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  name: string,
  status: AgentStatus,
): void {
  ctx.save();

  const maxLen = 12;
  const displayName = name.length > maxLen ? name.slice(0, maxLen - 1) + "\u2026" : name;

  ctx.font = "bold 10px monospace";
  const metrics = ctx.measureText(displayName);
  const textWidth = metrics.width;
  const padding = 4;
  const tagWidth = textWidth + padding * 2;
  const tagHeight = 14;

  // Background pill
  ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
  const rx = x - tagWidth / 2;
  const ry = y - tagHeight / 2;
  ctx.beginPath();
  ctx.roundRect(rx, ry, tagWidth, tagHeight, 3);
  ctx.fill();

  // Status color border
  ctx.strokeStyle = STATUS_COLORS[status];
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(rx, ry, tagWidth, tagHeight, 3);
  ctx.stroke();

  // Text
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(displayName, x, y);

  ctx.restore();
}

// ── Spawn-In Animation (Canvas 2D) ──────────────────────────

/**
 * Draw a spawning-in agent: character materializes from scattered pixels.
 * @param phase 0-3 representing 25% → 100% materialization
 */
export function drawAgentSpawnFrame(
  ctx: CanvasRenderingContext2D,
  appearance: AgentAppearance,
  phase: number,
  status: AgentStatus,
  scale: number = 3,
  offsetX: number = 0,
  offsetY: number = 0,
): void {
  // Draw full character to offscreen canvas
  const tmpCanvas = document.createElement("canvas");
  tmpCanvas.width = 16 * scale;
  tmpCanvas.height = 16 * scale;
  const tmpCtx = tmpCanvas.getContext("2d")!;

  drawAgentFrame(tmpCtx, appearance, 0, status, scale, 0, 0);

  // Read pixels and selectively draw based on materialization phase
  const imgData = tmpCtx.getImageData(0, 0, tmpCanvas.width, tmpCanvas.height);
  const data = imgData.data;
  const threshold = (phase + 1) / 4; // 0.25, 0.50, 0.75, 1.0

  // Use deterministic randomness based on appearance
  let seed = 0;
  for (let i = 0; i < appearance.shirtColor.length; i++) {
    seed = ((seed << 5) - seed + appearance.shirtColor.charCodeAt(i)) | 0;
  }
  seed = Math.abs(seed);

  ctx.save();
  ctx.translate(offsetX, offsetY);

  // Global alpha for the whole spawn effect (fades in)
  const baseAlpha = Math.min(phase * 0.35 + 0.3, 1);

  for (let py = 0; py < tmpCanvas.height; py++) {
    for (let px = 0; px < tmpCanvas.width; px++) {
      const idx = (py * tmpCanvas.width + px) * 4;
      if (data[idx + 3] === 0) continue;

      // Deterministic reveal order per pixel
      seed = (seed * 16807 + 0) % 2147483647;
      const revealOrder = (seed - 1) / 2147483646;

      if (revealOrder <= threshold) {
        ctx.globalAlpha = baseAlpha;
        ctx.fillStyle = `rgb(${data[idx]},${data[idx + 1]},${data[idx + 2]})`;
        ctx.fillRect(px, py, 1, 1);

        // Sparkle for recently materialized pixels
        if (phase < 3 && revealOrder > threshold - 0.25) {
          ctx.globalAlpha = 0.5;
          ctx.fillStyle = appearance.shirtColor;
          if (px + 1 < tmpCanvas.width) ctx.fillRect(px + 1, py, 1, 1);
        }
      } else if (phase >= 1) {
        // Ghost outline for pending pixels
        ctx.globalAlpha = 0.06 + phase * 0.03;
        ctx.fillStyle = appearance.shirtColor;
        ctx.fillRect(px, py, 1, 1);
      }
    }
  }

  // Phase 3: glow outline effect
  if (phase === 3) {
    ctx.globalAlpha = 0.2;
    ctx.shadowColor = appearance.shirtColor;
    ctx.shadowBlur = scale * 3;
    ctx.fillStyle = "transparent";
    ctx.fillRect(0, 0, tmpCanvas.width, tmpCanvas.height);
    ctx.shadowBlur = 0;
    ctx.shadowColor = "transparent";
  }

  ctx.globalAlpha = 1;
  ctx.restore();
}

// ── Despawn Animation (Canvas 2D) ───────────────────────────

/**
 * Draw a despawning agent: character dissolves into scattered particles.
 * @param phase 0 = mostly visible (60%), 1 = nearly gone (20%)
 */
export function drawAgentDespawnFrame(
  ctx: CanvasRenderingContext2D,
  appearance: AgentAppearance,
  phase: number,
  status: AgentStatus,
  scale: number = 3,
  offsetX: number = 0,
  offsetY: number = 0,
): void {
  const tmpCanvas = document.createElement("canvas");
  tmpCanvas.width = 16 * scale;
  tmpCanvas.height = 16 * scale;
  const tmpCtx = tmpCanvas.getContext("2d")!;

  drawAgentFrame(tmpCtx, appearance, 0, status, scale, 0, 0);

  const imgData = tmpCtx.getImageData(0, 0, tmpCanvas.width, tmpCanvas.height);
  const data = imgData.data;
  const keepThreshold = phase === 0 ? 0.6 : 0.2;

  let seed = 0;
  for (let i = 0; i < appearance.pantsColor.length; i++) {
    seed = ((seed << 5) - seed + appearance.pantsColor.charCodeAt(i)) | 0;
  }
  seed = Math.abs(seed);

  ctx.save();
  ctx.translate(offsetX, offsetY);

  const fadeAlpha = phase === 0 ? 0.85 : 0.45;

  for (let py = 0; py < tmpCanvas.height; py++) {
    for (let px = 0; px < tmpCanvas.width; px++) {
      const idx = (py * tmpCanvas.width + px) * 4;
      if (data[idx + 3] === 0) continue;

      seed = (seed * 16807 + 0) % 2147483647;
      const dissolveOrder = (seed - 1) / 2147483646;

      if (dissolveOrder <= keepThreshold) {
        // Keep pixel with fade
        const fadeAmt = phase === 0 ? 0.1 : 0.35;
        const r = Math.floor(data[idx] + (149 - data[idx]) * fadeAmt);
        const g = Math.floor(data[idx + 1] + (165 - data[idx + 1]) * fadeAmt);
        const b = Math.floor(data[idx + 2] + (166 - data[idx + 2]) * fadeAmt);
        ctx.globalAlpha = fadeAlpha;
        ctx.fillStyle = `rgb(${r},${g},${b})`;
        ctx.fillRect(px, py, 1, 1);
      } else {
        // Scatter particle drifting upward
        const scatterX = px + Math.round((dissolveOrder - 0.5) * 3 * scale);
        const scatterY = py - Math.round(dissolveOrder * 2 * scale);
        if (scatterX >= 0 && scatterX < tmpCanvas.width && scatterY >= 0) {
          ctx.globalAlpha = 0.15;
          ctx.fillStyle = "#95a5a6";
          ctx.fillRect(scatterX, scatterY, 1, 1);
        }
      }
    }
  }

  ctx.globalAlpha = 1;
  ctx.restore();
}

// ── Animation State Constants (Canvas 2D) ───────────────────

/**
 * Animation state definitions for the Canvas 2D renderer.
 * These mirror the sprite-sheet frame definitions in pixel-office/sprite-generator.ts
 * but work with the imperative drawAgentFrame / drawAgentSpawnFrame / drawAgentDespawnFrame API.
 */
export const CANVAS_ANIMATION_STATES = {
  idle: {
    frameCount: 2,
    frameDuration: 600,    // ms per frame
    draw: drawAgentFrame,
  },
  working: {
    frameCount: 2,
    frameDuration: 250,    // ms per frame (fast typing)
    draw: drawAgentFrame,
  },
  spawning: {
    frameCount: 4,
    frameDuration: 120,    // ms per phase
    draw: drawAgentSpawnFrame,
  },
  despawning: {
    frameCount: 2,
    frameDuration: 200,    // ms per phase
    draw: drawAgentDespawnFrame,
  },
} as const;

export type CanvasAnimationState = keyof typeof CANVAS_ANIMATION_STATES;

// ── Spawn/Despawn Particles ─────────────────────────────────

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
  size: number;
}

export function createSpawnParticles(x: number, y: number, status: AgentStatus): Particle[] {
  const color = STATUS_COLORS[status];
  const rng = seededRandom(Date.now());
  const particles: Particle[] = [];

  for (let i = 0; i < 8; i++) {
    particles.push({
      x,
      y,
      vx: (rng() - 0.5) * 3,
      vy: -rng() * 2 - 1,
      life: 1,
      maxLife: 1,
      color,
      size: 2 + rng() * 2,
    });
  }

  return particles;
}

export function createDespawnParticles(x: number, y: number): Particle[] {
  const rng = seededRandom(Date.now());
  const particles: Particle[] = [];

  for (let i = 0; i < 12; i++) {
    particles.push({
      x,
      y,
      vx: (rng() - 0.5) * 4,
      vy: (rng() - 0.5) * 4,
      life: 1,
      maxLife: 1,
      color: "#95a5a6",
      size: 1 + rng() * 3,
    });
  }

  return particles;
}

export function updateParticle(p: Particle, dt: number): boolean {
  p.x += p.vx * dt * 60;
  p.y += p.vy * dt * 60;
  p.vy += 0.05 * dt * 60; // gravity
  p.life -= dt * 2;
  return p.life > 0;
}

export function drawParticle(ctx: CanvasRenderingContext2D, p: Particle): void {
  ctx.globalAlpha = Math.max(0, p.life);
  ctx.fillStyle = p.color;
  ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
  ctx.globalAlpha = 1;
}

// ── Aliased exports for pixel-office integration ────────────

/** Draw an agent character at a position (alias for drawAgentFrame) */
export const drawAgentCharacter = drawAgentFrame;

/** Draw a status indicator dot above agent (alias for drawStatusBubble) */
export const drawStatusIndicator = drawStatusBubble;

/** Draw agent name tag with optional sub-agent badge */
export function drawAgentNameTag(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  name: string,
  status: AgentStatus,
  isSubAgent: boolean = false,
): void {
  drawNameTag(ctx, x, y, name, status);

  // Sub-agent indicator badge
  if (isSubAgent) {
    ctx.save();
    ctx.font = "bold 8px monospace";
    const badgeText = "SUB";
    const bw = ctx.measureText(badgeText).width + 6;
    const bx = x - bw / 2;
    const by = y + 10;

    ctx.fillStyle = "rgba(155, 89, 182, 0.2)";
    ctx.beginPath();
    ctx.roundRect(bx, by, bw, 11, 2);
    ctx.fill();

    ctx.strokeStyle = "#9b59b6";
    ctx.lineWidth = 0.5;
    ctx.stroke();

    ctx.fillStyle = "#9b59b6";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(badgeText, x, by + 5.5);
    ctx.restore();
  }
}

// ── Task Bubble ─────────────────────────────────────────────

export function drawTaskBubble(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  task: string,
  frame: number,
): void {
  if (!task) return;

  ctx.save();

  const floatY = Math.sin(frame * 0.1) * 1.5;
  const maxLen = 20;
  const displayTask = task.length > maxLen ? task.slice(0, maxLen - 1) + "\u2026" : task;

  ctx.font = "9px monospace";
  const metrics = ctx.measureText(displayTask);
  const textWidth = metrics.width;
  const padding = 6;
  const bubbleWidth = textWidth + padding * 2;
  const bubbleHeight = 16;

  const bx = x - bubbleWidth / 2;
  const by = y + floatY - bubbleHeight;

  // Bubble background
  ctx.fillStyle = "rgba(44, 62, 80, 0.85)";
  ctx.beginPath();
  ctx.roundRect(bx, by, bubbleWidth, bubbleHeight, 4);
  ctx.fill();

  // Bubble tail
  ctx.beginPath();
  ctx.moveTo(x - 3, by + bubbleHeight);
  ctx.lineTo(x, by + bubbleHeight + 4);
  ctx.lineTo(x + 3, by + bubbleHeight);
  ctx.fill();

  // Text
  ctx.fillStyle = "#ecf0f1";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(displayTask, x, by + bubbleHeight / 2);

  ctx.restore();
}
