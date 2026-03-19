/**
 * SpriteManager — orchestrates all agent sprites within the pixel office.
 *
 * Responsibilities:
 * - Tracks active agent sprites by ID
 * - Handles spawn/despawn lifecycle
 * - Assigns desk positions within the office layout
 * - Drives per-frame updates for all sprites
 * - Syncs with AgentInfo[] from the real-time state
 */

import { Container } from "pixi.js";
import { AgentSprite, type AgentSpriteOptions } from "./agent-sprite";
import type { AgentInfo, AgentStatus } from "../types/events";

// ── Desk Position Layout ────────────────────────────────────

export interface DeskPosition {
  x: number;
  y: number;
  occupied: boolean;
}

/**
 * Generate a grid of desk positions within the given area.
 * Desks are arranged in rows with spacing.
 */
function generateDeskGrid(
  areaWidth: number,
  areaHeight: number,
  cols = 4,
  rows = 3,
  paddingX = 80,
  paddingY = 60
): DeskPosition[] {
  const positions: DeskPosition[] = [];
  const usableW = areaWidth - paddingX * 2;
  const usableH = areaHeight - paddingY * 2;
  const cellW = usableW / cols;
  const cellH = usableH / rows;

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      positions.push({
        x: paddingX + col * cellW + cellW / 2 - 24,
        y: paddingY + row * cellH + cellH / 2 - 36,
        occupied: false,
      });
    }
  }

  return positions;
}

// ── SpriteManager Class ─────────────────────────────────────

export class SpriteManager {
  /** Container holding all agent sprite containers */
  readonly agentLayer: Container;

  private sprites = new Map<string, AgentSprite>();
  private deskPositions: DeskPosition[] = [];
  private _areaWidth: number;
  private _areaHeight: number;

  constructor(areaWidth: number, areaHeight: number) {
    this.agentLayer = new Container();
    this.agentLayer.label = "agent-layer";
    this._areaWidth = areaWidth;
    this._areaHeight = areaHeight;
    this.rebuildDeskGrid();
  }

  // ── Public API ──────────────────────────────────────────

  /**
   * Sync sprites with the latest agent list.
   * - New agents are spawned
   * - Missing agents are despawned
   * - Existing agents are updated
   */
  syncAgents(agents: AgentInfo[]) {
    const incomingIds = new Set(agents.map((a) => a.id));

    // Despawn agents that are no longer in the list
    for (const [id, sprite] of this.sprites) {
      if (!incomingIds.has(id) && sprite.phase !== "despawning" && sprite.phase !== "removed") {
        sprite.despawn();
      }
    }

    // Add or update agents
    for (const agent of agents) {
      const existing = this.sprites.get(agent.id);
      if (existing) {
        // Update status
        existing.setStatus(agent.status);
      } else {
        // Spawn new agent
        this.spawnAgent({
          id: agent.id,
          name: agent.name,
          status: agent.status,
        });
      }
    }
  }

  /**
   * Spawn a new agent sprite at an available desk position.
   */
  spawnAgent(options: AgentSpriteOptions): AgentSprite | null {
    if (this.sprites.has(options.id)) {
      return this.sprites.get(options.id)!;
    }

    const desk = this.claimDesk();
    if (!desk) {
      // No desk available — grow the grid
      this.expandDesks();
      const newDesk = this.claimDesk();
      if (!newDesk) return null;
      return this.spawnAtDesk(options, newDesk);
    }

    return this.spawnAtDesk(options, desk);
  }

  /**
   * Despawn an agent by ID.
   */
  despawnAgent(id: string) {
    const sprite = this.sprites.get(id);
    if (sprite) {
      sprite.despawn();
    }
  }

  /**
   * Update all sprites. Call every frame.
   */
  update(deltaMs: number) {
    const toRemove: string[] = [];

    for (const [id, sprite] of this.sprites) {
      sprite.update(deltaMs);

      if (sprite.phase === "removed") {
        toRemove.push(id);
      }
    }

    // Clean up removed sprites
    for (const id of toRemove) {
      const sprite = this.sprites.get(id)!;
      this.releaseDesk(sprite.container.x, sprite.container.y);
      sprite.destroy();
      this.agentLayer.removeChild(sprite.container);
      this.sprites.delete(id);
    }
  }

