"use client";

/**
 * AgentSprite — A reusable React component that renders an animated pixel-art
 * agent character on an HTML5 Canvas element.
 *
 * Features:
 * - Deterministic appearance generation from agent ID (seed)
 * - Frame-based animation cycling driven by `useSpriteAnimation` hook
 * - Animation state prop controls which animation plays (idle, walk, working, etc.)
 * - Configurable scale, showing/hiding name tags and status indicators
 * - Lightweight: each instance manages its own small canvas
 * - Can be used standalone (agent lists, tooltips) or composed into the office scene
 */

import React, { useRef, useEffect, useMemo, memo } from "react";
import {
  useSpriteAnimation,
  agentStatusToAnimation,
  type SpriteAnimationState,
} from "@/hooks/use-sprite-animation";
import {
  getAppearanceForAgent,
  drawAgentCharacter,
  drawStatusIndicator,
  drawAgentNameTag,
  type AgentAppearance,
} from "./sprite-generator";
import type { AgentStatus } from "@/lib/types/events";

// ── Types ──────────────────────────────────────────────────────

export interface AgentSpriteProps {
  /** Unique agent ID — used as seed for deterministic appearance generation */
  agentId: string;
  /** Display name shown beneath the sprite (optional) */
  name?: string;
  /** Current agent status — automatically maps to animation state if `animationState` is not set */
  status?: AgentStatus;
  /** Override animation state directly (takes precedence over status-derived animation) */
  animationState?: SpriteAnimationState;
  /** Pixel scale factor (default: 3, each sprite pixel = 3×3 screen pixels) */
  scale?: number;
  /** Show the status indicator dot above the sprite (default: false) */
  showStatus?: boolean;
  /** Show the name tag below the sprite (default: false) */
  showName?: boolean;
  /** Whether this agent is a sub-agent (affects name tag badge) */
  isSubAgent?: boolean;
  /** Animation speed in FPS (default: 8) */
  fps?: number;
  /** Whether to play animation (default: true) */
  playing?: boolean;
  /** Additional CSS class names for the canvas wrapper */
  className?: string;
  /** Click handler */
  onClick?: () => void;
  /** Hover handler */
  onHover?: (hovered: boolean) => void;
  /** Override appearance (bypasses seed-based generation) */
  appearance?: AgentAppearance;
}

// ── Sprite Dimensions ──────────────────────────────────────────

/** Base sprite dimensions in logical pixels */
const SPRITE_W = 16;
const SPRITE_H = 13; // Character body height (without status/name)

/** Extra vertical space for status indicator + name tag */
const STATUS_HEIGHT = 6;
const NAME_HEIGHT = 10;

// ── Frame Mapping ──────────────────────────────────────────────

/**
 * Maps SpriteAnimationState + frameIndex to the frame number
 * expected by drawAgentCharacter (which uses a global frame counter).
 *
 * The drawAgentCharacter function uses `Math.floor(frame / 10)` internally
 * for animation, and modular arithmetic within the draw function itself.
 * We produce a monotonically increasing frame counter that, combined with
 * the status, drives the correct visual frame.
 */
function animationFrameToDrawFrame(
  state: SpriteAnimationState,
  frameIndex: number,
  globalFrame: number,
): number {
  // The sprite generator uses `frame % N` patterns internally,
  // so we pass the global frame counter directly — the draw function
  // handles frame selection based on status and frame modular arithmetic.
  return globalFrame;
}

// ── Component ──────────────────────────────────────────────────

function AgentSpriteInner({
  agentId,
  name,
  status = "idle",
  animationState: animationStateProp,
  scale = 3,
  showStatus = false,
  showName = false,
  isSubAgent = false,
  fps = 8,
  playing = true,
  className,
  onClick,
  onHover,
  appearance: appearanceProp,
}: AgentSpriteProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Derive animation state from status unless explicitly overridden
  const derivedAnimState = animationStateProp ?? agentStatusToAnimation(status);

  // Animation engine
  const {
    globalFrame,
    frameIndex,
    animationState: currentAnimState,
  } = useSpriteAnimation(derivedAnimState, {
    fps,
    autoPlay: playing,
  });

  // Deterministic appearance from agent ID (memoized)
  const appearance = useMemo(
    () => appearanceProp ?? getAppearanceForAgent(agentId),
    [agentId, appearanceProp],
  );

  // Canvas dimensions
  const canvasW = useMemo(() => {
    const baseW = SPRITE_W * scale;
    // Extra width for name tag if shown
    return showName && name ? Math.max(baseW, name.length * 6 + 16) : baseW;
  }, [scale, showName, name]);

  const canvasH = useMemo(() => {
    let h = SPRITE_H * scale;
    if (showStatus) h += STATUS_HEIGHT * scale;
    if (showName) h += NAME_HEIGHT * scale;
    return h;
  }, [scale, showStatus, showName]);

  // Render loop — redraws whenever globalFrame changes
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingEnabled = false;

    // Calculate vertical offsets
    let yOffset = 0;

    // Status indicator above head
    if (showStatus) {
      const statusX = canvasW / 2;
      const statusY = STATUS_HEIGHT * scale * 0.5;
      drawStatusIndicator(ctx, statusX, statusY, status, globalFrame, scale * 0.5);
      yOffset += STATUS_HEIGHT * scale;
    }

    // Agent character
    const charX = (canvasW - SPRITE_W * scale) / 2;
    drawAgentCharacter(
      ctx,
      appearance,
      globalFrame,
      status,
      scale,
      charX,
      yOffset,
    );

    yOffset += SPRITE_H * scale;

    // Name tag below character
    if (showName && name) {
      const nameX = canvasW / 2;
      const nameY = yOffset + 4;
      drawAgentNameTag(ctx, nameX, nameY, name, status, isSubAgent);
    }
  }, [
    globalFrame,
    appearance,
    status,
    scale,
    showStatus,
    showName,
    name,
    isSubAgent,
    canvasW,
    canvasH,
  ]);

  return (
    <canvas
      ref={canvasRef}
      width={canvasW}
      height={canvasH}
      className={className}
      style={{
        imageRendering: "pixelated",
        cursor: onClick ? "pointer" : "default",
      }}
      onClick={onClick}
      onMouseEnter={() => onHover?.(true)}
      onMouseLeave={() => onHover?.(false)}
      role="img"
      aria-label={`Agent ${name || agentId} - ${status}`}
    />
  );
}

