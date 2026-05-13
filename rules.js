import { calcNearestHexes, hexLabel, hexDistance, hexToPixel, pixelToHex } from './hexUtils.js';
import { hexMap } from './hexmap.js';

// Terrain Effect Modifier — модификатор броска при стрельбе по цели в этом террейне
const TEM = {
  woodenBuilding: +2,
  stoneBuilding:  +3,
  forest:         +1,
  brush:           0,
  orchard:         0,
  hill:            0,
  dirtRoad:        0,
  pavedRoad:       0,
  // открытая местность — 0
};

// Стоимость входа в гекс по типу террейна (MF)
const TERRAIN_COST = {
  forest:         2,
  woodenBuilding: 2,
  stoneBuilding:  2,
  brush:          2,
  orchard:        1,
  hill:           1,
  dirtRoad:       1,
  pavedRoad:      1,
  // 'Woods-Road', 'crestLine' — разработаем позже
};

// В гексе есть Woods-Road — нужно спросить игрока какой террейн использовать
export function hasWoodsRoad(targetHex) {
  const label = hexLabel(targetHex.col, targetHex.row);
  return (hexMap[label] || []).includes('Woods-Road');
}

// Гекс содержит дорогу
export function isRoadHex(hex) {
  const terrain = hexMap[hexLabel(hex.col, hex.row)] || [];
  return terrain.includes('dirtRoad') || terrain.includes('pavedRoad');
}

// Считаем стоимость входа в гекс
// overrideTerrain — игрок выбрал конкретный террейн (для Woods-Road)
export function checkCost(targetHex, fromHex, overrideTerrain = null) {
  // получаем буквенно-цифровое имя гекса (например 'D4')
  const targetLabel = hexLabel(targetHex.col, targetHex.row);
  // массив террейнов в этом гексе ([] если в hexMap нет — открытое поле)
  let targetTerrain = hexMap[targetLabel] || [];

  // если игрок явно выбрал террейн (UseWoods/UseRoad) — используем только его
  if (overrideTerrain) targetTerrain = [overrideTerrain];

  // crestLine — особый случай, стоимость зависит откуда приходим
  if (targetTerrain.includes('crestLine')) {
    // террейны гекса без crestLine
    const others = targetTerrain.filter(t => t !== 'crestLine');

    // базовая стоимость по другим террейнам
    let baseCost;
    if (others.length === 0) {
      baseCost = 1;
    } else {
      baseCost = Math.max(...others.map(t => TERRAIN_COST[t] ?? 1));
    }

    // приходим сверху (hill или другой crestLine) — обычная цена, иначе ×2
    const fromLabel   = hexLabel(fromHex.col, fromHex.row);
    const fromTerrain = hexMap[fromLabel] || [];
    const fromAbove   = fromTerrain.includes('hill') || fromTerrain.includes('crestLine');

    if (fromAbove) return baseCost;
    return baseCost * 2;
  }

  // обычный гекс
  if (targetTerrain.length === 0) return 1;
  // в гексе может быть несколько террейнов (например forest+hill) — берём максимум
  return Math.max(...targetTerrain.map(t => TERRAIN_COST[t] ?? 1));
}

// У всех выбранных юнитов должно хватить mf на оплату cost
export function checkMovement(selectedIds, units, cost = 1) {
  return selectedIds.every(id => units[id].mf >= cost);
}

// Можно ли добавить юнита в огневую группу
// Первый юнит добавляется всегда. Последующие — только если в том же гексе
// или соседнем хотя бы с одним уже добавленным.
export function checkAddingToFG(unitId, firegroup, units) {
  if (firegroup.length === 0) return true;

  const unitHex = units[unitId].hex;
  return firegroup.some(id => {
    const otherHex = units[id].hex;
    if (otherHex.col === unitHex.col && otherHex.row === unitHex.row) return true;
    return calcNearestHexes(otherHex).some(h => h.col === unitHex.col && h.row === unitHex.row);
  });
}

