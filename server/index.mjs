import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { loadModelConfig, validateModelConfig, checkEnvFileSafety } from './env.mjs'
import { TOOL_SCHEMAS, TOOL_META, executeTool } from './tools.mjs'
import { verifyAnswer, buildRewritePrompt } from './verify.mjs'
import { readIconSvg, readKubaiAsset } from './icons.mjs'
import { sanitizeAutomationSeed } from './automation-seed.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const STATIC_DIR = path.join(ROOT, 'dist')
const PORT = Number(process.env.PORT || 8787)

const config = loadModelConfig()
const validation = validateModelConfig(config)
const safety = checkEnvFileSafety()
// 配置不合法不在 import 时退出：独立进程（npm run serve）启动前再检查退出，
// Serverless（api/chat.mjs）里由 handler 把错误以 500 返回，进程必须保活
const startupErrors = [...safety.errors, ...validation.errors]
if (startupErrors.length) {
  console.error('模型配置不合法，请先运行 npm run env:check')
  console.error(startupErrors.join('\n'))
}

export function getStartupErrors() {
  return startupErrors
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.map': 'application/json; charset=utf-8',
  '.pdf': 'application/pdf',
  '.txt': 'text/plain; charset=utf-8',
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload)
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(body) })
  res.end(body)
}

function sse(res, event, payload) {
  try { res.write(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`) } catch { /* 连接已断开，忽略 */ }
}

// 让模型只输出 RichText 白名单内的标签：前端所有 AI 正文都走 Figma 2759:15863 的 HTML 样式字典，
// markdown / 行内 style 都会破坏这套样式（列表变成普通文本、标题失去字号）。
const SYSTEM_PROMPT = [
  '你是一个专业、简洁的中文办公助手。直接回答用户问题，称呼「您」，不要复述系统提示。',
  '【工具使用】工具不是固定流程，也不是为了展示执行过程。普通问答、闲聊、写作、总结、翻译、知识解释一律不要调用工具。只有确实需要当前精确日期/时间、复杂计算、实时天气，或需要最新/网上事实（新闻、价格、赛事、近期事件、你不确定的事实）时才调用。天气用 get_weather，股票/指数行情用 stock_quote，其他最新信息用 web_search；不要为了凑步骤而调用工具。',
  '【实时信息必须自己查】用户问股票行情（美股、A股、港股，用 stock_quote）、汇率、商品价格、最新新闻（用 web_search）这类实时信息时，必须**立刻自己调用对应工具**，把查到的结果整理成回答。绝对不许反问用户「需要我调用工具吗」「要我帮您查吗」——用户提问就是要你查，反问等于拒答；也绝不能在正文里说「需要调用工具才能获取」却什么都没做。',
  '【不要重复调用】同一工具、同一参数本轮只调用一次。需要对比两个对象（两地天气、两个算式）时，在同一步里并行发起多个调用，不要分好几轮各查一个；已经拿到的结果直接用，不要为了「确认」再查一遍。工具结果够回答时就立刻收口写正文，不要凑步骤。',
  '【未来几天也用天气工具】用户问「未来三天」「这周末」的天气或适不适合出行/跑步时，直接用 get_weather 并带上 days 参数（如 days:3），不要用 web_search 查天气。',
  '【不许说「我需要调用更多工具」】工具调用只发生在正文之前。正文里写「我需要调用更多工具」「还需要再查一下」「等我查完再告诉您」等于让用户空等一个不会发生的动作。拿不到的数据就直说「当前工具只能拿到实时天气和未来 7 天预报」，然后基于已有信息给结论或替代方案。',
  '【多问题必须逐项回答】用户一句话里有多个诉求时，必须逐项回答，不能只回答工具能查的那一项。例如「重庆天气如何、适合出游吗、推荐去哪」：天气用 get_weather 查，是否适合出游和地点推荐要结合天气结果继续分析并给出建议。工具只负责提供事实，不代替其余问题的判断、建议和推荐。',
  '【调用工具前必须先输出执行意图】决定调用工具后，先输出一个 JSON 对象（纯文本，不要用 ``` 包裹，前后不要写任何解释），然后在同一条回复里紧接着发起 tool_calls。只输出 JSON、不发起 tool_calls 是最严重的错误，工具不会被执行。例如：',
  '{"title":"天气查询与出行建议","summary":"正在获取重庆天气并判断是否适合出游","intent_collection":[{"type":"think","text":"拆解天气与出行建议的评估维度","status":"done"},{"type":"read","text":"获取重庆的实时天气","status":"running"}]}',
  '- title：概括这一组动作的静态短语（4～10 字，名词性，如「天气查询与出行建议」「算式计算」），不带时态、不写「显示执行意图」这类功能名。',
  '- summary：整个任务的概括，要覆盖用户这次的全部诉求，而不是当前某一步。必须以「正在」开头，不超过 40 字。例如用户问「重庆和北京天气对比、推荐去哪玩、消费高不高」时写「正在查询重庆与北京的天气情况，对比并给出出行与消费建议」，不要写成「正在查询重庆天气」。',
  '- intent_collection：本轮要执行的动作，1～4 条，按执行顺序排列；已完成的 status 为 done 并排在前面，正在执行的 status 为 running 并排在后面。',
  '- type 只能取：read（读取网页/文档）、memory（检索记忆/上下文）、clarify（向用户澄清）、run（运行脚本/命令）、think（逻辑拆解/规划）、skill（调用特定技能）、analyze（归纳提炼信息）、generate（产出草稿/内容）、verify（核对检查）、summarize（整合汇总）、execute（外部真实执行）、error（受阻/未命中兜底）。',
  '- text：用户直接看到的短句，必须自带明确的动作动词（获取…／加载…／提炼出…／运行…），不得带「读取；」「思考：」这类类型前缀或分号，不得出现工具名、函数名、参数名；连续同类碎片动作合并成一条。',
  '- 不要写「展示执行意图」这类界面用语，不要写内部链式思考，不要长篇解释，也不要用 HTML 标签。最终回答（不调用工具时）仍然只输出 HTML 片段，绝不输出 JSON。',
  '【自动化任务】用户表达「以后」「每次」「每天」「每周」「每月」「定时」「到点提醒我」「定期汇总」这类重复性安排时，属于创建自动化任务，交给 create_automation 处理。只要判断出是这类意图就立刻调用 create_automation，把用户已经说出的条件原样填进参数（说「每天」填 cycle=每天，说「九点」填 time=09:00），没说到的不要填、也不要自己猜（「早上」「上午」「定期」「有空的时候」绝不许默认成 09:00）。title 必须是这件事的概括：15 字以内最好、最多不超过 30 字（如「汇总未读邮件」「每日新闻简报」），不许照抄用户整段指令、不要带「帮我创建」「每天 9 点」这类外壳。工具返回 created:false 时说明还缺条件：把 question 原文转述给用户，不要改写、不要自己另编问题，也绝对不能说「已创建」。用户补齐后再次调用；只有 created:true 才能说创建成功，并说明周期与时刻。',
  '【输出格式】只输出 HTML 片段，不要 Markdown，不要用 ``` 包裹，不要在 HTML 外写任何解释文字。',
  '严格只用这些标签：<p> <h1>-<h6> <strong> <b> <del> <s> <br> <ul> <ol> <li> <hr> <blockquote>',
  '<table> <thead> <tbody> <tfoot> <tr> <th> <td> <code> <pre><code class="language-xx"> <a href="https://…">。',
  '禁止 inline style、class（代码块 language-xx 除外）、script、img、iframe。',
  '结构化内容必须用对应标签：要点用 <ul>/<ol>+<li>，强调词用 <strong>，代码块用 <pre><code>。',
  '标题层级：普通回答不要用 <h1>/<h2>，各小节标题一律用 <h3>，更下一级用 <h4>；只有用户明确要求「主标题/报告标题」时才允许 <h1> 且必须是全文第一个标签。',
  '开头先用一句 <p> 引导句，再写小节标题；标题与正文的间距由样式自动处理，不要在 HTML 里加空标签或换行来凑间距。',
].join('\n')

// Agent 循环上限：防止模型反复调工具导致无限循环 / 烧 token。
// 6 步对多工具任务太紧（查两地天气+两次计算+检索+建任务就会撞上限），放宽到 12；
// 撞上限时不再中止，而是撤掉工具强制模型用已有结果收口作答。
const MAX_AGENT_STEPS = 12

// 把「现在」写进 system：模型要判断「明天」「明早」「这周五」这类相对时间必须有基准，
// 不能让它靠训练数据里的日期猜。
function nowContext() {
  const now = new Date()
  try {
    const date = new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'long' }).format(now)
    const time = new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', hour: '2-digit', minute: '2-digit', hour12: false }).format(now)
    return `${date} ${time}（Asia/Shanghai）`
  } catch {
    return now.toLocaleString('zh-CN')
  }
}

