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

export const CATALOG_TIMEOUT_MS = 30_000;

export async function loadCatalog(
  signal: AbortSignal,
  progress: (loaded: number, total: number) => void,
): Promise<{ catalog: Catalog; assets: AssetStore }> {
  const controller = new AbortController();
  const cancel = () => controller.abort(signal.reason);
  signal.addEventListener("abort", cancel, { once: true });
  if (signal.aborted) cancel();
  let active = true;
  let onAbort!: () => void;
  const aborted = new Promise<never>((_, reject) => {
    onAbort = () => reject(controller.signal.reason);
    if (controller.signal.aborted) onAbort();
    else controller.signal.addEventListener("abort", onAbort, { once: true });
  });
  const timer = setTimeout(() => controller.abort(new StudioError(
    "Библиотека загружается слишком долго. Проверьте соединение и повторите загрузку.",
  )), CATALOG_TIMEOUT_MS);
  try {
    return await Promise.race([
      loadCatalogResources(controller.signal, (done, total) => {
        if (active && !controller.signal.aborted) progress(done, total);
      }),
      aborted,
    ]);
  } finally {
    active = false;
    clearTimeout(timer);
    signal.removeEventListener("abort", cancel);
    controller.signal.removeEventListener("abort", onAbort);
    controller.abort();
  }
}

async function loadCatalogResources(
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
          variant.viewBox[3] <= 0 ||
          !Number.isFinite(variant.width) || variant.width <= 0 ||
          !Number.isFinite(variant.height) || variant.height <= 0
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
        signal.throwIfAborted();
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
        const actual = asset.root.getAttribute("viewBox")?.trim().split(/[\s,]+/).map(Number);
        const close = (a: number, b: number) => Number.isFinite(a) && Math.abs(a - b) <= 1e-7 * Math.max(1, Math.abs(b));
        if (!actual || actual.length !== 4 ||
          actual.some((n, index) => !close(n, task.variant.viewBox[index])) ||
          !close(task.variant.width, actual[2]) || !close(task.variant.height, actual[3]))
          throw new StudioError("Габариты SVG не совпадают с описанием библиотеки. Повторите загрузку.");
        signal.throwIfAborted();
        assertAssetColors(asset, catalog);
        assets.set(assetKey(task.family.id, task.detail, task.role), asset);
        progress(++loaded, tasks.length);
      }
    }),
  );
  return { catalog, assets };
}
