// 可控 mock 浏览器回归。运行：pnpm test:browser
// 复用本机 Chrome + puppeteer-core；默认自行生产构建并起本地静态服务，
// 也可用 APP_URL=<已启动预览地址> 复用现有预览。全部 /api/chat 由 harness 拦截，
// 不访问真实模型、不改产品代码。只覆盖重构后最容易串台的状态同步链路。
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { rmSync } from "node:fs";
import { dirname } from "node:path";
import puppeteer from "puppeteer-core";
import {
  bodyText,
  clickAria,
  clickSidebarTask,
  clickText,
  makeFixtureFiles,
  resolveChrome,
  sendMessage,
  sleep,
  startApp,
  typeVisible,
  waitForPause,
  waitForText,
  withPage,
} from "./harness.mjs";

const TITLE = "汇总未读邮件";
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

async function createAutomation(page, mock) {
  assert.ok(await clickText(page, "自动化任务"), "应能进入自动化任务页");
  assert.ok(await clickText(page, "新建"), "应能打开新建自动化任务弹窗");
  await page.waitForSelector('textarea[placeholder="希望我干什么？"]', { timeout: 8000 });
  await page.type('textarea[placeholder="希望我干什么？"]', `每天早上${TITLE}`);
  assert.ok(await clickText(page, "创建"), "应能提交创建");
  await page.waitForFunction(() => !!document.querySelector("[data-automation-card]"), { timeout: 15000 });
  await sleep(500);
  assert.ok(mock.calls.length >= 1, "创建走真实会话请求，且被 mock 拦截");
  assert.ok(mock.calls[0].automationSeed, "弹窗条件应以 seed 传给会话");
}

async function openAutomationCardPage(page) {
  assert.ok(await clickText(page, "自动化任务"), "应能进入自动化任务页");
  await waitForText(page, "已暂停", 8000);
}

test("生成中切换会话再返回：消息归属与生成状态不串台", { timeout: 60000 }, async () => {
  await withPage(browser, app.url, async ({ page, mock, errors }) => {
    mock.setMode("hold");
    assert.ok(await sendMessage(page, "慢速生成测试A"));
    await waitForPause(page);
    assert.ok(
      await page.evaluate(() => !!document.querySelector('span[aria-label="AI 执行中"]')),
      "原会话侧栏应显示执行中",
    );

    assert.ok(await clickText(page, "新任务"), "生成中应能切到新任务");
    await waitForText(page, "试试这些", 8000);
    const homeChat = await page.$eval("[data-chat-scroll]", (el) => el.innerText).catch(() => "");
    assert.ok(!homeChat.includes("慢速生成测试A"), "新任务聊天区不应混入上一会话消息");
    assert.ok((await bodyText(page)).includes("慢速生成测试A"), "侧栏仍应保留原任务");

    assert.ok(await clickSidebarTask(page, "慢速生成测试A"), "应能从侧栏切回原任务");
    await page.waitForFunction(
      () => document.querySelector("[data-chat-scroll]")?.innerText.includes("慢速生成测试A"),
      { timeout: 8000 },
    );
    await waitForPause(page);
    assert.equal(mock.calls.length, 1, "切换过程不应重复发起模型请求");
    await clickAria(page, "暂停生成");
    assert.deepEqual(errors, [], "页面不应有 JS 错误");
  });
});

test("暂停生成后可继续发送：新请求带新内容并返回回复", { timeout: 60000 }, async () => {
  await withPage(browser, app.url, async ({ page, mock, errors }) => {
    mock.setMode("hold");
    assert.ok(await sendMessage(page, "先暂停这条"));
    await waitForPause(page);
    assert.ok(await clickAria(page, "暂停生成"), "生成中应出现暂停按钮");
    await page.waitForFunction(
      () => !!document.querySelector('button[aria-label="发送消息"]'),
      { timeout: 8000 },
    );

    mock.setMode("normal");
    const before = mock.calls.length;
    assert.ok(await sendMessage(page, "暂停后继续发送"));
    await waitForText(page, "已收到：暂停后继续发送", 10000);
    assert.equal(mock.calls.length, before + 1, "继续发送应新增一次请求");
    assert.equal(mock.calls.at(-1).userText, "暂停后继续发送", "请求内容应为新消息");
    assert.deepEqual(errors, [], "页面不应有 JS 错误");
  });
});

