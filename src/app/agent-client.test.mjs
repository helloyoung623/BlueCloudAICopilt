import assert from "node:assert/strict";
import { test } from "node:test";
import { streamChat } from "./agent-client.ts";

const frames = [
  'event: run.start\ndata: {"runId":1}\n\n',
  'event: message.delta\ndata: {"text":"你好"}\n\n',
  'event: run.end\ndata: {"text":"你好","followUps":[]}\n\n',
].join("");

function fakeResponse(chunks) {
  const encoder = new TextEncoder();
  return {
    ok: true,
    status: 200,
    body: new ReadableStream({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
        controller.close();
      },
    }),
  };
}

test("streamChat sends only declared fields and forwards a normal event stream", async t => {
  const originalFetch = globalThis.fetch;
  let request;
  globalThis.fetch = async (url, init) => {
    request = { url, init };
    return fakeResponse([frames]);
  };
  t.after(() => { globalThis.fetch = originalFetch; });

  const events = [];
  const controller = new AbortController();
  await streamChat({
    messages: [{ role: "user", content: "你好" }],
    runId: 1,
    signal: controller.signal,
    automationRun: true,
    automationSeed: { title: "汇总", goal: "汇总邮件", cycle: "每天", time: "09:00", weekdays: [], monthDays: [] },
    onEvent: event => events.push(event),
  });

  assert.equal(request.url, "/api/chat");
  assert.equal(request.init.method, "POST");
  assert.equal(request.init.signal, controller.signal);
  const body = JSON.parse(request.init.body);
  assert.deepEqual(body.messages, [{ role: "user", content: "你好" }]);
  assert.equal(body.runId, 1);
  assert.equal(body.automationRun, true);
  assert.equal(body.automationSeed.title, "汇总");
  assert.deepEqual(Object.keys(body).sort(), ["automationRun", "automationSeed", "messages", "runId"]);

  assert.deepEqual(events.map(e => e.type), ["run.start", "message.delta", "run.end"]);
  assert.equal(events[1].data.text, "你好");
});

test("streamChat omits optional fields when they are not provided", async t => {
  const originalFetch = globalThis.fetch;
  let body;
  globalThis.fetch = async (_url, init) => {
    body = JSON.parse(init.body);
    return fakeResponse([]);
  };
  t.after(() => { globalThis.fetch = originalFetch; });

  await streamChat({
    messages: [{ role: "user", content: "hi" }],
    runId: 2,
    signal: new AbortController().signal,
    onEvent: () => {},
  });
  assert.deepEqual(Object.keys(body).sort(), ["messages", "runId"]);
});

test("streamChat surfaces HTTP errors with the server detail", async t => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: false, status: 503, json: async () => ({ error: "服务暂不可用" }) });
  t.after(() => { globalThis.fetch = originalFetch; });

  await assert.rejects(
    streamChat({ messages: [], runId: 3, signal: new AbortController().signal, onEvent: () => {} }),
    /服务暂不可用/,
  );
});

test("streamChat propagates an aborted request", async t => {
  const originalFetch = globalThis.fetch;
  const controller = new AbortController();
  globalThis.fetch = async () => { throw new DOMException("aborted", "AbortError"); };
  t.after(() => { globalThis.fetch = originalFetch; });

  await assert.rejects(
    streamChat({ messages: [], runId: 4, signal: controller.signal, onEvent: () => {} }),
    error => error.name === "AbortError",
  );
});
