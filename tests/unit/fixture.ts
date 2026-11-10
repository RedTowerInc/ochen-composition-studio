import { blankScene, type Catalog } from "../../src/core/types";
const variant = {
  url: "/catalog/assets/test.svg",
  width: 100,
  height: 80,
  viewBox: [0, 0, 100, 80] as [number, number, number, number],
  sourceNodeId: "1:1",
  sourceScale: 1,
};
export const catalog: Catalog = {
  version: "test",
  source: "unit fixture",
  colorRoles: { background: "background", accent: "object", ink: "neutral" },
  palettes: [
    {
      id: "one",
      name: "Первая",
      colors: { background: "#D7CDF5", accent: "#F9A3AA", ink: "#181817" },
    },
  ],
  families: [
    ["book", "Книга", "study"],
    ["lamp", "Лампа", "ideas"],
    ["headphones", "Наушники", "focus"],
  ].map(([id, name, tag]) => ({
    id,
    name,
    aliases: [],
    tags: [tag],
    canonicalWidth: 100,
    canonicalHeight: 80,
    variants: {
      L: { main: variant, background: variant },
      S: {
        main: { ...variant, sourceScale: 2 },
        background: { ...variant, sourceScale: 2 },
      },
    },
  })),
};
export const scene = () => blankScene(catalog);
