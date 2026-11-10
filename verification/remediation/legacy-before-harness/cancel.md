# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: extremes.spec.ts >> background objects can be omitted and a cancelled generation cannot replace the scene
- Location: tests\e2e\extremes.spec.ts:273:1

# Error details

```
Test timeout of 30000ms exceeded.
```

```
Error: locator.click: Test timeout of 30000ms exceeded.
Call log:
  - waiting for locator('.left-sidebar').getByRole('button', { name: 'Отменить сборку', exact: true })

```

# Page snapshot

```yaml
- generic [ref=e3]:
  - banner [ref=e4]:
    - link "Композиция — векторная студия" [ref=e5] [cursor=pointer]:
      - /url: "#"
      - generic [ref=e6]: о.
      - generic [ref=e7]:
        - text: композиция
        - generic [ref=e8]: ВЕКТОРНАЯ СТУДИЯ
    - generic [ref=e10]:
      - textbox "Название проекта" [ref=e11]: Новая композиция
      - status [ref=e12]: Сохранено в браузере
    - generic [ref=e14]:
      - generic [ref=e15]:
        - button "Отменить действие" [ref=e16] [cursor=pointer]
        - button "Повторить действие" [disabled] [ref=e19]
      - group [ref=e22]:
        - generic "Проект" [ref=e23] [cursor=pointer]
      - button "Скачать SVG" [ref=e29] [cursor=pointer]
  - generic [ref=e34]:
    - complementary [ref=e35]:
      - generic [ref=e36]:
        - navigation "Инструменты" [ref=e37]:
          - button "Собрать" [pressed] [ref=e38] [cursor=pointer]
          - button "Объекты" [ref=e42] [cursor=pointer]
          - button "Слои" [ref=e46] [cursor=pointer]
        - generic [ref=e51]:
          - generic [ref=e52]: ОТ СЛОВ К КОМПОЗИЦИИ
          - heading "Какая у вас идея?" [level=1] [ref=e53]: Какая у васидея?
          - paragraph [ref=e54]: Соберите историю из готовых иллюстраций. Остальное — дело деталей.
          - generic "Способ подбора" [ref=e55]:
            - button "По смыслу" [pressed] [ref=e56] [cursor=pointer]
            - button "По объектам" [ref=e57] [cursor=pointer]
          - generic [ref=e58]: Заголовок или метафора
          - textbox "Заголовок или метафора" [ref=e59]:
            - /placeholder: Например, сосредоточиться на главном
            - text: Сосредоточиться на главном
          - generic [ref=e60]:
            - generic [ref=e61]: Подбор по смысловым темам
            - generic [ref=e62]: 26/1000
          - generic [ref=e63] [cursor=pointer]:
            - checkbox "Добавить фоновый объект" [ref=e64]
            - text: Добавить фоновый объект
          - button "Собрать композицию" [active] [ref=e65] [cursor=pointer]
          - generic [ref=e69]:
            - generic [ref=e70]: Попробуйте идею
            - button "Сосредоточиться на главном ↗" [ref=e71] [cursor=pointer]:
              - text: Сосредоточиться на главном
              - generic [ref=e72]: ↗
            - button "Время для новых идей ↗" [ref=e73] [cursor=pointer]:
              - text: Время для новых идей
              - generic [ref=e74]: ↗
            - button "Учиться с удовольствием ↗" [ref=e75] [cursor=pointer]:
              - text: Учиться с удовольствием
              - generic [ref=e76]: ↗
          - status [ref=e77]:
            - paragraph [ref=e80]: Подбор по теме «фокус и спокойная работа». Каждый объект можно заменить или удалить.
          - generic [ref=e81]:
            - generic [ref=e82]: о.
            - paragraph [ref=e83]:
              - text: Оригинальная библиотека
              - strong [ref=e84]: Студии Очень
    - main [ref=e85]:
      - generic [ref=e86]:
        - heading "Композиция" [level=2] [ref=e88]
        - generic [ref=e89]: 3 / 50 объектов
      - region "Рабочая область" [ref=e90]:
        - generic [ref=e91]: 1200 × 630
        - group "Холст композиции" [ref=e97]:
          - button "Книга" [ref=e99]
          - button "Наушники" [ref=e155]
          - button "Телефон" [ref=e242]
        - generic [ref=e400]:
          - generic [ref=e401]: Перетаскивайте объекты на холсте
          - generic [ref=e404]:
            - button "Уменьшить масштаб" [ref=e405] [cursor=pointer]: −
            - button "Вписать" [ref=e406] [cursor=pointer]
            - button "Увеличить масштаб" [ref=e407] [cursor=pointer]: +
      - generic [ref=e408]:
        - generic [ref=e409]:
          - heading "Варианты композиции" [level=2] [ref=e410]
          - generic [ref=e411]: Выберите вариант
        - generic [ref=e412]:
          - button "Предпросмотр композиции Диагональ Динамика и общий ритм ↗" [ref=e413] [cursor=pointer]:
            - img "Предпросмотр композиции" [ref=e415]
            - generic [ref=e718]:
              - generic [ref=e719]: Диагональ
              - generic [ref=e720]: Динамика и общий ритм
            - generic [ref=e721]: ↗
          - button "Предпросмотр композиции С окружением Главный объект и детали ↗" [ref=e722] [cursor=pointer]:
            - img "Предпросмотр композиции" [ref=e724]
            - generic [ref=e1027]:
              - generic [ref=e1028]: С окружением
              - generic [ref=e1029]: Главный объект и детали
            - generic [ref=e1030]: ↗
          - button "Предпросмотр композиции Под заголовок Больше свободного места ↗" [ref=e1031] [cursor=pointer]:
            - img "Предпросмотр композиции" [ref=e1033]
            - generic [ref=e1336]:
              - generic [ref=e1337]: Под заголовок
              - generic [ref=e1338]: Больше свободного места
            - generic [ref=e1339]: ↗
    - complementary [ref=e1340]:
      - generic [ref=e1341]:
        - heading "Композиция" [level=2] [ref=e1344]
        - generic [ref=e1345]:
          - heading "Формат холста" [level=3] [ref=e1346]
          - generic [ref=e1347]:
            - button "16:9" [ref=e1348] [cursor=pointer]
            - button "1:1" [ref=e1351] [cursor=pointer]
            - button "4:5" [ref=e1354] [cursor=pointer]
          - generic [ref=e1357]:
            - generic [ref=e1358]:
              - text: Ширина
              - spinbutton "Ширина холста" [ref=e1359]: "1200"
            - generic [ref=e1360]: ×
            - generic [ref=e1361]:
              - text: Высота
              - spinbutton "Высота холста" [ref=e1362]: "630"
            - generic [ref=e1363]: px
        - generic [ref=e1364]:
          - generic [ref=e1365]:
            - heading "Детализация" [level=3] [ref=e1366]
            - generic "Два исходных варианта иллюстраций из библиотеки" [ref=e1367]: "?"
          - generic [ref=e1368]:
            - button "S Меньше деталей" [ref=e1369] [cursor=pointer]:
              - generic [ref=e1370]: S
              - generic [ref=e1371]: Меньше деталей
            - button "L Больше деталей" [pressed] [ref=e1372] [cursor=pointer]:
              - generic [ref=e1373]: L
              - generic [ref=e1374]: Больше деталей
        - generic [ref=e1377]:
          - heading "Палитра" [level=3] [ref=e1379]
          - generic [ref=e1386]:
            - button "Лиловая" [pressed] [ref=e1387] [cursor=pointer]
            - button "Персиковая" [ref=e1398] [cursor=pointer]
            - button "Мятная" [ref=e1406] [cursor=pointer]
          - button "Загрузить JSON-палитру" [ref=e1414] [cursor=pointer]
          - button "Образец JSON" [ref=e1418] [cursor=pointer]
          - paragraph [ref=e1422]: "Цветовые роли сохраняются: фон, акценты и нейтральные контуры."
        - generic [ref=e1423]:
          - generic [ref=e1424]: ↖
          - paragraph [ref=e1425]: Выберите объект на холсте,чтобы настроить его.
```

