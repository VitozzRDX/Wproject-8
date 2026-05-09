import { Engine } from './engine.js';
import { State } from './state.js';
import { PhaseManager } from './phaseManager.js';

// Таблица правил: первое совпавшее правило — победитель
const RULES = [
  {
    // правый клик по гексу куда зашли двинувшиеся юниты — Defensive First Fire
    // (Engine сам определит гекс по координатам и проверит попал ли клик)
    match: ({ button }) => {
      if (button !== 2)                              return false;
      if (State.firegroup.length === 0)              return false;
      if (State.currentMover.length === 0)           return false;
      if (PhaseManager.getActiveSide() === null)     return false;
      return true;
    },
    cmd: 'DEFENSIVE_FIRST_FIRE'
  },
  {
    // есть выбранные юниты + фаза movement + клик на юнита или карту
    match: ({ unitId, mapId, shiftKey, button }) => {
      if (!(unitId || mapId === 'map'))                          return false;
      if (shiftKey)                                              return false;
      if (button === 2)                                          return false;  // правый клик — не для движения
      if (State.selected.length === 0)                           return false;
      if (PhaseManager.getPhase() !== 'german movement phase')   return false;
      // выбранные должны быть из активной стороны (соответствовать фазе)
      const selSide = State.units[State.selected[0]].nation;
      if (selSide !== PhaseManager.getActiveSide()) return false;
      // на вражеский юнит не ходим
      if (unitId && State.units[unitId].nation !== selSide) return false;
      return true;
    },
    cmd: 'MOVE_TO'
  },
  {
    // шифт+клик — добавить в стек, но только если кликнутый юнит в том же гексе что и уже выбранные
    match: ({ unitId, shiftKey, button }) => {
      // нет юнита под курсором, нет шифта или правый клик → не наш случай
      if (!unitId || !shiftKey || button === 2) return false;

      // ничего не выбрано — это первый шифт-клик, разрешаем
      if (State.selected.length === 0) return true;

      // сравниваем гекс кликнутого юнита с гексом любого из уже выбранных
      const targetHex = State.units[unitId].hex;
      const stackHex  = State.units[State.selected[0]].hex;

      // в одном гексе → можно добавлять в стек
      return targetHex?.col === stackHex?.col &&
             targetHex?.row === stackHex?.row;
    },
    cmd: 'ADD_TO_SELECTION'
  },
  {
    // левый клик (с шифтом или без) на юнита Defender — select + try add to firegroup
    match: ({ unitId, button }) => {
      if (!unitId || button === 2) return false;
      return State.units[unitId].nation === PhaseManager.getDefendingSide();
    },
    cmd: 'SELECT_DEFENDER'
  },
  { match: ({ unitId, button }) => unitId && button !== 2, cmd: 'CLICK_UNIT'      }, // кликнули на юнита (только левая кнопка)
  { match: ({ isStage }) => isStage,       cmd: 'CLICK_EMPTY' }, // кликнули в пустоту
  { match: ({ mapId }) => mapId === 'map', cmd: 'CLICK_MAP'   }, // кликнули на карту
];

// Правила для клавиатуры
const KEY_RULES = [
  { match: ({ key }) => key === 'Escape', cmd: 'DESELECT_ALL' },
];

export const Interpreter = {
  handle(e) {
    if (State.pendingMove) return;                    // ждём выбор UseWoods/UseRoad
    const unitId  = e.target.getAttr('unitId');      // есть ли юнит под курсором
    const mapId   = e.target.getAttr('id');          // это карта?
    const isStage = e.target instanceof Konva.Stage; // или пустая сцена

    const pos      = e.target.getStage().getPointerPosition(); // координаты клика
    const shiftKey = e.evt.shiftKey;                           // зажат ли шифт
    const button   = e.evt.button;                              // 0=left, 2=right
    const ctx      = { unitId, mapId, isStage, pos, shiftKey, button };
    const rule = RULES.find(r => r.match(ctx));      // ищем первое подходящее правило
    if (!rule) return;

    Engine.execute({ cmd: rule.cmd, ...ctx });        // отправляем команду в Engine
  },

  handleKey(key) {
    const rule = KEY_RULES.find(r => r.match({ key }));
    if (!rule) return;
    Engine.execute({ cmd: rule.cmd });
  }
};
