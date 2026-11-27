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

// 弹层、对话区（.chat-layout）、左侧导航与两个控件的位置。
// rect 看彼此的边界关系，hitIsSelf 看那个点上最上层是不是它自己（= 真的点得到）。
async function panelState(page, title, closeLabel) {
  return page.evaluate(({ title, closeLabel }) => {
    const panel = [...document.querySelectorAll("div.fixed")].find((el) => el.textContent.includes(title));
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
    const box = (el) => {
      if (!el) return null;
      const rect = el.getBoundingClientRect();
      return { left: Math.round(rect.left), right: Math.round(rect.right), width: Math.round(rect.width) };
    };
    const handle = document.querySelector('[role="separator"][aria-label="调整侧边栏宽度"]');
    return {
      viewportWidth: window.innerWidth,
      // 对话区 = 侧栏右边那块主内容区
      chat: box(document.querySelector(".chat-layout")),
      sidebar: box(handle ? handle.parentElement : null),
      panel: box(panel),
      close: describe(panel.querySelector(`[aria-label="${closeLabel}"]`)),
      confirm: describe([...panel.querySelectorAll("button")].find((b) => b.textContent.trim() === "确认")),
    };
  }, { title, closeLabel });
}

const requirementState = (page) => panelState(page, "确认制作需求", "关闭需求确认");
const outlineState = (page) => panelState(page, "PPT大纲", "关闭大纲");

