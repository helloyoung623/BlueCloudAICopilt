// Agent 工具注册表：模型自主选择工具，服务端负责执行。
// 每个工具 = OpenAI-compatible function schema（给模型）+ 执行函数（在服务端跑）+ UI 元信息（图标/文案）。
// 零 key 工具：时间 / 计算 / 天气（Open-Meteo 免费公开接口）。
// 联网搜索工具：配置 BRAVE_SEARCH_API_KEY 后自动出现，未配置时不暴露给模型，避免模型误调用。

import { parseEnvFile } from './env.mjs'
import { searchKubaiIcon } from './icons.mjs'

const ENV = { ...parseEnvFile(), ...process.env }
const SEARCH_API_KEY = String(ENV.BRAVE_SEARCH_API_KEY ?? '').trim()

const TIME_TOOL = {
  type: 'function',
  function: {
    name: 'get_current_time',
    description: '获取当前的日期和时间。当用户问「现在几点」「今天几号」「当前时间」「日期」时使用。',
    parameters: {
      type: 'object',
      properties: {
        timezone: { type: 'string', description: '时区 IANA 名称，默认 Asia/Shanghai。如 America/New_York' },
      },
      required: [],
    },
  },
}

const CALC_TOOL = {
  type: 'function',
  function: {
    name: 'calculate',
    description: '精确计算复杂数学表达式（加减乘除、百分比、括号、幂）。仅在表达式较复杂、用户明确要求精确计算或你无法可靠心算时使用；简单加减乘除不要调用。',
    parameters: {
      type: 'object',
      properties: {
        expression: { type: 'string', description: '合法的数学表达式，如 (128*36+50)/2' },
      },
      required: ['expression'],
    },
  },
}

const WEATHER_TOOL = {
  type: 'function',
  function: {
    name: 'get_weather',
    description: '查询指定城市或地点的当前天气（温度、体感、湿度、风速、天气状况），并返回未来几天的预报。当用户问「某地天气怎么样」「今天热不热」「要不要带伞」「未来几天适不适合跑步/出行」时使用。',
    parameters: {
      type: 'object',
      properties: {
        location: { type: 'string', description: '城市或地点的中文/英文名称，如 里斯本、Beijing、上海' },
        days: { type: 'number', description: '要预报的天数，1~7。默认 1（只查今天）；用户问「未来三天/这周末」时传对应天数。' },
      },
      required: ['location'],
    },
  },
}

const WEB_SEARCH_TOOL = {
  type: 'function',
  function: {
    name: 'web_search',
    description: '联网搜索最新资讯（Bing 新闻源）。当用户问实时新闻、近期事件、价格、赛事结果、你不知道的事实或知识可能过期时使用，不要编造。',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '搜索关键词，尽量具体，可带时间/地点' },
        count: { type: 'number', description: '返回条数，默认 5，最多 8' },
      },
      required: ['query'],
    },
  },
}

// 创建自动化任务：本项目的第一个「写」工具。
// 条件不齐时不创建、不猜默认值，只返回 question 让模型转述追问。
// 追问文案由服务端按已知条件拼（「希望每天几点执行？」而不是让模型自由发挥成「每周几」），
// 所以条件不齐也要调用本工具 —— 模型只负责转述 question，不自己编问题。
const CREATE_AUTOMATION_TOOL = {
  type: 'function',
  function: {
    name: 'create_automation',
    description: [
      '创建一个定时自动化任务（到指定时间自动执行 goal 里的内容）。',
      '用户只要表达了「以后/每次/每天/每周/每月/定时/到点提醒」这类重复性安排，就调用本工具；用户已经说过的条件必须填进对应参数（他说「每天」就填 cycle=每天，说「九点」就填 time=09:00），没说到的留空即可，不要自己追问、也不要自己编问题。',
      '本工具会检查条件是否齐全：返回 created:true 表示已创建；返回 created:false 表示还缺条件，此时把 question 原文转述给用户，绝对不能说任务已创建。',
      '不要替用户假设时刻，不要把「早上」「上午」「定期」默认成 09:00。',
    ].join(''),
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string', description: '任务名：用 15 字以内概括这件事（最多不超过 30 字），如「汇总未读邮件」「每日新闻简报」。不要照抄整段指令、不要带「帮我创建」「每天9点」这类外壳；不确定可不填' },
        goal: { type: 'string', description: '到点要执行的具体内容，一句话，如「汇总今天的未读邮件并列出待办」' },
        cycle: { type: 'string', enum: ['每天', '每周', '每月', '仅一次'], description: '执行周期；用户没说就不填' },
        time: { type: 'string', description: '执行时刻，24 小时制 HH:MM，如 09:00、20:30；用户没说就不填' },
        weekdays: {
          type: 'array',
          items: { type: 'string', enum: ['周一', '周二', '周三', '周四', '周五', '周六', '周日'] },
          description: 'cycle 为「每周」时填写，可多选',
        },
        monthDays: {
          type: 'array',
          items: { type: 'string' },
          description: 'cycle 为「每月」时填写，如 ["1号","15号"]',
        },
        iconKeywords: {
          type: 'string',
          description: '用来给任务挑图标的英文关键词，2~4 个、空格分隔，取自任务语义，如 "mail inbox"、"chart line report"、"calendar week"。会拿这些词到图标库 icons.kubai.design 里检索。',
        },
      },
      required: ['goal'],
    },
  },
}

