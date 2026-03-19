/**
 * AgentSprite — PixiJS-powered sprite for a single agent in the pixel office.
 *
 * Manages:
 * - Texture generation from agent seed (10-frame sprite sheet)
 * - Animation state machine (idle / working / spawning / despawning)
 * - Spawn (pop-in) and despawn (fade-out) transitions
 * - Position, scale, and alpha tweening
 *
 * Sprite sheet layout (10 frames, each 16×24 px × DISPLAY_SCALE):
 * [idle0][idle1][work0][work1][spawn0][spawn1][spawn2][spawn3][despawn0][despawn1]
 */

import {
  Container,
  Sprite,
  Texture,
  Graphics,
  Text,
  TextStyle,
  Rectangle,
} from "pixi.js";
import {
  generateSpriteSheet,
  SPRITE_W,
  SPRITE_H,
  TOTAL_FRAMES,
  FRAME_COUNTS,
  FRAME_OFFSETS,
  ANIMATION_TIMING,
  type AnimationState,
  type CharacterTraits,
} from "./sprite-generator";
import type { AgentStatus } from "../types/events";

// ── Constants ───────────────────────────────────────────────

const DISPLAY_SCALE = 3; // Each pixel becomes 3×3 on screen
const SPAWN_DURATION = 480; // ms — matches 4 spawn frames at 120ms each
const DESPAWN_DURATION = 400; // ms — matches 2 despawn frames at 200ms each
const NAME_STYLE = new TextStyle({
  fontFamily: "monospace",
  fontSize: 10,
  fill: "#FFFFFF",
  stroke: { color: "#000000", width: 2 },
  align: "center",
});

const STATUS_COLORS: Record<AgentStatus, number> = {
  idle: 0x4caf50,    // green
  busy: 0xff9800,    // orange
  error: 0xf44336,   // red
  offline: 0x9e9e9e, // gray
  starting: 0x2196f3, // blue
};

// ── Types ───────────────────────────────────────────────────

export type SpritePhase = "spawning" | "active" | "despawning" | "removed";

export interface AgentSpriteOptions {
  id: string;
  name: string;
  status: AgentStatus;
  x?: number;
  y?: number;
}

// ── Texture Cache ───────────────────────────────────────────

const textureCache = new Map<string, {
  textures: Texture[];
  traits: CharacterTraits;
}>();

function getOrCreateTextures(seed: string): {
  textures: Texture[];
  traits: CharacterTraits;
} {
  const cached = textureCache.get(seed);
  if (cached) return cached;

  const { canvas, traits } = generateSpriteSheet(seed, DISPLAY_SCALE);

  const frameW = SPRITE_W * DISPLAY_SCALE;
  const frameH = SPRITE_H * DISPLAY_SCALE;
  const textures: Texture[] = [];

  // Create a regular canvas from OffscreenCanvas for PixiJS compatibility
  const regularCanvas = document.createElement("canvas");
  regularCanvas.width = canvas.width;
  regularCanvas.height = canvas.height;
  const rctx = regularCanvas.getContext("2d")!;
  rctx.drawImage(canvas, 0, 0);

  // Create base texture from the full sheet
  const baseTexture = Texture.from(regularCanvas);

  for (let i = 0; i < TOTAL_FRAMES; i++) {
    const frame = new Texture({
      source: baseTexture.source,
      frame: new Rectangle(i * frameW, 0, frameW, frameH),
    });
    textures.push(frame);
  }

  const entry = { textures, traits };
  textureCache.set(seed, entry);
  return entry;
}

// ── AgentSprite Class ───────────────────────────────────────

export class AgentSprite {
  readonly id: string;
  readonly name: string;
  readonly container: Container;
  readonly traits: CharacterTraits;

  private sprite: Sprite;
  private nameLabel: Text;
  private statusDot: Graphics;
  private shadow: Graphics;

  private _status: AgentStatus;
  private _animState: AnimationState = "idle";
  private _phase: SpritePhase = "spawning";
  private _frameIndex = 0;
  private _animTimer = 0;
  private _phaseTimer = 0;

