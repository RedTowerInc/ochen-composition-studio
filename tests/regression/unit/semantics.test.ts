import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { selectObjects } from "../../../src/core/semantics";
import type { Catalog } from "../../../src/core/types";
const catalog=JSON.parse(readFileSync("public/catalog/manifest.json","utf8")) as Catalog;
describe("bounded semantic selection",()=>{
  it.each(["Нет денег","Личный бюджет","Сбережения"])("M03 financial meaning: %s",(prompt)=>{
    const result=selectObjects(prompt,"meaning",catalog);
    expect(result.ids).toContain("wallet");expect(result.ids).toContain("coin");
    expect(result.ids.length).toBeLessThanOrEqual(3);
  });
  it("M04 does not claim a literal object match from a word fragment",()=>{
    expect(()=>selectObjects("Телефонист","meaning",catalog)).toThrow("Уточните");
    expect(selectObjects("Новый телефон","meaning",catalog).ids).toContain("phone");
  });
  it("M06 never silently drops explicitly mentioned objects",()=>{
    expect(()=>selectObjects("книга, телефон, пазлы, наушники, лампа, кошелек, ручка, папка, монета, цветы","meaning",catalog)).toThrow("6");
  });
});
