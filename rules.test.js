import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  hasWoodsRoad, isRoadHex, checkCost, checkMovement,
  checkAddingToFG, checkIsNearestHex, checkDoubleTimeCapability,
  checkOverstack, calcLeadBonus, getIFTColumn, lookupIFT,
  calcFirepower, calcTotalFirepower, calcFireEffect, applyFireEffect,
  calcTEM, defensiveFF, getLeaderBonusRecipients,
  calcFFNAM, checkAssaultMovementCapability,
} from './rules.js';

// Хелпер: задать последовательность бросков Math.random
// Каждый вызов Math.random вернёт следующее значение из массива
function mockRandom(values) {
  let i = 0;
  return vi.spyOn(Math, 'random').mockImplementation(() => values[i++ % values.length]);
}

// Заглушаем console чтобы не засорять вывод тестов
beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
});

// ────────────────────────────────────────────────────────────────────
// hasWoodsRoad / isRoadHex / calcTEM
// ────────────────────────────────────────────────────────────────────
describe('hasWoodsRoad', () => {
  test('true для I2 (помечен Woods-Road)', () => {
    expect(hasWoodsRoad({ col: 8, row: 2 })).toBe(true);
  });
  test('false для обычного гекса', () => {
    expect(hasWoodsRoad({ col: 0, row: 1 })).toBe(false);
  });
});

describe('isRoadHex', () => {
  test('true для D4 (dirtRoad+orchard)', () => {
    expect(isRoadHex({ col: 3, row: 4 })).toBe(true);
  });
  test('false для I2 (Woods-Road, не road в нашей логике)', () => {
    expect(isRoadHex({ col: 8, row: 2 })).toBe(false);
  });
  test('false для пустого гекса', () => {
    expect(isRoadHex({ col: 0, row: 0 })).toBe(false);
  });
});

describe('calcTEM', () => {
  test('0 для пустого гекса', () => {
    expect(calcTEM({ col: 100, row: 100 })).toBe(0);
  });
  test('+1 для леса', () => {
    // нужен гекс с forest — например 04
    expect(calcTEM({ col: 0, row: 4 })).toBe(1);
  });
  test('0 для дороги', () => {
    expect(calcTEM({ col: 3, row: 4 })).toBe(0); // D4: dirtRoad+orchard
  });
});

// ────────────────────────────────────────────────────────────────────
// checkCost
// ────────────────────────────────────────────────────────────────────
describe('checkCost', () => {
  test('1 для пустого гекса', () => {
    expect(checkCost({ col: 100, row: 100 }, { col: 0, row: 0 })).toBe(1);
  });
  test('2 для леса', () => {
    expect(checkCost({ col: 0, row: 4 }, { col: 0, row: 0 })).toBe(2);
  });
  test('1 для дороги (max road=1, orchard=1)', () => {
    expect(checkCost({ col: 3, row: 4 }, { col: 0, row: 0 })).toBe(1);
  });
  test('overrideTerrain=forest даёт стоимость леса', () => {
    expect(checkCost({ col: 100, row: 100 }, { col: 0, row: 0 }, 'forest')).toBe(2);
  });
  test('overrideTerrain=dirtRoad даёт стоимость дороги', () => {
    expect(checkCost({ col: 100, row: 100 }, { col: 0, row: 0 }, 'dirtRoad')).toBe(1);
  });
  // crestLine ветка: target = G4 (crestLine), from плоский → стоимость *2
  test('crestLine снизу — стоимость x2', () => {
    // G4: crestLine. baseCost=1, fromHex плоский → 2
    expect(checkCost({ col: 6, row: 4 }, { col: 100, row: 100 })).toBe(2);
  });
  test('crestLine сверху (с hill) — обычная стоимость', () => {
    // J4 имеет hill, G4 crestLine → должно быть 1
    expect(checkCost({ col: 6, row: 4 }, { col: 9, row: 4 })).toBe(1);
  });
  test('crestLine с другого crestLine — обычная', () => {
    // H3 (crestLine) → G4 (crestLine)
    expect(checkCost({ col: 6, row: 4 }, { col: 7, row: 3 })).toBe(1);
  });
});