  /**
   * Resize the office area and recompute desk positions.
   */
  resize(width: number, height: number) {
    this._areaWidth = width;
    this._areaHeight = height;
    this.rebuildDeskGrid();
    this.redistributeSprites();
  }

  /**
   * Get the number of active (non-removed) sprites.
   */
  get count(): number {
    return this.sprites.size;
  }

  /**
   * Get all active sprites.
   */
  getSprites(): AgentSprite[] {
    return Array.from(this.sprites.values());
  }

  /**
   * Get a sprite by agent ID.
   */
  getSprite(id: string): AgentSprite | undefined {
    return this.sprites.get(id);
  }

  /**
   * Clean up everything.
   */
  destroy() {
    for (const sprite of this.sprites.values()) {
      sprite.destroy();
    }
    this.sprites.clear();
    this.agentLayer.destroy({ children: true });
  }

  // ── Private ─────────────────────────────────────────────

  private spawnAtDesk(options: AgentSpriteOptions, desk: DeskPosition): AgentSprite {
    const sprite = new AgentSprite({
      ...options,
      x: desk.x,
      y: desk.y,
    });

    this.sprites.set(options.id, sprite);
    this.agentLayer.addChild(sprite.container);
    return sprite;
  }

  private claimDesk(): DeskPosition | null {
    const free = this.deskPositions.find((d) => !d.occupied);
    if (free) {
      free.occupied = true;
      return free;
    }
    return null;
  }

  private releaseDesk(x: number, y: number) {
    // Find the closest desk to this position and release it
    let closest: DeskPosition | null = null;
    let closestDist = Infinity;

    for (const desk of this.deskPositions) {
      if (!desk.occupied) continue;
      const dx = desk.x - x;
      const dy = desk.y - y;
      const dist = dx * dx + dy * dy;
      if (dist < closestDist) {
        closest = desk;
        closestDist = dist;
      }
    }

    if (closest && closestDist < 100 * 100) {
      closest.occupied = false;
    }
  }

  private expandDesks() {
    // Add more desk positions by increasing the grid
    const currentCount = this.deskPositions.length;
    const newCols = Math.ceil(Math.sqrt(currentCount + 4));
    const newRows = Math.ceil((currentCount + 4) / newCols);
    this.deskPositions = generateDeskGrid(
      this._areaWidth,
      this._areaHeight,
      newCols,
      newRows
    );

    // Re-mark occupied desks
    for (const sprite of this.sprites.values()) {
      const desk = this.findClosestFreeDesk(sprite.container.x, sprite.container.y);
      if (desk) desk.occupied = true;
    }
  }

  private findClosestFreeDesk(x: number, y: number): DeskPosition | null {
    let closest: DeskPosition | null = null;
    let closestDist = Infinity;

    for (const desk of this.deskPositions) {
      if (desk.occupied) continue;
      const dx = desk.x - x;
      const dy = desk.y - y;
      const dist = dx * dx + dy * dy;
      if (dist < closestDist) {
        closest = desk;
        closestDist = dist;
      }
    }

    return closest;
  }

  private rebuildDeskGrid() {
    const totalSprites = Math.max(this.sprites.size, 12);
    const cols = Math.max(4, Math.ceil(Math.sqrt(totalSprites)));
    const rows = Math.max(3, Math.ceil(totalSprites / cols));
    this.deskPositions = generateDeskGrid(
      this._areaWidth,
      this._areaHeight,
      cols,
      rows
    );
  }

  private redistributeSprites() {
    // Reset all desks
    for (const desk of this.deskPositions) {
      desk.occupied = false;
    }

    // Re-assign each sprite to nearest free desk
    for (const sprite of this.sprites.values()) {
      const desk = this.claimDesk();
      if (desk) {
        sprite.moveTo(desk.x, desk.y);
      }
    }
  }
}
