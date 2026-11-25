// 结果自检（result verification）：回答交给用户之前，先在服务端核对一遍
// 「答案里说的话」和「工具真的做出来的事」是否一致。
// 只做确定性规则，不调模型 —— 自检必须快、必须可解释，不能自己也不可靠。

function stripHtml(html) {
  return String(html ?? '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

// 完成态断言：「已创建」「已把周报发送给同事」这类话，必须有对应的成功工具结果兜底。
// 允许「已」和动作之间夹几个字（已把周报发送），但计划语境（准备发送 / 将会更新）不算。
const DONE_CLAIM = /(已经|已)([^。！？\n]{0,6}?)(创建|新建|添加|发送给|发送|发出|删除|移除|更新|修改|设置|配置|提交|安排|保存|写入|建好|发好)/
const PLANNED = /(准备|将要|即将|待|需要|请|要|可以|能否|如果|一旦|计划)/

function findDoneClaim(plain) {
  for (const match of plain.matchAll(new RegExp(DONE_CLAIM.source, 'g'))) {
    if (PLANNED.test(match[2] ?? '')) continue
    return match[0]
  }
  return ''
}
const APOLOGY = /(未能|没能|无法|失败|出错|抱歉|暂时不|没有成功|未成功|不具备|不支持|做不到)/

// 有真实副作用的工具：它们没成功，正文就不能说「已经做了」。
const WRITE_TOOLS = new Set(['create_automation'])

export function verifyAnswer({ answerHtml, toolLog = [], sources = [] }) {
  const plain = stripHtml(answerHtml)
  const checks = []
  const fails = []
  const warns = []

  const push = (id, label, ok, detail, level = 'fail') => {
    checks.push({ id, label, ok, detail })
    if (!ok) (level === 'warn' ? warns : fails).push(detail)
  }

  // 1) 回答是否完整：空回答 / 只有一句「好的」都不能交给用户
  const tooShort = plain.replace(/\s/g, '').length < 8
  push('content', '核对回答是否完整', !tooShort,
    tooShort ? '回答内容过短，可能没有真正生成' : '')

  // 2) 完成态断言有没有依据
  const claims = findDoneClaim(plain)
  const okWrites = toolLog.filter(entry => entry.ok && WRITE_TOOLS.has(entry.name)
    && !(entry.output && entry.output.created === false))
  const failedWrites = toolLog.filter(entry => entry.name === 'create_automation'
    && entry.output && entry.output.created === false)
  const failedTools = toolLog.filter(entry => !entry.ok)
  // 工具报错、正文却像一切正常，是最伤信任的一种，单独成一条
  const dishonestFailure = failedTools.length > 0 && !APOLOGY.test(plain) && Boolean(claims)
  let claimOk = true
  let claimDetail = ''
  if (claims && okWrites.length === 0 && !dishonestFailure) {
    claimOk = false
    claimDetail = failedWrites.length
      ? `回答里说「${claims}」，但任务条件不齐、并没有创建成功`
      : `回答里说「${claims}」，但本轮没有任何成功的执行记录`
  }
  push('evidence', '核对完成动作是否有依据', claimOk, claimDetail)

  // 3) 工具失败是否如实交代
  push('failure', '核对失败信息是否交代', !dishonestFailure,
    dishonestFailure ? `工具执行失败（${failedTools[0].name}），但回答里没有说明` : '')

  // 3.5) 不许把「还要再查」留给用户：正文说要调工具，本轮却已经结束了
  // 「您需要我调用工具」「需要调用工具来获取」「再查询一些资料」「无法提供美股的最新情况」都算
  const excuse = /(需要|还要|还需|得)[^，。；？！]{0,4}(调用|使用|查询|搜索|检索)[^，。；？！]{0,4}(工具|信息|资料|数据)/.exec(plain)
    || /您需要我.{0,6}(查|搜索|获取)|要我帮您(查|搜索|获取)|无法(提供|获取)[^，。；？！]{0,8}最新/.exec(plain)
  push('excuse', '核对是否遗留未执行的动作', !excuse,
    excuse ? `回答里写「${excuse[0]}」，但工具调用已经结束，用户会等一个不会发生的动作` : '')

  // 3.6) 查过的对象必须写进回答，而且要带上真实数值：查了重庆、成都的天气，
  //     回答只说「任务创建成功，会把天气发给您」，虽然提到了城市名，其实一个数据都没给。
  //     所以判定是「城市名 + 至少一个温度数字」都得出现。
  const weatherPairs = new Map()
  for (const entry of toolLog) {
    if (entry.name !== 'get_weather' || !entry.ok || !entry.output?.location) continue
    const city = String(entry.output.location).split(/[,，]/)[0].trim()
    if (!city || weatherPairs.has(city)) continue
    const temps = [entry.output.todayHigh, entry.output.todayLow, entry.output.temperature]
      .filter(Boolean)
      .map(value => String(value).replace(/[^\d.\-]/g, ''))
      .filter(Boolean)
    weatherPairs.set(city, temps)
  }
  const weatherMisses = [...weatherPairs]
    .filter(([city, temps]) => !plain.includes(city) || (temps.length > 0 && !temps.some(temp => plain.includes(temp))))
    .map(([city]) => city)
  push('coverage', '核对查询结果是否写进回答', weatherMisses.length === 0,
    weatherMisses.length ? `查了${weatherMisses.join('、')}的天气，但回答里没有给出具体气温` : '')

  // 4) 计算结果的数字要对得上（对不上先记为提醒，避免把排版差异算成错误）
  // 只核对最后一次计算（中间步骤不一定写进正文），并容忍四舍五入：
  // 工具返回 8.799999999999999、正文写「8.7 摄氏度」是正常表达，不能算对不上。
  const calc = toolLog.filter(entry => entry.name === 'calculate' && entry.output && entry.output.result !== undefined).at(-1)
  if (calc) {
    const expected = String(calc.output.result)
    const numbers = plain.match(/-?\d+(?:\.\d+)?/g) ?? []
    const decimals = (value) => (String(value).split('.')[1] ?? '').length
    const same = (value) => {
      const a = Number(value)
      const b = Number(calc.output.result)
      if (!Number.isFinite(a) || !Number.isFinite(b)) return false
      const unit = decimals(value) ? Math.pow(10, -decimals(value)) : 1
      return Math.abs(a - b) <= unit + 1e-9
    }
    const matched = numbers.some(same)
    push('numbers', '核对回答中的计算结果', matched,
      matched ? '' : `计算结果是 ${expected}，回答里没有出现这个数字`, 'warn')
  }

  // 5) 说了「来源」却没有来源
  const mentionsSource = /(来源|参考资料|根据资料|检索到)/.test(plain)
  push('source', '核对引用来源', !(mentionsSource && sources.length === 0),
    mentionsSource && sources.length === 0 ? '回答提到来源，但没有可展示的引用' : '', 'warn')

  return {
    ok: fails.length === 0,
    checks,
    fails,
    warns,
    // 给前端做动作行文案用：通过时很轻，不通过时说清楚哪一项没对上
    labels: checks.map(check => check.label),
    note: fails.length ? fails.join('；') : (warns.length ? warns.join('；') : ''),
  }
}

/** 把自检结果写成给模型的重写要求：只给问题，不给答案，让它按工具结果重写。 */
export function buildRewritePrompt({ fails, warns }) {
  const issues = [...fails, ...warns].filter(Boolean)
  return [
    '【自检未通过】你刚才的回答和本轮实际执行结果对不上，请只重写回答正文，不要再调用任何工具。',
    ...issues.map((issue, index) => `${index + 1}. ${issue}`),
    '要求：只陈述真实发生的事；没有成功的动作不要写成「已完成」；条件不齐就直接向用户说明缺什么、并给出一个明确的追问。',
    '如果用户一次问了好几件事，重写时每一件都要回答到（上面的问题就说明有遗漏项）。',
  ].join('\n')
}
