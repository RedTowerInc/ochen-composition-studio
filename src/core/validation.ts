import {
  LIMITS,
  StudioError,
  type Catalog,
  type Palette,
  type SceneDocument,
} from "./types";

const hex = /^#[0-9a-f]{6}$/i;
const idPattern = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,99}$/;
function assertXmlText(value: string, name: string) {
  for (const char of value) {
    const code = char.codePointAt(0)!;
    if (
      code === 9 ||
      code === 10 ||
      code === 13 ||
      (code >= 0x20 && code <= 0xd7ff) ||
      (code >= 0xe000 && code <= 0xfffd) ||
      (code >= 0x10000 && code <= 0x10ffff)
    )
      continue;
    throw new StudioError(
      `Поле «${name}» содержит недопустимый символ XML. Удалите его и повторите.`,
    );
  }
}
const object = (value: unknown): Record<string, unknown> => {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new StudioError("Ожидался объект JSON.");
  return value as Record<string, unknown>;
};
const finite = (
  value: unknown,
  min: number,
  max: number,
  name: string,
): number => {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < min ||
    value > max
  )
    throw new StudioError(`Недопустимое значение «${name}».`);
  return value;
};
const string = (
  value: unknown,
  max: number,
  name: string,
  trim = true,
): string => {
  if (typeof value !== "string" || !value.trim() || value.length > max)
    throw new StudioError(`Проверьте поле «${name}».`);
  assertXmlText(value, name);
  return trim ? value.trim() : value;
};
const id = (value: unknown, name: string): string => {
  const result = string(value, 100, name);
  if (!idPattern.test(result))
    throw new StudioError(`Недопустимый идентификатор «${name}».`);
  return result;
};

export function parsePalette(input: unknown, catalog: Catalog): Palette {
  const value = object(input);
  const colors = object(value.colors);
  const required = Object.keys(catalog.colorRoles);
  if (Object.keys(colors).length !== required.length)
    throw new StudioError(
      "В палитре должны присутствовать все цветовые роли из примера.",
    );
  const result: Record<string, string> = {};
  for (const token of required) {
    const color = colors[token];
    if (typeof color !== "string" || !hex.test(color))
      throw new StudioError(`Для «${token}» нужен цвет #RRGGBB.`);
    result[token] = color.toUpperCase();
    if (
      catalog.colorRoles[token] === "neutral" &&
      result[token] !== catalog.palettes[0].colors[token].toUpperCase()
    )
      throw new StudioError(
        "Нейтральные цвета и контуры должны оставаться исходными.",
      );
  }
  const backgroundColors = new Set(
    required
      .filter((token) => catalog.colorRoles[token] === "background")
      .map((token) => result[token]),
  );
  if (
    required.some(
      (token) =>
        catalog.colorRoles[token] === "object" &&
        backgroundColors.has(result[token]),
    )
  )
    throw new StudioError(
      "Цвета объектов и фона должны иметь разные роли и значения.",
    );
  return {
    id: id(value.id ?? "custom", "id палитры"),
    name: string(value.name, 60, "название палитры"),
    colors: result,
  };
}

export function validateScene(input: unknown, catalog: Catalog): SceneDocument {
  const value = object(input);
  if (value.schemaVersion !== 1)
    throw new StudioError(
      "Эта версия проекта не поддерживается. Исходный проект не изменён.",
    );
  if (value.catalogVersion !== catalog.version)
    throw new StudioError("Проект использует другую версию библиотеки.");
  if (value.detail !== "S" && value.detail !== "L")
    throw new StudioError("Выберите детализацию S или L.");
  if (!["diagonal", "surround", "headline"].includes(String(value.layout)))
    throw new StudioError("Неизвестная композиционная схема.");
  if (
    !Array.isArray(value.instances) ||
    value.instances.length > LIMITS.instances
  )
    throw new StudioError(`Допускается до ${LIMITS.instances} объектов.`);
  const seen = new Set<string>();
  const instances = value.instances.map((raw) => {
    const item = object(raw);
    const instanceId = id(item.id, "объект");
    if (seen.has(instanceId))
      throw new StudioError("В проекте повторяются идентификаторы объектов.");
    seen.add(instanceId);
    const familyId = id(item.familyId, "семейство");
    if (!catalog.families.some((family) => family.id === familyId))
      throw new StudioError("Неизвестный объект: " + familyId);
    if (item.role !== "main" && item.role !== "background")
      throw new StudioError("Неизвестная роль объекта.");
    return {
      id: instanceId,
      familyId,
      role: item.role,
      x: finite(item.x, -2, 3, "X"),
      y: finite(item.y, -2, 3, "Y"),
      rotation: finite(item.rotation, -360, 360, "поворот"),
    };
  });
  const width = finite(value.width, LIMITS.minSide, LIMITS.maxSide, "ширина");
  const height = finite(value.height, LIMITS.minSide, LIMITS.maxSide, "высота");
  if (!Number.isInteger(width) || !Number.isInteger(height))
    throw new StudioError("Размер холста должен быть целым числом.");
  const seed = finite(value.seed, 0, 2 ** 32 - 1, "seed"),
    revision = finite(value.revision, 0, Number.MAX_SAFE_INTEGER, "версия");
  if (!Number.isSafeInteger(seed) || !Number.isSafeInteger(revision))
    throw new StudioError("Seed и версия проекта должны быть целыми числами.");
  return {
    schemaVersion: 1,
    id: id(value.id, "проект"),
    name: string(value.name, 100, "название", false),
    catalogVersion: catalog.version,
    width,
    height,
    detail: value.detail,
    palette: parsePalette(value.palette, catalog),
    scale: finite(value.scale, 0.00001, 100, "масштаб"),
    instances: instances as SceneDocument["instances"],
    seed,
    layout: value.layout as SceneDocument["layout"],
    revision,
  };
}

export function parseJsonFile(text: string, maxBytes: number): unknown {
  if (new TextEncoder().encode(text).byteLength > maxBytes)
    throw new StudioError("Файл слишком большой.");
  try {
    return JSON.parse(text);
  } catch {
    throw new StudioError("Файл не является корректным JSON.");
  }
}

export function assertDimensions(width: number, height: number): void {
  for (const value of [width, height])
    if (
      !Number.isInteger(value) ||
      value < LIMITS.minSide ||
      value > LIMITS.maxSide
    )
      throw new StudioError(
        `Размер стороны: целое число от ${LIMITS.minSide} до ${LIMITS.maxSide} px.`,
      );
}
