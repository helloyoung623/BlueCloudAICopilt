// Vercel Serverless：/api/icon?name=xxx → 任务图标代理（icons.kubai.design，统一主色 + 缓存）。
// 前端 kubai-icon 在静态站点上拿不到本地 serve 的代理路由时走这里。
import { readIconSvg } from '../server/icons.mjs'

export const maxDuration = 15

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.writeHead(405, { 'Content-Type': 'application/json; charset=utf-8' })
    res.end(JSON.stringify({ error: 'method not allowed' }))
    return
  }

  const url = req.url ?? '/'
  const name = new URL(url, 'http://localhost').searchParams.get('name') ?? ''
  try {
    const svg = await readIconSvg(name)
    if (!svg) {
      res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' })
      res.end(JSON.stringify({ error: 'icon not found' }))
      return
    }
    res.writeHead(200, {
      'Content-Type': 'image/svg+xml',
      'Cache-Control': 'public, max-age=604800',
    })
    res.end(svg)
  } catch {
    res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' })
    res.end(JSON.stringify({ error: 'icon fetch failed' }))
  }
}
