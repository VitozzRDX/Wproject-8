import { describe, test, expect } from 'vitest';
import { hexDistance, hexLabel, calcNearestHexes } from './hexUtils.js';

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
