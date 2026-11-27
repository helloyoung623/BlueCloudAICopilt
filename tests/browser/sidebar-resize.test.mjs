// 侧边栏拖拽调宽的浏览器回归。运行：pnpm test:browser
// 复用 harness 的本机 Chrome + 本地静态服务；全程离线、不访问真实模型、不改产品代码。
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import puppeteer from "puppeteer-core";
import { CHAT_TEXTAREA, resolveChrome, sleep, startApp, withPage } from "./harness.mjs";

const HANDLE = '[role="separator"][aria-label="调整侧边栏宽度"]';
const STORAGE_KEY = "sidebar-width";
const DEFAULT_WIDTH = 240;
const MIN_WIDTH = 200;
const MAX_WIDTH = 480;

let app;
let browser;

before(async () => {
  app = await startApp();
  browser = await puppeteer.launch({
    executablePath: resolveChrome(),
    headless: "new",
    args: ["--no-sandbox"],
  });
});

after(async () => {
  await browser?.close();
  await app?.close();
});

// 侧栏宽度、主内容区的位置、手柄自己报的宽度（aria-valuenow）
async function measure(page) {
  return page.evaluate((selector) => {
    const handle = document.querySelector(selector);
    if (!handle) throw new Error("页面上找不到侧边栏拖拽手柄");
    const sidebar = handle.parentElement;
    const main = document.querySelector(".chat-layout");
    return {
      sidebarWidth: Math.round(sidebar.getBoundingClientRect().width),
      mainLeft: main ? Math.round(main.getBoundingClientRect().left) : null,
      mainWidth: main ? Math.round(main.getBoundingClientRect().width) : null,
      valueNow: Number(handle.getAttribute("aria-valuenow")),
    };
  }, HANDLE);
}

// 从手柄当前位置往右（正数）/往左（负数）拖 dx 像素
async function dragHandle(page, dx) {
  const handle = await page.$(HANDLE);
  assert.ok(handle, "应能拿到侧边栏拖拽手柄");
  const box = await handle.boundingBox();
  assert.ok(box, "手柄应有位置");
  const startX = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(startX, y);
  await page.mouse.down();
  await page.mouse.move(startX + dx, y, { steps: 10 });
  await page.mouse.up();
  await sleep(120);
}

// 清掉上次记住的宽度并重新加载，回到默认状态
async function resetWidth(page) {
  await page.evaluate((key) => window.localStorage.removeItem(key), STORAGE_KEY);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector(CHAT_TEXTAREA, { timeout: 10000 });
  await sleep(300);
}

test("侧边栏默认 240，拖右边缘可以改宽，主内容区跟着让位", { timeout: 60000 }, async () => {
  await withPage(browser, app, async ({ page }) => {
    await resetWidth(page);
    const initial = await measure(page);
    assert.equal(initial.sidebarWidth, DEFAULT_WIDTH, "默认宽度应为 240");
    assert.equal(initial.valueNow, DEFAULT_WIDTH, "手柄上报的宽度应为 240");
    assert.equal(initial.mainLeft, DEFAULT_WIDTH, "主内容区应贴在侧栏右边");

    await dragHandle(page, 80);
    const widened = await measure(page);
    assert.equal(widened.sidebarWidth, DEFAULT_WIDTH + 80, "往右拖 80 应变成 320");
    assert.equal(widened.valueNow, DEFAULT_WIDTH + 80, "手柄上报的宽度应跟着变");
    assert.equal(widened.mainLeft, DEFAULT_WIDTH + 80, "主内容区应跟着侧栏让位");
    assert.equal(widened.mainWidth, 1440 - (DEFAULT_WIDTH + 80), "主内容区宽度应相应变窄");

    await dragHandle(page, -40);
    const narrowed = await measure(page);
    assert.equal(narrowed.sidebarWidth, DEFAULT_WIDTH + 40, "往左拖 40 应回到 280");
    assert.equal(narrowed.mainLeft, DEFAULT_WIDTH + 40, "主内容区应跟着回位");
  });
});

test("侧边栏宽度被夹在 200 ~ 480 之间", { timeout: 60000 }, async () => {
  await withPage(browser, app, async ({ page }) => {
    await resetWidth(page);

    await dragHandle(page, -400);
    assert.equal((await measure(page)).sidebarWidth, MIN_WIDTH, "拖到最左应夹在 200");

    await dragHandle(page, 900);
    assert.equal((await measure(page)).sidebarWidth, MAX_WIDTH, "拖到最右应夹在 480");

    // 从 480 往回拖，起点宽度换成 480 再夹紧
    await dragHandle(page, -500);
    assert.equal((await measure(page)).sidebarWidth, MIN_WIDTH, "从最宽往左拖应夹在 200");
  });
});

test("刷新后仍记住上次拖到的宽度", { timeout: 60000 }, async () => {
  await withPage(browser, app, async ({ page }) => {
    await resetWidth(page);
    await dragHandle(page, 60);
    assert.equal((await measure(page)).sidebarWidth, DEFAULT_WIDTH + 60, "拖动后宽度应为 300");

    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector(CHAT_TEXTAREA, { timeout: 10000 });
    await sleep(300);

    const restored = await measure(page);
    assert.equal(restored.sidebarWidth, DEFAULT_WIDTH + 60, "刷新后应恢复上次宽度 300");
    assert.equal(restored.mainLeft, DEFAULT_WIDTH + 60, "主内容区位置应跟着恢复");
  });
});

test("方向键可以微调宽度，双击手柄回到默认宽度", { timeout: 60000 }, async () => {
  await withPage(browser, app, async ({ page }) => {
    await resetWidth(page);

    await page.focus(HANDLE);
    await page.keyboard.press("ArrowRight");
    await sleep(80);
    assert.equal((await measure(page)).sidebarWidth, DEFAULT_WIDTH + 16, "方向键右应加 16");

    await page.keyboard.press("ArrowLeft");
    await sleep(80);
    assert.equal((await measure(page)).sidebarWidth, DEFAULT_WIDTH, "方向键左应减 16");

    // 双击复位：连点两次手柄（间隔小于 320ms、位置几乎不动）
    const handle = await page.$(HANDLE);
    const box = await handle.boundingBox();
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    await page.mouse.click(x, y);
    await page.mouse.click(x, y, { delay: 0 });
    await sleep(150);
    assert.equal((await measure(page)).sidebarWidth, DEFAULT_WIDTH, "双击手柄应回到默认宽度");
  });
});
