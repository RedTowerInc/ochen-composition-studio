import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { makeCandidates } from "../../../src/core/composition";
import { addObject } from "../../../src/core/commands";
import {
  assetKey,
  assetMarkup,
  exportScene,
  sanitizeSvg,
} from "../../../src/core/svg";
import { validateScene } from "../../../src/core/validation";
import {
  blankScene,
  StudioError,
  type Catalog,
  type SceneDocument,
  type SceneInstance,
} from "../../../src/core/types";

const catalog = JSON.parse(
  readFileSync("public/catalog/manifest.json", "utf8"),
) as Catalog;
const book = catalog.families.find((f) => f.id === "book")!;
const variant = book.variants.L.main;
const assets = new Map([
  [
    assetKey("book", "L", "main"),
    sanitizeSvg(readFileSync("public" + variant.url, "utf8"), variant),
  ],
]);

// Independent measurement of a rotated rectangle. This is a coarse regression
// floor, not a substitute for the planned rendered-ink and visual acceptance.
function onCanvasFraction(scene: SceneDocument, item: SceneInstance) {
  const source = catalog.families.find((f) => f.id === item.familyId)!.variants[
    scene.detail
  ][item.role];
  const a = Math.abs(Math.cos((item.rotation * Math.PI) / 180));
  const b = Math.abs(Math.sin((item.rotation * Math.PI) / 180));
  const factor = scene.scale * source.sourceScale;
  const w = factor * (source.viewBox[2] * a + source.viewBox[3] * b);
  const h = factor * (source.viewBox[2] * b + source.viewBox[3] * a);
  const left = item.x * scene.width - w / 2;
  const top = item.y * scene.height - h / 2;
  const visibleW = Math.max(
    0,
    Math.min(scene.width, left + w) - Math.max(0, left),
  );
  const visibleH = Math.max(
    0,
    Math.min(scene.height, top + h) - Math.max(0, top),
  );
  return (visibleW * visibleH) / (w * h);
}

describe("A01: actual library sizes, not equal-sized fixtures", () => {
  it("RG01: every offered candidate keeps each main object at least half on canvas", () => {
    const input = ["coin", "book", "lamp"];
    for (const detail of ["L", "S"] as const) {
      for (const [width, height] of [
        [1200, 675],
        [1000, 1000],
        [800, 1000],
      ]) {
        const source = {
          ...blankScene(catalog),
          width,
          height,
          detail,
          seed: 20261110,
        };
        const before = structuredClone(source);
        const candidates = makeCandidates(source, input, catalog, false);
        expect(candidates.length).toBeGreaterThan(0);
        expect(source).toEqual(before);
        for (const candidate of candidates) {
          expect(candidate.instances.map((i) => i.familyId).sort()).toEqual(
            [...input].sort(),
          );
          for (const item of candidate.instances) {
            expect(
              onCanvasFraction(candidate, item),
              `${detail} ${width}×${height} ${candidate.layout} ${item.familyId}`,
            ).toBeGreaterThanOrEqual(0.5);
          }
        }
      }
    }
  });

  it("RG02: adding a book after a coin does not leave most of the book outside", () => {
    const scene = addObject(
      addObject(blankScene(catalog), "coin", catalog),
      "book",
      catalog,
    );
    const added = scene.instances.find((i) => i.familyId === "book")!;
    expect(onCanvasFraction(scene, added)).toBeGreaterThanOrEqual(0.5);
    expect(scene.instances).toHaveLength(2);
  });
});

