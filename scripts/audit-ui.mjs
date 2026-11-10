import { chromium } from "@playwright/test";
import { writeFile } from "node:fs/promises";
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  const page = await browser.newPage({
    viewport: { width: 1366, height: 768 },
  });
  await page.goto("http://127.0.0.1:4173");
  await page.locator(".left-sidebar textarea").waitFor();
  await page
    .locator(".left-sidebar")
    .getByText("Собрать композицию", { exact: true })
    .click();
  await page.locator(".interactive-scene [data-instance]").first().waitFor();
  await page.locator(".interactive-scene [data-instance]").first().focus();
  await page.screenshot({
    path: "verification/strict-audit/laptop-selected.png",
    fullPage: true,
  });
  const data = await page.evaluate(() => {
    const rgb = (s) => (s.match(/[\d.]+/g) || []).map(Number).slice(0, 3);
    const luminance = (c) =>
      c
        .map((v) => v / 255)
        .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
        .reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0);
    const rows = [
      ".segmented button[aria-pressed=false]",
      ".sidebar-tabs button[aria-pressed=false]",
      ".save-status",
      ".workspace-footer",
    ];
    const text = rows.map((selector) => {
      const el = document.querySelector(selector),
        s = getComputedStyle(el);
      let parent = el,
        bg;
      do {
        bg = getComputedStyle(parent).backgroundColor;
        parent = parent.parentElement;
      } while (parent && bg === "rgba(0, 0, 0, 0)");
      const a = luminance(rgb(s.color)),
        b = luminance(rgb(bg));
      return {
        selector,
        text: el.textContent,
        color: s.color,
        background: bg,
        fontSize: s.fontSize,
        contrast:
          Math.round(
            ((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)) * 100,
          ) / 100,
      };
    });
    const svg = document
      .querySelector(".interactive-scene")
      .getBoundingClientRect();
    return {
      viewport: [innerWidth, innerHeight],
      horizontalOverflow: document.documentElement.scrollWidth > innerWidth,
      canvas: { width: svg.width, height: svg.height },
      text,
    };
  });
  await writeFile(
    "verification/strict-audit/ui-metrics.json",
    JSON.stringify(data, null, 2),
  );
  console.log(JSON.stringify(data));
} finally {
  await browser.close();
}
