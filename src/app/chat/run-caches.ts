// 运行期缓存按「会话 id : 轮次 id」登记，会话一删就必须整体清掉。
// 这些 Map 不再被任何 UI 引用，但键会永久留在内存里（每建一次会话多几条），
// 所以删除会话时统一走这里，而不是靠各处零散 delete。
export function clearConversationCaches<A, B, C, D>(
  id: number,
  caches: {
    pendingAutomation: Map<string, A>;
    launchAutomation: Map<string, B>;
    confirmedByRound: Map<string, C>;
    realToolMode: Map<number, D>;
  },
): number {
  const prefix = `${id}:`;
  let removed = 0;
  [caches.pendingAutomation, caches.launchAutomation, caches.confirmedByRound].forEach(cache => {
    [...cache.keys()].forEach(key => {
      if (!key.startsWith(prefix)) return;
      cache.delete(key);
      removed += 1;
    });
  });
  if (caches.realToolMode.delete(id)) removed += 1;
  return removed;
}