// 给 UI 的展示元信息：步骤名/图标来自 Figma 10083:64848「任务执行过程_ReAct」图标字典。
// icon 值对应前端 ToolKind，真实事件驱动执行过程。
// label 只作为没有参数时的兜底，不再带「查询；」这类工具分类前缀；
// 真实动作文案由 server/index.mjs 的 describeToolAction 结合参数生成。
export const TOOL_META = {
  get_current_time: { label: '获取当前日期与时间', icon: 'terminal', running: '正在获取日期与时间' },
  calculate: { label: '计算数学表达式', icon: 'react-analyze', running: '正在计算表达式' },
  get_weather: { label: '获取指定地点天气', icon: 'react-read', running: '正在查询天气' },
  web_search: { label: '搜索最新信息', icon: 'search', running: '正在联网检索信息' },
  stock_quote: { label: '查询股票行情', icon: 'react-read', running: '正在查询实时行情' },
  create_automation: { label: '创建自动化任务', icon: 'react-execute', running: '正在创建自动化任务' },
}

/** 安全地计算数学表达式：只允许数字与运算符，不用 eval/Function，避免任意代码执行。 */
function safeCalculate(expression) {
  const expr = String(expression ?? '').replace(/\s+/g, '')
  if (!expr) throw new Error('表达式为空')
  if (!/^[\d+\-*/().%]+$/.test(expr)) throw new Error('表达式包含不支持的字符，仅允许数字和 + - * / ( ) . %')
  if (expr.length > 200) throw new Error('表达式过长')

  // 递归下降解析：expr → term ((+|-) term)*；term → factor ((*|/|%) factor)*；factor → number | (expr) | -factor
  let pos = 0
  const peek = () => expr[pos]
  function parseExpr() {
    let value = parseTerm()
    while (peek() === '+' || peek() === '-') {
      const op = expr[pos++]
      const right = parseTerm()
      value = op === '+' ? value + right : value - right
    }
    return value
  }
  function parseTerm() {
    let value = parseFactor()
    while (peek() === '*' || peek() === '/' || peek() === '%') {
      const op = expr[pos++]
      const right = parseFactor()
      if ((op === '/' || op === '%') && right === 0) throw new Error('除数不能为零')
      value = op === '*' ? value * right : op === '/' ? value / right : value % right
    }
    return value
  }
  function parseFactor() {
    if (peek() === '-') { pos++; return -parseFactor() }
    if (peek() === '+') { pos++; return parseFactor() }
    if (peek() === '(') {
      pos++
      const value = parseExpr()
      if (peek() !== ')') throw new Error('括号不匹配')
      pos++
      return value
    }
    const start = pos
    while (pos < expr.length && /[\d.]/.test(expr[pos])) pos++
    if (start === pos) throw new Error('表达式格式错误')
    const num = Number(expr.slice(start, pos))
    if (!Number.isFinite(num)) throw new Error('数字无效')
    return num
  }

  const result = parseExpr()
  if (pos !== expr.length) throw new Error('表达式末尾有多余字符')
  if (!Number.isFinite(result)) throw new Error('计算结果无效')
  return result
}

