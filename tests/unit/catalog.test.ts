// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { assetMarkup, sanitizeSvg } from "../../src/core/svg";
import {
  blankScene,
  type Catalog,
  type Detail,
  type ObjectRole,
} from "../../src/core/types";
const catalog = JSON.parse(
  readFileSync("public/catalog/manifest.json", "utf8"),
) as Catalog;
const audit = JSON.parse(readFileSync("catalog-source/audit.json", "utf8"));
describe("complete original catalogue", () => {
  it("contains all 40 source variants from native sheet exports and verified hashes", () => {
    expect(catalog.families).toHaveLength(10);
    expect(audit.assets).toHaveLength(40);
    const allowed = new Set(Object.values(catalog.palettes[0].colors));
    for (const family of catalog.families)
      for (const detail of ["S", "L"] as Detail[])
        for (const role of ["main", "background"] as ObjectRole[]) {
          const variant = family.variants[detail][role],
            source = readFileSync("public" + variant.url, "utf8");
          const entry = audit.assets.find(
            (row: any) =>
              row.id === family.id &&
              row.detail === detail &&
              row.role === role,
          );
          expect(createHash("sha256").update(source).digest("hex")).toBe(
            entry.sha256,
          );
          expect(entry.sourceNodeId).toBe(variant.sourceNodeId);
          expect(variant.sourceScale).toBe(detail === "S" ? 2 : 1);
          expect(entry.colors.every((c: string) => allowed.has(c))).toBe(true);
          if (role === "background")
            for (const [token, color] of Object.entries(
              catalog.palettes[0].colors,
            ))
              if (catalog.colorRoles[token] === "object")
                expect(entry.colors).not.toContain(color);
          const before = new DOMParser().parseFromString(
              source,
              "image/svg+xml",
            ),
            asset = sanitizeSvg(source, variant);
          const ids = [...before.querySelectorAll("[id]")].map((n) => n.id);
          expect(new Set(ids).size).toBe(ids.length);
          const geometry = (doc: Document | SVGSVGElement) =>
            [...doc.querySelectorAll("path")].map((n) => n.getAttribute("d"));
          expect(geometry(asset.root)).toEqual(geometry(before));
          expect(before.querySelector("image")).toBeNull();
          for (const palette of catalog.palettes) {
            const scene = { ...blankScene(catalog), palette },
              markup = assetMarkup(asset, "audit", scene, catalog);
            const after = new DOMParser().parseFromString(
              '<svg xmlns="http://www.w3.org/2000/svg">' + markup + "</svg>",
              "image/svg+xml",
            );
            expect(after.querySelector("parsererror")).toBeNull();
            expect(geometry(after)).toEqual(geometry(before));
          }
        }
  }, 20000);
});
