/**
 * Programmatically generated pixel-art sprites for the office visualization.
 * All sprites are drawn on offscreen canvases - no external assets needed.
 */

// Tile size in pixels
export const TILE_SIZE = 16;

// Color palettes
const PALETTE = {
  // Floor
  floorLight: '#4a6741',
  floorDark: '#3d5636',
  floorAccent: '#567a4c',
  // Carpet
  carpetLight: '#5b4a8a',
  carpetDark: '#4a3d73',
  carpetBorder: '#6b5a9a',
  // Walls
  wallTop: '#8899aa',
  wallFace: '#6b7d8e',
  wallTrim: '#556677',
  wallHighlight: '#99aabb',
  // Desk
  deskTop: '#b08850',
  deskSide: '#8a6a3a',
  deskLeg: '#6b5030',
  deskHighlight: '#c8a060',
  // Computer
  monitorFrame: '#2a2a2e',
  monitorScreen: '#1a3a5a',
  monitorScreenGlow: '#2a5a8a',
  monitorStand: '#333338',
  keyboard: '#3a3a3e',
  keyboardKey: '#4a4a4e',
  // Chair
  chairSeat: '#3a3a4a',
  chairBack: '#2d2d3d',
  chairWheel: '#222228',
  chairHighlight: '#4a4a5a',
  // Plant
  potTerracotta: '#c45c2e',
  potDark: '#a04820',
  plantGreen: '#4a8840',
  plantLight: '#5aaa50',
  plantDark: '#3a7030',
  // Bookshelf
  shelfWood: '#8a6a3a',
  shelfDark: '#6b5030',
  bookRed: '#aa3030',
  bookBlue: '#3040aa',
  bookGreen: '#30aa40',
  bookYellow: '#aaaa30',
  bookPurple: '#7030aa',
  // Water cooler
  coolerBody: '#ddeeff',
  coolerWater: '#4488cc',
  coolerBase: '#8899aa',
  // Whiteboard
  boardWhite: '#eef2f5',
  boardFrame: '#667788',
  boardMarker: '#cc3030',
  boardMarkerGreen: '#30aa40',
  boardMarkerBlue: '#3040aa',
  // Server rack
  serverBody: '#2a2a2e',
  serverFace: '#333338',
  serverLight: '#33cc33',
  serverLightWarn: '#cccc33',
  serverPort: '#1a1a1e',
  // Coffee machine
  coffeeBody: '#3a3a3e',
  coffeeCup: '#ffffff',
  coffeeTop: '#555560',
  coffeeLiquid: '#6b4020',
  // Rug
  rugMain: '#8a4040',
  rugBorder: '#aa5050',
  rugPattern: '#9a3030',
  // Window
  windowFrame: '#667788',
  windowGlass: '#aaccee',
  windowSky: '#88bbdd',
  windowGlare: '#ccddeeff',
  // Lamp
  lampPole: '#888888',
  lampShade: '#ddcc88',
  lampLight: '#ffeeaa',
};

function createCanvas(w: number, h: number): OffscreenCanvas | HTMLCanvasElement {
  if (typeof OffscreenCanvas !== 'undefined') {
    return new OffscreenCanvas(w, h);
  }
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function getCtx(canvas: OffscreenCanvas | HTMLCanvasElement) {
  return canvas.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
}

// Helper: draw a single pixel
function px(ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, x: number, y: number, color: string) {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, 1, 1);
}

// Helper: draw a filled rectangle
function rect(ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string) {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
}

/** Floor tile (16x16) - checkerboard pattern */
export function drawFloorTile(): OffscreenCanvas | HTMLCanvasElement {
  const c = createCanvas(TILE_SIZE, TILE_SIZE);
  const ctx = getCtx(c);
  rect(ctx, 0, 0, TILE_SIZE, TILE_SIZE, PALETTE.floorLight);
  // subtle checkerboard
  for (let y = 0; y < TILE_SIZE; y += 2) {
    for (let x = 0; x < TILE_SIZE; x += 2) {
      if ((x + y) % 4 === 0) {
        px(ctx, x, y, PALETTE.floorDark);
      }
    }
  }
  // accent pixels
  px(ctx, 3, 7, PALETTE.floorAccent);
  px(ctx, 11, 3, PALETTE.floorAccent);
  px(ctx, 7, 13, PALETTE.floorAccent);
  return c;
}

