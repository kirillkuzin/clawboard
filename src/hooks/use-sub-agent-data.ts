"use client";

/**
 * useSubAgentData — Real-time sub-agent data hook for the pixel-art office.
 *
 * Consumes the RealtimeProvider context and transforms raw agent/sub-agent
 * data into sprite-ready objects with lifecycle management, animation state
 * derivation, position assignment, and transition tracking.
 *
 * Features:
 *   - Merges main agents and sub-agents into a unified sprite list
 *   - Tracks lifecycle phases: spawning → active → despawning → gone
 *   - Derives animation state from agent status + lifecycle
 *   - Assigns deterministic grid positions (stable across updates)
 *   - Emits transition events so the PixiJS renderer can animate changes
 *   - Auto-cleans despawned sprites after animation completes
 *   - Provides summary counts for UI badges
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRealtime } from "./use-realtime";
import type { AgentInfo, AgentStatus, SubAgentInfo } from "@/lib/types/events";
import type {
  SpriteAgent,
  SpriteAnimation,
  SpriteLifecycle,
  SpritePosition,
  SpriteTransition,
  SubAgentDataResult,
} from "@/lib/types/sprites";

// ── Configuration ─────────────────────────────────────────────

/** How long (ms) the "spawning" phase lasts before transitioning to "active" */
const SPAWN_DURATION_MS = 800;

/** How long (ms) the "despawning" phase lasts before the sprite is removed */
const DESPAWN_DURATION_MS = 1200;

/** How long (ms) before a "celebrating" animation reverts to idle */
const CELEBRATE_DURATION_MS = 1500;

/** Office grid dimensions for position assignment */
const GRID_COLS = 8;
const GRID_ROWS = 6;

// ── Helpers ───────────────────────────────────────────────────

/** Simple hash for deterministic color seeding */
function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    hash = ((hash << 5) - hash + ch) | 0;
  }
  return Math.abs(hash);
}

/** Assign a deterministic grid position based on agent ID */
function assignPosition(id: string, index: number): SpritePosition {
  const h = hashString(id);
  // Use hash + index to spread agents across the grid
  // Prefer hash-based for stability, fall back to index for collisions
  const x = (h + index) % GRID_COLS;
  const y = Math.floor(((h >> 4) + index) / GRID_COLS) % GRID_ROWS;
  return { x, y };
}

/** Derive the animation state from lifecycle phase and agent status */
function deriveAnimation(
  lifecycle: SpriteLifecycle,
  agentStatus: AgentStatus,
  prevAnimation?: SpriteAnimation
): SpriteAnimation {
  switch (lifecycle) {
    case "spawning":
      return "spawning";
    case "despawning":
      return "despawning";
    case "gone":
      return "despawning";
    case "active":
      // If we just completed a transition to idle from busy, celebrate briefly
      if (
        agentStatus === "idle" &&
        prevAnimation === "working"
      ) {
        return "celebrating";
      }
      switch (agentStatus) {
        case "busy":
          return "working";
        case "error":
          return "error";
        case "offline":
          return "sleeping";
        case "starting":
          return "spawning";
        case "idle":
        default:
          return "idle";
      }
  }
}

/** Convert an AgentInfo to the canonical key used in the sprite map */
function agentKey(agent: AgentInfo | SubAgentInfo): string {
  return agent.id;
}

// ── Hook ──────────────────────────────────────────────────────

