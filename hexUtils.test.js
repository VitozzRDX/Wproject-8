import { describe, test, expect } from 'vitest';
import { hexDistance, hexLabel, calcNearestHexes, hexToPixel, pixelToHex } from './hexUtils.js';

describe('hexLabel', () => {
  test('первая колонка', () => {
    expect(hexLabel(0, 1)).toBe('A1');
  });
  test('вторая буква', () => {
    expect(hexLabel(1, 5)).toBe('B5');
  });
  test('двухбуквенная (после Z)', () => {
    expect(hexLabel(26, 1)).toBe('AA1');
  });
});

describe('hexDistance', () => {
  test('тот же гекс — 0', () => {
    expect(hexDistance({col:3,row:3},{col:3,row:3})).toBe(0);
  });
  test('соседний гекс — 1', () => {
    const center = {col:4, row:4};
    calcNearestHexes(center).forEach(n => {
      expect(hexDistance(center, n)).toBe(1);
    });
  });
});

describe('calcNearestHexes', () => {
  test('возвращает 6 соседей', () => {
    expect(calcNearestHexes({col:3, row:3})).toHaveLength(6);
  });
});

describe('pixelToHex (round-trip с hexToPixel)', () => {
  test('центр гекса → тот же гекс', () => {
    const hex = { col: 5, row: 3 };
    const { x, y } = hexToPixel(hex.col, hex.row);
    expect(pixelToHex(x, y)).toEqual(hex);
  });
  test('работает для odd-column гекса', () => {
    const hex = { col: 7, row: 4 };
    const { x, y } = hexToPixel(hex.col, hex.row);
    expect(pixelToHex(x, y)).toEqual(hex);
  });
  test('clamp по нижней границе (отрицательные координаты)', () => {
    const result = pixelToHex(-1000, -1000);
    expect(result.col).toBeGreaterThanOrEqual(0);
    expect(result.row).toBeGreaterThanOrEqual(1);
  });
});
