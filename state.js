export const State = {
  phase: 'select',
  units: {},
  selected: [],            // id выбранных юнитов
  currentMover: [],        // id-шники тех кто двигается прямо сейчас
  pendingMove: null,       // { pos, hex, fromHex } пока ждём выбор UseWoods/UseRoad
  firegroup: [],           // юниты в текущей огневой группе (Defender)
  onChange: null,          // подписчик — сюда Renderer вешает свой обработчик

  hexes: {},  // 'col-row': [unitId, ...]

  addUnit(unit) {
    this.units[unit.id] = unit;
  },

  getHexState(hex) {
    return this.hexes[`${hex.col}-${hex.row}`] ?? [];
  },

  setHexState(hex, ids) {
    this.hexes[`${hex.col}-${hex.row}`] = ids;
  },

  // Установить поле юнита и уведомить подписчика
  setUnit(id, key, value) {
    if (key === 'pos') {
      const unit = this.units[id];
      this.units[id].x = value.x - unit.image.width  / 2;
      this.units[id].y = value.y - unit.image.height / 2;
    } else {
      this.units[id][key] = value;
    }
    this.onChange?.(id, key, value);
  },

  // Изменить числовое поле юнита на delta и уведомить подписчика
  changeUnit(id, key, delta) {
    this.units[id][key] += delta;
    this.onChange?.(id, key, this.units[id][key]);
  }
};