// 弹层必须整体落在对话区里：不越过左侧导航，右边缘不超出对话区
function assertInsideChat(state, label) {
  assert.ok(state, `${label}：弹层应存在`);
  assert.ok(
    state.panel.left >= state.chat.left - 1,
    `${label}：弹层左边缘 ${state.panel.left} 不应越过对话区左边缘 ${state.chat.left}`,
  );
  assert.ok(
    state.panel.right <= state.chat.right + 1,
    `${label}：弹层右边缘 ${state.panel.right} 不应超出对话区右边缘 ${state.chat.right}`,
  );
  if (state.sidebar) {
    assert.ok(
      state.panel.left >= state.sidebar.right - 1,
      `${label}：弹层左边缘 ${state.panel.left} 不应盖住左侧导航（右边缘 ${state.sidebar.right}）`,
    );
  }
  assert.ok(
    state.close && state.close.left >= state.chat.left - 1 && state.close.right <= state.chat.right + 1,
    `${label}：关闭按钮应在对话区内`,
  );
  assert.ok(state.close?.hitIsSelf, `${label}：关闭按钮那个点上最上层应是它自己（点得到）`);
  assert.ok(
    state.confirm && state.confirm.left >= state.chat.left - 1 && state.confirm.right <= state.chat.right + 1,
    `${label}：确认按钮应在对话区内`,
  );
  assert.ok(state.confirm?.hitIsSelf, `${label}：确认按钮那个点上最上层应是它自己（点得到）`);
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

test("侧栏拖宽、窗口 1024 时，PPT 需求确认弹层整体落在对话区内，宽度随对话区收缩", { timeout: 120000 }, async () => {
  await withPage(browser, app, async ({ page }) => {
    await setupNarrowWindowWithWideSidebar(page);
    await openRequirementPanel(page);

    const state = await requirementState(page);
    assertInsideChat(state, "侧栏 480");

    // 对话区 = 1024 - 480 = 544；弹层宽度应等于对话区宽度减两侧留白（32），而不是撑满 800
    assert.equal(state.chat.left, 480, "对话区左边缘应贴着侧栏右边");
    assert.equal(state.chat.right, 1024, "对话区右边缘应是窗口右边缘");
    assert.equal(state.panel.width, state.chat.width - 32, "弹层宽度应随对话区收缩");
    assert.ok(state.panel.width < 800, "对话区变窄后弹层不应还占 800");
  });
});

test("侧栏收起后，PPT 需求确认弹层回到对话区中央且不越界", { timeout: 120000 }, async () => {
  await withPage(browser, app, async ({ page }) => {
    await setupNarrowWindowWithWideSidebar(page);
    await openRequirementPanel(page);

    // 收起左侧导航：对话区变成整个窗口
    await page.click('[aria-label="收起侧边栏"]');
    await sleep(400);

    const state = await requirementState(page);
    assertInsideChat(state, "侧栏收起");
    assert.equal(state.chat.left, 0, "侧栏收起后对话区应从窗口最左边开始");
    assert.equal(state.panel.width, 800, "对话区够宽时弹层回到 800");
    const panelCenter = Math.round((state.panel.left + state.panel.right) / 2);
    const chatCenter = Math.round((state.chat.left + state.chat.right) / 2);
    assert.equal(panelCenter, chatCenter, "弹层应居中在对话区里");
  });
});

test("窗口尺寸变化后，PPT 需求确认弹层跟着对话区收缩", { timeout: 120000 }, async () => {
  await withPage(browser, app, async ({ page }) => {
    await setupNarrowWindowWithWideSidebar(page);
    await openRequirementPanel(page);

    await page.setViewport({ width: 800, height: 700, deviceScaleFactor: 1 });
    await sleep(400);

    const state = await requirementState(page);
    assertInsideChat(state, "窗口缩到 800");
    assert.equal(state.chat.width, 320, "对话区应被压到最小宽度 320");
    assert.equal(state.panel.width, 288, "弹层宽度应跟着对话区收缩到 288");
  });
});

test("侧栏拖宽、窗口 1024 时，PPT 大纲弹层同样落在对话区内", { timeout: 180000 }, async () => {
  await withPage(browser, app, async ({ page }) => {
    await setupNarrowWindowWithWideSidebar(page);
    await openRequirementPanel(page);

    // 确认需求 → 演示链路 24 秒后出大纲弹层
    await page.evaluate(() => {
      const panel = [...document.querySelectorAll("div.fixed")].find((el) => el.textContent.includes("确认制作需求"));
      [...panel.querySelectorAll("button")].find((b) => b.textContent.trim() === "确认").click();
    });
    await page.waitForFunction(() => document.body.innerText.includes("PPT大纲"), { timeout: 60000 });
    await sleep(600);

    const state = await outlineState(page);
    assertInsideChat(state, "大纲弹层");
    assert.equal(state.panel.width, state.chat.width - 32, "大纲弹层宽度应随对话区收缩");
  });
});

test("PPT 需求确认弹层：底栏不再有模式下拉框，四组选项宽度一致", { timeout: 120000 }, async () => {
  await withPage(browser, app, async ({ page }) => {
    await setupNarrowWindowWithWideSidebar(page);
    await openRequirementPanel(page);

    const detail = await page.evaluate(() => {
      const panel = [...document.querySelectorAll("div.fixed")].find((el) => el.textContent.includes("确认制作需求"));
      const labels = ["视觉风格", "演示场景（可多选）", "受众对象（可多选）", "页数"];
      const groups = labels.map((label) => {
        const labelEl = [...panel.querySelectorAll("span")].find((s) => s.textContent.trim() === label);
        const grid = labelEl.parentElement.querySelector(".grid");
        return {
          label,
          columns: getComputedStyle(grid).gridTemplateColumns.split(" ").length,
          widths: [...grid.children].map((c) => Math.round(c.getBoundingClientRect().width)),
        };
      });
      return {
        groups,
        // 底栏（下边框上方那一行）里还有没有下拉按钮
        footerHasMenu: [...panel.querySelectorAll('[aria-haspopup="menu"]')].length > 0,
        footerText: panel.innerText,
      };
    });

    assert.equal(detail.footerHasMenu, false, "弹层里不应再有下拉按钮");
    assert.ok(!detail.footerText.includes("PowerPoint"), "底栏不应再出现 PPT 模式选项");

    // 四组选项用同一套栅格 → 每个选项框宽度一致（不能一排三个一排两个）
    const widths = detail.groups.flatMap((g) => g.widths);
    assert.ok(widths.length >= 12, "应能取到四组选项的宽度");
    assert.equal(new Set(widths).size, 1, `四组选项宽度应一致，实际是 ${JSON.stringify(detail.groups)}`);
    const columns = new Set(detail.groups.map((g) => g.columns));
    assert.equal(columns.size, 1, `四组选项列数应一致，实际是 ${JSON.stringify(detail.groups.map((g) => g.columns))}`);
  });
});

test("侧栏拖宽、窗口 1024 时，PPT 需求确认弹层的关闭按钮能真正关掉弹层", { timeout: 120000 }, async () => {
  await withPage(browser, app, async ({ page }) => {
    await setupNarrowWindowWithWideSidebar(page);
    await openRequirementPanel(page);

    await page.click('[aria-label="关闭需求确认"]');
    await page.waitForFunction(() => !document.body.innerText.includes("确认制作需求"), { timeout: 8000 });
    assert.equal(await requirementState(page), null, "点关闭后弹层应消失");
  });
});

test("侧栏拖宽、窗口 1024 时，PPT 需求确认弹层的确认按钮能真正推进流程", { timeout: 120000 }, async () => {
  await withPage(browser, app, async ({ page }) => {
    await setupNarrowWindowWithWideSidebar(page);
    await openRequirementPanel(page);

    const state = await requirementState(page);
    assert.ok(state?.confirm, "弹层里应有确认按钮");
    await page.evaluate(() => {
      const panel = [...document.querySelectorAll("div.fixed")].find((el) => el.textContent.includes("确认制作需求"));
      const button = [...panel.querySelectorAll("button")].find((b) => b.textContent.trim() === "确认");
      button.click();
    });
    await page.waitForFunction(() => !document.body.innerText.includes("确认制作需求"), { timeout: 8000 });
    assert.equal(await requirementState(page), null, "点确认后需求确认弹层应消失");
  });
});
