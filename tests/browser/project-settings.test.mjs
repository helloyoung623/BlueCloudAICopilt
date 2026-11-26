// 项目设置弹窗（项目指令 / 项目成员）的浏览器回归。运行：pnpm test:browser
//
// 复用既有 harness：本地 Chrome + puppeteer-core、生产构建静态服务、
// 逐页网络隔离与页面错误守卫。不新增依赖，不复制测试基础设施，不改产品代码。
//
// 断言口径（读的是真实字段与选择状态，不是「弹窗还在不在」）：
// - 指令：文本框实际值、字数计数器、配置面板上真正显示的文本；
// - 成员：选择按钮的 aria-pressed、已选人数、每个成员的角色、配置面板上的成员；
// - 成员与角色来自产品内置的 EXAMPLE_MEMBERS 演示数据，这里只验证「选择与角色的
//   编辑/取消/保存语义」，不代表任何真实授权或权限校验。
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import puppeteer from "puppeteer-core";
import { clickText, resolveChrome, startApp, waitForText, withPage } from "./harness.mjs";

const INSTRUCTION_TEXTAREA = 'textarea[aria-label="项目指令"]';
const LIMIT = 1000;
const INSTRUCTION_PLACEHOLDER = "设定项目背景与规范，让 AI 与你高效协作";

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

// ---------------------------------------------------------------------------
// 页面操作helper：全部复用 harness 的 clickText / waitForText，状态等待一律用
// waitForSelector / waitForFunction，不用固定 sleep 顶替。
// ---------------------------------------------------------------------------

async function createProject(page, name) {
  assert.ok(await clickText(page, "项目"), "应能进入项目页");
  await waitForText(page, "新建项目", 8000);
  assert.ok(await clickText(page, "新建项目"), "应能打开新建项目弹窗");
  await page.waitForSelector('input[placeholder="请输入项目名称"]', { timeout: 8000 });
  await page.type('input[placeholder="请输入项目名称"]', name);
  assert.ok(await clickText(page, "确定"), "应能确认新建项目");
  await waitForText(page, name, 8000);
  await page.waitForSelector("#project-configuration", { timeout: 8000 });
}

// 项目列表里打开一个已存在的项目（沿用仓库既有回归的定位方式）。
async function openProject(page, name) {
  const opened = await page.evaluate((title) => {
    const card = [...document.querySelectorAll('[role="button"]')].find((node) =>
      (node.textContent || "").includes(title),
    );
    if (!card) return false;
    card.click();
    return true;
  }, name);
  assert.ok(opened, `应能从项目列表打开「${name}」`);
  await page.waitForSelector("#project-configuration", { timeout: 8000 });
}

// 弹窗内的按钮一律在 [role="dialog"] 里找，避免误点背景里的同名按钮。
async function clickInDialog(page, text) {
  const clicked = await page.evaluate((needle) => {
    const dialog = document.querySelector('[role="dialog"]');
    const button = [...(dialog?.querySelectorAll("button") ?? [])].find(
      (node) => (node.textContent || "").trim() === needle,
    );
    if (!button) return false;
    button.click();
    return true;
  }, text);
  assert.ok(clicked, `弹窗内应有「${text}」按钮`);
  return clicked;
}

const waitDialogClosed = (page) =>
  page.waitForFunction(() => !document.querySelector('[role="dialog"]'), { timeout: 8000 });

async function openInstructionDialog(page) {
  const opened = await page.evaluate(() => {
    const button = [...document.querySelectorAll('button[aria-label="编辑指令"]')].find(
      (node) => node.offsetParent,
    );
    if (!button) return false;
    button.click();
    return true;
  });
  assert.ok(opened, "应能打开「指令」弹窗");
  await page.waitForSelector(INSTRUCTION_TEXTAREA, { timeout: 8000 });
}

