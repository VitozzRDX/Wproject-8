/** Центр первого гекса 0.0
 * Смещаем на GRID_OFFSET_X
*/
import { hexLabel } from './hexUtils.js';
// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Outer radius (center → vertex), px */
 const R = 112 / 3;

/** Half horizontal step, px */
 const RX = 37.35;

/** Full hex height = vertical distance between adjacent row centers, px */
 const HEX_H = Math.sqrt(3) * R;

/** Horizontal distance between adjacent column centers, px */
 const COL_STEP = 1.5 * RX;

/** Odd columns are shifted down by this amount, px */
 const ODD_OFFSET = HEX_H / 2;

// ---------------------------------------------------------------------------
// Calibration — edit these until the grid aligns with the board image
// ---------------------------------------------------------------------------

/** World-pixel X of hex A1 (column 0, row 1) center */
 const GRID_OFFSET_X = RX - COL_STEP / 2 - 5;

/** World-pixel Y of hex A1 (column 0, row 1) center */
 const GRID_OFFSET_Y = HEX_H / 2 - 2;

 // ---------------------------------------------------------------------------
// World canvas dimensions
// ---------------------------------------------------------------------------

export const BOARD_W     = 1800;
export const BOARD_H     = 645;
export const BOARD_COUNT = 3;
export const WORLD_H     = BOARD_H * BOARD_COUNT; // 1935

/** Number of hex columns that fit across BOARD_W */
export const COL_COUNT = Math.ceil(BOARD_W / COL_STEP);

/** Number of hex rows that fit across WORLD_H */
export const ROW_COUNT = Math.ceil(WORLD_H / HEX_H);


function hexPath(ctx, cx, cy) {
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 3) * i;
    const vx = cx + R * Math.cos(angle);
    const vy = cy + R * Math.sin(angle);
    i === 0 ? ctx.moveTo(vx, vy) : ctx.lineTo(vx, vy);
  }
  ctx.closePath();
}

function hexToPixel(col, row) {
  const x = GRID_OFFSET_X + col * COL_STEP;
  const y = GRID_OFFSET_Y + (row - 1) * HEX_H + (col % 2 === 1 ? ODD_OFFSET : 0);
  return { x, y };
}

export function drawGrid(gridLayer) {
  // ── Grid outlines ────────────────────────────────────────────────────────
  // One Konva.Shape draws all hex outlines in a single canvas pass.
  const gridShape = new Konva.Shape({
    sceneFunc(ctx) {
      ctx.beginPath();
      for (let col = 0; col < COL_COUNT; col++) {
        for (let row = 1; row <= ROW_COUNT; row++) {
          const { x, y } = hexToPixel(col, row);
          hexPath(ctx, x, y);
        }
      }
      ctx._context.strokeStyle = 'rgba(255, 220, 80, 0.45)';
      ctx._context.lineWidth   = 1;
      ctx._context.stroke();
    },
    listening: false,
  });
  // ── Буквенно-цифровые обозначения гексов ───────────────────────────────
  for (let col = 0; col < COL_COUNT; col++) {
    for (let row = 1; row <= ROW_COUNT; row++) {
      const { x, y } = hexToPixel(col, row);
      gridLayer.add(new Konva.Text({
        x: x - 12,
        y: y + 4,
        text: hexLabel(col, row),
        fontSize: 7,
        fill: 'rgba(255,255,255,0.6)',
        listening: false,
      }));
    }
  }

  gridLayer.add(gridShape);
  console.log('Grid drawn');
  gridLayer.batchDraw();
}
