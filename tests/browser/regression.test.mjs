// 可控 mock 浏览器回归。运行：pnpm test:browser
// 复用本机 Chrome + puppeteer-core；默认自行生产构建并起本地静态服务，
// 同时由同一服务提供 /api/chat 的可控 SSE（res.write 分批下发），
// 全程离线、不访问真实模型、不改产品代码。
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { rmSync } from "node:fs";
import { dirname } from "node:path";
import puppeteer from "puppeteer-core";
import {
  chatText,
  clickAria,
  clickSidebarTask,
  clickText,
  makeFixtureFiles,
  resolveChrome,
  sendMessage,
  sleep,
  startApp,
  typeVisible,
  waitForIdle,
  waitForPause,
  waitForText,
  withPage,
} from "./harness.mjs";

const TITLE = "汇总未读邮件";
const STREAM_PROMPT = "慢速生成测试A";
const CHUNK_1 = "第一段：已读取 3 封未读邮件";
const CHUNK_2 = "第二段：正在汇总要点";
const RUNNING_TEXT = "读取邮箱里的未读邮件";
// 执行过程结束（含暂停）后，界面会把「正在…」改写成「已…」，断言用不受前缀影响的片段。
const RUNNING_SUMMARY = `正在${RUNNING_TEXT}`;
const LATE_CHUNK = "暂停后不应出现的追加内容";

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
  assert.ok(mock.calls.length >= 1, "创建走真实会话请求，且被 mock 接管");
  assert.ok(mock.calls[0].automationSeed, "弹窗条件应以 seed 传给会话");
}

async function openAutomationCardPage(page) {
  assert.ok(await clickText(page, "自动化任务"), "应能进入自动化任务页");
  await waitForText(page, "已暂停", 8000);
}

test("生成中切换会话再返回：流式内容落在原会话，新会话不串台也不重复请求", { timeout: 90000 }, async () => {
  await withPage(browser, app, async ({ page, mock, errors }) => {
    mock.hold();
    assert.ok(await sendMessage(page, STREAM_PROMPT));
    const session = await mock.waitForSession();

    // 执行过程阶段：侧栏「AI 执行中」与暂停入口同时存在
    await waitForPause(page);
    assert.ok(
      await page.evaluate(() => !!document.querySelector('span[aria-label="AI 执行中"]')),
      "原会话侧栏应显示执行中",
    );

    // 切换前：第一段正文必须真的渲染出来，而不是只在连接里
    assert.equal(session.beginAnswer(CHUNK_1), true, "应能显式开始正文");
    await waitForText(page, CHUNK_1, 10000);

    assert.ok(await clickText(page, "新任务"), "生成中应能切到新任务");
    await waitForText(page, "试试这些", 8000);
    const home = await chatText(page);
    assert.ok(!home.includes(CHUNK_1), "新任务不应出现原会话的流式正文");
    assert.ok(!home.includes(STREAM_PROMPT), "新任务不应混入原会话消息");

    // 切走期间由测试显式下发第二段：连接仍在，内容只能回到原会话。
    assert.equal(session.delta(CHUNK_2), true, "切走后连接应仍可继续下发");
    await sleep(600);
    const stillHome = await chatText(page);
    assert.ok(!stillHome.includes(CHUNK_2), "第二段不应串到当前正在看的新任务");

    assert.ok(await clickSidebarTask(page, STREAM_PROMPT), "应能从侧栏切回原会话");
    await waitForText(page, CHUNK_2, 10000);
    const chat = await chatText(page);
    assert.ok(
      chat.includes(CHUNK_1) && chat.includes(CHUNK_2),
      `两段内容都应落在原会话，实际=${JSON.stringify(chat.slice(0, 240))}`,
    );
    assert.ok(!chat.includes("已收到："), "原会话不应混入其他请求的回答");
    assert.equal(mock.calls.length, 1, "切换会话不应重复发起请求");

    assert.equal(session.finish(), true, "应能正常收尾这次回答");
    await waitForIdle(page);
    assert.deepEqual(errors, [], "页面不应有 JS 错误");
  });
});