/** Carpet tile (16x16) */
export function drawCarpetTile(): OffscreenCanvas | HTMLCanvasElement {
  const c = createCanvas(TILE_SIZE, TILE_SIZE);
  const ctx = getCtx(c);
  rect(ctx, 0, 0, TILE_SIZE, TILE_SIZE, PALETTE.carpetLight);
  for (let y = 0; y < TILE_SIZE; y += 4) {
    for (let x = 0; x < TILE_SIZE; x += 4) {
      px(ctx, x + 1, y + 1, PALETTE.carpetDark);
      px(ctx, x + 2, y + 3, PALETTE.carpetDark);
    }
  }
  return c;
}

/** Wall tile (16x16) */
export function drawWallTile(): OffscreenCanvas | HTMLCanvasElement {
  const c = createCanvas(TILE_SIZE, TILE_SIZE);
  const ctx = getCtx(c);
  rect(ctx, 0, 0, TILE_SIZE, TILE_SIZE, PALETTE.wallFace);
  // top highlight
  rect(ctx, 0, 0, TILE_SIZE, 2, PALETTE.wallHighlight);
  // bottom trim
  rect(ctx, 0, 14, TILE_SIZE, 2, PALETTE.wallTrim);
  // brick-like pattern
  for (let y = 3; y < 14; y += 4) {
    for (let x = 0; x < TILE_SIZE; x += 8) {
      const offset = (y % 8 === 3) ? 0 : 4;
      rect(ctx, x + offset, y, 7, 3, PALETTE.wallTop);
      // mortar lines
      px(ctx, x + offset + 7, y, PALETTE.wallFace);
      px(ctx, x + offset, y + 3, PALETTE.wallFace);
    }
  }
  return c;
}

/** Desk sprite (32x24) - wider to hold computer */
export function drawDesk(): OffscreenCanvas | HTMLCanvasElement {
  const c = createCanvas(32, 24);
  const ctx = getCtx(c);
  // Desktop surface
  rect(ctx, 1, 8, 30, 4, PALETTE.deskTop);
  rect(ctx, 2, 8, 28, 1, PALETTE.deskHighlight);
  // Front face
  rect(ctx, 1, 12, 30, 3, PALETTE.deskSide);
  // Legs
  rect(ctx, 2, 15, 2, 8, PALETTE.deskLeg);
  rect(ctx, 28, 15, 2, 8, PALETTE.deskLeg);
  // Drawer panel
  rect(ctx, 6, 12, 10, 6, PALETTE.deskSide);
  rect(ctx, 7, 13, 8, 2, PALETTE.deskLeg);
  px(ctx, 11, 14, PALETTE.deskHighlight); // drawer handle
  return c;
}

/** Computer monitor (16x16) */
export function drawMonitor(): OffscreenCanvas | HTMLCanvasElement {
  const c = createCanvas(16, 16);
  const ctx = getCtx(c);
  // Monitor frame
  rect(ctx, 2, 0, 12, 10, PALETTE.monitorFrame);
  // Screen
  rect(ctx, 3, 1, 10, 8, PALETTE.monitorScreen);
  // Screen content - text lines
  rect(ctx, 4, 2, 6, 1, PALETTE.monitorScreenGlow);
  rect(ctx, 4, 4, 8, 1, PALETTE.monitorScreenGlow);
  rect(ctx, 4, 6, 4, 1, PALETTE.monitorScreenGlow);
  // Screen glare
  px(ctx, 11, 2, '#3a6a9a');
  px(ctx, 11, 3, '#3a6a9a');
  // Stand
  rect(ctx, 6, 10, 4, 2, PALETTE.monitorStand);
  rect(ctx, 4, 12, 8, 1, PALETTE.monitorStand);
  // Keyboard
  rect(ctx, 2, 14, 12, 2, PALETTE.keyboard);
  rect(ctx, 3, 14, 2, 1, PALETTE.keyboardKey);
  rect(ctx, 6, 14, 2, 1, PALETTE.keyboardKey);
  rect(ctx, 9, 14, 2, 1, PALETTE.keyboardKey);
  rect(ctx, 3, 15, 8, 1, PALETTE.keyboardKey);
  return c;
}