// ────────────────────────────────────────────────────────────────────
// checkMovement
// ────────────────────────────────────────────────────────────────────
describe('checkMovement', () => {
  const units = {
    a: { mf: 4 },
    b: { mf: 1 },
    c: { mf: 0 },
  };
  test('хватает MF у всех', () => {
    expect(checkMovement(['a', 'b'], units, 1)).toBe(true);
  });
  test('не хватает у одного', () => {
    expect(checkMovement(['a', 'c'], units, 1)).toBe(false);
  });
  test('cost по умолчанию 1', () => {
    expect(checkMovement(['b'], units)).toBe(true);
  });
});

// ────────────────────────────────────────────────────────────────────
// checkAddingToFG
// ────────────────────────────────────────────────────────────────────
describe('checkAddingToFG', () => {
  const units = {
    a: { hex: { col: 3, row: 3 } },
    b: { hex: { col: 3, row: 3 } },     // тот же гекс что a
    c: { hex: { col: 4, row: 3 } },     // соседний с a (для col=3 odd → SE neighbor = (4,3))
    d: { hex: { col: 10, row: 10 } },   // далеко
  };
  test('пустой firegroup — всегда true', () => {
    expect(checkAddingToFG('a', [], units)).toBe(true);
  });
  test('тот же гекс — true', () => {
    expect(checkAddingToFG('b', ['a'], units)).toBe(true);
  });
  test('соседний гекс — true', () => {
    expect(checkAddingToFG('c', ['a'], units)).toBe(true);
  });
  test('далёкий гекс — false', () => {
    expect(checkAddingToFG('d', ['a'], units)).toBe(false);
  });
});

// ────────────────────────────────────────────────────────────────────
// checkIsNearestHex
// ────────────────────────────────────────────────────────────────────
describe('checkIsNearestHex', () => {
  const units = { a: { hex: { col: 3, row: 3 } } };
  test('соседний гекс', () => {
    expect(checkIsNearestHex({ col: 3, row: 2 }, 'a', units)).toBe(true);
  });
  test('тот же гекс — false (свой не в списке соседей)', () => {
    expect(checkIsNearestHex({ col: 3, row: 3 }, 'a', units)).toBe(false);
  });
  test('далёкий гекс', () => {
    expect(checkIsNearestHex({ col: 10, row: 10 }, 'a', units)).toBe(false);
  });
});

// ────────────────────────────────────────────────────────────────────
// checkDoubleTimeCapability
// ────────────────────────────────────────────────────────────────────
describe('checkDoubleTimeCapability', () => {
  const baseInf = { type: 'squad', broken: false, pinned: false, wounded: false, exhausted: false, hasStartedMoving: false };
  test('здоровый сквад — может', () => {
    expect(checkDoubleTimeCapability('a', { a: { ...baseInf } })).toBe(true);
  });
  test('лидер тоже может', () => {
    expect(checkDoubleTimeCapability('a', { a: { ...baseInf, type: 'leader' } })).toBe(true);
  });
  test('SW не может (не пехота)', () => {
    expect(checkDoubleTimeCapability('a', { a: { ...baseInf, type: 'mg' } })).toBe(false);
  });
  test('broken не может', () => {
    expect(checkDoubleTimeCapability('a', { a: { ...baseInf, broken: true } })).toBe(false);
  });
  test('pinned не может', () => {
    expect(checkDoubleTimeCapability('a', { a: { ...baseInf, pinned: true } })).toBe(false);
  });
  test('wounded не может', () => {
    expect(checkDoubleTimeCapability('a', { a: { ...baseInf, wounded: true } })).toBe(false);
  });
  test('exhausted не может', () => {
    expect(checkDoubleTimeCapability('a', { a: { ...baseInf, exhausted: true } })).toBe(false);
  });
  test('уже начал движение — не может', () => {
    expect(checkDoubleTimeCapability('a', { a: { ...baseInf, hasStartedMoving: true } })).toBe(false);
  });
  test('AM юнит не может Double Time', () => {
    expect(checkDoubleTimeCapability('a', { a: { ...baseInf, usedAssaultMovement: true } })).toBe(false);
  });
});

