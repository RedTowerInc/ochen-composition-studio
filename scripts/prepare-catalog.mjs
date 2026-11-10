import { chromium } from "@playwright/test";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const specs = [
  [
    "book",
    "Книга",
    ["книги", "книжка", "учебник", "чтение"],
    ["study", "work"],
    ["Книга", "Книга_2", "Group 2136136335", "Group 2136136341"],
    ["21:29965", "24:6273", "24:3810", "24:6934"],
  ],
  [
    "phone",
    "Телефон",
    ["смартфон", "телефоны", "связь"],
    ["communication", "time"],
    ["Телефон", "Телефон_2", "Телефон", "Телефон_2"],
    ["21:25472", "24:6327", "24:4746", "24:6990"],
  ],
  [
    "puzzle",
    "Пазлы",
    ["пазл", "головоломка", "паззл"],
    ["ideas", "study"],
    ["Пазлы", "Пазлы_2", "Пазлы", "Пазлы_2"],
    ["21:417", "24:6214", "24:4903", "24:7147"],
  ],
  [
    "headphones",
    "Наушники",
    ["музыка", "наушник"],
    ["focus", "calm"],
    ["Наушники", "Наушники_2", "Наушники", "Наушники_2"],
    ["23:122", "24:6484", "24:5089", "24:7344"],
  ],
  [
    "lamp",
    "Лампа",
    ["светильник", "настольная лампа", "свет"],
    ["ideas", "work"],
    ["Лампа", "Лампа_2", "Лампа", "Лампа_2"],
    ["23:121", "24:6569", "24:5485", "24:7429"],
  ],
  [
    "wallet",
    "Кошелёк",
    ["кошелек", "деньги", "портмоне"],
    ["finance", "work"],
    ["Кошелек", "Кошелек_2", "Кошелек", "Кошелек_2"],
    ["23:211", "24:6660", "24:4594", "24:7568"],
  ],
  [
    "pen",
    "Ручка",
    ["ручки", "письмо", "карандаш"],
    ["work", "ideas"],
    ["Ручка", "Ручка_2", "Group 2136136336", "Group 2136136343"],
    ["24:1734", "24:6747", "24:4287", "24:7543"],
  ],
  [
    "folder",
    "Папка",
    ["папки", "документы", "файлы"],
    ["time", "work"],
    ["Папка", "Папка_2", "Group 2136136337", "Group 2136136342"],
    ["24:1899", "24:6772", "24:4430", "24:7520"],
  ],
  [
    "coin",
    "Монета",
    ["монеты", "сбережения", "копилка"],
    ["finance", "time"],
    ["Монета", "Монета_2", "Монета", "Монета_2"],
    ["24:2207", "24:6795", "24:5345", "24:7205"],
  ],
  [
    "flowers",
    "Цветы",
    ["ваза", "цветок", "тюльпаны", "ваза с цветами", "букет"],
    ["calm", "ideas"],
    [
      "Group 2136136344",
      "Group 2136136347",
      "Group 2136136345",
      "Group 2136136346",
    ],
    ["28:11628", "30:11902", "28:11629", "28:11766"],
  ],
];
const decode = (value) =>
  /[ÐÑ]/.test(value) ? Buffer.from(value, "latin1").toString("utf8") : value;
const sha = (value) => createHash("sha256").update(value).digest("hex");
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage();
const extracted = {},
  audit = {
    sourceFileKey: "pnpYBt06NCRv8gnkQXrjYD",
    originalFileKey: "4MCFttsSoP7hgQh29zq5G3",
    files: [],
    assets: [],
  };
