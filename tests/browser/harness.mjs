// 浏览器回归公共设施：本地 Chrome + puppeteer-core + 本地可控 SSE mock 服务。
//
// 为什么不用 page.setRequestInterception + req.respond(ReadableStream)：
// Puppeteer 的 respond() 只接受 string/Buffer，塞 ReadableStream 属于非法参数，
// 「先发一半再挂住」的 hold 语义根本不会生效。这里改成真正的本地 HTTP 服务：
// /api/chat 由 res.write 分批下发 SSE，测试拿到 session 句柄后可以显式追加 chunk、
// 收尾或取消，全程不出网、不访问真实模型。
import { createServer } from "node:http";
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

export const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
export const CHAT_TEXTAREA = 'textarea[placeholder="有问题，尽管问；/调用技能"]';
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
};

const SSE_HEADERS = {
  "Content-Type": "text/event-stream; charset=utf-8",
  "Cache-Control": "no-cache, no-transform",
  Connection: "keep-alive",
  "X-Accel-Buffering": "no",
};

const sseFrame = (event, data) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;

export function resolveChrome() {
  const candidates = [
    process.env.CHROME_PATH,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ];
  const found = candidates.find((candidate) => candidate && existsSync(candidate));
  if (!found) throw new Error("找不到 Chrome：请设置 CHROME_PATH 指向本机 Chrome 可执行文件");
  return found;
}

// ---------------------------------------------------------------------------
// 可控 SSE mock：每个页面一份，互不影响；所有异常都进 errors，由 withPage 断言为空。
// ---------------------------------------------------------------------------
function createMockApi() {
  const mock = {
    mode: "normal",
    holdOptions: {},
    calls: [],
    sessions: [],
    errors: [],
  };
  const pendingWaiters = [];

  mock.recordError = (message) => {
    mock.errors.push(message);
  };

  // 下一个请求：先进入「执行过程」阶段并保持连接，正文由测试显式开始。
  // options.summary 会随 plan.summary 先下发，用户能看到一条真实的执行摘要。
  mock.hold = (options = {}) => {
    mock.mode = "hold";
    mock.holdOptions = options;
  };
  // 之后的请求：一次性流完（和真实服务端的短回答一致）。
  mock.normal = () => {
    mock.mode = "normal";
  };

  mock.waitForSession = (timeout = 10000) =>
    new Promise((done, fail) => {
      const open = mock.sessions.filter((session) => session.open);
      if (open.length) {
        done(open.at(-1));
        return;
      }
      const timer = setTimeout(() => {
        const index = pendingWaiters.indexOf(waiter);
        if (index !== -1) pendingWaiters.splice(index, 1);
        fail(new Error("等待 hold 会话超时：没有请求被挂住"));
      }, timeout);
      function waiter(session) {
        clearTimeout(timer);
        done(session);
      }
      pendingWaiters.push(waiter);
    });

  mock.handleChat = (req, res) => {
    if (req.method !== "POST") {
      mock.recordError(`/api/chat 收到非 POST 请求：${req.method}`);
      res.writeHead(405, { "Content-Type": "application/json" }).end("{}");
      return;
    }
    let raw = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => {
      raw += chunk;
    });
    req.on("error", (error) => mock.recordError(`读取 /api/chat 请求体失败：${error.message}`));
    req.on("end", () => {
      let body;
      try {
        body = JSON.parse(raw || "{}");
      } catch (error) {
        mock.recordError(`/api/chat 请求体不是合法 JSON：${error.message}`);
        res.writeHead(400, { "Content-Type": "application/json" }).end("{}");
        return;
      }
      const userText = (body.messages ?? []).filter((m) => m.role === "user").at(-1)?.content ?? "";
      const call = {
        index: mock.calls.length + 1,
        userText,
        body,
        automationSeed: body.automationSeed ?? null,
        at: Date.now(),
      };
      mock.calls.push(call);

      const session = createSession({ res, call, mock });
      mock.sessions.push(session);
      if (mock.mode === "hold") {
        session.startHold(mock.holdOptions);
        pendingWaiters.splice(0).forEach((waiter) => waiter(session));
      } else {
        session.startNormal();
      }
    });
  };

  return mock;
}