// ────────────────────────────────────────────────────────────────────
// checkOverstack
// ────────────────────────────────────────────────────────────────────
describe('checkOverstack', () => {
  const sq = (id) => ({ id, type: 'squad' });
  const hs = (id) => ({ id, type: 'squad', size: 'halfSquad' });
  const ld = (id) => ({ id, type: 'leader' });

  test('пустой гекс — true', () => {
    expect(checkOverstack([], {})).toBe(true);
  });
  test('3 squad + 4 leader — на пределе, true', () => {
    const units = { a: sq('a'), b: sq('b'), c: sq('c'), l1: ld('l1'), l2: ld('l2'), l3: ld('l3'), l4: ld('l4') };
    expect(checkOverstack(['a','b','c','l1','l2','l3','l4'], units)).toBe(true);
  });
  test('4 squad — превышение', () => {
    const units = { a: sq('a'), b: sq('b'), c: sq('c'), d: sq('d') };
    expect(checkOverstack(['a','b','c','d'], units)).toBe(false);
  });
  test('5 leader — превышение', () => {
    const units = Object.fromEntries([1,2,3,4,5].map(i => [`l${i}`, ld(`l${i}`)]));
    expect(checkOverstack(['l1','l2','l3','l4','l5'], units)).toBe(false);
  });
  test('6 halfSquad = 3 squad — на пределе', () => {
    const units = Object.fromEntries([1,2,3,4,5,6].map(i => [`h${i}`, hs(`h${i}`)]));
    expect(checkOverstack(['h1','h2','h3','h4','h5','h6'], units)).toBe(true);
  });
  test('7 halfSquad = 3.5 — превышение', () => {
    const units = Object.fromEntries([1,2,3,4,5,6,7].map(i => [`h${i}`, hs(`h${i}`)]));
    expect(checkOverstack(['h1','h2','h3','h4','h5','h6','h7'], units)).toBe(false);
  });
});

// ────────────────────────────────────────────────────────────────────
// calcLeadBonus
// ────────────────────────────────────────────────────────────────────
describe('calcLeadBonus', () => {
  test('возвращает 2', () => {
    expect(calcLeadBonus()).toBe(2);
  });
});

// ────────────────────────────────────────────────────────────────────
// getIFTColumn / lookupIFT
// ────────────────────────────────────────────────────────────────────
describe('getIFTColumn', () => {
  test('точное совпадение', () => {
    expect(getIFTColumn(8)).toBe(8);
  });
  test('сдвиг вниз: 19 → 16', () => {
    expect(getIFTColumn(19)).toBe(16);
  });
  test('меньше минимума → 1', () => {
    expect(getIFTColumn(0)).toBe(1);
  });
  test('больше максимума → 36', () => {
    expect(getIFTColumn(100)).toBe(36);
  });
});

describe('lookupIFT', () => {
  test('FP=4, DR=2 → [2,"KIA"]', () => {
    expect(lookupIFT(4, 2)).toEqual([2, 'KIA']);
  });
  test('FP=4, DR=12 → NE (за пределами)', () => {
    expect(lookupIFT(4, 12)).toBe('NE');
  });
  test('FP=19 (сдвиг к 16), DR=2 → [4,"KIA"]', () => {
    expect(lookupIFT(19, 2)).toEqual([4, 'KIA']);
  });
});