function formatTimeInZone(timezone) {
  const tz = typeof timezone === 'string' && timezone.trim() ? timezone.trim() : 'Asia/Shanghai'
  const now = new Date()
  try {
    const date = new Intl.DateTimeFormat('zh-CN', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'long' }).format(now)
    const time = new Intl.DateTimeFormat('zh-CN', { timeZone: tz, hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(now)
    return { datetime: `${date} ${time}`, timezone: tz, iso: now.toISOString() }
  } catch {
    // 非法时区回退到本机时区，不让工具报错拖垮整轮
    return { datetime: new Date().toLocaleString('zh-CN'), timezone: 'local', iso: now.toISOString() }
  }
}

const WEATHER_CODES = {
  0: '晴', 1: '大致晴朗', 2: '局部多云', 3: '阴',
  45: '有雾', 48: '冻雾',
  51: '轻微毛毛雨', 53: '毛毛雨', 55: '较强毛毛雨',
  61: '小雨', 63: '中雨', 65: '大雨',
  71: '小雪', 73: '中雪', 75: '大雪', 77: '雪粒',
  80: '阵雨', 81: '较强阵雨', 82: '强阵雨',
  85: '阵雪', 86: '强阵雪',
  95: '雷阵雨', 96: '雷阵雨伴冰雹', 99: '强雷阵雨伴冰雹',
}

async function fetchJson(url, options) {
  const response = await fetch(url, { ...options, signal: AbortSignal.timeout(12000) })
  if (!response.ok) throw new Error(`联网服务返回 ${response.status}`)
  return response.json()
}

// 中文地名直译常命中同名小镇（如「里斯本」会先命中美国北达科他州的 Lisbon），这里补常用别名。
const LOCATION_ALIASES = {
  里斯本: 'Lisbon, Portugal',
  伦敦: 'London, United Kingdom',
  巴黎: 'Paris, France',
  纽约: 'New York, United States',
  东京: 'Tokyo, Japan',
  首尔: 'Seoul, South Korea',
  新加坡: 'Singapore',
  悉尼: 'Sydney, Australia',
  北京: 'Beijing, China',
  上海: 'Shanghai, China',
  广州: 'Guangzhou, China',
  深圳: 'Shenzhen, China',
  成都: 'Chengdu, China',
  杭州: 'Hangzhou, China',
}

async function getWeather(location, days = 1) {
  const placeQuery = String(location ?? '').trim()
  if (!placeQuery) throw new Error('请告诉我要查询哪个地点')
  const resolvedQuery = LOCATION_ALIASES[placeQuery] ?? placeQuery

  // 先用 Open-Meteo 免费 geocoding 把中文/英文地名解析成经纬度。
  // 别名没有覆盖到的重名地点，按人口取最大候选，避免命中同名小镇。
  const geoUrl = new URL('https://geocoding-api.open-meteo.com/v1/search')
  geoUrl.searchParams.set('name', resolvedQuery)
  geoUrl.searchParams.set('count', '10')
  geoUrl.searchParams.set('language', 'zh')
  geoUrl.searchParams.set('format', 'json')
  const geo = await fetchJson(geoUrl)
  const place = [...(geo?.results ?? [])].sort((a, b) => (b.population ?? 0) - (a.population ?? 0))[0]
  if (!place) throw new Error(`没有找到地点「${placeQuery}」`)

  const weatherUrl = new URL('https://api.open-meteo.com/v1/forecast')
  weatherUrl.searchParams.set('latitude', String(place.latitude))
  weatherUrl.searchParams.set('longitude', String(place.longitude))
  weatherUrl.searchParams.set('current', 'temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m')
  weatherUrl.searchParams.set('daily', 'temperature_2m_max,temperature_2m_min,weather_code,precipitation_probability_max')
  weatherUrl.searchParams.set('timezone', 'auto')
  const span = Math.min(Math.max(Number(days) || 1, 1), 7)
  weatherUrl.searchParams.set('forecast_days', String(span))
  const data = await fetchJson(weatherUrl)
  const current = data?.current ?? {}
  const daily = data?.daily ?? {}
  // 多天时给一份逐日预报：模型据此判断「适不适合跑步」，不用再靠感觉编。
  const forecast = span > 1
    ? (daily.time ?? []).map((date, index) => ({
      date,
      condition: WEATHER_CODES[daily.weather_code?.[index]] ?? `天气代码 ${daily.weather_code?.[index]}`,
      high: daily.temperature_2m_max?.[index] != null ? `${daily.temperature_2m_max[index]}°C` : undefined,
      low: daily.temperature_2m_min?.[index] != null ? `${daily.temperature_2m_min[index]}°C` : undefined,
      rainChance: daily.precipitation_probability_max?.[index] != null ? `${daily.precipitation_probability_max[index]}%` : undefined,
    }))
    : undefined
  return {
    location: [place.name, place.admin1, place.country].filter(Boolean).join(', '),
    observedAt: current.time,
    condition: WEATHER_CODES[current.weather_code] ?? `天气代码 ${current.weather_code}`,
    temperature: `${current.temperature_2m}°C`,
    feelsLike: `${current.apparent_temperature}°C`,
    humidity: `${current.relative_humidity_2m}%`,
    windSpeed: `${current.wind_speed_10m} km/h`,
    todayHigh: daily.temperature_2m_max?.[0] != null ? `${daily.temperature_2m_max[0]}°C` : undefined,
    todayLow: daily.temperature_2m_min?.[0] != null ? `${daily.temperature_2m_min[0]}°C` : undefined,
    timezone: data.timezone,
    ...(forecast ? { forecast } : {}),
    sources: [{ title: 'Open-Meteo 实时天气', url: 'https://open-meteo.com/', kind: 'weather' }],
  }
}

async function webSearch(query, count = 5) {
  const searchQuery = String(query ?? '').trim()
  if (!searchQuery) throw new Error('搜索关键词为空')
  // 配了 Brave key 走 Brave；没配 key 走 Bing RSS（免 key），保证「查一下最新消息」永远可用
  const results = SEARCH_API_KEY
    ? await braveSearch(searchQuery, count)
    : await bingSearch(searchQuery, count)
  return {
    query: searchQuery,
    results,
    sources: results.map(item => ({ title: item.title, url: item.url, kind: 'web' })),
  }
}

async function braveSearch(searchQuery, count) {
  const limit = Math.min(8, Math.max(1, Number(count) || 5))
  const url = new URL('https://api.search.brave.com/res/v1/web/search')
  url.searchParams.set('q', searchQuery)
  url.searchParams.set('count', String(limit))
  const data = await fetchJson(url, {
    headers: {
      Accept: 'application/json',
      'X-Subscription-Token': SEARCH_API_KEY,
    },
  })
  return (data?.web?.results ?? []).slice(0, limit).map(item => ({
    title: item.title,
    url: item.url,
    snippet: item.description,
  }))
}

// Bing 新闻 RSS：免 key、结构化（XML）、国内直连。网页搜索 RSS 对脚本限流，
// 新闻源稳定且覆盖 agent 场景里绝大多数搜索诉求（「最新消息」「行情」「近况」）。
async function bingSearch(searchQuery, count) {
  const limit = Math.min(8, Math.max(1, Number(count) || 5))
  const url = new URL('https://www.bing.com/news/search')
  url.searchParams.set('q', searchQuery)
  url.searchParams.set('format', 'rss')
  const response = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' } })
  if (!response.ok) throw new Error(`Bing 搜索失败：HTTP ${response.status}`)
  const xml = await response.text()
  const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].slice(0, limit)
  const results = items.map(([, item]) => {
    const rawLink = decodeXmlText(/<link>([\s\S]*?)<\/link>/.exec(item)?.[1])
    // Bing 新闻的 link 是跳转页，真实地址藏在 url= 参数里
    const realUrl = /[?&]url=([^&]+)/.exec(rawLink)?.[1]
    const title = decodeXmlText(/<title>([\s\S]*?)<\/title>/.exec(item)?.[1])
    const snippet = decodeXmlText(/<description>([\s\S]*?)<\/description>/.exec(item)?.[1])
    const pubDate = decodeXmlText(/<pubDate>([\s\S]*?)<\/pubDate>/.exec(item)?.[1])
    const source = decodeXmlText(/<News:Source>([\s\S]*?)<\/News:Source>/.exec(item)?.[1])
    const time = pubDate ? new Date(pubDate).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }) : ''
    const label = source ? `${title}（${source}${time ? ' · ' + time : ''}）` : title
    return { title: label, url: realUrl ? decodeURIComponent(realUrl) : rawLink, snippet: time ? `${time} ${snippet}` : snippet }
  }).filter(r => r.title)
  if (!results.length) throw new Error('Bing 新闻搜索没有返回结果')
  return results
}