  // Target position for smooth movement
  private _targetX: number;
  private _targetY: number;
  private _moveSpeed = 1.5; // pixels per tick

  private textures: Texture[];

  constructor(options: AgentSpriteOptions) {
    this.id = options.id;
    this.name = options.name;
    this._status = options.status;
    this._targetX = options.x ?? 0;
    this._targetY = options.y ?? 0;

    const { textures, traits } = getOrCreateTextures(this.id);
    this.textures = textures;
    this.traits = traits;

    // Main container
    this.container = new Container();
    this.container.x = this._targetX;
    this.container.y = this._targetY;
    this.container.cursor = "pointer";
    this.container.eventMode = "static";

    // Shadow
    this.shadow = new Graphics();
    this.shadow.ellipse(
      (SPRITE_W * DISPLAY_SCALE) / 2,
      SPRITE_H * DISPLAY_SCALE - 2,
      12, 4
    );
    this.shadow.fill({ color: 0x000000, alpha: 0.25 });
    this.container.addChild(this.shadow);

    // Character sprite
    this.sprite = new Sprite(this.textures[FRAME_OFFSETS.spawning]); // Start with first spawn frame
    this.sprite.anchor.set(0, 0);
    this.container.addChild(this.sprite);

    // Name label
    this.nameLabel = new Text({
      text: this.truncateName(this.name),
      style: NAME_STYLE,
    });
    this.nameLabel.anchor.set(0.5, 0);
    this.nameLabel.x = (SPRITE_W * DISPLAY_SCALE) / 2;
    this.nameLabel.y = SPRITE_H * DISPLAY_SCALE + 2;
    this.container.addChild(this.nameLabel);

    // Status indicator dot
    this.statusDot = new Graphics();
    this.updateStatusDot();
    this.container.addChild(this.statusDot);

    // Initialize spawn animation — start with sprite-sheet spawning frames
    this.container.alpha = 0;
    this.container.scale.set(0.5);
    this._phase = "spawning";
    this._animState = "spawning";
    this._phaseTimer = 0;
    this._frameIndex = 0;
    this._animTimer = 0;
  }

  // ── Public API ──────────────────────────────────────────

  get status(): AgentStatus { return this._status; }
  get phase(): SpritePhase { return this._phase; }
  get animState(): AnimationState { return this._animState; }

  /**
   * Update agent status — changes animation state and status dot.
   */
  setStatus(status: AgentStatus) {
    if (status === this._status) return;
    this._status = status;
    // Only change animation if we're in active phase
    if (this._phase === "active") {
      this.setAnimationFromStatus(status);
    }
    this.updateStatusDot();
  }

  /**
   * Move agent to a new position (smooth interpolation).
   */
  moveTo(x: number, y: number) {
    this._targetX = x;
    this._targetY = y;
  }

  /**
   * Start despawn animation using sprite-sheet despawn frames.
   * After completion, `phase` becomes "removed".
   */
  despawn() {
    if (this._phase === "despawning" || this._phase === "removed") return;
    this._phase = "despawning";
    this._animState = "despawning";
    this._frameIndex = 0;
    this._animTimer = 0;
    this._phaseTimer = 0;
  }

  /**
   * Main update loop — call every frame (60fps target).
   * @param deltaMs milliseconds since last frame
   */
  update(deltaMs: number) {
    this.updatePhase(deltaMs);
    if (this._phase === "removed") return;

    this.updateMovement(deltaMs);
    this.updateAnimation(deltaMs);
  }

  /**
   * Clean up resources.
   */
  destroy() {
    this.container.destroy({ children: true });
  }

  /**
   * Get display dimensions.
   */
  get displayWidth() { return SPRITE_W * DISPLAY_SCALE; }
  get displayHeight() { return SPRITE_H * DISPLAY_SCALE; }

  // ── Private ─────────────────────────────────────────────

