import { chromium } from "@playwright/test";
import { readFile } from "node:fs/promises";
const checks = JSON.parse(
  await readFile("verification/visual-matrix/checks.json", "utf8"),
);
const rows = await Promise.all(
  checks.map(
    async (item) =>
      `<figure><img src="data:image/png;base64,${(await readFile("verification/visual-matrix/" + item.filename)).toString("base64")}"><figcaption>${item.detail} · ${item.palette} · ${item.format}</figcaption></figure>`,
  ),
);
const browser = await chromium.launch({ channel: "chrome" }),
  page = await browser.newPage({ viewport: { width: 1100, height: 1600 } });
try {
  await page.setContent(
    "<style>body{margin:20px;font:14px Arial;background:#faf8ff;display:grid;grid-template-columns:repeat(3,1fr);gap:20px}figure{margin:0;text-align:center;background:white;padding:10px;border:1px solid #ddd5e8}img{width:100%;height:210px;object-fit:contain}figcaption{padding-top:10px;color:#645773}</style>" +
      rows.join(""),
  );
  await page.screenshot({
    path: "verification/visual-matrix/contact-sheet.png",
    fullPage: true,
  });
} finally {
  await browser.close();
}
