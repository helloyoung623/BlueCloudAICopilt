// 入口防护：请求体大小上限 + 按 IP 的简单限流。
// 注意：限流计数放在函数实例的内存里，Vercel 上不同实例互不共享，
// 所以这是「尽力而为」的第一道门槛，防的是误触发和最粗暴的刷接口；
// 要做到严格限流，需要接 Redis / Upstash 之类的外部存储。

export const DEFAULT_MAX_BODY_BYTES = 2 * 1024 * 1024
export const DEFAULT_RATE_PER_MIN = 20
const WINDOW_MS = 60_000

/** 读取正整数配置；缺省或非法时回退到默认值。 */
export function readLimit(raw, fallback) {
  const value = Number(raw)
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback
}

/** 取客户端 IP。Vercel 会自己写入 x-vercel-forwarded-for，优先用它，避免被客户端伪造的头带偏。 */
export function getClientIp(req) {
  const headers = req.headers ?? {}
  const pick = name => {
    const value = headers[name]
    const text = Array.isArray(value) ? value[0] : value
    return typeof text === 'string' && text.trim() ? text.split(',')[0].trim() : ''
  }
  return pick('x-vercel-forwarded-for') || pick('x-real-ip') || pick('x-forwarded-for')
    || req.socket?.remoteAddress || 'unknown'
}

/**
 * 按 Content-Length 提前拒绝过大的请求体。
 * 没带 Content-Length（分块传输）时这里放行，由平台自身的请求体上限兜底（Vercel 为 4.5MB）。
 */
export function checkBodySize(req, maxBytes = DEFAULT_MAX_BODY_BYTES) {
  const raw = req.headers?.['content-length']
  if (raw === undefined) return { ok: true }
  const length = Number(raw)
  if (!Number.isFinite(length) || length < 0) return { ok: false, status: 400, error: 'invalid content-length' }
  if (length > maxBytes) {
    return { ok: false, status: 413, error: `请求内容过大（上限 ${Math.floor(maxBytes / 1024)} KB），请精简后重试` }
  }
  return { ok: true }
}

/** 内存滑动窗口限流：同一个 key 在 windowMs 内最多 max 次。now 可注入，便于测试。 */
export function createRateLimiter({ max = DEFAULT_RATE_PER_MIN, windowMs = WINDOW_MS, now = Date.now } = {}) {
  const hits = new Map()

  function prune(current) {
    for (const [key, stamps] of hits) {
      if (!stamps.length || current - stamps[stamps.length - 1] >= windowMs) hits.delete(key)
    }
  }

  return {
    check(key) {
      const current = now()
      const recent = (hits.get(key) ?? []).filter(stamp => current - stamp < windowMs)
      if (recent.length >= max) {
        hits.set(key, recent)
        return { ok: false, retryAfterSec: Math.max(1, Math.ceil((recent[0] + windowMs - current) / 1000)) }
      }
      recent.push(current)
      hits.set(key, recent)
      if (hits.size > 1000) prune(current)
      return { ok: true }
    },
  }
}
