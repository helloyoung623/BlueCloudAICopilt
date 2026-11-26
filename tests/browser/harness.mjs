// 浏览器回归公共设施：本地 Chrome + puppeteer-core + 可控 SSE mock。
// 不访问真实模型：所有 /api/chat 都由这里拦截并按固定帧返回。
import { createServer } from "node:http";
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, extname, join, resolve } from "node:path";
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

// 优先复用已启动的预览（APP_URL）；否则生产构建到唯一临时目录并起静态服务。
// 只在 finally 清理本次自己创建的临时目录，不碰项目 dist 或其他文件。
export async function startApp() {
  if (process.env.APP_URL) return { url: process.env.APP_URL, close: async () => {} };

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

  const server = createServer(async (req, res) => {
    const pathname = decodeURIComponent(new URL(req.url || "/", "http://127.0.0.1").pathname);
    let filePath = resolve(outDir, `.${pathname}`);
    if (!filePath.startsWith(outDir)) {
      res.writeHead(403).end();
      return;
    }
    try {
      if (statSync(filePath).isDirectory()) filePath = join(filePath, "index.html");
    } catch {
      filePath = join(outDir, "index.html"); // SPA 回退
    }
    try {
      const body = readFileSync(filePath);
      res.writeHead(200, { "Content-Type": MIME[extname(filePath)] ?? "application/octet-stream" });
      res.end(body);
    } catch {
      res.writeHead(404).end();
    }
  });
  await new Promise((done) => server.listen(0, "127.0.0.1", done));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("静态服务未拿到端口");
  return {
    url: `http://127.0.0.1:${address.port}/`,
    close: async () => {
      await new Promise((done) => server.close(done));
      rmSync(outDir, { recursive: true, force: true });
    },
  };
}

const frame = (event, data) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;

// 拦截页面所有请求：/api/chat 走可控帧，其他 /api 直接短路，外部网络一律 abort。
export async function attachMock(page) {
  const state = { mode: "normal", calls: [], lastBody: null };
  await page.setRequestInterception(true);
  page.on("request", async (req) => {
    const url = req.url();
    try {
      if (url.includes("/api/chat")) {
        if (req.method() !== "POST") {
          await req.respond({ status: 405, contentType: "application/json", body: "{}" });
          return;
        }
        let body = {};
        try {
          body = JSON.parse(req.postData() || "{}");
        } catch {
          body = {};
        }
        state.lastBody = body;
        const userText = (body.messages ?? []).filter((m) => m.role === "user").at(-1)?.content ?? "";
        state.calls.push({ at: Date.now(), userText, automationSeed: body.automationSeed ?? null });
        const runId = state.calls.length;
        const echo = String(userText).slice(0, 30);
        const full =
          frame("run.start", { runId }) +
          frame("answer.start", {}) +
          frame("message.delta", { text: `已收到：${echo}` }) +
          frame("answer.end", {}) +
          frame("run.end", { text: `已收到：${echo}`, plainText: `已收到：${echo}`, followUps: [] });
        if (state.mode === "hold") {
          // 只吐前半段并保持连接不关闭，用来制造真实的「生成中」窗口。
          const encoder = new TextEncoder();
          const stream = new ReadableStream({
            async start(controller) {
              controller.enqueue(encoder.encode(frame("run.start", { runId }) + frame("answer.start", {})));
              await sleep(400);
              controller.enqueue(encoder.encode(frame("message.delta", { text: `正在处理：${echo}` })));
              // 故意不 close：前端暂停/切走时会取消这个流。
            },
            cancel() {},
          });
          await req.respond({
            status: 200,
            contentType: "text/event-stream",
            headers: { "Cache-Control": "no-cache" },
            body: stream,
          });
        } else {
          await req.respond({
            status: 200,
            contentType: "text/event-stream",
            headers: { "Cache-Control": "no-cache" },
            body: full,
          });
        }
        return;
      }
      if (url.includes("/api/")) {
        await req.respond({ status: 404, contentType: "application/json", body: "{}" });
        return;
      }
      if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?\//.test(url)) {
        await req.abort();
        return;
      }
      await req.continue();
    } catch {
      try {
        await req.abort();
      } catch {
        // 页面已关闭，忽略
      }
    }
  });
  state.setMode = (mode) => {
    state.mode = mode;
  };
  return state;
}

export async function withPage(browser, url, fn) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  const errors = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  const mock = await attachMock(page);
  try {
    await page.goto(url, { waitUntil: "domcontentloaded" });
    await page.waitForSelector(CHAT_TEXTAREA, { timeout: 10000 });
    await sleep(500);
    return await fn({ page, mock, errors });
  } finally {
    await page.close();
  }
}

export const bodyText = (page) => page.evaluate(() => document.body.innerText.replace(/\n+/g, " | "));
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
