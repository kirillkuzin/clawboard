"use client";

import React, { useRef, useEffect, useCallback, useState, useMemo } from "react";
import { useConnectionStatus } from "@/hooks/use-realtime";
import { useSubAgentData } from "@/hooks/use-sub-agent-data";
import { useMediaQuery } from "@/hooks/use-media-query";
import type { AgentStatus } from "@/lib/types/events";
import type { SpriteAgent, SpriteAnimation, SpriteTransition } from "@/lib/types/sprites";
import {
  TILE_SIZE,
  OFFICE_MAP_COLS,
  OFFICE_MAP_ROWS,
  generateTilemap,
  getOfficeFurniture,
  drawFloorTile,
  drawCarpetTile,
  drawWallTile,
  drawDesk,
  drawMonitor,
  drawChair,
  drawPlant,
  drawBookshelf,
  drawWaterCooler,
  drawWhiteboard,
  drawServerRack,
  drawCoffeeMachine,
  drawRug,
  drawWindow,
  drawLamp,
  type FurniturePlacement,
} from "./pixel-sprites";
import {
  drawAgentCharacter,
  drawStatusIndicator,
  drawAgentNameTag,
  drawTaskBubble,
  drawParticle,
  updateParticle,
  createSpawnParticles,
  createDespawnParticles,
  getAppearanceForAgent,
  type AgentAppearance,
  type Particle,
} from "./sprite-generator";

// ── Helpers ──────────────────────────────────────────────────

/** Format a duration in ms to a human-readable uptime string */
function formatUptime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes < 60) return `${minutes}m ${seconds}s`;
  const hours = Math.floor(minutes / 60);
  const remainMinutes = minutes % 60;
  if (hours < 24) return `${hours}h ${remainMinutes}m`;
  const days = Math.floor(hours / 24);
  const remainHours = hours % 24;
  return `${days}d ${remainHours}h`;
}

const STATUS_LABELS: Record<AgentStatus, string> = {
  idle: "Idle",
  busy: "Working",
  error: "Error",
  offline: "Offline",
  starting: "Starting",
};

const STATUS_COLORS_HEX: Record<AgentStatus, string> = {
  idle: "#2ecc71",
  busy: "#f39c12",
  error: "#e74c3c",
  offline: "#95a5a6",
  starting: "#3498db",
};

// ── Constants ───────────────────────────────────────────────

const SCALE = 3;
const CANVAS_W = OFFICE_MAP_COLS * TILE_SIZE * SCALE;
const CANVAS_H = OFFICE_MAP_ROWS * TILE_SIZE * SCALE;

// Sprite draw functions by type
const SPRITE_DRAWERS: Record<FurniturePlacement["type"], () => OffscreenCanvas | HTMLCanvasElement> = {
  desk: drawDesk,
  monitor: drawMonitor,
  chair: drawChair,
  plant: drawPlant,
  bookshelf: drawBookshelf,
  watercooler: drawWaterCooler,
  whiteboard: drawWhiteboard,
  server: drawServerRack,
  coffee: drawCoffeeMachine,
  rug: drawRug,
  window: drawWindow,
  lamp: drawLamp,
};

// ── Workstation definitions (desk slots for agents) ─────────

interface Workstation {
  index: number;
  /** Center-x in canvas pixels where the agent character sits */
  seatX: number;
  /** Top-y in canvas pixels for the agent character */
  seatY: number;
  /** Label position for name tags */
  labelX: number;
  labelY: number;
}

/**
 * Map desk furniture items to workstation slots.
 * Each desk+chair combo is one workstation.
 */
function buildWorkstations(): Workstation[] {
  const furniture = getOfficeFurniture();
  const desks = furniture.filter((f) => f.type === "desk");
  return desks.map((desk, i) => {
    // Agent sits in front of the desk (below it)
    const seatX = desk.x * TILE_SIZE * SCALE + 8 * SCALE;
    const seatY = (desk.y + 1.8) * TILE_SIZE * SCALE;
    return {
      index: i,
      seatX,
      seatY,
      labelX: desk.x * TILE_SIZE * SCALE + 16 * SCALE,
      labelY: (desk.y + 3.5) * TILE_SIZE * SCALE,
    };
  });
}

const WORKSTATIONS = buildWorkstations();

// ── Animation state mapping ──────────────────────────────────

/**
 * Maps SpriteAnimation (from useSubAgentData) to visual rendering parameters.
 * This is the core integration between the real-time data layer and the canvas renderer.
 */
interface AnimationParams {
  /** Speed multiplier for the character animation frames */
  animSpeed: number;
  /** Whether arms should do typing motion (passed to drawAgentCharacter) */
  armsTyping: boolean;
  /** Vertical bob amplitude in pixels */
  bobAmplitude: number;
  /** Opacity multiplier (for sleeping/despawning) */
  opacityMult: number;
  /** Scale multiplier (for spawn/despawn) */
  scaleMult: number;
  /** Tint color overlay (null = none) */
  tintColor: string | null;
  /** Whether to show ZZZ particles */
  showZzz: boolean;
  /** Whether to show celebration sparkles */
  showSparkles: boolean;
  /** Whether to apply error flash effect */
  errorFlash: boolean;
}

