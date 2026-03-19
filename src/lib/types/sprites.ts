/**
 * Sprite lifecycle types for the pixel-art office visualization.
 *
 * These types bridge the gap between raw OpenClaw agent data (AgentInfo / SubAgentInfo)
 * and the PixiJS sprite rendering layer. They provide:
 *   - Unified agent representation (main agents + sub-agents in one list)
 *   - Lifecycle phases (spawning → active → despawning → gone)
 *   - Animation state derived from agent status
 *   - Position tracking for the office grid
 *   - Transition metadata so sprites can animate smoothly between states
 */

import type { AgentStatus } from "./events";

// ── Sprite Lifecycle ──────────────────────────────────────────

/**
 * Lifecycle phase of a sprite in the office scene.
 *
 * - `spawning`:   Agent just appeared — play spawn-in animation
 * - `active`:     Agent is present and may change animation based on status
 * - `despawning`: Agent was removed from API data — play fade-out / walk-off
 * - `gone`:       Sprite can be safely removed from the scene
 */
export type SpriteLifecycle = "spawning" | "active" | "despawning" | "gone";

/**
 * Animation state that drives which sprite sheet frame / animation to play.
 * Maps 1:1 to the sprite sheet layout defined in sprite-generator.ts:
 *
 * Sprite sheet: [idle0][idle1][work0][work1][spawn0][spawn1][spawn2][spawn3][despawn0][despawn1]
 *
 * The four primary states (idle, working, spawning, despawning) have dedicated
 * sprite sheet frames. Additional visual states (error, walking, sleeping, etc.)
 * are implemented as overlays/modifiers on top of the base animation states.
 */
export type SpriteAnimation =
  | "idle"           // Standing still, small idle loop (frames 0-1)
  | "working"        // Typing at desk / processing (frames 2-3)
  | "spawning"       // Materializing pixel by pixel (frames 4-7)
  | "despawning"     // Dissolving away (frames 8-9)
  | "walking"        // Moving between positions (uses idle frames + position lerp)
  | "error"          // Flashing red / error indicator (uses idle frames + red overlay)
  | "sleeping"       // ZZZ - offline agent (uses idle frame 0, static)
  | "celebrating";   // Task completed flourish (uses idle frames + particles)

// ── Sprite Data ───────────────────────────────────────────────

/**
 * Position within the pixel-art office grid.
 * Coordinates are in grid cells, not pixels — the renderer
 * converts to pixel coordinates based on cell size.
 */
export interface SpritePosition {
  /** Grid column (0-based) */
  x: number;
  /** Grid row (0-based) */
  y: number;
}

/**
 * A single sprite entity representing an agent or sub-agent
 * in the pixel-art office visualization.
 */
export interface SpriteAgent {
  /** Unique identifier (matches AgentInfo.id or SubAgentInfo.id) */
  id: string;
  /** Display name */
  name: string;
  /** Whether this is a sub-agent (spawned by another agent) */
  isSubAgent: boolean;
  /** Parent agent ID if this is a sub-agent */
  parentId?: string;
  /** Normalized agent status from the API */
  agentStatus: AgentStatus;
  /** Current lifecycle phase */
  lifecycle: SpriteLifecycle;
  /** Current animation to play */
  animation: SpriteAnimation;
  /** Previous animation (for transition blending) */
  previousAnimation?: SpriteAnimation;
  /** Grid position in the office */
  position: SpritePosition;
  /** Current task description (shown in tooltip / speech bubble) */
  currentTask?: string;
  /** Timestamp when this sprite was first seen */
  spawnedAt: number;
  /** Timestamp of last status update */
  lastUpdated: number;
  /** Timestamp when despawn started (for animation timing) */
  despawnStartedAt?: number;
  /** Duration in ms that the current lifecycle phase has been active */
  phaseAge: number;
  /** Arbitrary color seed for deterministic sprite coloring */
  colorSeed: number;
}

// ── State Transition ──────────────────────────────────────────

/**
 * Describes a state transition for a sprite — consumed by the
 * renderer to trigger animation changes.
 */
export interface SpriteTransition {
  spriteId: string;
  from: {
    lifecycle: SpriteLifecycle;
    animation: SpriteAnimation;
    agentStatus: AgentStatus;
  };
  to: {
    lifecycle: SpriteLifecycle;
    animation: SpriteAnimation;
    agentStatus: AgentStatus;
  };
  timestamp: number;
}

// ── Hook Return Type ──────────────────────────────────────────

/**
 * Return value of `useSubAgentData` — everything the PixiJS
 * renderer needs to draw and animate the office scene.
 */
export interface SubAgentDataResult {
  /** All active sprites (main agents + sub-agents), including those despawning */
  sprites: SpriteAgent[];
  /** Transitions that occurred since last render tick */
  transitions: SpriteTransition[];
  /** Summary counts by status */
  counts: {
    total: number;
    idle: number;
    busy: number;
    error: number;
    offline: number;
    starting: number;
    subAgents: number;
  };
  /** Whether data is currently being fetched */
  isLoading: boolean;
  /** Whether we have a live connection */
  isConnected: boolean;
  /** Active transport type */
  transport: string | null;
  /** Force refresh */
  refresh: () => void;
}
