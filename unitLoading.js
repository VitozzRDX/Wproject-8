import { State } from './state.js';
import { hexToPixel } from './hexUtils.js';

// ---------------------------------------------------------------------------
// Цепочка наследования
// ---------------------------------------------------------------------------
const Unit             = { state: 'ready' };
const Infantry         = { ...Unit,     movementAvailability: true, possession: false,
                                       broken: false, pinned: false, wounded: false, exhausted: false,
                                       hasStartedMoving: false, usedDoubleTime: false,
                                       usedAssaultMovement: false,
                                       path: [], roadBonusGranted: false, usedWoodsRoad: false };
const Squad            = { ...Infantry, type: 'squad', mf: 4 };
const Leader           = { ...Infantry, type: 'leader', mf: 6, quality: 'Elite' };
const SW               = { ...Unit,     type: 'sw', possessed: false };
const MG               = { ...SW,       type: 'mg' };

const GermanSquad_1st  = { ...Squad,  nation: 'german', quality: '1stLine', selfRally: true  };
const SovietSquad_1st  = { ...Squad,  nation: 'soviet', quality: '1stLine', selfRally: false };
const SovietSquad_Elite= { ...Squad,  nation: 'soviet', quality: 'Elite',   selfRally: true  };
const GermanSquad_Grn  = { ...Squad,  nation: 'german', quality: 'Green',   selfRally: false, mf: 3 };
const GermanLeader     = { ...Leader, nation: 'german' };
const SovietLeader     = { ...Leader, nation: 'soviet' };
const SovietMG         = { ...MG,     nation: 'soviet' };

// ---------------------------------------------------------------------------
// Шаблоны — только уникальные цифры
// ---------------------------------------------------------------------------
const TEMPLATES = {
  'ge_467': { ...GermanSquad_1st, firepower: 4, range: 6, morale: 7, src: './graf/ge467S.gif', brokenSrc: './graf/geh7b.gif' },
  'ge_447': { ...GermanSquad_1st, firepower: 4, range: 4, morale: 7, src: './graf/ge447S.gif' },
  'ge_L91': { ...GermanLeader,    morale: 9, leadershipModifier: -1, selfRally: true,  src: './graf/geL91.gif',  brokenSrc: './graf/geL91b.gif' },
  'so_L61': { ...SovietLeader,    morale: 6, leadershipModifier: +1, selfRally: false, src: './graf/ruL61.gif'  },
  'so_237': { ...SovietSquad_1st, firepower: 2, range: 3, morale: 7, src: './graf/ru237H.gif' },
  'so_628': { ...SovietSquad_Elite, firepower: 6, range: 2, morale: 8, src: './graf/ru628S.gif' },
  'so_hmg': { ...SovietMG,        firepower: 8, range: 16, rateOfFire: 3, breakNumber: 11, src: './graf/soHMG.gif' },
};

// ---------------------------------------------------------------------------
// Сценарий
// ---------------------------------------------------------------------------
const scenario = [
  { templateId: 'ge_467', id: 'unit_01', hex: { col: 3, row: 2 } },
  { templateId: 'ge_467', id: 'unit_02', hex: { col: 5, row: 2 } },
  { templateId: 'ge_467', id: 'unit_03', hex: { col: 7, row: 2 } },
  { templateId: 'ge_467', id: 'unit_04', hex: { col: 9, row: 2 } },
  { templateId: 'ge_467', id: 'unit_05', hex: { col: 3, row: 4 } },
  { templateId: 'ge_467', id: 'unit_06', hex: { col: 5, row: 4 } },
  { templateId: 'ge_467', id: 'unit_07', hex: { col: 7, row: 4 } },
  { templateId: 'ge_467', id: 'unit_08', hex: { col: 5, row: 2 } },
  { templateId: 'ge_L91', id: 'unit_09', hex: { col: 3, row: 4 } },
  { templateId: 'so_237', id: 'unit_10', hex: { col: 5, row: 6 } },
  { templateId: 'so_628', id: 'unit_11', hex: { col: 5, row: 6 } },
  { templateId: 'so_628', id: 'unit_12', hex: { col: 5, row: 5 } },
  { templateId: 'so_628', id: 'unit_13', hex: { col: 6, row: 8 } },
];