function getAnimationParams(
  animation: SpriteAnimation,
  phaseAge: number,
  frame: number,
): AnimationParams {
  const base: AnimationParams = {
    animSpeed: 1,
    armsTyping: false,
    bobAmplitude: 0,
    opacityMult: 1,
    scaleMult: 1,
    tintColor: null,
    showZzz: false,
    showSparkles: false,
    errorFlash: false,
  };

  switch (animation) {
    case "spawning": {
      // Pop-in with elastic scale
      const t = Math.min(phaseAge / 800, 1);
      const ease = t === 1 ? 1 : 1 - Math.pow(2, -10 * t) * Math.cos((t * 10 - 0.75) * (2 * Math.PI / 3));
      return { ...base, scaleMult: ease, opacityMult: Math.min(t * 2, 1) };
    }
    case "idle":
      // Subtle breathing bob
      return { ...base, bobAmplitude: 0.5, animSpeed: 0.5 };
    case "working":
      // Fast arm typing, slight bob
      return { ...base, armsTyping: true, animSpeed: 1.5, bobAmplitude: 0.3 };
    case "walking":
      // Walking with leg animation
      return { ...base, animSpeed: 1.2, bobAmplitude: 1.0 };
    case "error":
      // Red flash pulsing
      return { ...base, errorFlash: true, animSpeed: 0.3, tintColor: "rgba(231, 76, 60, 0.3)" };
    case "sleeping":
      // Dimmed with ZZZ
      return { ...base, opacityMult: 0.5, showZzz: true, animSpeed: 0.2, bobAmplitude: 0.2 };
    case "celebrating": {
      // Bouncing with sparkles
      const bounceT = (phaseAge % 400) / 400;
      const bounce = Math.abs(Math.sin(bounceT * Math.PI * 2)) * 3;
      return { ...base, bobAmplitude: bounce, showSparkles: true, animSpeed: 2.0 };
    }
    case "despawning": {
      // Fade out + shrink
      const t = Math.min(phaseAge / 1200, 1);
      return { ...base, opacityMult: 1 - t, scaleMult: 1 - t * 0.4 };
    }
    default:
      return base;
  }
}

/**
 * Draw ZZZ sleeping indicator above an agent.
 */
function drawZzzIndicator(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  frame: number,
) {
  ctx.save();
  ctx.font = "bold 10px monospace";
  ctx.fillStyle = "#95a5a6";
  ctx.textAlign = "center";

  const zCount = 3;
  for (let i = 0; i < zCount; i++) {
    const offset = (frame * 0.02 + i * 0.4) % 1.5;
    const alpha = Math.max(0, 1 - offset);
    ctx.globalAlpha = alpha * 0.7;
    const zx = x + i * 6 - 3;
    const zy = y - offset * 20 - i * 4;
    const size = 8 + i * 2;
    ctx.font = `bold ${size}px monospace`;
    ctx.fillText("z", zx, zy);
  }

  ctx.globalAlpha = 1;
  ctx.restore();
}

/**
 * Draw celebration sparkle particles around an agent.
 */
function drawCelebrationSparkles(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  frame: number,
) {
  ctx.save();
  const sparkleColors = ["#f1c40f", "#e74c3c", "#2ecc71", "#3498db", "#9b59b6"];
  const numSparkles = 6;

  for (let i = 0; i < numSparkles; i++) {
    const angle = (frame * 0.05 + i * (Math.PI * 2 / numSparkles)) % (Math.PI * 2);
    const radius = 15 + Math.sin(frame * 0.1 + i) * 5;
    const sx = x + Math.cos(angle) * radius;
    const sy = y + Math.sin(angle) * radius - 10;
    const size = 2 + Math.sin(frame * 0.15 + i * 2) * 1;
    const alpha = 0.6 + Math.sin(frame * 0.1 + i * 1.5) * 0.4;

    ctx.globalAlpha = Math.max(0, alpha);
    ctx.fillStyle = sparkleColors[i % sparkleColors.length];

    // Draw a small star/diamond shape
    ctx.beginPath();
    ctx.moveTo(sx, sy - size);
    ctx.lineTo(sx + size * 0.5, sy);
    ctx.lineTo(sx, sy + size);
    ctx.lineTo(sx - size * 0.5, sy);
    ctx.closePath();
    ctx.fill();
  }

  ctx.globalAlpha = 1;
  ctx.restore();
}

/**
 * Draw error flash overlay on an agent.
 */
