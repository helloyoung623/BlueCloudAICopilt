import type { Message } from "./types.ts";

// 对话区滚动的三种跟随姿态：
//   anchor —— 钉住「当前这一轮」（最近一条用户提问），它停在视口顶部，
//              之前那轮的回答被整体推到上面；用户每次都像在开一个新对话。
//   tail   —— 用户已经滚到底部在读最新一段，后续内容变高就跟着长。
//   free   —— 用户自己在翻历史，不去抢滚动条。
export type FollowMode = "anchor" | "tail" | "free";

// 离内容底部不超过这个距离就算「贴着底」。
export const FOLLOW_THRESHOLD = 24;
// 锚点上方留出的呼吸位：提问不贴视口顶边。
export const ANCHOR_GAP = 16;
// 离锚点这么近以内，仍算「还停在当前这一轮上」。
export const ANCHOR_TOLERANCE = 8;

// 最近一条用户提问所在的下标，也就是「当前这一轮」的锚点；没有提问时返回 -1。
export function findLastUserIndex(messages: readonly Pick<Message, "role">[]): number {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i].role === "user") return i;
  }
  return -1;
}

// 滚到了某个位置时，该用哪种跟随姿态。
// anchorDelta = 当前滚动位置 − 锚点目标位置；还没有锚点时为 null。
export function resolveFollowMode(input: { anchorDelta: number | null; distanceToBottom: number }): FollowMode {
  if (input.anchorDelta !== null && Math.abs(input.anchorDelta) <= ANCHOR_TOLERANCE) return "anchor";
  if (input.distanceToBottom <= FOLLOW_THRESHOLD) return "tail";
  return "free";
}
