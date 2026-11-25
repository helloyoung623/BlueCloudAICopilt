// 自动化任务标题：必须是「任务的概括」，最好 15 字以内、最多 30 字。
// 模型偶尔会把整段指令（含「帮我创建一个自动化任务「…」：每天 9 点…」）当标题塞回来，
// 这里统一做一次收敛：剥掉礼貌语与指令外壳、去掉排期前缀、只留第一句、硬上限 30 字。

const TITLE_MAX = 30;

/** 剥掉「帮我/请/创建…」这类外壳，可重复（模型偶尔套两层） */
function stripWrapper(text: string): string {
  let current = text;
  for (let i = 0; i < 4; i += 1) {
    const before = current;
    current = current
      .replace(/^(?:帮我|请你?|麻烦你?|劳烦|我想要?|我需要|需要你?)+/, "")
      .replace(/^(?:创建|新建|新增|添加|设置|设定|建立|做|搞)(?:一个|一条|个|一项)?(?:自动化|定时|定期|周期)?任务/, "")
      .replace(/^[「『"'“‘\s]+/, "")
      .trim();
    if (current === before) break;
  }
  return current;
}

/** 去掉「每天/每周一/每月5号 + 早上/9 点」这类排期前缀——排期在卡片副标题里已有 */
function stripSchedule(text: string): string {
  const pattern = /^(?:每天|每日|每周|每月|每年|工作日)\s*[一二三四五六日天]*\s*(?:的)?\s*(?:早上|上午|中午|下午|晚上|凌晨|傍晚)?\s*(?:\d{1,2}\s*[:：]\s*\d{2}|\d{1,2}\s*点\s*(?:半|钟)?)?\s*[，,、:：]?\s*/;
  const stripped = text.replace(pattern, "").replace(pattern, "");
  // 剥完太短说明这句本身就是排期，保留原句更可读
  return stripped.length >= 4 ? stripped : text;
}

/**
 * 把一段指令收敛成任务标题。
 * 规则：外壳剥离 → 排期前缀剥离 → 只取第一句 → 去尾标点 → 超过 15 字尝试在标点处收口 → 硬上限 30 字。
 */
export function condenseAutomationTitle(raw: string | undefined | null, fallback = ""): string {
  let text = String(raw ?? "").replace(/\s+/g, " ").trim();
  text = stripWrapper(text);
  text = stripSchedule(text);
  const firstClause = text.split(/[。！？；;\n]/)[0]?.trim() ?? "";
  if (firstClause) text = firstClause;
  text = stripWrapper(text)
    .replace(/^[「『"'“‘]+|[」』"'”’]+$/g, "")
    .replace(/[。！？；，,、：:.\s]+$/, "")
    .trim();

  if (!text) {
    const fallbackText = stripWrapper(String(fallback ?? "").replace(/\s+/g, " ").trim());
    const firstFallback = fallbackText.split(/[。！？；;\n]/)[0]?.trim() ?? "";
    text = stripSchedule(firstFallback || fallbackText).replace(/[。！？；，,、：:.\s]+$/, "").trim();
  }
  if (!text) return "";

  // 只在超过 30 字上限时才收口，收口点必须是标点：中文标题一旦按字数硬切，
  // 很容易切出「提供一份简洁的中」这种半个词（用户反馈过）。30 字以内一律保留完整语义。
  if (text.length > TITLE_MAX) {
    const slice = text.slice(0, TITLE_MAX);
    const cut = Math.max(slice.lastIndexOf("，"), slice.lastIndexOf("、"), slice.lastIndexOf("；"));
    text = cut >= 10 ? slice.slice(0, cut) : slice;
  }
  return text.trim();
}
