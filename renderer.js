import { State } from './state.js';

// Анимация флипа юнита на сломанную сторону
function flipRendering(node, unit) {
  const x0 = node.x();
  const w  = node.findOne('Image').width();
  const cx = x0 + w / 2;

  // фаза 1 — стороны едут к центру (scaleX → 0)
  node.to({
    x: cx, scaleX: 0, duration: 0.15,
    onFinish: () => {
      // меняем картинку на сломанную сторону
      if (unit.brokenImage) node.findOne('Image').image(unit.brokenImage);
      // фаза 2 — разъезжаются обратно от центра
      node.to({ x: x0, scaleX: 1, duration: 0.15 });
    }
  });
}

// Renderer подписывается на изменения State
export function initRenderer() {
  State.onChange = (id, key, value) => {
    const node = State.units[id].node;

    if (key === 'selected') {
      const image = node.findOne('Image');
      image.stroke(value ? 'red' : null);    // обводка при выборе
      image.strokeWidth(value ? 1 : 0);
      if (value) node.moveToTop();            // поднимаем наверх z-порядка
    }

    if (key === 'pos') {
      const unit = State.units[id];
      node.to({ x: unit.x, y: unit.y, duration: 0.3 }); // плавное перемещение
    }

    if (key === 'mf') {
      const moved  = value === 0;
      const active = State.units[id].active;
      node.findOne('.movedRect').visible(moved);
      node.findOne('.movedText').visible(moved);
      node.findOne('.activeRect').visible(!moved && active);
      node.findOne('.activeText').visible(!moved && active);
    }

    if (key === 'active') {
      const moved = State.units[id].mf === 0;
      node.findOne('.activeRect').visible(value && !moved);
      node.findOne('.activeText').visible(value && !moved);
    }

    if (key === 'exhausted') {
      node.findOne('.cxText').visible(value);
    }

    if (key === 'broken' && value === true) {
      flipRendering(node, State.units[id]);
    }

    node.getLayer().batchDraw();
  };
}