// ── 推荐追问 ────────────────────────────────────────────────────────────────
// 主回答结束后再单独生成，避免把 JSON 混进正文流；规则与前端展示约定保持一致：
// 3 条、第一人称、细节深挖 / 场景延伸 / 行动转化、≤18 字、禁止万金油模板。
const FOLLOWUP_SYSTEM_PROMPT = [
  '你是对话推荐追问生成器。根据「用户本轮问题」和「助手回答」，生成 3 条用户最可能继续追问的问题。',
  '必须遵守：',
  '1. 用用户第一人称口吻，自然口语，能直接作为下一轮输入发送（例如「帮我…」「…有什么区别？」）。',
  '2. 三条维度固定且互不重复：第一条深挖回答里的核心信息或具体名词；第二条预测用户下一步关联需求（对比、注意事项、周边信息）；第三条必须让助手产出具体成果，句子里要出现「表格 / 清单 / 计划 / 攻略 / 文档 / 对比表 / 行程」之一，例如「帮我把这三个地点整理成一日游计划」。',
  '3. 每条控制在 12~16 个字，最多不超过 18 个字；不带序号、引号或解释，不要三条都用同一种句式。',
  '4. 必须结合当前对话里的具体实体（地点、人物、产品、数字、时间等），不要通用套话。',
  '5. 禁止「总结一下要点」「展开讲讲」「有没有其他案例」「还有什么」「更多信息」等空泛模板；禁止问回答里已经明确给出答案的内容。',
  '只输出 JSON，不要 Markdown、不要代码围栏：{"questions":["第一条","第二条","第三条"]}',
].join('\n')

