import {
  clone,
  familyById,
  uid,
  type Catalog,
  type LayoutName,
  type SceneDocument,
  type SceneInstance,
} from "./types";
import { assertDimensions } from "./validation";

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
  const main = familyById(catalog, ids[0]);
  const usable = Math.min(
    scene.width * (portrait ? 0.8 : 0.52),
    scene.height * 0.76,
  );
  next.scale = usable / Math.max(main.canonicalWidth, main.canonicalHeight);
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

export function makeCandidates(
  scene: SceneDocument,
  ids: string[],
  catalog: Catalog,
  background = true,
): SceneDocument[] {
  return LAYOUTS.map(
    (layout) =>
      Array.from({ length: 8 }, (_, attempt) =>
        arrange(
          { ...scene, seed: (scene.seed + attempt * 104729) >>> 0 },
          ids,
          layout.id,
          catalog,
          background,
        ),
      ).sort(
        (a, b) => compositionScore(b, catalog) - compositionScore(a, catalog),
      )[0],
  );
}

/** Coarse geometry ranking; overlap and deliberate edge cropping remain allowed. */
export function compositionScore(
  scene: SceneDocument,
  catalog: Catalog,
): number {
  const boxes = scene.instances.map((item) => {
    const variant = familyById(catalog, item.familyId).variants[scene.detail][
        item.role
      ],
      angle = (item.rotation * Math.PI) / 180;
    const w = variant.viewBox[2] * variant.sourceScale * scene.scale,
      h = variant.viewBox[3] * variant.sourceScale * scene.scale;
    const width = Math.abs(w * Math.cos(angle)) + Math.abs(h * Math.sin(angle)),
      height = Math.abs(h * Math.cos(angle)) + Math.abs(w * Math.sin(angle));
    return {
      role: item.role,
      left: item.x * scene.width - width / 2,
      top: item.y * scene.height - height / 2,
      width,
      height,
    };
  });
  const intersection = (a: (typeof boxes)[number], b: (typeof boxes)[number]) =>
    Math.max(
      0,
      Math.min(a.left + a.width, b.left + b.width) - Math.max(a.left, b.left),
    ) *
    Math.max(
      0,
      Math.min(a.top + a.height, b.top + b.height) - Math.max(a.top, b.top),
    );
  const canvas = {
    role: "main" as const,
    left: 0,
    top: 0,
    width: scene.width,
    height: scene.height,
  };
  let score = 0;
  const primary = boxes.findIndex((b) => b.role === "main");
  boxes.forEach((box, index) => {
    const visible = intersection(box, canvas) / (box.width * box.height);
    const minVisible =
      index === primary ? 0.84 : box.role === "main" ? 0.5 : 0.18;
    score -= Math.max(0, minVisible - visible) * (index === primary ? 8 : 3);
    for (let j = index + 1; j < boxes.length; j++)
      if (box.role === "main" && boxes[j].role === "main")
        score -=
          Math.max(
            0,
            intersection(box, boxes[j]) / (box.width * box.height) - 0.4,
          ) * (index === primary ? 2 : 1);
  });
  return score;
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