function decodeXmlText(value) {
  return String(value ?? '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'").replace(/&apos;/g, "'").replace(/&amp;/g, '&')
    .replace(/<[^>]+>/g, '')
    .trim()
}

// ── 股票 / 指数行情（腾讯财经，免费无 key，国内直连）──────────────────────────
const STOCK_ALIAS = {
  纳斯达克: 'usIXIC', 纳指: 'usIXIC', 美股科技: 'usIXIC',
  道琼斯: 'usDJI', 道指: 'usDJI',
  标普: 'usINX', 标普500: 'usINX', 标普500指数: 'usINX',
  美股: 'usIXIC,usDJI,usINX', 美股三大指数: 'usIXIC,usDJI,usINX', 美股大盘: 'usIXIC,usDJI,usINX',
  上证: 'sh000001', 上证指数: 'sh000001', a股: 'sh000001,sz399001', 大盘: 'sh000001,sz399001',
  恒生: 'hkHSI', 恒生指数: 'hkHSI', 港股: 'hkHSI',
}
const STOCK_TOOL = {
  type: 'function',
  function: {
    name: 'stock_quote',
    description: '查询股票/指数实时行情（美股三大指数、A股大盘、恒生指数、美股个股如 usNVDA/usTSLA/usAAPL）。用户问「美股怎么样」「A股多少点」「某股票现在多少钱」时使用。',
    parameters: {
      type: 'object',
      properties: {
        symbols: { type: 'string', description: '逗号分隔的行情代码或市场别名，如 usIXIC、纳斯达克、美股、sh000001、usNVDA。用户泛指「美股」时填「美股」' },
      },
      required: ['symbols'],
    },
  },
}

// 给模型的 tools 数组：web_search 走 Bing RSS 兜底（免 key），stock_quote 走腾讯财经（免 key），都永远可用。
export const TOOL_SCHEMAS = [
  TIME_TOOL,
  CALC_TOOL,
  WEATHER_TOOL,
  STOCK_TOOL,
  WEB_SEARCH_TOOL,
  CREATE_AUTOMATION_TOOL,
]

async function fetchStockQuote(rawSymbols) {
  const tokens = String(rawSymbols ?? '').split(/[,，\s]+/).filter(Boolean)
  if (!tokens.length) throw new Error('行情代码为空')
  const codes = [...new Set(tokens.map(t => {
    const key = t.toLowerCase()
    if (STOCK_ALIAS[key]) return STOCK_ALIAS[key]
    return STOCK_ALIAS[t] ?? (/^(us|sh|sz|hk)[a-z0-9.]+$/i.test(key) ? key : '')
  }).filter(Boolean).flatMap(c => c.split(',')))]
  if (!codes.length) throw new Error(`无法识别行情代码：${tokens.join(', ')}`)

  const url = new URL('https://qt.gtimg.cn/q=' + codes.join(','))
  const response = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } })
  if (!response.ok) throw new Error(`行情接口失败：HTTP ${response.status}`)
  // 接口返回 GBK 编码
  const buffer = Buffer.from(await response.arrayBuffer())
  let text = ''
  try { text = new TextDecoder('gbk').decode(buffer) } catch { text = buffer.toString('latin1') }

  const quotes = []
  for (const match of text.matchAll(/v_([\w.]+)="([^"]*)"/g)) {
    const [, code, payload] = match
    const f = payload.split('~')
    if (f.length < 32 || !f[3]) continue
    const price = Number(f[3])
    const prevClose = Number(f[4]) || price
    const change = Number(f[31]) || price - prevClose
    const changePct = Number(f[32]) || (prevClose ? (change / prevClose) * 100 : 0)
    quotes.push({
      code: f[2] || code,
      name: f[1] || code,
      price,
      prevClose,
      change: Number(change.toFixed(2)),
      changePct: Number(changePct.toFixed(2)),
      currency: f[36] || '',
      observedAt: f[30] || '',
    })
  }
  if (!quotes.length) throw new Error(`没有查到行情：${codes.join(', ')}`)
  return {
    quotes,
    sources: [{ title: '腾讯财经实时行情', url: 'https://gu.qq.com/', kind: 'finance' }],
  }
}