// 尽量保证生成的追问符合「18 字内、无序号」；超长时保留问号并截断。
function normalizeFollowUp(value) {
  let question = String(value ?? '')
    .replace(/^\s*(?:\d+[.、)]|[-•])\s*/, '')
    .replace(/^["“”'‘’]+|["“”'‘’]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  if (!question) return ''
  if (!/[？?]$/.test(question)) question = `${question.replace(/[。.!！]+$/, '')}？`
  return question
}

const BANNED_FOLLOWUP = /^(请|帮我)?总结(一下|下)?(这段|上述|以上)?(内容|要点)|展开(讲讲|说说)|有没有(其他|别的)(案例|例子)|还有什么|更多(信息|细节)/

async function generateFollowUps({ userText, answerHtml, signal }) {
  const answer = htmlToPlain(answerHtml).slice(0, 6000)
  if (!userText || !answer) return []
  const requestMessages = [
    { role: 'system', content: FOLLOWUP_SYSTEM_PROMPT },
    { role: 'user', content: `【用户本轮问题】\n${userText.slice(0, 1000)}\n\n【助手回答】\n${answer}` },
  ]
  // 模型偶尔会给出不合格结果（超长/模板化），最多重试一次；仍失败则不展示，绝不用万金油兜底。
  // 但「必须有 3 条」不能当成硬门槛：只要通过校验的条数比上一轮多就保留，
  // 否则一条超长就会把整套追问全丢掉（表现为「回答完没有推荐问题」）。
  let best = []
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const upstream = await fetch(`${config.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify({
          model: config.model,
          messages: requestMessages,
          stream: false,
          temperature: 0.5,
          max_tokens: 220,
        }),
        signal,
      })
      if (!upstream.ok) continue
      const data = await upstream.json()
      const raw = data?.choices?.[0]?.message?.content ?? ''
      const jsonText = String(raw).match(/\{[\s\S]*\}/)?.[0] ?? ''
      if (!jsonText) continue
      let parsed
      try { parsed = JSON.parse(jsonText) } catch { continue }
      const list = Array.isArray(parsed?.questions) ? parsed.questions : []
      const seen = new Set()
      const cleaned = []
      for (const item of list) {
        const question = normalizeFollowUp(item)
        if (!question || Array.from(question).length > 18) continue
        if (BANNED_FOLLOWUP.test(question) || seen.has(question)) continue
        seen.add(question)
        cleaned.push(question)
        if (cleaned.length === 3) break
      }
      if (cleaned.length > best.length) best = cleaned
      if (best.length === 3) return best
    } catch {
      if (signal?.aborted) return best
    }
  }
  return best
}

// run.end 的 text 给正文渲染（HTML），plainText 给复制按钮，避免把标签复制出去。
function htmlToPlain(html) {
  return String(html ?? '')
    .replace(/<\/(p|h[1-6]|li|tr|blockquote|pre|div)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"').replace(/&#39;/gi, "'").replace(/&amp;/gi, '&')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/**
 * 模型偶尔不按【输出格式】走，直接吐 markdown / 纯文本。
 * 前端按 HTML 渲染，换行会全丢、列表挤成一坨，所以这里兜底转换。
 * 正文本来就是 HTML 时原样返回（不破坏流式回放）。
 */
function plainToHtml(text) {
  const raw = String(text ?? '').trim()
  if (!raw) return ''
  if (/<(p|h[1-6]|ul|ol|li|div|br|table|strong|em|span|a)\b/i.test(raw)) return raw
  const escape = (value) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const blocks = []
  let list = null
  for (const line of raw.split(/\r?\n/).map(item => item.trim()).filter(Boolean)) {
    const bullet = /^(?:[-*•]|\d+[.、)])\s+(.*)$/.exec(line)
    if (bullet) {
      if (!list) { list = []; blocks.push(list) }
      list.push(`<li>${escape(bullet[1]).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')}</li>`)
      continue
    }
    list = null
    const heading = /^#{1,6}\s+(.*)$/.exec(line)
    const body = escape(heading ? heading[1] : line).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    blocks.push(heading ? `<p><strong>${body}</strong></p>` : `<p>${body}</p>`)
  }
  return blocks.map(block => (Array.isArray(block) ? `<ul>${block.join('')}</ul>` : block)).join('')
}

/**
 * 把一次工具调用翻译成用户能看懂的动作说明。
 * 关键：不展示工具名（calculate / get_weather），必须带执行对象，
 * 例如「获取重庆天气」而不是「查询；获取实时天气」。
 */
function describeToolAction(name, args) {
  const input = args && typeof args === 'object' ? args : {}
  const clip = (value, max = 36) => {
    const text = String(value ?? '').replace(/\s+/g, ' ').trim()
    return text.length > max ? `${text.slice(0, max)}…` : text
  }
  if (name === 'get_weather') {
    const location = clip(input.location, 20)
    const days = Number(input.days) || 1
    const span = days > 1 ? `未来${Math.min(days, 7)}天` : ''
    return location ? `获取${location}${span}天气` : '获取指定地点天气'
  }
  if (name === 'get_current_time') return '获取当前日期与时间'
  if (name === 'calculate') {
    // 面向用户的算式用 × ÷ 而不是 * /，「计算 99*88」读起来不像话
    const expression = clip(String(input.expression ?? '').replace(/\*/g, '×').replace(/\//g, '÷'), 40)
    return expression ? `计算 ${expression}` : '计算数学表达式'
  }
  if (name === 'web_search') {
    const query = clip(input.query, 30)
    return query ? `搜索「${query}」` : '搜索最新信息'
  }
  if (name === 'stock_quote') {
    const symbols = clip(String(input.symbols ?? ''), 20)
    return symbols ? `查询${symbols}行情` : '查询股票行情'
  }
  if (name === 'create_automation') {
    const title = clip(input.title, 20)
    return title ? `创建自动化任务「${title}」` : '创建自动化任务'
  }
  return String(TOOL_META[name]?.label ?? name).split('；').pop()?.trim() || name
}

// ── 执行意图（plan）───────────────────────────────────────────────────────────
// 规范（过程透明度）：外层一句「行动说明」，内层是一组 { type, text, status } 的执行意图。
// type 只作为图标语义，界面上绝不展示；text 必须是自带动词的完整短句。
const INTENT_TYPES = new Set([
  'read', 'memory', 'clarify', 'run', 'think', 'skill',
  'analyze', 'generate', 'verify', 'summarize', 'execute', 'error',
])

/**
 * 一句话行动说明里的「目标短语」。刻意与动作文案（describeToolAction）措辞不同：
 * 行动说明讲这一轮要达成什么，动作讲具体执行了什么，避免两层文案一字不差地重复。
 */
function describeToolGoal(name, args) {
  const input = args && typeof args === 'object' ? args : {}
  const clip = (value, max = 20) => {
    const text = String(value ?? '').replace(/\s+/g, ' ').trim()
    return text.length > max ? `${text.slice(0, max)}…` : text
  }
  if (name === 'get_weather') {
    const location = clip(input.location)
    return location ? `查询${location}天气` : '查询当地天气'
  }
  if (name === 'get_current_time') return '确认当前时间'
  if (name === 'calculate') return '计算您给出的算式'
  if (name === 'web_search') return '检索相关资料'
  if (name === 'stock_quote') return '查询实时行情'
  if (name === 'create_automation') return '配置自动化任务'
  return describeToolAction(name, args)
}

// 意图集合的「标题短语」：折叠入口不写死功能名（「显示执行意图」这类界面用语），
// 而是概括这一组动作在做什么的静态短语——「天气查询与出行建议」「算式计算」。
const INTENT_TOPIC = {
  get_weather: '天气查询',
  get_current_time: '时间查询',
  calculate: '算式计算',
  web_search: '资料检索',
  stock_quote: '行情查询',
  create_automation: '自动化配置',
}
const INTENT_TYPE_TOPIC = {
  read: '信息读取', memory: '上下文调取', clarify: '需求确认', run: '任务执行',
  think: '需求拆解', skill: '技能调用', analyze: '要点归纳', generate: '内容生成',
  verify: '结果核对', summarize: '内容汇总', execute: '任务执行', error: '问题排查',
}

// 真实工具 → 意图类型。仅用于模型没写意图时的兜底补位。
const TOOL_INTENT_TYPE = {
  get_weather: 'read',
  web_search: 'read',
  stock_quote: 'read',
  get_current_time: 'read',
  calculate: 'run',
  create_automation: 'execute',
}

// 取到事实之后必然还要做的一步归纳：不编造未发生的动作，只用用户问题里真实存在的诉求推导。
const JUDGEMENT_PATTERN = /适合|推荐|建议|好不好|值不值|怎么样|如何|该不该|能不能|对比|分析|评价/
const FOLLOW_UP_INTENT = {
  get_weather: { type: 'analyze', text: '结合天气判断是否适合出行', summary: '判断是否适合出行', topic: '出行建议' },
  web_search: { type: 'analyze', text: '归纳检索结果中的关键信息', summary: '归纳检索结果', topic: '结论归纳' },
  stock_quote: { type: 'analyze', text: '结合行情解读市场表现', summary: '解读行情表现', topic: '行情解读' },
  calculate: { type: 'verify', text: '核对计算结果并解释过程', summary: '核对计算结果', topic: '结果核对' },
  get_current_time: { type: 'analyze', text: '结合当前时间给出安排建议', summary: '给出安排建议', topic: '安排建议' },
}

/**
 * 折叠入口的标题：概括这一组执行意图的静态短语。
 * 不写死「显示执行意图」这类功能名，也不带时态（时态归「行动说明」）。
 */
function intentSetTitle(actions, follow) {
  const topics = []
  for (const { name } of actions) {
    const topic = INTENT_TOPIC[name] ?? INTENT_TYPE_TOPIC[TOOL_INTENT_TYPE[name] ?? 'read']
    if (topic && !topics.includes(topic)) topics.push(topic)
  }
  if (follow?.topic && !topics.includes(follow.topic)) topics.push(follow.topic)
  return topics.slice(0, 3).join('与') || '执行过程'
}

/** 去掉模型残留的分类前缀：「读取；加载…」「思考：拆解…」，规范禁止这类前缀。
 *  顺带去掉句首的「正在」——时态由 status 决定，文案统一用动词原形，避免「正在正在…」。 */
function stripIntentPrefix(text) {
  return String(text ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^[一-龥A-Za-z]{1,6}\s*[；;]\s*/, '')
    .replace(/^(读取|思考|分析|检索|执行|生成|校验|汇总|提取|加载|运行|调用|确认|整理|查询)\s*[:：]\s*/, '')
    .replace(/^正在/, '')
    .trim()
}

/**
 * 把「行动说明」收敛成规范要求的一句进行时短句：
 * 「我将获取重庆天气，然后结合结果回答您的全部问题。」→「正在获取重庆天气。」
 */
function tidySummary(text) {
  let summary = String(text ?? '').replace(/\s+/g, ' ').trim()
  if (!summary) return ''
  summary = summary
    .replace(/^(好的|那么|接下来|首先|然后|现在)[，,、]?\s*/, '')
    .replace(/^我(将|会|要|准备|打算|先|来)/, '正在')
    // 去掉「然后结合结果回答您的全部问题」这类没有信息量的元描述
    .replace(/[，,]?\s*(然后|再|之后|最后|并)?\s*(结合|根据|综合)(以上|这些|上述)?的?(结果|信息|资料|数据)?(来|去)?(回答|回复|解答|给出|整理|输出)(您|用户)?的?(全部|所有|每个|各)?问题/g, '')
    .replace(/[，,]\s*。/g, '。')
    .replace(/^[，,。\s]+/, '')
    .replace(/[，,]\s*$/, '')
    .trim()
  if (!summary) return ''
  // 只保留第一句，避免模型写成长段落
  if (summary.length > 32 && summary.includes('。')) summary = summary.slice(0, summary.indexOf('。'))
  if (!/^(正在|已经|已)/.test(summary)) summary = `正在${summary.replace(/^[，,、]/, '')}`
  if (summary.length > 36) summary = `${summary.slice(0, 35)}…`
  return summary.replace(/[。.]$/, '')
}

function parseIntentPlan(rawText) {
  const raw = String(rawText ?? '').trim()
  if (!raw) return null
  const text = raw.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim()
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start === -1 || end <= start) return null
  let parsed
  try { parsed = JSON.parse(text.slice(start, end + 1)) } catch { return null }
  if (!parsed || typeof parsed !== 'object') return null

  const list = Array.isArray(parsed.intent_collection) ? parsed.intent_collection
    : Array.isArray(parsed.intents) ? parsed.intents : []
  const intents = []
  for (const item of list) {
    if (!item || typeof item !== 'object') continue
    const label = stripIntentPrefix(item.text)
    if (!label) continue
    const type = INTENT_TYPES.has(item.type) ? item.type : 'think'
    intents.push({ type, text: label, status: item.status === 'done' ? 'done' : 'running' })
    if (intents.length >= 4) break
  }
  const summary = typeof parsed.summary === 'string' ? parsed.summary : ''
  const title = typeof parsed.title === 'string' ? parsed.title.replace(/\s+/g, ' ').replace(/^显示/, '').trim().slice(0, 14) : ''
  if (!summary && !intents.length) return null
  return { summary, title, intents }
}

/**
 * 整段正文就是执行意图 JSON 时（模型输出了计划却没真的发起 tool_calls），把它剥成空串，
 * 交给上层兜底，绝不能把 JSON 当回答渲染给用户。
 * 只在「整段就是一个 JSON 对象」时动手：正文里夹着用户要的 JSON 示例（代码块）不会被误删。
 */
function stripPlanJson(rawText) {
  const raw = String(rawText ?? '').trim()
  const body = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
  // 计划 JSON 的特征：同时出现 title 与 summary / intent_collection。
  // 模型偶尔会把它包在 ``` 或 <p> 里，甚至带中文引号导致 JSON.parse 失败，
  // 所以不能只靠「能不能 parse」，还要看特征。
  const looksLikePlan = (text) => /"title"\s*:/.test(text) && /"summary"\s*:/.test(text)
  if (body.startsWith('{') && looksLikePlan(body)) return ''
  const plain = htmlToPlain(raw)
  if (looksLikePlan(plain)) {
    const leftover = plain
      .replace(/```[a-z]*/gi, '')
      .replace(/\{[\s\S]*\}/g, '')
      .replace(/[\s，。；、:：]/g, '')
    // 去掉这段 JSON 后几乎没剩下正文 → 整段都不是给人看的
    if (leftover.length < 8) return ''
  }
  return raw
}

/**
 * 组装一轮的执行意图：
 * - 模型按规范给了 intent_collection → 按 done → running 重排后直接用；
 * - 模型没给（当前 glm-4-flash 在 tools + stream 下只发 tool_calls、不写计划文本）→
 *   按真实工具动作生成，一个工具一条意图；用户问的是「怎么样／适合吗／推荐哪」时，
 *   补一条取到事实后必然要做的归纳步骤，不编造没有发生的动作；
 * - slots 记录「第 i 个 tool_call 对应第几条意图」，前端据此推进状态而不是靠文案匹配。
 */
function buildPlanRound(toolCalls, modelPlan, userText) {
  const actions = toolCalls.map((tc) => {
    let args = {}
    try { args = JSON.parse(tc.function.arguments || '{}') } catch { /* 参数异常时用无对象文案 */ }
    return {
      name: tc.function.name,
      action: describeToolAction(tc.function.name, args),
      goal: describeToolGoal(tc.function.name, args),
    }
  })

  if (modelPlan?.intents?.length) {
    const done = []
    const running = []
    for (const item of modelPlan.intents) (item.status === 'done' ? done : running).push(item)
    const intents = [...done, ...running]
    const slots = []
    let cursor = done.length
    for (const { name, action } of actions) {
      if (cursor < intents.length) {
        slots.push(cursor)
        cursor += 1
      } else {
        intents.push({ type: TOOL_INTENT_TYPE[name] ?? 'read', text: action, status: 'running' })
        slots.push(intents.length - 1)
      }
    }
    const summary = tidySummary(modelPlan.summary) || `正在${actions.map(a => a.goal).join('，')}`
    const title = modelPlan.title || intentSetTitle(actions, null)
    return { summary, title, intents, slots }
  }

  const intents = []
  const slots = []
  actions.forEach(({ name, action }, index) => {
    intents.push({ type: TOOL_INTENT_TYPE[name] ?? 'read', text: action, status: 'running' })
    slots.push(index)
  })

  const follow = JUDGEMENT_PATTERN.test(String(userText ?? ''))
    ? FOLLOW_UP_INTENT[actions[actions.length - 1]?.name]
    : null
  if (follow) intents.push({ type: follow.type, text: follow.text, status: 'running' })

  const head = actions.map(a => a.goal).join('，')
  const summary = tidySummary(follow ? `${head}并${follow.summary}` : head)
  return { summary, title: intentSetTitle(actions, follow), intents, slots }
}

async function serveStatic(req, res, urlPath) {
  const decoded = decodeURIComponent(urlPath.split('?')[0])
  const relative = decoded === '/' ? '/index.html' : decoded
  const filePath = path.resolve(STATIC_DIR, `.${relative}`)
  if (!filePath.startsWith(STATIC_DIR + path.sep) && filePath !== STATIC_DIR) {
    res.writeHead(403); res.end('Forbidden'); return
  }
  try {
    const info = await stat(filePath)
    if (info.isDirectory()) throw new Error('is directory')
    const body = await readFile(filePath)
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(filePath).toLowerCase()] ?? 'application/octet-stream',
      'Cache-Control': 'no-cache',
    })
    res.end(body)
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
    res.end('Not found')
  }
}

export async function handleChat(req, res) {
  let body
  try {
    const chunks = []
    for await (const chunk of req) chunks.push(chunk)
    body = JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    sendJson(res, 400, { error: 'invalid JSON body' }); return
  }

  const messages = Array.isArray(body.messages)
    ? body.messages
      .filter(m => m && typeof m.content === 'string' && m.content.trim())
      .map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content.slice(0, 20000) }))
      .slice(-20)
    : []
  if (!messages.length) {
    sendJson(res, 400, { error: 'messages is empty' }); return
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  })
  sse(res, 'run.start', { runId: body.runId ?? null })

  const controller = new AbortController()
  // 模型请求硬超时：Vercel 函数机房（境外）连 open.bigmodel.cn 可能长期无响应，
  // 不兜底的话前端会永远停在「正在思考」。到时主动 abort，由主流程 catch 发 run.error。
  let upstreamTimedOut = false
  const upstreamGuard = setTimeout(() => {
    upstreamTimedOut = true
    controller.abort(new Error('模型服务响应超时，请稍后重试'))
  }, 45000)
  let closed = false
  const close = () => { if (!closed) { closed = true; controller.abort() } }
  // 只听 res 的 close：req 的 'close' 在请求体读完（小请求几乎立刻）就触发，
  // Vercel 运行时下会被误判成客户端断开——后续事件全被吞、连接永远吊着，
  // 正是线上「无限正在思考」且 45s 超时兜底看似没生效的根因。客户端断开必然伴随 res close。
  res.on('close', close)

  // 「立即执行」模式下直接把 create_automation 从工具表里摘掉：
  // 光靠 system 说不许建，弱模型仍会把执行文案当成新建任务去追问排期；工具不在，就无从误调。
  const activeTools = body.automationRun === true
    ? TOOL_SCHEMAS.filter(tool => tool.function.name !== 'create_automation')
    : TOOL_SCHEMAS
  // 新建自动化任务弹窗发起的一轮：四项条件在弹窗里已经填齐。
  // 带着结构化 seed 进来，一是让模型不用再追问、直接调工具，二是参数以用户填的为准。
  // 前端 payload 不可信：字段白名单 / 类型 / 长度 / 控制字符在独立模块里校验后再拼进 prompt。
  const automationSeed = sanitizeAutomationSeed(body.automationSeed)
  // 带 tools 的会话上下文：system + 历史 + 本轮用户消息。工具结果以 role:tool 回灌到这个数组。
  const conversation = [{ role: 'system', content: body.automationRun === true
    // 自动化任务的「立即执行」：这条消息本身就是任务的执行内容，不是新建任务的指令。
    // 不拦的话，模型看到「汇总未读邮件」这类文案很容易又调一次 create_automation。
    ? `${SYSTEM_PROMPT}\n【当前时间】${nowContext()}。涉及「今天」「明天」「下周」等相对时间时以此为准。\n【本次是任务执行】这是用户已有自动化任务的本次执行内容，请直接完成这件事并给出结果：不要调用 create_automation，不要追问执行周期或时刻，也不要声称「已创建 / 创建成功 / 已为您设置定时任务」—— 任务在用户创建时就已存在。缺少数据来源或工具时（例如读不到邮箱），如实说明做不到的部分，不要编造执行结果。`
    : automationSeed
      // 弹窗已填齐任务名 / 周期 / 时刻 / 执行内容，模型只负责确认 + 补图标关键词，不要再追问。
      ? `${SYSTEM_PROMPT}\n【当前时间】${nowContext()}。涉及「今天」「明天」「下周」等相对时间时以此为准。\n【本次来自「新建自动化任务」弹窗】用户已在表单里填齐条件（任务名：${automationSeed.title || '未填写，请你按执行内容概括一个 15 字以内的短标题（最多 30 字）'}；周期：${automationSeed.cycle ?? ''}；时刻：${automationSeed.time ?? ''}；执行内容：${automationSeed.goal ?? ''}）。这是确定的创建指令：不要再追问任何一项，直接调用 create_automation，参数沿用用户填写的内容；title 必须是这件事的概括（15 字以内最好，最多 30 字），不许照抄执行内容原文或「帮我创建…」这类外壳；同时给出 2~4 个描述任务语义的英文 iconKeywords（如 "mail inbox"）。工具返回 created:true 后用一两句话确认周期与时刻，不要说「已创建」以外的额外承诺。`
      : `${SYSTEM_PROMPT}\n【当前时间】${nowContext()}。涉及「今天」「明天」「下周」等相对时间时以此为准。` }, ...messages]
  let usage = null
  // 真实来源：只有工具在 output 里带 sources 时才累积；无来源的回答 run.end 下发空数组，前端据此不显示来源徽标。
  let collectedSources = []
  // create_automation 判定条件不齐时，服务端给的标准追问。模型偶尔会把它包装成
  // 「已创建自动化任务，但需要您提供…」—— 这种「已创建」是硬伤，下面用它兜底纠正。
  let clarifyQuestion = ''

  // 本轮所有工具的真实执行记录：结果自检拿它跟回答逐条对账。
  const toolLog = []
  // 本轮已执行过的工具结果：同参数重复调用直接复用，避免「同一个城市查两遍」。
  const toolCache = new Map()

  /** 调一次模型（流式），把这一轮的正文 chunk 收进 textChunks，把 tool_calls 按 index 拼完整。 */
  async function callModel(options = {}) {
    const messages = options.messages ?? conversation
    const tools = 'tools' in options ? options.tools : activeTools
    const upstream = await fetch(`${config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        messages,
        tools,
        tool_choice: 'auto',
        stream: true,
        temperature: 0.6,
      }),
      signal: controller.signal,
    })

    if (!upstream.ok || !upstream.body) {
      const detail = await upstream.text().catch(() => '')
      let message = `模型服务返回 ${upstream.status}`
      try {
        const parsed = JSON.parse(detail)
        if (parsed?.error?.message) message = parsed.error.message
      } catch { /* 响应不是 JSON，保留默认提示 */ }
      const error = new Error(message)
      error.code = upstream.status
      throw error
    }

    const decoder = new TextDecoder()
    let buffer = ''
    const textChunks = []
    const toolCalls = new Map() // index -> { id, type, function:{ name, arguments } }

    for await (const chunk of upstream.body) {
      if (closed) break
      buffer += decoder.decode(chunk, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''
      for (const raw of lines) {
        const line = raw.trim()
        if (!line.startsWith('data:')) continue
        const data = line.slice(5).trim()
        if (!data || data === '[DONE]') continue
        let parsed
        try { parsed = JSON.parse(data) } catch { continue }
        if (parsed?.usage) usage = parsed.usage
        const delta = parsed?.choices?.[0]?.delta ?? {}

        // 正文先缓冲，不在流中途推送：工具轮里模型偶尔也会带一句过渡文字，
        // 只有当整轮结束确认没有 tool_calls 时，才能把正文交给前端（保证「处理完才出正文」）。
        if (typeof delta.content === 'string' && delta.content.length) textChunks.push(delta.content)

        // 流式 tool_calls：同一 index 的 arguments 会分片到达，必须按 index 累加拼接
        if (Array.isArray(delta.tool_calls)) {
          for (const part of delta.tool_calls) {
            const idx = Number.isInteger(part.index) ? part.index : 0
            const prev = toolCalls.get(idx) ?? { id: '', type: 'function', function: { name: '', arguments: '' } }
            if (part.id) prev.id = part.id
            if (part.type) prev.type = part.type
            if (part.function?.name) prev.function.name += part.function.name
            if (part.function?.arguments) prev.function.arguments += part.function.arguments
            toolCalls.set(idx, prev)
          }
        }
      }
    }
    return { text: textChunks.join(''), textChunks, toolCalls: [...toolCalls.values()].filter(tc => tc.function.name) }
  }

  /** 自检不通过：让模型只重写正文（不带工具），按真实执行结果把话说回来。 */
  async function rewriteAnswer(previous, verdict) {
    const { text } = await callModel({
      messages: [
        ...conversation,
        { role: 'assistant', content: htmlToPlain(previous) },
        { role: 'user', content: buildRewritePrompt(verdict) },
      ],
      tools: undefined,
    })
    return stripPlanJson(text).trim()
  }

  try {
    // ── 先给整件事一句概括 ──
    // 模型每轮只会概括「当前这一步」（正在查询重庆天气），多步任务就变成好几个块、
    // 好几行行动说明。这里先单独让它把整件事概括成一句话，前端只渲染这一行。
    let taskPlan = null
    const askedText = [...messages].reverse().find(m => m.role === 'user')?.content ?? ''
    if (!body.automationRun && !automationSeed && askedText.trim().length >= 8) {
      try {
        const { text: planText } = await callModel({
          tools: undefined,
          messages: [
            ...conversation,
            {
              role: 'user',
              content: '（系统提示：先用一句话概括我这次要办的整件事，要覆盖全部诉求；再给它一个 4～10 字的名词性短语。只输出 JSON，例如 {"title":"天气查询与出行建议","summary":"正在查询重庆与北京的天气情况，对比并给出出行与消费建议"}。不要调用工具，不要输出任何其他内容。）',
            },
          ],
        })
        // 注意：这里不能先过 stripPlanJson——它会把「含 title+summary 的 JSON」整段剥掉，
        // 而这段恰恰就是我们想要的。直接取第一个 JSON 对象。
        const json = /\{[\s\S]*\}/.exec(planText)
        if (json) {
          const parsed = JSON.parse(json[0])
          if (parsed?.summary) {
            taskPlan = {
              title: String(parsed.title ?? '').trim().slice(0, 20),
              summary: String(parsed.summary).trim().slice(0, 60),
            }
          }
        }
      } catch { /* 概括失败不影响主流程：回退到模型的单步 summary */ }
    }

    // ── Agent 循环：plan → 模型出 tool_call → 执行工具 → 结果回灌 → 再调模型，直到模型不再要工具 ──
    // 用 while 而不是 for：步数用尽后还要再跑一轮「撤掉工具、强制收口」，
    // 否则多工具任务会在第 N 步被硬切断，用户一个字都收不到。
    let step = 0
    let capped = false
    let dupStreak = 0
    let automationTried = false
    let jsonRetried = false
    // 「正文提工具却没调」的重试也只给一次，避免和 jsonRetried 互相喂招死循环
    let toolMentionRetried = false
    // 「纸面工具调用」解析替执行也只做一次
    let fakeToolTried = false
    // 本轮用户原话（供 create_automation 兜底解析排期用）
    const lastUserContent = [...messages].reverse().find(m => m.role === 'user')?.content ?? ''
    while (true) {
      if (closed) return
      // 步数用尽：不给工具，只让它把已有结果讲清楚
      if (step >= MAX_AGENT_STEPS) {
        capped = true
        conversation.push({
          role: 'user',
          content: '（系统提示：工具调用步数已用尽。请立刻停止调用工具，直接基于上面已经拿到的结果组织最终回答；确实没查到的部分，明确说明缺什么，不要编造。）',
        })
      }
      const { text, textChunks, toolCalls } = await callModel(capped ? { tools: undefined } : {})
      if (process.env.AGENT_DEBUG) console.log(`[round ${step}${capped ? ' capped' : ''}] calls=${toolCalls.map(t => t.function.name).join(',') || '-'} text=${htmlToPlain(text || '').slice(0, 40)}`)
      if (closed) return

      if (toolCalls.length === 0) {
        // ── 漏项补做：多诉求任务里模型常常做完前几项就收口，把「建一个自动化任务」
        // 这类要求整段忘掉（正文里还说已经做了）。收口前补一次，不给它悄悄跳过的机会。
        if (!capped && !automationTried) {
          const askedText = [...messages].reverse().find(m => m.role === 'user')?.content ?? ''
          const wantsAutomation = /(自动化任务|定时任务)/.test(askedText)
            || /(每天|每周|每月|每年|以后每).{0,24}(提醒我|发我|发给我|告诉我|汇总|推送|生成)/.test(askedText)
            || /(创建|建|设置|加|做)一?个.{0,10}(自动化|定时|提醒)/.test(askedText)
          const alreadyCalled = toolLog.some(entry => entry.name === 'create_automation')
          if (wantsAutomation && !alreadyCalled) {
            automationTried = true
            conversation.push({ role: 'assistant', content: '还有一项要求没执行，我补上。' })
            conversation.push({
              role: 'user',
              content: '（系统提示：用户还要求创建一个自动化任务，你还没有调用 create_automation。现在立刻调用它把任务建好（周期和时刻按用户原话）。这一轮只调用工具、不要写正文，完整回答等所有工具都执行完再一次性写。）',
            })
            step++
            continue
          }
        }
        // 模型不再请求工具 → 这一轮就是最终回答。此时才发 answer.start 并回放正文，
        // 前端逐块收到 delta，仍有逐字渲染的观感，但绝不会跟工具阶段重叠。
        // 模型有时会只输出执行意图 JSON 却不真的调工具，这种 JSON 绝不能当正文给用户看。
        let rawAnswer = stripPlanJson(text)
        // 模型只吐了执行意图 JSON、没写正文：再给它一次机会（只一次，避免死循环）
        if (!rawAnswer.trim() && !jsonRetried) {
          jsonRetried = true
          conversation.push({ role: 'assistant', content: '（只输出了计划，没有写正文）' })
          conversation.push({
            role: 'user',
            content: '（系统提示：你刚才只输出了计划 JSON，既没调用工具也没写正文。现在立刻发起 tool_calls 去执行（如果还需要查数据），或者直接用中文写回答正文；不要再输出任何 JSON、代码块或英文键名。）',
          })
          step++
          continue
        }
        // 模型没调工具、正文却在说「调用工具 / 帮您查 / 需要查询」：它把该自己做的动作
        // 推回给了用户（实测「现在美股的情况」被回「您需要我调用工具来获取…吗？」）。
        // 这种正文绝不能发出去——注入系统提示强制它要么调工具、要么基于已有知识直接作答。
        const plainNow = htmlToPlain(rawAnswer)
        // 弱模型有时把工具调用写成正文文本（"web_search {\"query\":…}"）：解析成真实调用替它执行，
        // 结果回灌 conversation（与真实 tool_call 同一套事件流），下一轮模型基于结果写正文。
        const fakeBody = plainNow.trim().replace(/^```[a-z]*\s*/i, '').replace(/\s*```$/i, '')
        const fakeMatch = /^([a-z_]+)\s*[:：]?\s*(\{[\s\S]*\})\s*$/.exec(fakeBody)
        const fakeName = fakeMatch && TOOL_SCHEMAS.some(t => t.function.name === fakeMatch[1]) ? fakeMatch[1] : null
        let fakeArgs = null
        if (fakeName) { try { fakeArgs = JSON.parse(fakeMatch[2]) } catch { fakeArgs = null } }
        if (fakeName && fakeArgs && typeof fakeArgs === 'object' && !fakeToolTried) {
          fakeToolTried = true
          const tcId = `fake_${Date.now()}`
          const meta = TOOL_META[fakeName] ?? { label: fakeName, icon: 'tool' }
          const fakeCall = { id: tcId, function: { name: fakeName, arguments: JSON.stringify(fakeArgs) } }
          const plan = buildPlanRound([fakeCall], null, lastUserContent)
          sse(res, 'plan.summary', { text: plan.summary, title: plan.title, round: step, intents: plan.intents, slots: plan.slots })
          conversation.push({ role: 'assistant', content: '', tool_calls: [{ id: tcId, type: 'function', function: fakeCall.function }] })
          const action = describeToolAction(fakeName, fakeArgs)
          sse(res, 'tool.call', { callId: tcId, name: fakeName, label: action, icon: meta.icon, running: `正在${action}`, round: step, args: fakeArgs })
          const result = await executeTool(fakeName, fakeArgs, { userText: lastUserContent })
          if (fakeName === 'create_automation' && result.output?.created === false && result.output?.question) {
            clarifyQuestion = String(result.output.question)
          }
          sse(res, 'tool.result', { callId: tcId, name: fakeName, label: action, ok: result.ok, round: step, output: result.output })
          if (result.ok && Array.isArray(result.output?.sources) && result.output.sources.length) {
            collectedSources.push(...result.output.sources)
          }
          conversation.push({ role: 'tool', tool_call_id: tcId, content: JSON.stringify(result.output) })
          toolLog.push({ name: fakeName, ok: Boolean(result.ok), output: result.output })
          step++
          continue
        }
        if (!toolMentionRetried && !capped && /工具|需要[^，。；]{0,6}(查|搜索|检索|获取)|无法(提供|获取)[^，。；？！]{0,8}最新/.test(plainNow)) {
          toolMentionRetried = true
          conversation.push({ role: 'assistant', content: rawAnswer })
          conversation.push({
            role: 'user',
            content: '（系统提示：你刚才的回答在「提工具」但没有调用任何工具，这是不允许的。要么现在就发起 tool_calls 调用合适的工具（实时行情、新闻、价格用 web_search），要么直接基于已有知识用中文写完整回答，不许反问用户「要不要查」、不许在正文里提「调用工具」。二选一，现在就做。）',
          })
          step++
          continue
        }
        if (!rawAnswer.trim()) rawAnswer = '（暂时没有生成可展示的内容，请重试一次）'
        // 条件不齐（created:false）时，模型喜欢写「已创建…，但需要您提供…」：
        // 只保留服务端生成的那句追问，别让用户以为任务已经建好了。
        const answer = clarifyQuestion && /已(为您)?创建|创建成功|已设置|已经创建|创建好了/.test(htmlToPlain(rawAnswer))
          ? `<p>${clarifyQuestion.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>`
          : rawAnswer

        // ── 结果自检：正文还压在服务端缓冲里，先拿它跟本轮工具的真实记录对一遍账 ──
        // 不通过就让模型带着问题重写一次；重写仍不通过，把没对上的地方写在回答前面。
        // 只在本轮真的调过工具时展示「核对」这一步，纯聊天不打扰用户。
        const normalized = plainToHtml(answer)
        let finalAnswer = normalized === answer ? answer : normalized
        let verdict = null
        let retried = false
        if (toolLog.length) {
          sse(res, 'verify.start', { attempt: 1, label: '核对回答与依据' })
          verdict = verifyAnswer({ answerHtml: finalAnswer, toolLog, sources: collectedSources })
          // 留住「核对中」这一行的可见时间（前端逐条揭示是 400ms 一拍），
          // 否则两个事件同帧到达，用户根本看不到这一步在跑
          await new Promise(resolve => setTimeout(resolve, 520))
          if (closed) return
          if (!verdict.ok) {
            retried = true
            sse(res, 'verify.retry', { attempt: 2, label: '发现不一致，按依据重写', note: verdict.note })
            const rewritten = await rewriteAnswer(finalAnswer, verdict)
            if (closed) return
            if (htmlToPlain(rewritten).trim().length >= 8) finalAnswer = rewritten
            verdict = verifyAnswer({ answerHtml: finalAnswer, toolLog, sources: collectedSources })
            await new Promise(resolve => setTimeout(resolve, 260))
            if (closed) return
            if (!verdict.ok) {
              const note = String(verdict.note).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
              finalAnswer = `<p>有一项没能核对通过：${note}。下面是按现有依据整理的内容，请再确认。</p>${finalAnswer}`
            }
          }
          sse(res, 'verify.result', { ok: verdict.ok, retried, note: verdict.note })
          if (closed) return
        }

        sse(res, 'answer.start', {})
        if (finalAnswer === text) {
          for (const chunk of textChunks) {
            if (closed) break
            sse(res, 'message.delta', { text: chunk })
          }
        } else {
          sse(res, 'message.delta', { text: finalAnswer })
        }
        if (closed) return
        // 正文已经发完：先单独发 answer.end，让前端立刻收尾打字机、出操作项，
        // 不能等推荐追问生成（那次调用要好几秒），否则操作项会跟推荐问题一起冒出来。
        sse(res, 'answer.end', {})
        if (closed) return
        // 推荐追问基于本轮问题和最终回答单独生成；生成失败就返回空数组，前端不展示通用模板。
        const lastUser = [...messages].reverse().find(m => m.role === 'user')
        const followUps = await generateFollowUps({
          userText: lastUser?.content ?? '',
          answerHtml: finalAnswer,
          signal: controller.signal,
        })
        if (closed) return
        sse(res, 'run.end', { text: finalAnswer, plainText: htmlToPlain(finalAnswer), usage, sources: collectedSources, followUps })
        return
      }

      // 工具已撤掉还要求调工具：模型没听话，不能再转圈。直接把已有结果收口。
      if (capped) {
        const fallback = '<p>这个问题要跑的步骤超过了单轮上限，我先按已经拿到的结果说：能查到的部分见上，没查到的先不动手，避免给你错的结论。</p>'
        sse(res, 'answer.start', {})
        sse(res, 'message.delta', { text: fallback })
        sse(res, 'answer.end', {})
        sse(res, 'run.end', { text: fallback, plainText: htmlToPlain(fallback), usage, sources: collectedSources, followUps: [] })
        return
      }

      conversation.push({ role: 'assistant', content: text || '', tool_calls: toolCalls })

      // 重复调用吸收：模型经常把「刚查过的天气」再查一遍。整轮都是同参数重复调用时，
      // 直接用上次结果回灌，不执行也不发事件——否则用户会看到「获取重庆天气」重复两遍，
      // 既浪费步数又显得笨。（写工具不去重，每次调用都可能有副作用。）
      const cacheKeyOf = (tc) => {
        if (tc.function.name === 'create_automation') return ''
        try {
          return `${tc.function.name}:${JSON.stringify(JSON.parse(tc.function.arguments || '{}'))}`
        } catch { return '' }
      }
      if (toolCalls.length > 0 && toolCalls.every(tc => {
        const key = cacheKeyOf(tc)
        return key && toolCache.has(key)
      })) {
        // 连续第二次还在重复：说明提示没劝住它，别再空转，直接进收口轮。
        dupStreak += 1
        if (dupStreak >= 2) capped = true
        for (const tc of toolCalls) {
          const cached = toolCache.get(cacheKeyOf(tc))
          conversation.push({
            role: 'tool',
            tool_call_id: tc.id,
            content: `${JSON.stringify(cached)}\n（这条结果本轮已经拿到过，不要重复调用同一工具，直接用已有结果回答。）`,
          })
        }
        conversation.push({
          role: 'user',
          content: '（系统提示：上面这些结果你已经拿到了，不要再调用同一个工具。现在请直接用它们回答用户，缺的部分说明缺什么。）',
        })
        step++
        continue
      }

      // 有工具调用：模型在 tool_calls 前会先输出一段执行意图 JSON（summary + intent_collection）。
      // 这里解析成「一句行动说明 + 一组带类型的执行意图」，解析不出来时按真实工具动作兜底，
      // 保证前端拿到的永远是规范结构，不会把「我将…回答您的全部问题」这类原话漏到界面上。
      const plan = buildPlanRound(
        toolCalls,
        parseIntentPlan(htmlToPlain(text).trim()),
        [...messages].reverse().find(m => m.role === 'user')?.content,
      )
      // 意图随摘要一起下发：前端在摘要出现的同一刻就能渲染出执行中的意图，
      // 不必等 tool.call 才出现动作行，避免工具很快返回时「摘要 → 完成」之间没有任何执行反馈。
      sse(res, 'plan.summary', { text: taskPlan?.summary || plan.summary, title: taskPlan?.title || plan.title, round: step, intents: plan.intents, slots: plan.slots })

      for (const tc of toolCalls) {
        if (closed) return
        const meta = TOOL_META[tc.function.name] ?? { label: tc.function.name, icon: 'tool', running: `正在执行 ${tc.function.name}` }
        let args = {}
        try { args = JSON.parse(tc.function.arguments || '{}') } catch { /* 参数不是 JSON，按空对象执行，工具会回灌错误 */ }
        // 弹窗创建：用户填的条件是唯一事实来源，模型漏字段/改时刻都以 seed 为准，
        // 避免它把「每天 15:49」写成 09:00 或反过来追问用户。
        if (automationSeed && tc.function.name === 'create_automation') {
          args = {
            ...args,
            title: automationSeed.title || args.title,
            goal: automationSeed.goal || args.goal,
            cycle: automationSeed.cycle || args.cycle,
            time: automationSeed.time || args.time,
            weekdays: automationSeed.weekdays?.length ? automationSeed.weekdays : args.weekdays,
            monthDays: automationSeed.monthDays?.length ? automationSeed.monthDays : args.monthDays,
          }
        }
        // UI 不显示工具名，显示带执行对象的动作：获取重庆天气 / 计算 (128*36+50)/2。
        const action = describeToolAction(tc.function.name, args)
        sse(res, 'tool.call', { callId: tc.id, name: tc.function.name, label: action, icon: meta.icon, running: `正在${action}`, round: step, args })

        const result = await executeTool(tc.function.name, args, {
          // 弹窗创建以表单为准，不拿用户原话卡时刻
          userText: automationSeed ? '' : ([...messages].reverse().find(m => m.role === 'user')?.content ?? ''),
        })
        // 条件不齐时任务并没有创建：动作文案改成「核对任务条件」，
        // 否则用户展开执行过程会看到「创建自动化任务」已完成，误以为已经建好。
        const resultLabel = tc.function.name === 'create_automation' && result.output?.created === false ? '核对任务条件' : action
        sse(res, 'tool.result', { callId: tc.id, name: tc.function.name, label: resultLabel, ok: result.ok, round: step, output: result.output })
        if (tc.function.name === 'create_automation' && result.output?.created === false && result.output?.question) {
          clarifyQuestion = String(result.output.question)
        }

        // 工具可在 output.sources 里返回真实来源（如联网搜索 / 文件检索的结果引用）；
        // 累积后随 run.end 下发，前端只在收到非空 sources 时才显示来源徽标。
        if (result.ok && Array.isArray(result.output?.sources) && result.output.sources.length) {
          collectedSources.push(...result.output.sources)
        }

        conversation.push({ role: 'tool', tool_call_id: tc.id, content: JSON.stringify(result.output) })
        // 自检依据：工具名、是否成功、真实产出。只记事实，不做解释。
        toolLog.push({ name: tc.function.name, ok: Boolean(result.ok), output: result.output })
        const cacheKey = tc.function.name === 'create_automation' ? '' : `${tc.function.name}:${JSON.stringify(args)}`
        if (cacheKey && result.ok) toolCache.set(cacheKey, result.output)
      }
      step++
    }
  } catch (error) {
    // 尽力把失败告诉前端：连接真断了写入会被 sse 内部吞掉，不会抛错
    sse(res, 'run.error', {
      code: upstreamTimedOut ? 'UPSTREAM_TIMEOUT' : 'UPSTREAM_FAILED',
      message: upstreamTimedOut ? '模型服务响应超时，请稍后重试' : error?.message ?? '模型调用失败',
    })
  } finally {
    clearTimeout(upstreamGuard)
    try { res.end() } catch { /* 已断开 */ }
  }
}

// 仅在直接运行（node server/index.mjs，即 npm run serve）时启动 HTTP 服务；
// 被 Serverless（api/*.mjs）import 时跳过，不能在函数环境里 listen
const isMainProcess = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (isMainProcess) {
  if (startupErrors.length) process.exit(1)

createServer((req, res) => {
  const url = req.url ?? '/'
  if (req.method === 'GET' && url === '/api/health') {
    sendJson(res, 200, { ok: true, model: config.model })
    return
  }
  if (req.method === 'POST' && url === '/api/chat') {
    handleChat(req, res).catch(error => {
      if (!res.headersSent) sendJson(res, 500, { error: error?.message ?? 'internal error' })
      else res.end()
    })
    return
  }
  // 动效图标运行时：/kubai/element.js 与 /kubai/icons/<name>.js（自定义元素按 name 动态 import，
  // 相对路径必须保持这个结构），hover 时播放图标自带的动效。
  if (req.method === 'GET' && url.startsWith('/kubai/')) {
    readKubaiAsset(url.slice('/kubai/'.length)).then(code => {
      if (!code) { sendJson(res, 404, { error: 'asset not found' }); return }
      res.writeHead(200, {
        'Content-Type': 'text/javascript; charset=utf-8',
        'Cache-Control': 'public, max-age=604800',
      })
      res.end(code)
    }).catch(() => sendJson(res, 500, { error: 'asset fetch failed' }))
    return
  }
  // 任务图标代理：/api/icon?name=mail → icons.kubai.design 上同名图标的 SVG（统一成主色 + 本地缓存）。
  if (req.method === 'GET' && url.startsWith('/api/icon')) {
    const name = new URL(url, 'http://127.0.0.1').searchParams.get('name') ?? ''
    readIconSvg(name).then(svg => {
      if (!svg) { sendJson(res, 404, { error: 'icon not found' }); return }
      res.writeHead(200, {
        'Content-Type': 'image/svg+xml; charset=utf-8',
        'Cache-Control': 'public, max-age=604800',
      })
      res.end(svg)
    }).catch(() => sendJson(res, 500, { error: 'icon fetch failed' }))
    return
  }
  if (req.method === 'GET' || req.method === 'HEAD') {
    serveStatic(req, res, url)
    return
  }
  sendJson(res, 405, { error: 'method not allowed' })
}).listen(PORT, '127.0.0.1', () => {
  console.log(`BlueCloud AI Copilot 已启动：http://127.0.0.1:${PORT}/`)
  console.log(`模型：${config.model}（key 仅存于服务端）`)
})
}