function drawErrorFlash(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  frame: number,
  scale: number,
) {
  const flashIntensity = Math.sin(frame * 0.15) * 0.5 + 0.5;
  ctx.save();
  ctx.globalAlpha = flashIntensity * 0.25;
  ctx.fillStyle = "#e74c3c";
  ctx.beginPath();
  ctx.arc(x, y, 14 * scale, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.restore();
}

// ── Agent sprite state ──────────────────────────────────────

interface CanvasAgentSprite {
  id: string;
  name: string;
  status: AgentStatus;
  prevStatus: AgentStatus;
  /** Animation state driven by useSubAgentData lifecycle */
  animation: SpriteAnimation;
  /** Phase age in ms (for animation timing from SpriteAgent data) */
  phaseAge: number;
  appearance: AgentAppearance;
  workstationIdx: number;
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  animFrame: number;
  spawnTime: number;
  despawning: boolean;
  despawnAlpha: number;
  currentTask?: string;
  isSubAgent: boolean;
  parentId?: string;
}

// ── Office background cache ─────────────────────────────────

interface OfficeCanvasState {
  tilemap: number[][];
  furniture: FurniturePlacement[];
  tileSprites: Map<number, OffscreenCanvas | HTMLCanvasElement>;
  furnitureSprites: Map<string, OffscreenCanvas | HTMLCanvasElement>;
}

function initOfficeState(): OfficeCanvasState {
  const tilemap = generateTilemap();
  const furniture = getOfficeFurniture();

  const tileSprites = new Map<number, OffscreenCanvas | HTMLCanvasElement>();
  tileSprites.set(0, drawFloorTile());
  tileSprites.set(1, drawWallTile());
  tileSprites.set(2, drawCarpetTile());

  const furnitureSprites = new Map<string, OffscreenCanvas | HTMLCanvasElement>();
  const types = new Set(furniture.map((f) => f.type));
  types.forEach((type) => {
    furnitureSprites.set(type, SPRITE_DRAWERS[type]());
  });

  return { tilemap, furniture, tileSprites, furnitureSprites };
}

function renderOfficeBackground(
  ctx: CanvasRenderingContext2D,
  state: OfficeCanvasState,
  time: number,
) {
  const { tilemap, furniture, tileSprites, furnitureSprites } = state;

  ctx.imageSmoothingEnabled = false;

  // Draw tilemap
  for (let r = 0; r < OFFICE_MAP_ROWS; r++) {
    for (let c = 0; c < OFFICE_MAP_COLS; c++) {
      const tileType = tilemap[r][c];
      const sprite = tileSprites.get(tileType);
      if (sprite) {
        ctx.drawImage(
          sprite as CanvasImageSource,
          c * TILE_SIZE * SCALE,
          r * TILE_SIZE * SCALE,
          TILE_SIZE * SCALE,
          TILE_SIZE * SCALE,
        );
      }
    }
  }

  // Draw furniture (sorted by y for depth)
  const sorted = [...furniture].sort((a, b) => a.y - b.y);
  sorted.forEach((item) => {
    const sprite = furnitureSprites.get(item.type);
    if (!sprite) return;

    const srcW = (sprite as HTMLCanvasElement).width ?? TILE_SIZE;
    const srcH = (sprite as HTMLCanvasElement).height ?? TILE_SIZE;

    ctx.drawImage(
      sprite as CanvasImageSource,
      item.x * TILE_SIZE * SCALE,
      item.y * TILE_SIZE * SCALE,
      srcW * SCALE,
      srcH * SCALE,
    );
  });

  // Server LED flicker
  const flickerPhase = Math.sin(time / 500);
  const serverItems = furniture.filter((f) => f.type === "server");
  serverItems.forEach((srv) => {
    const sx = srv.x * TILE_SIZE * SCALE;
    const sy = srv.y * TILE_SIZE * SCALE;
    if (flickerPhase > 0.3) {
      ctx.fillStyle = "#33ff33";
      ctx.fillRect(sx + 4 * SCALE, sy + 8 * SCALE, SCALE, SCALE);
    }
    if (flickerPhase < -0.3) {
      ctx.fillStyle = "#ffff33";
      ctx.fillRect(sx + 8 * SCALE, sy + 14 * SCALE, SCALE, SCALE);
    }
  });

  // Monitor screen glow
  const monitorItems = furniture.filter((f) => f.type === "monitor");
  const screenGlow = 0.5 + 0.15 * Math.sin(time / 1200);
  monitorItems.forEach((mon) => {
    const mx = mon.x * TILE_SIZE * SCALE;
    const my = mon.y * TILE_SIZE * SCALE;
    ctx.globalAlpha = screenGlow;
    ctx.fillStyle = "#4488cc";
    ctx.fillRect(mx + 3 * SCALE, my + 1 * SCALE, 10 * SCALE, 8 * SCALE);
    ctx.globalAlpha = 1;
  });
}

// ── Mobile Agent Card ──────────────────────────────────────

function MobileAgentCard({
  name,
  status,
  animation,
  task,
  isSubAgent,
  spawnTime,
}: {
  name: string;
  status: AgentStatus;
  animation: SpriteAnimation;
  task?: string;
  isSubAgent: boolean;
  spawnTime?: number;
}) {
  const color = STATUS_COLORS_HEX[status] || "#95a5a6";
  const label = STATUS_LABELS[status] || status;

  // Animation state label for additional context
  const animLabel = animation === "celebrating" ? " (done!)" :
                    animation === "sleeping" ? " (zzz)" :
                    animation === "spawning" ? " (joining)" :
                    animation === "despawning" ? " (leaving)" : "";

  return (
    <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-border bg-card hover:bg-muted/50 transition-colors">
      <div
        className="shrink-0 w-8 h-8 rounded-md flex items-center justify-center text-sm"
        style={{ backgroundColor: `${color}20`, border: `1.5px solid ${color}40` }}
      >
        {isSubAgent ? "\u2B21" : "\uD83E\uDD16"}
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
        {task ? (
          <p className="text-xs text-muted-foreground truncate mt-0.5">{task}</p>
        ) : spawnTime ? (
          <p className="text-[10px] text-muted-foreground/60 mt-0.5">
            up {formatUptime(Date.now() - spawnTime)}
          </p>
        ) : null}
      </div>
      <div className="shrink-0 flex items-center gap-1.5">
        <span
          className="w-2 h-2 rounded-full"
          style={{
            backgroundColor: color,
            animation: status === "busy" ? "pulse 1s ease-in-out infinite" : undefined,
          }}
        />
        <span
          className="text-[10px] font-semibold uppercase tracking-wider"
          style={{ color }}
        >
          {label}{animLabel}
        </span>
      </div>
    </div>
  );
}

// ── Mobile Simplified View ─────────────────────────────────

function MobileOfficeView({
  sprites,
  counts,
  isConnected,
  connectionStatus,
  onShowCanvas,
}: {
  sprites: SpriteAgent[];
  counts: { total: number; busy: number; subAgents: number };
  isConnected: boolean;
  connectionStatus: string;
  onShowCanvas: () => void;
}) {
  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border shrink-0">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-foreground">
              Agent Activity
            </h2>
            <p className="text-xs text-muted-foreground">
              Live agent status overview
            </p>
          </div>
          <button
            onClick={onShowCanvas}
            className="text-xs text-primary hover:text-primary/80 font-medium px-3 py-1.5 rounded-md border border-primary/30 hover:bg-primary/5 transition-colors"
            aria-label="Show pixel art office view"
          >
            Show Office
          </button>
        </div>
      </div>

      {/* Summary bar */}
      <div className="px-4 py-2 border-b border-border bg-muted/30 flex items-center gap-4 text-xs text-muted-foreground shrink-0">
        <span className="flex items-center gap-1.5">
          <span className="text-foreground font-semibold">
            {counts.total}
          </span>{" "}
          agent{counts.total !== 1 ? "s" : ""}
        </span>
        {counts.busy > 0 && (
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-[#f39c12]" />
            {counts.busy} busy
          </span>
        )}
        {counts.subAgents > 0 && (
          <span className="flex items-center gap-1.5">
            <span className="text-purple-400">{"\u2B21"}</span>
            {counts.subAgents} sub
          </span>
        )}
        <span className="ml-auto flex items-center gap-1">
          <span
            className={`w-1.5 h-1.5 rounded-full ${isConnected ? "bg-green-500" : "bg-red-500"}`}
          />
          <span className="text-[10px]">
            {isConnected ? "Live" : "Offline"}
          </span>
        </span>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {!isConnected ? (
          <div className="flex flex-col items-center justify-center h-full text-center py-12">
            <div className="text-3xl mb-3" role="img" aria-label="connection status">
              {connectionStatus === "error" ? "\u274C" : "\uD83D\uDD04"}
            </div>
            <p className="text-sm font-medium text-foreground mb-1">
              {connectionStatus === "connecting"
                ? "Connecting to OpenClaw..."
                : connectionStatus === "reconnecting"
                  ? "Reconnecting..."
                  : connectionStatus === "error"
                    ? "Connection Error"
                    : "Disconnected"}
            </p>
            <p className="text-xs text-muted-foreground">
              Configure API in Settings
            </p>
          </div>
        ) : sprites.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center py-12">
            <div className="text-3xl mb-3" role="img" aria-label="empty office">
              {"\uD83C\uDFE2"}
            </div>
            <p className="text-sm text-muted-foreground">
              No agents active &mdash; waiting for activity&hellip;
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {sprites
              .filter((s) => s.lifecycle !== "gone")
              .map((sprite) => (
                <MobileAgentCard
                  key={sprite.id}
                  name={sprite.name}
                  status={sprite.agentStatus}
                  animation={sprite.animation}
                  task={sprite.currentTask}
                  isSubAgent={sprite.isSubAgent}
                  spawnTime={sprite.spawnedAt}
                />
              ))}
          </div>
        )}
      </div>

      {/* Status legend - compact */}
      <div className="px-4 py-2 border-t border-border shrink-0 flex flex-wrap gap-3 text-[10px] text-muted-foreground">
        {(Object.entries(STATUS_COLORS_HEX) as [AgentStatus, string][]).map(
          ([status, color]) => (
            <span key={status} className="flex items-center gap-1">
              <span
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: color }}
              />
              {STATUS_LABELS[status]}
            </span>
          )
        )}
      </div>
    </div>
  );
}