function createSession({ res, call, mock }) {
  const listeners = [];
  let resolveClosed;
  const closed = new Promise((done) => {
    resolveClosed = done;
  });

  const session = {
    index: call.index,
    userText: call.userText,
    body: call.body,
    sentText: "",
    answerStarted: false,
    clientClosed: false,
    finished: false,
    closed,
  };

  Object.defineProperty(session, "open", {
    get: () => !session.finished && !session.clientClosed,
  });

  const flush = (raw) => {
    if (!session.open) return false;
    res.write(raw);
    return true;
  };

  session.write = flush;

  session.delta = (text) => {
    if (!session.open) return false;
    // answer.start 之前的 delta 会被前端直接丢弃，写成这样一定是用例顺序错了。
    if (!session.answerStarted) throw new Error("正文还没开始：message.delta 会被前端忽略");
    session.sentText += text;
    res.write(sseFrame("message.delta", { text }));
    return true;
  };

  // 由测试显式把回答从「执行过程」推进到正文，并给出第一段正文。
  session.beginAnswer = (text) => {
    if (!session.open) return false;
    if (session.answerStarted) throw new Error("正文已经开始，不能重复 beginAnswer");
    session.answerStarted = true;
    res.write(sseFrame("answer.start", {}));
    return text ? session.delta(text) : true;
  };

  // 正常收尾：补齐 answer.end / run.end，正文取本连接累计下发的全部内容。
  session.finish = () => {
    if (!session.open) return false;
    res.write(sseFrame("answer.end", {}));
    res.write(
      sseFrame("run.end", {
        text: session.sentText,
        plainText: session.sentText,
        followUps: [],
      }),
    );
    session.finished = true;
    res.end();
    return true;
  };

  // 由测试主动掐断（模拟服务端异常/超时），不再往浏览器写任何东西。
  session.cancel = () => {
    if (!session.open) return false;
    session.finished = true;
    res.destroy();
    return true;
  };

  session.startNormal = () => {
    res.writeHead(200, SSE_HEADERS);
    const echo = `已收到：${String(call.userText).slice(0, 30)}`;
    session.sentText = echo;
    session.answerStarted = true;
    res.write(sseFrame("run.start", { runId: call.index }));
    res.write(sseFrame("answer.start", {}));
    res.write(sseFrame("message.delta", { text: echo }));
    res.write(sseFrame("answer.end", {}));
    res.write(sseFrame("run.end", { text: echo, plainText: echo, followUps: [] }));
    session.finished = true;
    res.end();
  };

  // 挂住：只进入「执行过程」阶段（此时产品才提供暂停入口），正文留给测试推进。
  // tool 会先记一条工具调用：执行过程因此能一路留到正文阶段，
  // 「这一轮被停掉时显示已停止生成」才有东西可断言。
  session.startHold = ({ summary, title, tool } = {}) => {
    res.writeHead(200, SSE_HEADERS);
    res.write(sseFrame("run.start", { runId: call.index }));
    if (summary) {
      res.write(
        sseFrame("plan.summary", {
          text: summary,
          ...(title ? { title } : {}),
          round: 0,
        }),
      );
    }
    if (tool) {
      res.write(
        sseFrame("tool.call", {
          callId: `call-${call.index}`,
          name: "read_mail",
          label: tool,
          icon: "react-read",
          running: `正在${tool}`,
          round: 0,
        }),
      );
    }
  };

  session.waitForClientClose = (timeout = 10000) => {
    if (session.clientClosed) return Promise.resolve(true);
    return new Promise((done, fail) => {
      const timer = setTimeout(() => {
        fail(new Error("等待连接关闭超时：前端可能没有真正中断这次请求"));
      }, timeout);
      listeners.push(() => {
        clearTimeout(timer);
        done(session.clientClosed);
      });
    });
  };

  res.on("close", () => {
    // 已经由我们收尾的连接属于正常关闭；没写完就关，才是前端取消/页面关闭。
    if (!session.finished) session.clientClosed = true;
    resolveClosed();
    listeners.splice(0).forEach((fn) => fn());
  });

  res.on("error", (error) => {
    // 明确预期的收尾：正常结束，或前端主动取消（暂停/离开/关页面）后再无写入。
    if (session.finished || session.clientClosed) return;
    mock.recordError(`/api/chat 响应异常（第 ${call.index} 个请求）：${error.message}`);
  });

  return session;
}

