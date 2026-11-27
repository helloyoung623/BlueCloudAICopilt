// 侧边栏拖拽调宽的浏览器回归。运行：pnpm test:browser
// 复用 harness 的本机 Chrome + 本地静态服务；全程离线、不访问真实模型、不改产品代码。
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import puppeteer from "puppeteer-core";
import { CHAT_TEXTAREA, resolveChrome, sendMessage, sleep, startApp, withPage } from "./harness.mjs";

const HANDLE = '[role="separator"][aria-label="调整侧边栏宽度"]';
const STORAGE_KEY = "sidebar-width";
const DEFAULT_WIDTH = 240;
const MIN_WIDTH = 200;
const MAX_WIDTH = 480;
// 复现验收场景：窗口 1024、侧栏拖到 480 时，PPT 需求确认弹层的关闭按钮会跑到屏幕外
const NARROW_VIEWPORT = { width: 1024, height: 768 };

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

// 窗口 1024 + 侧栏 480：验收里出问题的那个组合
async function setupNarrowWindowWithWideSidebar(page) {
  await page.setViewport({ ...NARROW_VIEWPORT, deviceScaleFactor: 1 });
  await page.evaluate((key) => window.localStorage.setItem(key, "480"), STORAGE_KEY);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector(CHAT_TEXTAREA, { timeout: 10000 });
  await sleep(300);
  const width = await page.$eval(HANDLE, (el) => Math.round(el.parentElement.getBoundingClientRect().width));
  assert.equal(width, 480, "侧栏宽度应被记成 480");
}

// 走产品自带的演示链路（正文提到 PPT → 本地脚本 → 约 15 秒后弹出需求确认）
async function openRequirementPanel(page) {
  await sendMessage(page, "帮我生成一份PPT");
  await page.waitForFunction(() => document.body.innerText.includes("确认制作需求"), { timeout: 45000 });
  await sleep(600); // 等弹层入场动画结束
}

// 弹层与两个控件的位置：rect 看是否在窗口内，hitIsSelf 看那个点上最上层是不是它自己（= 真的点得到）
async function requirementPanelState(page) {
  return page.evaluate(() => {
    const panel = [...document.querySelectorAll("div.fixed")].find((el) => el.textContent.includes("确认制作需求"));
    if (!panel) return null;
    const describe = (el) => {
      if (!el) return null;
      const rect = el.getBoundingClientRect();
      const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
      return {
        left: Math.round(rect.left),
        right: Math.round(rect.right),
        hitIsSelf: hit === el || el.contains(hit),
      };
    };
    const rect = panel.getBoundingClientRect();
    return {
      viewportWidth: window.innerWidth,
      panel: { left: Math.round(rect.left), right: Math.round(rect.right) },
      close: describe(panel.querySelector('[aria-label="关闭需求确认"]')),
      confirm: describe([...panel.querySelectorAll("button")].find((b) => b.textContent.trim() === "确认")),
    };
  });
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

    // 先把宽度调到非 240，再双击复位：
    // 直接在 240 上双击的话，「双击后是 240」这条断言什么都没验到。
    await dragHandle(page, 60);
    assert.equal((await measure(page)).sidebarWidth, DEFAULT_WIDTH + 60, "拖动后宽度应为 300");

    // 双击复位：两下连点（间隔 < 320ms、位置几乎不动）。
    // 先等一下，让上一次按下（拖动那一下）的时间戳过期，免得被误判成双击。
    await sleep(400);
    const handle = await page.$(HANDLE);
    const box = await handle.boundingBox();
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    await page.mouse.click(x, y);
    await page.mouse.click(x, y);
    await sleep(200);
    assert.equal((await measure(page)).sidebarWidth, DEFAULT_WIDTH, "双击手柄应回到默认宽度 240");
  });
});

test("侧栏拖宽、窗口 1024 时，PPT 需求确认弹层的关闭与确认按钮都还在屏幕内且点得到", { timeout: 120000 }, async () => {
  await withPage(browser, app, async ({ page }) => {
    await setupNarrowWindowWithWideSidebar(page);
    await openRequirementPanel(page);

    const state = await requirementPanelState(page);
    assert.ok(state, "需求确认弹层应已弹出");
    assert.ok(
      state.panel.right <= state.viewportWidth,
      `弹层右边缘 ${state.panel.right} 应在窗口 ${state.viewportWidth} 内`,
    );
    assert.ok(state.close, "弹层里应有关闭按钮");
    assert.ok(
      state.close.right <= state.viewportWidth,
      `关闭按钮右边缘 ${state.close.right} 应在窗口 ${state.viewportWidth} 内`,
    );
    assert.ok(state.close.hitIsSelf, "关闭按钮那个点上最上层应是它自己（点得到）");
    assert.ok(state.confirm, "弹层里应有确认按钮");
    assert.ok(
      state.confirm.right <= state.viewportWidth,
      `确认按钮右边缘 ${state.confirm.right} 应在窗口 ${state.viewportWidth} 内`,
    );
    assert.ok(state.confirm.hitIsSelf, "确认按钮那个点上最上层应是它自己（点得到）");
  });
});

test("侧栏拖宽、窗口 1024 时，PPT 需求确认弹层的关闭按钮能真正关掉弹层", { timeout: 120000 }, async () => {
  await withPage(browser, app, async ({ page }) => {
    await setupNarrowWindowWithWideSidebar(page);
    await openRequirementPanel(page);

    await page.click('[aria-label="关闭需求确认"]');
    await page.waitForFunction(() => !document.body.innerText.includes("确认制作需求"), { timeout: 8000 });
    assert.equal(await requirementPanelState(page), null, "点关闭后弹层应消失");
  });
});

test("侧栏拖宽、窗口 1024 时，PPT 需求确认弹层的确认按钮能真正推进流程", { timeout: 120000 }, async () => {
  await withPage(browser, app, async ({ page }) => {
    await setupNarrowWindowWithWideSidebar(page);
    await openRequirementPanel(page);

    const state = await requirementPanelState(page);
    assert.ok(state?.confirm, "弹层里应有确认按钮");
    await page.evaluate(() => {
      const panel = [...document.querySelectorAll("div.fixed")].find((el) => el.textContent.includes("确认制作需求"));
      const button = [...panel.querySelectorAll("button")].find((b) => b.textContent.trim() === "确认");
      button.click();
    });
    await page.waitForFunction(() => !document.body.innerText.includes("确认制作需求"), { timeout: 8000 });
    assert.equal(await requirementPanelState(page), null, "点确认后需求确认弹层应消失");
  });
});