# Test source

```ts
  190 |     await page.mouse.down();
  191 |     await page.mouse.move(
  192 |       box!.x + box!.width / 2 - 25,
  193 |       box!.y + box!.height / 2 - 20,
  194 |     );
  195 |     if (event === "pointercancel")
  196 |       await page
  197 |         .locator(".interactive-scene")
  198 |         .dispatchEvent("pointercancel", { pointerId: 1 });
  199 |     else await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  200 |     await page.mouse.up();
  201 |     const after = await downloadProject(page);
  202 |     expect(after.instances).toEqual(before.instances);
  203 |     expect(after.revision).toBe(before.revision);
  204 |   }
  205 | });
  206 | 
  207 | test("a failed catalogue request can be retried without a false empty editor", async ({
  208 |   page,
  209 | }) => {
  210 |   await page.route("**/catalog/assets/phone-L-main.svg", (route) =>
  211 |     route.abort(),
  212 |   );
  213 |   await page.goto("/");
  214 |   await expect(
  215 |     page.getByRole("button", { name: "Повторить загрузку", exact: true }),
  216 |   ).toBeVisible();
  217 |   await expect(page.locator(".studio-shell")).toHaveCount(0);
  218 |   await page.unroute("**/catalog/assets/phone-L-main.svg");
  219 |   await page
  220 |     .getByRole("button", { name: "Повторить загрузку", exact: true })
  221 |     .click();
  222 |   await generate(page);
  223 | });
  224 | 
  225 | test("typing spaces and editor hotkeys never corrupt text or object selection", async ({
  226 |   page,
  227 | }) => {
  228 |   await ready(page);
  229 |   await generate(page);
  230 |   await side(page).getByRole("button", { name: "Слои", exact: true }).click();
  231 |   await side(page).locator(".layer-select").first().click();
  232 |   await page.getByLabel("Название проекта").fill("Весна");
  233 |   await page.getByLabel("Название проекта").press("End");
  234 |   await page.getByLabel("Название проекта").pressSequentially(" 2026");
  235 |   await expect(page.getByLabel("Название проекта")).toHaveValue("Весна 2026");
  236 |   await page.keyboard.press("Backspace");
  237 |   await expect(shapes(page)).toHaveCount(4);
  238 |   await expect(page.getByLabel("Название проекта")).toHaveValue("Весна 202");
  239 | });
  240 | 
  241 | test("slow CPU and rapid format changes preserve geometry and live DOM IDs", async ({
  242 |   page,
  243 |   context,
  244 | }) => {
  245 |   const cdp = await context.newCDPSession(page);
  246 |   await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  247 |   await ready(page);
  248 |   await generate(page);
  249 |   const original = await downloadProject(page);
  250 |   for (let i = 0; i < 3; i++)
  251 |     for (const format of ["1:1", "4:5", "16:9"])
  252 |       await page.getByRole("button", { name: format, exact: true }).click();
  253 |   const after = await downloadProject(page);
  254 |   expect(after.instances).toEqual(original.instances);
  255 |   expect(Number.isFinite(after.scale)).toBe(true);
  256 |   const duplicates = await page
  257 |     .locator(".studio-shell [id]")
  258 |     .evaluateAll((nodes) => {
  259 |       const ids = nodes.map((n) => n.id);
  260 |       return ids.length - new Set(ids).size;
  261 |     });
  262 |   expect(duplicates).toBe(0);
  263 |   await page
  264 |     .getByRole("button", { name: "Увеличить масштаб", exact: true })
  265 |     .click();
  266 |   await page.setViewportSize({ width: 1024, height: 800 });
  267 |   await expect(
  268 |     page.getByRole("button", { name: "Скачать SVG", exact: true }),
  269 |   ).toBeVisible();
  270 |   expect(await exportSvg(page)).toContain("<path");
  271 | });
  272 | 
  273 | test("background objects can be omitted and a cancelled generation cannot replace the scene", async ({
  274 |   page,
  275 | }) => {
  276 |   await ready(page);
  277 |   await side(page).getByLabel("Добавить фоновый объект").uncheck();
  278 |   await side(page)
  279 |     .getByRole("button", { name: "Собрать композицию", exact: true })
  280 |     .click();
  281 |   await expect(shapes(page)).toHaveCount(3);
  282 |   const current = await downloadProject(page);
  283 |   expect(current.instances.every((i: any) => i.role === "main")).toBe(true);
  284 |   await page.clock.install();
  285 |   await side(page)
  286 |     .getByRole("button", { name: "Собрать композицию", exact: true })
  287 |     .click();
  288 |   await side(page)
  289 |     .getByRole("button", { name: "Отменить сборку", exact: true })
> 290 |     .click();
      |      ^ Error: locator.click: Test timeout of 30000ms exceeded.
  291 |   await page.clock.fastForward(1000);
  292 |   expect((await downloadProject(page)).instances).toEqual(current.instances);
  293 | });
  294 | 
```