test("自动化卡片状态同步：卡片暂停后列表同步为已暂停", { timeout: 90000 }, async () => {
  await withPage(browser, app.url, async ({ page, mock, errors }) => {
    await createAutomation(page, mock);
    const card = await page.$eval("[data-automation-card]", (el) => ({
      status: el.dataset.automationStatus,
      title: el.querySelector(".ac-title")?.textContent?.trim() ?? "",
    }));
    assert.equal(card.status, "已启用", "创建后卡片应为已启用");
    assert.ok(card.title.includes(TITLE), "卡片标题应来自弹窗内容");

    const pausedFromCard = await page.evaluate(() => {
      const button = [...document.querySelectorAll("[data-automation-card] button")].find((b) =>
        (b.getAttribute("aria-label") || "").startsWith("暂停"),
      );
      if (!button) return false;
      button.click();
      return true;
    });
    assert.ok(pausedFromCard, "会话内卡片应提供暂停操作");
    await page.waitForFunction(
      () => document.querySelector("[data-automation-card]")?.dataset.automationStatus === "已暂停",
      { timeout: 8000 },
    );
    assert.match(await page.$eval("[data-automation-card] .ac-sub", (el) => el.textContent || ""), /已暂停/);

    await openAutomationCardPage(page);
    assert.ok(await clickText(page, "已暂停"), "应能切到已暂停 Tab");
    await waitForText(page, TITLE, 8000);
    assert.deepEqual(errors, [], "页面不应有 JS 错误");
  });
});

test("自动化删除状态同步：列表删除后会话卡片变为已删除", { timeout: 90000 }, async () => {
  await withPage(browser, app.url, async ({ page, mock, errors }) => {
    await createAutomation(page, mock);
    await openAutomationCardPage(page);

    const openedMore = await page.evaluate((title) => {
      const button = [...document.querySelectorAll("button")].find((b) => {
        const aria = b.getAttribute("aria-label") || "";
        return aria.includes("更多操作") && aria.includes(title);
      });
      if (!button) return false;
      button.click();
      return true;
    }, TITLE);
    assert.ok(openedMore, "列表卡片应提供「更多操作」菜单");
    assert.ok(await clickText(page, "删除"), "菜单中应有删除项");
    await waitForText(page, "确定删除？", 8000);
    assert.ok(await clickText(page, "确定"), "应能确认删除");
    // 侧栏会话行仍保留标题，所以只断言自动化列表里的任务卡片消失。
    await page.waitForFunction(
      (title) =>
        ![...document.querySelectorAll('div[role="button"][aria-pressed]')].some((card) =>
          (card.textContent || "").includes(title),
        ),
      { timeout: 8000 },
      TITLE,
    );

    assert.ok(await clickSidebarTask(page, TITLE), "删除后应能回到创建任务的会话");
    await page.waitForFunction(
      () => document.querySelector("[data-automation-card]")?.dataset.automationStatus === "已删除",
      { timeout: 8000 },
    );
    const deleted = await page.$eval("[data-automation-card]", (el) => ({
      disabled: el.getAttribute("aria-disabled"),
      subtitle: el.querySelector(".ac-sub")?.textContent ?? "",
      buttons: el.querySelectorAll("button").length,
    }));
    assert.equal(deleted.disabled, "true", "已删除卡片不可点击");
    assert.match(deleted.subtitle, /已删除/, "副标题应说明已删除");
    assert.equal(deleted.buttons, 0, "已删除卡片不应再给操作按钮");
    assert.deepEqual(errors, [], "页面不应有 JS 错误");
  });
});

