// 任务图标检索：去 icons.kubai.design 的真实图标库里按关键词匹配。
// 之前是前端写死一张「图标名 + 近义词」词表（只有 16 个本地图标），
// 现在改成：AI 给出关键词 → 服务端拉站点清单（sitemap，1900+ 图标）→ 打分选最合适的一个。
//
// 打包出来的图标统一改成 App 主色 #8B5CF6（站点默认每个图标自带配色，混在一起太花），
// 通过 /api/icon?name=xxx 回给前端；同时落一份磁盘缓存，站点不可达也能继续显示。

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const SITE = 'https://icons.kubai.design'
const CACHE_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '.icon-cache')
const ACCENT = '#8B5CF6'
const CATALOG_TTL = 30 * 60 * 1000
const ICON_TTL = 7 * 24 * 60 * 60 * 1000

let catalog = { at: 0, names: [] }
const iconMemo = new Map()

export function kubaiIconPageUrl(name) {
  return `${SITE}/icons/${encodeURIComponent(name)}/`
}

const previewUrl = name => `${SITE}/icons/${encodeURIComponent(name)}/preview.svg`

/** 站点清单：sitemap 里 /icons/<name>/ 就是全部图标详情页，一次请求拿全量。 */
export async function loadIconCatalog() {
  if (catalog.names.length && Date.now() - catalog.at < CATALOG_TTL) return catalog.names
  try {
    const response = await fetch(`${SITE}/sitemap.xml`, { signal: AbortSignal.timeout(15000) })
    if (!response.ok) throw new Error(`sitemap ${response.status}`)
    const xml = await response.text()
    const names = new Set()
    for (const match of xml.matchAll(/<loc>[^<]*\/icons\/([a-z0-9-]+)\/<\/loc>/g)) {
      const name = match[1]
      if (name === 'submit' || name === 'sets') continue
      names.add(name)
    }
    if (names.size) catalog = { at: Date.now(), names: [...names] }
  } catch {
    // 站点抖动时沿用上一次抓到的清单；没有清单就让上层退回本地图标
  }
  return catalog.names
}

// 中文意图 → 站点图标名。站点的图标名是英文（mail / file-text / chart-bar），
// 模型给的关键词一般是英文，但用户的任务名往往是中文，这里补一层常用映射。
const ZH_HINTS = {
  邮件: ['mail', 'mails', 'inbox'],
  邮箱: ['mail', 'mailbox', 'inbox'],
  收件箱: ['inbox', 'mail'],
  未读: ['mail', 'inbox'],
  日报: ['newspaper', 'notepad', 'calendar-week'],
  周报: ['newspaper', 'notepad', 'calendar-week'],
  早报: ['newspaper', 'sun'],
  晚报: ['newspaper', 'moon-star'],
  新闻: ['newspaper', 'globe'],
  资讯: ['newspaper', 'globe'],
  情报: ['newspaper', 'binoculars', 'globe'],
  总结: ['file-text', 'notepad', 'scroll'],
  汇总: ['file-text', 'notepad', 'layers'],
  报告: ['file-chart', 'notepad', 'clipboard-check'],
  纪要: ['notepad', 'clipboard', 'file-text'],
  文档: ['file-text', 'notebook', 'file'],
  表格: ['file-spreadsheet', 'grid', 'rows'],
  台账: ['file-spreadsheet', 'clipboard'],
  清单: ['clipboard-check', 'notepad', 'list-view'],
  数据: ['chart-bar', 'activity', 'file-chart'],
  统计: ['chart-bar', 'chart-pie', 'activity'],
  报表: ['file-chart', 'chart-bar'],
  排行: ['chart-bar', 'crown'],
  趋势: ['chart-line', 'chart-funnel', 'activity'],
  分析: ['chart-line', 'chart-pie', 'microscope'],
  复盘: ['chart-line', 'activity'],
  监控: ['cctv', 'activity', 'aperture'],
  舆情: ['globe', 'newspaper', 'aperture'],
  预警: ['bell', 'alarm-clock', 'flag-triangle'],
  盯: ['cctv', 'eye'],
  追踪: ['map-pin', 'activity'],
  提醒: ['bell', 'alarm-clock', 'timer'],
  通知: ['bell', 'messages'],
  告警: ['bell', 'flag-triangle'],
  日程: ['calendar-week', 'clock'],
  会议: ['calendar-week', 'messages', 'presentation'],
  排期: ['calendar-week', 'kanban'],
  日历: ['calendar-week', 'calendar'],
  定时: ['alarm-clock', 'timer', 'clock'],
  周期: ['clock', 'timer'],
  搜索: ['search', 'aperture'],
  检索: ['search', 'aperture'],
  调研: ['search', 'clipboard-check'],
  竞品: ['search', 'chart-bar'],
  网站: ['globe', 'app-window'],
  知识库: ['library', 'book-stack'],
  资料库: ['library', 'book-stack'],
  数据库: ['database', 'server'],
  归档: ['archive', 'filing-cabinet'],
  计划: ['calendar-week', 'clipboard-check', 'kanban'],
  任务: ['clipboard-check', 'kanban'],
  待办: ['clipboard-check', 'list-view'],
  财务: ['cash-register', 'landmark', 'badge-percent'],
  账单: ['cash-register', 'file-text'],
  销售: ['chart-bar', 'shopping-bag', 'badge-percent'],
  客户: ['user-group', 'badge-verified'],
  邮件推送: ['mail', 'mails', 'share'],
  天气: ['sun', 'cloud-sun', 'thermostat'],
  代码: ['file-code', 'binary', 'bug'],
  开发: ['file-code', 'git-compare', 'bug'],
}