export function useSubAgentData(): SubAgentDataResult {
  const {
    agents,
    subAgents,
    connection,
    activeTransport,
    refresh,
  } = useRealtime();

  // Persistent sprite map — keyed by agent ID
  // Using a ref so we can mutate without causing re-renders on every tick
  const spriteMapRef = useRef<Map<string, SpriteAgent>>(new Map());

  // Transition queue — cleared after each consumption
  const transitionsRef = useRef<SpriteTransition[]>([]);

  // Track IDs that are currently celebrating (for timed revert)
  const celebratingRef = useRef<Map<string, number>>(new Map());

  // State that triggers re-renders (updated via reconcile)
  const [sprites, setSprites] = useState<SpriteAgent[]>([]);
  const [transitions, setTransitions] = useState<SpriteTransition[]>([]);

  // Reconciliation: merge incoming agent data into the sprite map
  const reconcile = useCallback(() => {
    const now = Date.now();
    const map = spriteMapRef.current;
    const newTransitions: SpriteTransition[] = [];

    // Build a set of all currently known agent IDs from the API
    const liveIds = new Set<string>();

    // Helper to process an agent (main or sub)
    const processAgent = (
      id: string,
      name: string,
      status: AgentStatus,
      isSubAgent: boolean,
      parentId: string | undefined,
      currentTask: string | undefined,
      lastSeen: number,
      index: number
    ) => {
      liveIds.add(id);
      const existing = map.get(id);

      if (!existing) {
        // New agent — spawn it
        const lifecycle: SpriteLifecycle = "spawning";
        const animation = deriveAnimation(lifecycle, status);
        const sprite: SpriteAgent = {
          id,
          name,
          isSubAgent,
          parentId,
          agentStatus: status,
          lifecycle,
          animation,
          position: assignPosition(id, index),
          currentTask,
          spawnedAt: now,
          lastUpdated: now,
          phaseAge: 0,
          colorSeed: hashString(id),
        };
        map.set(id, sprite);
        newTransitions.push({
          spriteId: id,
          from: { lifecycle: "gone", animation: "despawning", agentStatus: "offline" },
          to: { lifecycle, animation, agentStatus: status },
          timestamp: now,
        });
      } else if (existing.lifecycle === "despawning" || existing.lifecycle === "gone") {
        // Agent came back — respawn
        const lifecycle: SpriteLifecycle = "spawning";
        const animation = deriveAnimation(lifecycle, status);
        const updated: SpriteAgent = {
          ...existing,
          name,
          agentStatus: status,
          lifecycle,
          animation,
          previousAnimation: existing.animation,
          currentTask,
          spawnedAt: now,
          lastUpdated: now,
          despawnStartedAt: undefined,
          phaseAge: 0,
        };
        map.set(id, updated);
        newTransitions.push({
          spriteId: id,
          from: {
            lifecycle: existing.lifecycle,
            animation: existing.animation,
            agentStatus: existing.agentStatus,
          },
          to: { lifecycle, animation, agentStatus: status },
          timestamp: now,
        });
      } else {
        // Existing active agent — check for status changes
        const statusChanged = existing.agentStatus !== status;
        const taskChanged = existing.currentTask !== currentTask;

        if (statusChanged || taskChanged) {
          const prevAnim = existing.animation;
          const newAnim = statusChanged
            ? deriveAnimation(existing.lifecycle, status, prevAnim)
            : existing.animation;

          const updated: SpriteAgent = {
            ...existing,
            name,
            agentStatus: status,
            animation: newAnim,
            previousAnimation: statusChanged ? prevAnim : existing.previousAnimation,
            currentTask,
            lastUpdated: now,
            phaseAge: statusChanged ? 0 : existing.phaseAge,
          };
          map.set(id, updated);

          if (statusChanged) {
            newTransitions.push({
              spriteId: id,
              from: {
                lifecycle: existing.lifecycle,
                animation: prevAnim,
                agentStatus: existing.agentStatus,
              },
              to: {
                lifecycle: existing.lifecycle,
                animation: newAnim,
                agentStatus: status,
              },
              timestamp: now,
            });

            // Track celebrating agents for timed revert
            if (newAnim === "celebrating") {
              celebratingRef.current.set(id, now);
            }
          }
        } else {
          // No change — just update phase age
          map.set(id, {
            ...existing,
            lastUpdated: now,
            phaseAge: now - existing.spawnedAt,
          });
        }
      }
    };

    // Process main agents
    agents.forEach((agent, idx) => {
      processAgent(
        agentKey(agent),
        agent.name,
        agent.status,
        false,
        undefined,
        agent.currentTask,
        agent.lastSeen,
        idx
      );
    });

    // Process sub-agents
    subAgents.forEach((sub, idx) => {
      processAgent(
        agentKey(sub),
        sub.name,
        sub.status,
        true,
        sub.parentAgentId,
        sub.task,
        sub.lastSeen,
        agents.length + idx
      );
    });

    // Detect disappeared agents — start despawning
    for (const [id, sprite] of map.entries()) {
      if (
        !liveIds.has(id) &&
        sprite.lifecycle !== "despawning" &&
        sprite.lifecycle !== "gone"
      ) {
        const animation = deriveAnimation("despawning", sprite.agentStatus);
        const updated: SpriteAgent = {
          ...sprite,
          lifecycle: "despawning",
          animation,
          previousAnimation: sprite.animation,
          despawnStartedAt: now,
          lastUpdated: now,
          phaseAge: 0,
        };
        map.set(id, updated);
        newTransitions.push({
          spriteId: id,
          from: {
            lifecycle: sprite.lifecycle,
            animation: sprite.animation,
            agentStatus: sprite.agentStatus,
          },
          to: {
            lifecycle: "despawning",
            animation,
            agentStatus: sprite.agentStatus,
          },
          timestamp: now,
        });
      }
    }

    // Advance lifecycle phases based on timing
    for (const [id, sprite] of map.entries()) {
      if (
        sprite.lifecycle === "spawning" &&
        now - sprite.spawnedAt >= SPAWN_DURATION_MS
      ) {
        // Spawning → active
        const animation = deriveAnimation("active", sprite.agentStatus);
        map.set(id, {
          ...sprite,
          lifecycle: "active",
          animation,
          previousAnimation: sprite.animation,
          phaseAge: 0,
          lastUpdated: now,
        });
      } else if (
        sprite.lifecycle === "despawning" &&
        sprite.despawnStartedAt &&
        now - sprite.despawnStartedAt >= DESPAWN_DURATION_MS
      ) {
        // Despawning → gone (remove from map)
        map.delete(id);
      }
    }

    // Revert celebrating agents back to idle after timeout
    for (const [id, startTime] of celebratingRef.current.entries()) {
      if (now - startTime >= CELEBRATE_DURATION_MS) {
        celebratingRef.current.delete(id);
        const sprite = map.get(id);
        if (sprite && sprite.animation === "celebrating") {
          map.set(id, {
            ...sprite,
            animation: "idle",
            previousAnimation: "celebrating",
            lastUpdated: now,
          });
        }
      }
    }

    // Convert map to sorted array
    const sortedSprites = Array.from(map.values()).sort((a, b) => {
      // Main agents first, then sub-agents
      if (a.isSubAgent !== b.isSubAgent) return a.isSubAgent ? 1 : -1;
      // Then by spawn time (oldest first for stable ordering)
      return a.spawnedAt - b.spawnedAt;
    });

    // Update state
    transitionsRef.current = newTransitions;
    setSprites(sortedSprites);
    setTransitions(newTransitions);
  }, [agents, subAgents]);

  // Run reconciliation whenever agents or subAgents change
  useEffect(() => {
    reconcile();
  }, [reconcile]);

  // Periodic tick for lifecycle phase advancement (spawning → active, despawning → gone)
  useEffect(() => {
    const timer = setInterval(() => {
      reconcile();
    }, 200); // 5 FPS tick rate for lifecycle advancement
    return () => clearInterval(timer);
  }, [reconcile]);

  // Compute summary counts
  const counts = useMemo(() => {
    const result = {
      total: 0,
      idle: 0,
      busy: 0,
      error: 0,
      offline: 0,
      starting: 0,
      subAgents: 0,
    };
    for (const sprite of sprites) {
      if (sprite.lifecycle === "gone") continue;
      result.total++;
      if (sprite.isSubAgent) result.subAgents++;
      switch (sprite.agentStatus) {
        case "idle":
          result.idle++;
          break;
        case "busy":
          result.busy++;
          break;
        case "error":
          result.error++;
          break;
        case "offline":
          result.offline++;
          break;
        case "starting":
          result.starting++;
          break;
      }
    }
    return result;
  }, [sprites]);

  const isConnected = connection.status === "connected";
  const isLoading = connection.status === "connecting";

  return {
    sprites,
    transitions,
    counts,
    isLoading,
    isConnected,
    transport: activeTransport,
    refresh,
  };
}
