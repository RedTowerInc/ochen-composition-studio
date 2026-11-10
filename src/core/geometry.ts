import {
  familyById,
  type Catalog,
  type SceneDocument,
  type SceneInstance,
} from "./types";

export interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}
export function objectBox(
  scene: SceneDocument,
  item: SceneInstance,
  catalog: Catalog,
): Box {
  const variant = familyById(catalog, item.familyId).variants[scene.detail][
    item.role
  ];
  const angle = (item.rotation * Math.PI) / 180;
  const w = variant.viewBox[2] * variant.sourceScale * scene.scale;
  const h = variant.viewBox[3] * variant.sourceScale * scene.scale;
  const width = Math.abs(w * Math.cos(angle)) + Math.abs(h * Math.sin(angle));
  const height = Math.abs(h * Math.cos(angle)) + Math.abs(w * Math.sin(angle));
  return {
    left: item.x * scene.width - width / 2,
    top: item.y * scene.height - height / 2,
    width,
    height,
  };
}
export function intersect(a: Box, b: Box): Box {
  const left = Math.max(a.left, b.left),
    top = Math.max(a.top, b.top);
  return {
    left,
    top,
    width: Math.max(0, Math.min(a.left + a.width, b.left + b.width) - left),
    height: Math.max(0, Math.min(a.top + a.height, b.top + b.height) - top),
  };
}
export const area = (box: Box) => box.width * box.height;

// Exact union area of a few axis-aligned boxes, used only as a conservative
// occlusion estimate. SVG paint visibility is verified independently in QA.
export function unionArea(boxes: Box[]): number {
  const useful = boxes.filter((b) => area(b) > 0);
  const xs = [
    ...new Set(useful.flatMap((b) => [b.left, b.left + b.width])),
  ].sort((a, b) => a - b);
  let total = 0;
  for (let i = 1; i < xs.length; i++) {
    const segments = useful
      .filter((b) => b.left < xs[i] && b.left + b.width > xs[i - 1])
      .map((b) => [b.top, b.top + b.height])
      .sort((a, b) => a[0] - b[0]);
    let low = segments[0]?.[0] ?? 0,
      high = low,
      height = 0;
    for (const [a, b] of segments) {
      if (a > high) {
        height += high - low;
        low = a;
        high = b;
      } else high = Math.max(high, b);
    }
    total += (height + high - low) * (xs[i] - xs[i - 1]);
  }
  return total;
}
