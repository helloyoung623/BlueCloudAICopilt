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
  hasVisibleActions,
  hasVisibleButton,
  makeFixtureFiles,
  resolveChrome,
  sendMessage,
  sleep,
  startApp,
  typeVisible,
  waitForIdle,
  waitForPause,
  waitForText,
  waitForActions,
  waitForCalls,
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
// 自动化创建这一轮收到的一段正文
const AUTOMATION_BODY = "已收到，正在创建自动化任务";
// 旧轮次迟到送来的正文：不该出现在会话里
const LATE_OLD_TEXT = "旧轮次迟到的正文";

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
    // 正文还在流，这一轮就属于生成中：暂停入口必须还在，不能变回发送。
    assert.ok(await hasVisibleButton(page, "暂停生成"), "正文流式输出阶段仍应能暂停");
    assert.ok(!(await hasVisibleButton(page, "发送消息")), "正文还在生成，不应出现发送按钮");

    assert.ok(await clickText(page, "新任务"), "生成中应能切到新任务");
    await waitForText(page, "试试这些", 8000);
    const home = await chatText(page);
    assert.ok(!home.includes(CHUNK_1), "新任务不应出现原会话的流式正文");
    assert.ok(!home.includes(STREAM_PROMPT), "新任务不应混入原会话消息");
    // 状态按会话隔离：后台会话还在生成，也不能把它的暂停按钮带到当前会话。
    assert.ok(!(await hasVisibleButton(page, "暂停生成")), "后台会话的暂停按钮不应带到当前会话");
    assert.ok(await hasVisibleButton(page, "发送消息"), "当前会话应照常能发送新消息");

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
    // 切回来后那一轮仍在生成中：暂停入口跟着会话回来。
    assert.ok(await hasVisibleButton(page, "暂停生成"), "切回原会话后仍应能暂停那一轮");

    assert.equal(session.finish(), true, "应能正常收尾这次回答");
    await waitForIdle(page);
    assert.ok(await hasVisibleButton(page, "发送消息"), "正文结束后应恢复发送按钮");
    assert.deepEqual(errors, [], "页面不应有 JS 错误");
  });
});

