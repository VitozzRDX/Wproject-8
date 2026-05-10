import { describe, test, expect, beforeEach, vi } from 'vitest';

// Мокаем RendererUI до импорта engine.js — иначе подтянется Konva
vi.mock('./rendererUI.js', () => ({
  RendererUI: {
    init: vi.fn(),
    drawButton: vi.fn(),
    removeButton: vi.fn(),
  }
}));

const { Engine } = await import('./engine.js');
const { State } = await import('./state.js');
const { PhaseManager } = await import('./phaseManager.js');
const { hexToPixel } = await import('./hexUtils.js');

// Координаты центра гекса для cmd.pos
function posOf(col, row) {
  const { x, y } = hexToPixel(col, row);
  return { x, y };
}

// Минимально-валидный юнит с фейковой Konva-нодой
function makeUnit(id, nation, type, overrides = {}) {
  const fakeImage = {
    visible: () => {}, image: () => {},
    stroke: () => {}, strokeWidth: () => {},
    width: () => 30, height: () => 30,
  };
  return {
    id, nation, type,
    hex: { col: 3, row: 3 },
    mf: 4,
    morale: 7,
    firepower: 4, range: 6,
    hasStartedMoving: false,
    usedDoubleTime: false, usedAssaultMovement: false,
    broken: false, pinned: false, wounded: false, exhausted: false,
    movementBonusApplied: false,
    path: [], roadBonusGranted: false, usedWoodsRoad: false,
    image: { width: 30, height: 30 },
    node: {
      x: () => 100, y: () => 100,
      getLayer: () => ({ batchDraw: () => {} }),
      to: () => {}, moveToTop: () => {},
      findOne: () => fakeImage,
      getAttr: () => id,
    },
    ...overrides
  };
}

// Полный сброс State + регистрация юнитов в гексах
function setupState(units = {}) {
  State.units        = units;
  State.selected     = [];
  State.currentMover = [];
  State.firegroup    = [];
  State.hexes        = {};
  State.pendingMove  = null;
  Object.values(units).forEach(u => {
    const key = `${u.hex.col}-${u.hex.row}`;
    State.hexes[key] = State.hexes[key] || [];
    State.hexes[key].push(u.id);
  });
  PhaseManager.setPhase('german movement phase');
}

beforeEach(() => {
  vi.spyOn(Math, 'random').mockReturnValue(0); // dr=2 предсказуемо
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

// ────────────────────────────────────────────────────────────────────
// Сценарий 1: выбор и движение
// ────────────────────────────────────────────────────────────────────
test('атакер выбран → движение в соседний гекс → MF списан', () => {
  const ge1 = makeUnit('ge1', 'german', 'squad', { hex: { col: 3, row: 2 }, mf: 4 });
  setupState({ ge1 });

  Engine.execute({ cmd: 'CLICK_UNIT', unitId: 'ge1', button: 0 });
  expect(State.selected).toEqual(['ge1']);

  Engine.execute({ cmd: 'MOVE_TO', unitId: null, pos: posOf(3, 3), button: 0 });

  expect(State.units.ge1.mf).toBe(3);
  expect(State.units.ge1.hex).toEqual({ col: 3, row: 3 });
  expect(State.units.ge1.hasStartedMoving).toBe(true);
});

// ────────────────────────────────────────────────────────────────────
// Сценарий 2: правило 1 — после движения другого юнита первый запечатан
// ────────────────────────────────────────────────────────────────────
test('Rule 1: после хода другого, первый юнит mf=0', () => {
  const ge1 = makeUnit('ge1', 'german', 'squad', { hex: { col: 3, row: 3 }, mf: 4 });
  const ge2 = makeUnit('ge2', 'german', 'squad', { hex: { col: 5, row: 3 }, mf: 4 });
  setupState({ ge1, ge2 });

  Engine.execute({ cmd: 'CLICK_UNIT', unitId: 'ge1', button: 0 });
  Engine.execute({ cmd: 'MOVE_TO', pos: posOf(3, 4), button: 0 });

  Engine.execute({ cmd: 'CLICK_UNIT', unitId: 'ge2', button: 0 });
  Engine.execute({ cmd: 'MOVE_TO', pos: posOf(5, 4), button: 0 });

  expect(State.units.ge1.mf).toBe(0);
  expect(State.units.ge2.mf).toBe(3);
});

// ────────────────────────────────────────────────────────────────────
// Сценарий 3: SELECT_DEFENDER добавляет в firegroup
// ────────────────────────────────────────────────────────────────────
test('клик на defender → попадает в firegroup', () => {
  const so1 = makeUnit('so1', 'soviet', 'squad', { hex: { col: 4, row: 3 } });
  setupState({ so1 });

  Engine.execute({ cmd: 'SELECT_DEFENDER', unitId: 'so1', button: 0 });

  expect(State.selected).toContain('so1');
  expect(State.firegroup).toEqual(['so1']);
});

// ────────────────────────────────────────────────────────────────────
// Сценарий 4: DESELECT_ALL очищает defender и firegroup, атакеров не трогает
// ────────────────────────────────────────────────────────────────────
test('Esc: defender выбор и firegroup очищены, атакер остаётся', () => {
  const ge1 = makeUnit('ge1', 'german', 'squad', { hex: { col: 3, row: 3 } });
  const so1 = makeUnit('so1', 'soviet', 'squad', { hex: { col: 4, row: 3 } });
  setupState({ ge1, so1 });
  State.selected  = ['ge1', 'so1'];
  State.firegroup = ['so1'];

  Engine.execute({ cmd: 'DESELECT_ALL' });

  expect(State.selected).toEqual(['ge1']);   // атакер остался
  expect(State.firegroup).toEqual([]);
});
