/**
 * Programmatic pixel-art sprite generator for agent characters.
 *
 * Generates unique character sprites from a seed (agent ID/name) using
 * deterministic color palettes and body part variations.
 * All sprites are generated on an OffscreenCanvas — no external assets needed.
 *
 * Sprite sheet layout (10 frames, each 16×24 pixels):
 * [idle0][idle1][working0][working1][spawn0][spawn1][spawn2][spawn3][despawn0][despawn1]
 *
 * Animation states:
 *   idle      – 2 frames, subtle breathing bob
 *   working   – 2 frames, arms raised typing
 *   spawning  – 4 frames, materialization sequence (pixels coalesce)
 *   despawning– 2 frames, dissolve / fade-out
 */

// ── Color Palettes ──────────────────────────────────────────

const SKIN_COLORS = [
  "#FFDCB1", "#E8B88A", "#D4956B", "#B87246", "#8D5524",
  "#FFE0BD", "#F1C27D", "#C68642", "#8D5524", "#6B3A1F",
];

const HAIR_COLORS = [
  "#2C1B0E", "#4A3520", "#8B6914", "#C19A6B", "#E6BE8A",
  "#D32F2F", "#FF6F00", "#424242", "#F5F5DC", "#1B5E20",
  "#283593", "#6A1B9A",
];

const SHIRT_COLORS = [
  "#1976D2", "#388E3C", "#D32F2F", "#7B1FA2", "#F57C00",
  "#00796B", "#5D4037", "#455A64", "#C2185B", "#1565C0",
  "#2E7D32", "#E64A19", "#AD1457", "#00838F",
];

const PANTS_COLORS = [
  "#1A237E", "#263238", "#3E2723", "#212121", "#004D40",
  "#1B3A4B", "#37474F", "#4E342E",
];

// ── Deterministic Hash ──────────────────────────────────────

function hashString(str: string): number {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) >>> 0;
  }
  return hash;
}

function pickFromHash(hash: number, arr: readonly string[], offset = 0): string {
  return arr[((hash >>> offset) + offset) % arr.length];
}

// ── Character Traits ────────────────────────────────────────

export interface CharacterTraits {
  skinColor: string;
  hairColor: string;
  hairStyle: number; // 0-4
  shirtColor: string;
  pantsColor: string;
  hasGlasses: boolean;
  hasBow: boolean;
  eyeStyle: number; // 0-2
}

export function traitsFromSeed(seed: string): CharacterTraits {
  const h = hashString(seed);
  return {
    skinColor: pickFromHash(h, SKIN_COLORS, 0),
    hairColor: pickFromHash(h, HAIR_COLORS, 3),
    hairStyle: ((h >>> 6) % 5),
    shirtColor: pickFromHash(h, SHIRT_COLORS, 9),
    pantsColor: pickFromHash(h, PANTS_COLORS, 12),
    hasGlasses: (h >>> 15) % 5 === 0,
    hasBow: (h >>> 17) % 6 === 0,
    eyeStyle: (h >>> 19) % 3,
  };
}

// ── Sprite Pixel Rendering ──────────────────────────────────

/** Size of one "pixel" in the sprite (for scaling) */
const PX = 1;
/** Sprite dimensions in logical pixels */
export const SPRITE_W = 16;
export const SPRITE_H = 24;

function setPixel(
  ctx: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D,
  x: number,
  y: number,
  color: string
) {
  ctx.fillStyle = color;
  ctx.fillRect(x * PX, y * PX, PX, PX);
}

function darken(hex: string, amount = 0.2): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const f = 1 - amount;
  return `rgb(${Math.floor(r * f)},${Math.floor(g * f)},${Math.floor(b * f)})`;
}

function lighten(hex: string, amount = 0.3): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const f = amount;
  return `rgb(${Math.floor(r + (255 - r) * f)},${Math.floor(g + (255 - g) * f)},${Math.floor(b + (255 - b) * f)})`;
}

/**
 * Deterministic seeded pseudo-random for spawn particle pixel placement.
 * Given a seed returns a function that yields 0..1 on each call.
 */
function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 16807 + 0) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

// ── Character Drawing Core (shared by idle, working) ────────

/**
 * Draw the full character body (used by idle and working frames).
 * This is extracted so spawn/despawn can selectively mask pixels.
 */