async function openMembersDialog(page) {
  const opened = await page.evaluate(() => {
    const button = [...document.querySelectorAll('button[aria-label="添加成员"]')].find(
      (node) => node.offsetParent,
    );
    if (!button) return false;
    button.click();
    return true;
  });
  assert.ok(opened, "应能打开「选择成员」弹窗");
  await page.waitForSelector('[role="dialog"]', { timeout: 8000 });
}

// 指令弹窗的真实状态：文本框值、计数器、确定按钮可用性、maxlength 属性。
async function readInstructionDialog(page) {
  return page.evaluate((selector) => {
    const textarea = document.querySelector(selector);
    const dialog = textarea?.closest('[role="dialog"]');
    const counter = dialog?.querySelector('span[aria-live="polite"]');
    const confirm = [...(dialog?.querySelectorAll("button") ?? [])].find(
      (node) => (node.textContent || "").trim() === "确定",
    );
    return {
      value: textarea?.value ?? null,
      length: textarea?.value?.length ?? -1,
      counter: counter?.textContent?.trim() ?? null,
      confirmDisabled: confirm?.disabled ?? null,
      maxLength: textarea?.getAttribute("maxlength") ?? null,
    };
  }, INSTRUCTION_TEXTAREA);
}

// 配置面板上真正显示的指令文本。
async function readInstructionPanel(page) {
  return page.evaluate(() => {
    const root = document.querySelector("#project-configuration");
    const section = root?.firstElementChild;
    const paragraphs = [...(section?.querySelectorAll("p") ?? [])];
    return {
      visible: !!root?.offsetParent,
      title: paragraphs[0]?.textContent?.trim() ?? null,
      text: paragraphs[1]?.textContent ?? null,
    };
  });
}

// 配置面板上真正显示的成员。
async function readMembersPanel(page) {
  return page.evaluate(() => {
    const root = document.querySelector("#project-configuration");
    const section = root?.children?.[1];
    return {
      visible: !!root?.offsetParent,
      names: [...(section?.querySelectorAll("[title]") ?? [])].map((node) => node.getAttribute("title")),
      text: section?.innerText.replace(/\n+/g, " | ") ?? null,
    };
  });
}

// 成员弹窗的真实选择状态：谁被选中、已选人数、每个已选成员的角色。
async function readMembersDialog(page) {
  return page.evaluate(() => {
    const dialog = document.querySelector('[role="dialog"]');
    const selected = [...(dialog?.querySelectorAll('button[aria-label^="选择"]') ?? [])]
      .filter((node) => node.getAttribute("aria-pressed") === "true")
      .map((node) => node.getAttribute("aria-label"));
    return {
      selected,
      count: [...(dialog?.querySelectorAll("p") ?? [])]
        .map((node) => node.textContent?.trim())
        .find((text) => text?.startsWith("已选")) ?? null,
      roles: [...(dialog?.querySelectorAll('button[aria-haspopup="menu"]') ?? [])].map((node) =>
        node.getAttribute("aria-label"),
      ),
    };
  });
}

async function selectMember(page, name) {
  const clicked = await page.evaluate((memberName) => {
    const button = document.querySelector(`button[aria-label="选择${memberName}"]`);
    if (!button) return false;
    button.click();
    return true;
  }, name);
  assert.ok(clicked, `成员列表里应有「${name}」`);
}

async function removeMember(page, name) {
  const clicked = await page.evaluate((memberName) => {
    const button = document.querySelector(`button[aria-label="移除${memberName}"]`);
    if (!button) return false;
    button.click();
    return true;
  }, name);
  assert.ok(clicked, `已选成员里应有「${name}」的移除按钮`);
}

