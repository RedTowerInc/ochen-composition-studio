// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  assetKey,
  exportScene,
  sanitizeSvg,
  assetMarkup,
  downloadFile,
} from "../../src/core/svg";
import { addObject, duplicateObject } from "../../src/core/commands";
import { catalog, scene } from "./fixture";
const variant = catalog.families[0].variants.L.main;
const vector =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 80"><defs><linearGradient id="paint"><stop stop-color="#F9A3AA"/></linearGradient><clipPath id="clip"><rect width="100" height="80"/></clipPath></defs><path id="shape" d="M0 0L100 80L0 80Z" fill="url( &quot;#paint&quot; )" clip-path="url(#clip)"/></svg>';
describe("self-contained vector export", () => {
  it("preserves quoted local references and gives duplicates independent definitions", () => {
    const asset = sanitizeSvg(vector, variant),
      assets = new Map([[assetKey("book", "L", "main"), asset]]);
    let value = addObject(scene(), "book", catalog);
    for (let i = 0; i < 20; i++)
      value = duplicateObject(value, value.instances[0].id);
    value.palette.colors.accent = "#CC55EE";
    const snapshot = structuredClone(value),
      svg = exportScene(value, catalog, assets);
    const doc = new DOMParser().parseFromString(svg, "image/svg+xml"),
      ids = [...doc.querySelectorAll("[id]")].map((n) => n.id);
    expect(doc.querySelector("parsererror")).toBeNull();
    expect(new Set(ids).size).toBe(ids.length);
    for (const element of doc.querySelectorAll("*"))
      for (const attr of element.attributes)
        for (const match of attr.value.matchAll(/url\(#([^)]+)\)/g))
          expect(ids).toContain(match[1]);
    expect(doc.querySelectorAll("path")).toHaveLength(21);
    expect(svg).toContain("#CC55EE");
    expect(value).toEqual(snapshot);
    expect(doc.querySelector("image,script,foreignObject")).toBeNull();
  });
  it("rejects active content, raster and external references", () => {
    for (const inner of [
      "<script>alert(1)</script>",
      '<image href="x.png"/>',
      "<foreignObject/>",
      '<path onclick="alert(1)"/>',
      '<path fill="url(https://example.org/a)"/>',
      '<use href="https://example.org/a"/>',
      "<style>path{fill:red}</style>",
    ])
      expect(() =>
        sanitizeSvg(
          '<svg xmlns="http://www.w3.org/2000/svg">' + inner + "</svg>",
          variant,
        ),
      ).toThrow();
    expect(() => sanitizeSvg("<!DOCTYPE svg><svg/>", variant)).toThrow();
  });
  it("keeps original library path geometry during sanitizing and recoloring", () => {
    const source = readFileSync(
      "public/catalog/assets/book-L-main.svg",
      "utf8",
    );
    const original = new DOMParser().parseFromString(source, "image/svg+xml");
    const asset = sanitizeSvg(source, variant),
      value = scene();
    value.palette.colors.accent = "#CC55EE";
    const markup = assetMarkup(asset, "geometry", value, catalog),
      output = new DOMParser().parseFromString(
        '<svg xmlns="http://www.w3.org/2000/svg">' + markup + "</svg>",
        "image/svg+xml",
      );
    expect(
      [...output.querySelectorAll("path")].map((n) => n.getAttribute("d")),
    ).toEqual(
      [...original.querySelectorAll("path")].map((n) => n.getAttribute("d")),
    );
    expect(asset.root.outerHTML).toContain("#F9A3AA");
    expect(markup).toContain("#CC55EE");
  });
  it("does not export an empty or incompletely loaded scene", () => {
    expect(() => exportScene(scene(), catalog, new Map())).toThrow("хотя бы");
    expect(() =>
      exportScene(addObject(scene(), "book", catalog), catalog, new Map()),
    ).toThrow("Не загружен");
  });
  it("releases all 100 download URLs after exports", () => {
    vi.useFakeTimers();
    const create = vi.fn((..._: unknown[]) => "blob:" + crypto.randomUUID()),
      revoke = vi.fn();
    vi.stubGlobal(
      "URL",
      Object.assign(class {}, {
        createObjectURL: create,
        revokeObjectURL: revoke,
      }),
    );
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => {});
    try {
      for (let i = 0; i < 100; i++)
        downloadFile("<svg/>", "test.svg", "image/svg+xml");
      expect(create).toHaveBeenCalledTimes(100);
      vi.runAllTimers();
      expect(revoke).toHaveBeenCalledTimes(100);
      expect(new Set(revoke.mock.calls.map((c) => c[0])).size).toBe(100);
    } finally {
      click.mockRestore();
      vi.unstubAllGlobals();
      vi.useRealTimers();
    }
  });
});