// ────────────────────────────────────────────────────────────────────
// calcFirepower / calcTotalFirepower
// ────────────────────────────────────────────────────────────────────
describe('calcFirepower', () => {
  const u = { firepower: 4, range: 6, hex: { col: 0, row: 1 } };

  test('Point Blank (соседний) — fp*2', () => {
    expect(calcFirepower(u, { col: 0, row: 2 })).toBe(8);
  });
  test('в normal range — fp', () => {
    // дистанция 3 (внутри range 6)
    expect(calcFirepower(u, { col: 0, row: 4 })).toBe(4);
  });
  test('long range — fp/2', () => {
    const shortU = { ...u, range: 1 }; // range=1, далёкий гекс
    expect(calcFirepower(shortU, { col: 0, row: 3 })).toBe(2);
  });
  test('вне максимальной — 0', () => {
    expect(calcFirepower({ firepower: 4, range: 1, hex: { col: 0, row: 0 } }, { col: 0, row: 10 })).toBe(0);
  });
});

describe('calcTotalFirepower', () => {
  test('пустой массив — 0', () => {
    expect(calcTotalFirepower([], { col: 0, row: 0 })).toBe(0);
  });
  test('сумма по нескольким юнитам', () => {
    const u1 = { firepower: 4, range: 6, hex: { col: 0, row: 1 } };
    const u2 = { firepower: 2, range: 6, hex: { col: 0, row: 1 } };
    // оба соседи цели → fp*2: 8+4=12
    expect(calcTotalFirepower([u1, u2], { col: 0, row: 2 })).toBe(12);
  });
});

// ────────────────────────────────────────────────────────────────────
// calcFireEffect
// ────────────────────────────────────────────────────────────────────
describe('calcFireEffect', () => {
  test('возвращает результат IFT при DR=2 (random=0 → 1+1=2)', () => {
    mockRandom([0, 0]);  // оба d6 = 1, сумма 2
    const u = { firepower: 4, range: 6, hex: { col: 0, row: 1 } };
    // PB: fp=8, col=8, idx=dr=2, IFT[8][2]=[1,'KIA']
    expect(calcFireEffect([u], { col: 0, row: 2 }, 0)).toEqual([1, 'KIA']);
  });
  test('промах (DR=12) если массив короткий', () => {
    mockRandom([0.99, 0.99]);  // оба d6 = 6, сумма 12
    const u = { firepower: 1, range: 6, hex: { col: 0, row: 1 } };
    // не соседи: fp=1, col=1 (длина 6), idx=12 → промах
    expect(calcFireEffect([u], { col: 0, row: 5 }, 0)).toBe(false);
  });
});