// 角色菜单被 portal 到 body（不在 dialog 子树里），要单独按 [role="menu"] 找。
async function chooseMemberRole(page, name, role) {
  const opened = await page.evaluate((memberName) => {
    const button = [...document.querySelectorAll("button")].find((node) =>
      (node.getAttribute("aria-label") || "").startsWith(`${memberName}角色：`),
    );
    if (!button) return false;
    button.click();
    return true;
  }, name);
  assert.ok(opened, `已选成员「${name}」应有角色按钮`);
  await page.waitForSelector('[role="menu"] button[role="menuitemradio"]', { timeout: 8000 });
  const chosen = await page.evaluate((roleName) => {
    const item = [...document.querySelectorAll('[role="menu"] button[role="menuitemradio"]')].find(
      (node) => (node.textContent || "").trim() === roleName,
    );
    if (!item) return false;
    item.click();
    return true;
  }, role);
  assert.ok(chosen, `角色菜单里应有「${role}」`);
  await page.waitForFunction(
    (memberName, roleName) => {
      const button = [...document.querySelectorAll("button")].find((node) =>
        (node.getAttribute("aria-label") || "").startsWith(`${memberName}角色：`),
      );
      return button?.getAttribute("aria-label") === `${memberName}角色：${roleName}`;
    },
    { timeout: 8000 },
    name,
    role,
  );
}

// 文本框已有内容时直接 type 会插到光标处（Chrome 聚焦后光标落在开头），
// 所以先清空再输入，把「替换成这段文本」的语义写死。
async function replaceInstructionText(page, text) {
  await page.$eval(INSTRUCTION_TEXTAREA, (element) => {
    element.focus();
    element.setSelectionRange(0, element.value.length);
  });
  await page.keyboard.press("Backspace");
  await page.type(INSTRUCTION_TEXTAREA, text);
}

// 清空草稿后一次性插入 text。
//
// 关于「粘贴」：无头 Chrome 不会从系统剪贴板执行真实粘贴（Meta+V 与
// document.execCommand('paste') 都实测无效），所以这里用 CDP 的原生文本插入命令
// 走粘贴最终落到渲染进程的那条路径 —— 同样受 textarea 的 maxlength 截断。
// 另外单独断言 maxlength 属性本身，确认超限是被原生属性挡住的。
async function replaceInstructionDraft(page, text) {
  await page.$eval(INSTRUCTION_TEXTAREA, (element) => {
    element.focus();
    element.setSelectionRange(0, element.value.length);
  });
  await page.keyboard.press("Backspace");
  const client = await page.createCDPSession();
  try {
    await client.send("Input.insertText", { text });
  } finally {
    await client.detach();
  }
}

// ---------------------------------------------------------------------------

test("项目指令：确认保存后重新打开能看到保存值", { timeout: 90000 }, async () => {
  await withPage(browser, app, async ({ page, errors }) => {
    await createProject(page, "指令保存回归");

    await openInstructionDialog(page);
    const initial = await readInstructionDialog(page);
    assert.equal(initial.value, "", "新项目的指令初值应为空");
    assert.equal(initial.counter, `0/${LIMIT}`, "计数器应显示 0/1000");
    assert.equal(initial.confirmDisabled, true, "内容没变时「确定」应禁用");

    await replaceInstructionText(page, "第一版指令");
    const edited = await readInstructionDialog(page);
    assert.equal(edited.value, "第一版指令", "文本框应拿到输入的原文");
    assert.equal(edited.counter, `5/${LIMIT}`, "计数器应跟着输入走");
    assert.equal(edited.confirmDisabled, false, "改动内容后「确定」应可点击");

    assert.ok(await clickInDialog(page, "确定"), "应能确认保存指令");
    await waitDialogClosed(page);

    // 面板上的指令必须真的换成保存后的值。
    await page.waitForFunction(
      (expected) =>
        document.querySelector("#project-configuration")?.firstElementChild?.querySelectorAll("p")[1]
          ?.textContent === expected,
      { timeout: 8000 },
      "第一版指令",
    );
    const panel = await readInstructionPanel(page);
    assert.equal(panel.text, "第一版指令", "配置面板应显示保存后的指令");

    // 重新打开弹窗，必须看得到保存值。
    await openInstructionDialog(page);
    const reopened = await readInstructionDialog(page);
    assert.equal(reopened.value, "第一版指令", "重新打开应看到已保存的指令");
    assert.equal(reopened.counter, `5/${LIMIT}`, "计数器应基于已保存值");
    assert.equal(reopened.confirmDisabled, true, "与已保存值一致时「确定」应禁用");

    // 保存时会对首尾空白做 trim，这里把这条语义也钉住。
    await replaceInstructionText(page, "  第二版指令  ");
    assert.ok(await clickInDialog(page, "确定"), "应能二次确认保存");
    await waitDialogClosed(page);
    await openInstructionDialog(page);
    const trimmed = await readInstructionDialog(page);
    assert.equal(trimmed.value, "第二版指令", "保存时应去掉首尾空白");
    assert.deepEqual(errors, [], "页面不应有 JS 错误");
  });
});