// 产品现状：暂停入口（以及侧栏「AI 执行中」）覆盖「请求开始 → 正文结束」整段，
// 思考、工具执行、正文流式输出三个阶段都能停。
// 思考阶段停：执行摘要已显示 → 连接关闭 → 后续 chunk 写不进、旧内容不被追加 → 新消息可发送。
test("暂停生成（思考阶段）：连接关闭且显示已停止生成，随后可继续发送", { timeout: 90000 }, async () => {
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
    assert.ok(chat.includes("已停止生成"), "被中断的执行过程应显示「已停止生成」");
    assert.ok(!chat.includes("任务已完成"), "被中断的执行过程不能显示「任务已完成」");
    assert.ok(!chat.includes("（模型未返回内容）"), "暂停不应伪造一条空回答");
    assert.ok(await hasVisibleButton(page, "发送消息"), "暂停后发送按钮应恢复");

    // 收尾后执行过程收进「已停止生成 〉」；展开确认暂停前显示的内容没有被清掉。
    assert.ok(await clickText(page, "已停止生成"), "应能展开已停止的执行过程");
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

// 正文阶段停：已经收到第一段正文才按暂停 → 连接关闭 → 正文保留、后续不再追加 → 可继续发送。
test("暂停生成（正文阶段）：已收到的正文保留、后续不再追加、可以继续发送", { timeout: 90000 }, async () => {
  await withPage(browser, app, async ({ page, mock, errors }) => {
    mock.hold({ summary: RUNNING_SUMMARY, title: "读取未读邮件", tool: RUNNING_TEXT });
    assert.ok(await sendMessage(page, "正文里停一下"));
    const session = await mock.waitForSession();
    await waitForPause(page);

    assert.equal(session.beginAnswer(CHUNK_1), true, "应能显式开始正文");
    await waitForText(page, CHUNK_1, 10000);
    // 正文还在流，这一轮就属于生成中：暂停入口必须还在。
    assert.ok(await hasVisibleButton(page, "暂停生成"), "正文流式输出阶段仍应能暂停");
    assert.ok(!(await hasVisibleButton(page, "发送消息")), "正文还在生成，不应出现发送按钮");

    assert.ok(await clickAria(page, "暂停生成"), "正文阶段应能暂停");
    assert.equal(await session.waitForClientClose(10000), true, "暂停后服务端应看到连接关闭");
    assert.equal(session.open, false, "连接关闭后会话不应还可写");
    assert.equal(session.delta(LATE_CHUNK), false, "连接已关闭，不应再写入");

    await waitForIdle(page);
    await sleep(600);
    const chat = await chatText(page);
    assert.ok(chat.includes(CHUNK_1), "暂停前已收到的正文要保留");
    assert.ok(!chat.includes(LATE_CHUNK), "暂停后不应再有内容追加");
    assert.ok(chat.includes("已停止生成"), "被中断的这一轮应显示「已停止生成」");
    assert.ok(!chat.includes("任务已完成"), "被中断的这一轮不能显示「任务已完成」");
    assert.ok(!chat.includes("（模型未返回内容）"), "暂停不应伪造一条空回答");

    // 暂停后可以继续发新消息，上一轮的内容不会被冲掉。
    mock.normal();
    const before = mock.calls.length;
    assert.ok(await sendMessage(page, "暂停后继续发送"));
    await waitForText(page, "已收到：暂停后继续发送", 10000);
    assert.equal(mock.calls.length, before + 1, "继续发送应新增一次请求");
    const after = await chatText(page);
    assert.ok(after.includes(CHUNK_1), "新一轮不应冲掉上一轮已收到的正文");
    assert.deepEqual(errors, [], "页面不应有 JS 错误");
  });
});

// 正文正常结束：answer.end 一到就恢复发送按钮，不因为推荐追问还在生成就一直是暂停。
test("正文正常结束：answer.end 后恢复发送按钮，不显示已停止生成", { timeout: 90000 }, async () => {
  await withPage(browser, app, async ({ page, mock, errors }) => {
    mock.hold({ summary: RUNNING_SUMMARY, title: "读取未读邮件", tool: RUNNING_TEXT });
    assert.ok(await sendMessage(page, "正常跑完"));
    const session = await mock.waitForSession();
    await waitForPause(page);

    assert.equal(session.beginAnswer(CHUNK_1), true, "应能显式开始正文");
    await waitForText(page, CHUNK_1, 10000);
    assert.ok(await hasVisibleButton(page, "暂停生成"), "正文阶段仍在生成中");

    assert.equal(session.finish(), true, "应能正常收尾这次回答");
    await waitForIdle(page);
    await sleep(400);
    assert.ok(await hasVisibleButton(page, "发送消息"), "正文结束后应恢复发送按钮");
    const chat = await chatText(page);
    assert.ok(chat.includes(CHUNK_1), "完整正文应保留");
    assert.ok(!chat.includes("已停止生成"), "正常结束不应显示已停止生成");
    assert.ok(chat.includes("任务已完成"), "正常结束的执行过程应显示任务已完成");
    assert.deepEqual(errors, [], "页面不应有 JS 错误");
  });
});

// 请求真的失败：走既有的失败提示，不与主动停止混淆。
test("请求失败：按失败处理并保留失败提示，不与主动停止混淆", { timeout: 90000 }, async () => {
  await withPage(browser, app, async ({ page, mock, errors }) => {
    mock.hold({ summary: RUNNING_SUMMARY, title: "读取未读邮件" });
    assert.ok(await sendMessage(page, "这条会失败"));
    const session = await mock.waitForSession();
    await waitForPause(page);

    // 服务端直接掐断连接：客户端应当按「请求失败」处理。
    assert.equal(session.cancel(), true, "应能掐断这次请求");
    await waitForIdle(page);
    await page.waitForFunction(
      () => !!document.querySelector('button[aria-label="发送失败，点击重试"]'),
      { timeout: 8000 },
    );
    const chat = await chatText(page);
    assert.ok(!chat.includes("已停止生成"), "请求失败不是主动停止，不应显示已停止生成");
    assert.ok(await hasVisibleButton(page, "发送消息"), "失败后应恢复发送按钮");
    assert.deepEqual(errors, [], "页面不应有 JS 错误");
  });
});

// 从「新建自动化任务」弹窗发起一轮真实会话：
// 条件以 seed 传给服务端，自动化卡片要等 run.end 兜底生成（正文先到、卡片后到）。
// 这一轮里回答会挂上 automationPending，卡片不到就一直等。
async function startAutomationCreation(page, mock) {
  mock.hold();
  assert.ok(await clickText(page, "自动化任务"), "应能进入自动化任务页");
  assert.ok(await clickText(page, "新建"), "应能打开新建自动化任务弹窗");
  await page.waitForSelector('textarea[placeholder="希望我干什么？"]', { timeout: 8000 });
  await page.type('textarea[placeholder="希望我干什么？"]', `每天早上${TITLE}`);
  assert.ok(await clickText(page, "创建"), "应能提交创建");
  const session = await mock.waitForSession();
  assert.ok(session.body.automationSeed, "弹窗条件应以 seed 传给会话");
  await waitForPause(page);
  return session;
}

// 停止自动化创建：这一轮的卡片不会再兑现，等待标记必须清掉，
// 否则回答永远停在「等卡片」状态，操作项也一直不出现。
// 已经建出来的任务要保留，没建出来的不能伪造成功。
test("停止自动化创建：清掉不会兑现的卡片等待，正文保留、操作项恢复", { timeout: 90000 }, async () => {
  await withPage(browser, app, async ({ page, mock, errors }) => {
    const session = await startAutomationCreation(page, mock);

    // 创建过程中先收到一部分正文
    assert.equal(session.beginAnswer(AUTOMATION_BODY), true, "应能显式开始正文");
    await waitForText(page, AUTOMATION_BODY, 10000);
    // 卡片还没到：回答此刻在等卡片，操作项先不出现
    assert.ok(!(await hasVisibleActions(page)), "卡片还没到时操作项应先压住");

    // 用户在这一轮里点了暂停
    assert.ok(await clickAria(page, "暂停生成"), "创建过程中应能暂停");
    assert.equal(await session.waitForClientClose(10000), true, "暂停后服务端应看到连接关闭");
    assert.equal(session.delta(LATE_CHUNK), false, "连接已关闭，不应再写入");

    await waitForIdle(page);
    await waitForActions(page);
    const chat = await chatText(page);
    assert.ok(chat.includes(AUTOMATION_BODY), "暂停前已收到的正文要保留");
    assert.ok(!chat.includes(LATE_CHUNK), "暂停后不应再有内容追加");
    assert.ok(!chat.includes("任务已完成"), "被中断的这一轮不能显示「任务已完成」");
    // 没建出来的任务不能伪造成功：这一轮只收到了正文，没有工具创建任务。
    assert.equal(
      await page.$$eval("[data-automation-card]", (cards) => cards.length),
      0,
      "没建出来的自动化任务不应出现卡片",
    );
    // 操作项恢复：不能永远停在「等卡片」状态。
    assert.ok(await hasVisibleActions(page), "回答下方的操作项应恢复");
    assert.ok(await hasVisibleButton(page, "发送消息"), "暂停后发送按钮应恢复");
    assert.deepEqual(errors, [], "页面不应有 JS 错误");
  });
});

// 任务已经真的建出来、正文还没开始（answer.start 没到）时停止：
// 这一轮没有正文消息，卡片只在等待缓存里。清缓存时不能把卡片一起丢掉 ——
// 已创建的任务和会话里的卡片都要保留；没有正文就不编造正文。
test("停止自动化创建（任务已建出、正文还没开始）：任务与卡片都保留", { timeout: 90000 }, async () => {
  await withPage(browser, app, async ({ page, mock, errors }) => {
    mock.hold();
    assert.ok(await sendMessage(page, "建一个整理本周竞品动态的任务"));
    const session = await mock.waitForSession();
    await waitForPause(page);

    // 模型真的调了 create_automation 并建出任务，但正文还没开始
    assert.equal(session.createAutomationTask(), true, "应能模拟工具创建成功");
    await waitForText(page, "创建自动化任务", 10000);
    await sleep(400);

    assert.ok(await clickAria(page, "暂停生成"), "创建过程中应能暂停");
    assert.equal(await session.waitForClientClose(10000), true, "暂停后服务端应看到连接关闭");
    await waitForIdle(page);

    // 会话卡片要保留：任务是真的建出来了
    await page.waitForFunction(() => !!document.querySelector("[data-automation-card]"), { timeout: 8000 });
    const card = await page.$eval("[data-automation-card]", (el) => ({
      status: el.dataset.automationStatus,
      title: el.querySelector(".ac-title")?.textContent?.trim() ?? "",
    }));
    assert.ok(
      card.title.includes("整理本周竞品动态"),
      `会话卡片标题应来自建出来的任务，实际=${card.title}`,
    );
    assert.equal(card.status, "已启用", "建出来的任务仍是启用状态");
    // 没有正文就不该出现占位回答：不伪造正文，也不伪造任务成功。
    const chat = await chatText(page);
    assert.ok(!chat.includes("（模型未返回内容）"), "没有正文就不该出现占位回答");
    assert.ok(!chat.includes("任务已完成"), "被中断的这一轮不能显示「任务已完成」");

    // 任务列表里也保留
    assert.ok(await clickText(page, "自动化任务"), "应能进入自动化任务页");
    await waitForText(page, "整理本周竞品动态", 8000);
    assert.deepEqual(errors, [], "页面不应有 JS 错误");
  });
});

// 连接先断了（EOF），但这一轮只写了一半正文：不能当成功，按既有失败处理。
test("非完整 SSE 结束：正文没写完就断开，按失败处理不当成成功", { timeout: 90000 }, async () => {
  await withPage(browser, app, async ({ page, mock, errors }) => {
    mock.hold({ summary: RUNNING_SUMMARY, title: "读取未读邮件" });
    assert.ok(await sendMessage(page, "半截就断"));
    const session = await mock.waitForSession();
    await waitForPause(page);

    assert.equal(session.beginAnswer(CHUNK_1), true, "应能显式开始正文");
    await waitForText(page, CHUNK_1, 10000);

    // 服务端没发 answer.end 就把连接关了
    assert.equal(session.endStream(), true, "应能直接结束连接");
    await waitForIdle(page);
    await waitForText(page, "模型调用失败", 8000);
    await page.waitForFunction(
      () => !!document.querySelector('button[aria-label="发送失败，点击重试"]'),
      { timeout: 8000 },
    );
    const chat = await chatText(page);
    assert.ok(!chat.includes("已停止生成"), "异常结束不是用户主动停止，不应显示已停止生成");
    assert.ok(!chat.includes("任务已完成"), "没写完的回答不能显示任务已完成");
    assert.ok(await hasVisibleButton(page, "发送消息"), "异常结束后应恢复发送按钮");
    assert.deepEqual(errors, [], "页面不应有 JS 错误");
  });
});

// 连接先断了（EOF），但正文已经写完（answer.end 已到）：正文是真的，
// 收尾即可，不当失败，也不能让生成状态停在「生成中」。
// 这一轮用「从弹窗发起创建」来跑：回答本来在等卡片，连接断了就必须收尾，
// 不能永远停在「等卡片」状态。
test("非完整 SSE 结束：正文写完但追问没来，正文保留、不按失败处理", { timeout: 90000 }, async () => {
  await withPage(browser, app, async ({ page, mock, errors }) => {
    const session = await startAutomationCreation(page, mock);

    assert.equal(session.beginAnswer(AUTOMATION_BODY), true, "应能显式开始正文");
    await waitForText(page, AUTOMATION_BODY, 10000);

    // answer.end 到了，推荐追问没来，连接直接关掉
    assert.equal(session.endAfterAnswer(), true, "应能在正文结束后直接关掉连接");
    await waitForIdle(page);
    await waitForActions(page);
    const chat = await chatText(page);
    assert.ok(chat.includes(AUTOMATION_BODY), "已经写完的正文要保留");
    assert.ok(!(await hasVisibleButton(page, "发送失败，点击重试")), "正文完成了就不该按失败处理");
    assert.ok(await hasVisibleActions(page), "回答下方的操作项应恢复，不能一直等卡片");
    assert.equal(
      await page.$$eval("[data-automation-card]", (cards) => cards.length),
      0,
      "没建出来的自动化任务不应出现卡片",
    );
    assert.ok(await hasVisibleButton(page, "发送消息"), "发送按钮应恢复");
    assert.deepEqual(errors, [], "页面不应有 JS 错误");
  });
});

// answer.end 单独到达（run.end 还没来）：发送按钮立刻恢复。
// 此时再次发送，旧轮次迟到的 run.end 不能改到新一轮。
test("answer.end 单独到达：发送按钮立即恢复，旧轮次迟到事件不影响新一轮", { timeout: 90000 }, async () => {
  await withPage(browser, app, async ({ page, mock, errors }) => {
    mock.hold({ summary: RUNNING_SUMMARY, title: "读取未读邮件", tool: RUNNING_TEXT });
    assert.ok(await sendMessage(page, "第一轮只发正文"));
    const session = await mock.waitForSession();
    await waitForPause(page);

    assert.equal(session.beginAnswer(CHUNK_1), true, "应能显式开始正文");
    await waitForText(page, CHUNK_1, 10000);

    // 只发 answer.end，连接保持打开（推荐追问还在服务端生成）
    assert.equal(session.answerEnd(), true, "应能只发 answer.end");
    await waitForIdle(page);
    assert.ok(await hasVisibleButton(page, "发送消息"), "answer.end 后应立即恢复发送按钮");
    assert.ok(!(await hasVisibleButton(page, "暂停生成")), "run.end 还没到，不该继续显示暂停");
    assert.equal(session.open, true, "answer.end 之后连接应保持打开");

    // 此时再次发送：新一轮开始，旧连接还开着
    assert.ok(await sendMessage(page, "第二轮"));
    const second = await waitForCalls(mock, 2);
    assert.notEqual(second.index, session.index, "第二轮应是另一个请求");
    // 上一轮正文已经说完了（answer.end 到了，只是 run.end 没到）：
    // 新的请求必须带上这段 assistant 正文，模型才看得见自己上一轮说了什么。
    const secondCall = mock.calls[1];
    assert.deepEqual(
      secondCall.body.messages.map((m) => m.role),
      ["user", "assistant", "user"],
      "第二轮请求应带上上一轮已完成的 assistant 正文",
    );
    const assistantTurn = secondCall.body.messages.find((m) => m.role === "assistant");
    assert.ok(
      assistantTurn && assistantTurn.content.includes(CHUNK_1),
      `请求里的 assistant 正文应是上一轮的回答，实际=${JSON.stringify(assistantTurn?.content ?? "")}`,
    );
    await waitForPause(page);
    assert.ok(await hasVisibleButton(page, "暂停生成"), "新一轮应在生成中");

    // 旧轮次迟到的事件：服务端这时才把 run.end 送来
    assert.equal(session.open, true, "旧连接此时仍应是打开的");
    assert.equal(session.runEnd({ text: LATE_OLD_TEXT }), true, "旧轮次的迟到 run.end 应能送达");
    await sleep(800);

    const chat = await chatText(page);
    assert.ok(!chat.includes(LATE_OLD_TEXT), "旧轮次迟到的结束事件不能改到新一轮");
    assert.ok(chat.includes(CHUNK_1), "上一轮已收到的正文仍在");
    assert.ok(await hasVisibleButton(page, "暂停生成"), "新一轮仍在生成中，不该被旧轮次的事件带偏");
    assert.ok(!(await hasVisibleButton(page, "发送消息")), "新一轮生成中不该出现发送按钮");
    assert.deepEqual(errors, [], "页面不应有 JS 错误");
  });
});

test("自动化卡片状态同步：卡片暂停后列表同步为已暂停", { timeout: 90000 }, async () => {  await withPage(browser, app, async ({ page, mock, errors }) => {
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
