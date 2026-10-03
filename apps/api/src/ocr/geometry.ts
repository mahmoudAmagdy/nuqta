import type { BoundingBox, Point, Quad } from './ocr.types.js';

export function boxFromPoints(points: readonly Point[]): BoundingBox {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const { x, y } of points) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  if (!Number.isFinite(minX)) return { x: 0, y: 0, width: 0, height: 0 };
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

export function quadFromBox(box: BoundingBox): Quad {
  const right = box.x + box.width;
  const bottom = box.y + box.height;
  return [
    { x: box.x, y: box.y },
    { x: right, y: box.y },
    { x: right, y: bottom },
    { x: box.x, y: bottom },
  ];
}

/** Flat `[x1, y1, ... x4, y4]`, the form several providers use for polygons. */
export function quadFromFlat(values: readonly number[]): Quad | null {
  if (values.length !== 8 || !values.every(Number.isFinite)) return null;
  const [x1, y1, x2, y2, x3, y3, x4, y4] = values as unknown as [
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
  ];
  return [
    { x: x1, y: y1 },
    { x: x2, y: y2 },
    { x: x3, y: y3 },
    { x: x4, y: y4 },
  ];
}

export function unionBoxes(boxes: readonly BoundingBox[]): BoundingBox {
  return boxFromPoints(boxes.flatMap((box) => quadFromBox(box)));
}

export function mean(values: readonly number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}
