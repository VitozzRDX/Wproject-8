import { State } from './state.js';
import { RendererUI } from './rendererUI.js';
import * as Rules from './rules.js';
import { pixelToHex, hexToPixel } from './hexUtils.js';
import { PhaseManager } from './phaseManager.js';

// Обработчики команд
const handlers = {
  CLICK_UNIT  ({ unitId }) {
    // снимаем выбор со всех ранее выбранных
    State.selected.forEach(id => State.setUnit(id, 'selected', false));
    State.selected = [];
    // выбираем только этого
    State.setUnit(unitId, 'selected', true);
    State.selected.push(unitId);
    refreshDoubleTimeButton();
    refreshAssaultMovementButton();
  },
  ADD_TO_SELECTION({ unitId }) {
    State.setUnit(unitId, 'selected', true);
    State.selected.push(unitId);            // добавляем к уже выбранным
    refreshDoubleTimeButton();
    refreshAssaultMovementButton();
  },
  SELECT_DEFENDER({ unitId }) {
    // не чистим selected — атакеры остаются выбранными
    if (!State.selected.includes(unitId)) {
      State.setUnit(unitId, 'selected', true);
      State.selected.push(unitId);
    }
    // пробуем добавить в огневую группу
    if (Rules.checkAddingToFG(unitId, State.firegroup, State.units)) {
      if (!State.firegroup.includes(unitId)) State.firegroup.push(unitId);
    }
  },
  DESELECT_ALL() {
    // если ждём выбор Woods-Road — отменяем, выбор не сбрасываем
    if (State.pendingMove) {
      State.pendingMove = null;
      RendererUI.removeButton('UseWoods');
      RendererUI.removeButton('UseRoad');
      return;
    }
    // снять выбор только с Defender'ов и очистить firegroup, атакеров оставить
    const defendingSide = PhaseManager.getDefendingSide();
    const defenders     = State.selected.filter(id => State.units[id].nation === defendingSide);
    if (defenders.length > 0) {
      defenders.forEach(id => State.setUnit(id, 'selected', false));
      State.selected = State.selected.filter(id => !defenders.includes(id));
      State.firegroup = [];
      return;
    }
    // Defender'ов нет — снимаем выбор полностью
    State.selected.forEach(id => State.setUnit(id, 'selected', false));
    State.selected = [];
    RendererUI.removeButton('DoubleTime');
    RendererUI.removeButton('AssaultMovement');
  },
  MOVE_TO     (cmd)        {
    // все выбранные уже отходили — двигаться нельзя
    const allMoved = State.selected.every(id => State.units[id].mf === 0);
    if (allMoved) {
      // кликнули на юнита — трактуем как select (переключаем выбор)
      if (cmd.unitId) handlers.CLICK_UNIT(cmd);
      // кликнули на карту — ничего не делаем (иначе handleMovement зря нарисовал бы Woods-Road кнопки)
      return;
    }
    handleMovement(cmd);
  },
  CLICK_MAP   ()           { console.log('карта');                     },
  CLICK_EMPTY ()           { console.log('пустота');                   },
  DEFENSIVE_FIRST_FIRE(cmd) { handleFiring(cmd);                            },
};


// Считаем позиции всех юнитов в гексе — равномерно вдоль диагонали
function _calculateNewPos(unitIds, hexCenter) {
  const step   = 6;
  const result = {};
  unitIds.forEach((id, i) => {
    const offset = i - (unitIds.length - 1) / 2;
    result[id]   = {
      x: hexCenter.x + step * offset,
      y: hexCenter.y - step * offset,
    };
  });
  return result;
}

// Пересчитываем позиции всех юнитов в гексе
function recalculateHex(hex) {
  const ids       = State.getHexState(hex);
  const hexCenter = hexToPixel(hex.col, hex.row);
  const positions = _calculateNewPos(ids, hexCenter);
  Object.entries(positions).forEach(([id, pos]) => State.setUnit(id, 'pos', pos));
}

