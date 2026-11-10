import {
  StudioError,
  type Catalog,
  type Detail,
  type ObjectRole,
} from "./types";
import {
  assetKey,
  assertAssetColors,
  sanitizeSvg,
  type AssetStore,
  type LoadedAsset,
} from "./svg";
import { parsePalette } from "./validation";

export async function loadCatalog(
  signal: AbortSignal,
  progress: (loaded: number, total: number) => void,
): Promise<{ catalog: Catalog; assets: AssetStore }> {
  const response = await fetch("/catalog/manifest.json", { signal });
  if (!response.ok)
    throw new StudioError(
      "Не удалось загрузить библиотеку. Проверьте соединение и повторите.",
    );
  const catalog = (await response.json()) as Catalog;
  if (
    !catalog.version ||
    !catalog.families?.length ||
    !catalog.palettes?.length ||
    !catalog.colorRoles
  )
    throw new StudioError("Файл библиотеки повреждён.");
  if (
    catalog.families.length > 100 ||
    new Set(catalog.families.map((f) => f.id)).size !== catalog.families.length
  )
    throw new StudioError("Некорректный состав библиотеки.");
  const roles = Object.values(catalog.colorRoles);
  if (!roles.includes("background") || !roles.includes("object") ||
    roles.some((role) => !["background", "object", "neutral"].includes(role)))
    throw new StudioError("В библиотеке повреждены цветовые роли.");
  for (const palette of catalog.palettes) parsePalette(palette, catalog);
  for (const family of catalog.families) {
    if (
      !Number.isFinite(family.canonicalWidth) ||
      !Number.isFinite(family.canonicalHeight) ||
      family.canonicalWidth <= 0 ||
      family.canonicalHeight <= 0
    )
      throw new StudioError("Некорректные размеры исходного объекта.");
    for (const detail of ["S", "L"] as Detail[])
      for (const role of ["main", "background"] as ObjectRole[]) {
        const variant = family.variants?.[detail]?.[role];
        if (
          !variant ||
          variant.sourceScale !== (detail === "S" ? 2 : 1) ||
          variant.viewBox?.length !== 4 ||
          variant.viewBox.some((n) => !Number.isFinite(n)) ||
          variant.viewBox[2] <= 0 ||
          variant.viewBox[3] <= 0
        )
          throw new StudioError("В библиотеке повреждён вариант объекта.");
      }
  }
  const tasks = catalog.families.flatMap((family) =>
    (["S", "L"] as Detail[]).flatMap((detail) =>
      (["main", "background"] as ObjectRole[]).map((role) => ({
        family,
        detail,
        role,
        variant: family.variants[detail][role],
      })),
    ),
  );
  const assets = new Map<string, LoadedAsset>();
  let cursor = 0,
    loaded = 0;
  await Promise.all(
    Array.from({ length: Math.min(6, tasks.length) }, async () => {
      while (cursor < tasks.length) {
        const task = tasks[cursor++];
        if (!/^\/catalog\/assets\/[a-zA-Z0-9-]+\.svg$/.test(task.variant.url))
          throw new StudioError("Каталог ссылается на неизвестный источник.");
        const file = await fetch(task.variant.url, { signal });
        if (!file.ok)
          throw new StudioError(
            "Не удалось загрузить «" +
              task.family.name +
              "». Повторите загрузку.",
          );
        const asset = sanitizeSvg(await file.text(), task.variant);
        assertAssetColors(asset, catalog);
        assets.set(assetKey(task.family.id, task.detail, task.role), asset);
        progress(++loaded, tasks.length);
      }
    }),
  );
  return { catalog, assets };
}