/** Office chair (16x16) */
export function drawChair(): OffscreenCanvas | HTMLCanvasElement {
  const c = createCanvas(16, 16);
  const ctx = getCtx(c);
  // Chair back
  rect(ctx, 4, 0, 8, 6, PALETTE.chairBack);
  rect(ctx, 5, 1, 6, 4, PALETTE.chairHighlight);
  // Seat
  rect(ctx, 3, 6, 10, 4, PALETTE.chairSeat);
  rect(ctx, 4, 7, 8, 2, PALETTE.chairHighlight);
  // Pole
  rect(ctx, 7, 10, 2, 3, PALETTE.chairWheel);
  // Base/wheels
  rect(ctx, 4, 13, 8, 1, PALETTE.chairWheel);
  px(ctx, 4, 14, PALETTE.chairWheel);
  px(ctx, 7, 14, PALETTE.chairWheel);
  px(ctx, 11, 14, PALETTE.chairWheel);
  return c;
}

/** Plant in pot (16x24) */
export function drawPlant(): OffscreenCanvas | HTMLCanvasElement {
  const c = createCanvas(16, 24);
  const ctx = getCtx(c);
  // Leaves - bushy top
  rect(ctx, 4, 0, 8, 3, PALETTE.plantGreen);
  rect(ctx, 2, 3, 12, 4, PALETTE.plantGreen);
  rect(ctx, 3, 7, 10, 3, PALETTE.plantGreen);
  rect(ctx, 5, 10, 6, 2, PALETTE.plantGreen);
  // Highlights
  px(ctx, 5, 1, PALETTE.plantLight);
  px(ctx, 9, 2, PALETTE.plantLight);
  px(ctx, 3, 4, PALETTE.plantLight);
  px(ctx, 8, 5, PALETTE.plantLight);
  px(ctx, 11, 4, PALETTE.plantLight);
  px(ctx, 6, 8, PALETTE.plantLight);
  // Shadows
  px(ctx, 7, 6, PALETTE.plantDark);
  px(ctx, 4, 5, PALETTE.plantDark);
  px(ctx, 10, 7, PALETTE.plantDark);
  // Stem
  rect(ctx, 7, 12, 2, 2, PALETTE.plantDark);
  // Pot
  rect(ctx, 4, 14, 8, 2, PALETTE.potTerracotta);
  rect(ctx, 3, 14, 10, 1, PALETTE.potTerracotta);
  rect(ctx, 5, 16, 6, 4, PALETTE.potTerracotta);
  rect(ctx, 4, 20, 8, 2, PALETTE.potDark);
  // Pot rim highlight
  px(ctx, 4, 14, '#d07040');
  px(ctx, 5, 14, '#d07040');
  return c;
}

