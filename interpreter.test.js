import { describe, test, expect, beforeEach } from 'vitest';
import { RULES } from './interpreter.js';
import { State } from './state.js';
import { PhaseManager } from './phaseManager.js';

const findRule = cmd => RULES.find(r => r.cmd === cmd);

// Сбрасываем State и фазу перед каждым тестом
beforeEach(() => {
  State.units        = {};
  State.selected     = [];
  State.currentMover = [];
  State.firegroup    = [];
  State.pendingMove  = null;
  PhaseManager.setPhase('german movement phase');
});

// ────────────────────────────────────────────────────────────────────
// DEFENSIVE_FIRST_FIRE
// ────────────────────────────────────────────────────────────────────
describe('DEFENSIVE_FIRST_FIRE', () => {
  const rule = () => findRule('DEFENSIVE_FIRST_FIRE');

  test('срабатывает: правый клик + firegroup + currentMover + активная сторона', () => {
    State.firegroup    = ['s1'];
    State.currentMover = ['g1'];
    expect(rule().match({ button: 2 })).toBe(true);
  });

  test('не срабатывает на левый клик', () => {
    State.firegroup    = ['s1'];
    State.currentMover = ['g1'];
    expect(rule().match({ button: 0 })).toBe(false);
  });

  test('не срабатывает если firegroup пустой', () => {
    State.currentMover = ['g1'];
    expect(rule().match({ button: 2 })).toBe(false);
  });

  test('не срабатывает если никто не двигался', () => {
    State.firegroup = ['s1'];
    expect(rule().match({ button: 2 })).toBe(false);
  });
});

// ────────────────────────────────────────────────────────────────────
// MOVE_TO
// ────────────────────────────────────────────────────────────────────
describe('MOVE_TO', () => {
  const rule = () => findRule('MOVE_TO');

  beforeEach(() => {
    State.units    = { g1: { nation: 'german' } };
    State.selected = ['g1'];
  });

  test('срабатывает: левый клик на карту, атакер выбран', () => {
    expect(rule().match({ unitId: null, mapId: 'map', shiftKey: false, button: 0 })).toBe(true);
  });

  test('срабатывает: клик на дружественного юнита', () => {
    State.units.g2 = { nation: 'german' };
    expect(rule().match({ unitId: 'g2', mapId: null, shiftKey: false, button: 0 })).toBe(true);
  });

  test('не срабатывает на правый клик', () => {
    expect(rule().match({ unitId: null, mapId: 'map', shiftKey: false, button: 2 })).toBe(false);
  });

  test('не срабатывает с шифтом', () => {
    expect(rule().match({ unitId: null, mapId: 'map', shiftKey: true, button: 0 })).toBe(false);
  });

  test('не срабатывает если ничего не выбрано', () => {
    State.selected = [];
    expect(rule().match({ unitId: null, mapId: 'map', shiftKey: false, button: 0 })).toBe(false);
  });

  test('не срабатывает в чужой фазе', () => {
    PhaseManager.setPhase('soviet movement phase');
    expect(rule().match({ unitId: null, mapId: 'map', shiftKey: false, button: 0 })).toBe(false);
  });

  test('не срабатывает на вражеский юнит', () => {
    State.units.s1 = { nation: 'soviet' };
    expect(rule().match({ unitId: 's1', mapId: null, shiftKey: false, button: 0 })).toBe(false);
  });

  test('не срабатывает если выбран юнит не активной стороны', () => {
    State.units    = { s1: { nation: 'soviet' } };
    State.selected = ['s1'];
    expect(rule().match({ unitId: null, mapId: 'map', shiftKey: false, button: 0 })).toBe(false);
  });
});

// ────────────────────────────────────────────────────────────────────
// ADD_TO_SELECTION
// ────────────────────────────────────────────────────────────────────
describe('ADD_TO_SELECTION', () => {
  const rule = () => findRule('ADD_TO_SELECTION');

  test('первый шифт-клик: пустой selected — разрешаем', () => {
    State.units = { g1: { hex: { col: 1, row: 1 } } };
    expect(rule().match({ unitId: 'g1', shiftKey: true, button: 0 })).toBe(true);
  });

  test('шифт-клик в том же гексе — разрешаем', () => {
    State.units = {
      g1: { hex: { col: 1, row: 1 } },
      g2: { hex: { col: 1, row: 1 } },
    };
    State.selected = ['g1'];
    expect(rule().match({ unitId: 'g2', shiftKey: true, button: 0 })).toBe(true);
  });

  test('шифт-клик в другом гексе — отвергаем', () => {
    State.units = {
      g1: { hex: { col: 1, row: 1 } },
      g2: { hex: { col: 5, row: 5 } },
    };
    State.selected = ['g1'];
    expect(rule().match({ unitId: 'g2', shiftKey: true, button: 0 })).toBe(false);
  });

  test('без шифта — не наш случай', () => {
    State.units = { g1: { hex: { col: 1, row: 1 } } };
    expect(rule().match({ unitId: 'g1', shiftKey: false, button: 0 })).toBe(false);
  });

  test('правый клик — не наш случай', () => {
    State.units = { g1: { hex: { col: 1, row: 1 } } };
    expect(rule().match({ unitId: 'g1', shiftKey: true, button: 2 })).toBe(false);
  });
});

