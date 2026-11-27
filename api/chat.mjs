// Vercel Serverless：/api/chat → server/index.mjs 的 handleChat（SSE 流式）。
// Vercel 的 Node runtime 提供真正的 Node http req/res，可直接复用本地服务端逻辑。
import { handleChat, getStartupErrors } from '../server/index.mjs'
import { checkBodySize, createRateLimiter, getClientIp, readLimit, DEFAULT_MAX_BODY_BYTES, DEFAULT_RATE_PER_MIN } from '../server/guards.mjs'

// 可选环境变量：CHAT_MAX_BODY_BYTES（请求体上限，默认 2MB）、CHAT_RATE_LIMIT_PER_MIN（每 IP 每分钟次数，默认 20）
const MAX_BODY_BYTES = readLimit(process.env.CHAT_MAX_BODY_BYTES, DEFAULT_MAX_BODY_BYTES)
const limiter = createRateLimiter({ max: readLimit(process.env.CHAT_RATE_LIMIT_PER_MIN, DEFAULT_RATE_PER_MIN) })

// Vercel Hobby 上限 60s；流式回答 + 工具调用按最坏情况取满
export const maxDuration = 60

export default async function handler(req, res) {
  const errors = getStartupErrors()
  if (errors.length > 0) {
    res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' })
    res.end(JSON.stringify({
      error: `服务端配置不完整（Vercel 项目环境变量缺 ZHIPU_API_KEY？）：${errors.join('；')}`,
    }))
    return
  }

  if (req.method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'application/json; charset=utf-8' })
    res.end(JSON.stringify({ error: 'method not allowed' }))
    return
  }

  const size = checkBodySize(req, MAX_BODY_BYTES)
  if (!size.ok) {
    res.writeHead(size.status, { 'Content-Type': 'application/json; charset=utf-8' })
    res.end(JSON.stringify({ error: size.error }))
    return
  }

  const rate = limiter.check(getClientIp(req))
  if (!rate.ok) {
    res.writeHead(429, { 'Content-Type': 'application/json; charset=utf-8', 'Retry-After': String(rate.retryAfterSec) })
    res.end(JSON.stringify({ error: `请求太频繁，请 ${rate.retryAfterSec} 秒后再试` }))
    return
  }

  handleChat(req, res).catch(error => {
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' })
      res.end(JSON.stringify({ error: error?.message ?? 'internal error' }))
    } else {
      res.end()
    }
  })
}