/** Bookshelf (32x32) */
export function drawBookshelf(): OffscreenCanvas | HTMLCanvasElement {
  const c = createCanvas(32, 32);
  const ctx = getCtx(c);
  // Main frame
  rect(ctx, 0, 0, 32, 32, PALETTE.shelfWood);
  rect(ctx, 1, 0, 30, 32, PALETTE.shelfDark);
  // Shelves (horizontal boards)
  rect(ctx, 0, 0, 32, 2, PALETTE.shelfWood);   // top
  rect(ctx, 0, 10, 32, 2, PALETTE.shelfWood);  // middle-top
  rect(ctx, 0, 20, 32, 2, PALETTE.shelfWood);  // middle-bottom
  rect(ctx, 0, 30, 32, 2, PALETTE.shelfWood);  // bottom
  // Side panels
  rect(ctx, 0, 0, 2, 32, PALETTE.shelfWood);
  rect(ctx, 30, 0, 2, 32, PALETTE.shelfWood);
  // Books on top shelf
  const topBooks = [
    { x: 3, w: 3, h: 8, color: PALETTE.bookRed },
    { x: 6, w: 2, h: 7, color: PALETTE.bookBlue },
    { x: 9, w: 3, h: 8, color: PALETTE.bookGreen },
    { x: 13, w: 2, h: 6, color: PALETTE.bookYellow },
    { x: 16, w: 3, h: 8, color: PALETTE.bookPurple },
    { x: 20, w: 2, h: 7, color: PALETTE.bookRed },
    { x: 23, w: 3, h: 8, color: PALETTE.bookBlue },
    { x: 27, w: 2, h: 7, color: PALETTE.bookGreen },
  ];
  topBooks.forEach(b => rect(ctx, b.x, 10 - b.h, b.w, b.h, b.color));
  // Books on middle shelf
  const midBooks = [
    { x: 3, w: 4, h: 8, color: PALETTE.bookGreen },
    { x: 8, w: 2, h: 7, color: PALETTE.bookYellow },
    { x: 11, w: 3, h: 8, color: PALETTE.bookRed },
    { x: 15, w: 2, h: 6, color: PALETTE.bookBlue },
    { x: 18, w: 3, h: 8, color: PALETTE.bookPurple },
    { x: 22, w: 4, h: 7, color: PALETTE.bookYellow },
    { x: 27, w: 2, h: 8, color: PALETTE.bookRed },
  ];
  midBooks.forEach(b => rect(ctx, b.x, 20 - b.h, b.w, b.h, b.color));
  // Bottom shelf - fewer books, some space
  const botBooks = [
    { x: 3, w: 3, h: 8, color: PALETTE.bookBlue },
    { x: 7, w: 2, h: 7, color: PALETTE.bookRed },
    { x: 10, w: 4, h: 8, color: PALETTE.bookGreen },
    { x: 22, w: 3, h: 8, color: PALETTE.bookPurple },
    { x: 26, w: 3, h: 7, color: PALETTE.bookYellow },
  ];
  botBooks.forEach(b => rect(ctx, b.x, 30 - b.h, b.w, b.h, b.color));
  return c;
}

/** Water cooler (16x32) */
export function drawWaterCooler(): OffscreenCanvas | HTMLCanvasElement {
  const c = createCanvas(16, 32);
  const ctx = getCtx(c);
  // Water jug on top
  rect(ctx, 4, 0, 8, 3, PALETTE.coolerBody);
  rect(ctx, 3, 3, 10, 8, PALETTE.coolerWater);
  rect(ctx, 4, 4, 8, 6, '#5599dd');  // water highlight
  px(ctx, 5, 5, '#88ccff');
  // Dispenser body
  rect(ctx, 2, 11, 12, 14, PALETTE.coolerBody);
  rect(ctx, 3, 12, 10, 12, '#ccddeee0');
  // Taps
  rect(ctx, 4, 16, 3, 2, '#cc3030');  // hot
  rect(ctx, 9, 16, 3, 2, '#3060cc');  // cold
  // Drip tray
  rect(ctx, 3, 23, 10, 1, PALETTE.coolerBase);
  // Legs/base
  rect(ctx, 3, 25, 10, 5, PALETTE.coolerBase);
  rect(ctx, 4, 30, 3, 2, PALETTE.coolerBase);
  rect(ctx, 9, 30, 3, 2, PALETTE.coolerBase);
  return c;
}

