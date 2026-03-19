/**
 * useSpriteAnimation — A reusable animation engine hook that cycles through
 * sprite animation frames based on a given animation state.
 *
 * Supports configurable frame counts per state, animation speed, and
 * automatic frame advancement via requestAnimationFrame.
 */

import { useRef, useEffect, useCallback, useState } from "react";

// ── Types ──────────────────────────────────────────────────────

export type SpriteAnimationState = "idle" | "walk" | "working" | "error" | "sleeping" | "celebrating";

export interface AnimationConfig {
  /** Number of frames in each animation state */
  frameCounts: Record<SpriteAnimationState, number>;
  /** Base animation speed in frames-per-second */
  fps: number;
  /** Speed multipliers per animation state (optional, defaults to 1) */
  speedMultipliers?: Partial<Record<SpriteAnimationState, number>>;
  /** Whether to auto-play on mount (default: true) */
  autoPlay?: boolean;
}

export interface SpriteAnimationResult {
  /** Current global frame counter (for raw animation drivers) */
  globalFrame: number;
  /** Current frame index within the active animation state (0-based) */
  frameIndex: number;
  /** Current animation state */
  animationState: SpriteAnimationState;
  /** Whether the animation is currently playing */
  isPlaying: boolean;
  /** Start/resume the animation loop */
  play: () => void;
  /** Pause the animation loop */
  pause: () => void;
  /** Reset frame counter to 0 */
  reset: () => void;
  /** Set a new animation state (resets frame index) */
  setAnimationState: (state: SpriteAnimationState) => void;
}

// ── Default Config ──────────────────────────────────────────────

const DEFAULT_FRAME_COUNTS: Record<SpriteAnimationState, number> = {
  idle: 2,
  walk: 4,
  working: 4,
  error: 2,
  sleeping: 2,
  celebrating: 4,
};

const DEFAULT_SPEED_MULTIPLIERS: Record<SpriteAnimationState, number> = {
  idle: 0.5,       // slow breathing / idle bob
  walk: 1.0,       // normal speed
  working: 1.2,    // slightly faster typing
  error: 0.8,      // flash at moderate pace
  sleeping: 0.3,   // very slow ZZZ
  celebrating: 1.5, // fast celebration
};

// ── Hook Implementation ─────────────────────────────────────────

export function useSpriteAnimation(
  initialState: SpriteAnimationState = "idle",
  config?: Partial<AnimationConfig>,
): SpriteAnimationResult {
  const frameCounts = config?.frameCounts ?? DEFAULT_FRAME_COUNTS;
  const baseFps = config?.fps ?? 8;
  const speedMultipliers = {
    ...DEFAULT_SPEED_MULTIPLIERS,
    ...config?.speedMultipliers,
  };
  const autoPlay = config?.autoPlay ?? true;

  const [animationState, setAnimationStateRaw] = useState<SpriteAnimationState>(initialState);
  const [isPlaying, setIsPlaying] = useState(autoPlay);
  const [globalFrame, setGlobalFrame] = useState(0);
  const [frameIndex, setFrameIndex] = useState(0);

  const animStateRef = useRef(initialState);
  const isPlayingRef = useRef(autoPlay);
  const rafRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);
  const accumulatorRef = useRef(0);
  const frameIndexRef = useRef(0);
  const globalFrameRef = useRef(0);

  // Keep refs in sync
  useEffect(() => {
    animStateRef.current = animationState;
  }, [animationState]);

  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  // Animation loop
  useEffect(() => {
    if (!isPlaying) return;

    const tick = (time: number) => {
      if (lastTimeRef.current === 0) {
        lastTimeRef.current = time;
      }

      const deltaMs = Math.min(time - lastTimeRef.current, 100); // cap to avoid spiral
      lastTimeRef.current = time;

      const currentState = animStateRef.current;
      const multiplier = speedMultipliers[currentState] ?? 1;
      const effectiveFps = baseFps * multiplier;
      const frameDuration = 1000 / effectiveFps;

      accumulatorRef.current += deltaMs;

      if (accumulatorRef.current >= frameDuration) {
        accumulatorRef.current -= frameDuration;

        const maxFrames = frameCounts[currentState] ?? 2;
        frameIndexRef.current = (frameIndexRef.current + 1) % maxFrames;
        globalFrameRef.current += 1;

        setFrameIndex(frameIndexRef.current);
        setGlobalFrame(globalFrameRef.current);
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    lastTimeRef.current = 0;
    accumulatorRef.current = 0;
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(rafRef.current);
    };
  }, [isPlaying, baseFps, frameCounts, speedMultipliers]);

  const play = useCallback(() => setIsPlaying(true), []);
  const pause = useCallback(() => setIsPlaying(false), []);

  const reset = useCallback(() => {
    frameIndexRef.current = 0;
    globalFrameRef.current = 0;
    accumulatorRef.current = 0;
    lastTimeRef.current = 0;
    setFrameIndex(0);
    setGlobalFrame(0);
  }, []);

  const setAnimationState = useCallback((state: SpriteAnimationState) => {
    if (state === animStateRef.current) return;
    animStateRef.current = state;
    frameIndexRef.current = 0;
    accumulatorRef.current = 0;
    setAnimationStateRaw(state);
    setFrameIndex(0);
  }, []);

  // Sync animation state with external prop changes
  useEffect(() => {
    if (initialState !== animStateRef.current) {
      setAnimationState(initialState);
    }
  }, [initialState, setAnimationState]);

  return {
    globalFrame,
    frameIndex,
    animationState,
    isPlaying,
    play,
    pause,
    reset,
    setAnimationState,
  };
}

// ── Utility: Map AgentStatus to SpriteAnimationState ────────────

import type { AgentStatus } from "@/lib/types/events";

export function agentStatusToAnimation(status: AgentStatus): SpriteAnimationState {
  switch (status) {
    case "busy":
      return "working";
    case "starting":
      return "walk";
    case "error":
      return "error";
    case "offline":
      return "sleeping";
    case "idle":
    default:
      return "idle";
  }
}