test("项目文件筛选：格式筛选只留匹配行，重置后恢复", { timeout: 90000 }, async () => {
  const fixture = makeFixtureFiles(["report.pdf", "metrics.xlsx", "notes.txt"]);
  try {
    await withPage(browser, app.url, async ({ page, errors }) => {
      assert.ok(await clickText(page, "项目"), "应能进入项目页");
      assert.ok(await clickText(page, "新建项目"), "应能打开新建项目弹窗");
      await page.waitForSelector('input[placeholder="请输入项目名称"]', { timeout: 8000 });
      await page.type('input[placeholder="请输入项目名称"]', "筛选回归项目");
      assert.ok(await clickText(page, "确定"), "应能创建项目");
      await waitForText(page, "筛选回归项目", 8000);

      const opened = await page.evaluate((title) => {
        const card = [...document.querySelectorAll('[role="button"]')].find((n) =>
          (n.textContent || "").includes(title),
        );
        if (!card) return false;
        card.click();
        return true;
      }, "筛选回归项目");
      assert.ok(opened, "应能进入项目详情");
      await page.waitForSelector('[role="tablist"][aria-label="项目内容"]', { timeout: 8000 });
      assert.ok(await clickText(page, "来源"), "应能切到来源 Tab");

      const upload = await page.$('input[aria-label="上传项目来源文件"]');
      assert.ok(upload, "来源页应有上传入口");
      await upload.uploadFile(...fixture.paths);
      // 项目自带演示文件，不能按总数断言；只确认刚上传的三个文件真的进了列表。
      await page.waitForFunction(
        () => ["report.pdf", "metrics.xlsx", "notes.txt"].every((name) => document.body.innerText.includes(name)),
        { timeout: 10000 },
      );
      const baselineRows = await page.$$eval("tr[data-project-file]", (rows) => rows.length);
      assert.ok(baselineRows >= 3, `上传后应至少有三行，实际=${baselineRows}`);

      // 先用名称搜索把演示文件收窄到「项目」相关，再叠加格式筛选，
      // 这样「表格」是否真的筛掉文档可以从行数与文件名上验证，而不是只看控件存在。
      assert.ok(await typeVisible(page, 'input[aria-label="搜索文件名称"]', "项目"), "应能搜索文件名称");
      await page.waitForFunction(() => {
        const rows = [...document.querySelectorAll("tr[data-project-file]")];
        return rows.length > 0 && rows.length < 30 && rows.every((r) => r.innerText.includes("项目"));
      }, { timeout: 8000 });
      const beforeFormat = await page.$$eval("tr[data-project-file]", (rows) => rows.length);

      assert.ok(await clickAria(page, "筛选"), "应能打开筛选面板");
      await page.waitForSelector('[role="dialog"][aria-label="筛选"]', { timeout: 8000 });
      const checked = await page.evaluate(() => {
        const option = [...document.querySelectorAll('[role="dialog"][aria-label="筛选"] button[role="checkbox"]')]
          .find((b) => (b.textContent || "").trim() === "表格");
        if (!option) return false;
        option.click();
        return true;
      });
      assert.ok(checked, "筛选面板应有「表格」选项");

      await page.waitForFunction(
        (expected) => document.querySelectorAll("tr[data-project-file]").length < expected,
        { timeout: 8000 },
        beforeFormat,
      );
      const visible = await page.$$eval("tr[data-project-file]", (rows) => rows.map((r) => r.innerText));
      assert.ok(visible.length > 0, "项目相关文件里应有表格文件");
      assert.ok(
        visible.every((text) => /\.(xlsx|xls|csv)/i.test(text)),
        `表格筛选后只剩表格文件，实际=${JSON.stringify(visible)}`,
      );
      assert.ok(
        await page.evaluate(() => !!document.querySelector(".library-filter-active")),
        "生效的筛选项应在触发按钮上留痕",
      );

      assert.ok(await clickText(page, "重置筛选项"), "应能重置筛选");
      await page.waitForFunction(
        (expected) => document.querySelectorAll("tr[data-project-file]").length === expected,
        { timeout: 8000 },
        beforeFormat,
      );
      assert.ok(await clickAria(page, "清空搜索"), "应能清空名称搜索");
      await page.waitForFunction(
        (expected) => document.querySelectorAll("tr[data-project-file]").length === expected,
        { timeout: 8000 },
        baselineRows,
      );
      assert.deepEqual(errors, [], "页面不应有 JS 错误");
    });
  } finally {
    rmSync(dirname(fixture.paths[0]), { recursive: true, force: true });
  }
});