/** Whiteboard (32x24) */
export function drawWhiteboard(): OffscreenCanvas | HTMLCanvasElement {
  const c = createCanvas(32, 24);
  const ctx = getCtx(c);
  // Frame
  rect(ctx, 0, 0, 32, 24, PALETTE.boardFrame);
  // White surface
  rect(ctx, 2, 2, 28, 18, PALETTE.boardWhite);
  // Content - diagrams/text
  rect(ctx, 4, 4, 10, 1, PALETTE.boardMarker);
  rect(ctx, 4, 7, 8, 1, PALETTE.boardMarkerBlue);
  rect(ctx, 4, 10, 12, 1, PALETTE.boardMarkerGreen);
  // Box diagram
  rect(ctx, 18, 4, 8, 6, 'transparent');
  ctx.strokeStyle = PALETTE.boardMarker;
  // Draw box manually with pixels
  rect(ctx, 18, 4, 8, 1, PALETTE.boardMarker);
  rect(ctx, 18, 9, 8, 1, PALETTE.boardMarker);
  rect(ctx, 18, 4, 1, 6, PALETTE.boardMarker);
  rect(ctx, 25, 4, 1, 6, PALETTE.boardMarker);
  // Arrow
  rect(ctx, 20, 11, 1, 3, PALETTE.boardMarker);
  px(ctx, 19, 13, PALETTE.boardMarker);
  px(ctx, 21, 13, PALETTE.boardMarker);
  // Marker tray
  rect(ctx, 2, 20, 28, 2, PALETTE.boardFrame);
  // Markers on tray
  rect(ctx, 4, 20, 4, 1, PALETTE.boardMarker);
  rect(ctx, 9, 20, 4, 1, PALETTE.boardMarkerBlue);
  rect(ctx, 14, 20, 4, 1, PALETTE.boardMarkerGreen);
  return c;
}

/** Server rack (24x32) */
export function drawServerRack(): OffscreenCanvas | HTMLCanvasElement {
  const c = createCanvas(24, 32);
  const ctx = getCtx(c);
  // Outer frame
  rect(ctx, 0, 0, 24, 32, PALETTE.serverBody);
  rect(ctx, 1, 1, 22, 30, PALETTE.serverFace);
  // Server units
  for (let i = 0; i < 5; i++) {
    const y = 2 + i * 6;
    rect(ctx, 2, y, 20, 5, PALETTE.serverBody);
    rect(ctx, 3, y + 1, 18, 3, PALETTE.serverPort);
    // Status lights
    px(ctx, 4, y + 2, PALETTE.serverLight);
    px(ctx, 6, y + 2, PALETTE.serverLight);
    px(ctx, 8, y + 2, i === 2 ? PALETTE.serverLightWarn : PALETTE.serverLight);
    // Ventilation lines
    for (let vx = 12; vx < 20; vx += 2) {
      px(ctx, vx, y + 2, '#222228');
    }
  }
  return c;
}

/** Coffee machine (16x20) */
export function drawCoffeeMachine(): OffscreenCanvas | HTMLCanvasElement {
  const c = createCanvas(16, 20);
  const ctx = getCtx(c);
  // Body
  rect(ctx, 2, 2, 12, 14, PALETTE.coffeeBody);
  rect(ctx, 3, 0, 10, 2, PALETTE.coffeeTop);
  // Front panel
  rect(ctx, 4, 4, 8, 6, '#4a4a50');
  // Buttons
  px(ctx, 5, 5, '#33cc33');
  px(ctx, 7, 5, '#cc3333');
  px(ctx, 9, 5, '#3333cc');
  // Dispenser area
  rect(ctx, 5, 11, 6, 3, '#1a1a1e');
  // Cup
  rect(ctx, 6, 12, 4, 3, PALETTE.coffeeCup);
  rect(ctx, 7, 12, 2, 1, PALETTE.coffeeLiquid);
  // Base
  rect(ctx, 1, 16, 14, 2, PALETTE.coffeeBody);
  rect(ctx, 2, 18, 12, 2, '#2a2a2e');
  return c;
}

