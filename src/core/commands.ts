import {
  clone,
  familyById,
  LIMITS,
  StudioError,
  uid,
  type Catalog,
  type SceneDocument,
  type SceneInstance,
} from "./types";

export function addObject(
  scene: SceneDocument,
  familyId: string,
  catalog: Catalog,
): SceneDocument {
  if (scene.instances.length >= LIMITS.instances)
    throw new StudioError(
      "На холсте уже 50 объектов. Удалите лишние перед добавлением.",
    );
  const family = familyById(catalog, familyId),
    next = clone(scene);
  if (!next.instances.length)
    next.scale =
      Math.min(scene.width * 0.55, scene.height * 0.76) /
      Math.max(family.canonicalWidth, family.canonicalHeight);
  const offset = (scene.instances.length % 5) * 0.035;
  next.instances.push({
    id: uid(),
    familyId,
    role: "main",
    x: 0.5 + offset,
    y: 0.5 + offset,
    rotation: 0,
  });
  return next;
}

export function changeObject(
  scene: SceneDocument,
  id: string,
  patch: Partial<Pick<SceneInstance, "x" | "y" | "rotation" | "role">>,
): SceneDocument {
  const next = clone(scene),
    item = next.instances.find((item) => item.id === id);
  if (!item) return next;
  for (const key of ["x", "y", "rotation"] as const)
    if (patch[key] !== undefined && !Number.isFinite(patch[key]))
      throw new StudioError("Введите конечное число.");
  Object.assign(item, patch);
  item.x = Math.max(-2, Math.min(3, item.x));
  item.y = Math.max(-2, Math.min(3, item.y));
  item.rotation = ((((item.rotation + 180) % 360) + 360) % 360) - 180;
  return next;
}

export function duplicateObject(
  scene: SceneDocument,
  id: string,
): SceneDocument {
  if (scene.instances.length >= LIMITS.instances)
    throw new StudioError("Достигнут предел: 50 объектов.");
  const next = clone(scene),
    item = next.instances.find((item) => item.id === id);
  if (!item) return next;
  next.instances.push({
    ...item,
    id: uid(),
    x: Math.min(3, item.x + 0.035),
    y: Math.min(3, item.y + 0.035),
  });
  return next;
}

export function deleteObject(scene: SceneDocument, id: string): SceneDocument {
  return {
    ...clone(scene),
    instances: scene.instances.filter((item) => item.id !== id).map(clone),
  };
}

export function moveLayer(
  scene: SceneDocument,
  id: string,
  direction: -1 | 1,
): SceneDocument {
  const next = clone(scene),
    index = next.instances.findIndex((item) => item.id === id),
    target = index + direction;
  if (index >= 0 && target >= 0 && target < next.instances.length)
    [next.instances[index], next.instances[target]] = [
      next.instances[target],
      next.instances[index],
    ];
  return next;
}