// ── 自动化任务 ────────────────────────────────────────────────────────────────
const AUTOMATION_CYCLES = ['每天', '每周', '每月', '每年', '仅一次', '自定义']
const AUTOMATION_WEEKDAYS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']

// 模型偶尔把「每周五下午五点」整句塞进 goal，参数里却漏了 weekdays / time。
// 这里只从用户原话里抽取**明确写过**的排期补空缺；抽不到照样追问，绝不替用户默认时刻。
const CN_DIGIT = { 零: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10, 十一: 11, 十二: 12 }
const WEEKDAY_ALIAS = {
  一: '周一', 二: '周二', 三: '周三', 四: '周四', 五: '周五', 六: '周六', 日: '周日', 天: '周日',
  1: '周一', 2: '周二', 3: '周三', 4: '周四', 5: '周五', 6: '周六', 7: '周日',
}
// 有没有「具体时刻」：「九点」「9:30」「下午三点半」算；「早上」「上午」这类模糊说法不算。
function hasExplicitClock(value) {
  return /(\d{1,2}|十[一二]?|[零一二两三四五六七八九])\s*(?:[:：]\s*\d{1,2}|点|时)/.test(String(value ?? ''))
}
function guessSchedule(text) {
  const src = String(text ?? '')
  const out = { cycle: '', time: '', weekdays: [], monthDays: [] }
  if (/每天|每日|天天/.test(src)) out.cycle = '每天'
  else if (/每周|每星期|每礼拜|周[一二三四五六日天]|星期[一二三四五六日天]/.test(src)) out.cycle = '每周'
  else if (/每月|每个月/.test(src)) out.cycle = '每月'
  else if (/每年/.test(src)) out.cycle = '每年'
  else if (/仅一次|只执行一次|就一次/.test(src)) out.cycle = '仅一次'

  const dayRe = /(?:每?周|每?星期|礼拜)\s*([一二三四五六日天1-7])/g
  let day = dayRe.exec(src)
  while (day) {
    const value = WEEKDAY_ALIAS[day[1]]
    if (value && !out.weekdays.includes(value)) out.weekdays.push(value)
    day = dayRe.exec(src)
  }
  out.weekdays.sort((a, b) => AUTOMATION_WEEKDAYS.indexOf(a) - AUTOMATION_WEEKDAYS.indexOf(b))

  const monthMatch = /每(?:个)?月\s*(?:的)?\s*(\d{1,2})\s*[号日]/.exec(src)
  if (monthMatch) {
    const value = Number(monthMatch[1])
    if (value >= 1 && value <= 31) out.monthDays.push(`${value}号`)
  }

  const timeRe = /(凌晨|早上|早晨|上午|中午|下午|傍晚|晚上|夜里)?\s*(\d{1,2}|十[一二]?|[零一二两三四五六七八九])\s*(?:[:：]\s*(\d{2})|(?:点|时)\s*(半)?)/
  const clock = timeRe.exec(src)
  if (clock) {
    let hour = /^\d{1,2}$/.test(clock[2]) ? Number(clock[2]) : (CN_DIGIT[clock[2]] ?? NaN)
    const period = clock[1] ?? ''
    if (Number.isFinite(hour)) {
      if (/下午|傍晚|晚上|夜里/.test(period) && hour < 12) hour += 12
      if (/中午/.test(period) && hour <= 10) hour += 12
      const minute = clock[3] ? Number(clock[3]) : clock[4] ? 30 : 0
      if (hour <= 23 && minute <= 59) out.time = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
    }
  }
  return out
}