try {
  for (const detail of ["L", "S"]) {
    const source = await readFile(
      path.join(root, `catalog-source/library-${detail}.svg`),
      "utf8",
    );
    audit.files.push({
      detail,
      sha256: sha(source),
      bytes: Buffer.byteLength(source),
    });
    await page.setContent("<!doctype html><body>");
    await page.evaluate((source) => {
      const xml = new DOMParser().parseFromString(source, "image/svg+xml");
      if (xml.querySelector("parsererror"))
        throw new Error("Invalid source SVG");
      document.body.append(document.importNode(xml.documentElement, true));
    }, source);
    const rows = await page.evaluate(() => {
      const svg = document.querySelector("svg"),
        section = svg.querySelector(":scope > g");
      return [...section.children]
        .filter((n) => n.localName === "g")
        .map((group) => {
          const box = group.getBBox();
          const refs = new Set();
          const scan = (markup) => {
            for (const m of markup.matchAll(/url\(#([^\)]+)\)/g))
              refs.add(m[1]);
          };
          const markup = new XMLSerializer().serializeToString(group);
          scan(markup);
          const definitions = [];
          for (const id of refs) {
            const target = svg.getElementById(id);
            if (!target) throw new Error("Missing definition: " + id);
            const definition = new XMLSerializer().serializeToString(target);
            definitions.push(definition);
            scan(definition);
          }
          const colors = [
            ...new Set(
              [...group.querySelectorAll("*")].flatMap((n) =>
                ["fill", "stroke", "stop-color"]
                  .map((a) => n.getAttribute(a))
                  .filter((v) => v && !v.startsWith("url(") && v !== "none"),
              ),
            ),
          ];
          return {
            name: group.id,
            markup,
            definitions,
            viewBox: [box.x - 1, box.y - 1, box.width + 2, box.height + 2],
            nodes: group.querySelectorAll("*").length,
            colors,
            paints: [...group.children].map((n) => n.getAttribute("fill")),
          };
        });
    });
    extracted[detail] = new Map(rows.map((row) => [decode(row.name), row]));
  }
  const hex = (value) =>
    value === "white"
      ? "#FFFFFF"
      : value === "black"
        ? "#000000"
        : value.toUpperCase();
  const tokens = [
    "background",
    "accent",
    "backgroundShade",
    "highlight",
    "backgroundInk",
    "soft",
    "ink",
    "paper",
  ];
  const paletteGroups = [
    "Group 2136136332",
    "Group 2136136333",
    "Group 2136136334",
  ];
  const palettes = paletteGroups.map((name, i) => ({
    id: ["lilac", "peach", "mint"][i],
    name: ["Лиловая", "Персиковая", "Мятная"][i],
    colors: Object.fromEntries(
      extracted.L.get(name).paints.map((paint, index) => [
        tokens[index],
        hex(paint),
      ]),
    ),
  }));
  const families = [];
  await mkdir(path.join(root, "public/catalog/assets"), { recursive: true });
  for (const [id, name, aliases, tags, names, nodeIds] of specs) {
    const variants = { L: {}, S: {} };
    for (let i = 0; i < 4; i++) {
      const detail = i < 2 ? "L" : "S",
        role = i % 2 ? "background" : "main",
        row = extracted[detail].get(names[i]);
      if (!row)
        throw new Error("Missing original: " + id + " " + detail + " " + role);
      const [x, y, width, height] = row.viewBox;
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${width}" height="${height}" viewBox="${x} ${y} ${width} ${height}">${row.definitions.length ? "<defs>" + row.definitions.join("") + "</defs>" : ""}${row.markup}</svg>\n`;
      const filename = `${id}-${detail}-${role}.svg`;
      await writeFile(path.join(root, "public/catalog/assets", filename), svg);
      variants[detail][role] = {
        url: "/catalog/assets/" + filename,
        width,
        height,
        viewBox: row.viewBox,
        sourceNodeId: nodeIds[i],
        sourceScale: detail === "S" ? 2 : 1,
      };
      audit.assets.push({
        id,
        detail,
        role,
        sourceNodeId: nodeIds[i],
        sourceGroup: names[i],
        sha256: sha(svg),
        geometrySha256: sha(row.markup),
        nodes: row.nodes,
        colors: row.colors.map(hex),
        bytes: Buffer.byteLength(svg),
      });
    }
    families.push({
      id,
      name,
      aliases,
      tags,
      canonicalWidth: variants.L.main.width,
      canonicalHeight: variants.L.main.height,
      variants,
    });
  }
  const catalog = {
    version: "ochen-originals-2026-11-10-v1",
    source: "https://www.figma.com/design/4MCFttsSoP7hgQh29zq5G3/",
    families,
    colorRoles: {
      background: "background",
      backgroundShade: "background",
      backgroundInk: "background",
      accent: "object",
      highlight: "object",
      soft: "object",
      ink: "neutral",
      paper: "neutral",
    },
    palettes,
  };
  await writeFile(
    path.join(root, "public/catalog/manifest.json"),
    JSON.stringify(catalog, null, 2) + "\n",
  );
  await writeFile(
    path.join(root, "catalog-source/audit.json"),
    JSON.stringify(audit, null, 2) + "\n",
  );
  const expected = new Set(Object.values(palettes[0].colors));
  console.log(
    JSON.stringify(
      {
        assets: audit.assets.length,
        nodes: audit.assets.reduce((sum, a) => sum + a.nodes, 0),
        unexpectedColors: [
          ...new Set(
            audit.assets
              .flatMap((a) => a.colors)
              .filter((color) => !expected.has(color)),
          ),
        ],
        palettes,
      },
      null,
      2,
    ),
  );
} finally {
  await browser.close();
}