/** 关键词切分：英文按非字母切，中文按词表命中补英文近义词。 */
export function collectIconTokens(sources) {
  const tokens = new Set()
  for (const source of sources) {
    const text = String(source ?? '').trim()
    if (!text) continue
    const lower = text.toLowerCase()
    for (const part of lower.split(/[^a-z0-9]+/)) {
      if (part.length >= 3 && !/^\d+$/.test(part)) tokens.add(part)
    }
    for (const [zh, words] of Object.entries(ZH_HINTS)) {
      if (text.includes(zh)) words.forEach(word => tokens.add(word))
    }
  }
  return [...tokens]
}

function scoreIcon(name, tokens) {
  const segments = name.split('-')
  let score = 0
  let hits = 0
  for (const token of tokens) {
    if (name === token) { score += 120; hits += 1; continue }
    if (segments.includes(token)) { score += 70; hits += 1; continue }
    if (name.startsWith(token) && token.length >= 3) { score += 46; hits += 1; continue }
    if (token.length >= 4 && name.includes(token)) { score += 26; hits += 1 }
  }
  if (!hits) return { score: 0, hits: 0 }
  // 命中数优先，其次看单个图标名不要太长（file 比 file-audio-off 更通用）
  return { score: score - name.length * 0.4, hits }
}

/**
 * 在真实图标库里检索最匹配的一个图标。
 * 返回 { name, url, page, matched } —— url 指向本服务的 /api/icon（已统一成主色）。
 */
export async function searchKubaiIcon(sources) {
  const tokens = collectIconTokens(sources)
  if (!tokens.length) return null
  const names = await loadIconCatalog()
  if (!names.length) return null

  let best = null
  for (const name of names) {
    const { score, hits } = scoreIcon(name, tokens)
    if (!hits) continue
    if (!best || score > best.score) best = { name, score, hits }
  }
  if (!best) return null
  return {
    name: best.name,
    url: `/api/icon?name=${encodeURIComponent(best.name)}`,
    page: kubaiIconPageUrl(best.name),
    matched: tokens.slice(0, 6),
  }
}

/** 取图标 SVG（换成 App 主色）；带内存 + 磁盘缓存，站点不可达时回退缓存。 */
export async function readIconSvg(rawName) {
  const name = String(rawName ?? '').trim().toLowerCase()
  if (!/^[a-z0-9-]{2,44}$/.test(name)) return null

  const memo = iconMemo.get(name)
  if (memo && Date.now() - memo.at < ICON_TTL) return memo.svg

  const file = path.join(CACHE_DIR, `${name}.svg`)
  try {
    const svg = await readFile(file, 'utf8')
    iconMemo.set(name, { at: Date.now(), svg })
    return svg
  } catch { /* 没有缓存，去站点取 */ }

  try {
    const response = await fetch(previewUrl(name), { signal: AbortSignal.timeout(12000) })
    if (!response.ok) return null
    const raw = await response.text()
    if (!raw.includes('<svg')) return null
    const svg = recolor(raw)
    iconMemo.set(name, { at: Date.now(), svg })
    mkdir(CACHE_DIR, { recursive: true }).then(() => writeFile(file, svg).catch(() => {})).catch(() => {})
    return svg
  } catch {
    return null
  }
}

// 站点图标自带配色（如 style="color:#5393FF"），统一成主色后放进卡片才不花
function recolor(svg) {
  return svg
    .replace(/style="color:\s*#[0-9A-Fa-f]{3,8}"/g, `style="color:${ACCENT}"`)
    .replace(/var\(--ki-c,[^)]*\)/g, ACCENT)
}

// ── 动效版图标 ────────────────────────────────────────────────────────────────
// icons.kubai.design 的图标是「会动」的：静态 preview.svg 只是一帧，真正的动效在同名图标模块里
// （mail.js 的 draw() 负责翻盖、信纸升起等）。运行时 element.js 定义 <kubai-icon> 自定义元素，
// 按 name 动态 import('./icons/<name>.js')，并默认在 hover 时播放。
// 前端不直连 CDN（内网/断网就白屏），统一由这里代理 + 落盘缓存。
const KUBai_CDN = [
  'https://cdn.jsdelivr.net/npm/kubai-icons@0/dist/cdn/',
  'https://unpkg.com/kubai-icons@0/dist/cdn/',
]
const KUBai_CACHE = path.join(path.dirname(fileURLToPath(import.meta.url)), '.kubai-cache')
// 只放行运行时与图标模块，避免变成万能代理
const KUBAI_ALLOWED = /^(element\.js|icons\/[a-z0-9-]{2,44}\.js|duotone\/icons\/[a-z0-9-]{2,44}\.js)$/

export async function readKubaiAsset(rawPath) {
  const rel = String(rawPath ?? '').replace(/^\/+/, '').split('?')[0]
  if (!KUBAI_ALLOWED.test(rel)) return null
  const file = path.join(KUBai_CACHE, rel)
  try {
    return await readFile(file, 'utf8')
  } catch { /* 没有缓存，去 CDN 取 */ }
  for (const base of KUBai_CDN) {
    try {
      const response = await fetch(base + rel, { signal: AbortSignal.timeout(15000) })
      if (!response.ok) continue
      const text = await response.text()
      if (!text.trim()) continue
      mkdir(path.dirname(file), { recursive: true }).then(() => writeFile(file, text).catch(() => {})).catch(() => {})
      return text
    } catch { /* 换下一个源 */ }
  }
  return null
}