// Кликнутый гекс — один из 6 соседних к гексу юнита fromUnitId
export function checkIsNearestHex(clickedHex, fromUnitId, units) {
  const fromHex   = units[fromUnitId].hex;
  const neighbors = calcNearestHexes(fromHex);
  return neighbors.some(h => h.col === clickedHex.col && h.row === clickedHex.row);
}

// Юнит может объявить Double Time
export function checkDoubleTimeCapability(id, units) {
  const u = units[id];
  if (u.type !== 'squad' && u.type !== 'leader') return false;
  if (u.broken || u.pinned || u.wounded || u.exhausted) return false;
  if (u.hasStartedMoving) return false;
  if (u.usedAssaultMovement) return false;   // AM юнит не может DoubleTime
  return true;
}

// Юнит может объявить Assault Movement
export function checkAssaultMovementCapability(unit) {
  if (unit.type !== 'squad' && unit.type !== 'leader') return false;
  if (unit.broken || unit.pinned || unit.wounded || unit.exhausted) return false;
  if (unit.hasStartedMoving) return false;
  return true;
}

// FFNAM (First Fire Non-Assault Movement) — штрафной DRM -1 защитного огня
// если цель двигалась без объявления Assault Movement.
// Сломанный юнит теряет AM-статус → получает -1 даже если объявлял.
export function calcFFNAM(unit) {
  if (!unit.hasStartedMoving)               return 0;
  if (unit.broken)                          return -1;
  if (unit.usedAssaultMovement)             return 0;
  return -1;
}

// FFMO (First Fire Movement in Open Ground) — штрафной DRM -1
// если цель двигалась И находится на открытой местности (без TEM).
// Кумулятивен с FFNAM.
export function calcFFMO(unit, hex) {
  if (!unit.hasStartedMoving) return 0;
  if (calcTEM(hex) > 0)       return 0;
  return -1;
}

export function checkOverstack(unitIds, units) {
  let squadCount  = 0;
  let leaderCount = 0;

  unitIds.forEach(id => {
    const u = units[id];
    if (u.type === 'leader') {
      leaderCount += 1;
    } else if (u.type === 'squad') {
      // halfSquad и crew = 0.5, обычный squad = 1
      const half = u.size === 'halfSquad' || u.size === 'crew';
      squadCount += half ? 0.5 : 1;
    }
  });

  if (squadCount  > 3) return false;
  if (leaderCount > 4) return false;
  return true;
}

// Размер бонуса лидера за движение
export function calcLeadBonus() {
  return 2;
}

