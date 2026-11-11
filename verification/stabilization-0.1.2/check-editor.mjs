import { firefox } from "@playwright/test";
import path from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";
const browser = await firefox.launch({ headless: true });
await mkdir("verification/stabilization-0.1.2/svg-editor", { recursive: true });
const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  }),
  page = await context.newPage();
page.on("pageerror", (error) => console.log("EDITOR ERROR", error.message));
page.on("console", (message) => {
  if (message.type() === "error")
    console.log("EDITOR CONSOLE", message.text().slice(0, 500));
});
try {
  await page.goto("http://127.0.0.1:8766/index.html");
  await page.getByRole("button", { name: "OK", exact: true }).click();
  const results = [];
  for (const name of ["focus", "ideas", "balance"]) {
    const source = await readFile(path.resolve(`examples/${name}.svg`), "utf8");
    await page.evaluate(
      (svg) => window.svgEditor.loadFromString(svg, { noAlert: true }),
      source,
    );
    await page.locator("#svgcontent path").first().waitFor({ timeout: 7000 });
    const result = await page.locator("#svgcontent").evaluate((n) => ({
      width: n.getAttribute("width"),
      height: n.getAttribute("height"),
      groups: n.querySelectorAll("g").length,
      paths: n.querySelectorAll("path").length,
      images: n.querySelectorAll("image").length,
    }));
    if (result.images || !result.paths)
      throw new Error("Editor did not preserve vectors");
    await page.screenshot({
      path: `verification/stabilization-0.1.2/svg-editor/${name}-opened.png`,
      fullPage: true,
    });
    if (name === "focus") {
      const target = await page.evaluate(() => {
        const canvas = window.svgEditor.svgCanvas,
          group = document.querySelector('#svgcontent g[id^="object_1_"]'),
          path = group.querySelector("path");
        canvas.selectOnly([group]);
        canvas.ungroupSelectedElement();
        canvas.ungroupSelectedElement();
        canvas.selectOnly([path]);
        canvas.pathActions.toEditMode(path);
        return { id: path.id, d: path.getAttribute("d") };
      });
      const nodeX = page.locator("#path_node_x input");
      const originalX = Number(await nodeX.inputValue());
      await nodeX.fill(String(originalX + 12));
      await nodeX.press("Enter");
      const after = await page.locator(`[id="${target.id}"]`).getAttribute("d");
      if (after === target.d)
        throw new Error("Node drag did not change vector geometry");
      await page.screenshot({
        path: "verification/stabilization-0.1.2/svg-editor/editable-path-nodes.png",
        fullPage: true,
      });
      const saved = await page.evaluate(() =>
        window.svgEditor.svgCanvas.svgCanvasToString(),
      );
      await writeFile("verification/stabilization-0.1.2/svg-editor/focus-edit-check.svg", saved);
      await page.evaluate(
        (svg) => window.svgEditor.loadFromString(svg, { noAlert: true }),
        saved,
      );
      result.editedNode = true;
      result.reopenedPaths = await page.locator("#svgcontent path").count();
    }
    results.push({ name, ...result });
  }
  await writeFile(
    "verification/stabilization-0.1.2/svg-editor/report.json",
    JSON.stringify(
      {
        editor: "SVG-edit 7.4.2",
        import: "public loadFromString API",
        results,
      },
      null,
      2,
    ),
  );
  console.log(JSON.stringify(results));
} catch (error) {
  console.log((await page.locator("body").ariaSnapshot()).slice(-4000));
  await page.screenshot({ path: "verification/stabilization-0.1.2/svg-editor/failure.png" });
  throw error;
} finally {
  await context.close();
  await browser.close();
}