describe("A04: reject broken resources before a renderer can see them", () => {
  it.each([
    '<g id="loop"><use href="#loop"/></g>',
    '<defs><g id="a"><use href="#b"/></g><g id="b"><use href="#a"/></g></defs><use href="#a"/>',
  ])("S06: cyclic resources are rejected", (body) => {
    expect(() =>
      sanitizeSvg(
        `<svg xmlns="http://www.w3.org/2000/svg">${body}</svg>`,
        variant,
      ),
    ).toThrow(StudioError);
  });
  it("S06: excessive DOM depth is rejected before purification", () => {
    const nested =
      "<g>".repeat(130) + '<path d="M0 0L10 10"/>' + "</g>".repeat(130);
    expect(() =>
      sanitizeSvg(
        `<svg xmlns="http://www.w3.org/2000/svg">${nested}</svg>`,
        variant,
      ),
    ).toThrow(StudioError);
  });
  it("S04: uppercase URL syntax is also namespaced correctly", () => {
    const source =
      '<svg xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="Paint"><stop stop-color="#181817"/></linearGradient></defs><path d="M0 0L10 10" fill="URL(#Paint)"/></svg>';
    const value = sanitizeSvg(source, variant);
    const result = assetMarkup(
      value,
      "independent",
      blankScene(catalog),
      catalog,
    );
    expect(result).toContain("url(#independent_");
    expect(result).not.toContain("#Paint");
  });
  it.each([
    ["RG03 missing fill", '<path d="M0 0L10 10L0 10Z" fill="url(#missing)"/>'],
    [
      "RG04 nested missing href",
      '<defs><g id="resource"><use href="#missing"/></g></defs><use href="#resource"/>',
    ],
    [
      "RG05 duplicate IDs",
      '<defs><path id="a" d="M0 0L10 10"/><path id="a" d="M1 1L9 9"/></defs><use href="#a"/>',
    ],
  ])("%s", (_name, body) => {
    expect(() =>
      sanitizeSvg(
        `<svg xmlns="http://www.w3.org/2000/svg">${body}</svg>`,
        variant,
      ),
    ).toThrow(StudioError);
  });

  it("RG06: valid forward and nested local references remain accepted", () => {
    const body =
      '<use href="#group"/><defs><g id="group"><use href="#shape"/></g><path id="shape" d="M0 0L10 10"/></defs>';
    const asset = sanitizeSvg(
      `<svg xmlns="http://www.w3.org/2000/svg">${body}</svg>`,
      variant,
    );
    expect(asset.root.querySelectorAll("use")).toHaveLength(2);
    const markup = assetMarkup(
      asset,
      "valid_refs",
      blankScene(catalog),
      catalog,
    );
    expect(markup).toContain('href="#valid_refs_');
  });
});

describe("A05: project names and valid XML output", () => {
  it("RG07: import rejects forbidden XML characters in a project name", () => {
    for (const char of [
      "\u0000",
      "\u0001",
      "\u0008",
      "\u000b",
      "\u000c",
      "\u001f",
      "\ufffe",
      "\uffff",
      "\ud800",
      "\udc00",
    ]) {
      expect(() =>
        validateScene(
          { ...blankScene(catalog), name: `Проект${char}X` },
          catalog,
        ),
      ).toThrow(StudioError);
    }
  });

  it("RG08: even bypassing import cannot produce an invalid SVG silently", () => {
    const scene = addObject(blankScene(catalog), "book", catalog);
    scene.name = "Проект\u0000X";
    let svg: string;
    try {
      svg = exportScene(scene, catalog, assets);
    } catch (error) {
      expect(error).toBeInstanceOf(StudioError);
      return;
    }
    const xml = new DOMParser().parseFromString(svg, "image/svg+xml");
    expect(xml.querySelector("parsererror")).toBeNull();
    expect(xml.querySelectorAll("path").length).toBeGreaterThan(0);
  });

  it("RG09: Russian, emoji and XML punctuation keep their exact meaning", () => {
    const scene = addObject(blankScene(catalog), "book", catalog);
    scene.name = `Книга & <идея> «Очень» "2026" 📚`;
    const valid = validateScene(scene, catalog);
    const xml = new DOMParser().parseFromString(
      exportScene(valid, catalog, assets),
      "image/svg+xml",
    );
    expect(xml.querySelector("parsererror")).toBeNull();
    expect(xml.querySelector("title")?.textContent).toBe(scene.name);
  });
});