// Infantry Fire Table — ключ FP, значение массив подмассивов [k, effect]
// Индекс в массиве соответствует DR - 2 (т.е. [0] это DR 2, [1] это DR 3 и т.д.)
// DR за пределами массива → 'NE' (No Effect)
const IFT = {
  1:  [[1,'KIA'],[1,'K/'],[1,'MC'],[1,'MC'],[0,'MC'],[0,'PTC']],
  2:  [[2,'KIA'],[1,'KIA'],[1,'K/'],[1,'MC'],[1,'MC'],[0,'MC'],[0,'PTC']],
  4:  [[2,'KIA'],[1,'KIA'],[2,'K/'],[2,'MC'],[1,'MC'],[1,'MC'],[0,'MC'],[0,'PTC']],
  6:  [[3,'KIA'],[2,'KIA'],[1,'KIA'],[2,'K/'],[2,'MC'],[1,'MC'],[1,'MC'],[0,'MC'],[0,'PTC']],
  8:  [[3,'KIA'],[2,'KIA'],[1,'KIA'],[2,'K/'],[2,'MC'],[2,'MC'],[1,'MC'],[1,'MC'],[0,'MC'],[0,'PTC']],
  12: [[3,'KIA'],[2,'KIA'],[1,'KIA'],[3,'K/'],[3,'MC'],[2,'MC'],[2,'MC'],[1,'MC'],[1,'MC'],[0,'MC'],[0,'PTC']],
  16: [[4,'KIA'],[3,'KIA'],[2,'KIA'],[1,'KIA'],[3,'K/'],[3,'MC'],[2,'MC'],[2,'MC'],[1,'MC'],[1,'MC'],[0,'MC'],[0,'PTC']],
  20: [[4,'KIA'],[3,'KIA'],[2,'KIA'],[1,'KIA'],[4,'K/'],[4,'MC'],[3,'MC'],[2,'MC'],[2,'MC'],[1,'MC'],[1,'MC'],[0,'MC'],[0,'PTC']],
  24: [[5,'KIA'],[4,'KIA'],[3,'KIA'],[2,'KIA'],[1,'KIA'],[4,'K/'],[4,'MC'],[3,'MC'],[2,'MC'],[2,'MC'],[1,'MC'],[1,'MC'],[0,'MC'],[0,'PTC']],
  30: [[6,'KIA'],[5,'KIA'],[4,'KIA'],[3,'KIA'],[2,'KIA'],[1,'KIA'],[4,'K/'],[4,'MC'],[3,'MC'],[2,'MC'],[2,'MC'],[1,'MC'],[1,'MC'],[0,'MC'],[0,'PTC']],
  36: [[7,'KIA'],[6,'KIA'],[5,'KIA'],[4,'KIA'],[3,'KIA'],[2,'KIA'],[1,'KIA'],[4,'K/'],[4,'MC'],[3,'MC'],[2,'MC'],[2,'MC'],[1,'MC'],[1,'MC'],[0,'MC'],[0,'PTC']],
};

// Упорядоченный список FP-колонок (для поиска ближайшей вниз)
const IFT_COLUMNS = [1, 2, 4, 6, 8, 12, 16, 20, 24, 30, 36];

// Сдвигаем FP вниз до ближайшей существующей колонки
export function getIFTColumn(fp) {
  let col = 1;
  for (const c of IFT_COLUMNS) {
    if (c <= fp) col = c;
    else break;
  }
  return col;
}

// Поиск результата в IFT по FP и финальному DR
// (индекс в массиве = DR - 2, т.к. минимальный DR на 2d6 это 2)
export function lookupIFT(fp, dr) {
  const col = getIFTColumn(fp);
  return IFT[col][dr - 2] ?? 'NE';
}

// Эффективная firepower юнита по целевому гексу
export function calcFirepower(unit, targetHex) {
  const dist = hexDistance(unit.hex, targetHex);
  const fp   = unit.firepower;
  const rng  = unit.range;

  if (dist > rng * 2) return 0;          // вне максимальной дальности
  if (dist === 1)     return fp * 2;     // Point Blank Fire (соседний гекс)
  if (dist <= rng)    return fp;         // в normal range
  return fp / 2;                          // long range (rng < dist ≤ 2*rng)
}

// Итоговая firepower группы юнитов по целевому гексу
export function calcTotalFirepower(units, targetHex) {
  let sum = 0;
  for (const u of units) {
    sum += calcFirepower(u, targetHex);
  }
  return sum;
}

// Вычисление огневого воздействия по IFT
// drm — суммарный DRM (TEM + Hindrance + FFNAM + FFMO + любые другие модификаторы)
// Возвращает [k, effect] или false (промах)
export function calcFireEffect(units, targetHex, drm = 0) {
  const fp  = calcTotalFirepower(units, targetHex);
  const col = getIFTColumn(fp);
  const arr = IFT[col];

  // бросок 2d6 + DRM
  const dr  = roll2d6();
  const idx = dr + drm;

  console.log(`[calcFireEffect] FP=${fp}, col=${col}, DR=${dr}, DRM=${drm}, idx=${idx}`);

  if (idx >= arr.length) {
    console.log(`[calcFireEffect] промах (idx ${idx} >= length ${arr.length})`);
    return false;
  }
  console.log(`[calcFireEffect] результат:`, arr[idx]);
  return arr[idx];
}