// ────────────────────────────────────────────────────────────────────
// applyFireEffect
// ────────────────────────────────────────────────────────────────────
describe('applyFireEffect', () => {
  test('промах (false) → пустой объект', () => {
    expect(applyFireEffect(false, [{ id: 'a', morale: 7 }])).toEqual({});
  });

  test('NMC: высокий бросок ломает', () => {
    mockRandom([0.99, 0.99]);  // dr=12
    const targets = [{ id: 'a', morale: 7 }];
    expect(applyFireEffect([0, 'MC'], targets)).toEqual({ a: 'broken' });
  });

  test('NMC: низкий бросок проходит', () => {
    mockRandom([0, 0]);  // dr=2
    const targets = [{ id: 'a', morale: 7 }];
    expect(applyFireEffect([0, 'MC'], targets)).toEqual({});
  });

  test('PTC: пинит при провале', () => {
    mockRandom([0.99, 0.99]);  // dr=12
    const targets = [{ id: 'a', morale: 7, broken: false, pinned: false }];
    expect(applyFireEffect([0, 'PTC'], targets)).toEqual({ a: 'pinned' });
  });

  test('PTC: уже сломанный пропускается', () => {
    mockRandom([0.99, 0.99]);
    const targets = [{ id: 'a', morale: 7, broken: true, pinned: false }];
    expect(applyFireEffect([0, 'PTC'], targets)).toEqual({});
  });

  test('KIA: один убит, остальные broken', () => {
    mockRandom([0.5, 0.5, 0.5]);  // shuffle stable
    const targets = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    const result = applyFireEffect([1, 'KIA'], targets);
    const eliminated = Object.values(result).filter(v => v === 'eliminated');
    const broken     = Object.values(result).filter(v => v === 'broken');
    expect(eliminated).toHaveLength(1);
    expect(broken).toHaveLength(2);
  });

  test('K/: squad → reduced', () => {
    mockRandom([0]);  // выбираем индекс 0
    const targets = [{ id: 'a', type: 'squad', morale: 7 }];
    const result = applyFireEffect([0, 'K/'], targets);
    expect(result.a).toBe('reduced');
  });

  test('K/: halfSquad → eliminated', () => {
    mockRandom([0]);
    const targets = [{ id: 'a', type: 'squad', size: 'halfSquad', morale: 7 }];
    const result = applyFireEffect([0, 'K/'], targets);
    expect(result.a).toBe('eliminated');
  });

  test('K/: leader light wound (dr 1-4)', () => {
    mockRandom([0, 0]);  // index 0; d6=1 → wounded
    const targets = [{ id: 'a', type: 'leader', morale: 7 }];
    const result = applyFireEffect([0, 'K/'], targets);
    expect(result.a).toBe('wounded');
  });

  test('K/: leader eliminated (dr 5-6)', () => {
    mockRandom([0, 0.99]);  // index 0; d6=6 → eliminated
    const targets = [{ id: 'a', type: 'leader', morale: 7 }];
    const result = applyFireEffect([0, 'K/'], targets);
    expect(result.a).toBe('eliminated');
  });

  test('K/: остальные получают MC+k и могут сломаться', () => {
    // index 0 для victim; для others бросок dr+k высокий
    mockRandom([0, 0.99, 0.99]);
    const targets = [
      { id: 'a', type: 'squad', morale: 7 },                    // victim → reduced
      { id: 'b', type: 'squad', morale: 7 },                    // other → MC+k=2 → DR=12+2=14 > 7 → broken
    ];
    const result = applyFireEffect([2, 'K/'], targets);
    expect(result.a).toBe('reduced');
    expect(result.b).toBe('broken');
  });
});

// ────────────────────────────────────────────────────────────────────
// getLeaderBonusRecipients
// ────────────────────────────────────────────────────────────────────
describe('getLeaderBonusRecipients', () => {
  test('лидер и сквад в одном гексе — сквад получает бонус', () => {
    const units = {
      l: { type: 'leader', hex: { col: 1, row: 1 } },
      s: { type: 'squad',  hex: { col: 1, row: 1 } },
    };
    expect(getLeaderBonusRecipients(['l', 's'], units)).toEqual(['s']);
  });

  test('разные гексы — нет бонуса', () => {
    const units = {
      l: { type: 'leader', hex: { col: 1, row: 1 } },
      s: { type: 'squad',  hex: { col: 5, row: 5 } },
    };
    expect(getLeaderBonusRecipients(['l', 's'], units)).toEqual([]);
  });

  test('нет лидера — нет бонуса', () => {
    const units = {
      s: { type: 'squad', hex: { col: 1, row: 1 } },
    };
    expect(getLeaderBonusRecipients(['s'], units)).toEqual([]);
  });

  test('два лидера — бонус всё равно один (MMC попадает один раз)', () => {
    const units = {
      l1: { type: 'leader', hex: { col: 1, row: 1 } },
      l2: { type: 'leader', hex: { col: 1, row: 1 } },
      s:  { type: 'squad',  hex: { col: 1, row: 1 } },
    };
    expect(getLeaderBonusRecipients(['l1', 'l2', 's'], units)).toEqual(['s']);
  });
});