/** Memoized AgentSprite — only re-renders when props change */
export const AgentSprite = memo(AgentSpriteInner);

// ── Convenience: AgentSpritePreview ────────────────────────────

export interface AgentSpritePreviewProps {
  /** Agent ID for seed-based appearance */
  agentId: string;
  /** Display name */
  name?: string;
  /** Agent status */
  status?: AgentStatus;
  /** Size preset: "sm" (24px), "md" (48px), "lg" (72px) */
  size?: "sm" | "md" | "lg";
  /** Additional CSS class */
  className?: string;
}

const SIZE_SCALES: Record<string, number> = {
  sm: 2,
  md: 3,
  lg: 5,
};

/**
 * AgentSpritePreview — A smaller, simpler version of AgentSprite
 * meant for use in lists, cards, and inline contexts.
 * Shows only the character with no status indicator or name tag.
 */
export function AgentSpritePreview({
  agentId,
  name,
  status = "idle",
  size = "md",
  className,
}: AgentSpritePreviewProps) {
  return (
    <AgentSprite
      agentId={agentId}
      name={name}
      status={status}
      scale={SIZE_SCALES[size] ?? 3}
      showStatus={false}
      showName={false}
      fps={6}
      className={className}
    />
  );
}

// ── Convenience: AgentSpriteCard ──────────────────────────────

export interface AgentSpriteCardProps {
  agentId: string;
  name: string;
  status: AgentStatus;
  isSubAgent?: boolean;
  task?: string;
  onClick?: () => void;
  className?: string;
}

/**
 * AgentSpriteCard — Combines the animated sprite with agent metadata
 * in a compact card layout. Useful for agent list views.
 */
export function AgentSpriteCard({
  agentId,
  name,
  status,
  isSubAgent = false,
  task,
  onClick,
  className = "",
}: AgentSpriteCardProps) {
  const statusColors: Record<AgentStatus, string> = {
    idle: "#2ecc71",
    busy: "#f39c12",
    error: "#e74c3c",
    offline: "#95a5a6",
    starting: "#3498db",
  };

  const statusLabels: Record<AgentStatus, string> = {
    idle: "Idle",
    busy: "Working",
    error: "Error",
    offline: "Offline",
    starting: "Starting",
  };

  return (
    <div
      className={`flex items-center gap-3 px-3 py-2 rounded-lg border border-border bg-card hover:bg-muted/50 transition-colors ${onClick ? "cursor-pointer" : ""} ${className}`}
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => e.key === "Enter" && onClick() : undefined}
    >
      <div className="shrink-0">
        <AgentSprite
          agentId={agentId}
          status={status}
          scale={2}
          showStatus={false}
          showName={false}
          fps={6}
        />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-foreground truncate">
            {name}
          </span>
          {isSubAgent && (
            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-purple-500/15 text-purple-400 shrink-0">
              SUB
            </span>
          )}
        </div>
        {task && (
          <p className="text-xs text-muted-foreground truncate mt-0.5">{task}</p>
        )}
      </div>
      <div className="shrink-0 flex items-center gap-1.5">
        <span
          className="w-2 h-2 rounded-full"
          style={{
            backgroundColor: statusColors[status],
            animation: status === "busy" ? "pulse 1s ease-in-out infinite" : undefined,
          }}
        />
        <span
          className="text-[10px] font-semibold uppercase tracking-wider"
          style={{ color: statusColors[status] }}
        >
          {statusLabels[status]}
        </span>
      </div>
    </div>
  );
}