// 产品现状：暂停入口（以及侧栏「AI 执行中」）只在「执行过程」阶段存在，
// answer.start 一到，思考块就收起、按钮变回发送。所以暂停用例在真实可暂停的窗口内断言：
// 执行摘要已显示 → 连接关闭 → 后续 chunk 写不进、旧内容不被追加 → 新消息可发送。
test("暂停生成：先看到部分输出，暂停后连接关闭且不再追加，随后可继续发送", { timeout: 90000 }, async () => {
  await withPage(browser, app, async ({ page, mock, errors }) => {
    mock.hold({ summary: RUNNING_SUMMARY, title: "读取未读邮件" });
    assert.ok(await sendMessage(page, "先暂停这条"));
    const session = await mock.waitForSession();
    await waitForPause(page);

    // 暂停前：确认页面上已经出现这一段执行输出，而不是空转。
    await waitForText(page, RUNNING_SUMMARY, 10000);

    assert.ok(await clickAria(page, "暂停生成"), "执行过程中应能暂停");
    assert.equal(await session.waitForClientClose(10000), true, "暂停后服务端应看到连接关闭");
    assert.equal(session.open, false, "连接关闭后会话不应还可写");

    // 连接已关闭：后续 chunk 必须写不进去，而不是悄悄丢给浏览器。
    assert.equal(session.delta(LATE_CHUNK), false, "连接已关闭，不应再写入");

    await waitForIdle(page);
    await sleep(600);
    const chat = await chatText(page);
    assert.ok(!chat.includes(LATE_CHUNK), "暂停后不应再有内容追加到这段输出");
    assert.ok(chat.includes("任务已完成"), "暂停后执行过程应正常收尾，而不是停在半途");
    assert.ok(!chat.includes("（模型未返回内容）"), "暂停不应伪造一条空回答");

    // 产品收尾后会把过程收进「任务已完成 〉」；展开确认暂停前显示的内容没有被清掉。
    assert.ok(await clickText(page, "任务已完成"), "应能展开已收尾的执行过程");
    await waitForText(page, RUNNING_TEXT, 8000);
    assert.ok(!(await chatText(page)).includes(LATE_CHUNK), "展开后也不应出现暂停后的追加内容");
    assert.equal(mock.calls.length, 1, "暂停本身不应触发重试请求");

    mock.normal();
    const before = mock.calls.length;
    assert.ok(await sendMessage(page, "暂停后继续发送"));
    await waitForText(page, "已收到：暂停后继续发送", 10000);
    assert.equal(mock.calls.length, before + 1, "继续发送应新增一次请求");
    assert.equal(mock.calls.at(-1).userText, "暂停后继续发送", "请求内容应为新消息");
    assert.deepEqual(errors, [], "页面不应有 JS 错误");
  });
});

test("自动化卡片状态同步：卡片暂停后列表同步为已暂停", { timeout: 90000 }, async () => {
  await withPage(browser, app, async ({ page, mock, errors }) => {
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
  await withPage(browser, app, async ({ page, mock, errors }) => {
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

test("测试守卫：出现外部请求会被判为失败，不会静默放过", { timeout: 60000 }, async () => {
  // 反向自检：这段用例故意让页面访问外网，断言 withPage 必须因此报错。
  // 它保证「mock / 拦截异常导致测试失败」不是一句口号，而是真的会红。
  await assert.rejects(
    withPage(browser, app, async ({ page }) => {
      await page.evaluate(() => fetch("https://example.com/offline-guard").catch(() => "blocked"));
      await sleep(500);
    }),
    /外部网络请求/,
  );
});

test("项目文件筛选：格式筛选只留匹配行，重置后恢复", { timeout: 90000 }, async () => {
  const fixture = makeFixtureFiles(["report.pdf", "metrics.xlsx", "notes.txt"]);
  try {
    await withPage(browser, app, async ({ page, errors }) => {
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
