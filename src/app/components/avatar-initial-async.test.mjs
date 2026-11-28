import assert from "node:assert/strict";
import { test } from "node:test";
import { createAvatarInitialResolver, getAvatarInitialPlaceholder } from "./avatar-initial-async.ts";

const fakePinyin = (text, options) => {
  assert.equal(options.pattern, "first");
  assert.equal(options.toneType, "none");
  const table = { 张: "Z", 吴: "W", 钱: "Q", 陳: "C" };
  return table[text] ?? text;
};

test("汉字：库加载后返回拼音首字母，每个字只加载一次库", async () => {
  let calls = 0;
  const resolver = createAvatarInitialResolver(async () => {
    calls += 1;
    return fakePinyin;
  });
  assert.equal(await resolver.resolve("张三"), "Z");
  assert.equal(await resolver.resolve("吴那"), "W");
  assert.equal(await resolver.resolve(" 陳明 "), "C");
  assert.equal(await resolver.resolve("张三"), "Z");
  assert.equal(calls, 1, "模块级缓存应保证拼音库只加载一次");
});

test("英文/数字：立即返回大写首字母，不加载拼音库", async () => {
  let calls = 0;
  const resolver = createAvatarInitialResolver(async () => {
    calls += 1;
    return fakePinyin;
  });
  for (const [name, expected] of [["alice", "A"], ["Bob", "B"], ["9user", "9"], ["alice张", "A"]]) {
    assert.equal(await resolver.resolve(name), expected);
  }
  assert.equal(getAvatarInitialPlaceholder("  bob  "), "B");
  assert.equal(calls, 0, "非汉字不应触发拼音库加载");
});

test("空字符串：返回空，不加载拼音库", async () => {
  let calls = 0;
  const resolver = createAvatarInitialResolver(async () => {
    calls += 1;
    return fakePinyin;
  });
  assert.equal(await resolver.resolve(""), "");
  assert.equal(await resolver.resolve("   "), "");
  assert.equal(getAvatarInitialPlaceholder(""), "");
  assert.equal(calls, 0);
});

test("加载失败：保留汉字占位，不抛错且不无限重试", async () => {
  let calls = 0;
  const resolver = createAvatarInitialResolver(async () => {
    calls += 1;
    throw new Error("pinyin-pro unavailable");
  });
  assert.equal(await resolver.resolve("张三"), "张");
  assert.equal(await resolver.resolve("吴那"), "吴");
  assert.equal(await resolver.resolve("张三"), "张");
  assert.equal(calls, 1, "失败也应缓存，不得重复请求");
  assert.equal(getAvatarInitialPlaceholder("王五"), "王");
});