// ---------------------------------------------------------------------------
// 静态站点 + /api/chat 同源服务：这样前端 fetch("/api/chat") 直接命中 mock，
// 不需要再拦截这个请求，也不会碰到真实模型。
// ---------------------------------------------------------------------------
export async function startApp() {
  const outDir = mkdtempSync(join(tmpdir(), "bluecloud-browser-"));
  try {
    const build = spawnSync(
      process.platform === "win32" ? "pnpm.cmd" : "pnpm",
      ["exec", "vite", "build", "--config", "vite.figma.config.ts", "--outDir", outDir, "--emptyOutDir"],
      { cwd: repoRoot, encoding: "utf8" },
    );
    if (build.error || build.status !== 0) {
      throw new Error(`生产构建失败：${build.error?.message ?? (build.stderr || "").slice(-1200)}`);
    }
  } catch (error) {
    rmSync(outDir, { recursive: true, force: true });
    throw error;
  }

  const hub = { mock: null };

  const server = createServer((req, res) => {
    let pathname;
    try {
      pathname = decodeURIComponent(new URL(req.url || "/", "http://127.0.0.1").pathname);
    } catch (error) {
      res.writeHead(400).end();
      hub.mock?.recordError(`无法解析请求路径：${req.url}（${error.message}）`);
      return;
    }

    if (pathname === "/api/chat") {
      if (!hub.mock) {
        res.writeHead(503, { "Content-Type": "application/json" }).end('{"error":"mock 未就绪"}');
        return;
      }
      hub.mock.handleChat(req, res);
      return;
    }
    // 其余接口本回归不覆盖，明确返回 404（前端对这些调用有本地回退），不算异常。
    if (pathname.startsWith("/api/")) {
      res.writeHead(404, { "Content-Type": "application/json" }).end("{}");
      return;
    }
    // 浏览器会自己请求 favicon，产品也没提供，明确返回 204 而不是记成资源缺失。
    if (pathname === "/favicon.ico") {
      res.writeHead(204).end();
      return;
    }
    serveStatic({ outDir, pathname, res, mock: hub.mock });
  });

  await new Promise((done) => server.listen(0, "127.0.0.1", done));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("静态服务未拿到端口");

  return {
    url: `http://127.0.0.1:${address.port}/`,
    // 每个页面一份 mock，避免上一个用例的 calls/errors 串到下一个用例。
    mockForPage() {
      hub.mock = createMockApi();
      return hub.mock;
    },
    async close() {
      hub.mock = null;
      await new Promise((done) => server.close(done));
      rmSync(outDir, { recursive: true, force: true });
    },
  };
}

function serveStatic({ outDir, pathname, res, mock }) {
  if (pathname === "/") {
    sendFile({ outDir, res, mock, filePath: join(outDir, "index.html") });
    return;
  }
  const requested = resolve(outDir, `.${pathname}`);
  if (!requested.startsWith(outDir + sep)) {
    mock?.recordError(`请求越出构建目录：${pathname}`);
    res.writeHead(403).end();
    return;
  }
  let isDirectory = false;
  try {
    isDirectory = statSync(requested).isDirectory();
  } catch {
    isDirectory = false;
  }
  if (isDirectory) {
    sendFile({ outDir, res, mock, filePath: join(requested, "index.html") });
    return;
  }
  if (!extname(pathname)) {
    // 前端路由路径统一回退到 index.html
    sendFile({ outDir, res, mock, filePath: join(outDir, "index.html") });
    return;
  }
  sendFile({ outDir, res, mock, filePath: requested });
}

function sendFile({ outDir, res, mock, filePath }) {
  let body;
  try {
    body = readFileSync(filePath);
  } catch {
    if (extname(filePath) === ".html") {
      mock?.recordError(`构建产物缺失：${filePath}`);
      res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" }).end("build output missing");
      return;
    }
    // 带扩展名却读不到，说明静态资源真的缺了，必须让测试失败而不是静默 404。
    mock?.recordError(`静态资源缺失：${filePath.slice(outDir.length)}`);
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }).end("not found");
    return;
  }
  res.writeHead(200, {
    "Content-Type": MIME[extname(filePath)] ?? "application/octet-stream",
    "Cache-Control": "no-store",
  });
  res.end(body);
}

// 拦截只做一件事：确认请求没出网。回归全程必须离线，任何外部请求都记错并掐断。
async function attachGuard(page, mock) {
  await page.setRequestInterception(true);
  page.on("request", (request) => {
    if (request.isInterceptResolutionHandled()) return;
    let host = "";
    try {
      host = new URL(request.url()).hostname;
    } catch {
      host = "";
    }
    if (host !== "127.0.0.1" && host !== "localhost") {
      mock.recordError(`出现外部网络请求（回归要求全程离线）：${request.url()}`);
      request.abort("blockedbyclient").catch(() => {});
      return;
    }
    request.continue().catch((error) => {
      // 页面关闭时未完成的请求会在这里失败，这是唯一允许忽略的收尾场景。
      if (page.isClosed()) return;
      mock.recordError(`放行本地请求失败：${request.url()}（${error.message}）`);
    });
  });
}