// ────────────────────────────────────────────────────────────────────
// SELECT_DEFENDER
// ────────────────────────────────────────────────────────────────────
describe('SELECT_DEFENDER', () => {
  const rule = () => findRule('SELECT_DEFENDER');

  test('левый клик на defender — да', () => {
    State.units = { s1: { nation: 'soviet' } };
    expect(rule().match({ unitId: 's1', button: 0 })).toBe(true);
  });

  test('левый клик на attacker — нет', () => {
    State.units = { g1: { nation: 'german' } };
    expect(rule().match({ unitId: 'g1', button: 0 })).toBe(false);
  });

  test('правый клик — нет', () => {
    State.units = { s1: { nation: 'soviet' } };
    expect(rule().match({ unitId: 's1', button: 2 })).toBe(false);
  });

  test('нет юнита — нет', () => {
    expect(rule().match({ unitId: null, button: 0 })).toBe(false);
  });
});

// ────────────────────────────────────────────────────────────────────
// CLICK_UNIT (fallback)
// ────────────────────────────────────────────────────────────────────
describe('CLICK_UNIT', () => {
  const rule = () => findRule('CLICK_UNIT');

  test('левый клик на юнита', () => {
    expect(rule().match({ unitId: 'x', button: 0 })).toBe(true);
  });

  test('правый клик игнорируем', () => {
    expect(rule().match({ unitId: 'x', button: 2 })).toBe(false);
  });

  test('без юнита — нет', () => {
    expect(rule().match({ unitId: null, button: 0 })).toBeFalsy();
  });
});

// ────────────────────────────────────────────────────────────────────
// CLICK_EMPTY / CLICK_MAP
// ────────────────────────────────────────────────────────────────────
describe('CLICK_EMPTY', () => {
  test('срабатывает на пустую сцену', () => {
    expect(findRule('CLICK_EMPTY').match({ isStage: true })).toBe(true);
  });
  test('не срабатывает на не-сцену', () => {
    expect(findRule('CLICK_EMPTY').match({ isStage: false })).toBe(false);
  });
});

describe('CLICK_MAP', () => {
  test('срабатывает на карту', () => {
    expect(findRule('CLICK_MAP').match({ mapId: 'map' })).toBe(true);
  });
  test('не срабатывает на не-карту', () => {
    expect(findRule('CLICK_MAP').match({ mapId: null })).toBe(false);
  });
});

// ────────────────────────────────────────────────────────────────────
// Приоритеты — какое правило выиграет первым (через find)
// ────────────────────────────────────────────────────────────────────
describe('Приоритеты правил', () => {
  test('правый клик при готовом firegroup → DEFENSIVE_FIRST_FIRE раньше других', () => {
    State.firegroup    = ['s1'];
    State.currentMover = ['g1'];
    State.units    = { g1: { nation: 'german' } };
    State.selected = ['g1'];
    const ctx = { unitId: 'g1', button: 2, shiftKey: false, mapId: null };
    const winner = RULES.find(r => r.match(ctx));
    expect(winner.cmd).toBe('DEFENSIVE_FIRST_FIRE');
  });

  test('шифт+клик на defender в новой выборке → ADD_TO_SELECTION (а не SELECT_DEFENDER)', () => {
    State.units = { s1: { nation: 'soviet', hex: { col: 1, row: 1 } } };
    const ctx = { unitId: 's1', button: 0, shiftKey: true, mapId: null };
    const winner = RULES.find(r => r.match(ctx));
    expect(winner.cmd).toBe('ADD_TO_SELECTION');
  });

  test('левый клик на defender без шифта → SELECT_DEFENDER', () => {
    State.units = { s1: { nation: 'soviet' } };
    const ctx = { unitId: 's1', button: 0, shiftKey: false, mapId: null };
    const winner = RULES.find(r => r.match(ctx));
    expect(winner.cmd).toBe('SELECT_DEFENDER');
  });
});