// 缺条件时只问最关键的 1～2 项：一次抛四个问题像表单，不像对话。
// 文案按「已知条件」拼：已经说了每天，就只问「希望每天几点执行？」，不会再冒出「每周几」。
function missingQuestion(missing, cycle, weekdays) {
  const parts = []
  if (missing.includes('goal')) parts.push('这个任务到点具体要做什么？')
  if (missing.includes('weekdays')) parts.push('每周哪几天执行？')
  if (missing.includes('monthDays')) parts.push('每月几号执行？')
  if (missing.includes('cycle')) parts.push('希望多久执行一次？每天、每周、每月，还是只执行一次？')
  if (missing.includes('time')) {
    // 周期已知就把周期带进问句，避免「每天」被问成「每周几」
    const when = cycle === '每周' && weekdays.length
      ? `每周${weekdays.map(day => day.replace('周', '')).join('、')}`
      : cycle && cycle !== '仅一次' ? cycle : ''
    parts.push(when ? `希望${when}几点执行？给我一个具体时刻，比如 09:00。` : '希望几点执行？给我一个具体时刻，比如 09:00。')
  }
  return parts.slice(0, 2).join('')
}

/**
 * 校验并归一化自动化任务参数。
 * 返回 created:false + question，绝不替用户补默认时刻 —— 让模型把问题抛回给用户。
 */
