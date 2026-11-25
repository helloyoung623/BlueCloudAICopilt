// Vercel Serverless：/api/chat → server/index.mjs 的 handleChat（SSE 流式）。
// Vercel 的 Node runtime 提供真正的 Node http req/res，可直接复用本地服务端逻辑。
import { handleChat, getStartupErrors } from '../server/index.mjs'

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

  handleChat(req, res).catch(error => {
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' })
      res.end(JSON.stringify({ error: error?.message ?? 'internal error' }))
    } else {
      res.end()
    }
  })
}