function drawCharacterBody(
  ctx: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D,
  traits: CharacterTraits,
  bobY: number,
  isWorking: boolean,
  workingArmBob: number,
  isWalking: boolean,
  walkDir: number,
  showSmile: boolean,
) {
  const {
    skinColor, hairColor, hairStyle,
    shirtColor, pantsColor, hasGlasses, hasBow, eyeStyle,
  } = traits;

  const skinDark = darken(skinColor, 0.15);
  const shirtDark = darken(shirtColor, 0.2);
  const shirtLight = lighten(shirtColor, 0.2);
  const pantsDark = darken(pantsColor, 0.2);
  const hairDark = darken(hairColor, 0.2);

  // ── HAIR (back layer for some styles) ───────────
  if (hairStyle === 2 || hairStyle === 4) {
    for (let y = 4; y <= 12 + bobY; y++) {
      setPixel(ctx, 4, y + bobY + 3, hairDark);
      setPixel(ctx, 11, y + bobY + 3, hairDark);
    }
  }

  // ── LEGS ────────────────────────────────────────
  const legY = 19 + bobY;
  if (isWalking) {
    const stepOffset = walkDir;
    setPixel(ctx, 6 + stepOffset, legY, pantsColor);
    setPixel(ctx, 6 + stepOffset, legY + 1, pantsColor);
    setPixel(ctx, 6 + stepOffset, legY + 2, pantsDark);
    setPixel(ctx, 6 + stepOffset, legY + 3, "#3E2723");
    setPixel(ctx, 9 - stepOffset, legY, pantsColor);
    setPixel(ctx, 9 - stepOffset, legY + 1, pantsColor);
    setPixel(ctx, 9 - stepOffset, legY + 2, pantsDark);
    setPixel(ctx, 9 - stepOffset, legY + 3, "#3E2723");
  } else {
    for (const lx of [6, 9]) {
      setPixel(ctx, lx, legY, pantsColor);
      setPixel(ctx, lx, legY + 1, pantsColor);
      setPixel(ctx, lx, legY + 2, pantsDark);
      setPixel(ctx, lx, legY + 3, "#3E2723");
    }
    setPixel(ctx, 7, legY, pantsColor);
    setPixel(ctx, 8, legY, pantsColor);
  }

  // ── BODY / SHIRT ────────────────────────────────
  const bodyY = 13 + bobY;
  for (let y = bodyY; y < bodyY + 6; y++) {
    for (let x = 5; x <= 10; x++) {
      const c = x <= 6 ? shirtDark : x >= 10 ? shirtDark : (y === bodyY ? shirtLight : shirtColor);
      setPixel(ctx, x, y, c);
    }
  }
  setPixel(ctx, 7, bodyY, shirtLight);
  setPixel(ctx, 8, bodyY, shirtLight);

  // ── ARMS ────────────────────────────────────────
  const armY = 14 + bobY;
  if (isWorking) {
    const ab = workingArmBob;
    setPixel(ctx, 4, armY + ab, shirtColor);
    setPixel(ctx, 3, armY - 1 + ab, skinColor);
    setPixel(ctx, 11, armY + ab, shirtColor);
    setPixel(ctx, 12, armY - 1 + ab, skinColor);
  } else {
    for (let ay = 0; ay < 4; ay++) {
      const armColor = ay < 2 ? shirtColor : skinColor;
      setPixel(ctx, 4, armY + ay, armColor);
      setPixel(ctx, 11, armY + ay, armColor);
    }
    if (isWalking) {
      const swingDir = walkDir;
      setPixel(ctx, 4, armY + 3 + swingDir, skinColor);
      setPixel(ctx, 11, armY + 3 - swingDir, skinColor);
    }
  }

  // ── HEAD ────────────────────────────────────────
  const headY = 5 + bobY;
  for (let y = headY; y < headY + 7; y++) {
    for (let x = 5; x <= 10; x++) {
      if ((y === headY || y === headY + 6) && (x === 5 || x === 10)) continue;
      const c = (x === 5 || x === 10) ? skinDark : skinColor;
      setPixel(ctx, x, y, c);
    }
  }
  setPixel(ctx, 7, headY + 7, skinColor);
  setPixel(ctx, 8, headY + 7, skinColor);

  // ── EYES ────────────────────────────────────────
  const eyeY = headY + 3;
  if (eyeStyle === 0) {
    setPixel(ctx, 6, eyeY, "#1A1A1A");
    setPixel(ctx, 9, eyeY, "#1A1A1A");
  } else if (eyeStyle === 1) {
    setPixel(ctx, 6, eyeY, "#FFFFFF");
    setPixel(ctx, 6, eyeY + 1, "#1A1A1A");
    setPixel(ctx, 9, eyeY, "#FFFFFF");
    setPixel(ctx, 9, eyeY + 1, "#1A1A1A");
  } else {
    setPixel(ctx, 6, eyeY, "#1A1A1A");
    setPixel(ctx, 7, eyeY, "#1A1A1A");
    setPixel(ctx, 9, eyeY, "#1A1A1A");
    setPixel(ctx, 8, eyeY, "#1A1A1A");
  }

  // Mouth
  const mouthY = eyeY + 2;
  if (showSmile) {
    setPixel(ctx, 7, mouthY, "#C0392B");
    setPixel(ctx, 8, mouthY, "#C0392B");
  } else if (isWorking) {
    setPixel(ctx, 7, mouthY, "#8D6E63");
    setPixel(ctx, 8, mouthY, "#8D6E63");
  } else {
    setPixel(ctx, 7, mouthY, skinDark);
    setPixel(ctx, 8, mouthY, skinDark);
  }

  // ── HAIR ────────────────────────────────────────
  const hairY = headY - 1;
  switch (hairStyle) {
    case 0:
      for (let x = 5; x <= 10; x++) setPixel(ctx, x, hairY, hairColor);
      for (let x = 5; x <= 10; x++) setPixel(ctx, x, hairY + 1, hairColor);
      setPixel(ctx, 5, hairY + 2, hairColor);
      setPixel(ctx, 10, hairY + 2, hairColor);
      break;
    case 1:
      for (let x = 5; x <= 10; x++) setPixel(ctx, x, hairY, hairColor);
      for (let x = 5; x <= 10; x++) setPixel(ctx, x, hairY + 1, hairColor);
      setPixel(ctx, 6, hairY - 1, hairColor);
      setPixel(ctx, 8, hairY - 1, hairColor);
      setPixel(ctx, 10, hairY - 1, hairColor);
      break;
    case 2:
      for (let x = 4; x <= 11; x++) setPixel(ctx, x, hairY, hairColor);
      for (let x = 5; x <= 10; x++) setPixel(ctx, x, hairY + 1, hairColor);
      for (let y = hairY + 2; y < hairY + 8; y++) {
        setPixel(ctx, 4, y, hairColor);
        setPixel(ctx, 11, y, hairColor);
      }
      break;
    case 3:
      for (let x = 5; x <= 10; x++) setPixel(ctx, x, hairY + 1, hairDark);
      break;
    case 4:
      for (let x = 4; x <= 11; x++) setPixel(ctx, x, hairY - 1, hairColor);
      for (let x = 4; x <= 11; x++) setPixel(ctx, x, hairY, hairColor);
      for (let x = 5; x <= 10; x++) setPixel(ctx, x, hairY + 1, hairColor);
      setPixel(ctx, 4, hairY + 1, hairColor);
      setPixel(ctx, 11, hairY + 1, hairColor);
      setPixel(ctx, 4, hairY + 2, hairColor);
      setPixel(ctx, 11, hairY + 2, hairColor);
      break;
  }

  // ── ACCESSORIES ─────────────────────────────────
  if (hasGlasses) {
    setPixel(ctx, 5, eyeY, "#424242");
    setPixel(ctx, 6, eyeY - 1, "#424242");
    setPixel(ctx, 7, eyeY - 1, "#424242");
    setPixel(ctx, 8, eyeY, "#424242");
    setPixel(ctx, 9, eyeY - 1, "#424242");
    setPixel(ctx, 10, eyeY - 1, "#424242");
  }

  if (hasBow) {
    const hairY2 = headY - 1;
    setPixel(ctx, 10, hairY2, "#E91E63");
    setPixel(ctx, 11, hairY2, "#E91E63");
    setPixel(ctx, 10, hairY2 + 1, "#E91E63");
  }
}