test("放弃草稿：取消 / 关闭按钮 / Esc / 点遮罩关闭后，重新打开仍是原值", { timeout: 90000 }, async () => {
  await withPage(browser, app, async ({ page, errors }) => {
    await createProject(page, "草稿放弃回归");

    // 先存一个基线值，用来证明「放弃草稿」是回到已存值，而不是回到空。
    await openInstructionDialog(page);
    await replaceInstructionText(page, "基线指令");
    assert.ok(await clickInDialog(page, "确定"), "应能保存基线指令");
    await waitDialogClosed(page);
    const closeWays = [
      {
        name: "取消按钮",
        run: () => clickInDialog(page, "取消"),
      },
      {
        name: "右上角关闭按钮",
        run: () =>
          page.evaluate(() => {
            const button = document.querySelector('button[aria-label="关闭指令弹窗"]');
            if (!button) return false;
            button.click();
            return true;
          }),
      },
      {
        name: "Esc 键",
        run: async () => {
          await page.keyboard.press("Escape");
          return true;
        },
      },
      {
        name: "点击遮罩",
        run: async () => {
          await page.mouse.click(6, 6);
          return true;
        },
      },
    ];

    for (const way of closeWays) {
      await openInstructionDialog(page);
      const before = await readInstructionDialog(page);
      assert.equal(before.value, "基线指令", `${way.name}：打开时应是已存值`);

      await replaceInstructionText(page, "这段草稿不该被保存");
      const draft = await readInstructionDialog(page);
      assert.equal(draft.value, "这段草稿不该被保存", `${way.name}：草稿应已写入文本框`);
      assert.equal(draft.confirmDisabled, false, `${way.name}：有草稿时「确定」应可点击`);

      await way.run();
      await waitDialogClosed(page);

      // 重新打开必须还是原值：草稿既没保存，也没残留到下一次打开。
      await openInstructionDialog(page);
      const after = await readInstructionDialog(page);
      assert.equal(after.value, "基线指令", `${way.name}：重新打开应仍是原值`);
      assert.equal(after.counter, `4/${LIMIT}`, `${way.name}：计数器应基于原值`);
      assert.equal(after.confirmDisabled, true, `${way.name}：原值下「确定」应禁用`);
    }

    // 面板上也不能出现任何草稿文本。
    const panel = await readInstructionPanel(page);
    assert.equal(panel.text, "基线指令", "配置面板应只显示已保存值");
    assert.deepEqual(errors, [], "页面不应有 JS 错误");
  });
});