// Бросок 2d6
function roll2d6() {
  console.log(`бросаем 2d6... (DR)`);  
  let result = (Math.floor(Math.random() * 6) + 1) + (Math.floor(Math.random() * 6) + 1);;
  console.log(`результат броска 2d6: ${result}`); 
  return result;  
}

// Бросок d6
function rollD6() {
  console.log(`бросаем d6...(dr)`);
  let result = Math.floor(Math.random() * 6) + 1;
  console.log(`результат броска d6: ${result}`);
  return result;
}

// Применяет эффект огня к юнитам в целевом гексе
// effect — [k, type] из calcFireEffect или false (промах)
// targets — массив юнитов в целевом гексе которые двигались
// Возвращает таблицу { unitId: state } — Engine применит к State потом
// Сама функция в State не лезет
export function applyFireEffect(effect, targets) {
  const result = {};
  if (effect === false) return result;       // промах

  const [k, type] = effect;

  switch (type) {
    case 'MC': {
      // [0,'MC']=NMC, [k,'MC']=MC с модификатором +k
      // k — это число из ячейки IFT, например [2, 'MC'] → k=2
      targets.forEach(u => {
        const baseDr = roll2d6();
        const finalDr = baseDr + k;
        const where = u.hex ? hexLabel(u.hex.col, u.hex.row) : '?';
        const desc  = `${u.id} (${u.nation} ${u.type} в ${where})`;
        console.log(`[MC] ${desc}: DR=${baseDr}, IFT-mod(k)=${k}, итог=${finalDr}, morale=${u.morale} → ${finalDr > u.morale ? 'broken' : 'ok'}`);
        if (finalDr > u.morale) result[u.id] = 'broken';
      });
      break;
    }

    case 'PTC': {
      // Pin Task Check — каждый небрейкнутый/незапиненный юнит проверяет мораль
      targets.forEach(u => {
        if (u.broken || u.pinned) return;
        const dr = roll2d6();
        const where = u.hex ? hexLabel(u.hex.col, u.hex.row) : '?';
        const desc  = `${u.id} (${u.nation} ${u.type} в ${where})`;
        console.log(`[PTC] ${desc}: DR=${dr}, morale=${u.morale} → ${dr > u.morale ? 'pinned' : 'ok'}`);
        if (dr > u.morale) result[u.id] = 'pinned';
      });
      break;
    }

    case 'KIA': {
      // k случайных убиты, остальные автоматически broken
      const shuffled  = [...targets].sort(() => Math.random() - 0.5);
      const killed    = shuffled.slice(0, k);
      const survivors = shuffled.slice(k);
      killed.forEach(u    => result[u.id] = 'eliminated');
      survivors.forEach(u => result[u.id] = 'broken');
      break;
    }

    case 'K/': {
      // 1 случайный — Casualty Reduction, остальные — MC + k
      const idx    = Math.floor(Math.random() * targets.length);
      const victim = targets[idx];
      const others = targets.filter((_, i) => i !== idx);

      if (victim.type === 'leader') {
        // SMC: 1-4 = light wound, 5-6 = eliminated
        const dr = rollD6();
        console.log(`[K/ SMC wound] ${victim.id}: dr=${dr} → ${dr <= 4 ? 'wounded' : 'eliminated'}`);
        result[victim.id] = dr <= 4 ? 'wounded' : 'eliminated';
      } else if (victim.size === 'halfSquad' || victim.size === 'crew') {
        console.log(`[K/ casualty] ${victim.id} → eliminated`);
        result[victim.id] = 'eliminated';
      } else {
        // squad → halfSquad
        console.log(`[K/ casualty] ${victim.id} → reduced`);
        result[victim.id] = 'reduced';
      }

      others.forEach(u => {
        const baseDr  = roll2d6();
        const finalDr = baseDr + k;
        const where   = u.hex ? hexLabel(u.hex.col, u.hex.row) : '?';
        const desc    = `${u.id} (${u.nation} ${u.type} в ${where})`;
        console.log(`[K/ MC] ${desc}: DR=${baseDr}, IFT-mod(k)=${k}, итог=${finalDr}, morale=${u.morale} → ${finalDr > u.morale ? 'broken' : 'ok'}`);
        if (finalDr > u.morale) result[u.id] = 'broken';
      });
      break;
    }
  }

  return result;
}

