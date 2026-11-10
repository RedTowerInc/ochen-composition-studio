import {
  clone,
  familyById,
  uid,
  StudioError,
  type Catalog,
  type LayoutName,
  type SceneDocument,
  type SceneInstance,
} from "./types";
import { assertDimensions } from "./validation";
import { area, intersect, objectBox, unionArea } from "./geometry";

export type CompositionCandidate = SceneDocument & { fallback?: true };

export const LAYOUTS: { id: LayoutName; name: string; description: string }[] =
  [
    { id: "diagonal", name: "Диагональ", description: "Динамика и общий ритм" },
    {
      id: "surround",
      name: "С окружением",
      description: "Главный объект и детали",
    },
    {
      id: "headline",
      name: "Под заголовок",
      description: "Больше свободного места",
    },
  ];
const random = (seed: number) => {
  let value = seed >>> 0;
  return () => {
    value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
    return value / 2 ** 32;
  };
};

export function arrange(
  scene: SceneDocument,
  ids: string[],
  layout: LayoutName,
  catalog: Catalog,
  background = true,
): SceneDocument {
  if (!ids.length || ids.length > 6)
    throw new StudioError("Для автосборки выберите от 1 до 6 объектов.");
  const next = clone(scene),
    rng = random(scene.seed);
  const portrait = scene.width / scene.height < 0.9;
  const positions: Record<LayoutName, [number, number, number][]> = {
    diagonal: portrait
      ? [
          [0.4, 0.43, -10],
          [0.7, 0.65, 12],
          [0.69, 0.2, -9],
          [0.2, 0.79, 9],
          [0.83, 0.87, -10],
          [0.16, 0.12, 8],
        ]
      : [
          [0.35, 0.55, -10],
          [0.68, 0.66, 12],
          [0.71, 0.28, -9],
          [0.15, 0.13, 9],
          [0.88, 0.91, -10],
          [0.12, 0.83, 8],
        ],
    surround: [
      [0.51, 0.55, -8],
      [0.8, 0.36, 12],
      [0.25, 0.27, -8],
      [0.2, 0.78, 9],
      [0.85, 0.87, -9],
      [0.53, 0.11, 7],
    ],
    headline: portrait
      ? [
          [0.48, 0.62, -9],
          [0.78, 0.82, 12],
          [0.81, 0.42, -10],
          [0.16, 0.9, 6],
          [0.9, 0.16, -7],
          [0.13, 0.47, 7],
        ]
      : [
          [0.63, 0.6, -9],
          [0.89, 0.79, 12],
          [0.83, 0.22, -10],
          [0.47, 0.93, 6],
          [0.18, 0.88, -7],
          [0.31, 0.08, 7],
        ],
  };
  const mainSize = ids.slice(0, background ? 3 : ids.length).map((id) => {
    const variant = familyById(catalog, id).variants[scene.detail].main;
    return (
      Math.max(variant.viewBox[2], variant.viewBox[3]) * variant.sourceScale
    );
  });
  const usable = Math.min(
    scene.width * (portrait ? 0.8 : 0.52),
    scene.height * 0.76,
  );
  next.scale = usable / Math.max(...mainSize);
  next.layout = layout;
  next.instances = ids.map((familyId, index): SceneInstance => {
    familyById(catalog, familyId);
    const [x, y, rotation] = positions[layout][index % 6];
    return {
      id: uid(),
      familyId,
      role: index > 2 && background ? "background" : "main",
      x: x + (rng() - 0.5) * 0.09,
      y: y + (rng() - 0.5) * 0.09,
      rotation: rotation + Math.round((rng() - 0.5) * 8),
    };
  });
  if (background && ids.length < 4 && ids.length > 1) {
    const familyId = ids[ids.length - 1];
    next.instances.unshift({
      id: uid(),
      familyId,
      role: "background",
      x: portrait ? 0.17 : 0.14,
      y: portrait ? 0.76 : 0.25,
      rotation: -13,
    });
  }
  return next;
}

function prepare(
  scene: SceneDocument,
  factor: number,
  catalog: Catalog,
): SceneDocument {
  scene.scale *= factor;
  // Background is always behind main objects. Larger mains go behind small
  // details, preserving all selected families and their original proportions.
  scene.instances.sort((a, b) => {
    if (a.role !== b.role) return a.role === "background" ? -1 : 1;
    return (
      area(objectBox(scene, b, catalog)) - area(objectBox(scene, a, catalog))
    );
  });
  const mains = scene.instances.filter((item) => item.role === "main");
  if (mains.length <= 3) {
    const portrait = scene.width / scene.height < 0.9;
    const slots: Record<LayoutName, [number, number][]> = portrait
      ? {
          diagonal: [
            [0.5, 0.72],
            [0.36, 0.26],
            [0.8, 0.24],
          ],
          surround: [
            [0.5, 0.5],
            [0.25, 0.13],
            [0.77, 0.87],
          ],
          headline: [
            [0.53, 0.72],
            [0.28, 0.4],
            [0.8, 0.35],
          ],
        }
      : {
          diagonal: [
            [0.58, 0.65],
            [0.24, 0.29],
            [0.3, 0.72],
          ],
          surround: [
            [0.64, 0.52],
            [0.25, 0.25],
            [0.29, 0.78],
          ],
          headline: [
            [0.7, 0.67],
            [0.4, 0.31],
            [0.88, 0.26],
          ],
        };
    const rng = random(scene.seed ^ 0x9e3779b9);
    mains.forEach((item, index) => {
      const [x, y] = slots[scene.layout][index];
      item.x = x + (rng() - 0.5) * 0.04;
      item.y = y + (rng() - 0.5) * 0.04;
    });
  }
  for (const item of scene.instances) {
    if (item.role === "background") continue;
    const box = objectBox(scene, item, catalog);
    const marginX = scene.width * 0.025,
      marginY = scene.height * 0.025;
    item.x = Math.max(
      (box.width / 2 + marginX) / scene.width,
      Math.min(1 - (box.width / 2 + marginX) / scene.width, item.x),
    );
    item.y = Math.max(
      (box.height / 2 + marginY) / scene.height,
      Math.min(1 - (box.height / 2 + marginY) / scene.height, item.y),
    );
  }
  return scene;
}