/**
 * 标题是「任务的概括」：最好 15 字以内，最多 30 字。
 * 模型时不时把整段指令（含「帮我创建一个自动化任务「…」：每天 9 点…」）当标题塞回来，
 * 这里统一收敛：剥外壳 → 去排期前缀 → 只留第一句 → 超长在标点处收口 → 硬上限 30。
 */
export function condenseAutomationTitle(raw, fallback = '') {
  const TITLE_MAX = 30
  const stripWrapper = (value) => {
    let current = value
    for (let i = 0; i < 4; i += 1) {
      const before = current
      current = current
        .replace(/^(?:帮我|请你?|麻烦你?|劳烦|我想要?|我需要|需要你?)+/, '')
        .replace(/^(?:创建|新建|新增|添加|设置|设定|建立|做|搞)(?:一个|一条|个|一项)?(?:自动化|定时|定期|周期)?任务/, '')
        .replace(/^[「『"'“‘\s]+/, '')
        .trim()
      if (current === before) break
    }
    return current
  }
  const stripSchedule = (value) => {
    const pattern = /^(?:每天|每日|每周|每月|每年|工作日)\s*[一二三四五六日天]*\s*(?:的)?\s*(?:早上|上午|中午|下午|晚上|凌晨|傍晚)?\s*(?:\d{1,2}\s*[:：]\s*\d{2}|\d{1,2}\s*点\s*(?:半|钟)?)?\s*[，,、:：]?\s*/
    const stripped = value.replace(pattern, '').replace(pattern, '')
    return stripped.length >= 4 ? stripped : value
  }

  let text = String(raw ?? '').replace(/\s+/g, ' ').trim()
  text = stripSchedule(stripWrapper(text))
  const firstClause = text.split(/[。！？；;\n]/)[0]?.trim() ?? ''
  if (firstClause) text = firstClause
  text = stripWrapper(text)
    .replace(/^[「『"'“‘]+|[」』"'”’]+$/g, '')
    .replace(/[。！？；，,、：:.\s]+$/, '')
    .trim()

  if (!text && fallback) text = condenseAutomationTitle(fallback)
  if (!text) return ''

  // 只在超过 30 字时才收口，且收口点必须是标点：按字数硬切会切出半个词
  if (text.length > TITLE_MAX) {
    const slice = text.slice(0, TITLE_MAX)
    const cut = Math.max(slice.lastIndexOf('，'), slice.lastIndexOf('、'), slice.lastIndexOf('；'))
    text = cut >= 10 ? slice.slice(0, cut) : slice
  }
  return text.trim()
}

function buildAutomation(input, context = {}) {
  const missing = []
  const goal = String(input.goal ?? '').replace(/\s+/g, ' ').trim()
  if (goal.length < 2) missing.push('goal')

  // 模型常把 goal 概括成一句没有排期的话（「生成产品周报」），排期只留在用户原话里。
  // 两处都抽一遍，goal 抽到的优先，其次用用户原话，仍然抽不到就追问。
  const fromGoal = guessSchedule(goal)
  const fromUser = guessSchedule(context.fallbackText ?? '')
  const guess = {
    cycle: fromGoal.cycle || fromUser.cycle,
    time: fromGoal.time || fromUser.time,
    weekdays: fromGoal.weekdays.length ? fromGoal.weekdays : fromUser.weekdays,
    monthDays: fromGoal.monthDays.length ? fromGoal.monthDays : fromUser.monthDays,
  }

  const cycle = AUTOMATION_CYCLES.includes(String(input.cycle ?? '').trim())
    ? String(input.cycle).trim()
    : guess.cycle
  if (!cycle) missing.push('cycle')

  // 只接受明确时刻；「早上」「上午」这类由模型先追问。模型给的不是 HH:MM 时，
  // 再按「下午五点 / 9点半」这样的自然说法解析一次。
  const timeText = String(input.time ?? '').trim()
  const timeMatch = /^([01]?\d|2[0-3])\s*[:：]\s*([0-5]\d)$/.exec(timeText)
  const time = timeMatch
    ? `${String(Number(timeMatch[1])).padStart(2, '0')}:${timeMatch[2]}`
    : guessSchedule(timeText).time || guess.time
  if (!time) missing.push('time')

  const pickedWeekdays = Array.isArray(input.weekdays)
    ? [...new Set(input.weekdays.map(value => String(value).trim()).filter(value => AUTOMATION_WEEKDAYS.includes(value)))]
      .sort((a, b) => AUTOMATION_WEEKDAYS.indexOf(a) - AUTOMATION_WEEKDAYS.indexOf(b))
    : []
  const weekdays = pickedWeekdays.length ? pickedWeekdays : guess.weekdays
  if (cycle === '每周' && weekdays.length === 0) missing.push('weekdays')

  const pickedMonthDays = Array.isArray(input.monthDays)
    ? [...new Set(input.monthDays.map((value) => {
      const match = /^(\d{1,2})\s*[号日]?$/.exec(String(value).trim())
      const day = match ? Number(match[1]) : 0
      return day >= 1 && day <= 31 ? `${day}号` : ''
    }).filter(Boolean))].sort((a, b) => Number.parseInt(a, 10) - Number.parseInt(b, 10))
    : []
  const monthDays = pickedMonthDays.length ? pickedMonthDays : guess.monthDays
  if (cycle === '每月' && monthDays.length === 0) missing.push('monthDays')

  if (missing.length) {
    return {
      created: false,
      missing,
      question: missingQuestion(missing, cycle, weekdays),
    }
  }

  // 标题一律收敛成概括：模型给的优先，没有就用「就」的内容概括一句；
  // 无论哪条，最终不超过 30 字（理想 15 字左右）。
  const title = condenseAutomationTitle(input.title, goal) || condenseAutomationTitle(goal) || '自动化任务'
  return { created: true, automation: { title, goal, cycle, time, weekdays, monthDays } }
}

/**
 * 执行一个工具调用。返回 { ok, output }，output 会作为 tool 消息 content 回灌给模型。
 * 工具失败不抛出中断循环，而是把错误回灌，让模型自己决定如何回答（重试 / 说明原因）。
 */
export async function executeTool(name, args, context = {}) {
  try {
    const input = args && typeof args === 'object' ? args : {}
    if (name === 'get_current_time') {
      return { ok: true, output: formatTimeInZone(input.timezone) }
    }
    if (name === 'calculate') {
      const value = safeCalculate(input.expression)
      return { ok: true, output: { expression: String(input.expression), result: value } }
    }
    if (name === 'get_weather') {
      return { ok: true, output: await getWeather(input.location, input.days) }
    }
    if (name === 'web_search') {
      return { ok: true, output: await webSearch(input.query, input.count) }
    }
    if (name === 'stock_quote') {
      return { ok: true, output: await fetchStockQuote(input.symbols) }
    }
    if (name === 'create_automation') {
      // 弱模型爱把没说的时刻默认成 09:00。用户这一轮的原话里根本没有时刻线索时，
      // 丢掉模型给的时间，回到「希望每天几点执行？」的追问，不替用户定时间。
      const userText = String(context.userText ?? '')
      if (userText && !hasExplicitClock(userText) && hasExplicitClock(input.time)) {
        input.time = ''
      }
      // 条件不齐也算「执行成功」，只是没创建：走 ok:false 会被模型当成工具故障去道歉。
      const output = buildAutomation(input, { fallbackText: context.userText })
      if (output.created) {
        // 图标不是写死的：用模型给的英文关键词 + 任务名/内容，去 icons.kubai.design 真实检索。
        // 检索不到（站点不可达 / 关键词太泛）时不下发 icon，前端按任务语义退回本地图标。
        const icon = await searchKubaiIcon([input.iconKeywords, output.automation.title, output.automation.goal])
        if (icon) output.automation.icon = icon
      }
      return { ok: true, output }
    }
    return { ok: false, output: { error: `未知工具：${name}` } }
  } catch (error) {
    return { ok: false, output: { error: error?.message ?? '工具执行失败' } }
  }
}