// ────────────────────────────────────────────────────────────────────
// calcFFNAM
// ────────────────────────────────────────────────────────────────────
describe('calcFFNAM', () => {
  test('-1 если двигался и не объявлял Assault Movement', () => {
    const unit = { hasStartedMoving: true, usedAssaultMovement: false };
    expect(calcFFNAM(unit)).toBe(-1);
  });

  test('0 если объявлял Assault Movement', () => {
    const unit = { hasStartedMoving: true, usedAssaultMovement: true };
    expect(calcFFNAM(unit)).toBe(0);
  });

  test('0 если не двигался', () => {
    const unit = { hasStartedMoving: false, usedAssaultMovement: false };
    expect(calcFFNAM(unit)).toBe(0);
  });

  test('0 если не двигался даже при флаге AM', () => {
    const unit = { hasStartedMoving: false, usedAssaultMovement: true };
    expect(calcFFNAM(unit)).toBe(0);
  });

  test('-1 если сломан, даже если был AM (правило: broken → AM теряется)', () => {
    const unit = { hasStartedMoving: true, usedAssaultMovement: true, broken: true };
    expect(calcFFNAM(unit)).toBe(-1);
  });
});

// ────────────────────────────────────────────────────────────────────
// checkAssaultMovementCapability
// ────────────────────────────────────────────────────────────────────
describe('checkAssaultMovementCapability', () => {
  const baseInf = { type:'squad', broken:false, pinned:false, wounded:false, exhausted:false,
                    hasStartedMoving:false };

  test('здоровая пехота — может', () => {
    expect(checkAssaultMovementCapability({ ...baseInf })).toBe(true);
  });
  test('лидер тоже может', () => {
    expect(checkAssaultMovementCapability({ ...baseInf, type:'leader' })).toBe(true);
  });
  test('сломанный — не может', () => {
    expect(checkAssaultMovementCapability({ ...baseInf, broken:true })).toBe(false);
  });
  test('уже двигался — не может', () => {
    expect(checkAssaultMovementCapability({ ...baseInf, hasStartedMoving:true })).toBe(false);
  });
});

// ────────────────────────────────────────────────────────────────────
// defensiveFF (интеграционный)
// ────────────────────────────────────────────────────────────────────
describe('defensiveFF', () => {
  test('возвращает effect и changes', () => {
    mockRandom([0, 0]);  // dr=2
    const fg = [{ firepower: 4, range: 6, hex: { col: 0, row: 1 } }];
    const target = { col: 0, row: 2 };
    const hexUnits = [{ id: 'a', morale: 7 }];
    const res = defensiveFF(fg, target, hexUnits);
    expect(res).toHaveProperty('effect');
    expect(res).toHaveProperty('changes');
  });

  test('FFNAM применяется: moved no-AM юнит получает -1 к idx', () => {
    mockRandom([0, 0]);  // dr=2
    const fg = [{ firepower: 4, range: 6, hex: { col: 0, row: 1 } }];
    const target = { col: 0, row: 2 };  // open ground, TEM=0
    const movedUnit = { id: 'a', morale: 7, hasStartedMoving: true, usedAssaultMovement: false };

    const { effect } = defensiveFF(fg, target, [movedUnit]);
    // PB → fp=8, col=8, dr=2, tem=0, ffnam=-1 → idx=1, IFT[8][1] = [2,'KIA']
    expect(effect).toEqual([2, 'KIA']);
  });

  test('FFNAM не применяется: AM юнит — idx без -1', () => {
    mockRandom([0, 0]);  // dr=2
    const fg = [{ firepower: 4, range: 6, hex: { col: 0, row: 1 } }];
    const target = { col: 0, row: 2 };
    const amUnit = { id: 'a', morale: 7, hasStartedMoving: true, usedAssaultMovement: true };

    const { effect } = defensiveFF(fg, target, [amUnit]);
    // dr=2, tem=0, ffnam=0 → idx=2, IFT[8][2] = [1,'KIA']
    expect(effect).toEqual([1, 'KIA']);
  });
});