test("字数限制：1000 字符上限，超量内容（含批量粘贴）不能保存", { timeout: 90000 }, async () => {
  await withPage(browser, app, async ({ page, errors }) => {
    await createProject(page, "字数限制回归");
    await openInstructionDialog(page);

    // 上限由 textarea 的原生 maxlength 属性挡住。
    const initial = await readInstructionDialog(page);
    assert.equal(initial.maxLength, String(LIMIT), "文本框应带 maxlength=1000");

    // 超量粘贴：输入远长于上限，落地必须被截断到上限。
    const overlong = "粘".repeat(2000);
    await replaceInstructionDraft(page, overlong);
    const pasted = await readInstructionDialog(page);
    assert.equal(pasted.length, LIMIT, "超量内容应被截断到 1000 字符");
    assert.equal(pasted.value, overlong.slice(0, LIMIT), "截断后应保留前 1000 个字符");
    assert.equal(pasted.counter, `${LIMIT}/${LIMIT}`, "计数器应显示 1000/1000");

    // 超量内容不能被保存成超限值：存的是被截断后的那一份。
    assert.ok(await clickInDialog(page, "确定"), "应能保存被截断的内容");
    await waitDialogClosed(page);
    await page.waitForFunction(
      (expectedLength) =>
        document.querySelector("#project-configuration")?.firstElementChild?.querySelectorAll("p")[1]
          ?.textContent?.length === expectedLength,
      { timeout: 8000 },
      LIMIT,
    );
    const panel = await readInstructionPanel(page);
    assert.equal(panel.text.length, LIMIT, "保存后的指令不应超过 1000 字符");
    assert.equal(panel.text, overlong.slice(0, LIMIT), "保存的应是截断后的内容");

    await openInstructionDialog(page);
    const reopened = await readInstructionDialog(page);
    assert.equal(reopened.length, LIMIT, "重新打开仍是 1000 字符");
    assert.notEqual(reopened.value, overlong, "超限部分不应被保存下来");

    // 逐字输入同样受限。
    await replaceInstructionText(page, "字".repeat(1200));
    const typed = await readInstructionDialog(page);
    assert.equal(typed.length, LIMIT, "逐字输入超过 1000 也应被截断");
    assert.equal(typed.counter, `${LIMIT}/${LIMIT}`, "计数器应显示 1000/1000");

    // 计数规则：计数器用的是 JS 字符串长度（UTF-16 码元），emoji 占 2 个码元；
    // 达到上限时 maxlength 不会把代理对劈开，而是整块丢弃。
    await replaceInstructionDraft(page, "");
    await replaceInstructionDraft(page, "a".repeat(998) + "😀");
    const exact = await readInstructionDialog(page);
    assert.equal(exact.length, LIMIT, "998 个 ASCII + 1 个 emoji 正好占满 1000 个码元");
    assert.equal(exact.counter, `${LIMIT}/${LIMIT}`, "满额时计数器应显示 1000/1000");

    await replaceInstructionDraft(page, "a".repeat(999) + "😀");
    const overflow = await readInstructionDialog(page);
    assert.equal(overflow.length, 999, "第 1001 个码元放不下 emoji 时应整块丢弃，不劈开代理对");
    assert.equal(overflow.counter, `999/${LIMIT}`, "计数器应显示 999/1000");

    assert.deepEqual(errors, [], "页面不应有 JS 错误");
  });
});