// ── Frame Drawing Functions ─────────────────────────────────

/**
 * Draw a single frame of the character sprite.
 *
 * Frame indices:
 *   0 = idle frame 0 (neutral stance)
 *   1 = idle frame 1 (subtle bob, slight smile)
 *   2 = working frame 0 (arms up, typing)
 *   3 = working frame 1 (arms up+bob, typing)
 *   4 = spawn frame 0 (25% materialized — scattered pixels)
 *   5 = spawn frame 1 (50% materialized — more pixels)
 *   6 = spawn frame 2 (75% materialized — nearly complete)
 *   7 = spawn frame 3 (100% materialized with glow outline)
 *   8 = despawn frame 0 (dissolving — scattered removal)
 *   9 = despawn frame 1 (nearly gone — few pixels remain)
 */
function drawCharacterFrame(
  ctx: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D,
  traits: CharacterTraits,
  frame: number
) {
  ctx.clearRect(0, 0, SPRITE_W * PX, SPRITE_H * PX);

  if (frame <= 1) {
    // ── IDLE frames ──
    const bobY = frame === 1 ? -1 : 0;
    const showSmile = frame === 1;
    drawCharacterBody(ctx, traits, bobY, false, 0, false, 0, showSmile);
  } else if (frame <= 3) {
    // ── WORKING frames ──
    const bobY = frame === 3 ? -1 : 0;
    const armBob = frame === 3 ? -1 : 0;
    drawCharacterBody(ctx, traits, bobY, true, armBob, false, 0, false);
  } else if (frame <= 7) {
    // ── SPAWN frames (4-7) ──
    // Draw full character to an offscreen buffer, then selectively copy pixels
    // based on a materialization mask that increases with each frame.
    drawSpawnFrame(ctx, traits, frame - 4);
  } else if (frame <= 9) {
    // ── DESPAWN frames (8-9) ──
    drawDespawnFrame(ctx, traits, frame - 8);
  }
}

