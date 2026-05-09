let uiLayer;

export const RendererUI = {
  init(layer) { uiLayer = layer; },

  // Рисуем кнопку, при клике возвращаем текст кнопки через onSignal
  drawButton({ x, y, label, onSignal }) {
    const group = new Konva.Group({ x, y, name: `btn-${label}` });
    const rect  = new Konva.Rect({ width: 120, height: 36, fill: '#333', cornerRadius: 4 });
    const text  = new Konva.Text({ text: label, fill: '#fff',
                    width: 120, height: 36, align: 'center', verticalAlign: 'middle' });
    group.add(rect, text);
    group.on('click', () => onSignal(label));
    uiLayer.add(group);
    uiLayer.batchDraw();
  },

  removeButton(label) {
    const btn = uiLayer.findOne(`.btn-${label}`);
    if (btn) {
      btn.destroy();
      uiLayer.batchDraw();
    }
  }
};