test("项目成员：确认后保留选择与角色，取消后恢复原选择", { timeout: 90000 }, async () => {
  await withPage(browser, app, async ({ page, errors }) => {
    await createProject(page, "成员设置回归");

    await openMembersDialog(page);
    const empty = await readMembersDialog(page);
    assert.equal(empty.count, "已选：0个", "初始应没有选中任何成员");
    assert.deepEqual(empty.selected, [], "初始不应有被选中的成员");

    await selectMember(page, "吴那");
    await selectMember(page, "钱桂英");
    await page.waitForFunction(
      () =>
        [...document.querySelectorAll('[role="dialog"] button[aria-label^="选择"]')].filter(
          (node) => node.getAttribute("aria-pressed") === "true",
        ).length === 2,
      { timeout: 8000 },
    );
    const picked = await readMembersDialog(page);
    assert.equal(picked.count, "已选：2个", "应显示已选 2 人");
    assert.deepEqual(picked.selected.sort(), ["选择吴那", "选择钱桂英"], "两个成员都应处于选中态");

    await chooseMemberRole(page, "吴那", "管理员");
    const withRole = await readMembersDialog(page);
    assert.deepEqual(
      withRole.roles.sort(),
      ["吴那角色：管理员", "钱桂英角色：使用者"],
      "角色应挂在各自成员上",
    );

    assert.ok(await clickInDialog(page, "确定"), "应能确认保存成员");
    await waitDialogClosed(page);

    // 配置面板上要真的出现这两个成员。
    await page.waitForFunction(
      (expected) =>
        [...(document.querySelector("#project-configuration")?.children?.[1]?.querySelectorAll("[title]") ??
          [])].map((node) => node.getAttribute("title"))?.join(",") === expected,
      { timeout: 8000 },
      "吴那,钱桂英",
    );
    const panel = await readMembersPanel(page);
    assert.deepEqual(panel.names, ["吴那", "钱桂英"], "配置面板应显示已保存的成员");

    // 重新打开：选择与角色都要还在。
    await openMembersDialog(page);
    const reopened = await readMembersDialog(page);
    assert.equal(reopened.count, "已选：2个", "重新打开应仍是 2 人");
    assert.deepEqual(reopened.selected.sort(), ["选择吴那", "选择钱桂英"], "重新打开应仍是原来两人");
    assert.deepEqual(
      reopened.roles.sort(),
      ["吴那角色：管理员", "钱桂英角色：使用者"],
      "重新打开应保留已保存的角色",
    );

    // 改一版再取消：必须回到已保存的那一版。
    await removeMember(page, "钱桂英");
    await selectMember(page, "赵玉芝");
    await page.waitForFunction(
      () =>
        [...document.querySelectorAll('[role="dialog"] button[aria-label^="选择"]')].filter(
          (node) => node.getAttribute("aria-pressed") === "true",
        ).length === 2,
      { timeout: 8000 },
    );
    const changed = await readMembersDialog(page);
    assert.deepEqual(changed.selected.sort(), ["选择吴那", "选择赵玉芝"], "改后的选择应生效");

    assert.ok(await clickInDialog(page, "取消"), "应能取消成员修改");
    await waitDialogClosed(page);

    await openMembersDialog(page);
    const restored = await readMembersDialog(page);
    assert.equal(restored.count, "已选：2个", "取消后应回到已保存的人数");
    assert.deepEqual(restored.selected.sort(), ["选择吴那", "选择钱桂英"], "取消后应恢复原选择");
    assert.deepEqual(
      restored.roles.sort(),
      ["吴那角色：管理员", "钱桂英角色：使用者"],
      "取消后应恢复原角色",
    );

    const panelAfter = await readMembersPanel(page);
    assert.deepEqual(panelAfter.names, ["吴那", "钱桂英"], "取消不应改动配置面板上的成员");
    assert.deepEqual(errors, [], "页面不应有 JS 错误");
  });
});