/**
 * Spawn animation: character materializes from scattered pixels.
 * Phase 0 = 25%, 1 = 50%, 2 = 75%, 3 = 100% with glow.
 */
function drawSpawnFrame(
  ctx: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D,
  traits: CharacterTraits,
  phase: number, // 0-3
) {
  // Draw the full character to a temporary buffer
  const tmpCanvas = (typeof OffscreenCanvas !== "undefined")
    ? new OffscreenCanvas(SPRITE_W, SPRITE_H)
    : createFallbackCanvas(SPRITE_W, SPRITE_H);
  const tmpCtx = tmpCanvas.getContext("2d") as CanvasRenderingContext2D;
  tmpCtx.clearRect(0, 0, SPRITE_W, SPRITE_H);
  drawCharacterBody(tmpCtx, traits, 0, false, 0, false, 0, false);

  // Read pixel data from the temporary canvas
  const imageData = tmpCtx.getImageData(0, 0, SPRITE_W, SPRITE_H);
  const data = imageData.data;

  // Materialization threshold: which pixels appear at each phase
  const threshold = (phase + 1) / 4; // 0.25, 0.50, 0.75, 1.0
  const rng = seededRandom(hashString(traits.shirtColor + traits.hairColor));

  // Assign each non-transparent pixel a random "reveal order" value (0-1)
  // Pixels with revealOrder <= threshold are shown
  const glowColor = traits.shirtColor;

  for (let y = 0; y < SPRITE_H; y++) {
    for (let x = 0; x < SPRITE_W; x++) {
      const idx = (y * SPRITE_W + x) * 4;
      const a = data[idx + 3];
      if (a === 0) continue; // transparent pixel

      const revealOrder = rng();

      if (revealOrder <= threshold) {
        // Show this pixel
        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];
        ctx.fillStyle = `rgb(${r},${g},${b})`;
        ctx.fillRect(x, y, 1, 1);

        // Add sparkle/glow for recently materialized pixels (within 25% of threshold)
        if (phase < 3 && revealOrder > threshold - 0.25) {
          ctx.fillStyle = glowColor;
          ctx.globalAlpha = 0.4;
          // Small glow pixel offset
          const gx = x + (revealOrder > 0.5 ? 1 : -1);
          const gy = y + (revealOrder > 0.7 ? 1 : -1);
          if (gx >= 0 && gx < SPRITE_W && gy >= 0 && gy < SPRITE_H) {
            ctx.fillRect(gx, gy, 1, 1);
          }
          ctx.globalAlpha = 1;
        }
      } else if (phase >= 1) {
        // Show "ghost" outline for pixels not yet materialized (faint hint)
        ctx.fillStyle = glowColor;
        ctx.globalAlpha = 0.08 + phase * 0.04;
        ctx.fillRect(x, y, 1, 1);
        ctx.globalAlpha = 1;
      }
    }
  }

  // Phase 3 (fully materialized): add subtle glow outline
  if (phase === 3) {
    addGlowOutline(ctx, glowColor, 0.3);
  }
}

