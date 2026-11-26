import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { toast } from "sonner";
import { ArtifactFileCard, SmallTip } from "../components/task-artifacts";
import type { TaskArtifact } from "../components/task-artifacts";
import { AttachmentTray, MessageAttachments } from "../components/attachment-tray";
import type { ChatAttachment } from "../components/attachment-tray";
import { KubaiIcon, kubaiNameFromUrl } from "../components/kubai-icon";
import { OneDriveCard, OutlookCard, RESULT_CARD_CSS } from "../components/result-cards";
import type { QuotePayload } from "../components/result-cards";
import { PptResultMessage } from "../components/ppt-result";
import type { ProjectFiles } from "../components/project-files";
import { OperationMenu } from "../components/operation-menu";
import { RichText, RICH_TEXT_CSS, normalizeAiHtml, visibleTextLength, truncateHtmlByVisibleText } from "../components/rich-text";
import { TASK_OPERATIONS, automationIconSrc, cardSubtitle, useDismissOnOutside } from "../components/automation-view";
import type { AutomationIcon, AutomationCardStatus, ScheduleState } from "../components/automation-view";
import { ExecutionProcess, MergedProcess, PROCESS_PRESETS } from "./execution-process";
import { ChatInput } from "./ChatInput";
import { getAnswerDoneKey } from "./conversation-state";
import type { Message } from "./types";
import type { PptMode, PptPageCount } from "../ppt/types";

const AUTOMATION_CARD_CSS = `
@keyframes ac-bg{from{opacity:0}to{opacity:1}}
@keyframes ac-icon{from{opacity:0;transform:scale(.6)}60%{opacity:1}to{opacity:1;transform:none}}
@keyframes ac-title{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}
@keyframes ac-sub{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}
@keyframes ac-sweep{0%{opacity:0;transform:translateX(-90%) skewX(-14deg)}22%{opacity:1}80%{opacity:.9}100%{opacity:0;transform:translateX(340%) skewX(-14deg)}}
@keyframes ac-auto-actions{from{opacity:0;transform:translateY(2px)}to{opacity:1;transform:none}}
.ac-bg{animation:ac-bg .24s cubic-bezier(.33,1,.68,1) both}
.ac-icon{animation:ac-icon .30s cubic-bezier(.22,1.25,.42,1) .16s both;transform-origin:left center}
.ac-title{animation:ac-title .24s cubic-bezier(.33,1,.68,1) .30s both}
.ac-sub{animation:ac-sub .24s cubic-bezier(.33,1,.68,1) .40s both}
.ac-sweep{animation:ac-sweep .78s cubic-bezier(.4,0,.2,1) .60s both}
.ac-auto-actions{animation:ac-auto-actions .22s cubic-bezier(.33,1,.68,1) both}
@media (prefers-reduced-motion: reduce){
  .ac-bg,.ac-icon,.ac-title,.ac-sub,.ac-auto-actions{animation:none;opacity:1;transform:none}
  .ac-sweep{animation:none;opacity:0}
}
/* 历史消息：卡片直接呈现，不重播入场与扫光（切换对话回来时不应像重新加载） */
.ac-static,.ac-static .ac-icon,.ac-static .ac-title,.ac-static .ac-sub{animation:none;opacity:1;transform:none}
.ac-static .ac-sweep{animation:none;opacity:0}
`;