/** Area rug (48x32) */
export function drawRug(): OffscreenCanvas | HTMLCanvasElement {
  const c = createCanvas(48, 32);
  const ctx = getCtx(c);
  // Border
  rect(ctx, 0, 0, 48, 32, PALETTE.rugBorder);
  // Inner
  rect(ctx, 2, 2, 44, 28, PALETTE.rugMain);
  // Pattern - diamond shapes
  for (let y = 4; y < 28; y += 8) {
    for (let x = 4; x < 44; x += 12) {
      // Diamond
      px(ctx, x + 3, y, PALETTE.rugPattern);
      px(ctx, x + 2, y + 1, PALETTE.rugPattern);
      px(ctx, x + 4, y + 1, PALETTE.rugPattern);
      px(ctx, x + 1, y + 2, PALETTE.rugPattern);
      px(ctx, x + 5, y + 2, PALETTE.rugPattern);
      px(ctx, x + 2, y + 3, PALETTE.rugPattern);
      px(ctx, x + 4, y + 3, PALETTE.rugPattern);
      px(ctx, x + 3, y + 4, PALETTE.rugPattern);
    }
  }
  return c;
}

/** Window with sky view (32x24) */
export function drawWindow(): OffscreenCanvas | HTMLCanvasElement {
  const c = createCanvas(32, 24);
  const ctx = getCtx(c);
  // Frame outer
  rect(ctx, 0, 0, 32, 24, PALETTE.windowFrame);
  // Glass panes (2x2 grid)
  rect(ctx, 2, 2, 13, 9, PALETTE.windowGlass);
  rect(ctx, 17, 2, 13, 9, PALETTE.windowGlass);
  rect(ctx, 2, 13, 13, 9, PALETTE.windowGlass);
  rect(ctx, 17, 13, 13, 9, PALETTE.windowGlass);
  // Sky gradient in panes
  rect(ctx, 3, 3, 11, 3, PALETTE.windowSky);
  rect(ctx, 18, 3, 11, 3, PALETTE.windowSky);
  // Cloud hints
  rect(ctx, 5, 4, 4, 2, '#ccddee');
  rect(ctx, 20, 5, 5, 2, '#ccddee');
  // Glare
  px(ctx, 4, 3, '#ddeeff');
  px(ctx, 5, 3, '#ddeeff');
  px(ctx, 19, 3, '#ddeeff');
  return c;
}

/** Floor lamp (8x32) */
export function drawLamp(): OffscreenCanvas | HTMLCanvasElement {
  const c = createCanvas(12, 32);
  const ctx = getCtx(c);
  // Shade
  rect(ctx, 1, 0, 10, 6, PALETTE.lampShade);
  rect(ctx, 2, 1, 8, 4, PALETTE.lampLight);
  // Light glow effect
  px(ctx, 0, 3, PALETTE.lampLight);
  px(ctx, 11, 3, PALETTE.lampLight);
  // Pole
  rect(ctx, 5, 6, 2, 22, PALETTE.lampPole);
  // Base
  rect(ctx, 2, 28, 8, 2, PALETTE.lampPole);
  rect(ctx, 3, 30, 6, 2, PALETTE.lampPole);
  return c;
}

/**
 * Office tilemap layout definition.
 * 0 = floor, 1 = wall, 2 = carpet
 * Furniture is placed separately as sprites on top.
 */
export const OFFICE_MAP_COLS = 30;
export const OFFICE_MAP_ROWS = 20;

// Generate the tilemap: top 3 rows are walls, rest is floor with carpet areas
export function generateTilemap(): number[][] {
  const map: number[][] = [];
  for (let r = 0; r < OFFICE_MAP_ROWS; r++) {
    const row: number[] = [];
    for (let c = 0; c < OFFICE_MAP_COLS; c++) {
      if (r < 3) {
        row.push(1); // wall
      } else if (r >= 8 && r <= 14 && c >= 10 && c <= 20) {
        row.push(2); // carpet in meeting area
      } else {
        row.push(0); // floor
      }
    }
    map.push(row);
  }
  return map;
}