/**
 * Despawn animation: character dissolves into scattered pixels.
 * Phase 0 = 60% remaining, 1 = 20% remaining.
 */
function drawDespawnFrame(
  ctx: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D,
  traits: CharacterTraits,
  phase: number, // 0-1
) {
  // Draw full character to temporary buffer
  const tmpCanvas = (typeof OffscreenCanvas !== "undefined")
    ? new OffscreenCanvas(SPRITE_W, SPRITE_H)
    : createFallbackCanvas(SPRITE_W, SPRITE_H);
  const tmpCtx = tmpCanvas.getContext("2d") as CanvasRenderingContext2D;
  tmpCtx.clearRect(0, 0, SPRITE_W, SPRITE_H);
  drawCharacterBody(tmpCtx, traits, 0, false, 0, false, 0, false);

  const imageData = tmpCtx.getImageData(0, 0, SPRITE_W, SPRITE_H);
  const data = imageData.data;

  // Dissolve threshold: lower = more pixels removed
  const keepThreshold = phase === 0 ? 0.6 : 0.2;
  const rng = seededRandom(hashString(traits.pantsColor + traits.skinColor));
  const fadeColor = "#95a5a6"; // grey fade

  for (let y = 0; y < SPRITE_H; y++) {
    for (let x = 0; x < SPRITE_W; x++) {
      const idx = (y * SPRITE_W + x) * 4;
      const a = data[idx + 3];
      if (a === 0) continue;

      const dissolveOrder = rng();

      if (dissolveOrder <= keepThreshold) {
        // Keep this pixel, but with reduced alpha and slight color shift
        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];
        const fadeAmount = phase === 0 ? 0.1 : 0.35;
        const fr = Math.floor(r + (149 - r) * fadeAmount); // blend toward grey
        const fg = Math.floor(g + (165 - g) * fadeAmount);
        const fb = Math.floor(b + (166 - b) * fadeAmount);
        ctx.globalAlpha = phase === 0 ? 0.85 : 0.5;
        ctx.fillStyle = `rgb(${fr},${fg},${fb})`;
        ctx.fillRect(x, y, 1, 1);
        ctx.globalAlpha = 1;
      } else {
        // Pixel has dissolved — show faint scatter particle
        // Offset the "particle" slightly from original position (dissolving effect)
        const scatterX = x + Math.round((dissolveOrder - 0.5) * 3);
        const scatterY = y - Math.round(dissolveOrder * 2); // drift upward
        if (scatterX >= 0 && scatterX < SPRITE_W && scatterY >= 0 && scatterY < SPRITE_H) {
          ctx.globalAlpha = 0.15 + (1 - dissolveOrder) * 0.2;
          ctx.fillStyle = fadeColor;
          ctx.fillRect(scatterX, scatterY, 1, 1);
          ctx.globalAlpha = 1;
        }
      }
    }
  }
}

/**
 * Add a subtle glow outline around non-transparent pixels.
 */
function addGlowOutline(
  ctx: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D,
  color: string,
  alpha: number,
) {
  // Read current canvas state
  const imageData = ctx.getImageData(0, 0, SPRITE_W, SPRITE_H);
  const data = imageData.data;

  const glowPixels: [number, number][] = [];

  for (let y = 0; y < SPRITE_H; y++) {
    for (let x = 0; x < SPRITE_W; x++) {
      const idx = (y * SPRITE_W + x) * 4;
      if (data[idx + 3] > 0) continue; // skip existing pixels

      // Check if any neighbor has content
      let hasNeighbor = false;
      for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || nx >= SPRITE_W || ny < 0 || ny >= SPRITE_H) continue;
        const nIdx = (ny * SPRITE_W + nx) * 4;
        if (data[nIdx + 3] > 0) {
          hasNeighbor = true;
          break;
        }
      }
      if (hasNeighbor) {
        glowPixels.push([x, y]);
      }
    }
  }

  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  for (const [gx, gy] of glowPixels) {
    ctx.fillRect(gx, gy, 1, 1);
  }
  ctx.globalAlpha = 1;
}

/** Fallback canvas for SSR/environments without OffscreenCanvas */
function createFallbackCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

// ── Animation Frame Definitions ─────────────────────────────

