import DOMPurify from "dompurify";
import {
  LIMITS,
  StudioError,
  familyById,
  type AssetVariant,
  type Catalog,
  type SceneDocument,
  type SceneInstance,
} from "./types";

export interface LoadedAsset {
  variant: AssetVariant;
  root: SVGSVGElement;
  nodes: number;
}
export type AssetStore = ReadonlyMap<string, LoadedAsset>;
export const assetKey = (id: string, detail: string, role: string) =>
  `${id}:${detail}:${role}`;

export function sanitizeSvg(
  source: string,
  variant: AssetVariant,
): LoadedAsset {
  if (source.length > 4 * 1024 * 1024 || /<!DOCTYPE|<!ENTITY/i.test(source))
    throw new StudioError("SVG содержит неподдерживаемую структуру.");
  const parsed = new DOMParser().parseFromString(source, "image/svg+xml");
  if (
    parsed.querySelector("parsererror") ||
    parsed.documentElement.localName !== "svg"
  )
    throw new StudioError("Некорректный SVG в каталоге.");
  if (
    parsed.querySelector(
      "script,foreignObject,image,a,animate,animateTransform,set,style",
    )
  )
    throw new StudioError(
      "Каталог должен содержать только самостоятельные векторные объекты.",
    );
  for (const el of parsed.querySelectorAll("*"))
    for (const attr of [...el.attributes]) {
      if (/^on/i.test(attr.name))
        throw new StudioError("SVG содержит обработчик события.");
      if (attr.localName === "href" && !/^#[^\s]+$/.test(attr.value))
        throw new StudioError("В SVG найдена внешняя ссылка.");
      for (const match of attr.value.matchAll(/url\(([^)]+)\)/gi)) {
        const target = match[1].trim().replace(/^(['"])(.*)\1$/, "$2");
        if (!/^#[^\s'"()]+$/.test(target))
          throw new StudioError("В SVG найдена внешняя ссылка.");
      }
    }
  const clean = DOMPurify.sanitize(source, {
    USE_PROFILES: { svg: true, svgFilters: true },
    FORBID_TAGS: [
      "script",
      "foreignObject",
      "image",
      "a",
      "style",
      "animate",
      "animateTransform",
      "set",
    ],
    RETURN_DOM: true,
  });
  const root = (clean as Element).querySelector("svg") as SVGSVGElement | null;
  if (!root)
    throw new StudioError("Некорректная структура SVG после проверки.");
  const nodes = root.querySelectorAll("*").length;
  if (!nodes || nodes > LIMITS.svgNodes)
    throw new StudioError("SVG пуст или превышает допустимую сложность.");
  return { variant, root, nodes };
}

const asHex = (value: string) => {
  const v = value.trim().toUpperCase();
  if (/^#[A-F0-9]{6}$/.test(v)) return v;
  if (/^#[A-F0-9]{3}$/.test(v))
    return "#" + [...v.slice(1)].map((ch) => ch + ch).join("");
  if (v === "WHITE") return "#FFFFFF";
  if (v === "BLACK") return "#000000";
  return v;
};

export function assetMarkup(
  asset: LoadedAsset,
  prefix: string,
  scene: SceneDocument,
  catalog: Catalog,
): string {
  const root = asset.root.cloneNode(true) as SVGSVGElement;
  const ids = new Map<string, string>();
  for (const el of [root, ...root.querySelectorAll("[id]")]) {
    const old = el.getAttribute("id");
    if (old) {
      const next = `${prefix}_${ids.size}`;
      ids.set(old, next);
      el.setAttribute("id", next);
    }
  }
  const original = catalog.palettes[0];
  const mapping = new Map(
    Object.entries(original.colors).map(([token, color]) => [
      asHex(color),
      scene.palette.colors[token],
    ]),
  );
  const rewriteRefs = (value: string) =>
    value.replace(
      /url\(\s*['"]?#([^)'"\s]+)['"]?\s*\)/g,
      (_match, id: string) => {
        const target = ids.get(id);
        if (!target)
          throw new StudioError("В исходном SVG отсутствует ресурс: " + id);
        return `url(#${target})`;
      },
    );
  for (const el of [root, ...root.querySelectorAll("*")])
    for (const attr of [...el.attributes]) {
      if (attr.localName === "href" && attr.value.startsWith("#")) {
        const target = ids.get(attr.value.slice(1));
        if (!target)
          throw new StudioError("В SVG отсутствует локальная ссылка.");
        attr.value = "#" + target;
      } else if (
        [
          "fill",
          "stroke",
          "stop-color",
          "flood-color",
          "lighting-color",
        ].includes(attr.localName)
      ) {
        const mapped = mapping.get(asHex(attr.value));
        attr.value = mapped ?? rewriteRefs(attr.value);
      } else if (attr.localName === "style") {
        attr.value = rewriteRefs(attr.value).replace(
          /(fill|stroke|stop-color)\s*:\s*(#[0-9a-f]{3,6})/gi,
          (match, prop: string, color: string) =>
            `${prop}:${mapping.get(asHex(color)) ?? color}`,
        );
      } else if (/url\(/i.test(attr.value))
        attr.value = rewriteRefs(attr.value);
    }
  return root.innerHTML;
}

export function instanceTransform(
  item: SceneInstance,
  scene: SceneDocument,
  catalog: Catalog,
  asset: LoadedAsset,
): string {
  familyById(catalog, item.familyId);
  const [minX, minY, width, height] = asset.variant.viewBox;
  const factor = scene.scale * asset.variant.sourceScale;
  return `translate(${item.x * scene.width} ${item.y * scene.height}) rotate(${item.rotation}) scale(${factor}) translate(${-minX - width / 2} ${-minY - height / 2})`;
}

export function exportScene(
  scene: SceneDocument,
  catalog: Catalog,
  assets: AssetStore,
): string {
  const snapshot = structuredClone(scene);
  if (!snapshot.instances.length)
    throw new StudioError("Добавьте хотя бы один объект перед экспортом.");
  let nodeCount = 0;
  const parts = snapshot.instances.map((item, index) => {
    const asset = assets.get(
      assetKey(item.familyId, snapshot.detail, item.role),
    );
    if (!asset)
      throw new StudioError("Не загружен исходный объект. Экспорт отменён.");
    nodeCount += asset.nodes;
    if (nodeCount > LIMITS.svgNodes)
      throw new StudioError(
        "Композиция слишком сложная для экспорта. Удалите несколько объектов.",
      );
    const group = document.createElementNS("http://www.w3.org/2000/svg", "g");
    group.setAttribute("id", `object_${index}_${item.id}`);
    group.setAttribute("data-family", item.familyId);
    group.setAttribute("data-role", item.role);
    group.setAttribute(
      "transform",
      instanceTransform(item, snapshot, catalog, asset),
    );
    group.innerHTML = assetMarkup(asset, `export_${index}`, snapshot, catalog);
    return new XMLSerializer().serializeToString(group);
  });
  const bg =
    snapshot.palette.colors[
      Object.keys(catalog.colorRoles).find(
        (token) => catalog.colorRoles[token] === "background",
      ) ?? ""
    ];
  const title = snapshot.name.replace(
    /[<>&"']/g,
    (ch) =>
      ({
        "<": "&lt;",
        ">": "&gt;",
        "&": "&amp;",
        '"': "&quot;",
        "'": "&apos;",
      })[ch]!,
  );
  return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${snapshot.width}" height="${snapshot.height}" viewBox="0 0 ${snapshot.width} ${snapshot.height}"><title>${title}</title><rect width="${snapshot.width}" height="${snapshot.height}" fill="${bg}"/>${parts.join("")}</svg>`;
}

export function downloadFile(
  content: string,
  name: string,
  type: string,
): void {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const safeFileName = (name: string) =>
  name
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "_")
    .trim()
    .slice(0, 80) || "composition";