// Убрать юнита из его текущего гекса
function removeUnitFromHex(id) {
  const hex = State.units[id].hex;
  if (!hex) return;
  State.setHexState(hex, State.getHexState(hex).filter(i => i !== id));
}

// Поставить юнита в целевой гекс
function addUnitToHex(id, hex) {
  // existing — массив id юнитов которые уже находятся в этом гексе
  const existing = State.getHexState(hex);

  // если юнита там ещё нет — добавляем (защита от дубля при повторном вызове)
  if (!existing.includes(id)) {
    State.setHexState(hex, [...existing, id]);
  }

  // запоминаем в самом юните в каком он сейчас гексе
  // (чтобы потом removeUnitFromHex знал откуда его убирать)
  State.units[id].hex = hex;
}

// Переместить выбранных в целевой гекс, пересчитать все затронутые
function moveSelectedToHex(targetHex) {
  const oldHexes = State.selected.map(id => State.units[id].hex).filter(Boolean);

  State.selected.forEach(id => {
    removeUnitFromHex(id);
    addUnitToHex(id, targetHex);
  });

  oldHexes.forEach(recalculateHex);
  recalculateHex(targetHex);
}

// Перерисовать кнопку AssaultMovement — показать если выбранные на активной стороне и все способны
function refreshAssaultMovementButton() {
  RendererUI.removeButton('AssaultMovement');
  if (State.selected.length === 0) return;
  const selSide = State.units[State.selected[0]].nation;
  if (selSide !== PhaseManager.getActiveSide()) return;
  const allCapable = State.selected.every(id => Rules.checkAssaultMovementCapability(State.units[id]));
  if (allCapable) {
    RendererUI.drawButton({ x: 10, y: 140, label: 'AssaultMovement', onSignal: Engine.onSignal });
  }
}

// Перерисовать кнопку DoubleTime — показать только если выбранные на активной стороне и все способны
function refreshDoubleTimeButton() {
  RendererUI.removeButton('DoubleTime');
  if (State.selected.length === 0) return;
  // только для активной стороны (в чью фазу идёт)
  const selSide = State.units[State.selected[0]].nation;
  if (selSide !== PhaseManager.getActiveSide()) return;
  const allCapable = State.selected.every(id => Rules.checkDoubleTimeCapability(id, State.units));
  if (allCapable) {
    RendererUI.drawButton({ x: 10, y: 100, label: 'DoubleTime', onSignal: Engine.onSignal });
  }
}

// Выдать MMC бонус MF за движение с лидером (один раз за фазу)
function applyLeaderBonus() {
  const recipients = Rules.getLeaderBonusRecipients(State.selected, State.units);
  const bonus      = Rules.calcLeadBonus();
  recipients.forEach(id => {
    if (!State.units[id].movementBonusApplied) {
      State.changeUnit(id, 'mf', bonus);
      State.units[id].movementBonusApplied = true;
    }
  });
}

// Группа юнитов которая начала двигаться вместе (правило 2 — никто извне)
let originalGroup = [];

// Двухуровневая блокировка предыдущего мовера
// originalGroup — для правила 2: пока кто-то из стартовавших вместе ещё двигается, чужой не пройдёт
// currentMover  — для правила 1: после смены индивидуального мовера предыдущий запечатывается
function lockPreviousMover() {
  const inOriginal = State.selected.every(id => originalGroup.includes(id));

  // совсем новая группа — финализировать всех из original
  if (!inOriginal) {
    const toLock = new Set([...originalGroup, ...State.currentMover]);
    toLock.forEach(id => {
      State.setUnit(id, 'active', false);
      State.setUnit(id, 'mf', 0);
      if (State.units[id].usedDoubleTime) State.setUnit(id, 'exhausted', true);
    });
    originalGroup       = [...State.selected];
    State.currentMover  = [...State.selected];
    State.currentMover.forEach(id => State.setUnit(id, 'active', true));
    return;
  }

  // субсет внутри текущего мовера — просто сужаем (отвалившиеся остаются ожидать)
  const isSubsetOfCurrent = State.selected.every(id => State.currentMover.includes(id));
  if (isSubsetOfCurrent && State.currentMover.length > 0) {
    State.currentMover = [...State.selected];
    return;
  }

  // другой субсет original — блокируем текущего мовера (правило 1)
  State.currentMover.forEach(id => {
    State.setUnit(id, 'active', false);
    State.setUnit(id, 'mf', 0);
    if (State.units[id].usedDoubleTime) State.setUnit(id, 'exhausted', true);
  });
  State.currentMover = [...State.selected];
  State.currentMover.forEach(id => State.setUnit(id, 'active', true));
}