// ---------------------------------------------------------------------------
// Загрузка изображения
// ---------------------------------------------------------------------------
function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload  = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load image: ${src}`));
    img.src = src;
  });
}

// ---------------------------------------------------------------------------
// Создание одного юнита
// ---------------------------------------------------------------------------
function createUnit(data, layer) {
  const w = data.image.width;
  const h = data.image.height;

  // группа = картинка + индикатор moved
  const group = new Konva.Group({ x: data.x, y: data.y });
  const image = new Konva.Image({ image: data.image, x: 0, y: 0 });

  const movedRect = new Konva.Rect({
    x: 0, y: h - 8,
    width: w, height: 8,
    fill: 'red',
    visible: false,
    name: 'movedRect',
  });
  const movedText = new Konva.Text({
    x: 0, y: h - 8,
    width: w, height: 8,
    text: 'moved', fill: 'white', fontSize: 7,
    align: 'center', verticalAlign: 'middle',
    visible: false,
    name: 'movedText',
  });

  const activeRect = new Konva.Rect({
    x: 0, y: h - 8,
    width: w, height: 8,
    fill: 'goldenrod',
    visible: false,
    name: 'activeRect',
  });
  const activeText = new Konva.Text({
    x: 0, y: h - 8,
    width: w, height: 8,
    text: 'active', fill: 'white', fontSize: 7,
    align: 'center', verticalAlign: 'middle',
    visible: false,
    name: 'activeText',
  });

  const cxText = new Konva.Text({
    x: w - 12, y: 1,
    text: 'CX', fill: 'red', fontSize: 8, fontStyle: 'bold',
    visible: false,
    name: 'cxText',
  });

  group.add(image, movedRect, movedText, activeRect, activeText, cxText);

  const unit = { ...data, node: group };
  group.setAttr('unitId', unit.id);
  image.setAttr('unitId', unit.id);   // клики попадают на image — нужен и тут
  movedRect.listening(false);          // декоративные — клики не ловят
  movedText.listening(false);
  activeRect.listening(false);
  activeText.listening(false);
  cxText.listening(false);
  State.addUnit(unit);
  layer.add(group);
  return unit;
}

// ---------------------------------------------------------------------------
// Создаём и загружаем все юниты сценария
// ---------------------------------------------------------------------------
export async function createAndLoadUnits(unitLayer) {
  for (const { templateId, hex, id } of scenario) {
    const data        = { ...TEMPLATES[templateId], id, path: [] };
    const image       = await loadImage(data.src);
    // broken-картинка для анимации флипа после попадания (если задана)
    const brokenImage = data.brokenSrc ? await loadImage(data.brokenSrc) : null;
    const { x, y }    = hexToPixel(hex.col, hex.row);
    const cx          = x - image.width  / 2;
    const cy          = y - image.height / 2;
    const unit = createUnit({ ...data, image, brokenImage, x: cx, y: cy }, unitLayer);

    // Регистрируем юнит в гексе
    unit.hex = hex;
    const existing = State.getHexState(hex);
    State.setHexState(hex, [...existing, id]);
  }

  // Пересчитываем позиции для всех гексов где 2+ юнитов
  Object.keys(State.hexes).forEach(key => {
    const ids = State.hexes[key];
    if (ids.length > 1) {
      const [col, row] = key.split('-').map(Number);
      const hexCenter  = hexToPixel(col, row);
      ids.forEach((id, i) => {
        const step   = 6;
        const offset = i - (ids.length - 1) / 2;
        const unit   = State.units[id];
        unit.x = hexCenter.x + step * offset - unit.image.width  / 2;
        unit.y = hexCenter.y - step * offset - unit.image.height / 2;
        unit.node.x(unit.x);
        unit.node.y(unit.y);
      });
    }
  });
}