export async function withPage(browser, app, fn) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  const mock = app.mockForPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  await attachGuard(page, mock);

  let result;
  let failure = null;
  try {
    await page.goto(app.url, { waitUntil: "domcontentloaded" });
    await page.waitForSelector(CHAT_TEXTAREA, { timeout: 10000 });
    await sleep(500);
    result = await fn({ page, mock, errors });
  } catch (error) {
    failure = error;
  }

  await page.close().catch(() => {});

  if (failure) {
    if (mock.errors.length) {
      failure.message += `\n\nmock / 拦截记录到的异常：\n- ${mock.errors.join("\n- ")}`;
    }
    throw failure;
  }
  // mock 与拦截异常一律算失败，不允许默默吞掉。
  if (mock.errors.length) {
    throw new Error(`mock / 拦截记录到异常：\n- ${mock.errors.join("\n- ")}`);
  }
  return result;
}

export const bodyText = (page) => page.evaluate(() => document.body.innerText.replace(/\n+/g, " | "));
export const chatText = (page) =>
  page.$eval("[data-chat-scroll]", (el) => el.innerText).catch(() => "");
export const waitForText = (page, text, timeout = 10000) =>
  page.waitForFunction((needle) => document.body.innerText.includes(needle), { timeout }, text);

export async function clickText(page, text, retries = 8) {
  for (let i = 0; i < retries; i += 1) {
    const hit = await page.evaluate((needle) => {
      const nodes = [...document.querySelectorAll("button,[role=button]")];
      const exact = nodes.find((n) => (n.textContent || "").trim() === needle);
      const loose = nodes.find((n) => (n.textContent || "").includes(needle));
      const el = exact || loose;
      if (el) {
        el.click();
        return true;
      }
      return false;
    }, text);
    if (hit) {
      await sleep(400);
      return true;
    }
    await sleep(250);
  }
  return false;
}

export const clickAria = (page, aria) =>
  page.evaluate((needle) => {
    const matches = [...document.querySelectorAll("button")].filter(
      (n) => n.getAttribute("aria-label") === needle,
    );
    const el = matches.find((n) => !!n.offsetParent) || matches[0];
    if (!el) return false;
    el.click();
    return true;
  }, aria);

// 窄屏/宽屏各渲染一份同名输入框，只给真正可见的那份输入。
export async function typeVisible(page, selector, text) {
  const handles = await page.$$(selector);
  for (const handle of handles) {
    if (await handle.evaluate((el) => !!el.offsetParent && el.getBoundingClientRect().width > 0)) {
      await handle.click();
      await page.keyboard.type(text);
      return true;
    }
  }
  return false;
}

export async function waitForPause(page, timeout = 8000) {
  await page.waitForFunction(
    () => [...document.querySelectorAll("button")].some((b) => b.getAttribute("aria-label") === "暂停生成"),
    { timeout },
  );
}

// 可见的「暂停生成」/「发送消息」按钮。
// 生成中只有暂停入口，正文结束后才恢复发送：这两个断言用来区分这两种状态，
// 只看按钮是否存在会被隐藏的同名按钮骗过去，所以额外要求 offsetParent（可见）。
export const hasVisibleButton = (page, aria) =>
  page.evaluate(
    (label) =>
      [...document.querySelectorAll("button")].some(
        (b) => b.getAttribute("aria-label") === label && !!b.offsetParent,
      ),
    aria,
  );

export async function waitForIdle(page, timeout = 8000) {
  await page.waitForFunction(
    () => ![...document.querySelectorAll("button")].some((b) => b.getAttribute("aria-label") === "暂停生成"),
    { timeout },
  );
}

export async function sendMessage(page, text) {
  await page.waitForSelector(CHAT_TEXTAREA, { timeout: 10000 });
  await page.click(CHAT_TEXTAREA);
  await page.keyboard.type(text);
  return clickAria(page, "发送消息");
}

export async function clickSidebarTask(page, title) {
  return page.evaluate((needle) => {
    const leaf = [...document.querySelectorAll("*")].find(
      (node) => node.children.length === 0 && (node.textContent || "").trim() === needle,
    );
    if (!leaf) return false;
    (leaf.closest('[role="button"]') || leaf).click();
    return true;
  }, title);
}

// 在可控临时目录里造几个真实文件，供「上传 → 筛选 → 看结果」链路使用。
export function makeFixtureFiles(names) {
  const dir = mkdtempSync(join(tmpdir(), "bluecloud-files-"));
  const paths = names.map((name) => {
    const path = join(dir, name);
    writeFileSync(path, `fixture ${basename(name)}`);
    return path;
  });
  return { dir, paths };
}