function AutomationCard({ automation, onOpen, onOperate, instant = false }: {
  automation: NonNullable<Message["automation"]>;
  onOpen?: (taskId: string) => void;
  // hover 操作项（暂停/启用、更多菜单），与自动化任务列表卡片的交互一致
  onOperate?: (label: string, taskId: string) => void;
  // 历史消息（instant）：不播入场/扫光动画，避免切换对话回来像「重新加载」
  instant?: boolean;
}) {
  const [moreAnchor, setMoreAnchor] = useState<HTMLButtonElement | null>(null);
  useDismissOnOutside(moreAnchor, setMoreAnchor);
  // 卡片四态（Figma 9908:45451）：已启用/已暂停 显示「时间 · 任务内容」；
  // 已结束 只显示「已结束」；已删除 标题加删除线并降到 26% 黑，副标题换成「已删除」且整卡不再可点。
  const deleted = automation.status === "已删除";
  const ended = automation.status === "已结束";
  const paused = automation.status === "已暂停";
  // 已删除 / 已结束的卡片不再给操作项（与列表页一致：任务已不可操作）
  const actionable = !deleted && !ended && Boolean(onOperate);
  // 副标题由 schedule + 「就」的内容拼成（Figma 9925:54915），不再把 cycle 和 description 硬拼
  const subtitle = deleted
    ? " 已删除"
    : ended
      ? " 已结束"
      : automation.schedule
        // 已暂停时副标题前缀换成「已暂停 ·」，与任务列表卡片一致
        ? cardSubtitle(automation.schedule, automation.prompt ?? "", paused ? "已暂停" : undefined, automation.title)
        : `${automation.cycle} · ${automation.description}`;
  return (
    <>
      <style>{AUTOMATION_CARD_CSS}</style>
      <div
        role="button"
        tabIndex={deleted ? -1 : 0}
        data-automation-card={automation.taskId}
        data-automation-status={automation.status ?? "已启用"}
        data-kubai-trigger="true"
        data-menu-open={moreAnchor ? "true" : undefined}
        aria-disabled={deleted || undefined}
        onClick={() => { if (!deleted) onOpen?.(automation.taskId); }}
        onKeyDown={event => {
          if (deleted) return;
          if (event.key !== "Enter" && event.key !== " ") return;
          event.preventDefault();
          onOpen?.(automation.taskId);
        }}
        className={`ac-bg group/card relative flex w-full shrink-0 items-center gap-[8px] overflow-hidden rounded-[8px] bg-[#f7f7f7] p-[8px] text-left transition-colors ${deleted ? "cursor-default" : "cursor-pointer hover:bg-[#f2f2f2] data-[menu-open=true]:bg-[#f2f2f2]"}${instant ? " ac-static" : ""}`}
      >
        <KubaiIcon
          name={kubaiNameFromUrl(automation.iconUrl)}
          src={automation.iconUrl}
          fallbackSrc={automationIconSrc(automation.icon)}
          size={32}
          className="ac-icon"
        />
        <div className="flex min-w-0 flex-1 flex-col gap-[4px]">
          <span className={`ac-title truncate font-['PingFang_SC:Medium'] text-[14px] font-medium leading-[22px] tracking-[0.014px] ${deleted ? "text-[rgba(0,0,0,0.26)] line-through" : "text-[rgba(0,0,0,0.88)]"}`}>
            {automation.title}
          </span>
          <span className="ac-sub truncate font-['PingFang_SC:Regular'] text-[14px] font-normal leading-[22px] tracking-[0.014px] text-[rgba(0,0,0,0.6)]">
            {subtitle}
          </span>
        </div>
        {/* 右侧操作项：与自动化任务列表卡片一致（默认隐藏，hover 卡片或菜单展开时显现） */}
        {actionable && (
          <div className="flex shrink-0 items-center gap-[8px] opacity-0 transition-opacity group-hover/card:opacity-100 group-data-[menu-open=true]/card:opacity-100">
            <button
              type="button"
              aria-label={paused ? `启用 ${automation.title}` : `暂停 ${automation.title}`}
              title={paused ? "启用" : "暂停"}
              onClick={event => {
                event.stopPropagation();
                onOperate?.(paused ? "启用" : "暂停", automation.taskId);
              }}
              className="flex size-[32px] cursor-pointer items-center justify-center rounded-[4px] hover:bg-[#e6e6e6]"
            >
              <img src={paused ? "/assets/automation-start.svg" : "/assets/automation-pause.svg"} alt="" className="size-[20px]" />
            </button>
            <button
              type="button"
              aria-label={`更多操作 ${automation.title}`}
              title="更多"
              onClick={event => {
                event.stopPropagation();
                setMoreAnchor(current => current ? null : event.currentTarget);
              }}
              className="flex size-[32px] cursor-pointer items-center justify-center rounded-[4px] hover:bg-[#e6e6e6]"
            >
              <img src="/assets/automation-more.svg" alt="" className="size-[20px]" />
            </button>
          </div>
        )}
        {/* 最后扫过一道高光（只在任务还活着的时候播） */}
        {!deleted && !ended && (
          <span
            aria-hidden
            className="ac-sweep pointer-events-none absolute inset-y-[-20%] left-0 w-[42%]"
            style={{ backgroundImage: "linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.55) 34%, rgba(255,255,255,1) 52%, rgba(255,255,255,0.5) 70%, rgba(255,255,255,0) 100%)" }}
          />
        )}
      </div>
      {moreAnchor && (
        <OperationMenu
          anchor={moreAnchor}
          gap={8}
          align="end"
          className="flex w-[192px] flex-col rounded-[12px] border border-[#f2f2f2] bg-white px-[8px] py-[4px] shadow-[0_0_12px_rgba(0,0,0,0.08)]"
          onClick={event => event.stopPropagation()}
          onPointerDown={event => event.stopPropagation()}
        >
          <div className="flex flex-col gap-[2px] py-[4px]">
            {TASK_OPERATIONS.map(operation => (
              <button
                key={operation.label}
                type="button"
                onClick={event => {
                  event.stopPropagation();
                  setMoreAnchor(null);
                  onOperate?.(operation.label, automation.taskId);
                }}
                className="flex h-[40px] shrink-0 cursor-pointer items-center gap-[8px] rounded-[8px] px-[8px] text-left font-['PingFang_SC:Regular'] text-[14px] font-normal leading-[22px] tracking-[0.014px] text-[rgba(0,0,0,0.88)] hover:bg-[#f2f2f2]"
              >
                <img src={`/assets/${operation.icon}`} alt="" className="size-[16px] shrink-0" />
                <span className="whitespace-nowrap">{operation.label}</span>
              </button>
            ))}
          </div>
        </OperationMenu>
      )}
    </>
  );
}