  private truncateName(name: string): string {
    return name.length > 10 ? name.slice(0, 9) + "…" : name;
  }

  private setAnimationFromStatus(status: AgentStatus) {
    const newState: AnimationState = status === "busy" ? "working" : "idle";
    if (newState === this._animState) return;
    this._animState = newState;
    this._frameIndex = 0;
    this._animTimer = 0;
  }

  private updateStatusDot() {
    this.statusDot.clear();
    this.statusDot.circle(SPRITE_W * DISPLAY_SCALE - 2, 4, 3);
    this.statusDot.fill(STATUS_COLORS[this._status] ?? 0x9e9e9e);
    this.statusDot.stroke({ color: 0x000000, width: 1 });
  }

  private updateAnimation(deltaMs: number) {
    const timing = ANIMATION_TIMING[this._animState];
    // Convert timing (seconds per frame) to timer increment
    this._animTimer += deltaMs / 1000;

    const frameCount = FRAME_COUNTS[this._animState];
    if (this._animTimer >= timing) {
      this._animTimer -= timing;

      if (this._animState === "spawning") {
        // Spawn plays once (no loop), advances until last frame
        if (this._frameIndex < frameCount - 1) {
          this._frameIndex++;
        }
      } else if (this._animState === "despawning") {
        // Despawn plays once, then marks as removed
        if (this._frameIndex < frameCount - 1) {
          this._frameIndex++;
        }
      } else {
        // Idle and working loop
        this._frameIndex = (this._frameIndex + 1) % frameCount;
      }
    }

    const frameOffset = FRAME_OFFSETS[this._animState];
    const frameIdx = frameOffset + this._frameIndex;
    if (frameIdx < this.textures.length) {
      this.sprite.texture = this.textures[frameIdx];
    }
  }

  private updatePhase(deltaMs: number) {
    this._phaseTimer += deltaMs;

    switch (this._phase) {
      case "spawning": {
        const t = Math.min(this._phaseTimer / SPAWN_DURATION, 1);
        // Elastic ease-out for scale
        const ease = t === 1 ? 1 : 1 - Math.pow(2, -10 * t) * Math.cos((t * 10 - 0.75) * (2 * Math.PI / 3));
        this.container.alpha = Math.min(t * 2.5, 1);
        this.container.scale.set(0.5 + ease * 0.5);

        if (t >= 1) {
          this._phase = "active";
          this.container.alpha = 1;
          this.container.scale.set(1);
          // Transition to status-based animation
          this.setAnimationFromStatus(this._status);
        }
        break;
      }
      case "despawning": {
        const t = Math.min(this._phaseTimer / DESPAWN_DURATION, 1);
        this.container.alpha = 1 - t;
        this.container.scale.set(1 - t * 0.3);
        // Slight upward drift
        this.container.y -= deltaMs * 0.015;

        if (t >= 1) {
          this._phase = "removed";
          this.container.visible = false;
        }
        break;
      }
      // "active" and "removed" don't need phase updates
    }
  }

  private updateMovement(deltaMs: number) {
    const dx = this._targetX - this.container.x;
    const dy = this._targetY - this.container.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < 1) {
      this.container.x = this._targetX;
      this.container.y = this._targetY;
      return;
    }

    const speed = this._moveSpeed * (deltaMs / 16.67);
    const moveX = (dx / dist) * Math.min(speed, dist);
    const moveY = (dy / dist) * Math.min(speed, dist);
    this.container.x += moveX;
    this.container.y += moveY;

    // Flip sprite based on movement direction
    if (Math.abs(dx) > 0.5) {
      this.sprite.scale.x = dx < 0 ? -1 : 1;
      if (dx < 0) {
        this.sprite.x = SPRITE_W * DISPLAY_SCALE;
      } else {
        this.sprite.x = 0;
      }
    }
  }
}

// ── Utility: Clear texture cache ────────────────────────────

export function clearSpriteCache() {
  for (const { textures } of textureCache.values()) {
    for (const t of textures) t.destroy(true);
  }
  textureCache.clear();
}