// ── Component ───────────────────────────────────────────────

export function PixelOffice() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const officeStateRef = useRef<OfficeCanvasState | null>(null);
  const animRef = useRef<number>(0);
  const spritesRef = useRef<Map<string, CanvasAgentSprite>>(new Map());
  const particlesRef = useRef<Particle[]>([]);
  const prevAgentIdsRef = useRef<Set<string>>(new Set());
  const frameRef = useRef(0);
  const [canvasScale, setCanvasScale] = useState(1);
  const [hoveredAgent, setHoveredAgent] = useState<string | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const tooltipRef = useRef<HTMLDivElement>(null);

  // Responsive breakpoints
  const isMobile = !useMediaQuery("(min-width: 768px)");
  const [forceCanvas, setForceCanvas] = useState(false);

  // Real-time data from useSubAgentData — single source of truth for sprite state
  const {
    sprites: spriteAgents,
    transitions,
    counts,
    isConnected,
  } = useSubAgentData();
  const { status: connectionStatus } = useConnectionStatus();

  // On mobile, show simplified view by default (unless user opts into canvas)
  const showCanvas = !isMobile || forceCanvas;

  // ── Sync SpriteAgent data → canvas sprites ────────────────
  // useSubAgentData handles all lifecycle/animation state derivation.
  // We map its output to canvas rendering sprites with position tracking.
  const syncSprites = useCallback(
    (spriteAgentList: SpriteAgent[], newTransitions: SpriteTransition[]) => {
      const canvasSprites = spritesRef.current;
      const currentIds = new Set<string>();
      const prevIds = prevAgentIdsRef.current;

      // Track used workstation slots
      const usedSlots = new Set<number>();
      for (const cs of canvasSprites.values()) {
        if (!cs.despawning) {
          usedSlots.add(cs.workstationIdx);
        }
      }

      for (const agent of spriteAgentList) {
        // Skip agents that are fully gone
        if (agent.lifecycle === "gone") continue;

        currentIds.add(agent.id);
        const existing = canvasSprites.get(agent.id);

        if (existing) {
          // ── Update existing canvas sprite from SpriteAgent state ──
          const statusChanged = existing.status !== agent.agentStatus;
          const animChanged = existing.animation !== agent.animation;

          existing.prevStatus = existing.status;
          existing.status = agent.agentStatus;
          existing.name = agent.name;
          existing.currentTask = agent.currentTask;
          // Sync animation state from the data source
          existing.animation = agent.animation;
          existing.phaseAge = agent.phaseAge;
          // Sync despawning from lifecycle
          existing.despawning = agent.lifecycle === "despawning";

          // Status change → particles (driven by transition events)
          if (statusChanged && !existing.despawning) {
            particlesRef.current.push(
              ...createSpawnParticles(existing.x, existing.y - 10, agent.agentStatus),
            );
          }
        } else {
          // ── Spawn new canvas sprite from SpriteAgent ──
          let slot = 0;
          while (usedSlots.has(slot) && slot < WORKSTATIONS.length) slot++;

          // If all workstations full, use overflow positions
          const ws =
            slot < WORKSTATIONS.length
              ? WORKSTATIONS[slot]
              : {
                  index: slot,
                  seatX: 15 * TILE_SIZE * SCALE + (slot - WORKSTATIONS.length) * 50,
                  seatY: 12 * TILE_SIZE * SCALE,
                  labelX: 15 * TILE_SIZE * SCALE + (slot - WORKSTATIONS.length) * 50,
                  labelY: 14 * TILE_SIZE * SCALE,
                };

          usedSlots.add(slot);

          const canvasSprite: CanvasAgentSprite = {
            id: agent.id,
            name: agent.name,
            status: agent.agentStatus,
            prevStatus: agent.agentStatus,
            animation: agent.animation,
            phaseAge: agent.phaseAge,
            appearance: getAppearanceForAgent(agent.id),
            workstationIdx: slot,
            x: ws.seatX,
            y: ws.seatY + 40, // spawn from below
            targetX: ws.seatX,
            targetY: ws.seatY,
            animFrame: 0,
            spawnTime: agent.spawnedAt,
            despawning: agent.lifecycle === "despawning",
            despawnAlpha: 1,
            currentTask: agent.currentTask,
            isSubAgent: agent.isSubAgent,
            parentId: agent.parentId,
          };

          canvasSprites.set(agent.id, canvasSprite);

          // Spawn particles (skip on initial load)
          if (prevIds.size > 0) {
            particlesRef.current.push(
              ...createSpawnParticles(ws.seatX, ws.seatY, agent.agentStatus),
            );
          }
        }
      }

      // ── Process transitions for particle effects ──
      for (const transition of newTransitions) {
        const cs = canvasSprites.get(transition.spriteId);
        if (!cs) continue;

        // Despawn transition → despawn particles
        if (transition.to.lifecycle === "despawning" && transition.from.lifecycle !== "despawning") {
          particlesRef.current.push(
            ...createDespawnParticles(cs.x, cs.y),
          );
        }

        // Celebrating transition → extra sparkle particles
        if (transition.to.animation === "celebrating") {
          particlesRef.current.push(
            ...createSpawnParticles(cs.x, cs.y - 15, "idle"),
          );
        }
      }

      // ── Mark sprites as despawning if no longer in the live list ──
      for (const [id, cs] of canvasSprites) {
        if (!currentIds.has(id) && !cs.despawning) {
          cs.despawning = true;
          cs.animation = "despawning";
          cs.phaseAge = 0;
          particlesRef.current.push(
            ...createDespawnParticles(cs.x, cs.y),
          );
        }
      }

      prevAgentIdsRef.current = currentIds;
    },
    [],
  );

  // Re-sync when real-time sprite data changes
  useEffect(() => {
    syncSprites(spriteAgents, transitions);
  }, [spriteAgents, transitions, syncSprites]);

  // ── Responsive scale ────────────────────────────────────
  const updateScale = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    const cw = container.clientWidth;
    const ch = container.clientHeight;
    const sx = cw / CANVAS_W;
    const sy = ch / CANVAS_H;
    setCanvasScale(Math.max(Math.min(sx, sy, 1), 0.2));
  }, []);

  // ── Mouse hover detection ──────────────────────────────
  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      const container = containerRef.current;
      if (!canvas || !container) return;
      const canvasRect = canvas.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();
      const scaleX = CANVAS_W / canvasRect.width;
      const scaleY = CANVAS_H / canvasRect.height;
      const mx = (e.clientX - canvasRect.left) * scaleX;
      const my = (e.clientY - canvasRect.top) * scaleY;

      let found: string | null = null;
      for (const sprite of spritesRef.current.values()) {
        if (sprite.despawning) continue;
        const dx = Math.abs(mx - sprite.targetX);
        const dy = Math.abs(my - sprite.targetY);
        if (dx < 30 && dy < 40) {
          found = sprite.id;
          break;
        }
      }
      setHoveredAgent(found);

      // Position tooltip relative to container
      if (found) {
        setTooltipPos({
          x: e.clientX - containerRect.left + 16,
          y: e.clientY - containerRect.top - 10,
        });
      }
    },
    [],
  );

  // ── Tooltip data derived from hovered sprite (refreshes every second for live uptime) ──
  const [tooltipTick, setTooltipTick] = useState(0);
  useEffect(() => {
    if (!hoveredAgent) return;
    const interval = setInterval(() => setTooltipTick((t) => t + 1), 1000);
    return () => clearInterval(interval);
  }, [hoveredAgent]);

  const hoveredSpriteData = useMemo(() => {
    if (!hoveredAgent) return null;
    const sprite = spritesRef.current.get(hoveredAgent);
    if (!sprite || sprite.despawning) return null;
    return {
      name: sprite.name,
      status: sprite.status,
      animation: sprite.animation,
      task: sprite.currentTask,
      uptime: formatUptime(Date.now() - sprite.spawnTime),
      isSubAgent: sprite.isSubAgent,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hoveredAgent, tooltipTick]);

  // ── Main render loop (only runs when canvas is visible) ──
  useEffect(() => {
    if (!showCanvas) return;

    officeStateRef.current = initOfficeState();

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const container = containerRef.current;
    let resizeObserver: ResizeObserver | null = null;
    if (container) {
      resizeObserver = new ResizeObserver(updateScale);
      resizeObserver.observe(container);
      updateScale();
    }

    const animate = (time: number) => {
      frameRef.current++;
      const frame = frameRef.current;
      const dt = 1 / 60;

      ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);

      // 1) Draw office background (tiles + furniture)
      if (officeStateRef.current) {
        renderOfficeBackground(ctx, officeStateRef.current, time);
      }

      // 2) Draw agent sprites (sorted by y for depth)
      const canvasSprites = spritesRef.current;
      const sortedSprites = Array.from(canvasSprites.values()).sort(
        (a, b) => a.targetY - b.targetY,
      );

      for (const sprite of sortedSprites) {
        // Get animation parameters from the data-driven animation state
        const animParams = getAnimationParams(sprite.animation, sprite.phaseAge, frame);

        // Smooth position interpolation
        sprite.x += (sprite.targetX - sprite.x) * 0.12;
        sprite.y += (sprite.targetY - sprite.y) * 0.12;

        // Handle despawn cleanup (after fade-out animation completes)
        if (sprite.despawning && animParams.opacityMult <= 0.01) {
          canvasSprites.delete(sprite.id);
          continue;
        }

        // Also clean up via legacy despawnAlpha for backward compat
        if (sprite.despawning) {
          sprite.despawnAlpha -= dt * 2.5;
          if (sprite.despawnAlpha <= 0 && sprite.animation !== "despawning") {
            canvasSprites.delete(sprite.id);
            continue;
          }
        }

        ctx.save();

        // Apply opacity from animation state (handles spawn_in fade, despawn_out fade, sleeping dim)
        const effectiveAlpha = sprite.despawning
          ? Math.max(0, Math.min(sprite.despawnAlpha, animParams.opacityMult))
          : animParams.opacityMult;
        if (effectiveAlpha < 1) {
          ctx.globalAlpha = effectiveAlpha;
        }

        // Apply scale from animation state (spawn pop-in, despawn shrink)
        const effectiveScale = animParams.scaleMult;
        if (effectiveScale !== 1) {
          ctx.translate(sprite.x, sprite.y + 20);
          ctx.scale(effectiveScale, effectiveScale);
          ctx.translate(-sprite.x, -(sprite.y + 20));
        }

        // Apply vertical bob from animation state
        const bobOffset = animParams.bobAmplitude > 0
          ? Math.sin(frame * 0.08 * animParams.animSpeed) * animParams.bobAmplitude * SCALE
          : 0;

        // Hover glow
        if (hoveredAgent === sprite.id) {
          ctx.shadowColor = "rgba(52, 152, 219, 0.6)";
          ctx.shadowBlur = 20;
        }

        sprite.animFrame = frame;

        // Apply tint color overlay (for error state)
        if (animParams.tintColor) {
          // Draw tint under the character
          ctx.fillStyle = animParams.tintColor;
          ctx.beginPath();
          ctx.arc(sprite.x, sprite.y + bobOffset, 12 * SCALE, 0, Math.PI * 2);
          ctx.fill();
        }

        // Draw agent character with animation-appropriate frame rate
        const animatedFrame = Math.floor(frame * animParams.animSpeed / 10);
        drawAgentCharacter(
          ctx,
          sprite.appearance,
          animatedFrame,
          sprite.status,
          SCALE,
          sprite.x - 8 * SCALE,
          sprite.y - 13 * SCALE + bobOffset,
        );

        ctx.shadowColor = "transparent";
        ctx.shadowBlur = 0;

        // Error flash overlay
        if (animParams.errorFlash) {
          drawErrorFlash(ctx, sprite.x, sprite.y + bobOffset, frame, SCALE);
        }

        // ZZZ indicator for sleeping/offline agents
        if (animParams.showZzz) {
          drawZzzIndicator(ctx, sprite.x + 10, sprite.y - 16 * SCALE + bobOffset, frame);
        }

        // Celebration sparkles
        if (animParams.showSparkles) {
          drawCelebrationSparkles(ctx, sprite.x, sprite.y + bobOffset, frame);
        }

        // Status indicator above head
        drawStatusIndicator(
          ctx,
          sprite.x,
          sprite.y - 16 * SCALE + bobOffset,
          sprite.status,
          frame,
          SCALE,
        );

        // Name tag below
        const ws =
          sprite.workstationIdx < WORKSTATIONS.length
            ? WORKSTATIONS[sprite.workstationIdx]
            : null;
        drawAgentNameTag(
          ctx,
          ws ? ws.labelX : sprite.x,
          ws ? ws.labelY : sprite.y + 30,
          sprite.name,
          sprite.status,
          sprite.isSubAgent,
        );

        // Task bubble (on hover or when busy/working)
        if (
          (hoveredAgent === sprite.id || sprite.animation === "working") &&
          sprite.currentTask
        ) {
          drawTaskBubble(ctx, sprite.x, sprite.y - 18 * SCALE + bobOffset, sprite.currentTask, frame);
        }

        ctx.restore();
      }

      // 3) Draw particles
      const alive: Particle[] = [];
      for (const p of particlesRef.current) {
        if (updateParticle(p, dt)) {
          drawParticle(ctx, p);
          alive.push(p);
        }
      }
      particlesRef.current = alive;

      // 4) Connection status overlay
      if (!isConnected) {
        ctx.save();
        ctx.fillStyle = "rgba(0, 0, 0, 0.55)";
        ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

        ctx.font = "bold 14px monospace";
        ctx.fillStyle =
          connectionStatus === "error" ? "#e74c3c" : "#f39c12";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";

        const statusText =
          connectionStatus === "connecting"
            ? "\u27F3 Connecting to OpenClaw..."
            : connectionStatus === "reconnecting"
              ? "\u27F3 Reconnecting..."
              : connectionStatus === "error"
                ? "\u2715 Connection Error"
                : "\u25CB Disconnected";

        ctx.fillText(statusText, CANVAS_W / 2, CANVAS_H / 2 - 10);
        ctx.font = "11px monospace";
        ctx.fillStyle = "#95a5a6";
        ctx.fillText(
          "Configure API in Settings \u2192",
          CANVAS_W / 2,
          CANVAS_H / 2 + 14,
        );
        ctx.restore();
      }

      // 5) Empty office indicator
      if (isConnected && canvasSprites.size === 0) {
        ctx.save();
        ctx.font = "bold 13px monospace";
        ctx.fillStyle = "rgba(255,255,255,0.4)";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(
          "No agents active \u2014 waiting for activity\u2026",
          CANVAS_W / 2,
          CANVAS_H / 2,
        );
        ctx.restore();
      }

      // 6) HUD overlay — agent count (using counts from useSubAgentData)
      if (canvasSprites.size > 0) {
        ctx.save();
        ctx.fillStyle = "rgba(0, 0, 0, 0.65)";
        ctx.beginPath();
        ctx.roundRect(8, 8, 170, counts.subAgents > 0 ? 38 : 22, 5);
        ctx.fill();

        ctx.font = "bold 10px monospace";
        ctx.fillStyle = "#ecf0f1";
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        ctx.fillText(
          `\uD83E\uDD16 ${counts.total} agent${counts.total !== 1 ? "s" : ""} \u00B7 ${counts.busy} busy`,
          14,
          20,
        );

        if (counts.subAgents > 0) {
          ctx.fillStyle = "#9b59b6";
          ctx.fillText(`\u2B21 ${counts.subAgents} sub-agent${counts.subAgents !== 1 ? "s" : ""}`, 14, 36);
        }

        ctx.restore();
      }

      animRef.current = requestAnimationFrame(animate);
    };

    animRef.current = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(animRef.current);
      resizeObserver?.disconnect();
    };
  }, [showCanvas, updateScale, isConnected, connectionStatus, hoveredAgent, counts]);

  // ── Mobile: show simplified card-list view ──────────────
  if (!showCanvas) {
    return (
      <MobileOfficeView
        sprites={spriteAgents}
        counts={counts}
        isConnected={isConnected}
        connectionStatus={connectionStatus}
        onShowCanvas={() => setForceCanvas(true)}
      />
    );
  }

  // ── Desktop / forced canvas view ───────────────────────
  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 md:px-6 py-3 md:py-4 border-b border-border shrink-0">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base md:text-lg font-semibold text-foreground">
              Pixel Office
            </h2>
            <p className="text-xs md:text-sm text-muted-foreground">
              Real-time visualization of agent activity in a pixel-art office
            </p>
          </div>
          {/* Show "List View" button on mobile when canvas is force-shown */}
          {isMobile && forceCanvas && (
            <button
              onClick={() => setForceCanvas(false)}
              className="text-xs text-primary hover:text-primary/80 font-medium px-3 py-1.5 rounded-md border border-primary/30 hover:bg-primary/5 transition-colors"
              aria-label="Switch to list view"
            >
              List View
            </button>
          )}
        </div>
      </div>

      {/* Canvas container */}
      <div
        ref={containerRef}
        className="flex-1 flex items-center justify-center overflow-hidden bg-[#1a2a1a] dark:bg-[#0a150a] p-2 md:p-4 relative"
      >
        <canvas
          ref={canvasRef}
          width={CANVAS_W}
          height={CANVAS_H}
          style={{
            width: CANVAS_W * canvasScale,
            height: CANVAS_H * canvasScale,
            imageRendering: "pixelated",
            cursor: hoveredAgent ? "pointer" : "default",
          }}
          className="rounded-lg shadow-2xl border border-border/30"
          onMouseMove={handleMouseMove}
          onMouseLeave={() => setHoveredAgent(null)}
        />

        {/* Agent hover tooltip */}
        {hoveredAgent && hoveredSpriteData && (
          <div
            ref={tooltipRef}
            className="absolute pointer-events-none z-50 animate-in fade-in duration-150"
            style={{
              left: tooltipPos.x,
              top: tooltipPos.y,
              transform: "translateY(-100%)",
            }}
          >
            <div className="bg-popover/95 backdrop-blur-sm text-popover-foreground border border-border rounded-lg shadow-xl px-3 py-2.5 min-w-[180px] max-w-[260px]">
              {/* Agent name + type badge */}
              <div className="flex items-center gap-2 mb-1.5">
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ backgroundColor: STATUS_COLORS_HEX[hoveredSpriteData.status] }}
                />
                <span className="font-semibold text-sm truncate">
                  {hoveredSpriteData.name}
                </span>
                {hoveredSpriteData.isSubAgent && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-400 font-medium shrink-0">
                    sub
                  </span>
                )}
              </div>

              {/* Status + Animation */}
              <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                <span>Status</span>
                <span
                  className="font-medium"
                  style={{ color: STATUS_COLORS_HEX[hoveredSpriteData.status] }}
                >
                  {STATUS_LABELS[hoveredSpriteData.status]}
                  {hoveredSpriteData.animation === "celebrating" && " \u2728"}
                  {hoveredSpriteData.animation === "sleeping" && " \uD83D\uDCA4"}
                </span>
              </div>

              {/* Current task */}
              <div className="flex items-start justify-between gap-2 text-xs text-muted-foreground mb-1">
                <span className="shrink-0">Task</span>
                <span className="font-medium text-foreground text-right truncate max-w-[160px]">
                  {hoveredSpriteData.task || "\u2014"}
                </span>
              </div>

              {/* Uptime */}
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Uptime</span>
                <span className="font-mono font-medium text-foreground">
                  {hoveredSpriteData.uptime}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Status legend - responsive */}
      <div className="px-4 md:px-6 py-2 md:py-3 border-t border-border shrink-0 flex flex-wrap gap-2 md:gap-4 text-[10px] md:text-xs text-muted-foreground">
        <span className="font-semibold text-foreground hidden md:inline">Agent Status:</span>
        <span className="flex items-center gap-1 md:gap-1.5">
          <span className="w-2 md:w-2.5 h-2 md:h-2.5 rounded-full bg-[#2ecc71]" /> Idle
        </span>
        <span className="flex items-center gap-1 md:gap-1.5">
          <span className="w-2 md:w-2.5 h-2 md:h-2.5 rounded-full bg-[#f39c12]" /> Busy
        </span>
        <span className="flex items-center gap-1 md:gap-1.5">
          <span className="w-2 md:w-2.5 h-2 md:h-2.5 rounded-full bg-[#e74c3c]" /> Error
        </span>
        <span className="flex items-center gap-1 md:gap-1.5">
          <span className="w-2 md:w-2.5 h-2 md:h-2.5 rounded-full bg-[#3498db]" /> Starting
        </span>
        <span className="flex items-center gap-1 md:gap-1.5">
          <span className="w-2 md:w-2.5 h-2 md:h-2.5 rounded-full bg-[#95a5a6]" /> Offline
        </span>
        <span className="flex items-center gap-1 md:gap-1.5 md:ml-2 md:border-l md:border-border md:pl-4">
          <span className="text-[#9b59b6]">{"\u2B21"}</span> Sub
        </span>
      </div>
    </div>
  );
}
