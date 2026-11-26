import assert from "node:assert/strict";
import { test } from "node:test";
import { parseSseBuffer, parseSseFrame } from "./agent-events.ts";

test("parses a normal agent event frame", () => {
  const parsed = parseSseFrame('event: message.delta\ndata: {"text":"你好"}');
  assert.equal(parsed.type, "message.delta");
  assert.deepEqual(parsed.data, { text: "你好" });
});

test("joins multi-line data and ignores bad frames", () => {
  const parsed = parseSseFrame('event: run.end\ndata: {"text":"a"\ndata: ,"followUps":[]}');
  assert.deepEqual(parsed.data, { text: "a", followUps: [] });
  assert.equal(parseSseFrame('event: run.end\ndata: {broken'), null);
  assert.equal(parseSseFrame("event: run.end\n"), null);
  assert.equal(parseSseFrame('event: run.end\ndata: [1,2]'), null, "数组不是合法 payload");
});

test("parseSseBuffer keeps an incomplete trailing frame for the next chunk", () => {
  const first = parseSseBuffer('event: run.start\ndata: {"runId":1}\n\nevent: answer.start\ndata: {}');
  assert.deepEqual(first.events.map(e => e.type), ["run.start"]);
  assert.equal(first.rest, 'event: answer.start\ndata: {}');

  const second = parseSseBuffer(first.rest + "\n\n");
  assert.deepEqual(second.events.map(e => e.type), ["answer.start"]);
  assert.equal(second.rest, "");
});
