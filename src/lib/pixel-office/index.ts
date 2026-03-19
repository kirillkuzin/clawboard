/**
 * Pixel Office module — programmatic pixel-art agent visualization.
 */

export {
  generateSpriteSheet,
  generateSingleFrame,
  generateSpriteDataUrl,
  generatePreviewStrip,
  traitsFromSeed,
  getFrameRange,
  getAbsoluteFrame,
  SPRITE_W,
  SPRITE_H,
  TOTAL_FRAMES,
  FRAME_COUNTS,
  FRAME_OFFSETS,
  ANIMATION_TIMING,
  type AnimationState,
  type CharacterTraits,
} from "./sprite-generator";

export {
  AgentSprite,
  clearSpriteCache,
  type AgentSpriteOptions,
  type SpritePhase,
} from "./agent-sprite";

export {
  SpriteManager,
  type DeskPosition,
} from "./sprite-manager";
