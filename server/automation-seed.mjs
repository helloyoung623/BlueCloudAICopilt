// 前端传来的「新建自动化任务」表单数据只作为数据使用，最终会被拼进 system prompt。
// 这里做字段白名单 + 类型校验 + 长度上限 + 控制字符清理，避免构造畸形的 prompt。
// 注意：这是输入卫生，不是权限校验——这些值本来就是用户自己填的。

const STRING_LIMITS = { title: 30, goal: 1000, cycle: 40, time: 40 }
const LIST_LIMITS = { weekdays: 7, monthDays: 31 }
const ITEM_LIMIT = 20
// 控制字符（含换行）会破坏 prompt 的分行结构，统一剥离；制表等其他空白折叠为空格。
function cleanText(value) {
  return String(value)
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * 把不可信的 body.automationSeed 收敛成一组确定形状的字段。
 * 非法字段直接丢弃（不抛错，不影响主流程）；没有任何有效字段时返回 null。
 */
export function sanitizeAutomationSeed(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null

  const seed = {}
  for (const [key, limit] of Object.entries(STRING_LIMITS)) {
    if (typeof raw[key] !== 'string') continue
    const value = cleanText(raw[key]).slice(0, limit)
    if (value) seed[key] = value
  }
  for (const [key, limit] of Object.entries(LIST_LIMITS)) {
    if (!Array.isArray(raw[key])) continue
    const items = []
    for (const item of raw[key].slice(0, limit)) {
      if (typeof item !== 'string') continue
      const value = cleanText(item).slice(0, ITEM_LIMIT)
      if (value) items.push(value)
    }
    if (items.length) seed[key] = items
  }
  return Object.keys(seed).length ? seed : null
}