test("项目隔离：A 的指令、成员与未保存草稿都不会串到 B", { timeout: 90000 }, async () => {
  await withPage(browser, app, async ({ page, errors }) => {
    await createProject(page, "隔离甲");

    // A：存指令
    await openInstructionDialog(page);
    await replaceInstructionText(page, "甲项目的指令");
    assert.ok(await clickInDialog(page, "确定"), "应能在甲项目保存指令");
    await waitDialogClosed(page);

    // A：存成员
    await openMembersDialog(page);
    await selectMember(page, "吴那");
    await page.waitForFunction(
      () =>
        [...document.querySelectorAll('[role="dialog"] button[aria-label^="选择"]')].filter(
          (node) => node.getAttribute("aria-pressed") === "true",
        ).length === 1,
      { timeout: 8000 },
    );
    assert.ok(await clickInDialog(page, "确定"), "应能在甲项目保存成员");
    await waitDialogClosed(page);

    // A：留一个未保存的草稿再放弃
    await openInstructionDialog(page);
    await replaceInstructionText(page, "甲项目的未保存草稿");
    assert.ok(await clickInDialog(page, "取消"), "应能放弃甲项目的草稿");
    await waitDialogClosed(page);

    const aPanel = await readInstructionPanel(page);
    assert.equal(aPanel.text, "甲项目的指令", "甲项目应只保留已保存的指令");

    // 切到 B
    assert.ok(await clickText(page, "项目"), "应能回到项目列表");
    await waitForText(page, "新建项目", 8000);
    assert.ok(await clickText(page, "新建项目"), "应能打开新建项目弹窗");
    await page.waitForSelector('input[placeholder="请输入项目名称"]', { timeout: 8000 });
    await page.type('input[placeholder="请输入项目名称"]', "隔离乙");
    assert.ok(await clickText(page, "确定"), "应能创建乙项目");
    await waitForText(page, "隔离乙", 8000);
    await page.waitForSelector("#project-configuration", { timeout: 8000 });

    // B 不该继承甲的任何东西。
    const bInstruction = await readInstructionPanel(page);
    assert.equal(bInstruction.text, INSTRUCTION_PLACEHOLDER, "乙项目不应继承甲的指令");
    const bMembers = await readMembersPanel(page);
    assert.deepEqual(bMembers.names, [], "乙项目不应继承甲的成员");
    assert.match(bMembers.text ?? "", /协作者/, "乙项目应显示默认的协作者占位");

    await openInstructionDialog(page);
    const bDialog = await readInstructionDialog(page);
    assert.equal(bDialog.value, "", "乙项目的指令弹窗应是空的");
    assert.equal(bDialog.counter, `0/${LIMIT}`, "乙项目的计数器应从 0 开始");
    assert.ok(await clickInDialog(page, "取消"), "应能关闭乙项目的指令弹窗");
    await waitDialogClosed(page);

    await openMembersDialog(page);
    const bMembersDialog = await readMembersDialog(page);
    assert.equal(bMembersDialog.count, "已选：0个", "乙项目不应继承甲的成员选择");
    assert.deepEqual(bMembersDialog.selected, [], "乙项目成员弹窗里不应有被选中的成员");
    assert.ok(await clickInDialog(page, "取消"), "应能关闭乙项目的成员弹窗");
    await waitDialogClosed(page);

    // 乙项目自己写草稿再取消，同样不该留下痕迹。
    await openInstructionDialog(page);
    await replaceInstructionText(page, "乙项目的草稿");
    assert.ok(await clickInDialog(page, "取消"), "应能放弃乙项目的草稿");
    await waitDialogClosed(page);
    const bAfterDraft = await readInstructionPanel(page);
    assert.equal(bAfterDraft.text, INSTRUCTION_PLACEHOLDER, "乙项目放弃草稿后面板应保持原样");

    // 回到甲：甲的设置仍在，且没有被乙的草稿污染。
    assert.ok(await clickText(page, "项目"), "应能回到项目列表");
    await waitForText(page, "隔离甲", 8000);
    await openProject(page, "隔离甲");
    const backInstruction = await readInstructionPanel(page);
    assert.equal(backInstruction.text, "甲项目的指令", "甲项目的指令应保持不变");
    const backMembers = await readMembersPanel(page);
    assert.deepEqual(backMembers.names, ["吴那"], "甲项目的成员应保持不变");

    await openInstructionDialog(page);
    const backDialog = await readInstructionDialog(page);
    assert.equal(backDialog.value, "甲项目的指令", "甲项目重新打开应仍是已保存的指令");
    assert.notEqual(backDialog.value, "甲项目的未保存草稿", "甲项目不应残留未保存的草稿");
    assert.ok(await clickInDialog(page, "取消"), "应能关闭甲项目的指令弹窗");
    await waitDialogClosed(page);

    assert.deepEqual(errors, [], "页面不应有 JS 错误");
  });
});