function handleFiring(cmd) {
  // вычисляем гекс по координатам клика (Interpreter этого не делает)
  const targetHex = pixelToHex(cmd.pos.x, cmd.pos.y);

  // огонь только если в этом гексе есть кто-то из currentMover
  const hexUnits = State.currentMover
    .map(id => State.units[id])
    .filter(u => u.hex.col === targetHex.col && u.hex.row === targetHex.row);
  if (hexUnits.length === 0) return;   // мимо — не наш гекс

  const firegroupArr = State.firegroup.map(id => State.units[id]);

  // вся логика огня — в Rules.defensiveFF
  const { effect, changes } = Rules.defensiveFF(firegroupArr, targetHex, hexUnits);
  console.log('effect:', effect, 'changes:', changes);

  // применяем изменения к State (broken/pinned/eliminated/reduced/wounded → true)
  Object.entries(changes).forEach(([id, state]) => {
    State.setUnit(id, state, true);
  });

  // снять выбор с защитников и очистить firegroup
  // (атакеры остаются выбранными, чтобы можно было продолжить движение)
  const defendingSide = PhaseManager.getDefendingSide();
  const defenders     = State.selected.filter(id => State.units[id].nation === defendingSide);
  defenders.forEach(id => State.setUnit(id, 'selected', false));
  State.selected      = State.selected.filter(id => !defenders.includes(id));
  State.firegroup     = [];
}

// Завершить отложенный мув после выбора UseWoods/UseRoad
function completePendingMove(terrain) {
  const pending = State.pendingMove;
  State.pendingMove = null;
  RendererUI.removeButton('UseWoods');
  RendererUI.removeButton('UseRoad');
  handleMovement({ pos: pending.pos }, terrain);
}

// Списать стоимость мува у выбранных и отметить что они начали движение
function spendMovement(cost, hex, isRoad) {
  State.selected.forEach(id => {
    const u = State.units[id];
    State.changeUnit(id, 'mf', -cost);
    u.hasStartedMoving = true;
    u.path.push({ hex, isRoad });           // запоминаем мув в пути

    if (u.mf === 0 && u.usedDoubleTime) {
      State.setUnit(id, 'exhausted', true);
    }

    // road-бонус: все шаги пути были по road, и не использовали Woods защиту
    const allRoad = u.path.length > 0 && u.path.every(p => p.isRoad);
    if (u.mf === 0 && allRoad && !u.usedWoodsRoad && !u.roadBonusGranted) {
      State.changeUnit(id, 'mf', +1);
      u.roadBonusGranted = true;
    }
  });
}

