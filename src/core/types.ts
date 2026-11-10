export type Detail = "S" | "L";
export type ObjectRole = "main" | "background";
export type LayoutName = "diagonal" | "surround" | "headline";
export type ColorRole = "background" | "object" | "neutral";

export interface AssetVariant {
  url: string;
  width: number;
  height: number;
  viewBox: [number, number, number, number];
  sourceNodeId: string;
  sourceScale: number;
}
export interface AssetFamily {
  id: string;
  name: string;
  aliases: string[];
  tags: string[];
  canonicalWidth: number;
  canonicalHeight: number;
  variants: Record<Detail, Record<ObjectRole, AssetVariant>>;
}
export interface Palette {
  id: string;
  name: string;
  colors: Record<string, string>;
}
export interface Catalog {
  version: string;
  source: string;
  families: AssetFamily[];
  colorRoles: Record<string, ColorRole>;
  palettes: Palette[];
}
export interface SceneInstance {
  id: string;
  familyId: string;
  role: ObjectRole;
  x: number;
  y: number;
  rotation: number;
}
export interface SceneDocument {
  schemaVersion: 1;
  id: string;
  name: string;
  catalogVersion: string;
  width: number;
  height: number;
  detail: Detail;
  palette: Palette;
  scale: number;
  instances: SceneInstance[];
  seed: number;
  layout: LayoutName;
  revision: number;
}
export interface HistoryState {
  present: SceneDocument;
  past: SceneDocument[];
  future: SceneDocument[];
}
export const LIMITS = {
  instances: 50,
  minSide: 128,
  maxSide: 4096,
  prompt: 1000,
  paletteBytes: 32 * 1024,
  projectBytes: 2 * 1024 * 1024,
  history: 60,
  svgNodes: 150_000,
} as const;

export class StudioError extends Error {
  constructor(
    message: string,
    public code = "VALIDATION",
  ) {
    super(message);
    this.name = "StudioError";
  }
}

export const uid = () => crypto.randomUUID();
export const clone = <T>(value: T): T => structuredClone(value);

export function familyById(catalog: Catalog, id: string): AssetFamily {
  const family = catalog.families.find((item) => item.id === id);
  if (!family) throw new StudioError("В библиотеке нет такого объекта: " + id);
  return family;
}

export function blankScene(catalog: Catalog): SceneDocument {
  return {
    schemaVersion: 1,
    id: uid(),
    name: "Новая композиция",
    catalogVersion: catalog.version,
    width: 1200,
    height: 630,
    detail: "L",
    palette: clone(catalog.palettes[0]),
    scale: 1,
    instances: [],
    seed: 1,
    layout: "diagonal",
    revision: 0,
  };
}