// 用户消息长文本折叠（Figma 7631:98626 折叠态 / 7976:38094 展开态）：
// 正文 16px/26px，超过 7 行（26×7=182px）折叠；折叠时底部渐变遮罩（透明→#F7F7F7）+「展开」向下箭头，
// 展开后完整文字 + 静态渐变条 +「收起」向上箭头。气泡需 relative 以承载绝对定位的遮罩。
const USER_TEXT_MAX_LINES = 7;
const USER_TEXT_LINE_HEIGHT = 26;
const USER_TEXT_MAX_HEIGHT = USER_TEXT_MAX_LINES * USER_TEXT_LINE_HEIGHT;
const USER_FADE_GRADIENT = "linear-gradient(180deg, rgba(247,247,247,0) 0%, rgba(247,247,247,1) 50%)";

function UserMessageText({ text }: { text: string }) {
  const textRef = useRef<HTMLParagraphElement>(null);
  const [overflow, setOverflow] = useState(false);
  const [expanded, setExpanded] = useState(false);
  useLayoutEffect(() => {
    const measure = () => {
      const el = textRef.current;
      if (!el) return;
      const prev = el.style.maxHeight;
      el.style.maxHeight = "none";
      setOverflow(el.scrollHeight > USER_TEXT_MAX_HEIGHT + 1);
      el.style.maxHeight = prev;
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [text]);

  const collapsed = overflow && !expanded;
  return (
    <>
      <p
        ref={textRef}
        className="text-[16px] leading-[26px] text-[rgba(0,0,0,0.88)] whitespace-pre-wrap break-words"
        style={collapsed ? { maxHeight: `${USER_TEXT_MAX_HEIGHT}px`, overflow: "hidden" } : undefined}
      >{text}</p>
      {overflow && collapsed && (
        <div
          className="absolute inset-x-0 bottom-0 flex flex-col gap-[10px] rounded-b-[8px] pl-[8px] pr-[12px] pb-[8px] pt-[32px]"
          style={{ background: USER_FADE_GRADIENT }}
        >
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="flex w-fit cursor-pointer items-center gap-[8px] rounded-[8px] px-[4px] py-[3px] text-[14px] leading-[22px] text-[rgba(0,0,0,0.88)] transition-colors hover:bg-[#ececec]"
          >
            展开
            <img src="/assets/msg-fold-down.svg" alt="" className="size-[16px]" />
          </button>
        </div>
      )}
      {overflow && !collapsed && (
        <div className="flex flex-col gap-[10px]" style={{ background: USER_FADE_GRADIENT }}>
          <button
            type="button"
            onClick={() => setExpanded(false)}
            className="-ml-[4px] flex w-fit cursor-pointer items-center gap-[8px] rounded-[8px] px-[4px] py-[3px] text-[14px] leading-[22px] text-[rgba(0,0,0,0.88)] transition-colors hover:bg-[#ececec]"
          >
            收起
            <img src="/assets/msg-fold-up.svg" alt="" className="size-[16px]" />
          </button>
        </div>
      )}
    </>
  );
}

function ChatMessageRow({ msg, index, isLastAi, instant, advance, onOpenPpt, onRegeneratePpt, onDownloadArtifact, onOpenAutomation, onAutomationOperate, onFollowUp, onQuote, onEditMessage, onDeleteMessage, onRetryMessage, onRegenerateMessage, onProcessProgress, recommendationKey, onRecommendationsShown }: {
  msg: Message; index: number; isLastAi?: boolean; instant?: boolean; advance: (i: number) => void;
  onOpenPpt?: () => void; onRegeneratePpt?: () => void;
  onDownloadArtifact: (artifact: TaskArtifact) => void;
  onOpenAutomation?: (taskId: string) => void;
  onAutomationOperate?: (label: string, taskId: string) => void;
  onFollowUp?: (text: string) => void;
  onQuote?: (payload: QuotePayload) => void;
  onEditMessage?: (index: number) => void;
  onDeleteMessage?: (index: number) => void;
  onRetryMessage?: (index: number) => void;
  onRegenerateMessage?: (index: number) => void;
  onProcessProgress?: (index: number, progress: { shown: number; batchStart: number }) => void;
  recommendationKey?: string | null;
  onRecommendationsShown?: (key: string) => void;
}) {
  // messages without a running typewriter advance the reveal pointer on mount;
  // process messages advance via onGoalDone once their goal finishes typing
  // 重新生成：重新走一次 AI 执行流程（由会话层处理），不是把同一段文字再打一遍
  // 复制：短暂提示已复制
  // 历史消息 instant=true 直接显示全文；点「重新生成」时临时关掉以重播打字
  const [localInstant, setLocalInstant] = useState(Boolean(instant));
  useEffect(() => { setLocalInstant(Boolean(instant)); }, [instant]);
  const [copied, setCopied] = useState(false);
  // 复制：Figma 2459:8219 .copy Icon 有 Default（copy-line）与 success（勾）两态，
  // 点击后先切勾并保持 1.5s 再复位；写入剪贴板失败则立刻收回，不假装成功。
  const handleCopy = () => {
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
    navigator.clipboard?.writeText(msg.plainText ?? msg.text ?? "")?.catch(() => setCopied(false));
  };
  // 富文本打字机：按可见字符数逐字揭示 HTML，既保留 Figma 2759:15863 标签样式（列表圆点/加粗/标题），
  // 又恢复「打完字才算完成」的链路 —— 卡片、操作项、推荐问题、侧栏 loading 都依赖 textDone。
  const fullHtml = msg.role === "ai" ? (msg.html ?? normalizeAiHtml(msg.text ?? "")) : "";
  const targetLen = visibleTextLength(fullHtml);
  // 只有本轮新产生的流式回答（needsTypewriter）才逐字打字；历史载入的消息直接全文，切回来不重播。
  const shouldType = Boolean(msg.needsTypewriter);
  const [revealed, setRevealed] = useState(() => shouldType ? 0 : Number.MAX_SAFE_INTEGER);
  const [textDone, setTextDone] = useState(!shouldType);
  // 目标长度与流状态放进 ref：interval 只读 ref，不依赖 revealed，避免每打一次字就重建定时器拖慢节奏。
  const targetLenRef = useRef(targetLen);
  targetLenRef.current = targetLen;
  const streamingRef = useRef(msg.streaming);
  streamingRef.current = msg.streaming;
  useEffect(() => {
    if (!shouldType) { setRevealed(Number.MAX_SAFE_INTEGER); setTextDone(true); return; }
    const id = window.setInterval(() => {
      setRevealed(current => Math.min(current + 2, targetLenRef.current));
    }, 30);
    return () => window.clearInterval(id);
  }, [shouldType]);
  // 正文打完（revealed 追上目标）且流已结束 → 标记完成，驱动操作项/推荐问题/侧栏 loading
  // bodyDone：服务端 answer.end 已到（正文发完、推荐追问还在生成），此时也算正文完成，
  // 操作项不必等 run.end（生成追问要好几秒，会跟推荐问题一起冒出来）。
  const bodyFinished = !msg.streaming || Boolean(msg.bodyDone);
  useEffect(() => {
    if (shouldType && revealed >= targetLen && bodyFinished) setTextDone(true);
  }, [shouldType, revealed, targetLen, bodyFinished]);
  // 打完字推进全局 revealed 指针（消息逐条显示），只推进一次
  const doneAdvanced = useRef(false);
  useEffect(() => {
    if (textDone && !doneAdvanced.current) { doneAdvanced.current = true; advance(index); }
  }, [textDone, advance, index]);
  // 卡片内容（底色/图标/标题/副标题/扫光）全部演完，才出现下方操作项
  const [actionsShown, setActionsShown] = useState(Boolean(instant));
  // 顺序铁律：正文 → 产物（自动化卡片 / OneDrive、Outlook 卡片 / 产物文件）→ 操作项。
  // 操作项永远最后出现：正文打完不够，还要等所有产物都渲染出来。
  // 目前只有自动化卡片是异步到达的（从弹窗发起时卡片要等 run.end 兜底生成），
  // 它没到位就先压住操作项，否则卡片晚到会插到操作项上方把它顶下去。
  const productsPending = Boolean(msg.automationPending && !msg.automation);
  useEffect(() => {
    // 真实流式输出期间不显示操作项，等正文收束且打字完成后统一出现
    if (!bodyFinished || !textDone) { setActionsShown(false); return; }
    // 产物还没到位（自动化卡片待生成）：先不出操作项，等卡片落地再排队
    if (productsPending) { setActionsShown(false); return; }
    // 历史消息（无打字标记）直接显示操作项，不再等延时淡入
    if (instant && !shouldType) { setActionsShown(true); return; }
    // 自动化卡片需等扫光动画演完再显示操作项；普通回答打字结束即可显示
    const delay = msg.automation ? 1400 : 120;
    const id = window.setTimeout(() => setActionsShown(true), delay);
    return () => window.clearTimeout(id);
  }, [msg.automation?.taskId, productsPending, textDone, instant, msg.streaming, bodyFinished]);
  // 延展问题真的挂到 DOM 上了才通知外层：这一刻才算「问题执行完成」，侧栏 loading 同时消失
  useEffect(() => {
    if (recommendationKey && isLastAi && actionsShown) onRecommendationsShown?.(recommendationKey);
  }, [recommendationKey, isLastAi, actionsShown, onRecommendationsShown]);
  const autoAdvance = msg.role === "user" || msg.role === "result" || (msg.role === "ai" && (Boolean(msg.thinking) || Boolean(msg.streaming)));
  useEffect(() => { if (autoAdvance) advance(index); }, [autoAdvance, advance, index]);
  if (msg.role === "user") {
    const hasSendState = msg.sendState === "failed" || msg.sendState === "info";
    return (
      <div className="group/user flex w-full flex-col items-end">
        {/* 附件区（Figma 9369:50206「引用slot → .上传区」）：独立于气泡、位于气泡上方；响应式规则与输入框 AttachmentTray 完全一致 */}
        {msg.attachments && msg.attachments.length > 0 && <MessageAttachments attachments={msg.attachments} />}
        <div className="flex w-full items-center justify-end gap-[12px]">
          {/* 发送状态图标（Figma 9369:50206）：红色感叹号=发送失败，info=信息提示；位于气泡左侧。
              hover 图标才出 SmallTip，失败态点击图标即重试；不再常驻黑色胶囊。 */}
          {hasSendState && (
            <SmallTip
              side="top"
              label={msg.sendState === "failed" ? (
                <span className="flex items-center gap-[8px]">
                  <span>发送失败</span>
                  <span className="text-[#9cc5ff]">重试</span>
                </span>
              ) : "信息提示"}
            >
              <button
                type="button"
                aria-label={msg.sendState === "failed" ? "发送失败，点击重试" : "信息提示"}
                onClick={msg.sendState === "failed" ? () => onRetryMessage?.(index) : undefined}
                className="flex size-[16px] shrink-0 cursor-pointer items-center justify-center"
              >
                <img
                  src={msg.sendState === "failed" ? "/assets/msg-error-fill.svg" : "/assets/msg-info-fill.svg"}
                  alt=""
                  className="size-[16px]"
                />
              </button>
            </SmallTip>
          )}
          <div className="user-message relative min-w-0 bg-[#f7f7f7] px-[12px] py-[8px] rounded-tl-[8px] rounded-br-[8px] rounded-bl-[8px]">
            {msg.text && <UserMessageText text={msg.text} />}
          </div>
        </div>
        {/* 用户消息操作项（Figma 917:11666）：编辑 / 复制 / 删除，hover 消息（含状态图标）时显示，右对齐；图标 hover 复用 SmallTip */}
        <div className="flex items-center justify-end gap-[8px] pt-[12px] opacity-0 transition-opacity group-hover/user:opacity-100">
          <SmallTip label="编辑" side="top">
            <button
              type="button"
              aria-label="编辑"
              onClick={() => onEditMessage?.(index)}
              className="flex size-[24px] cursor-pointer items-center justify-center rounded-[4px] opacity-60 transition-colors hover:bg-[#e6e6e6] hover:opacity-100"
            >
              <img src="/assets/msg-edit.svg" alt="" className="size-[16px]" />
            </button>
          </SmallTip>
          <SmallTip label={copied ? "已复制" : "复制"} side="top">
            <button
              type="button"
              aria-label="复制"
              onClick={handleCopy}
              className="flex size-[24px] cursor-pointer items-center justify-center rounded-[4px] opacity-60 transition-colors hover:bg-[#e6e6e6] hover:opacity-100"
            >
              {/* Figma 2459:8219 .copy Icon：默认 copy-line，点击复制后切 success（勾） */}
              <img src={copied ? "/assets/msg-copy-success.svg" : "/assets/msg-copy-user.svg"} alt="" className="size-[16px]" />
            </button>
          </SmallTip>
          <SmallTip label="删除" side="top">
            <button
              type="button"
              aria-label="删除"
              onClick={() => onDeleteMessage?.(index)}
              className="flex size-[24px] cursor-pointer items-center justify-center rounded-[4px] opacity-60 transition-colors hover:bg-[#e6e6e6] hover:opacity-100"
            >
              <img src="/assets/msg-delete.svg" alt="" className="size-[16px]" />
            </button>
          </SmallTip>
        </div>
      </div>
    );
  }
  if (msg.role === "process") return (
    <div className="w-full max-w-[768px]"><ExecutionProcess running={Boolean(msg.thinking)} instant={instant} progress={msg.progress} controlled={Boolean(msg.controlledProcess)} summary={msg.summary} rounds={msg.rounds} onProgress={p => onProcessProgress?.(index, p)} variant={msg.variant ?? "requirement"} preset={msg.preset} onGoalDone={() => advance(index)} /></div>
  );
  if (msg.role === "result") return (
    <div className="w-full max-w-[768px]"><PptResultMessage onOpen={() => onOpenPpt?.()} onRegenerate={onRegeneratePpt} /></div>
  );
  return (
    <div className="group/ai w-full max-w-[768px]">
      {msg.thinking ? (
        <div className="flex items-center gap-[6px] py-[4px]">
          {[0, 200, 400].map(d => <span key={d} className="w-[6px] h-[6px] rounded-full bg-[rgba(0,0,0,0.26)] inline-block" style={{ animation: `blink 1s ${d}ms step-end infinite` }} />)}
        </div>
      ) : (
        <div className="flex w-full flex-col gap-[12px]">
          {/* 所有 AI 回复正文统一走 Figma 2759:15863 HTML 标签样式：模型给 HTML 就用 HTML，
              给 markdown 就归一化成白名单标签（如 1. 2. 3. → <ol><li>）。
              打字期间按可见字符数截断 HTML 逐字揭示，标签结构始终完整，富文本样式不退化。 */}
          <RichText html={truncateHtmlByVisibleText(fullHtml, revealed)} animate={Boolean(msg.animateRich && !localInstant)} />
          {/* 结果自检「核对回答与依据」属于工具执行步骤，统一只出现在上方执行过程里（verify.start 已追加到最后一轮），
              绝不能再在正文与产物之间插一行，否则会打断「正文 → 产物 → 操作项」的顺序。
              没通过时服务端已把没对上的地方写在正文开头，这里不重复。 */}
          {/* 搜索结果卡片（Figma OneDrive 7297:71832 / Outlook 7287:69977）：引用回填输入框 */}
          {textDone && msg.oneDriveFiles && msg.oneDriveFiles.length > 0 && (
            <OneDriveCard files={msg.oneDriveFiles} onQuote={onQuote} />
          )}
          {textDone && msg.outlookMails && msg.outlookMails.length > 0 && (
            <OutlookCard mails={msg.outlookMails} onQuote={onQuote} />
          )}
          {/* 自动化卡片（Figma 9925:54896）：#F7F7F7 底、r8、p8、g8，32 图标 + 标题/副标题 */}
          {msg.automation && textDone && (
            <AutomationCard automation={msg.automation} onOpen={onOpenAutomation} onOperate={onAutomationOperate} instant={localInstant} />
          )}
          {msg.artifacts && msg.artifacts.length > 0 && (
            <div className="artifact-grid grid w-full gap-[12px]">
              {msg.artifacts.map(artifact => <ArtifactFileCard key={artifact.id} artifact={artifact} onDownload={onDownloadArtifact} />)}
            </div>
          )}
          {/* 回答下方的操作项（Figma MessageActions）：重新生成 / 复制 / 来源。
              所有 AI 回答都有复制/来源；「重新生成」只在最后一条消息是 AI 回答时出现，
              新一轮一开始（用户消息/执行过程已追加）立即从旧回答上消失 */}
          {actionsShown && (
            <div
              // 历史消息（重新进入/切换对话）不播入场动画：仅保留 hover 的 opacity 过渡
              style={{ animation: shouldType ? undefined : "none" }}
              // 操作项距回答统一 12px（容器 gap），卡片回答与其它回答一致
              className={`ac-actions flex items-center gap-[8px] transition-opacity ${isLastAi ? "" : "opacity-0 group-hover/ai:opacity-100"}`}
            >
              {isLastAi && (
                <button
                  type="button"
                  aria-label="重新生成"
                  title="重新生成"
                  onClick={() => onRegenerateMessage?.(index)}
                  className="flex size-[24px] cursor-pointer items-center justify-center rounded-[4px] opacity-60 transition-colors hover:bg-[#f2f2f2] hover:opacity-100"
                >
                  <img src="/assets/msg-refresh.svg" alt="" className="size-[16px]" />
                </button>
              )}
              <button
                type="button"
                aria-label="复制"
                title={copied ? "已复制" : "复制"}
                onClick={handleCopy}
                className="flex size-[24px] cursor-pointer items-center justify-center rounded-[4px] opacity-60 transition-colors hover:bg-[#f2f2f2] hover:opacity-100"
              >
                <img src={copied ? "/assets/msg-copy-success.svg" : "/assets/msg-copy.svg"} alt="" className={copied ? "size-[16px]" : "size-[24px]"} />
              </button>
              {/* 来源：3 个 20px 圆形来源徽标（重叠 -4）+「N个来源」。
                  只有消息带真实来源（检索工具 / 搜索卡片）时才显示；纯模型回答不显示。 */}
              {Boolean(msg.sources?.length) && (
                <div className="flex items-center gap-[4px] px-[4px]">
                  <img src="/assets/msg-sources.svg" alt="" className="h-[20px] w-[52px] shrink-0" />
                  <span className="whitespace-nowrap font-['PingFang_SC:Regular'] text-[14px] font-normal leading-[22px] tracking-[0.014px] text-[rgba(0,0,0,0.6)]">{msg.sources!.length}个来源</span>
                </div>
              )}
            </div>
          )}
          {/* 延展问题（Figma 9925:54837 / 9787:71282）：白底、#F2F2F2 描边、r8、p 8/12；hover 变 #F2F2F2 灰底并去描边；短问句贴内容宽，长问句自动撑满换行。仅消息流末尾（最新）AI 回答显示推荐问题，发新消息后旧回答的推荐问题消失 */}
          {msg.followUps && isLastAi && actionsShown && (
            <div className="flex flex-col gap-[12px]">
              {msg.followUps.map((question, qi) => (
                <button
                  key={question}
                  type="button"
                  onClick={() => onFollowUp?.(question)}
                  // 本轮新回答（含重新生成）播放错峰入场；历史消息直接呈现
                  style={{ animation: shouldType ? `followUpIn 320ms cubic-bezier(0.22,1,0.36,1) ${qi * 110}ms both` : "none" }}
                  className="w-fit max-w-full cursor-pointer rounded-[8px] border border-[#f2f2f2] bg-white px-[12px] py-[8px] text-left font-['PingFang_SC:Regular'] text-[14px] font-normal leading-[22px] tracking-[0.014px] text-[rgba(0,0,0,0.6)] transition-colors hover:border-transparent hover:bg-[#f2f2f2]"
                >
                  {question}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ChatView({ conversationId, messages, input, onInputChange, onSend, onQuote, attachments, onAddFiles, onRemoveAttachment, hasProject, projectFiles, showInput = true, onOpenPpt, onRegeneratePpt, pptGeneration, onPptGenerationChange, pptMode, onPptModeChange, pptPages, onPptPagesChange, agentRunning, onStop, onOpenAutomation, onAutomationOperate, onOpenConnectors, onEditMessage, onDeleteMessage, onRetryMessage, onRegenerateMessage, onProcessProgress, onRecommendationsShown }: {
  conversationId: number | null;
  messages: Message[];
  input: string;
  onInputChange: (v: string) => void;
  onSend: (text?: string, attachments?: ChatAttachment[]) => void;
  onQuote?: (payload: QuotePayload) => void;
  attachments: ChatAttachment[];
  onAddFiles: (files: File[]) => void;
  onRemoveAttachment: (id: string) => void;
  hasProject: boolean;
  projectFiles?: ProjectFiles;
  showInput?: boolean;
  onOpenPpt?: () => void; onRegeneratePpt?: () => void;
  pptGeneration: boolean; onPptGenerationChange: (selected: boolean) => void;
  pptMode: PptMode; onPptModeChange: (mode: PptMode) => void;
  pptPages: PptPageCount; onPptPagesChange: (pages: PptPageCount) => void;
  agentRunning: boolean; onStop: () => void;
  onOpenAutomation?: (taskId: string) => void;
  onAutomationOperate?: (label: string, taskId: string) => void;
  onOpenConnectors?: () => void;
  onEditMessage?: (index: number) => void;
  onDeleteMessage?: (index: number) => void;
  onRetryMessage?: (index: number) => void;
  onRegenerateMessage?: (index: number) => void;
  onProcessProgress?: (index: number, progress: { shown: number; batchStart: number }) => void;
  onRecommendationsShown?: (key: string) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  // 是否「跟随最新内容」：AI 回答流式增长时自动滚到底，新内容始终可见；
  // 用户一旦自己往上滚（离底部超过 24px）就停止跟随，不跟用户抢滚动条；
  // 用户滚回底部（或发新消息、切会话）自动恢复跟随。
  const FOLLOW_THRESHOLD = 24;
  const followRef = useRef(true);
  const prevMessageCountRef = useRef(0);
  const prevConversationRef = useRef(conversationId);
  // useLayoutEffect：切换会话/新消息时在绘制前就定位到底部，
  // 用 useEffect 会先画出「停在旧滚动位置」的一帧，看起来像内容重新加载了一次。
  // 图标/字体高度在下一帧才最终确定，补一次 rAF 校正，避免停在差十几像素的位置。
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    // 消息条数变多 = 真有新消息（用户自己发的或系统插入），这时无论之前在哪都回到底部；
    // 切会话同理：新会话一律从底部开始看。
    if (conversationId !== prevConversationRef.current) {
      prevConversationRef.current = conversationId;
      followRef.current = true;
    }
    if (messages.length > prevMessageCountRef.current) followRef.current = true;
    prevMessageCountRef.current = messages.length;
    if (!followRef.current) return;
    el.scrollTop = el.scrollHeight;
    const id = requestAnimationFrame(() => { if (followRef.current) el.scrollTop = el.scrollHeight; });
    return () => cancelAnimationFrame(id);
  }, [messages, conversationId]);

  // 流式回答真正长高的是「消息行内部的打字机」，messages 引用不变，靠上面的 effect 跟不到。
  // 直接观察内容高度：只要还在跟随（followRef）就把视口贴到最新；用户滚开后被 handleScroll 关掉。
  const contentRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = scrollRef.current;
    const inner = contentRef.current;
    if (!el || !inner) return;
    const observer = new ResizeObserver(() => {
      if (!followRef.current) return;
      // 内容刚变高这一帧的 scrollHeight 可能还没算完，放到下一帧再贴底，避免永远差几十像素
      el.scrollTop = el.scrollHeight;
      requestAnimationFrame(() => { if (followRef.current) el.scrollTop = el.scrollHeight; });
    });
    observer.observe(inner);
    return () => observer.disconnect();
  }, []);

  // 回到底部按钮：距底部超过 80px（即下方还有 >80px 内容被遮住）时显示
  const [showBackToBottom, setShowBackToBottom] = useState(false);
  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const distanceToBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    setShowBackToBottom(distanceToBottom > 80);
    // 只在「用户主动滚开」时停跟随：贴底（含程序自己滚到底）都算跟随中，
    // 这样流式增长时不会被自己的滚动事件误判成用户滚动。
    followRef.current = distanceToBottom <= FOLLOW_THRESHOLD;
  }, [FOLLOW_THRESHOLD]);
  const scrollToBottom = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    followRef.current = true;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, []);

  // reveal messages one at a time: the next message renders only after the
  // current one has finished its typewriter / entrance
  const [revealed, setRevealed] = useState(0);
  const advance = useCallback((i: number) => setRevealed(r => Math.max(r, i + 1)), []);
  // switching conversations shows history in full without replaying typewriters
  const msgCount = messages.length;
  // useLayoutEffect：切会话时在浏览器绘制前就把揭示指针推到末尾。
  // 用 useEffect 会先绘制一帧「只显示部分消息」的画面，切回内容多的会话就像重新加载。
  useLayoutEffect(() => { setRevealed(msgCount); }, [conversationId]); // eslint-disable-line react-hooks/exhaustive-deps

  // 历史消息靠消息自身的 instant 标记判断（handleSelectHistory 载入时打标），
  // 新发送的消息不带标记 → 仍有打字与执行过程动画。不再按会话切换推断，避免误判新消息。

  // once the whole task finishes, the three stage blocks merge into one collapsed
  // "任务已完成" rendered at the position of the first process message
  const processIndices = messages.map((m, i) => (m.role === "process" ? i : -1)).filter(i => i >= 0);
  const firstProcessIndex = processIndices[0];
  const processPresets = processIndices.map(i => messages[i].preset ?? PROCESS_PRESETS[messages[i].variant ?? "requirement"]);
  const taskComplete = messages.some(m => m.role === "result") && !messages.some(m => m.role === "process" && m.thinking);
  // 间距：执行过程/任务完成 → 回答 = 12px（Figma _AIMessage 内部 gap，紧凑贴合）；其余消息之间 = 32px
  const spacingBefore = (i: number): string => {
    if (i === 0) return "";
    const prev = messages[i - 1]?.role;
    const cur = messages[i]?.role;
    if (prev === "process" && cur === "ai") return "mt-[12px]";
    return "mt-[32px]";
  };
  // 操作项常显、推荐问题、「重新生成」都只看「最后一条消息」：
  // 用户一发新消息，旧回答立即降为 hover 显示、推荐问题和重新生成按钮都消失。
  const lastAiIndex = messages.length - 1;
  const answerDoneKey = getAnswerDoneKey(conversationId, messages);
  return (
    <div className="flex-1 min-h-0 bg-white flex flex-col">
      <style>{`@keyframes blink{0%,100%{opacity:1}50%{opacity:0}}@keyframes followUpIn{0%{opacity:0;transform:translateY(10px)}100%{opacity:1;transform:translateY(0)}}${RICH_TEXT_CSS}${RESULT_CARD_CSS}`}</style>
      <div ref={scrollRef} data-chat-scroll onScroll={handleScroll} className="flex-1 min-h-0 overflow-y-auto">
        <div className="conversation-gutter min-h-full pt-[16px]">
          <div className="conversation-content mx-auto w-full">
            <div ref={contentRef} className="conversation-messages flex flex-col pt-[16px] pb-[56px]">
              {messages.map((msg, i) => {
                if (i > revealed) return null;
                // key 带上会话 id + 消息角色：切换会话、以及同一 index 上 process→ai 替换时都强制重挂。
                // 否则无工具轮里 process 被移除、ai 补到同一 index，React 会复用 process 的 ChatMessageRow
                // 实例（revealed 仍是 MAX_SAFE_INTEGER），正文就会整段蹦出来而不是逐字打字。
                const rowKey = `${conversationId ?? "draft"}-${i}-${msg.role}`;
                if (msg.role === "process" && taskComplete) {
                  return i === firstProcessIndex ? <div key={rowKey} className={`w-full ${spacingBefore(i)}`}><MergedProcess presets={processPresets} /></div> : null;
                }
                return (
                  <div key={rowKey} data-message-index={i} className={`flex w-full flex-col ${spacingBefore(i)}`}>
                    <ChatMessageRow msg={msg} index={i} isLastAi={i === lastAiIndex} instant={Boolean(msg.instant)} advance={advance} onOpenPpt={onOpenPpt} onRegeneratePpt={onRegeneratePpt} onDownloadArtifact={artifact => toast.success(`本地示例：开始下载${artifact.name}`)} onOpenAutomation={onOpenAutomation} onAutomationOperate={onAutomationOperate} onFollowUp={onSend} onQuote={onQuote} onEditMessage={onEditMessage} onDeleteMessage={onDeleteMessage} onRetryMessage={onRetryMessage} onRegenerateMessage={onRegenerateMessage} onProcessProgress={onProcessProgress} recommendationKey={i === lastAiIndex ? answerDoneKey : null} onRecommendationsShown={onRecommendationsShown} />
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
      <div aria-hidden={!showInput} className={`conversation-gutter shrink-0 transition-opacity duration-200 ${showInput ? "opacity-100" : "opacity-0 pointer-events-none"}`}>
        <div className="conversation-content relative mx-auto w-full">
            {/* 回到底部按钮（Figma 122:1719）：输入框上方 32px 居中；出现动画 缩放 0.8→1、透明度 0→1 */}
            <button
              type="button"
              aria-label="回到底部"
              title="回到底部"
              onClick={scrollToBottom}
              className={`absolute bottom-[calc(100%+32px)] left-1/2 z-10 flex size-[40px] -translate-x-1/2 items-center justify-center rounded-full border border-[#f2f2f2] bg-white shadow-[0_0_12px_rgba(0,0,0,0.08)] transition-[opacity,translate,scale,box-shadow] duration-200 hover:shadow-[0_0_24px_rgba(0,0,0,0.16)] ${showBackToBottom ? "translate-y-0 scale-100 opacity-100" : "pointer-events-none translate-y-[32px] scale-0 opacity-0"}`}
            >
              <img src="/assets/back-to-bottom.svg" alt="" className="size-[20px]" />
            </button>
            <ChatInput
              value={input}
              hasProject={hasProject}
              projectFiles={projectFiles}
              onChange={onInputChange}
              onSend={onSend}
              attachments={attachments}
              onAddFiles={onAddFiles}
              onRemoveAttachment={onRemoveAttachment}
              pptGeneration={pptGeneration}
              onPptGenerationChange={onPptGenerationChange}
              pptMode={pptMode}
              onPptModeChange={onPptModeChange}
              pptPages={pptPages}
              onPptPagesChange={onPptPagesChange}
              agentRunning={agentRunning}
              onStop={onStop}
              onOpenConnectors={onOpenConnectors}
            />
        </div>
      </div>
      <div className="shrink-0 flex items-center justify-center p-[4px]">
        <span className="text-[10px] text-[rgba(0,0,0,0.26)]">内容由AI生成，仅供参考</span>
      </div>
    </div>
  );
}

export { ChatView };