/** Furniture placement definitions */
export interface FurniturePlacement {
  type: 'desk' | 'monitor' | 'chair' | 'plant' | 'bookshelf' | 'watercooler' | 'whiteboard' | 'server' | 'coffee' | 'rug' | 'window' | 'lamp';
  x: number; // tile x
  y: number; // tile y
  label?: string;
}

export function getOfficeFurniture(): FurniturePlacement[] {
  return [
    // Windows on wall
    { type: 'window', x: 3, y: 0, label: 'Window' },
    { type: 'window', x: 9, y: 0, label: 'Window' },
    { type: 'window', x: 17, y: 0, label: 'Window' },
    { type: 'window', x: 23, y: 0, label: 'Window' },

    // Whiteboard on wall
    { type: 'whiteboard', x: 13, y: 0.5, label: 'Sprint Board' },

    // Row of workstations (left area)
    { type: 'desk', x: 1, y: 4, label: 'Desk 1' },
    { type: 'monitor', x: 2, y: 3, label: 'Monitor 1' },
    { type: 'chair', x: 2, y: 6, label: 'Chair 1' },

    { type: 'desk', x: 5, y: 4, label: 'Desk 2' },
    { type: 'monitor', x: 6, y: 3, label: 'Monitor 2' },
    { type: 'chair', x: 6, y: 6, label: 'Chair 2' },

    // Row of workstations (right area)
    { type: 'desk', x: 21, y: 4, label: 'Desk 3' },
    { type: 'monitor', x: 22, y: 3, label: 'Monitor 3' },
    { type: 'chair', x: 22, y: 6, label: 'Chair 3' },

    { type: 'desk', x: 25, y: 4, label: 'Desk 4' },
    { type: 'monitor', x: 26, y: 3, label: 'Monitor 4' },
    { type: 'chair', x: 26, y: 6, label: 'Chair 4' },

    // Meeting area rug
    { type: 'rug', x: 11, y: 9, label: 'Meeting Area' },

    // Second row of workstations
    { type: 'desk', x: 1, y: 15, label: 'Desk 5' },
    { type: 'monitor', x: 2, y: 14, label: 'Monitor 5' },
    { type: 'chair', x: 2, y: 17, label: 'Chair 5' },

    { type: 'desk', x: 5, y: 15, label: 'Desk 6' },
    { type: 'monitor', x: 6, y: 14, label: 'Monitor 6' },
    { type: 'chair', x: 6, y: 17, label: 'Chair 6' },

    { type: 'desk', x: 21, y: 15, label: 'Desk 7' },
    { type: 'monitor', x: 22, y: 14, label: 'Monitor 7' },
    { type: 'chair', x: 22, y: 17, label: 'Chair 7' },

    { type: 'desk', x: 25, y: 15, label: 'Desk 8' },
    { type: 'monitor', x: 26, y: 14, label: 'Monitor 8' },
    { type: 'chair', x: 26, y: 17, label: 'Chair 8' },

    // Plants
    { type: 'plant', x: 0, y: 3, label: 'Plant' },
    { type: 'plant', x: 9, y: 4, label: 'Plant' },
    { type: 'plant', x: 20, y: 3, label: 'Plant' },
    { type: 'plant', x: 29, y: 3, label: 'Plant' },
    { type: 'plant', x: 0, y: 14, label: 'Plant' },
    { type: 'plant', x: 9, y: 15, label: 'Plant' },
    { type: 'plant', x: 29, y: 14, label: 'Plant' },

    // Bookshelf
    { type: 'bookshelf', x: 10, y: 3, label: 'Library' },

    // Server rack (IT corner)
    { type: 'server', x: 27, y: 9, label: 'Server Rack' },

    // Water cooler
    { type: 'watercooler', x: 20, y: 9, label: 'Water Cooler' },

    // Coffee machine
    { type: 'coffee', x: 10, y: 16, label: 'Coffee Machine' },

    // Lamps
    { type: 'lamp', x: 0, y: 8, label: 'Lamp' },
    { type: 'lamp', x: 29, y: 8, label: 'Lamp' },
    { type: 'lamp', x: 14, y: 14, label: 'Lamp' },
  ];
}