// Гексы которые считаются Hindrance (мешают, но не блокируют LOS)
const HINDRANCE_TERRAINS = ['orchard', 'grain', 'brush'];

// Возвращает массив промежуточных гексов на линии от центра одного гекса
// до центра другого (без самих fromHex и toHex).
// Для случая "линия по hexside" возвращает оба соседних гекса
// благодаря микро-смещениям ±epsilon.
export function getHexToHexArray(fromHex, toHex) {
  // пиксельные координаты центров
  const start = hexToPixel(fromHex.col, fromHex.row);
  const end   = hexToPixel(toHex.col, toHex.row);

  // Set для накопления уникальных гексов (ключ — строка "col-row")
  const steps  = 50;
  const hexSet = new Set();

  for (let i = 0; i <= steps; i++) {
    // линейная интерполяция вдоль линии
    const t = i / steps;
    const x = start.x + (end.x - start.x) * t;
    const y = start.y + (end.y - start.y) * t;

    // основная точка + микро-сдвиги вверх/вниз — ловим оба соседних
    // гекса когда линия идёт строго по hexside
    const epsilon = 0.5;
    [
      pixelToHex(x, y),
      pixelToHex(x, y + epsilon),
      pixelToHex(x, y - epsilon),
    ].forEach(h => hexSet.add(`${h.col}-${h.row}`));
  }

  // исключаем гекс стрелка и гекс цели — они не считаются промежуточными
  hexSet.delete(`${fromHex.col}-${fromHex.row}`);
  hexSet.delete(`${toHex.col}-${toHex.row}`);

  // возвращаем массив объектов {col, row}
  return [...hexSet].map(key => {
    const [col, row] = key.split('-').map(Number);
    return { col, row };
  });
}

// Если все гексы пути (включая стрелка и цель) содержат road —
// это tree-lined road, hindrance подавляется.
function isTreeLinedRoad(fromHex, toHex, intermediate) {
  const hasRoad = h => {
    const terrain = hexMap[hexLabel(h.col, h.row)] || [];
    return terrain.includes('dirtRoad') || terrain.includes('pavedRoad');
  };
  return [fromHex, toHex, ...intermediate].every(hasRoad);
}

// Суммарный Hindrance DRM для огня группы по цели.
// Для каждого стрелка считаем свой путь и его hindrance.
// Берём максимум (худший для стрелков) — отражает сложность для группы.
export function checkHindrance(shooters, targetHex) {
  if (shooters.length === 0) return 0;
  return Math.max(...shooters.map(shooter => {
    const intermediate = getHexToHexArray(shooter.hex, targetHex);

    // tree-lined road exception — все гексы пути имеют road
    if (isTreeLinedRoad(shooter.hex, targetHex, intermediate)) return 0;

    let total = 0;
    for (const h of intermediate) {
      const terrain = hexMap[hexLabel(h.col, h.row)] || [];
      for (const t of terrain) {
        if (HINDRANCE_TERRAINS.includes(t)) total += 1;
      }
    }
    return total;
  }));
}

// Проверка LOS (Line of Sight). Сейчас геометрических препятствий нет,
// поэтому LOS существует всегда, кроме случая когда суммарный hindrance >= 6
// (комбинация препятствий полностью блокирует видимость).
export function checkLOS(shooters, targetHex) {
  return checkHindrance(shooters, targetHex) < 6;
}