function handleMovement({ pos }, overrideTerrain = null) {
  // выбор Defender'ов был для огня — при движении сбрасываем их и firegroup
  const activeSide = PhaseManager.getActiveSide();
  const defenders  = State.selected.filter(id => State.units[id].nation !== activeSide);
  if (defenders.length > 0) {
    defenders.forEach(id => State.setUnit(id, 'selected', false));
    State.selected  = State.selected.filter(id => !defenders.includes(id));
    State.firegroup = [];
  }

  const hex     = pixelToHex(pos.x, pos.y);
  const fromHex = State.units[State.selected[0]].hex;

  // Woods-Road — спросить игрока, отложить мув
  if (!overrideTerrain && Rules.hasWoodsRoad(hex)) {
    State.pendingMove = { pos, hex, fromHex };
    RendererUI.drawButton({ x: 10, y: 140, label: 'UseWoods', onSignal: Engine.onSignal });
    RendererUI.drawButton({ x: 10, y: 180, label: 'UseRoad',  onSignal: Engine.onSignal });
    return;
  }

  const cost = Rules.checkCost(hex, fromHex, overrideTerrain);

  // целевой гекс должен быть соседним к гексу выбранных юнитов
  if (!Rules.checkIsNearestHex(hex, State.selected[0], State.units)) return;

  // если road-бонус уже выдан — следующий мув разрешён только на road
  const allOnBonus = State.selected.every(id => State.units[id].roadBonusGranted);
  if (allOnBonus && !Rules.isRoadHex(hex)) return;

  // AM-юнит уже сделал свой 1 мув — больше двигаться нельзя (но может тратить MF на другое)
  const allAMDone = State.selected.every(id => {
    const u = State.units[id];
    return u.usedAssaultMovement && u.path.length >= 1;
  });
  if (allAMDone) return;

  // AM-юнит не должен потратить весь MF одним мувом
  const wouldTakeAll = State.selected.some(id => {
    const u = State.units[id];
    return u.usedAssaultMovement && (u.mf - cost <= 0);
  });
  if (wouldTakeAll) return;

  // road-статус целевого гекса (учитывая выбор UseRoad/UseWoods)
  const targetIsRoad = overrideTerrain
    ? (overrideTerrain === 'dirtRoad' || overrideTerrain === 'pavedRoad')
    : Rules.isRoadHex(hex);

  // прогноз: кто окажется в гексе после мува
  const future = [...new Set([...State.getHexState(hex), ...State.selected])];
  if (!Rules.checkOverstack(future, State.units)) return;

  // применяем бонус лидера до проверки MF, пока юниты ещё в старых гексах
  applyLeaderBonus();

  // у всех выбранных должно хватить MF
  if (!Rules.checkMovement(State.selected, State.units, cost)) return;

  // мув гарантированно состоится — теперь запечатываем предыдущего мовера
  lockPreviousMover();

  spendMovement(cost, hex, targetIsRoad);

  // обновить кнопки — после движения они уже недоступны
  refreshDoubleTimeButton();
  refreshAssaultMovementButton();

  moveSelectedToHex(hex);
}

export const Engine = {
  // Инициализация: передаём uiLayer в RendererUI, рисуем кнопки
  init(uiLayer) {
    RendererUI.init(uiLayer);
    RendererUI.drawButton({ x: 10, y: 10, label: 'Rally', onSignal: Engine.onSignal });
  },

  // Получаем команду от Interpreter и выполняем нужный handler
  execute(command) {
    handlers[command.cmd]?.(command);
  },

  // Слушаем сигналы от кнопок
  onSignal(signal) {
    switch (signal) {
      case 'Rally':
        console.log('Rally');
        RendererUI.drawButton({ x: 10, y: 54, label: 'Next Phase', onSignal: Engine.onSignal });
        break;
      case 'Next Phase':
        console.log('Next Phase');
        break;
      case 'DoubleTime':
        State.selected.forEach(id => {
          State.changeUnit(id, 'mf', +2);
          State.units[id].usedDoubleTime = true;
        });
        RendererUI.removeButton('DoubleTime');
        break;
      case 'AssaultMovement':
        State.selected.forEach(id => { State.units[id].usedAssaultMovement = true; });
        RendererUI.removeButton('AssaultMovement');
        RendererUI.removeButton('DoubleTime');     // взаимоисключающие
        break;
      case 'UseWoods':
        State.selected.forEach(id => { State.units[id].usedWoodsRoad = true; });
        completePendingMove('forest');
        break;
      case 'UseRoad':
        completePendingMove('dirtRoad');
        break;
    }
  }
};