/** Frame count per animation state */
export const FRAME_COUNTS = {
  idle: 2,       // frames 0-1
  working: 2,    // frames 2-3
  spawning: 4,   // frames 4-7
  despawning: 2, // frames 8-9
} as const;

/** Starting frame index for each animation state in the sprite sheet */
export const FRAME_OFFSETS = {
  idle: 0,
  working: 2,
  spawning: 4,
  despawning: 8,
} as const;

/** Animation timing (seconds per frame) for each state */
export const ANIMATION_TIMING = {
  idle: 0.6,        // Slow, relaxed breathing
  working: 0.25,    // Fast typing rhythm
  spawning: 0.12,   // Quick materialization
  despawning: 0.2,  // Medium dissolve speed
} as const;

export type AnimationState = keyof typeof FRAME_COUNTS;

/** Total frames across all animation states */
export const TOTAL_FRAMES = Object.values(FRAME_COUNTS).reduce((a, b) => a + b, 0); // 10

/**
 * Get the frame index range for a given animation state.
 * Returns [startIndex, frameCount].
 */
export function getFrameRange(state: AnimationState): [number, number] {
  return [FRAME_OFFSETS[state], FRAME_COUNTS[state]];
}

/**
 * Get the absolute frame index for a given animation state and local frame.
 */
export function getAbsoluteFrame(state: AnimationState, localFrame: number): number {
  return FRAME_OFFSETS[state] + (localFrame % FRAME_COUNTS[state]);
}

// ── Sprite Sheet Generation ─────────────────────────────────

/**
 * Generate a sprite sheet with all animation frames for a character.
 * Returns an OffscreenCanvas that can be used as a PixiJS texture source.
 *
 * Layout: 10 frames side-by-side horizontally
 * [idle0][idle1][work0][work1][spawn0][spawn1][spawn2][spawn3][despawn0][despawn1]
 */
export function generateSpriteSheet(
  seed: string,
  scale = 1
): { canvas: OffscreenCanvas; traits: CharacterTraits } {
  const traits = traitsFromSeed(seed);
  const w = SPRITE_W * TOTAL_FRAMES * scale;
  const h = SPRITE_H * scale;

  const canvas = new OffscreenCanvas(w, h);
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;

  if (scale > 1) {
    ctx.scale(scale, scale);
  }

  for (let frame = 0; frame < TOTAL_FRAMES; frame++) {
    ctx.save();
    ctx.translate(frame * SPRITE_W, 0);
    drawCharacterFrame(ctx, traits, frame);
    ctx.restore();
  }

  return { canvas, traits };
}

/**
 * Generate a single frame as a canvas (for previews / thumbnails).
 */
export function generateSingleFrame(
  seed: string,
  frame = 0,
  scale = 3
): OffscreenCanvas {
  const traits = traitsFromSeed(seed);
  const w = SPRITE_W * scale;
  const h = SPRITE_H * scale;

  const canvas = new OffscreenCanvas(w, h);
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;
  ctx.scale(scale, scale);
  drawCharacterFrame(ctx, traits, frame);
  return canvas;
}

/**
 * Generate a sprite frame and return as data URL (for use in React <img>).
 */
export function generateSpriteDataUrl(
  seed: string,
  frame = 0,
  scale = 3
): string {
  if (typeof document === "undefined") return "";

  const traits = traitsFromSeed(seed);
  const w = SPRITE_W * scale;
  const h = SPRITE_H * scale;

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;
  ctx.scale(scale, scale);
  drawCharacterFrame(ctx, traits, frame);
  return canvas.toDataURL("image/png");
}

/**
 * Generate a preview strip showing one frame from each animation state.
 * Useful for debugging / UI preview components.
 */
export function generatePreviewStrip(
  seed: string,
  scale = 3
): string {
  if (typeof document === "undefined") return "";

  const traits = traitsFromSeed(seed);
  const states: AnimationState[] = ["idle", "working", "spawning", "despawning"];
  const w = SPRITE_W * states.length * scale;
  const h = SPRITE_H * scale;

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;
  ctx.scale(scale, scale);

  states.forEach((state, i) => {
    ctx.save();
    ctx.translate(i * SPRITE_W, 0);
    // Pick a representative frame for each state
    const representativeFrame = state === "spawning" ? 2 : 0;
    const absoluteFrame = getAbsoluteFrame(state, representativeFrame);
    drawCharacterFrame(ctx, traits, absoluteFrame);
    ctx.restore();
  });

  return canvas.toDataURL("image/png");
}