function measurements(scene: SceneDocument, catalog: Catalog) {
  const canvas = { left: 0, top: 0, width: scene.width, height: scene.height };
  const boxes = scene.instances.map((item) => objectBox(scene, item, catalog));
  return boxes.map((box, index) => {
    const clipped = intersect(box, canvas);
    const cover = unionArea(
      boxes.slice(index + 1).map((other) => intersect(clipped, other)),
    );
    return {
      role: scene.instances[index].role,
      visible: area(clipped) / area(box),
      uncovered: Math.max(0, area(clipped) - cover) / area(box),
      area: area(box),
    };
  });
}

function usable(scene: SceneDocument, catalog: Catalog) {
  let primary = true;
  return measurements(scene, catalog).every((m) => {
    if (m.role === "background") return m.visible >= 0.1;
    const required = primary ? 0.9 : 0.85;
    primary = false;
    return m.visible >= 0.92 && m.uncovered >= required;
  });
}

function fallback(
  scene: SceneDocument,
  catalog: Catalog,
): CompositionCandidate {
  const mains = scene.instances.filter((item) => item.role === "main");
  let bestScale = 0,
    bestColumns = 1;
  const atOne = { ...scene, scale: 1 };
  const boxes = mains.map((item) => objectBox(atOne, item, catalog));
  for (let columns = 1; columns <= mains.length; columns++) {
    const rows = Math.ceil(mains.length / columns);
    const scale =
      Math.min(
        scene.width / columns / Math.max(...boxes.map((b) => b.width)),
        scene.height / rows / Math.max(...boxes.map((b) => b.height)),
      ) * 0.82;
    if (scale > bestScale) {
      bestScale = scale;
      bestColumns = columns;
    }
  }
  scene.scale = bestScale;
  const rows = Math.ceil(mains.length / bestColumns);
  mains.forEach((item, index) => {
    item.x = ((index % bestColumns) + 0.5) / bestColumns;
    item.y = (Math.floor(index / bestColumns) + 0.5) / rows;
  });
  return { ...scene, fallback: true };
}

export function makeCandidates(
  scene: SceneDocument,
  ids: string[],
  catalog: Catalog,
  background = true,
): CompositionCandidate[] {
  const result: CompositionCandidate[] = [];
  for (const layout of LAYOUTS) {
    let best: SceneDocument | undefined,
      score = -Infinity;
    for (const factor of [1, 0.82, 0.68, 0.55, 0.43]) {
      for (let attempt = 0; attempt < 8; attempt++) {
        const candidate = prepare(
          arrange(
            { ...scene, seed: (scene.seed + attempt * 104729) >>> 0 },
            ids,
            layout.id,
            catalog,
            background,
          ),
          factor,
          catalog,
        );
        if (!usable(candidate, catalog)) continue;
        const value = compositionScore(candidate, catalog);
        if (value > score) {
          best = candidate;
          score = value;
        }
      }
      if (best) break;
    }
    if (best) result.push(best);
  }
  if (!result.length)
    result.push(
      fallback(
        prepare(
          arrange(scene, ids, "diagonal", catalog, background),
          1,
          catalog,
        ),
        catalog,
      ),
    );
  return result;
}

/** Coarse geometry ranking; overlap and deliberate edge cropping remain allowed. */
export function compositionScore(
  scene: SceneDocument,
  catalog: Catalog,
): number {
  const measured = measurements(scene, catalog);
  let primary = true;
  return measured.reduce((score, m) => {
    if (m.role === "background")
      return score - Math.max(0, 0.1 - m.visible) * 3;
    const weight = primary ? 2 : 1;
    primary = false;
    return (
      score +
      m.area / (scene.width * scene.height) -
      weight *
        (Math.max(0, 0.92 - m.visible) * 8 +
          Math.max(0, 0.85 - m.uncovered) * 5)
    );
  }, 0);
}

export function resizeScene(
  scene: SceneDocument,
  width: number,
  height: number,
): SceneDocument {
  assertDimensions(width, height);
  const next = { ...clone(scene), width, height };
  if (!scene.instances.length) return next;
  const fit = (w: number, h: number) => Math.min(w * 0.52, h * 0.76);
  next.scale =
    (scene.scale * fit(width, height)) / fit(scene.width, scene.height);
  return next;
}