// Уровень высоты гекса (0 — равнина, 1 — hill или crestLine)
export function calcElevation(hex) {
  const terrain = hexMap[hexLabel(hex.col, hex.row)] || [];
  if (terrain.includes('hill') || terrain.includes('crestLine')) return 1;
  return 0;
}

// Height Advantage: +1 TEM если хотя бы один стрелок ниже цели,
// и цель не защищена другим положительным TEM
export function calcHeightAdvantage(shooters, targetHex) {
  const targetElev     = calcElevation(targetHex);
  if (shooters.length === 0) return 0;
  const minShooterElev = Math.min(...shooters.map(u => calcElevation(u.hex)));
  if (minShooterElev >= targetElev) return 0;
  if (calcTEM(targetHex) > 0)       return 0;
  return 1;
}

// TEM целевого гекса (максимум по всем террейнам)
export function calcTEM(hex) {
  const terrain = hexMap[hexLabel(hex.col, hex.row)] || [];
  if (terrain.length === 0) return 0;
  return Math.max(0, ...terrain.map(t => TEM[t] ?? 0));
}

// Полный пайплайн Defensive First Fire
// firegroupUnits — массив стреляющих, targetHex — гекс цели,
// hexUnits — массив юнитов в целевом гексе которые двигались
// Возвращает { effect, changes } где changes это таблица { unitId: state }
export function defensiveFF(firegroupUnits, targetHex, hexUnits) {
  // проверка линии огня
  const los = checkLOS(firegroupUnits, targetHex);
  console.log(`[defensiveFF] LOS=${los}`);
  if (!los) {
    console.log('[defensiveFF] нет LOS — огонь невозможен');
    return { effect: false, changes: {} };
  }

  // TEM и HA взаимоисключающие — берём один или другой
  const baseTem   = calcTEM(targetHex);
  const ha        = calcHeightAdvantage(firegroupUnits, targetHex);
  const tem       = baseTem > 0 ? baseTem : ha;

  // отдельный счёт hindrance
  const hindrance = checkHindrance(firegroupUnits, targetHex);

  // все юниты в стеке имеют один и тот же AM-флаг — берём первого
  // тернарный оператор: условие ? значение_если_true : значение_если_false
  const ffnam     = hexUnits.length > 0 ? calcFFNAM(hexUnits[0]) : 0;
  const ffmoRaw   = hexUnits.length > 0 ? calcFFMO(hexUnits[0], targetHex) : 0;
  // HA или hindrance подавляют FFMO
  const ffmo      = (ha > 0 || hindrance > 0) ? 0 : ffmoRaw;

  // итоговый DRM — сумма всех компонент
  const totalDRM  = tem + hindrance + ffnam + ffmo;

  console.log(`[defensiveFF] TEM=${tem}, HINDRANCE=${hindrance}, FFNAM=${ffnam}, FFMO=${ffmo}, totalDRM=${totalDRM}`);

  const effect  = calcFireEffect(firegroupUnits, targetHex, totalDRM);
  const changes = applyFireEffect(effect, hexUnits);
  return { effect, changes };
}

// Возвращает id MMC из выбранных, которые получают бонус лидера
export function getLeaderBonusRecipients(selectedIds, units) {
  const leaders    = selectedIds.filter(id => units[id].type === 'leader');
  const mmcs       = selectedIds.filter(id => units[id].type === 'squad');
  const recipients = [];

  mmcs.forEach(mmcId => {
    const mmcHex    = units[mmcId].hex;
    // бонус фиксирован независимо от количества лидеров в стеке
    const hasLeader = leaders.some(lid =>
      units[lid].hex?.col === mmcHex?.col &&
      units[lid].hex?.row === mmcHex?.row
    );
    if (hasLeader) recipients.push(mmcId);
  });

  return recipients;
}
