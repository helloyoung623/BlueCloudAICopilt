import { forwardRef, useState, useRef, useEffect, useLayoutEffect, useCallback } from "react";
import type { CSSProperties } from "react";
import { motion } from "motion/react";
import svgPaths from "@/imports/默认首页-1/svg-4ly00k0kqz";
import svgPanel from "@/imports/需求确认-1/svg-1yxmq1shfb";
import svgOutline from "@/imports/大纲/svg-fzbroqn38q";
import svgSidebar from "@/imports/历史对话操作项/svg-1dh84d0t2n";
import svgTask from "@/imports/任务执行过程/svg-tkwirjnqmk";
import svgProgress from "@/imports/渐进式ReAct/svg-x4n03n8we0";
import svgSearching from "@/imports/搜索中/svg-pcft5f0tqe";
import svgPptToggle from "@/imports/Container/svg-ky29gei8j7";
import svgPresentation from "@/imports/Ppt-1/svg-b6redky6le";
import imgStyle1 from "@/imports/需求确认-1/29d4a489057188d7298a9a9f8b923d2d9c630925.png";
import imgStyle2 from "@/imports/需求确认-1/f49f63a62b02589f759f36fc0961c6709a8e1bdf.png";
import imgStyle3 from "@/imports/需求确认-1/9b2936619dc23e46dde47ce229cadb09c1b911ab.png";
import { PptPanel, PptResultMessage } from "./components/ppt-result";
import { RadarArcLoader } from "./components/radar-arc-loader";
import { ArtifactFileCard, TaskArtifactsButton } from "./components/task-artifacts";
import type { LocatedTaskArtifact, TaskArtifact } from "./components/task-artifacts";
import { Dialog, DialogClose, DialogContent, DialogTitle } from "./components/ui/dialog";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "./components/ui/sheet";
import { useIsMobile } from "./components/ui/use-mobile";
import { OperationMenu } from "./components/operation-menu";
import { AddContentMenu } from "./components/add-content-menu";
import { ProjectInstructionDialog, ProjectMembersDialog, ProjectMemberTag } from "./components/project-settings-dialogs";
import type { ProjectMember } from "./components/project-settings-dialogs";
import { getAvatarInitial } from "./components/avatar-initial";
import { AttachmentTray, MessageAttachments, MAX_ATTACHMENTS, formatFileSize, getAttachmentExtension, getAttachmentIcon, getAttachmentValidationError, readFileMeta, readVirtualFile } from "./components/attachment-tray";
import type { ChatAttachment } from "./components/attachment-tray";
import { AttachmentPicker } from "./components/attachment-picker";
import type { AttachmentSource } from "./components/attachment-picker";
import { DEMO_PROJECT_FILES, ProjectFilesPanel, createCloudSourceFiles, pickSourceFiles } from "./components/project-files";
import type { ProjectFiles } from "./components/project-files";
import { SelectFileDialog } from "./components/select-file-dialog";
import type { CloudSourceTab } from "./components/select-file-dialog";
import { ImportTaskPanel } from "./components/import-task-panel";
import type { ImportTask } from "./components/import-task-panel";
import { FileFilterButton, EMPTY_UPLOADER_FILTER, SELF_OWNER } from "./components/file-filter";
import type { FileFormat, FileStatus, TimeFilter, UploaderFilter } from "./components/file-filter";
import { Popover, PopoverAnchor } from "./components/ui/popover";
import { toast } from "sonner";
import { Toaster } from "./components/ui/sonner";
import { LibraryView } from "./components/library-view";
import { ListPageHeader } from "./components/list-page-header";
import { AutomationView, AutomationDetailPanel, DeleteTaskDialog, INITIAL_TASKS as INITIAL_AUTOMATION_TASKS, summarizeSchedule, describeSchedule, cardSubtitle, resolveAutomationIcon, automationIconSrc, buildRunRecords, makeRunRecord, buildDefaultSchedule, type AutomationIcon, type AutomationTask, type AutomationCardStatus, type ScheduleState, type RunRecord } from "./components/automation-view";

// ── types ─────────────────────────────────────────────────────────────────────

type ProcessVariant = "requirement" | "outline" | "ppt";
type ProcessPreset = { goal: string; running: string; actions: { label: string; icon: ToolKind }[] };
type Message = {
  role: "user" | "ai" | "process" | "result";
  text: string;
  attachments?: ChatAttachment[];
  thinking?: boolean;
  variant?: ProcessVariant;
  preset?: ProcessPreset;
  artifacts?: TaskArtifact[];
  // AI 回复里附带的自动化卡片（Figma 9925:54896）：点卡片打开右侧详情栏
  // status：卡片态的四种样式 —— 已启用/已暂停/已结束 跟任务状态同步，已删除 是任务被删后卡片留下的状态
  // schedule / prompt：副标题「时间 · 任务内容」的原始两段（9925:54915），
  // 时间从 schedule 实时算，详情栏改了周期或「就」的内容，卡片跟着变
  automation?: { taskId: string; title: string; cycle: string; description: string; icon: AutomationIcon; status?: AutomationCardStatus; schedule?: ScheduleState; prompt?: string };
  // 自动化卡片下方的延展问题（Figma 9925:54837「延展问题」模块）
  followUps?: string[];
  // 用户消息的发送状态（Figma 9369:50206）：failed=发送失败（红色感叹号），info=信息提示（info 图标）
  sendState?: "failed" | "info";
  // 历史消息标记：从历史会话载入的消息为 true，AI 正文/执行过程直接完整显示，不重播打字动画
  instant?: boolean;
  // 执行过程已展开的步骤进度：切走任务再回来时据此恢复（含最后一批仍处于 loading 的状态）
  progress?: { shown: number; batchStart: number };
};
type PptStage = "idle" | "requirement" | "outline_generating" | "outline" | "ppt_generating" | "preview";
type PptMode = "标准" | "PowerPoint";
type PptPageCount = "智能匹配" | "5～8页" | "8～12页" | "12～18页";

type OutlinePageContent =
  | { type: "text"; text: string }
  | { type: "list"; items: string[] };

type OutlinePage = { id: number; pageLabel: string; title: string; content: OutlinePageContent };

// ── helpers ───────────────────────────────────────────────────────────────────

const isPPTIntent = (t: string) => /ppt|演示|幻灯|slide/i.test(t) || t.includes("PPT");

// 聊天里说「创建/生成自动化任务」→ 不走普通问答，直接进自动化创建流程
// （任务落到「自动化任务」列表，会话里出自动化卡片，与自动化页「创建」入口同一链路）
const isAutomationIntent = (t: string) => t.includes("自动化任务") && /(创建|新建|设置|添加|生成)/.test(t);

// 从自然语言里解析排期条件、任务名与「就」的内容：
//   「创建一个自动化任务，每天早上汇总未读邮件」
//   → 每天 09:00；任务名「每天早上汇总未读邮件」；任务内容「汇总未读邮件」
const parseAutomationSchedule = (t: string): { schedule: ScheduleState; title: string; goal: string } => {
  // 执行周期：只有明确写了「每周X」才算每周（注意别把「每天早上」的「每天」误判成周日）
  // 周几与日期都是多选：「每周一三五」→ 周一/周三/周五；「每月1号、15号」→ 1号/15号
  const WEEKDAY_ORDER = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];
  const weekdayMatch = t.match(/每周([一二三四五六日天、，,\s]+)/);
  const weekdays = weekdayMatch
    ? [...new Set([...weekdayMatch[1].matchAll(/[一二三四五六日天]/g)].map(match => `周${match[0].replace("天", "日")}`))]
      .sort((a, b) => WEEKDAY_ORDER.indexOf(a) - WEEKDAY_ORDER.indexOf(b))
    : [];
  const cycle: ScheduleState["cycle"] = weekdays.length ? "每周" : "每天";
  const monthDays = [...new Set([...t.matchAll(/(\d{1,2})\s*[号日]/g)]
    .map(match => Number(match[1]))
    .filter(day => day >= 1 && day <= 31))]
    .sort((a, b) => a - b)
    .map(day => `${day}号`);
  // 执行时刻：优先取明确的 HH:MM；否则按 早/午/晚 推断
  const timeMatch = t.match(/([01]?\d|2[0-3]):([0-5]\d)/);
  const time = timeMatch ? timeMatch[0] : t.includes("晚上") ? "20:00" : t.includes("中午") ? "12:00" : "09:00";
  // 任务名：「自动化任务」后面的内容（去掉标点），没有就回退整句
  const after = t.split(/自动化任务/)[1]?.replace(/^[，,。：:\s]+/, "").trim();
  const title = after || t;
  // 任务内容：把开头的时间描述剥掉（卡片副标题已有「每天 09:00」，避免重复）
  const rawGoal = title.replace(/^((每天|每日|每周[一二三四五六日天、，,\s]*|每月(?:[0-9]{1,2}\s*[号日][、，,\s]*)*|每年|工作日|早上|上午|中午|下午|晚上|凌晨)[，,、\s]*)+/, "");
  // 时间已在副标题里展示，「就」的内容里再留一遍就成了「09:00 · 09:00 汇总…」
  const goal = rawGoal.replace(/^\s*(?:[0-2]?\d:[0-5]\d)[，,、\s]*/, "").trim() || title;
  // 没在话里指定的周几 / 几号 / 年月，兜底用系统当前时间（与新建弹窗的预填规则一致）
  const fallback = buildDefaultSchedule();
  return {
    schedule: { cycle, weekdays: weekdays.length ? weekdays : fallback.weekdays, monthDays: monthDays.length ? monthDays : fallback.monthDays, yearMonth: fallback.yearMonth, yearDay: fallback.yearDay, time, customInterval: 1, customUnit: "天", customMonthDays: fallback.customMonthDays },
    title,
    goal,
  };
};

// 「2.9MB / 860KB」这类展示用文案 → 字节数（资料库文件上传到项目时复用）
const SIZE_UNITS = { B: 1, KB: 1024, MB: 1024 ** 2, GB: 1024 ** 3 } as const;
const parseFileSize = (size: string) => {
  const match = /^([\d.]+)\s*(B|KB|MB|GB)$/i.exec(size.trim());
  if (!match) return 2 * 1024 * 1024;
  const unit = match[2].toUpperCase() as keyof typeof SIZE_UNITS;
  return Math.max(1, Math.round(Number.parseFloat(match[1]) * (SIZE_UNITS[unit] ?? SIZE_UNITS.MB)));
};

// mock files produced by the AI for requests that ask for a document-like output
const buildTaskArtifacts = (text: string): TaskArtifact[] => {
  const extension: TaskArtifact["extension"] | null = /表格|excel|xlsx/i.test(text) ? "xlsx"
    : /word|docx/i.test(text) ? "docx"
      : /代码|网页|html/i.test(text) ? "html"
        : /文档|文件|报告|整理|导出|pdf/i.test(text) ? "pdf"
          : null;
  if (!extension) return [];
  const baseName = text.replace(/[\\/:*?"<>|\s，。！？、；：]/g, "").slice(0, 24) || "整理结果";
  return [{ id: `${Date.now()}-${extension}`, name: `${baseName}.${extension === "html" ? "html" : extension}`, extension, size: "36M" }];
};
const PPT_ARTIFACT_NAME = "信息的分析报告.pptx";

// 最新 AI 回复下方默认展示的延展/推荐问题（Figma「延展问题」模块）
const DEFAULT_FOLLOW_UPS = [
  "帮我总结一下这段内容的要点",
  "能不能再展开讲讲？",
  "有没有相关的其他案例？",
];

// build an execution process whose copy reflects the user's actual request
const buildQueryProcess = (query: string): ProcessPreset => {
  const topic = query.length > 24 ? `${query.slice(0, 24)}…` : query;
  return {
    goal: `任务目标：${query}`,
    running: `围绕「${topic}」检索并整理信息`,
    actions: [
      { label: `搜索；检索「${topic}」相关信息`, icon: "search" },
      { label: "读取；加载匹配到的内容", icon: "read" },
      { label: "提取；归纳关键信息", icon: "extract" },
      { label: "分析；梳理结果结构", icon: "analyze" },
      { label: "汇总；整理输出结果", icon: "summarize" },
    ],
  };
};

function mockOutlinePages(): OutlinePage[] {
  return [
    {
      id: 1, pageLabel: "第1页", title: "交互设计简史：从命令行到空间计算",
      content: { type: "text", text: "以一张科技感 hero image 奠定深色未来主义基调，交代主题—交互设计从命令行到空间计算的六十年演进历程。" },
    },
    {
      id: 2, pageLabel: "第2页", title: "六大范式跃迁",
      content: { type: "text", text: "以水平时间线形式呈现交互设计六大范式跃迁（CLI > GUI > Web > Mobile > Voice > Spatial），标注关键年份与代表产品，锚定观众对全局演进框架的认知。" },
    },
    {
      id: 3, pageLabel: "第3页", title: "AI 对交互设计的影响",
      content: { type: "list", items: ["AI Chat", "Agent", "Prompt", "Knowledge Base", "文件解析", "Office 集成"] },
    },
    {
      id: 4, pageLabel: "第4页", title: "空间计算时代的交互范式",
      content: { type: "text", text: "探讨 Apple Vision Pro 等设备带来的新交互维度：眼动追踪、手势识别、空间音频，以及设计师如何在三维空间中重构信息架构。" },
    },
    {
      id: 5, pageLabel: "第5页", title: "设计师的新角色与技能图谱",
      content: { type: "list", items: ["系统思维", "AI 协作能力", "多模态设计", "伦理与可解释性", "跨学科协作"] },
    },
    {
      id: 6, pageLabel: "第6页", title: "总结与展望",
      content: { type: "text", text: "回顾六十年演进脉络，提炼不变的设计本质——以人为中心，并对下一个十年的交互形态作出预判与倡导。" },
    },
  ];
}

// ── gradient AI icon ──────────────────────────────────────────────────────────

function AIIcon({ uid }: { uid: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="shrink-0">
      <g clipPath={`url(#c-${uid})`}>
        <path d={svgPaths.p2b6e3f00} fill={`url(#g-${uid})`} />
      </g>
      <defs>
        <linearGradient id={`g-${uid}`} x1="0.222656" y1="7.99995" x2="15.1949" y2="7.99995" gradientUnits="userSpaceOnUse">
          <stop stopColor="#1E63F5" /><stop offset="1" stopColor="#13C2C2" />
        </linearGradient>
        <clipPath id={`c-${uid}`}><rect width="16" height="16" fill="white" /></clipPath>
      </defs>
    </svg>
  );
}

// ── slide-up panel shell ──────────────────────────────────────────────────────

function SlidePanel({ visible, onClose, children, mainOffset = 0 }: {
  visible: boolean; onClose: () => void; children: React.ReactNode; mainOffset?: number;
}) {
  const [mounted, setMounted] = useState(false);
  const [animIn, setAnimIn] = useState(false);

  useEffect(() => {
    if (visible) {
      setMounted(true);
      requestAnimationFrame(() => requestAnimationFrame(() => setAnimIn(true)));
    } else {
      setAnimIn(false);
      const t = setTimeout(() => setMounted(false), 380);
      return () => clearTimeout(t);
    }
  }, [visible]);

  if (!mounted) return null;
  return (
    <div
      className="fixed left-1/2 z-50 flex flex-col bg-white rounded-[16px]"
      style={{
        width: 800, maxHeight: 560, bottom: 22,
        left: `calc(50% + ${mainOffset}px)`,
        transform: `translateX(-50%) translateY(${animIn ? "0%" : "120%"})`,
        transition: "transform 0.35s cubic-bezier(0.32,0.72,0,1)",
        boxShadow: "0 0 12px rgba(0,0,0,0.08)", border: "1px solid #e6e6e6",
        overflow: "hidden",
      }}
    >
      {children}
    </div>
  );
}

// ── countdown hook (cancels on interaction) ───────────────────────────────────

function useCountdown(active: boolean, seconds: number, onDone: () => void) {
  const [count, setCount] = useState(seconds);
  const [cancelled, setCancelled] = useState(false);

  useEffect(() => {
    if (!active) return;
    setCount(seconds);
    setCancelled(false);
  }, [active, seconds]);

  useEffect(() => {
    if (!active || cancelled || count <= 0) {
      if (active && !cancelled && count <= 0) onDone();
      return;
    }
    const t = setTimeout(() => setCount(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [active, cancelled, count, onDone]);

  const cancel = useCallback(() => setCancelled(true), []);
  return { count, cancelled, cancel };
}

// ── panel close button ────────────────────────────────────────────────────────

function CloseBtn({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} className="w-[24px] h-[24px] flex items-center justify-center rounded-[4px] hover:bg-[#f7f7f7] shrink-0 cursor-pointer">
      <svg width="11" height="11" viewBox="0 0 10.371 10.371" fill="none">
        <path d={svgPanel.p28244cc0} fill="black" fillOpacity="0.88" />
      </svg>
    </button>
  );
}

// ── panel footer with countdown ───────────────────────────────────────────────

function PanelFooter({ count, cancelled, onConfirm, pptMode, onPptModeChange }: {
  count: number;
  cancelled: boolean;
  onConfirm: () => void;
  pptMode: PptMode;
  onPptModeChange: (mode: PptMode) => void;
}) {
  return (
    <div className="shrink-0 px-[16px] py-[16px] flex items-center gap-[16px] bg-[rgba(255,255,255,0.92)] border-t border-[#f2f2f2]">
      <p className="flex-1 text-[14px] leading-[22px]">
        {!cancelled && (
          <><span className="text-[#1e63f5] font-medium">{count}S</span><span className="text-[rgba(0,0,0,0.38)]"> 后自动确认</span></>
        )}
      </p>
      <PptSettingPicker kind="mode" value={pptMode} onChange={onPptModeChange} footer />
      <button onClick={onConfirm} className="bg-[#1e63f5] text-white text-[14px] leading-[22px] font-normal px-[16px] py-[5px] rounded-[8px] cursor-pointer hover:opacity-90 transition-opacity">
        确认
      </button>
    </div>
  );
}

// ── requirement panel ─────────────────────────────────────────────────────────

function OptionItem({ label, selected, onClick, image }: { label: string; selected: boolean; onClick: () => void; image?: string }) {
  return (
    <div onClick={onClick} className="relative rounded-[8px] cursor-pointer flex-1 min-w-0">
      <div aria-hidden className={`absolute inset-0 rounded-[8px] border pointer-events-none ${selected ? "border-[#1e63f5]" : "border-[#e6e6e6]"}`} />
      <div className="flex items-center px-[12px] py-[8px] gap-[10px]">
        <span className="text-[14px] leading-[22px] text-[rgba(0,0,0,0.88)] whitespace-nowrap">{label}</span>
        {image && <div className="absolute h-[22px] right-[8px] top-[8px] w-[39px] rounded-[4px] overflow-hidden"><img src={image} alt="" className="w-full h-full object-cover" /></div>}
      </div>
    </div>
  );
}

function GridItem({ label, selected, onClick }: { label: string; selected: boolean; onClick: () => void }) {
  return (
    <div onClick={onClick} className="relative rounded-[8px] cursor-pointer">
      <div aria-hidden className={`absolute inset-0 rounded-[8px] border pointer-events-none ${selected ? "border-[#1e63f5]" : "border-[#e6e6e6]"}`} />
      <div className="px-[12px] py-[8px]">
        <span className="text-[14px] leading-[22px] text-[rgba(0,0,0,0.88)] whitespace-nowrap">{label}</span>
      </div>
    </div>
  );
}

function RequirementPanel({ visible, onClose, onConfirm, pptMode, onPptModeChange, initialPages, mainOffset = 0 }: {
  visible: boolean;
  onClose: () => void;
  onConfirm: () => void;
  pptMode: PptMode;
  onPptModeChange: (mode: PptMode) => void;
  initialPages: PptPageCount;
  mainOffset?: number;
}) {
  const [style, setStyle] = useState("科技现代");
  const [scenes, setScenes] = useState<string[]>(["商业路演"]);
  const [audience, setAudience] = useState<string[]>(["投资人"]);
  const [pages, setPages] = useState(initialPages === "智能匹配" ? "8～12页" : initialPages);
  const [moreStylesOpen, setMoreStylesOpen] = useState(false);
  const closeMoreStylesTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const moreStylesTriggerRef = useRef<HTMLButtonElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (visible) setPages(initialPages === "智能匹配" ? "8～12页" : initialPages);
  }, [initialPages, visible]);

  const openMoreStyles = () => {
    if (closeMoreStylesTimer.current) clearTimeout(closeMoreStylesTimer.current);
    setMoreStylesOpen(true);
  };
  const deferCloseMoreStyles = () => {
    if (closeMoreStylesTimer.current) clearTimeout(closeMoreStylesTimer.current);
    closeMoreStylesTimer.current = setTimeout(() => setMoreStylesOpen(false), 180);
  };

  const handleConfirm = useCallback(() => { onConfirm(); }, [onConfirm]);
  const { count, cancelled, cancel } = useCountdown(visible, 30, handleConfirm);

  const toggle = (set: string[], val: string, setter: (v: string[]) => void) =>
    setter(set.includes(val) ? set.filter(x => x !== val) : [...set, val]);

  const handleInteract = () => cancel();

  return (
    <SlidePanel visible={visible} onClose={onClose} mainOffset={mainOffset}>
      {/* header */}
      <div className="shrink-0 px-[16px] pt-[16px] pb-[8px]">
        <div className="flex items-center justify-between">
          <span className="text-[16px] font-medium leading-[24px] text-[rgba(0,0,0,0.88)]">确认制作需求</span>
          <CloseBtn onClick={onClose} />
        </div>
        <p className="text-[14px] leading-[22px] text-[rgba(0,0,0,0.6)] mt-[2px]">确保 AI 生成的方向符合您的预期</p>
      </div>

      {/* body */}
      <div ref={scrollRef} onScroll={handleInteract} onClick={handleInteract} className="flex-1 overflow-y-auto min-h-0 px-[16px] pb-[16px] flex flex-col gap-[16px]">
        {/* 视觉风格 */}
        <div className="flex flex-col gap-[12px]">
          <span className="text-[14px] font-medium leading-[22px] text-[rgba(0,0,0,0.88)]">视觉风格</span>
          <div className="grid grid-cols-3 gap-[12px]">
            <OptionItem label="科技现代" image={imgStyle1} selected={style === "科技现代"} onClick={() => setStyle("科技现代")} />
            <OptionItem label="商务风"   image={imgStyle2} selected={style === "商务风"}   onClick={() => setStyle("商务风")} />
            <OptionItem label="XXX"      image={imgStyle3} selected={style === "XXX"}      onClick={() => setStyle("XXX")} />
            <div
              className="relative col-span-1"
              onMouseEnter={openMoreStyles}
              onMouseLeave={deferCloseMoreStyles}
            >
              <button
                type="button"
                ref={moreStylesTriggerRef}
                onClick={openMoreStyles}
                className={`relative flex w-full items-center justify-between rounded-[8px] px-[12px] py-[8px] text-left cursor-pointer ${moreStylesOpen ? "bg-[#f7f7f7]" : "bg-white"}`}
              >
                <span className="text-[14px] leading-[22px] text-[rgba(0,0,0,0.88)]">更多</span>
                <svg width="10" height="12" viewBox="0 0 5.30321 9.19243" fill="none" className="-scale-x-100"><path d={svgPanel.p5e65780} fill="black" fillOpacity="0.38" /></svg>
                <span aria-hidden className="absolute inset-0 rounded-[8px] border border-[#e6e6e6] pointer-events-none" />
              </button>
              {moreStylesOpen && (
                <OperationMenu anchor={moreStylesTriggerRef.current}
                  className="w-[192px] rounded-[12px] border border-[#f2f2f2] bg-white px-[8px] py-[4px] shadow-[0_0_12px_rgba(0,0,0,0.08)]"
                  onMouseEnter={openMoreStyles}
                  onMouseLeave={deferCloseMoreStyles}
                >
                  {["简约清新", "创意插画", "深色未来", "复古艺术", "品牌活力", "专业报告"].map(option => (
                    <button
                      key={option}
                      type="button"
                      onPointerDown={(event) => event.stopPropagation()}
                      onClick={() => { setStyle(option); setMoreStylesOpen(false); }}
                      className={`flex w-full items-center justify-between rounded-[8px] px-[8px] py-[11px] text-left text-[14px] leading-[22px] text-[rgba(0,0,0,0.88)] transition-colors ${style === option ? "" : "hover:bg-[#f7f7f7]"}`}
                    >
                      <span>{option}</span>
                      {style === option && <span aria-hidden className="text-[16px] leading-[16px] text-[#1e63f5]">✓</span>}
                    </button>
                  ))}
                </OperationMenu>
              )}
            </div>
          </div>
        </div>

        {/* 演示场景 */}
        <div className="flex flex-col gap-[12px]">
          <span className="text-[14px] font-medium leading-[22px] text-[rgba(0,0,0,0.88)]">演示场景（可多选）</span>
          <div className="flex gap-[12px]">
            {["商业路演", "内部汇报", "其他"].map(s => (
              <OptionItem key={s} label={s} selected={scenes.includes(s)} onClick={() => toggle(scenes, s, setScenes)} />
            ))}
          </div>
        </div>

        {/* 受众对象 */}
        <div className="flex flex-col gap-[12px]">
          <span className="text-[14px] font-medium leading-[22px] text-[rgba(0,0,0,0.88)]">受众对象（可多选）</span>
          <div className="grid grid-cols-3 gap-[12px]">
            {["投资人", "管理层", "客户", "团队成员", "其他"].map(s => (
              <GridItem key={s} label={s} selected={audience.includes(s)} onClick={() => toggle(audience, s, setAudience)} />
            ))}
          </div>
        </div>

        {/* 页数 */}
        <div className="flex flex-col gap-[12px]">
          <span className="text-[14px] font-medium leading-[22px] text-[rgba(0,0,0,0.88)]">页数</span>
          <div className="flex gap-[12px]">
            {["5～8页", "8～12页", "12～18页"].map(s => (
              <OptionItem key={s} label={s} selected={pages === s} onClick={() => setPages(s)} />
            ))}
          </div>
        </div>

        {/* 补充说明 */}
        <div className="flex flex-col gap-[12px]">
          <span className="text-[14px] font-medium leading-[22px] text-[rgba(0,0,0,0.88)]">其他需求</span>
          <div className="relative rounded-[8px] h-[40px]">
            <div aria-hidden className="absolute inset-0 rounded-[8px] border border-[#e6e6e6] pointer-events-none" />
            <input className="w-full h-full px-[12px] text-[14px] leading-[22px] placeholder:text-[rgba(0,0,0,0.26)] bg-transparent outline-none" placeholder="请输入您想强调的关键数据、特定观点或特殊要求…" onFocus={handleInteract} />
          </div>
        </div>
      </div>

      <PanelFooter count={count} cancelled={cancelled} onConfirm={handleConfirm} pptMode={pptMode} onPptModeChange={onPptModeChange} />
    </SlidePanel>
  );
}

// ── outline panel ─────────────────────────────────────────────────────────────

type PresentationMode = "smart" | "visual";

function VisualizationSubmenu({ onSelect, anchor, onMouseEnter, onMouseLeave }: {
  onSelect: (style: string) => void;
  anchor: HTMLElement | null;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}) {
  const styles = ["智能匹配", "折线图", "柱状图", "饼图"];
  return (
    <OperationMenu submenu anchor={anchor} onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave} className="w-[168px] rounded-[12px] border border-[#f2f2f2] bg-white px-[8px] py-[4px] shadow-[0_0_12px_rgba(0,0,0,0.08)]">
      {styles.map((style, index) => (
        <button
          key={style}
          type="button"
          onClick={event => { event.stopPropagation(); onSelect(style); }}
          className="flex w-full items-center justify-between rounded-[8px] px-[8px] py-[7px] text-left hover:bg-[#f7f7f7]"
        >
          <span className="text-[14px] leading-[22px] text-[rgba(0,0,0,0.88)]">{style}</span>
          {index === 0 && <span className="text-[#1e63f5]">✓</span>}
        </button>
      ))}
    </OperationMenu>
  );
}

function PresentationMenu({ mode, onChange, onClose, anchor }: {
  anchor: HTMLElement | null;
  mode: PresentationMode;
  onChange: (mode: PresentationMode) => void;
  onClose: () => void;
}) {
  const [visualHovered, setVisualHovered] = useState(false);
  const visualRef = useRef<HTMLDivElement>(null);
  const closeVisualTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const openVisualMenu = () => {
    if (closeVisualTimer.current) clearTimeout(closeVisualTimer.current);
    setVisualHovered(true);
  };
  const deferCloseVisualMenu = () => {
    if (closeVisualTimer.current) clearTimeout(closeVisualTimer.current);
    closeVisualTimer.current = setTimeout(() => setVisualHovered(false), 140);
  };
  useEffect(() => () => {
    if (closeVisualTimer.current) clearTimeout(closeVisualTimer.current);
  }, []);
  return (
    <OperationMenu anchor={anchor} className="w-[304px] rounded-[12px] border border-[#f2f2f2] bg-white px-[8px] py-[4px] shadow-[0_0_12px_rgba(0,0,0,0.08)]">
      <button
        type="button"
        onClick={event => { event.stopPropagation(); onChange("smart"); onClose(); }}
        className="flex w-full items-start gap-[8px] rounded-[8px] p-[8px] text-left hover:bg-[#f7f7f7]"
      >
        <span className={`mt-[5px] flex size-[16px] shrink-0 items-center justify-center rounded-full border ${mode === "smart" ? "border-[#1e63f5]" : "border-[rgba(0,0,0,0.26)]"}`}>
          {mode === "smart" && <span className="size-[8px] rounded-full bg-[#1e63f5]" />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[14px] leading-[22px] text-[rgba(0,0,0,0.88)]">智能呈现</span>
          <span className="block text-[14px] leading-[22px] text-[rgba(0,0,0,0.6)] font-normal">AI 综合内容，自动匹配最佳呈现方式</span>
        </span>
      </button>
      <div ref={visualRef} className="relative" onMouseEnter={openVisualMenu} onMouseLeave={deferCloseVisualMenu}>
        <button
          type="button"
          onClick={event => { event.stopPropagation(); onChange("visual"); onClose(); }}
          className="flex w-full items-start gap-[8px] rounded-[8px] p-[8px] text-left hover:bg-[#f7f7f7]"
        >
          <span className={`mt-[5px] flex size-[16px] shrink-0 items-center justify-center rounded-full border ${mode === "visual" ? "border-[#1e63f5]" : "border-[rgba(0,0,0,0.26)]"}`}>
            {mode === "visual" && <span className="size-[8px] rounded-full bg-[#1e63f5]" />}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[14px] leading-[22px] text-[rgba(0,0,0,0.88)]">可视化呈现</span>
            <span className="block max-w-[220px] break-words pr-[8px] text-[14px] leading-[22px] text-[rgba(0,0,0,0.6)] font-normal">把数据、流程和知识概念转成直观图表可视化</span>
          </span>
          <span className="mt-[5px] text-[rgba(0,0,0,0.26)]">›</span>
        </button>
        {visualHovered && <VisualizationSubmenu anchor={visualRef.current?.querySelector("button") ?? null} onMouseEnter={openVisualMenu} onMouseLeave={deferCloseVisualMenu} onSelect={() => { onChange("visual"); onClose(); }} />}
      </div>
    </OperationMenu>
  );
}

function OutlinePageCard({ page, presentation, onPresentationChange }: {
  page: OutlinePage;
  presentation: PresentationMode;
  onPresentationChange: (mode: PresentationMode) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const presentationTriggerRef = useRef<HTMLButtonElement>(null);
  const showControl = hovered || menuOpen || presentation === "visual";
  const label = presentation === "visual" ? "呈现形式：可视化呈现" : "呈现形式：智能呈现";

  return (
    <div
      className="bg-[#f7f7f7] relative rounded-[8px] shrink-0 w-full"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => { setHovered(false); if (!menuOpen) setMenuOpen(false); }}
    >
      <div className="flex flex-col gap-[8px] items-start p-[8px]">
        <div className="relative w-full min-h-[20px]">
          <p className="font-['PingFang_SC:Regular' font-normal,sans-serif] leading-[20px] text-[12px] text-[rgba(0,0,0,0.38)] tracking-[0.012px] whitespace-nowrap">{page.pageLabel}</p>
          {showControl && (
            <div className="absolute right-0 top-0 z-10">
              <button
                ref={presentationTriggerRef}
                type="button"
                onClick={event => { event.stopPropagation(); setMenuOpen(value => !value); }}
                className={`flex items-center gap-[8px] rounded-[4px] bg-white px-[8px] py-px text-[14px] leading-[22px] tracking-[0.014px] transition-colors ${presentation === "visual" ? "text-[#1e63f5]" : "text-[rgba(0,0,0,0.88)]"}`}
              >
                {presentation === "visual" && <span className="text-[#1e63f5]">▣</span>}
                <span className="font-normal">{label}</span>
                <svg className="size-[8px]" fill="none" viewBox="0 0 5.82064 4.69468" preserveAspectRatio="none">
                  <path d={svgPresentation.p35e26b00} fill={presentation === "visual" ? "#1E63F5" : "black"} fillOpacity={presentation === "visual" ? "1" : "0.88"} />
                </svg>
              </button>
              {menuOpen && <PresentationMenu anchor={presentationTriggerRef.current} mode={presentation} onChange={onPresentationChange} onClose={() => setMenuOpen(false)} />}
            </div>
          )}
        </div>
        <p className="font-medium leading-[24px] text-[16px] text-[rgba(0,0,0,0.88)] w-full">{page.title}</p>
        {page.content.type === "text" ? (
          <p className="leading-[22px] text-[14px] text-[rgba(0,0,0,0.88)] tracking-[0.014px] w-full">{page.content.text}</p>
        ) : (
          <ul className="list-disc leading-[22px] text-[14px] text-[rgba(0,0,0,0.88)] tracking-[0.014px] w-full">
            {page.content.items.map((item, i) => (
              <li key={i} className="ms-[21px]">{item}</li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function OutlinePanel({ visible, onClose, onConfirm, mainOffset = 0 }: {
  visible: boolean; onClose: () => void; onConfirm: () => void; mainOffset?: number;
}) {
  const [pages, setPages] = useState<OutlinePage[]>([]);
  const [showAiEdit, setShowAiEdit] = useState(false);
  const [aiEditText, setAiEditText] = useState("");
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [presentations, setPresentations] = useState<Record<number, PresentationMode>>({});
  const scrollRef = useRef<HTMLDivElement>(null);
  const aiInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (visible) { setPages(mockOutlinePages()); setShowAiEdit(false); setPresentations({}); }
  }, [visible]);

  const handleConfirm = useCallback(() => onConfirm(), [onConfirm]);
  const { count, cancelled, cancel } = useCountdown(visible && pages.length > 0, 30, handleConfirm);

  const handleAiEditClick = () => {
    cancel();
    setShowAiEdit(true);
    setTimeout(() => aiInputRef.current?.focus(), 50);
  };

  const handleAiSubmit = () => {
    if (!aiEditText.trim()) return;
    cancel();
    setIsRegenerating(true);
    setAiEditText("");
    setShowAiEdit(false);
    setTimeout(() => {
      setPages(mockOutlinePages().map((p, i) => ({
        ...p,
        content: i === 0
          ? { type: "text" as const, text: p.content.type === "text" ? p.content.text + "（已根据您的需求调整）" : p.content.text }
          : p.content,
      })));
      setIsRegenerating(false);
    }, 1500);
  };

  return (
    <SlidePanel visible={visible} onClose={onClose} mainOffset={mainOffset}>
      {/* header — matches Frame4 from design */}
      <div className="shrink-0 bg-[rgba(255,255,255,0.5)] px-[16px] pt-[16px] pb-[12px]">
        <div className="flex items-center justify-between w-full">
          <p className="text-[16px] font-medium leading-[24px] text-[rgba(0,0,0,0.88)] tracking-[0.016px]">PPT大纲</p>
          <CloseBtn onClick={onClose} />
        </div>
        <p className="text-[14px] leading-[22px] text-[rgba(0,0,0,0.6)] tracking-[0.014px] mt-[2px] w-full">AI将依据此大纲生成PPT，请核对</p>
      </div>

      {/* body — scrollable page cards, matches Frame7 */}
      <div ref={scrollRef} onScroll={cancel} onClick={cancel} className="flex-1 overflow-y-auto min-h-0 px-[16px] py-[12px] flex flex-col gap-[12px]">
        {isRegenerating ? (
          <div className="flex items-center justify-center py-[40px] gap-[8px] text-[14px] text-[rgba(0,0,0,0.38)]">
            <span className="animate-spin w-[16px] h-[16px] border-2 border-[#1e63f5] border-t-transparent rounded-full inline-block" />
            AI 正在优化大纲…
          </div>
        ) : (
          pages.map(p => <OutlinePageCard
            key={p.id}
            page={p}
            presentation={presentations[p.id] ?? "smart"}
            onPresentationChange={mode => setPresentations(current => ({ ...current, [p.id]: mode }))}
          />)
        )}
      </div>

      {/* AI edit inline input (shown when AI编辑 clicked) */}
      {showAiEdit && (
        <div className="shrink-0 px-[16px] py-[10px] border-t border-[#f2f2f2] flex items-center gap-[8px] bg-[#fafafa]">
          <svg width="16" height="16" viewBox="0 0 14 14.6644" fill="none" className="shrink-0">
            <path d={svgOutline.p3fbfc4c0} fill="black" fillOpacity="0.6" />
          </svg>
          <input
            ref={aiInputRef}
            value={aiEditText}
            onChange={e => setAiEditText(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") handleAiSubmit(); if (e.key === "Escape") setShowAiEdit(false); }}
            className="flex-1 text-[14px] leading-[22px] text-[rgba(0,0,0,0.88)] placeholder:text-[rgba(0,0,0,0.26)] outline-none bg-transparent"
            placeholder="描述你的修改需求，Enter 确认…"
          />
          <button onClick={() => setShowAiEdit(false)}
            className="text-[13px] text-[rgba(0,0,0,0.38)] px-[8px] py-[3px] cursor-pointer hover:text-[rgba(0,0,0,0.6)]">取消</button>
          <button onClick={handleAiSubmit} disabled={!aiEditText.trim()}
            className={`text-[13px] leading-[20px] px-[12px] py-[3px] rounded-[6px] transition-colors cursor-pointer ${aiEditText.trim() ? "bg-[#1e63f5] text-white" : "bg-[#f2f2f2] text-[rgba(0,0,0,0.26)]"}`}
          >生成</button>
        </div>
      )}

      {/* footer — matches Frame6: countdown | AI编辑 | 确认 */}
      <div className="shrink-0 bg-[rgba(255,255,255,0.5)] border-t border-[#f2f2f2]">
        <div className="flex items-center gap-[12px] px-[16px] py-[16px]">
          <p className="flex-1 text-[14px] leading-[22px] text-[rgba(0,0,0,0.88)] tracking-[0.014px]">
            {!cancelled && <><span className="text-[#1e63f5] font-normal">{count}S</span><span className="text-[rgba(0,0,0,0.88)]"> 后自动确认</span></>}
          </p>
          {/* AI编辑 button */}
          <button onClick={handleAiEditClick}
            className="relative flex items-center gap-[8px] px-[16px] py-[5px] rounded-[8px] cursor-pointer hover:bg-[#f7f7f7] transition-colors">
            <div aria-hidden className="absolute inset-0 rounded-[8px] border border-[#e6e6e6] pointer-events-none" />
            <svg width="16" height="16" viewBox="0 0 14 14.6644" fill="none" className="shrink-0">
              <path d={svgOutline.p3fbfc4c0} fill="black" fillOpacity="0.88" />
            </svg>
            <span className="text-[14px] leading-[22px] font-normal text-[rgba(0,0,0,0.88)] tracking-[0.014px] whitespace-nowrap">AI编辑</span>
          </button>
          {/* 确认 button */}
          <button onClick={handleConfirm}
            className="bg-[#1e63f5] text-[rgba(255,255,255,0.98)] text-[14px] font-normal leading-[22px]  tracking-[0.014px] px-[16px] py-[5px] rounded-[8px] cursor-pointer hover:opacity-90 transition-opacity">
            确认
          </button>
        </div>
      </div>
    </SlidePanel>
  );
}

// ── PPT preview ───────────────────────────────────────────────────────────────

// ── memory management ─────────────────────────────────────────────────────────

const initialMemories = [
  {
    title: "关于你",
    editorInlineBoldId: "fge-143",
    content: "XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
  },
  {
    title: "XXXX",
    editorInlineBoldId: "fge-153",
    content: "XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
  },
  {
    title: "XXXX",
    content: "XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
  },
];

function MemoryModal({ onClose }: { onClose: () => void }) {
  const [enabled, setEnabled] = useState(true);
  const [memories, setMemories] = useState(initialMemories);
  const [memoryInput, setMemoryInput] = useState("");
  const [pendingMemory, setPendingMemory] = useState("");
  const [updateStatus, setUpdateStatus] = useState<"idle" | "updating" | "success">("idle");

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  useEffect(() => {
    if (updateStatus === "updating") {
      const timer = window.setTimeout(() => {
        setMemories(current => [...current, { title: "XXXX", content: pendingMemory }]);
        setPendingMemory("");
        setUpdateStatus("success");
      }, 3000);
      return () => window.clearTimeout(timer);
    }

    if (updateStatus === "success") {
      const timer = window.setTimeout(() => setUpdateStatus("idle"), 3000);
      return () => window.clearTimeout(timer);
    }
  }, [pendingMemory, updateStatus]);

  const addMemory = (event: React.FormEvent) => {
    event.preventDefault();
    const value = memoryInput.trim();
    if (!value || updateStatus !== "idle") return;
    setPendingMemory(value);
    setMemoryInput("");
    setUpdateStatus("updating");
  };

  return (
    <div className="fixed inset-0 z-[300] overflow-hidden bg-[rgba(0,0,0,0.5)]">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="memory-title"
        className="fixed bottom-0 flex h-[calc(100vh-72px)] max-h-[828px] w-[min(800px,calc(100vw-32px))] -translate-x-1/2 flex-col overflow-hidden rounded-t-[16px] bg-white"
        style={{ left: "calc(50% + min(40px, 3vw))" }}
      >
        <header className="relative h-[76px] shrink-0">
          <h2
            id="memory-title"
            className="absolute left-[24px] top-[26px] font-['PingFang_SC:Medium'] text-[20px] font-semibold leading-[28px] tracking-[0.02px] text-[rgba(0,0,0,0.88)]"
          >
            记忆
          </h2>
          <button
            type="button"
            aria-label="关闭记忆管理"
            onClick={onClose}
            className="absolute right-[24px] top-[24px] flex size-[32px] cursor-pointer items-center justify-center rounded-[4px] hover:bg-[#f7f7f7]"
          >
            <img src="/assets/30367.svg" alt="" />
          </button>
        </header>

        <div className="flex shrink-0 items-center gap-[12px] px-[24px]">
          <div className="min-w-0 flex-1">
            <p className="font-['PingFang_SC:Medium'] text-[16px] font-semibold leading-[24px] tracking-[0.016px] text-[rgba(0,0,0,0.88)]">允许记忆</p>
            <p className="mt-[4px] font-['PingFang_SC:Regular'] text-[14px] leading-[22px] tracking-[0.014px] text-[rgba(0,0,0,0.6)]">
              允许 AI从对话中提取并记住相关上下文，以便在未来对话中提供更连贯、个性化的回应。
            </p>
          </div>
          {enabled && (
            <>
              <button
                type="button"
                onClick={() => setMemories([])}
                className="shrink-0 cursor-pointer rounded-[4px] px-[4px] py-[3px] font-['PingFang_SC:Regular'] text-[14px] leading-[22px] tracking-[0.014px] text-[#fc5926]"
              >
                重置
              </button>
              <button
                type="button"
                className="shrink-0 cursor-pointer rounded-[4px] px-[4px] py-[3px] font-['PingFang_SC:Regular'] text-[14px] leading-[22px] tracking-[0.014px] text-[#1e63f5]"
              >
                导入
              </button>
            </>
          )}
          <button
            type="button"
            role="switch"
            aria-checked={enabled}
            aria-label="允许记忆"
            onClick={() => setEnabled(value => !value)}
            className="shrink-0 cursor-pointer rounded-full"
          >
            <img src={enabled ? "/assets/07533.svg" : "/assets/29026.svg"} alt="" />
          </button>
        </div>

        {enabled && (
          <>
            <div className="mt-[16px] min-h-0 flex-1 overflow-y-auto px-[24px] pb-[72px]">
              {memories.map((memory, index) => (
                <div key={`${memory.title}-${index}`} className="mb-[24px]">
                  <p className="font-['PingFang_SC:Medium'] text-[14px] leading-[22px] tracking-[0.014px] text-[rgba(0,0,0,0.88)]">
                    {memory.editorInlineBoldId ? (
                      <span className="fg-inline-bold font-bold" data-fge-id={memory.editorInlineBoldId}>{memory.title}</span>
                    ) : memory.title}
                  </p>
                  <p className="mt-[12px] break-words font-['PingFang_SC:Regular'] text-[14px] leading-[22px] tracking-[0.014px] text-[rgba(0,0,0,0.88)]">
                    {memory.content}
                  </p>
                </div>
              ))}
            </div>
            {updateStatus === "idle" && (
              <form onSubmit={addMemory} className="absolute bottom-0 left-0 flex w-full items-center bg-[rgba(255,255,255,0.01)] p-[16px]">
                <div className="flex h-[40px] flex-1 items-center overflow-hidden rounded-full border border-[#e6e6e6] bg-white pl-[15px] pr-[7px] shadow-[0_0_12px_rgba(0,0,0,0.08)]">
                  <input
                    value={memoryInput}
                    onChange={event => setMemoryInput(event.target.value)}
                    aria-label="添加或删除记忆"
                    placeholder="告诉我记住什么？忘记什么？"
                    className="min-w-0 flex-1 bg-transparent font-['PingFang_SC:Regular'] text-[14px] leading-[22px] tracking-[0.014px] text-[rgba(0,0,0,0.88)] outline-none placeholder:text-[rgba(0,0,0,0.26)]"
                  />
                  <button
                    type="submit"
                    aria-label="提交记忆"
                    disabled={!memoryInput.trim()}
                    className={`flex size-[24px] shrink-0 items-center justify-center rounded-full ${
                      memoryInput.trim() ? "cursor-pointer bg-[#1e63f5]" : "cursor-default bg-[#f2f2f2]"
                    }`}
                  >
                    <img src={memoryInput.trim() ? "/assets/3b7df.svg" : "/assets/23b2e.svg"} alt="" />
                  </button>
                </div>
              </form>
            )}
            {updateStatus === "updating" && (
              <div
                role="status"
                className="absolute bottom-[32px] left-1/2 flex min-h-[44px] -translate-x-1/2 items-center gap-[8px] rounded-full bg-white py-[8px] pl-[8px] pr-[16px] shadow-[0_0_6px_rgba(0,0,0,0.08)]"
              >
                <img src="/assets/34657.svg" alt="" className="shrink-0 animate-spin" />
                <span className="whitespace-nowrap font-['PingFang_SC:Regular'] text-[14px] leading-[22px] tracking-[0.014px] text-[rgba(0,0,0,0.88)]">
                  正在更新记忆
                </span>
              </div>
            )}
          </>
        )}
      </section>
      {updateStatus === "success" && (
        <div
          role="status"
          className="fixed top-[24px] z-[310] flex min-h-[44px] -translate-x-1/2 items-center gap-[8px] rounded-full border border-[#38e38a] bg-white py-[8px] pl-[8px] pr-[16px] shadow-[0_0_6px_rgba(0,0,0,0.08)]"
          style={{ left: "calc(50% + min(40px, 3vw))" }}
        >
          <img src="/assets/00c34.svg" alt="" className="shrink-0" />
          <span className="whitespace-nowrap font-['PingFang_SC:Regular'] text-[14px] leading-[22px] tracking-[0.014px] text-[rgba(0,0,0,0.88)]">
            记忆更新成功
          </span>
        </div>
      )}
    </div>
  );
}

// ── sidebar ───────────────────────────────────────────────────────────────────

type HistoryItem = { id: number; title: string; pinned?: boolean; messages: Message[]; projectId?: number; createdAt?: number; archived?: boolean };
type ProjectItem = { id: number; name: string; description?: string; instruction: string; pinned?: boolean; members?: ProjectMember[]; files?: ProjectFiles; owner?: string; archived?: boolean };

function TaskProjectMoveMenu({ projects, projectId, onMove, onCreate }: {
  projects: ProjectItem[];
  projectId?: number;
  onMove: (projectId: number | undefined) => void;
  onCreate: () => void;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const targets = projects.filter(project => project.id !== projectId);
  const openMenu = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    setOpen(true);
  };
  const deferClose = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setOpen(false), 140);
  };

  useEffect(() => () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
  }, []);

  return (
    <div className="relative" onMouseEnter={openMenu} onMouseLeave={deferClose}>
      <button ref={triggerRef} type="button" role="menuitem" aria-haspopup="menu" aria-expanded={open} onClick={openMenu} onKeyDown={event => {
        if (event.key === "ArrowRight" || event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          openMenu();
        }
      }} className={`flex w-full cursor-pointer items-center gap-[8px] rounded-[8px] px-[8px] py-[11px] text-left text-[14px] font-normal leading-[22px] tracking-[0.014px] ${open ? "bg-[#f2f2f2]" : "hover:bg-[#f7f7f7]"}`}>
        <img src="/assets/1d8f2.svg" alt="" className="shrink-0" />
        <span className="min-w-0 flex-1">移动到项目</span>
        <img src="/assets/fb6a4.svg" alt="" className="shrink-0" />
      </button>
      {open && (
        <OperationMenu submenu anchor={triggerRef.current} role="menu" aria-label="移动到项目" onMouseEnter={openMenu} onMouseLeave={deferClose} onPointerDown={event => event.stopPropagation()} onKeyDown={event => {
          if (event.key === "Escape" || event.key === "ArrowLeft") {
            event.stopPropagation();
            setOpen(false);
            triggerRef.current?.focus();
          }
        }} className="w-[232px] overflow-hidden rounded-[12px] border border-[#f2f2f2] bg-white px-[8px] py-[4px] shadow-[0_0_12px_rgba(0,0,0,0.08)]">
          <div className="flex max-h-[480px] flex-col overflow-y-auto py-[4px]">
            {targets.length === 0 ? (
              <div className="px-[8px] py-[11px] text-[14px] leading-[22px] text-[rgba(0,0,0,0.38)]">暂无项目</div>
            ) : targets.map(project => (
              <button key={project.id} type="button" role="menuitem" onClick={() => onMove(project.id)} className="flex w-full cursor-pointer items-center gap-[8px] rounded-[8px] px-[8px] py-[11px] text-left text-[14px] font-normal leading-[22px] tracking-[0.014px] hover:bg-[#f7f7f7]">
                <img src="/assets/d95df.svg" alt="" className="shrink-0" />
                <span className="min-w-0 flex-1 truncate">{project.name}</span>
              </button>
            ))}
            <div className="relative h-px w-full"><img src="/assets/4b9c6.svg" alt="" className="absolute left-0 top-0" /></div>
            <button type="button" role="menuitem" onClick={onCreate} className="flex w-full cursor-pointer items-center gap-[8px] rounded-[8px] px-[8px] py-[11px] text-left text-[14px] font-normal leading-[22px] tracking-[0.014px] hover:bg-[#f7f7f7]">
              <img src="/assets/eede2.svg" alt="" className="shrink-0" />新建项目
            </button>
            {projectId !== undefined && (
              <button type="button" role="menuitem" onClick={() => onMove(undefined)} className="flex w-full cursor-pointer items-center gap-[8px] rounded-[8px] px-[8px] py-[11px] text-left text-[14px] font-normal leading-[22px] tracking-[0.014px] hover:bg-[#f7f7f7]">
                <img src="/assets/6ec2b.svg" alt="" className="shrink-0" />从项目中移出
              </button>
            )}
          </div>
        </OperationMenu>
      )}
    </div>
  );
}

const TaskOperationsMenu = forwardRef<HTMLDivElement, {
  anchor: HTMLElement | null;
  task: HistoryItem;
  projects: ProjectItem[];
  align?: "start" | "end";
  gap?: number;
  onTogglePin: () => void;
  onRename: (title: string) => void;
  onMove: (projectId: number | undefined) => void;
  onCreateProject: () => void;
  onArchive: () => void;
  onDelete: () => void;
  onClose: () => void;
}>(({ anchor, task, projects, align, gap, onTogglePin, onRename, onMove, onCreateProject, onArchive, onDelete, onClose }, ref) => {
  const itemClassName = "flex w-full cursor-pointer items-center gap-[8px] rounded-[8px] px-[8px] py-[11px] text-left text-[14px] font-normal leading-[22px] tracking-[0.014px] hover:bg-[#f7f7f7]";
  const labelClassName = "whitespace-nowrap font-['PingFang_SC:Regular'] font-normal text-[14px] leading-[22px] tracking-[0.014px] text-[rgba(0,0,0,0.88)]";
  return (
    <OperationMenu
      anchor={anchor}
      ref={ref}
      align={align}
      gap={gap}
      role="menu"
      aria-label="任务操作"
      onKeyDown={event => {
        if (event.key !== "Escape") return;
        onClose();
        anchor?.focus();
      }}
      className="w-[192px] overflow-visible rounded-[12px] border border-[#f2f2f2] bg-white px-[8px] py-[4px] shadow-[0_0_12px_rgba(0,0,0,0.08)]"
    >
      <div className="flex flex-col py-[4px]">
        <button type="button" role="menuitem" onClick={() => { onTogglePin(); onClose(); }} className={itemClassName}>
          <img src={task.pinned ? "/assets/67fe6.svg" : "/assets/4363a.svg"} alt="" className="shrink-0" />
          <span className={labelClassName}>{task.pinned ? "取消置顶" : "置顶此对话"}</span>
        </button>
        <button
          type="button"
          role="menuitem"
          onClick={() => {
            const name = window.prompt("请输入新的任务名称", task.title)?.trim();
            if (name) onRename(name);
            onClose();
          }}
          className={itemClassName}
        >
          <img src="/assets/e2b81.svg" alt="" className="shrink-0" />
          <span className={labelClassName}>重命名</span>
        </button>
        <TaskProjectMoveMenu
          key={task.id}
          projects={projects}
          projectId={task.projectId}
          onMove={projectId => { onMove(projectId); onClose(); }}
          onCreate={() => { onClose(); onCreateProject(); }}
        />
        <button type="button" role="menuitem" onClick={() => { onArchive(); onClose(); }} className={itemClassName}>
          <img src="/assets/ae0d0.svg" alt="" className="shrink-0" />
          <span className={labelClassName}>归档</span>
        </button>
        <button type="button" role="menuitem" onClick={() => { onDelete(); onClose(); }} className={itemClassName}>
          <img src="/assets/5ff6b.svg" alt="" className="shrink-0" />
          <span className={labelClassName}>删除</span>
        </button>
      </div>
    </OperationMenu>
  );
});
TaskOperationsMenu.displayName = "TaskOperationsMenu";

function CreateProjectDialog({ open, onOpenChange, onCreate, editProject, onEdit }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (project: Omit<ProjectItem, "id">) => void;
  editProject?: ProjectItem | null;
  onEdit?: (updates: { name: string; description: string }) => void;
}) {
  const editing = Boolean(editProject);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  // 打开时按编辑模式预填现有项目信息
  useEffect(() => {
    if (open) {
      setName(editProject?.name ?? "");
      setDescription(editProject?.description ?? "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handleOpenChange = (nextOpen: boolean) => {
    onOpenChange(nextOpen);
    if (!nextOpen) {
      setName("");
      setDescription("");
    }
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) return;
    if (editing && onEdit) onEdit({ name: trimmedName, description: description.trim() });
    else onCreate({ name: trimmedName, description: description.trim(), instruction: "" });
    handleOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        aria-describedby={undefined}
        className="w-[720px] max-w-[calc(100%-32px)] gap-0 overflow-hidden rounded-[12px] border-0 bg-white p-0 shadow-[0_0_12px_rgba(0,0,0,0.08)] sm:max-w-[calc(100%-32px)] [&>button]:hidden"
      >
        <form onSubmit={handleSubmit}>
          <div className="flex w-full flex-col gap-[4px] px-[24px] py-[16px]">
            <div className="relative h-[24px] w-full">
              <DialogTitle className="font-['PingFang_SC:Medium'] text-[16px] font-medium leading-[24px] tracking-[0.016px] text-[rgba(0,0,0,0.88)]">
                {editing ? "编辑项目信息" : "新建项目"}
              </DialogTitle>
              <DialogClose asChild>
                <button
                  type="button"
                  aria-label={editing ? "关闭编辑项目信息弹窗" : "关闭新建项目弹窗"}
                  className="absolute right-0 top-0 flex size-[24px] cursor-pointer items-center justify-center rounded-[4px] hover:bg-[#f7f7f7]"
                >
                  <img src="/assets/f802d.svg" alt="" />
                </button>
              </DialogClose>
            </div>
          </div>

          <div className="flex w-full flex-col items-start px-[12px] pt-[16px]">
            <label className="flex w-full flex-col gap-[8px] pb-[24px]">
              <span className="pl-[12px] font-['PingFang_SC:Medium'] text-[14px] font-medium leading-[22px] tracking-[0.014px] text-[rgba(0,0,0,0.6)]">
                项目名称
              </span>
              <div className="px-[12px]">
                <div className="flex h-[32px] w-full items-center gap-[8px] rounded-[8px] border border-[#e6e6e6] px-[12px] focus-within:border-[#1e63f5]">
                  <input
                    autoFocus
                    required
                    maxLength={30}
                    value={name}
                    onChange={event => setName(event.target.value)}
                    placeholder="请输入项目名称"
                    className="min-w-0 flex-1 bg-transparent font-['PingFang_SC:Regular'] text-[14px] font-normal leading-[22px] tracking-[0.014px] text-[rgba(0,0,0,0.88)] outline-none placeholder:text-[rgba(0,0,0,0.26)]"
                  />
                  <span className="shrink-0 font-['PingFang_SC:Regular'] text-[14px] font-normal leading-[22px] tracking-[0.014px] text-[rgba(0,0,0,0.38)]">
                    {name.length}/30
                  </span>
                </div>
              </div>
            </label>

            <label className="flex w-full flex-col gap-[8px] pb-[24px]">
              <span className="pl-[12px] font-['PingFang_SC:Medium'] text-[14px] font-medium leading-[22px] tracking-[0.014px] text-[rgba(0,0,0,0.6)]">
                简介
              </span>
              <div className="px-[12px]">
                <div className="relative w-full overflow-hidden rounded-[8px] border border-[#e6e6e6] focus-within:border-[#1e63f5]">
                  <textarea
                    value={description}
                    onChange={event => setDescription(event.target.value)}
                    maxLength={100}
                    placeholder="请描述项目简介"
                    className="block h-[78px] w-full resize-none bg-white p-[12px] pb-[24px] font-['PingFang_SC:Regular'] text-[14px] font-normal leading-[22px] tracking-[0.014px] text-[rgba(0,0,0,0.88)] outline-none placeholder:text-[rgba(0,0,0,0.26)]"
                  />
                  <img src="/assets/166cb.svg" alt="" className="pointer-events-none absolute bottom-[4px] right-[4px]" />
                </div>
              </div>
            </label>
          </div>

          <div className="flex h-[80px] w-full items-center justify-end gap-[24px] px-[24px]">
            <DialogClose asChild>
              <button
                type="button"
                className="cursor-pointer rounded-[4px] px-[4px] py-[3px] text-[14px] font-normal leading-[22px] tracking-[0.014px] text-[rgba(0,0,0,0.6)] hover:bg-[#f7f7f7]"
              >
                取消
              </button>
            </DialogClose>
            <button
              type="submit"
              disabled={!name.trim()}
              className="cursor-pointer rounded-[4px] bg-[#1e63f5] px-[16px] py-[5px] text-[14px] font-normal leading-[22px] tracking-[0.014px] text-[rgba(255,255,255,0.98)] hover:bg-[#1554d1] disabled:cursor-not-allowed disabled:bg-[#99C3FF] disabled:hover:bg-[#99C3FF]"
            >
              确定
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ *
 * 删除项目确认弹窗 — Figma 9244:31443
 * 480 宽 / 8 圆角；标题行（24 删除图标 + 20/28 中黑 + 右上关闭）、
 * 说明文案左缩进 32（与标题文字对齐）、底部右对齐「取消 / 确定」。
 * 确定后由上层真正删除项目并 toast「删除成功」。
 * ------------------------------------------------------------------ */
function DeleteProjectDialog({ open, onOpenChange, onConfirm }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        aria-describedby={undefined}
        className="w-[480px] max-w-[calc(100%-32px)] gap-0 overflow-hidden rounded-[8px] border-0 bg-white p-0 shadow-[0_0_12px_rgba(0,0,0,0.08)] sm:max-w-[calc(100%-32px)] [&>button]:hidden"
      >
        <div className="flex items-center gap-[8px] px-[16px] pt-[24px]">
          <img src="/assets/dialog-delete-icon.svg" alt="" className="size-[24px] shrink-0" />
          <DialogTitle className="min-w-0 flex-1 text-[20px] font-medium leading-[28px] tracking-[0.001em] text-[rgba(0,0,0,0.88)]">
            确定要删除此项目吗？
          </DialogTitle>
          <DialogClose asChild>
            <button
              type="button"
              aria-label="关闭删除项目弹窗"
              className="flex size-[24px] shrink-0 cursor-pointer items-center justify-center rounded-[4px] hover:bg-[#f2f2f2]"
            >
              <img src="/assets/search-dialog-close.svg" alt="" className="size-[20px]" />
            </button>
          </DialogClose>
        </div>
        <p className="px-[16px] pb-0 pl-[48px] pt-[16px] text-[14px] font-normal leading-[22px] tracking-[0.014px] text-[rgba(0,0,0,0.88)]">
          删除后项目将被永久删除，项目内所有任务及产物，且不可恢复。
        </p>
        <div className="flex items-center justify-end gap-[24px] px-[16px] pb-[16px] pt-[16px]">
          <DialogClose asChild>
            <button
              type="button"
              className="cursor-pointer rounded-[4px] px-[4px] py-[3px] text-[14px] font-normal leading-[22px] tracking-[0.014px] text-[rgba(0,0,0,0.6)] hover:bg-[#f2f2f2]"
            >
              取消
            </button>
          </DialogClose>
          <button
            type="button"
            onClick={onConfirm}
            className="cursor-pointer rounded-[4px] bg-[#1e63f5] px-[16px] py-[5px] text-[14px] font-normal leading-[22px] tracking-[0.014px] text-[rgba(255,255,255,0.98)] hover:bg-[#1554d1]"
          >
            确定
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ *
 * 删除任务（会话）确认弹窗 — Figma 459:38570
 * 480 宽 / 8 圆角 / 内边距 24 16 0；标题行（24 取消圆叉 + 20/28 中黑 + 右上关闭，gap 8）、
 * 说明文案左缩进 32（与标题文字对齐）、底部上下 16 留白 + 右对齐「取消 / 确定」（gap 24）。
 * 侧栏「···」、归档页、项目详情三处删任务都先走这里，确定后才真正删。
 * ------------------------------------------------------------------ */
function DeleteChatTaskDialog({ open, onOpenChange, onConfirm }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        aria-describedby={undefined}
        className="w-[480px] max-w-[calc(100%-32px)] gap-0 overflow-hidden rounded-[8px] border-0 bg-white p-0 shadow-[0_0_12px_rgba(0,0,0,0.08)] sm:max-w-[calc(100%-32px)] [&>button]:hidden"
      >
        <div className="flex flex-col gap-[16px] px-[16px] pt-[24px]">
          <div className="flex items-center gap-[8px]">
            <img src="/assets/dialog-delete-icon.svg" alt="" className="size-[24px] shrink-0" />
            <DialogTitle className="min-w-0 flex-1 truncate text-[20px] font-medium leading-[28px] tracking-[0.001em] text-[rgba(0,0,0,0.88)]">
              确定删除此任务？
            </DialogTitle>
            <DialogClose asChild>
              <button
                type="button"
                aria-label="关闭删除任务弹窗"
                className="flex size-[24px] shrink-0 cursor-pointer items-center justify-center rounded-[4px] hover:bg-[#f2f2f2]"
              >
                <img src="/assets/search-dialog-close.svg" alt="" className="size-[20px]" />
              </button>
            </DialogClose>
          </div>
          <p className="pl-[32px] text-[14px] font-normal leading-[22px] tracking-[0.014px] text-[rgba(0,0,0,0.88)]">
            删除后，聊天记录将不可恢复。
          </p>
          <div className="flex items-center justify-end gap-[24px] pb-[16px] pt-[16px]">
            <DialogClose asChild>
              <button
                type="button"
                className="cursor-pointer rounded-[4px] px-[4px] py-[3px] text-[14px] font-normal leading-[22px] tracking-[0.014px] text-[rgba(0,0,0,0.6)] hover:bg-[#f2f2f2]"
              >
                取消
              </button>
            </DialogClose>
            <DialogClose asChild>
              <button
                type="button"
                onClick={onConfirm}
                className="cursor-pointer rounded-[4px] bg-[#1e63f5] px-[16px] py-[5px] text-[14px] font-normal leading-[22px] tracking-[0.014px] text-[rgba(255,255,255,0.98)] hover:bg-[#1554d1]"
              >
                确定
              </button>
            </DialogClose>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ *
 * 搜索弹窗 — Figma「AI Chat Component / - Search」(8844:40946)
 * 弹窗固定 560 高；搜索框激活仅放大镜 icon 变色；
 * 列表滚动到底部自动加载，每批 10 条，「没有更多了」仅在发生一次加载后出现
 * ------------------------------------------------------------------ */
const SEARCH_TIME = "2026-09-12 18:32";
const SEARCH_PAGE_SIZE = 10;
const SEARCH_TASKS = [
  "智能助手对话", "虚拟顾问交流", "自动问答记录", "过去对话摘要示例", "机器学习对话", "AI交互历史",
  "季度经营复盘", "产品需求评审", "客户访谈纪要", "数据看板搭建",
  "合同审阅记录", "周报自动生成", "竞品调研汇总", "培训材料整理", "会议待办跟进", "知识库问答",
];
const SEARCH_PROJECTS = [
  "星辰探索计划", "蓝海创新项目", "绿洲环保行动", "项目名称", "未来城市构建", "银河数据分析",
  "智慧园区升级", "供应链协同", "品牌焕新工程", "海外市场调研",
  "智能客服建设", "数据中台迁移", "年度预算编制", "安全合规审计", "用户体验优化", "移动端改版",
];

function SearchDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [tab, setTab] = useState<"任务" | "项目">("任务");
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);
  const [loadedCount, setLoadedCount] = useState(SEARCH_PAGE_SIZE);
  const [hasLoadedMore, setHasLoadedMore] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const loadingRef = useRef(false);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    const timer = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.clearTimeout(timer);
    };
  }, [open, onClose]);

  // 切换 Tab 或输入关键词时回到第一页
  useEffect(() => {
    setLoadedCount(SEARCH_PAGE_SIZE);
    setHasLoadedMore(false);
    loadingRef.current = false;
    if (listRef.current) listRef.current.scrollTop = 0;
  }, [tab, query]);

  // 一批数据落地后解锁，允许用户继续下滑加载
  useEffect(() => {
    loadingRef.current = false;
  }, [loadedCount]);

  if (!open) return null;

  const keyword = query.trim();
  const pool = tab === "任务" ? SEARCH_TASKS : SEARCH_PROJECTS;
  const filtered = keyword ? pool.filter(item => item.includes(keyword)) : pool;
  const visible = filtered.slice(0, loadedCount);
  const hasMore = loadedCount < filtered.length;
  const isEmpty = filtered.length === 0;
  // 「没有更多了」只在发生过一次加载、且数据已全部取完后出现
  const showNoMore = hasLoadedMore && !hasMore && !isEmpty;

  // 下拉滚动到列表底部时自动追加下一批，无需点击
  const handleScroll = () => {
    const el = listRef.current;
    if (!el || !hasMore || loadingRef.current) return;
    if (el.scrollHeight - el.scrollTop - el.clientHeight <= 24) {
      loadingRef.current = true;
      setLoadedCount(count => count + SEARCH_PAGE_SIZE);
      setHasLoadedMore(true);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-black/50"
      onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="搜索"
        onMouseDown={event => {
          const target = event.target as HTMLElement;
          if (!target.closest("input, button")) inputRef.current?.blur();
        }}
        className="flex h-[560px] w-[800px] max-w-[calc(100vw-32px)] flex-col gap-[8px] overflow-hidden rounded-[12px] bg-white pb-[16px] pt-[16px]"
      >
        {/* 标题 / 搜索框 / Tab —— 设计稿 Frame 1182，内容左右各内缩 16px → 768 宽 */}
        <div className="flex shrink-0 flex-col gap-[12px] px-[16px] pb-[12px]">
          <div className="flex h-[32px] items-center justify-between">
            <span className="text-[16px] leading-[24px] tracking-[0.016px] text-[rgba(0,0,0,0.88)]">搜索</span>
            <button
              type="button"
              aria-label="关闭搜索"
              onClick={onClose}
              className="flex size-[32px] cursor-pointer items-center justify-center rounded-[4px] hover:bg-[#f7f7f7]"
            >
              <img alt="" className="size-[20px]" src="/assets/search-dialog-close.svg" />
            </button>
          </div>
          {/* Search Input：激活仅放大镜 icon 由灰变蓝，圆角 / 背景 / 占位色保持不变 */}
          <div className="flex h-[32px] items-center gap-[8px] rounded-[8px] bg-[#f7f7f7] px-[8px]">
            <img
              alt=""
              className="size-[16px] shrink-0"
              src={focused ? "/assets/search-dialog-search.svg" : "/assets/search-dialog-search-default.svg"}
            />
            <input
              ref={inputRef}
              value={query}
              onChange={event => setQuery(event.target.value)}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              placeholder="搜索"
              className="h-[22px] min-w-0 flex-1 border-0 bg-transparent p-0 font-normal text-[14px] leading-[22px] tracking-[0.014px] text-[rgba(0,0,0,0.88)] outline-none placeholder:text-[rgba(0,0,0,0.4)]"
            />
            {query && (
              <button
                type="button"
                aria-label="清空搜索"
                onMouseDown={event => event.preventDefault()}
                onClick={() => { setQuery(""); inputRef.current?.focus(); }}
                className="flex size-[16px] shrink-0 cursor-pointer items-center justify-center opacity-30 hover:opacity-60"
              >
                <img alt="" className="size-[16px]" src="/assets/search-dialog-close.svg" />
              </button>
            )}
          </div>
          {/* Tab「Tag-2」Size=M：Hover=true+Selected=false (9436:38023) → #F2F2F2/r4 */}
          <div className="flex h-[32px] items-center gap-[16px]">
            {(["任务", "项目"] as const).map(item => (
              <button
                key={item}
                type="button"
                onMouseDown={event => event.preventDefault()}
                onClick={() => setTab(item)}
                className={`flex h-[32px] cursor-pointer items-center rounded-[4px] px-[8px] font-normal text-[14px] leading-[22px] tracking-[0.014px] text-[rgba(0,0,0,0.88)] ${tab === item ? "bg-[#f7f7f7]" : "bg-transparent hover:bg-[#f2f2f2]"}`}
              >
                {item}
              </button>
            ))}
          </div>
        </div>

        {isEmpty ? (
          <div className="flex min-h-0 flex-1 items-center justify-center">
            <img alt="未找到任何结果" className="size-[240px]" src="/assets/search-dialog-empty.png" />
          </div>
        ) : (
          <div ref={listRef} onScroll={handleScroll} className="min-h-0 flex-1 overflow-y-auto px-[8px]">
            <div className="flex flex-col gap-[8px]">
              {visible.map(title => (
                <div
                  key={title}
                  className="group flex h-[40px] cursor-pointer items-center justify-between rounded-[8px] px-[8px] hover:bg-[#f2f2f2]"
                >
                  <span className="min-w-0 flex-1 truncate text-[14px] leading-[22px] tracking-[0.014px] text-[rgba(0,0,0,0.88)]">{title}</span>
                  <span className="shrink-0 text-[14px] leading-[22px] tracking-[0.014px] text-[rgba(0,0,0,0.26)] group-hover:hidden">{SEARCH_TIME}</span>
                  <button
                    type="button"
                    aria-label={`更多操作：${title}`}
                    className="hidden size-[24px] shrink-0 cursor-pointer items-center justify-center rounded-[4px] group-hover:flex"
                  >
                    <img alt="" className="size-[16px]" src="/assets/search-dialog-more.svg" />
                  </button>
                </div>
              ))}
              {showNoMore && (
                <div className="flex h-[32px] items-center justify-center text-[14px] leading-[22px] tracking-[0.014px] text-[rgba(0,0,0,0.26)]">没有更多了</div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Sidebar({ history, setHistory, projects, setProjects, onClose, onNewChat, onOpenProjects, onOpenAutomation, onOpenArchive, onOpenLibrary, onNewProjectTask, projectListOpen, automationOpen, libraryOpen, activeId, activeProjectId, onSelect, onSelectProject, onSearch, onRequestDeleteProject, onRequestDeleteTask, onRequestTransfer, mobile = false }: {
  onSearch: () => void;
  mobile?: boolean;
  history: HistoryItem[];
  setHistory: React.Dispatch<React.SetStateAction<HistoryItem[]>>;
  projects: ProjectItem[];
  setProjects: React.Dispatch<React.SetStateAction<ProjectItem[]>>;
  onRequestDeleteProject?: (id: number) => void;
  // 移交项目统一先弹确认（Figma 9244:31238），由 App 层持有弹窗
  onRequestTransfer: (projectId: number, member: string) => void;
  // 删除任务（会话）统一先弹确认（Figma 459:38570），由 App 层持有弹窗
  onRequestDeleteTask: (id: number) => void;
  onClose: () => void;
  onNewChat: () => void;
  onOpenProjects: () => void;
  onOpenAutomation: () => void;
  onOpenArchive: () => void;
  onOpenLibrary: () => void;
  onNewProjectTask: (projectId: number) => void;
  projectListOpen: boolean;
  automationOpen: boolean;
  libraryOpen: boolean;
  activeId: number | null;
  activeProjectId: number | null;
  onSelect: (id: number) => void;
  onSelectProject: (id: number) => void;
}) {
  const [hoverId, setHoverId] = useState<number | null>(null);
  const [menuId, setMenuId] = useState<number | null>(null);
  const [hoverProjectId, setHoverProjectId] = useState<number | null>(null);
  const [projectMenuId, setProjectMenuId] = useState<number | null>(null);
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  // 侧栏项目菜单「编辑项目信息」：与项目卡片/项目详情共用 CreateProjectDialog 编辑态
  const [sidebarEditProjectId, setSidebarEditProjectId] = useState<number | null>(null);
  const [profileHovered, setProfileHovered] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [memoryOpen, setMemoryOpen] = useState(false);
  const [memoryEnabled, setMemoryEnabled] = useState(true);
  const [memoryPanelOpen, setMemoryPanelOpen] = useState(false);
  const [projectsExpanded, setProjectsExpanded] = useState(true);
  const [tasksExpanded, setTasksExpanded] = useState(true);
  const [expandedProjectIds, setExpandedProjectIds] = useState<Set<number>>(() => new Set());
  const [createProjectOpen, setCreateProjectOpen] = useState(false);
  const [pendingTaskMoveId, setPendingTaskMoveId] = useState<number | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const profileMenuRef = useRef<HTMLDivElement>(null);
  const profileTriggerRef = useRef<HTMLButtonElement>(null);
  const memoryRowRef = useRef<HTMLButtonElement>(null);
  const memoryPanelRef = useRef<HTMLDivElement>(null);
  const memoryPanelTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const standaloneHistory = history.filter(item => item.projectId === undefined && !item.archived);
  // 归档项目从侧栏「项目」分组移除（归档页仍可查看/取消归档），与项目列表页口径一致
  const visibleSidebarProjects = projects.filter(project => !project.archived);
  const openMemoryPanel = () => {
    if (memoryPanelTimer.current) clearTimeout(memoryPanelTimer.current);
    setMemoryPanelOpen(true);
  };
  const deferCloseMemoryPanel = () => {
    if (memoryPanelTimer.current) clearTimeout(memoryPanelTimer.current);
    memoryPanelTimer.current = setTimeout(() => setMemoryPanelOpen(false), 140);
  };

  useEffect(() => () => {
    if (memoryPanelTimer.current) clearTimeout(memoryPanelTimer.current);
  }, []);

  useEffect(() => {
    if (!profileMenuOpen) setMemoryPanelOpen(false);
  }, [profileMenuOpen]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuId(null);
        setProjectMenuId(null);
      }
      if (
        profileMenuOpen &&
        !profileMenuRef.current?.contains(e.target as Node) &&
        !memoryPanelRef.current?.contains(e.target as Node) &&
        !profileTriggerRef.current?.contains(e.target as Node)
      ) {
        setProfileMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [profileMenuOpen]);

  useEffect(() => {
    if (activeId === null) return;
    const activeTask = history.find(item => item.id === activeId);
    if (activeTask?.projectId === undefined) return;
    setExpandedProjectIds(current => {
      if (current.has(activeTask.projectId!)) return current;
      return new Set(current).add(activeTask.projectId!);
    });
  }, [activeId, history]);

  const menuTask = menuId === null ? null : history.find(item => item.id === menuId) ?? null;
  const menuProject = projectMenuId === null ? null : projects.find(item => item.id === projectMenuId) ?? null;
  const closeContextMenu = () => {
    setMenuId(null);
    setProjectMenuId(null);
  };

  return (
    <div className={`relative w-[240px] shrink-0 self-stretch border-r border-[#f2f2f2] bg-white p-0 flex flex-col items-center${mobile ? " h-full min-h-0" : ""}`}>
      {/* head —— Figma 9625:49728 Sidebar/head 240x296（新增「自动化任务」后菜单下移 40px） */}
      <div className="relative h-[296px] w-full shrink-0 bg-white">
        <div className="absolute left-[calc(50%-15.8px)] top-[52px] h-[16px] w-[160.403px] -translate-x-1/2">
          <img alt="世纪互联办公智能体" className="absolute inset-0 block size-full max-w-none" src="/assets/9d907.svg" />
        </div>
        {/* sidebar toggle (close) */}
        <button
          type="button"
          onClick={onClose}
          aria-label="收起侧边栏"
          className="absolute left-[20px] top-[12px] flex size-[24px] cursor-pointer items-start rounded-[4px] p-[4px] hover:bg-[#f7f7f7]"
        >
          <span className="relative h-full min-w-px flex-1">
            <img alt="" className="absolute inset-0 block size-full max-w-none" src={mobile ? "/assets/a8ef3.svg" : "/assets/0c886.svg"} />
          </span>
        </button>
        {/* search button */}
        <button
          type="button"
          aria-label="搜索"
          onClick={onSearch}
          className="absolute left-[52px] top-[12px] flex size-[24px] cursor-pointer items-start rounded-[4px] p-[4px] hover:bg-[#f7f7f7]"
        >
          <span className="relative h-full min-w-px flex-1">
            <img alt="" className="absolute inset-0 block size-full max-w-none" src="/assets/ed737.svg" />
          </span>
        </button>
        {/* 新任务 */}
        <button
          type="button"
          onClick={onNewChat}
          className={`absolute left-[12px] top-[84px] flex h-[40px] w-[216px] cursor-pointer items-center gap-[8px] overflow-clip rounded-[8px] py-[8px] pl-[12px] pr-[4px] transition-colors ${
            !projectListOpen && !automationOpen && !libraryOpen && activeId === null && activeProjectId === null ? "bg-[#f7f7f7]" : "hover:bg-[#f2f2f2]"
          }`}
        >
          <span className="relative size-[16px] shrink-0">
            <img alt="" className="absolute inset-0 block size-full max-w-none" src="/assets/a4798.svg" />
          </span>
          <span
            className={`min-w-px flex-1 truncate text-left font-['PingFang_SC',sans-serif] text-[14px] leading-[22px] tracking-[0.014px] text-[rgba(0,0,0,0.88)] ${
              !projectListOpen && !automationOpen && !libraryOpen && activeId === null && activeProjectId === null
                ? "font-medium"
                : "font-normal"
            }`}
          >
            新任务
          </span>
        </button>
        {/* 项目 */}
        <button
          type="button"
          onClick={onOpenProjects}
          className={`absolute left-[12px] top-[124px] flex h-[40px] w-[216px] cursor-pointer items-center gap-[8px] overflow-clip rounded-[8px] py-[8px] pl-[12px] pr-[4px] transition-colors ${
            projectListOpen ? "bg-[#f7f7f7]" : "hover:bg-[#f2f2f2]"
          }`}
        >
          <span className="relative size-[16px] shrink-0">
            <img alt="" className="absolute inset-0 block size-full max-w-none" src="/assets/6bcaa.svg" />
          </span>
          <span className={`min-w-px flex-1 truncate text-left font-['PingFang_SC',sans-serif] text-[14px] leading-[22px] tracking-[0.014px] text-[rgba(0,0,0,0.88)] ${projectListOpen ? "font-medium" : "font-normal"}`}>
            项目
          </span>
        </button>
        {/* 自动化任务 —— Figma 9625:49728 Sidebar/head：y=164，选中态 #F7F7F7/r8，图标「时间范围-线」9625:49605 */}
        <button
          type="button"
          onClick={onOpenAutomation}
          className={`absolute left-[12px] top-[164px] flex h-[40px] w-[216px] cursor-pointer items-center gap-[8px] overflow-clip rounded-[8px] py-[8px] pl-[12px] pr-[4px] transition-colors ${
            automationOpen ? "bg-[#f7f7f7]" : "hover:bg-[#f2f2f2]"
          }`}
        >
          <span className="relative size-[16px] shrink-0">
            <img alt="" className="absolute inset-0 block size-full max-w-none" src="/assets/automation-nav-clock.svg" />
          </span>
          <span className={`min-w-px flex-1 truncate text-left font-['PingFang_SC',sans-serif] text-[14px] leading-[22px] tracking-[0.014px] text-[rgba(0,0,0,0.88)] ${automationOpen ? "font-medium" : "font-normal"}`}>
            自动化任务
          </span>
        </button>
        {/* 资料库 —— Figma 9625:49728：y=204 */}
        <button
          type="button"
          onClick={onOpenLibrary}
          className={`absolute left-[12px] top-[204px] flex h-[40px] w-[216px] cursor-pointer items-center gap-[8px] overflow-clip rounded-[8px] py-[8px] pl-[12px] pr-[4px] transition-colors ${libraryOpen ? "bg-[#f7f7f7]" : "hover:bg-[#f2f2f2]"}`}
        >
          <span className="relative size-[16px] shrink-0">
            <img alt="" className="absolute inset-0 block size-full max-w-none" src="/assets/f7258.svg" />
          </span>
          <span className={`min-w-px flex-1 truncate text-left font-['PingFang_SC',sans-serif] text-[14px] leading-[22px] tracking-[0.014px] text-[rgba(0,0,0,0.88)] ${libraryOpen ? "font-medium" : "font-normal"}`}>
            资料库
          </span>
        </button>
        {/* 会议助手 —— Figma 9625:49728：y=244 */}
        <button
          type="button"
          className="absolute left-[12px] top-[244px] flex h-[40px] w-[216px] cursor-pointer items-center gap-[8px] overflow-clip rounded-[8px] py-[8px] pl-[12px] pr-[4px] transition-colors hover:bg-[#f2f2f2]"
        >
          <span className="relative size-[16px] shrink-0">
            <img alt="" className="absolute inset-0 block size-full max-w-none" src="/assets/bacdf.svg" />
          </span>
          <span className="min-w-px flex-1 truncate text-left font-['PingFang_SC',sans-serif] text-[14px] font-normal leading-[22px] tracking-[0.014px] text-[rgba(0,0,0,0.88)]">
            会议助手
          </span>
        </button>
      </div>

      {/* projects */}
      {visibleSidebarProjects.length > 0 && (
      <div className="shrink-0 w-[216px] pb-[16px] flex flex-col items-start">
        <div className="group relative m-0 flex w-full items-center p-0">
          <button
            type="button"
            aria-expanded={projectsExpanded}
            onClick={() => setProjectsExpanded(expanded => !expanded)}
            className="flex w-full cursor-pointer items-center gap-[4px] rounded-[4px] px-[12px] py-[var(--spacing)] pr-[36px] text-left hover:bg-[#f7f7f7]"
          >
            <span className="text-[14px] font-normal leading-[22px] tracking-[0.014px] text-[rgba(0,0,0,0.38)]">项目</span>
            <svg
              aria-hidden
              className={`size-[16px] shrink-0 text-[rgba(0,0,0,0.38)] transition-opacity ${projectsExpanded ? "opacity-0 group-hover:opacity-100" : "opacity-100"}`}
              viewBox="0 0 16 16"
              fill="none"
            >
              <path d={projectsExpanded ? "M4 6L8 10L12 6" : "M6 4L10 8L6 12"} stroke="currentColor" strokeWidth="1.333" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          {(!projectsExpanded || visibleSidebarProjects.length > 0) && (
            <button
              type="button"
              aria-label="新建项目"
              onClick={() => setCreateProjectOpen(true)}
              className="absolute bottom-[7px] left-[188px] right-[4px] top-[3px] flex cursor-pointer items-center justify-center rounded-[4px] hover:bg-[#f7f7f7]"
            >
              <img src="/assets/project-add.svg" alt="" className="shrink-0" />
            </button>
          )}
        </div>
        {projectsExpanded && visibleSidebarProjects.length === 0 && (
          <div className="flex w-full flex-col items-start p-[8px]">
            <button
              type="button"
              aria-label="新建项目"
              onClick={() => setCreateProjectOpen(true)}
              className="flex cursor-pointer items-center gap-[8px] rounded-[4px] px-[4px] py-[3px] hover:bg-[#f7f7f7]"
            >
              <img src="/assets/4fe43.svg" alt="" className="shrink-0" />
              <span className="whitespace-nowrap text-[14px] font-normal leading-[22px] tracking-[0.014px] text-[rgba(0,0,0,0.88)]">新建项目</span>
            </button>
          </div>
        )}
        {projectsExpanded && visibleSidebarProjects.length > 0 && (
          <div className="flex w-full flex-col items-start">
            {visibleSidebarProjects.map(project => {
              const projectTasks = history.filter(item => item.projectId === project.id && !item.archived);
              const isActiveProjectContext = activeProjectId === project.id;
              const isActiveProjectHome = isActiveProjectContext && activeId === null;
              const isProjectExpanded = expandedProjectIds.has(project.id);
              const isProjectHover = hoverProjectId === project.id;
              const hasProjectMenu = projectMenuId === project.id;
              return (
                <div key={project.id} className="w-full">
                  <div
                    role="button"
                    tabIndex={0}
                    aria-expanded={isProjectExpanded}
                    onMouseEnter={() => setHoverProjectId(project.id)}
                    onMouseLeave={() => { if (!hasProjectMenu) setHoverProjectId(null); }}
                    onClick={() => {
                      if (projectTasks.length === 0) {
                        onSelectProject(project.id);
                        return;
                      }
                      setExpandedProjectIds(current => {
                        const next = new Set(current);
                        if (next.has(project.id)) next.delete(project.id);
                        else next.add(project.id);
                        return next;
                      });
                    }}
                    onKeyDown={event => {
                      if (event.key !== "Enter" && event.key !== " ") return;
                      event.preventDefault();
                      if (projectTasks.length === 0) onSelectProject(project.id);
                      else {
                        setExpandedProjectIds(current => {
                          const next = new Set(current);
                          if (next.has(project.id)) next.delete(project.id);
                          else next.add(project.id);
                          return next;
                        });
                      }
                    }}
                    className={`flex h-[40px] w-full cursor-pointer items-center gap-[8px] overflow-hidden rounded-[8px] py-[8px] pl-[12px] pr-[4px] text-left transition-colors ${isActiveProjectHome ? "bg-[#f7f7f7]" : isProjectHover ? "bg-[#f2f2f2]" : ""}`}
                  >
                    <img src={isProjectExpanded ? "/assets/bf868.svg" : "/assets/6bcaa.svg"} alt="" className="shrink-0" />
                    <span className="min-w-0 flex-1 truncate text-[14px] font-normal leading-[22px] tracking-[0.014px] text-[rgba(0,0,0,0.88)]">
                      {project.name}
                    </span>
                    {project.pinned && !isProjectHover && !hasProjectMenu && (
                      <div className="flex size-[24px] shrink-0 items-center justify-center">
                        <svg width="12" height="13" viewBox="0 0 12 12.6667" fill="none">
                          <path d={svgSidebar.p3170f400} fill="black" fillOpacity="0.26" />
                          <path d="M0 0H12V1.33333H0V0Z" fill="black" fillOpacity="0.26" />
                        </svg>
                      </div>
                    )}
                    {(isProjectHover || hasProjectMenu) && (
                      <>
                        <button
                          type="button"
                          aria-label="项目更多操作"
                          onClick={event => {
                            event.stopPropagation();
                            if (hasProjectMenu) {
                              setProjectMenuId(null);
                              return;
                            }
                            setMenuAnchor(event.currentTarget);
                            setMenuId(null);
                            setProjectMenuId(project.id);
                            setHoverProjectId(project.id);
                          }}
                          className="flex size-[24px] shrink-0 cursor-pointer items-center justify-center rounded-[4px] hover:bg-[rgba(0,0,0,0.06)]"
                        >
                          <svg width="3" height="12" viewBox="0 0 2.66667 12" fill="none">
                            <path d={svgSidebar.p19c91c80} fill="black" fillOpacity="0.38" />
                          </svg>
                        </button>
                        <button
                          type="button"
                          aria-label={`在${project.name}中新建任务`}
                          onClick={event => {
                            event.stopPropagation();
                            setProjectMenuId(null);
                            onNewProjectTask(project.id);
                          }}
                          className="flex size-[24px] shrink-0 cursor-pointer items-center justify-center rounded-[4px] hover:bg-[rgba(0,0,0,0.06)]"
                        >
                          <img src="/assets/49891.svg" alt="" />
                        </button>
                      </>
                    )}
                  </div>
                  {isProjectExpanded && projectTasks.map(task => {
                    const isTaskActive = activeId === task.id;
                    const isTaskHover = hoverId === task.id;
                    const hasTaskMenu = menuId === task.id;
                    return (
                      <div
                        key={task.id}
                        role="button"
                        tabIndex={0}
                        onMouseEnter={() => setHoverId(task.id)}
                        onMouseLeave={() => { if (!hasTaskMenu) setHoverId(null); }}
                        onClick={() => { onSelect(task.id); setMenuId(null); }}
                        onKeyDown={event => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            onSelect(task.id);
                            setMenuId(null);
                          }
                        }}
                        className={`flex h-[40px] w-full cursor-pointer items-center gap-[4px] overflow-hidden rounded-[8px] py-[8px] pl-[36px] pr-[4px] text-left transition-colors ${isTaskActive ? "bg-[#f7f7f7]" : isTaskHover ? "bg-[#f2f2f2]" : ""}`}
                      >
                        <span className={`min-w-0 flex-1 truncate text-[14px] leading-[22px] tracking-[0.014px] text-[rgba(0,0,0,0.88)] ${isTaskActive ? "font-medium" : "font-normal"}`}>
                          {task.title}
                        </span>
                        {task.pinned && !isTaskHover && !hasTaskMenu && (
                          <div className="flex size-[24px] shrink-0 items-center justify-center">
                            <svg width="12" height="13" viewBox="0 0 12 12.6667" fill="none">
                              <path d={svgSidebar.p3170f400} fill="black" fillOpacity="0.26" />
                              <path d="M0 0H12V1.33333H0V0Z" fill="black" fillOpacity="0.26" />
                            </svg>
                          </div>
                        )}
                        {(isTaskHover || hasTaskMenu) && (
                          <button
                            type="button"
                            aria-label="任务更多操作"
                            onClick={event => {
                              event.stopPropagation();
                              if (hasTaskMenu) {
                                setMenuId(null);
                                return;
                              }
                              setMenuAnchor(event.currentTarget);
                              setProjectMenuId(null);
                              setMenuId(task.id);
                              setHoverId(task.id);
                            }}
                            className="flex size-[24px] shrink-0 cursor-pointer items-center justify-center rounded-[4px] hover:bg-[rgba(0,0,0,0.06)]"
                          >
                            <svg width="3" height="12" viewBox="0 0 2.66667 12" fill="none">
                              <path d={svgSidebar.p19c91c80} fill="black" fillOpacity="0.38" />
                            </svg>
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        )}
      </div>
      )}

      {/* tasks */}
      {standaloneHistory.length > 0 && (
      <div className="flex min-h-0 w-[216px] flex-1 flex-col items-start">
        <div className="group relative flex w-full shrink-0 items-center p-0">
          <button
            type="button"
            aria-expanded={tasksExpanded}
            onClick={() => setTasksExpanded(expanded => !expanded)}
            className="flex w-full cursor-pointer items-center gap-[4px] rounded-[4px] px-[12px] py-[var(--spacing)] text-left hover:bg-[#f7f7f7]"
          >
            <span className="text-[14px] font-normal leading-[22px] tracking-[0.014px] text-[rgba(0,0,0,0.38)]">任务</span>
            <svg
              aria-hidden
              className={`size-[16px] shrink-0 text-[rgba(0,0,0,0.38)] transition-opacity ${tasksExpanded ? "opacity-0 group-hover:opacity-100" : "opacity-100"}`}
              viewBox="0 0 16 16"
              fill="none"
            >
              <path d={tasksExpanded ? "M4 6L8 10L12 6" : "M6 4L10 8L6 12"} stroke="currentColor" strokeWidth="1.333" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>

        {tasksExpanded && <div className="flex min-h-0 w-full flex-1 flex-col overflow-y-auto">
          {standaloneHistory.length === 0 ? (
            <p className="p-[12px] font-['PingFang_SC:Regular'] text-[14px] font-normal leading-[22px] tracking-[0.014px] text-[rgba(0,0,0,0.26)]">暂无任务</p>
          ) : standaloneHistory.map(item => {
              const isActive = activeId === item.id;
              const isHover = hoverId === item.id;
              const hasMenu = menuId === item.id;
              return (
                <div key={item.id} className="relative">
                  <div
                    role="button"
                    tabIndex={0}
                    onMouseEnter={() => setHoverId(item.id)}
                    onMouseLeave={() => { if (menuId !== item.id) setHoverId(null); }}
                    onClick={() => { onSelect(item.id); setMenuId(null); }}
                    onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { onSelect(item.id); setMenuId(null); } }}
                    className={`w-full h-[40px] rounded-[8px] flex items-center pl-[12px] pr-[4px] py-[8px] text-left transition-colors cursor-pointer
                      ${isActive ? "bg-[#f7f7f7]" : isHover ? "bg-[#f2f2f2]" : ""}`}
                  >
                    <p className={`flex-1 min-w-0 text-[14px] leading-[22px] tracking-[0.014px] truncate ${isActive ? "font-medium" : ""} text-[rgba(0,0,0,0.88)]`}>{item.title}</p>
                    {item.pinned && !isHover && !hasMenu && (
                      <div className="shrink-0 w-[24px] h-[24px] flex items-center justify-center">
                        <svg width="12" height="13" viewBox="0 0 12 12.6667" fill="none">
                          <path d={svgSidebar.p3170f400} fill="black" fillOpacity="0.26" />
                          <path d="M0 0H12V1.33333H0V0Z" fill="black" fillOpacity="0.26" />
                        </svg>
                      </div>
                    )}
                    {(isHover || hasMenu) && (
                      <button
                        onClick={e => {
                          e.stopPropagation();
                          if (hasMenu) { setMenuId(null); return; }
                          setMenuAnchor(e.currentTarget);
                          setProjectMenuId(null);
                          setMenuId(item.id);
                          setHoverId(item.id);
                        }}
                        className="shrink-0 w-[24px] h-[24px] flex items-center justify-center rounded-[4px] hover:bg-[rgba(0,0,0,0.06)] cursor-pointer"
                      >
                        <svg width="3" height="12" viewBox="0 0 2.66667 12" fill="none">
                          <path d={svgSidebar.p19c91c80} fill="black" fillOpacity="0.38" />
                        </svg>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
        </div>}
      </div>
      )}
      {standaloneHistory.length === 0 && <div className="flex-1" />}

      {/* context menu — fixed to escape overflow clip */}
      {/* 侧栏项目菜单与项目页卡片菜单共用 ProjectActionsMenu，操作项保持一致（编辑项目信息/移交项目/归档/删除） */}
      {menuProject && menuAnchor && (
        <ProjectActionsMenu
          project={menuProject}
          anchor={menuAnchor}
          innerRef={menuRef}
          onClose={closeContextMenu}
          onEdit={() => { setSidebarEditProjectId(menuProject.id); closeContextMenu(); }}
          onTransfer={member => onRequestTransfer(menuProject.id, member)}
          onArchive={() => {
            const projectId = menuProject.id;
            setProjects(items => items.map(item => item.id === projectId ? { ...item, archived: true } : item));
            setHistory(items => items.map(item => item.projectId === projectId ? { ...item, archived: true } : item));
            showArchiveToast(() => {
              setProjects(items => items.map(item => item.id === projectId ? { ...item, archived: false } : item));
              setHistory(items => items.map(item => item.projectId === projectId ? { ...item, archived: false } : item));
            });
            onOpenProjects();
          }}
          onDelete={() => {
            // 统一走确认弹窗：由 App 层弹「确定要删除此项目吗？」再执行删除
            if (onRequestDeleteProject) {
              onRequestDeleteProject(menuProject.id);
              return;
            }
            setProjects(items => items.filter(item => item.id !== menuProject.id));
            setHistory(items => items.filter(item => item.projectId !== menuProject.id));
          }}
        />
      )}

      {/* 侧栏「编辑项目信息」弹窗：编辑态预填当前项目，保存后 toast 反馈 */}
      <CreateProjectDialog
        open={sidebarEditProjectId !== null}
        onOpenChange={open => { if (!open) setSidebarEditProjectId(null); }}
        onCreate={() => {}}
        editProject={sidebarEditProjectId === null ? null : projects.find(item => item.id === sidebarEditProjectId) ?? null}
        onEdit={updates => {
          setProjects(items => items.map(item => item.id === sidebarEditProjectId ? { ...item, name: updates.name, description: updates.description } : item));
          toast.success("项目信息已更新");
        }}
      />

      {menuTask && (
        <TaskOperationsMenu
          ref={menuRef}
          anchor={menuAnchor}
          task={menuTask}
          projects={projects}
          onTogglePin={() => setHistory(items => items.map(item => item.id === menuTask.id ? { ...item, pinned: !item.pinned } : item))}
          onRename={title => setHistory(items => items.map(item => item.id === menuTask.id ? { ...item, title } : item))}
          onMove={projectId => {
            setHistory(items => items.map(item => item.id === menuTask.id ? { ...item, projectId } : item));
            if (projectId !== undefined) setExpandedProjectIds(current => new Set(current).add(projectId));
          }}
          onCreateProject={() => {
            setPendingTaskMoveId(menuTask.id);
            setCreateProjectOpen(true);
          }}
          onArchive={() => {
            setHistory(items => items.map(item => item.id === menuTask.id ? { ...item, archived: true } : item));
            showArchiveToast(() => setHistory(items => items.map(item => item.id === menuTask.id ? { ...item, archived: false } : item)));
          }}
          onDelete={() => onRequestDeleteTask(menuTask.id)}
          onClose={closeContextMenu}
        />
      )}

      {profileMenuOpen && (
        <OperationMenu anchor={profileTriggerRef.current}
          ref={profileMenuRef}
          role="menu"
          aria-label="用户菜单"
          className="w-[192px] overflow-hidden rounded-[12px] border border-[#f2f2f2] bg-white px-[8px] py-[4px] shadow-[0_0_12px_rgba(0,0,0,0.08)]"
        >
          <div className="flex w-full flex-col py-[4px]">
            <button
              type="button"
              role="menuitem"
              onClick={() => setProfileMenuOpen(false)}
              className="flex h-[44px] w-full cursor-pointer items-center gap-[8px] rounded-[8px] px-[8px] text-left text-[14px] font-normal leading-[22px] tracking-[0.014px] hover:bg-[#f7f7f7]"
            >
              <img src="/assets/d0cd0.svg" alt="" className="size-[16px] shrink-0" />
              <span className="flex min-w-0 flex-1 items-center gap-[4px]">
                <span className="whitespace-nowrap font-['PingFang_SC:Regular'] font-normal text-[14px] leading-[22px] tracking-[0.014px] text-[rgba(0,0,0,0.88)]">剩余用量</span>
                <span className="font-['TCloudNumber:Regular'] font-normal text-[14px] leading-[22px] text-[rgba(0,0,0,0.88)]">90%</span>
              </span>
              <img src="/assets/c29c9.svg" alt="" className="size-[16px] shrink-0" />
            </button>
            <button
              ref={memoryRowRef}
              type="button"
              role="menuitem"
              aria-haspopup="dialog"
              aria-expanded={memoryPanelOpen}
              onMouseEnter={openMemoryPanel}
              onMouseLeave={deferCloseMemoryPanel}
              onFocus={openMemoryPanel}
              onClick={openMemoryPanel}
              className={`flex h-[44px] w-full cursor-pointer items-center gap-[8px] rounded-[8px] px-[8px] text-left text-[14px] font-normal leading-[22px] tracking-[0.014px] ${memoryPanelOpen ? "bg-[#f2f2f2]" : "hover:bg-[#f2f2f2]"}`}
            >
              <img src="/assets/7ba18.svg" alt="" className="size-[16px] shrink-0" />
              <span className="min-w-0 flex-1 whitespace-nowrap font-['PingFang_SC:Regular'] font-normal text-[14px] leading-[22px] tracking-[0.014px] text-[rgba(0,0,0,0.88)]">记忆</span>
              <span className="flex shrink-0 items-center gap-[4px]">
                <span className="whitespace-nowrap font-['PingFang_SC:Regular'] font-normal text-[12px] leading-[20px] tracking-[0.012px] text-[rgba(0,0,0,0.6)]">{memoryEnabled ? "已开启" : "已关闭"}</span>
                <img src="/assets/c29c9.svg" alt="" className="size-[16px] shrink-0" />
              </span>
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => { setProfileMenuOpen(false); onOpenArchive(); }}
              className="flex h-[44px] w-full cursor-pointer items-center gap-[8px] rounded-[8px] px-[8px] text-left text-[14px] font-normal leading-[22px] tracking-[0.014px] hover:bg-[#f7f7f7]"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="shrink-0" aria-hidden>
                {/* 图形本体的可视范围是 13.333×12（x 0~13.333，y 2~14），
                    平移必须让它落在 1.333~14.667 / 2~14 —— 与其它 16×16 图标同外框居中，
                    否则会整体偏下 2px、贴到框底，看起来就是歪的。 */}
                <path d="M13.333 13.333V4.667L12 2H1.333L0 4.669V13.333C0 13.702.298 14 .667 14H12.667C13.035 14 13.333 13.702 13.333 13.333ZM1.333 6H12V12.667H1.333V6ZM2.157 3.333H11.176L11.843 4.667H1.491L2.157 3.333ZM8.667 7.333H4.667V8.667H8.667V7.333Z" transform="translate(1.333 0)" fill="black" fillOpacity="0.26" />
              </svg>
              <span className="whitespace-nowrap font-['PingFang_SC:Regular'] font-normal text-[14px] leading-[22px] tracking-[0.014px] text-[rgba(0,0,0,0.88)]">归档数据</span>
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => setProfileMenuOpen(false)}
              className="flex h-[44px] w-full cursor-pointer items-center gap-[8px] rounded-[8px] px-[8px] text-left text-[14px] font-normal leading-[22px] tracking-[0.014px] hover:bg-[#f7f7f7]"
            >
              <img src="/assets/89936.svg" alt="" className="size-[16px] shrink-0" />
              <span className="whitespace-nowrap font-['PingFang_SC:Regular'] font-normal text-[14px] leading-[22px] tracking-[0.014px] text-[rgba(0,0,0,0.88)]">问题反馈</span>
            </button>
            <div className="mx-[8px] h-px bg-[#f2f2f2]" />
            <button
              type="button"
              role="menuitem"
              onClick={() => setProfileMenuOpen(false)}
              className="flex h-[44px] w-full cursor-pointer items-center gap-[8px] rounded-[8px] px-[8px] text-left text-[14px] font-normal leading-[22px] tracking-[0.014px] hover:bg-[#f7f7f7]"
            >
              <img src="/assets/9a53a.svg" alt="" className="size-[16px] shrink-0" />
              <span className="whitespace-nowrap font-['PingFang_SC:Regular'] font-normal text-[14px] leading-[22px] tracking-[0.014px] text-[rgba(0,0,0,0.88)]">退出登录</span>
            </button>
          </div>
        </OperationMenu>
      )}
      {profileMenuOpen && memoryPanelOpen && (
        <OperationMenu
          ref={memoryPanelRef}
          submenu
          anchor={memoryRowRef.current}
          role="dialog"
          aria-label="记忆"
          onMouseEnter={openMemoryPanel}
          onMouseLeave={deferCloseMemoryPanel}
          className="w-[192px] rounded-[12px] bg-white p-[16px] shadow-[0_0_12px_rgba(0,0,0,0.08)]"
        >
          <div className="flex h-[24px] items-center justify-between">
            <img src="/assets/7ba18.svg" alt="" className="size-[24px] shrink-0" />
            <button
              type="button"
              role="switch"
              aria-checked={memoryEnabled}
              aria-label="允许记忆"
              onClick={() => setMemoryEnabled(value => !value)}
              className="flex h-[20px] w-[40px] shrink-0 cursor-pointer items-center"
            >
              <img src={memoryEnabled ? "/assets/07533.svg" : "/assets/29026.svg"} alt="" className="h-[20px] w-[40px]" />
            </button>
          </div>
          <div className="mt-[12px] w-[160px]">
            <p className="font-['PingFang_SC:Medium'] text-[16px] font-semibold leading-[24px] tracking-[0.016px] text-[rgba(0,0,0,0.88)]">允许记忆</p>
            <p className="mt-[4px] font-['PingFang_SC:Regular'] text-[14px] font-normal leading-[22px] tracking-[0.014px] text-[rgba(0,0,0,0.6)]">
              允许 AI从对话中提取并记住相关上下文，以便在未来对话中提供更连贯、个性化的回应。
            </p>
          </div>
        </OperationMenu>
      )}

      {/* bottom — user info */}
      <div className="shrink-0 flex w-full items-center px-[12px] py-[8px] bg-white">
        <button
          ref={profileTriggerRef}
          type="button"
          aria-haspopup="menu"
          aria-expanded={profileMenuOpen}
          onMouseEnter={() => setProfileHovered(true)}
          onMouseLeave={() => setProfileHovered(false)}
          onClick={() => {
            setMenuId(null);
            setProjectMenuId(null);
            setProfileMenuOpen(open => !open);
          }}
          className="flex h-[32px] flex-1 min-w-0 cursor-pointer items-center gap-[8px] rounded-[8px] px-[12px] py-[4px] text-left"
        >
          <div className="relative shrink-0 w-[24px] h-[24px] rounded-full bg-[#dcdcdc] border border-white overflow-hidden">
            <div className="absolute inset-0 flex items-center justify-center">
              <img src="/assets/a2c1b.svg" alt="" />
            </div>
          </div>
          <span className="min-w-0 w-fit grow-0 basis-auto truncate whitespace-nowrap text-[14px] font-normal leading-[22px] tracking-[0.014px] text-[rgba(0,0,0,0.88)]">张三李四王麻子</span>
          {(profileHovered || profileMenuOpen) && (
            <img src="/assets/05ead.svg" alt="" className="shrink-0" />
          )}
        </button>
      </div>
      <CreateProjectDialog
        open={createProjectOpen}
        onOpenChange={open => {
          setCreateProjectOpen(open);
          if (!open) setPendingTaskMoveId(null);
        }}
        onCreate={project => {
          const id = Date.now();
          setProjects(current => [...current, { ...project, id }]);
          setProjectsExpanded(true);
          if (pendingTaskMoveId !== null) {
            setHistory(items => items.map(item => item.id === pendingTaskMoveId ? { ...item, projectId: id } : item));
            setExpandedProjectIds(current => new Set(current).add(id));
            setPendingTaskMoveId(null);
          } else {
            onSelectProject(id);
          }
        }}
      />
      {memoryOpen && <MemoryModal onClose={() => setMemoryOpen(false)} />}
    </div>
  );
}

// ── chat input ────────────────────────────────────────────────────────────────

function PptGenerationToggle({ selected, onChange, borderless = false }: { selected: boolean; onChange: (selected: boolean) => void; borderless?: boolean }) {
  const [hovered, setHovered] = useState(false);
  const showClose = selected && hovered;

  return (
    <button
      type="button"
      aria-pressed={selected}
      aria-label={selected ? "取消 PPT 生成" : "启用 PPT 生成"}
      onClick={() => onChange(!selected)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={`shrink-0 box-border flex items-center gap-[4px] rounded-full px-[8px] py-[4px] cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-[#1e63f5] focus-visible:ring-offset-2 ${borderless ? "border-0" : "border"} ${
        selected
          ? `${borderless ? "" : "border-transparent"} bg-[#ebf4ff] text-[#1e63f5]`
          : `${borderless ? "" : "border-[#f2f2f2]"} text-[rgba(0,0,0,0.88)] hover:bg-[#f2f2f2]`
      }`}
    >
      <span className="relative size-[16px] shrink-0 overflow-hidden" aria-hidden>
        {showClose ? (
          <svg className="absolute inset-[8.33%]" fill="none" viewBox="0 0 13.3333 13.3333" preserveAspectRatio="none">
            <path d={svgPptToggle.p2186600} fill="#1E63F5" />
          </svg>
        ) : !selected ? (
          <img src="/assets/786f5.svg" alt="" className="absolute inset-0" />
        ) : (
          <svg className="absolute left-[2px] top-[1px] h-[13.333px] w-[12px]" fill="none" viewBox="0 0 12 13.3333" preserveAspectRatio="none">
            <path d={svgPaths.p10161080} fill={selected ? "#1E63F5" : "black"} fillOpacity={selected ? "1" : "0.88"} />
          </svg>
        )}
      </span>
      <span className="whitespace-nowrap text-[14px] leading-[22px] tracking-[0.014px] font-normal">PPT生成</span>
    </button>
  );
}

type PptSettingPickerProps =
  | { kind: "mode"; value: PptMode; onChange: (value: PptMode) => void; footer?: boolean }
  | { kind: "pages"; value: PptPageCount; onChange: (value: PptPageCount) => void; footer?: false };

function PptSettingPicker(props: PptSettingPickerProps) {
  const [open, setOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);
  const isMode = props.kind === "mode";
  const options = isMode
    ? [
        { value: "标准" as const, description: "快速；适合常规汇报" },
        { value: "PowerPoint" as const, description: "PowerPoint原生文件" },
      ]
    : [
        { value: "智能匹配" as const },
        { value: "5～8页" as const },
        { value: "8～12页" as const },
        { value: "12～18页" as const },
      ];

  useEffect(() => {
    if (!open) return;
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (!pickerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", closeOnOutsideClick);
    return () => document.removeEventListener("mousedown", closeOnOutsideClick);
  }, [open]);

  return (
    <div ref={pickerRef} className="relative shrink-0">
      {open && (
        <OperationMenu anchor={pickerRef.current?.querySelector(":scope > button") ?? null} className={`overflow-hidden rounded-[12px] border border-[#f2f2f2] bg-white px-[8px] py-[4px] shadow-[0_0_12px_rgba(0,0,0,0.08)] ${isMode ? "w-[232px]" : "w-[192px]"}`}>
          <div className="flex max-h-[480px] w-full flex-col overflow-y-auto py-[4px]">
            {!isMode && (
              <p className="px-[8px] text-[12px] font-normal leading-[20px] tracking-[0.012px] text-[rgba(0,0,0,0.38)]">
                生成的PPT页面数量
              </p>
            )}
            {options.map((option, index) => {
              const selected = props.value === option.value;
              return (
                <div key={option.value}>
                  {!isMode && index === 1 && <div className="h-px w-full bg-[#f2f2f2]" />}
                  <button
                    type="button"
                    onClick={() => {
                      if (props.kind === "mode") props.onChange(option.value as PptMode);
                      else props.onChange(option.value as PptPageCount);
                      setOpen(false);
                    }}
                    className="relative flex w-full cursor-pointer items-center justify-between rounded-[8px] p-[8px] text-left hover:bg-[#f7f7f7]"
                  >
                    <span className="min-w-0 flex-1">
                      <span className={`block truncate text-[14px] leading-[22px] tracking-[0.014px] text-[rgba(0,0,0,0.88)] ${selected ? "font-medium" : "font-normal"}`}>
                        {option.value}
                      </span>
                      {"description" in option && (
                        <span className="block truncate text-[12px] font-normal leading-[20px] tracking-[0.012px] text-[rgba(0,0,0,0.38)]">
                          {option.description}
                        </span>
                      )}
                    </span>
                    {selected && <img src="/assets/9e503.svg" alt="" className="shrink-0" />}
                  </button>
                </div>
              );
            })}
          </div>
        </OperationMenu>
      )}
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(value => !value)}
        className={`flex cursor-pointer items-center gap-[4px] rounded-full ${props.footer ? "px-[4px] py-[3px]" : "border border-[#f2f2f2] px-[8px] py-[4px] hover:bg-[#f7f7f7]"}`}
      >
        <img src={props.footer ? "/assets/985b1.svg" : isMode ? "/assets/a80d5.svg" : "/assets/b3301.svg"} alt="" className="shrink-0" />
        <span className="whitespace-nowrap text-[14px] font-normal leading-[22px] tracking-[0.014px] text-[rgba(0,0,0,0.88)]">
          {props.value}
        </span>
        {props.footer && <img src="/assets/27bf2.svg" alt="" className="shrink-0" />}
      </button>
    </div>
  );
}

function SendButton({ canSend, agentRunning = false, onSend, onStop }: {
  canSend: boolean;
  agentRunning?: boolean;
  onSend: () => void;
  onStop?: () => void;
}) {
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (agentRunning) setLoading(false);
  }, [agentRunning]);

  const handleClick = () => {
    if (agentRunning) {
      onStop?.();
      return;
    }
    if (!canSend || loading) return;
    setLoading(true);
    onSend();
    window.setTimeout(() => setLoading(false), 560);
  };

  return (
    <button
      type="button"
      aria-label={agentRunning ? "暂停生成" : "发送消息"}
      aria-disabled={!agentRunning && !canSend}
      disabled={!agentRunning && !canSend}
      onClick={handleClick}
      className={`group ml-auto shrink-0 rounded-full border-0 bg-transparent p-0 outline-none focus-visible:ring-2 focus-visible:ring-[#1e63f5] focus-visible:ring-offset-2 ${agentRunning || canSend ? "cursor-pointer" : "cursor-default"}`}
    >
      {agentRunning ? (
        <div className="flex size-[30px] items-center justify-center rounded-full bg-[#ebf4ff] group-active:bg-[#99c3ff]">
          <span className="block size-[12px] rounded-[2px] bg-[#1e63f5]" />
        </div>
      ) : loading ? (
        <div className="flex size-[30px] items-center justify-center rounded-full bg-[#1e63f5]">
          <span className="block size-[10px] animate-spin rounded-full border-2 border-white border-t-transparent" />
        </div>
      ) : (
        <div className={`flex size-[30px] items-center justify-center overflow-hidden rounded-full ${canSend ? "bg-[#1e63f5] group-hover:bg-[#4788ff] group-active:bg-[#0e45cf]" : "bg-[#f2f2f2]"}`}>
          <img src={canSend ? "/assets/051ee.svg" : "/assets/9b290.svg"} alt="" />
        </div>
      )}
    </button>
  );
}

function ChatInput({ value, onChange, onSend, attachments, onAddFiles, onRemoveAttachment, hasProject = false, projectFiles, pptGeneration, onPptGenerationChange, pptMode, onPptModeChange, pptPages, onPptPagesChange, agentRunning = false, onStop, placeholder = "有问题，尽管问；/调用技能" }: {
  value: string;
  onChange: (v: string) => void;
  onSend: (text?: string, attachments?: ChatAttachment[]) => void;
  attachments: ChatAttachment[];
  onAddFiles: (files: File[]) => void;
  onRemoveAttachment: (id: string) => void;
  hasProject?: boolean;
  projectFiles?: ProjectFiles;
  pptGeneration: boolean;
  onPptGenerationChange: (selected: boolean) => void;
  pptMode: PptMode;
  onPptModeChange: (mode: PptMode) => void;
  pptPages: PptPageCount;
  onPptPagesChange: (pages: PptPageCount) => void;
  agentRunning?: boolean;
  onStop?: () => void;
  placeholder?: string;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const [attachmentSource, setAttachmentSource] = useState<AttachmentSource | null>(null);
  // 输入框最大高度跟随窗口高度收缩：矮窗口（如约 400px 高的预览面板）里，
  // 固定 328px 会把底部工具栏和发送按钮顶到窗口外
  const [cardMaxHeight, setCardMaxHeight] = useState(() => Math.min(328, Math.max(200, window.innerHeight - 220)));
  const hasText = value.trim().length > 0;
  // 必须输入文字才可发送；仅有附件（无文字）时禁用发送按钮
  const canSend = hasText && attachments.every(attachment => attachment.status === "ready");

  useEffect(() => {
    if (!hasProject && attachmentSource === "项目资料") setAttachmentSource(null);
  }, [hasProject, attachmentSource]);

  useEffect(() => {
    // 输入区始终贴在会话/首页底部，卡片下边界位置稳定：以它向上量出可用高度，
    // 卡片再高也不会把底部工具栏顶出窗口（矮至 400px 的预览面板同样成立）
    const syncCardMax = () => {
      const card = cardRef.current;
      const bottom = card ? card.getBoundingClientRect().bottom : window.innerHeight - 22;
      setCardMaxHeight(Math.max(200, Math.min(328, bottom - 96)));
    };
    syncCardMax();
    window.addEventListener("resize", syncCardMax);
    return () => window.removeEventListener("resize", syncCardMax);
  }, []);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    const resize = () => {
      // 用实际布局量出输入框上方已占用的高度（上内边距 + 附件行），再减去下方
      // 「36 占位 + 12 内容下内边距 + 工具栏 + 2 边框」，避免固定数值在附件多/矮窗口时失准
      const card = cardRef.current;
      const topOffset = card ? el.getBoundingClientRect().top - card.getBoundingClientRect().top : 12;
      const reserved = 36 + 12 + (toolbarRef.current?.offsetHeight ?? 38) + 2;
      const maxHeight = Math.max(22, Math.min(228, cardMaxHeight - topOffset - reserved));
      el.style.height = "auto";
      el.style.maxHeight = maxHeight + "px";
      el.style.height = Math.min(el.scrollHeight, maxHeight) + "px";
    };
    resize();
    let width = el.clientWidth;
    const observer = new ResizeObserver(() => {
      if (el.clientWidth !== width) {
        width = el.clientWidth;
        resize();
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [value, attachments.length, cardMaxHeight]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (canSend) onSend(value, attachments);
    }
  };

  return (
    <Popover open={attachmentSource !== null} onOpenChange={open => {
      if (!open) setAttachmentSource(null);
    }}>
    <PopoverAnchor asChild>
    <div ref={cardRef} className="relative flex w-full flex-col overflow-hidden rounded-[20px] border border-[#e6e6e6] bg-white shadow-none" style={{ maxHeight: cardMaxHeight }}>
      <div className="flex min-h-0 flex-1 flex-col px-[12px] pt-[12px] pb-[12px]" onPointerDown={() => textareaRef.current?.focus()}>
        <AttachmentTray attachments={attachments} onRemove={onRemoveAttachment} />
        <textarea ref={textareaRef} value={value} onChange={e => onChange(e.target.value)} onKeyDown={handleKeyDown}
          onPaste={event => {
            const files = Array.from(event.clipboardData.items)
              .filter(item => item.kind === "file")
              .map(item => item.getAsFile())
              .filter((file): file is File => file !== null);
            if (files.length) onAddFiles(files);
          }}
          placeholder={placeholder} rows={1} style={{ minHeight: 22, maxHeight: 228 }}
          className="relative z-10 block w-[calc(100%+12px)] min-h-[22px] shrink resize-none overflow-y-auto bg-transparent pr-[12px] text-[14px] font-normal leading-[22px] text-[rgba(0,0,0,0.88)] tracking-[0.014px] placeholder:text-[rgba(0,0,0,0.26)] outline-none"
        />
        <div className="h-[36px] shrink-0" />
      </div>
      <div ref={toolbarRef} className="flex shrink-0 items-center gap-[32px] px-[8px] pb-[8px] pr-[46px]">
        <div className="relative flex min-w-0 items-center gap-[8px]">
        <AddContentMenu
          hasProject={hasProject}
          onAddFiles={onAddFiles}
          onSelectSource={setAttachmentSource}
          onOpenChange={open => { if (open) setAttachmentSource(null); }}
        />
        <div className="shrink-0">
          <PptGenerationToggle selected={pptGeneration} onChange={onPptGenerationChange} borderless />
        </div>
        </div>
      </div>
      {/* 发送按钮绝对定位在输入框右下角内侧：工具栏再挤也不会把按钮挤到边框外 */}
      <div className="absolute bottom-[8px] right-[8px]">
        <SendButton
          canSend={canSend}
          agentRunning={agentRunning}
          onSend={() => onSend(value, attachments)}
          onStop={onStop}
        />
      </div>
    </div>
    </PopoverAnchor>
    {attachmentSource && (
      <AttachmentPicker
        source={attachmentSource}
        hasProject={hasProject}
        projectFiles={projectFiles}
        onSourceChange={setAttachmentSource}
        attachments={attachments}
        onAddFiles={onAddFiles}
        onRemove={onRemoveAttachment}
        onClose={() => textareaRef.current?.focus()}
      />
    )}
    </Popover>
  );
}

function HomeProjectPicker({ projects, selectedProjectId, onSelectProject, onCreateProject }: {
  projects: ProjectItem[];
  selectedProjectId: number | null;
  onSelectProject: (id: number | null) => void;
  onCreateProject: (project: Omit<ProjectItem, "id">) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [createProjectOpen, setCreateProjectOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);
  const selectedProject = projects.find(project => project.id === selectedProjectId) ?? null;

  useEffect(() => {
    if (!menuOpen) return;
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (!pickerRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", closeOnOutsideClick);
    return () => document.removeEventListener("mousedown", closeOnOutsideClick);
  }, [menuOpen]);

  return (
    <>
      <div ref={pickerRef} className="relative w-full px-[16px]">
        {menuOpen && (
          <OperationMenu role="menu" gap={4} anchor={pickerRef.current?.querySelector("button") ?? null} className="flex w-[232px] flex-col overflow-y-auto rounded-[12px] border border-[#f2f2f2] bg-white px-[8px] py-[4px] shadow-[0_0_12px_rgba(0,0,0,0.08)]">
            <div className="flex max-h-[470px] w-full shrink-0 flex-col overflow-x-hidden overflow-y-auto py-[4px]">
              {projects.length === 0 && (
                <div className="shrink-0 rounded-[8px] px-[8px] py-[11px] text-[14px] font-normal leading-[22px] tracking-[0.014px] text-[rgba(0,0,0,0.38)]">
                  暂无项目
                </div>
              )}
              {projects.map(project => {
                const isSelected = selectedProjectId === project.id;
                return (
                  <button
                    key={project.id}
                    type="button"
                    role="menuitemradio"
                    aria-checked={isSelected}
                    onClick={() => {
                      onSelectProject(project.id);
                      setMenuOpen(false);
                    }}
                    className="flex w-full shrink-0 cursor-pointer items-center gap-[8px] rounded-[8px] px-[8px] py-[11px] text-left hover:bg-[#f7f7f7]"
                  >
                    <img src="/assets/d95df.svg" alt="" className="shrink-0" />
                    <span className={`min-w-0 flex-1 truncate text-[14px] leading-[22px] tracking-[0.014px] text-[rgba(0,0,0,0.88)] ${isSelected ? "font-medium" : "font-normal"}`}>
                      {project.name}
                    </span>
                    {isSelected && <img src="/assets/ecd73.svg" alt="" className="shrink-0" />}
                  </button>
                );
              })}
              <div className="relative h-0 w-full shrink-0">
                <img src="/assets/4b9c6.svg" alt="" className="absolute left-0 top-[-0.5px] max-w-none" />
              </div>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  setCreateProjectOpen(true);
                }}
                className="flex w-full shrink-0 cursor-pointer items-center gap-[8px] rounded-[8px] px-[8px] py-[11px] text-left hover:bg-[#f7f7f7]"
              >
                <img src="/assets/eede2.svg" alt="" className="shrink-0" />
                <span className="text-[14px] font-normal leading-[22px] tracking-[0.014px] text-[rgba(0,0,0,0.88)]">新建项目</span>
              </button>
              {selectedProject && <button
                type="button"
                role="menuitem"
                onClick={() => {
                  onSelectProject(null);
                  setMenuOpen(false);
                }}
                className="flex w-full shrink-0 cursor-pointer items-center gap-[8px] rounded-[8px] px-[8px] py-[11px] text-left hover:bg-[#f7f7f7]"
              >
                <img src="/assets/92b7f.svg" alt="" className="shrink-0" />
                <span className="text-[14px] font-normal leading-[22px] tracking-[0.014px] text-[rgba(0,0,0,0.88)]">不选择项目</span>
              </button>}
            </div>
          </OperationMenu>
        )}
        <div className="flex h-[40px] w-full items-center overflow-hidden rounded-t-[16px] bg-[#f7f7f7] py-[4px] pl-[8px] pr-[4px]">
          <button
            type="button"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen(open => !open)}
            className={`flex min-w-0 cursor-pointer items-center gap-[8px] rounded-full px-[8px] py-[4px] transition-colors ${menuOpen ? "bg-[#e6e6e6]" : "hover:bg-[#e6e6e6]"}`}
          >
            <img src={selectedProject ? "/assets/6bcaa.svg" : "/assets/658f1.svg"} alt="" className="shrink-0" />
            <span className={`truncate font-['PingFang_SC:Regular'] text-[14px] font-normal leading-[22px] tracking-[0.014px] ${selectedProject ? "text-[rgba(0,0,0,0.88)]" : "text-[rgba(0,0,0,0.6)]"}`}>
              {selectedProject?.name ?? "选择项目"}
            </span>
          </button>
        </div>
      </div>
      <CreateProjectDialog
        open={createProjectOpen}
        onOpenChange={setCreateProjectOpen}
        onCreate={onCreateProject}
      />
    </>
  );
}

// ── header ────────────────────────────────────────────────────────────────────

function ChatHeader({ title, projectBreadcrumb, projectOverview, actions, sidebarOpen, onSidebarToggle, onNewChat, mobile = false }: {
  mobile?: boolean;
  title?: string;
  projectBreadcrumb?: { projectName: string; taskName: string; onSelectProject: () => void };
  projectOverview?: { name: string; onOpenProjects: () => void };
  actions?: React.ReactNode;
  sidebarOpen?: boolean;
  onSidebarToggle?: () => void;
  onNewChat?: () => void;
}) {
  return (
    <div className="relative z-30 flex h-[48px] min-h-[48px] w-full shrink-0 items-center gap-[8px] bg-white px-[16px] py-0">
      {mobile ? (
        <>
          <SheetTrigger asChild>
            <button type="button" aria-label="展开导航" className="relative z-10 flex size-[24px] shrink-0 cursor-pointer items-center justify-center rounded-[4px] p-[4px] hover:bg-[#f7f7f7]">
              <img alt="" src="/assets/81b0c.svg" />
            </button>
          </SheetTrigger>
          <button type="button" onClick={onNewChat} aria-label="新建对话" className="relative z-10 flex size-[24px] shrink-0 cursor-pointer items-center justify-center rounded-[4px] p-[4px] hover:bg-[#f7f7f7]">
            <img alt="" src="/assets/200cc.svg" />
          </button>
        </>
      ) : !sidebarOpen && (
        <>
          <button className="relative z-10 flex size-[24px] shrink-0 cursor-pointer items-start rounded-[4px] p-[4px] hover:bg-[#f7f7f7]" onClick={onSidebarToggle} aria-label="展开侧边栏">
            <span aria-hidden className="relative size-[16px] shrink-0">
              <img alt="" className="absolute inset-0 block size-full max-w-none" src="/assets/0c886.svg" />
            </span>
          </button>
          <button className="relative z-10 flex size-[24px] shrink-0 cursor-pointer items-start rounded-[4px] p-[4px] hover:bg-[#f7f7f7]" onClick={onNewChat} aria-label="新建对话">
            <span aria-hidden className="relative size-[16px] shrink-0">
              <img alt="" className="absolute inset-0 block size-full max-w-none" src="/assets/a4798.svg" />
            </span>
          </button>
        </>
      )}
      {projectOverview ? (
        <div className={`absolute top-1/2 right-[88px] flex -translate-y-1/2 items-center gap-[8px] overflow-hidden ${sidebarOpen ? "left-[16px]" : "left-[96px]"}`}>
          <button type="button" onClick={projectOverview.onOpenProjects} className="shrink-0 cursor-pointer bg-transparent p-0 text-[14px] font-normal leading-[22px] text-[rgba(0,0,0,0.38)] hover:text-[rgba(0,0,0,0.88)]">项目</button>
          <span className="text-[12px] text-[rgba(0,0,0,0.26)]">/</span>
          <span className="truncate text-[14px] font-normal leading-[22px]">{projectOverview.name}</span>
        </div>
      ) : projectBreadcrumb ? (
        <div className={`absolute top-1/2 right-[88px] flex -translate-y-1/2 items-center gap-[8px] overflow-hidden ${sidebarOpen ? "left-[16px]" : "left-[96px]"}`}>
          <button type="button" onClick={projectBreadcrumb.onSelectProject} className="max-w-[240px] min-w-0 shrink cursor-pointer truncate rounded-[4px] font-['PingFang_SC:Regular'] text-[14px] font-normal leading-[22px] tracking-[0.014px] text-[rgba(0,0,0,0.38)] hover:text-[rgba(0,0,0,0.88)] focus-visible:outline-2 focus-visible:outline-[#1e63f5]">
            {projectBreadcrumb.projectName}
          </button>
          <span className="shrink-0 font-['PingFang_SC:Regular'] text-[12px] font-normal leading-[20px] tracking-[0.012px] text-[rgba(0,0,0,0.26)]">/</span>
          <span className="max-w-[320px] min-w-0 shrink truncate font-['PingFang_SC:Regular'] text-[14px] font-normal leading-[22px] tracking-[0.014px] text-[rgba(0,0,0,0.88)]">
            {projectBreadcrumb.taskName}
          </span>
        </div>
      ) : title ? (
        <p className="pointer-events-none absolute left-0 right-0 truncate px-[80px] text-center text-[14px] font-medium leading-[22px] text-[rgba(0,0,0,0.88)]">{title}</p>
      ) : null}
      <div className="flex-1" />
      {actions}
    </div>
  );
}

function TaskHeaderActions({ task, projects, artifacts, setHistory, setProjects, onLocateArtifact, onRequestDeleteTask }: {
  task: HistoryItem;
  projects: ProjectItem[];
  artifacts: LocatedTaskArtifact[];
  setHistory: React.Dispatch<React.SetStateAction<HistoryItem[]>>;
  setProjects: React.Dispatch<React.SetStateAction<ProjectItem[]>>;
  onLocateArtifact: (artifact: LocatedTaskArtifact) => void;
  // 删除任务先弹确认（Figma 459:38570），由 App 层执行真正的删除
  onRequestDeleteTask: (id: number) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [createProjectOpen, setCreateProjectOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const handlePointerDown = (event: MouseEvent) => {
      if (!(event.target instanceof Node)) return;
      if (triggerRef.current?.contains(event.target) || menuRef.current?.contains(event.target)) return;
      if (event.target instanceof Element && event.target.closest("[data-operation-menu]")) return;
      setMenuOpen(false);
    };
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [menuOpen]);

  const updateTask = (updates: Partial<HistoryItem>) => setHistory(items => items.map(item => item.id === task.id ? { ...item, ...updates } : item));

  return (
    <div className="relative z-10 flex shrink-0 items-center gap-[8px]">
      <TaskArtifactsButton
        artifacts={artifacts}
        onLocate={onLocateArtifact}
        onDownload={artifact => toast.success(`本地示例：开始下载${artifact.name}`)}
      />
      <button
        ref={triggerRef}
        type="button"
        aria-label="任务操作"
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        onClick={() => setMenuOpen(open => !open)}
        className={`flex size-[24px] shrink-0 cursor-pointer items-start rounded-[4px] p-[4px] hover:bg-[#f7f7f7] ${menuOpen ? "bg-[#f7f7f7]" : ""}`}
      >
        <span aria-hidden className="relative size-[16px] shrink-0">
          <img alt="" className="absolute inset-0 block size-full max-w-none" src="/assets/bbe3b.svg" />
        </span>
      </button>
      {menuOpen && (
        <TaskOperationsMenu
          ref={menuRef}
          anchor={triggerRef.current}
          align="end"
          gap={4}
          task={task}
          projects={projects}
          onTogglePin={() => updateTask({ pinned: !task.pinned })}
          onRename={title => updateTask({ title })}
          onMove={projectId => updateTask({ projectId })}
          onCreateProject={() => setCreateProjectOpen(true)}
          onArchive={() => {
            updateTask({ archived: true });
            showArchiveToast(() => updateTask({ archived: false }));
          }}
          onDelete={() => onRequestDeleteTask(task.id)}
          onClose={() => setMenuOpen(false)}
        />
      )}
      <CreateProjectDialog
        open={createProjectOpen}
        onOpenChange={setCreateProjectOpen}
        onCreate={project => {
          const id = Date.now();
          setProjects(current => [...current, { ...project, id }]);
          updateTask({ projectId: id });
        }}
      />
    </div>
  );
}

// ── views ─────────────────────────────────────────────────────────────────────

const SUGGESTIONS = ["找出近一周的邮件", "创建一个自动化任务，每天早上汇总未读邮件", "生成一份智能助手项目汇报PPT"];

// 推荐问题入场：淡入 + 上浮，位移逐颗加大形成视差层次（只走 transform/opacity，不占布局）
function suggestInStyle(shift: number, delay: number): CSSProperties {
  return {
    "--suggest-shift": `${shift}px`,
    animation: `suggestIn .52s cubic-bezier(.22,.61,.36,1) ${delay}s both`,
  } as unknown as CSSProperties;
}

function HomeView({ input, onInputChange, onSend, attachments, onAddFiles, onRemoveAttachment, pptGeneration, onPptGenerationChange, pptMode, onPptModeChange, pptPages, onPptPagesChange, projects, selectedProjectId, onSelectProject, onCreateProject }: {
  input: string;
  onInputChange: (v: string) => void;
  onSend: (text?: string, attachments?: ChatAttachment[]) => void;
  attachments: ChatAttachment[];
  onAddFiles: (files: File[]) => void;
  onRemoveAttachment: (id: string) => void;
  pptGeneration: boolean; onPptGenerationChange: (selected: boolean) => void;
  pptMode: PptMode; onPptModeChange: (mode: PptMode) => void;
  pptPages: PptPageCount; onPptPagesChange: (pages: PptPageCount) => void;
  projects: ProjectItem[];
  selectedProjectId: number | null;
  onSelectProject: (id: number | null) => void;
  onCreateProject: (project: Omit<ProjectItem, "id">) => void;
}) {
  const selectedProject = projects.find(project => project.id === selectedProjectId);
  return (
    <div className="flex-1 min-h-0 bg-white flex flex-col overflow-hidden">
      <style>{`@keyframes blink{0%,100%{opacity:1}50%{opacity:0}}
@keyframes suggestIn{0%{opacity:0;transform:translateY(var(--suggest-shift,14px)) scale(.98)}100%{opacity:1;transform:translateY(0) scale(1)}}
@media (prefers-reduced-motion: reduce){[data-suggest-in]{animation:none!important;opacity:1!important;transform:none!important}}`}</style>
      <div className="conversation-gutter relative flex-1 min-h-0">
        <div className="absolute inset-0 pointer-events-none flex items-center justify-center overflow-hidden">
          <div className="w-[756px] h-[400px] rounded bg-gradient-to-r from-[#a3ffff] to-[#1e63f5] opacity-10 blur-[100px]" />
        </div>
        <div className="conversation-content relative mx-auto flex h-full min-h-0 w-full flex-col items-center pt-[clamp(16px,14vh,160px)] [@media(max-height:520px)]:pt-0">
          {/* 矮窗口（如预览面板约 400px 高）时，欢迎区可压缩滚动，保证底部输入框和发送按钮始终可见 */}
          <div className="flex min-h-0 w-full flex-1 flex-col items-center overflow-y-auto [@media(max-height:520px)]:hidden">
          <div className="shrink-0 flex items-baseline gap-[8px] pb-[16px]">
            <span className="text-[46px] font-semibold leading-[56px] text-[rgba(0,0,0,0.88)] tracking-[0.046px]">Hi，xxxx</span>
            <span className="w-[16px] h-[4px] bg-[rgba(0,0,0,0.88)] self-end mb-[10px]" style={{ animation: "blink 1s step-end infinite" }} />
          </div>
          <div className="flex flex-col items-center w-full">
            <div className="shrink-0 flex items-center gap-[8px] pt-[32px] pb-[20px]" data-suggest-in style={suggestInStyle(8, 0)}>
              <svg width="80" height="1" viewBox="0 0 80 1" fill="none"><path d="M0 0.5H80" stroke="url(#gl)" /><defs><linearGradient id="gl" x1="0" y1="1" x2="80" y2="1" gradientUnits="userSpaceOnUse"><stop stopOpacity="0" /><stop offset="1" stopOpacity="0.3" /></linearGradient></defs></svg>
              <span className="text-[14px] leading-[22px] text-[rgba(0,0,0,0.38)] whitespace-nowrap">试试这些</span>
              <svg width="80" height="1" viewBox="0 0 80 1" fill="none"><path d="M0 0.5H80" stroke="url(#gr)" /><defs><linearGradient id="gr" x1="0" y1="1" x2="80" y2="1" gradientUnits="userSpaceOnUse"><stop stopOpacity="0.3" /><stop offset="1" stopOpacity="0" /></linearGradient></defs></svg>
            </div>
            <div className="shrink-0 flex flex-wrap items-center justify-center gap-[12px]">
              {SUGGESTIONS.map((s, i) => (
                <button key={s} onClick={() => onSend(s)} data-suggest-in style={suggestInStyle(18 + i * 7, 0.08 + i * 0.075)} className="flex items-center gap-[10px] px-[8px] py-[8px] bg-[#f7f7f7] hover:bg-[#f2f2f2] rounded-[8px] transition-colors cursor-pointer">
                  <AIIcon uid={`s${i}`} />
                  <span className="text-[14px] leading-[22px] text-[rgba(0,0,0,0.88)] whitespace-nowrap font-normal">{s}</span>
                </button>
              ))}
            </div>
          </div>
          </div>
          <div className="mt-auto w-full shrink-0 shadow-none">
            <HomeProjectPicker
              projects={projects}
              selectedProjectId={selectedProjectId}
              onSelectProject={onSelectProject}
              onCreateProject={onCreateProject}
            />
            <ChatInput
              value={input}
              hasProject={Boolean(selectedProject)}
              projectFiles={selectedProject ? selectedProject.files ?? DEMO_PROJECT_FILES : undefined}
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
            />
          </div>
        </div>
      </div>
      <div className="flex h-[22px] shrink-0 items-center justify-center p-[4px] opacity-0">
        <span className="text-[10px] text-[rgba(0,0,0,0.26)]">内容由AI生成，仅供参考</span>
      </div>
    </div>
  );
}

const TRANSFER_MEMBERS = ["吴易奚", "吴易奚", "吴易奚", "吴易奚", "孙雨薇"];

// Figma 9244:31238「移交项目」确认弹窗：选择人员后先确认，点确定才真正移交
function TransferConfirmDialog({ member, onCancel, onConfirm }: {
  member: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={member !== null} onOpenChange={open => { if (!open) onCancel(); }}>
      <DialogContent
        aria-describedby={undefined}
        className="w-[480px] max-w-[calc(100%-32px)] gap-0 rounded-[8px] border-0 bg-white p-0 shadow-[0_0_12px_rgba(0,0,0,0.08)] sm:max-w-[480px] [&>button]:hidden"
      >
        <div className="flex w-full flex-col gap-[16px] px-[16px] pt-[24px]">
          {/* 标题：警告图标 + 标题 + 关闭 */}
          <div className="flex w-full items-center gap-[8px]">
            <img src="/assets/transfer-warning.svg" alt="" className="size-[24px] shrink-0" />
            <DialogTitle className="min-w-0 flex-1 font-['PingFang_SC:Medium'] text-[20px] font-medium leading-[28px] tracking-[0.001em] text-[rgba(0,0,0,0.88)]">
              确定移交要移交此项目吗？
            </DialogTitle>
            <DialogClose asChild>
              <button type="button" aria-label="关闭移交确认弹窗" className="flex size-[24px] shrink-0 cursor-pointer items-center justify-center rounded-[4px] hover:bg-[#f7f7f7]">
                <img src="/assets/f802d.svg" alt="" />
              </button>
            </DialogClose>
          </div>
          {/* 正文：与标题文字左对齐（16 + 24 + 8 = 48） */}
          <p className="pl-[32px] font-['PingFang_SC:Regular'] text-[14px] font-normal leading-[22px] tracking-[0.001em] text-[rgba(0,0,0,0.88)]">
            确定要将此项目及其关联资源移交给 {member} 吗？移交后您将失去管理权限
          </p>
          {/* 按钮：取消 / 确定 */}
          <div className="flex w-full items-center justify-end gap-[24px] py-[16px]">
            <DialogClose asChild>
              <button type="button" className="cursor-pointer rounded-[4px] px-[4px] py-[3px] font-['PingFang_SC:Regular'] text-[14px] font-normal leading-[22px] tracking-[0.014px] text-[rgba(0,0,0,0.6)] hover:bg-[#f7f7f7]">
                取消
              </button>
            </DialogClose>
            <button type="button" onClick={onConfirm} className="cursor-pointer rounded-[4px] bg-[#1e63f5] px-[16px] py-[5px] font-['PingFang_SC:Regular'] text-[14px] font-normal leading-[22px] tracking-[0.014px] text-[rgba(255,255,255,0.98)] hover:bg-[#1554d1]">
              确定
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// 项目操作菜单：项目页卡片与侧栏「···」共用同一份操作项（编辑项目信息 / 移交项目 / 归档 / 删除），
// 保证两处的字段、图标、移交子菜单与确认弹窗完全一致
function ProjectActionsMenu({ project, anchor, gap = 0, onClose, onEdit, onArchive, onDelete, onTransfer, innerRef }: {
  project: ProjectItem;
  anchor: HTMLElement | null;
  // 卡片内锚定用 0，仅菜单按钮（menuOnly）场景留 8px 视觉间隙
  gap?: number;
  onClose: () => void;
  onEdit: () => void;
  onArchive: () => void;
  onDelete: () => void;
  onTransfer?: (member: string) => void;
  // 侧栏外点关闭依赖此 ref 判断「点击是否在菜单内」，卡片场景由自身 cardRef 兜底、可不传
  innerRef?: React.Ref<HTMLDivElement>;
}) {
  const [transferOpen, setTransferOpen] = useState(false);
  const [memberSearch, setMemberSearch] = useState("");
  const [memberSearchFocused, setMemberSearchFocused] = useState(false);
  const closeTransferTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const transferTriggerRef = useRef<HTMLButtonElement>(null);
  const members = TRANSFER_MEMBERS.filter(member => member.includes(memberSearch.trim()));

  useEffect(() => () => {
    if (closeTransferTimer.current) clearTimeout(closeTransferTimer.current);
  }, []);

  const openTransfer = () => {
    if (closeTransferTimer.current) clearTimeout(closeTransferTimer.current);
    setTransferOpen(true);
  };
  const deferCloseTransfer = () => {
    closeTransferTimer.current = setTimeout(() => setTransferOpen(false), 140);
  };
  const closeMenus = () => {
    onClose();
    setTransferOpen(false);
  };

  return (
    <OperationMenu anchor={anchor}
      ref={innerRef}
      role="menu"
      aria-label="项目操作"
      gap={gap}
      onKeyDown={event => {
        if (event.key === "Escape") { closeMenus(); anchor?.focus(); }
      }}
      className="w-[192px] overflow-visible rounded-[12px] border border-[#f2f2f2] bg-white px-[8px] py-[4px] shadow-[0_0_12px_rgba(0,0,0,0.08)]"
    >
      <div className="flex w-full flex-col py-[4px]">
        <button
          type="button"
          role="menuitem"
          onClick={() => { onEdit(); closeMenus(); }}
          className="flex w-full cursor-pointer items-center gap-[8px] rounded-[8px] px-[8px] py-[11px] text-left hover:bg-[#f7f7f7]"
        >
          <img src="/assets/e2b81.svg" alt="" className="shrink-0" />
          <span className="font-['PingFang_SC:Regular'] text-[14px] leading-[22px] tracking-[0.014px] text-[rgba(0,0,0,0.88)]">编辑项目信息</span>
        </button>
        <div className="relative" onMouseEnter={openTransfer} onMouseLeave={deferCloseTransfer}>
          <button
            type="button"
            role="menuitem"
            aria-haspopup="menu"
            aria-expanded={transferOpen}
            ref={transferTriggerRef}
            onClick={openTransfer}
            className={`flex w-full cursor-pointer items-center gap-[8px] rounded-[8px] px-[8px] py-[11px] text-left ${transferOpen ? "bg-[#f7f7f7]" : "hover:bg-[#f7f7f7]"}`}
          >
            <img src="/assets/65325.svg" alt="" className="shrink-0" />
            <span className="min-w-0 flex-1 font-['PingFang_SC:Regular'] text-[14px] leading-[22px] tracking-[0.014px] text-[rgba(0,0,0,0.88)]">移交项目</span>
            <img src="/assets/fb6a4.svg" alt="" className="shrink-0" />
          </button>
          {transferOpen && (
            <OperationMenu submenu anchor={transferTriggerRef.current}
              role="menu"
              onMouseEnter={openTransfer}
              onMouseLeave={deferCloseTransfer}
              className="w-[208px] overflow-hidden rounded-[8px] bg-white shadow-[0_0_12px_rgba(0,0,0,0.08)]"
            >
              <div className="bg-white px-[16px] py-[4px]">
                <label className="flex h-[32px] items-center gap-[8px] border-b border-[#1e63f5]">
                  <img src={memberSearchFocused ? "/assets/search-dialog-search.svg" : "/assets/search-dialog-search-default.svg"} alt="" className="size-[16px] shrink-0" />
                  <input
                    autoFocus
                    value={memberSearch}
                    onChange={event => setMemberSearch(event.target.value)}
                    onFocus={() => setMemberSearchFocused(true)}
                    onBlur={() => setMemberSearchFocused(false)}
                    placeholder="搜索"
                    className="min-w-0 flex-1 bg-transparent font-['PingFang_SC:Regular'] text-[14px] leading-[22px] tracking-[0.014px] text-[rgba(0,0,0,0.88)] outline-none placeholder:text-[rgba(0,0,0,0.26)]"
                  />
                  {memberSearch && (
                    <button type="button" aria-label="清空搜索" onMouseDown={event => event.preventDefault()} onClick={() => setMemberSearch("")} className="flex size-[16px] shrink-0 cursor-pointer items-center justify-center">
                      <img src="/assets/f802d.svg" alt="" className="size-[12px]" />
                    </button>
                  )}
                </label>
              </div>
              <div className="max-h-[480px] overflow-y-auto px-[8px]">
                {members.map((member, index) => (
                  <button
                    key={`${member}-${index}`}
                    type="button"
                    role="menuitem"
                    onClick={() => { onTransfer?.(member); closeMenus(); }}
                    className="flex w-[192px] cursor-pointer items-center rounded-[8px] px-[8px] py-[10px] hover:bg-[#f7f7f7]"
                  >
                    <span className="flex h-[24px] max-w-[144px] items-center gap-[4px] rounded-[16px] bg-[#f7f7f7] pl-[2px] pr-[8px]">
                      <span className="flex size-[20px] shrink-0 items-center justify-center rounded-full bg-[#1e63f5] font-['PingFang_SC:Regular'] text-[12px] leading-[20px] tracking-[0.012px] text-[rgba(255,255,255,0.98)]">
                        {getAvatarInitial(member)}
                      </span>
                      <span className="truncate font-['PingFang_SC:Regular'] text-[12px] leading-[20px] tracking-[0.012px] text-[rgba(0,0,0,0.6)]">
                        {member}
                      </span>
                    </span>
                  </button>
                ))}
                {members.length === 0 && <p className="px-[8px] py-[10px] text-[14px] text-[rgba(0,0,0,0.38)]">没有匹配的成员</p>}
              </div>
            </OperationMenu>
          )}
        </div>
        <button
          type="button"
          role="menuitem"
          onClick={() => { onArchive(); closeMenus(); }}
          className="flex w-full cursor-pointer items-center gap-[8px] rounded-[8px] px-[8px] py-[11px] text-left hover:bg-[#f7f7f7]"
        >
          <img src="/assets/ae0d0.svg" alt="" className="shrink-0" />
          <span className="font-['PingFang_SC:Regular'] text-[14px] leading-[22px] tracking-[0.014px] text-[rgba(0,0,0,0.88)]">归档</span>
        </button>
        <button
          type="button"
          role="menuitem"
          onClick={() => { onDelete(); closeMenus(); }}
          className="flex w-full cursor-pointer items-center gap-[8px] rounded-[8px] px-[8px] py-[11px] text-left hover:bg-[#f7f7f7]"
        >
          <img src="/assets/5ff6b.svg" alt="" className="shrink-0" />
          <span className="font-['PingFang_SC:Regular'] text-[14px] leading-[22px] tracking-[0.014px] text-[rgba(0,0,0,0.88)]">删除</span>
        </button>
      </div>
    </OperationMenu>
  );
}

function ProjectCard({ project, onOpen, onRename, onArchive, onDelete, onTransfer, menuOnly = false }: {
  project: ProjectItem;
  onOpen: () => void;
  onRename: () => void;
  onArchive: () => void;
  onDelete: () => void;
  onTransfer?: (member: string) => void;
  menuOnly?: boolean;
}) {
  const [hovered, setHovered] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (!cardRef.current?.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", closeOnOutsideClick);
    return () => document.removeEventListener("mousedown", closeOnOutsideClick);
  }, [menuOpen]);

  return (
    <div ref={cardRef} className="relative min-w-0">
      {menuOnly ? (
        <button type="button" aria-label="项目操作" aria-haspopup="menu" aria-expanded={menuOpen} onClick={event => {
          setMenuAnchor(event.currentTarget);
          setMenuOpen(open => !open);
        }} className="flex size-[24px] cursor-pointer items-center justify-center rounded-[4px] hover:bg-[#f7f7f7]">
          <img src="/assets/f8bb9.svg" alt="" />
        </button>
      ) : <div
        role="button"
        tabIndex={0}
        onClick={onOpen}
        onKeyDown={event => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onOpen();
          }
        }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        className={`flex h-[74px] w-full cursor-pointer items-center gap-[12px] overflow-hidden rounded-[12px] border border-[#e6e6e6] p-[12px] text-left transition-colors ${
          hovered || menuOpen ? "bg-[#e6e6e6]" : "bg-white"
        }`}
      >
        <div className="flex size-[48px] shrink-0 items-center justify-center rounded-[8px] bg-[#f7f7f7]">
          <img src="/assets/0fc4d.svg" alt="" className="shrink-0" />
        </div>
        <div className="flex min-w-0 flex-1 flex-col items-start justify-center font-['PingFang_SC:Regular']">
          <p className="w-full truncate text-[14px] font-normal leading-[22px] tracking-[0.014px] text-[rgba(0,0,0,0.88)]">
            {project.name}
          </p>
          <p className="w-full truncate text-[12px] font-normal leading-[20px] tracking-[0.012px] text-[rgba(0,0,0,0.38)]">
            {project.description || "暂无描述"}
          </p>
        </div>
        {(hovered || menuOpen) && (
          <button
            type="button"
            aria-label={`${project.name}更多操作`}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            onClick={event => {
              event.stopPropagation();
              setMenuAnchor(event.currentTarget);
              setMenuOpen(open => !open);
            }}
            className="flex size-[24px] shrink-0 cursor-pointer items-start rounded-[4px] p-[4px] hover:bg-[rgba(0,0,0,0.06)]"
          >
            <img src="/assets/bbe3b.svg" alt="" className="shrink-0" />
          </button>
        )}
      </div>}

      {menuOpen && (
        <ProjectActionsMenu
          project={project}
          anchor={menuAnchor}
          gap={menuOnly ? 8 : 0}
          onClose={() => setMenuOpen(false)}
          onEdit={onRename}
          onArchive={onArchive}
          onDelete={onDelete}
          onTransfer={onTransfer}
        />
      )}
    </div>
  );
}

function ProjectHeaderActions({ project, onEdit, onTransfer, onArchive, onDelete, panelOpen, showPanelToggle, onTogglePanel }: {
  project: ProjectItem;
  onEdit: (updates: { name: string; description: string }) => void;
  onTransfer: (member: string) => void;
  onArchive: () => void;
  onDelete: () => void;
  panelOpen: boolean;
  showPanelToggle: boolean;
  onTogglePanel: () => void;
}) {
  const [editOpen, setEditOpen] = useState(false);
  return (
    <div className="relative flex shrink-0 items-center gap-[8px]">
      <ProjectCard project={project} menuOnly onOpen={() => {}} onRename={() => setEditOpen(true)} onTransfer={onTransfer} onArchive={onArchive} onDelete={onDelete} />
      {showPanelToggle && <button type="button" aria-label={panelOpen ? "收起右侧边栏" : "展开右侧边栏"} aria-expanded={panelOpen} aria-controls="project-configuration" onClick={onTogglePanel} className="flex size-[24px] cursor-pointer items-center justify-center rounded-[4px] hover:bg-[#f7f7f7]">
        <img src="/assets/a8ef3.svg" alt="" />
      </button>}
      <CreateProjectDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        onCreate={() => {}}
        editProject={project}
        onEdit={updates => { onEdit(updates); toast.success("项目信息已更新"); }}
      />
    </div>
  );
}

// ============================================================================
// 列表页共享组件（项目页 / 自动化任务页复用同一套 Figma 组件、响应式规则与交互）
// Figma 9187:44647 / 9532:10168 / 9598:39360「Search Input」「Icon Button」
// Figma 9446:46779 / 9625:52202「Tag-2」Size=L
// ============================================================================

// Tag-2 组件 Size=L：Selected → #F7F7F7/r8 + 文字 0.88；Default → 透明/r4 + 文字 0.6；Hover → #F2F2F2/r8
// Figma 9625:52202 文字填充变量：选中 11548:25 (opacity 0.88)、默认 11548:26 (opacity 0.6)，
// 与项目详情页「任务/来源/产物」Tag-2 一致（历史已按设计稿校准）
// 项目页「全部/我创建的/我参与的」与自动化任务页「已启用/已暂停/已结束」共用
function TagTabs<T extends string>({ items, active, onChange }: {
  items: readonly T[];
  active: T;
  onChange: (item: T) => void;
}) {
  return (
    <div className="flex shrink-0 items-center gap-[16px] pb-[16px]">
      {items.map(item => (
        <button
          key={item}
          type="button"
          onClick={() => onChange(item)}
          aria-pressed={active === item}
          className={`flex h-[36px] shrink-0 cursor-pointer items-center px-[16px] font-normal text-[16px] leading-[24px] tracking-[0.016px] transition-colors ${active === item ? "rounded-[8px] bg-[#f7f7f7] text-[rgba(0,0,0,0.88)]" : "rounded-[4px] bg-transparent text-[rgba(0,0,0,0.6)] hover:rounded-[8px] hover:bg-[#f2f2f2]"}`}
        >
          {item}
        </button>
      ))}
    </div>
  );
}

const PROJECT_TABS = ["全部", "我创建的", "我参与的"] as const;

function ProjectListView({ projects, onCreateProject, onSelectProject, onEditProject, onArchiveProject, onDeleteProject, onTransferProject }: {
  projects: ProjectItem[];
  onCreateProject: (project: Omit<ProjectItem, "id">) => void;
  onSelectProject: (id: number) => void;
  onEditProject: (id: number, updates: { name: string; description: string }) => void;
  onArchiveProject: (id: number) => void;
  onDeleteProject: (id: number) => void;
  onTransferProject: (id: number, member: string) => void;
}) {
  const [createProjectOpen, setCreateProjectOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<ProjectItem | null>(null);
  const [projectTab, setProjectTab] = useState<(typeof PROJECT_TABS)[number]>("全部");
  const [projectQuery, setProjectQuery] = useState("");

  const keyword = projectQuery.trim().toLowerCase();
  const visibleProjects = projects.filter(project => {
    if (project.archived) return false;
    if (keyword && !`${project.name} ${project.description ?? ""}`.toLowerCase().includes(keyword)) return false;
    if (projectTab === "我创建的") return !project.owner || project.owner === "我";
    if (projectTab === "我参与的") return (project.members?.length ?? 0) > 0;
    return true;
  });

  return (
    <>
      <main className="relative min-h-0 flex-1 overflow-y-auto bg-white px-[16px] min-[800px]:px-[24px]">
        <div className="mx-auto flex min-h-full w-full max-w-[960px] flex-col">
          <ListPageHeader
            title="项目"
            query={projectQuery}
            onQueryChange={setProjectQuery}
            searchPlaceholder="搜索项目"
            searchAriaLabel="搜索项目"
          >
            <button
              type="button"
              onClick={() => setCreateProjectOpen(true)}
              className="hidden shrink-0 cursor-pointer items-center justify-center gap-[8px] overflow-hidden rounded-[4px] bg-[#1e63f5] px-[16px] py-[5px] hover:bg-[#1554d1] min-[560px]:flex"
            >
              <img src="/assets/c136c.svg" alt="" className="shrink-0" />
              <span className="whitespace-nowrap font-['PingFang_SC:Regular'] text-[14px] font-normal leading-[22px] tracking-[0.014px] text-[rgba(255,255,255,0.98)]">
                新建项目
              </span>
            </button>
            {/* <560px：Filled Primary Button 收起为 32x32 蓝色 add-circle-fill 图标按钮 */}
            <button
              type="button"
              aria-label="新建项目"
              onClick={() => setCreateProjectOpen(true)}
              className="hidden size-[32px] shrink-0 cursor-pointer items-center justify-center rounded-[4px] hover:bg-[#ebf4ff] active:bg-[#99c3ff] max-[559px]:flex"
            >
              <img src="/assets/project-add-circle.svg" alt="" className="size-[20px]" />
            </button>
          </ListPageHeader>

          <TagTabs items={PROJECT_TABS} active={projectTab} onChange={setProjectTab} />

          {visibleProjects.length === 0 ? (
            <div className="flex flex-1 items-center justify-center pb-[260px]">
              <div className="flex w-[320px] flex-col items-center justify-end">
                <div className="mb-[-80px] size-[320px] shrink-0 overflow-hidden">
                  <img src="/assets/projects-empty-design.png" alt="暂无项目" className="size-[320px] max-w-none object-cover" />
                </div>
                <div className="flex w-full flex-col items-center justify-center gap-[4px] pb-[32px]">
                  <p className="whitespace-nowrap font-['PingFang_SC:Medium'] text-[14px] font-medium leading-[22px] tracking-[0.014px] text-[rgba(0,0,0,0.38)]">
                    暂无项目
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="grid gap-[16px] overflow-visible pb-[24px] [grid-template-columns:repeat(auto-fill,minmax(min(288px,100%),1fr))]">
              {/* 卡片最小宽度 288（设计规则）：列数由可用宽度自动决定，不再按窗口断点写死 3/2/1 列。
                  960 内容宽 → 3 列（309），880 → 2 列（432），不足 2×288+16 时落 1 列；
                  极窄（内容 < 288+内边距）时用 min() 兜底，避免横向溢出。 */}
              {visibleProjects.map(project => (
                <ProjectCard
                  key={project.id}
                  project={project}
                  onOpen={() => onSelectProject(project.id)}
                  onRename={() => setEditingProject(project)}
                  onArchive={() => onArchiveProject(project.id)}
                  onDelete={() => onDeleteProject(project.id)}
                  onTransfer={member => onTransferProject(project.id, member)}
                />
              ))}
            </div>
          )}
        </div>
      </main>
      <CreateProjectDialog
        open={createProjectOpen || editingProject !== null}
        onOpenChange={open => { setCreateProjectOpen(open); if (!open) setEditingProject(null); }}
        onCreate={onCreateProject}
        editProject={editingProject}
        onEdit={updates => { if (editingProject) onEditProject(editingProject.id, updates); setEditingProject(null); }}
      />
    </>
  );
}

// Figma 9446:47192（项目 tab 有数据）/ 9423:124200（任务 tab）/ 9638:46195（空态）：
// 归档数据页 —— 标题 20px/28 Medium + Tag-2 胶囊 tab + 项目卡片网格 309x72 r12 / 任务分组列表 + 320px 空态插图
const formatArchiveTime = (timestamp?: number) => {
  if (!timestamp) return "";
  const date = new Date(timestamp);
  const pad = (value: number) => `${value}`.padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

// Figma 9244:31284「Action toast」：白底胶囊、描边 #38E38A、绿色对勾 +「已归档」+ 蓝色「撤销」
function showArchiveToast(onUndo: () => void) {
  const id = toast.custom(() => (
    <div className="flex h-[44px] items-center gap-[8px] rounded-full border border-[#38e38a] bg-white pl-[8px] pr-[16px] shadow-[0_0_12px_rgba(0,0,0,0.08)]">
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="shrink-0" aria-hidden>
        <circle cx="12" cy="12" r="10" fill="#38e38a" />
        <path d="M7.6 12.3l2.9 2.9 5.9-6.4" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span className="min-w-0 flex-1 whitespace-nowrap text-[14px] font-normal leading-[22px] text-[rgba(0,0,0,0.88)]">已归档</span>
      <button
        type="button"
        onClick={() => { toast.dismiss(id); onUndo(); }}
        className="shrink-0 cursor-pointer bg-transparent text-[14px] font-normal leading-[22px] text-[#1e63f5]"
      >撤销</button>
    </div>
  ), { duration: 5000 });
}

function ArchiveView({ projects, tasks, onUnarchiveProject, onEditProject, onTransferProject, onDeleteProject, onSelectTask, onUnarchiveTask, onDeleteTask }: {
  projects: ProjectItem[];
  tasks: HistoryItem[];
  onUnarchiveProject: (id: number) => void;
  onEditProject: (id: number, updates: { name: string; description: string }) => void;
  onTransferProject: (id: number, member: string) => void;
  onDeleteProject: (id: number) => void;
  onSelectTask: (id: number) => void;
  onUnarchiveTask: (id: number) => void;
  onDeleteTask: (id: number) => void;
}) {
  const [tab, setTab] = useState<"任务" | "项目">("任务");
  const [editingProject, setEditingProject] = useState<ProjectItem | null>(null);
  const [cardMenu, setCardMenu] = useState<{ id: number; anchor: HTMLElement } | null>(null);
  const [taskMenu, setTaskMenu] = useState<{ id: number; anchor: HTMLElement } | null>(null);
  const [hoveredCard, setHoveredCard] = useState<number | null>(null);
  const [memberSearch, setMemberSearch] = useState("");
  const [memberSearchFocused, setMemberSearchFocused] = useState(false);
  const [transferSubmenuOpen, setTransferSubmenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const transferTriggerRef = useRef<HTMLButtonElement>(null);
  const closeTransferTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const archivedProjects = projects.filter(project => project.archived);
  const archivedTasks = tasks.filter(task => task.archived);
  const members = TRANSFER_MEMBERS.filter(member => member.includes(memberSearch.trim()));
  const menuProject = archivedProjects.find(project => project.id === cardMenu?.id);
  const menuTask = archivedTasks.find(task => task.id === taskMenu?.id);

  useEffect(() => () => { if (closeTransferTimer.current) clearTimeout(closeTransferTimer.current); }, []);

  useEffect(() => {
    if (!cardMenu && !taskMenu) return;
    const close = (event: PointerEvent) => {
      if (event.target instanceof Node && !cardMenu?.anchor.contains(event.target) && !taskMenu?.anchor.contains(event.target) && !menuRef.current?.contains(event.target)) {
        setCardMenu(null);
        setTaskMenu(null);
        setMemberSearch("");
      }
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [cardMenu, taskMenu]);

  const closeMenus = () => {
    setCardMenu(null);
    setTaskMenu(null);
    setMemberSearch("");
  };
  const openTransfer = () => {
    if (closeTransferTimer.current) clearTimeout(closeTransferTimer.current);
    setCardMenu(menu => menu ? { ...menu } : menu);
    setTransferSubmenuOpen(true);
  };
  const deferCloseTransfer = () => {
    closeTransferTimer.current = setTimeout(() => setTransferSubmenuOpen(false), 140);
  };

  const emptyState = (text: string) => (
    <div className="flex flex-col items-center pt-[32px]">
      <img src="/assets/archive-empty.png" alt="" className="h-[260px] max-w-full object-contain" />
      <p className="pb-[24px] text-[14px] font-medium leading-[22px] text-[rgba(0,0,0,0.38)]">{text}</p>
    </div>
  );

  return (
    <main className="relative min-h-0 flex-1 overflow-y-auto bg-white px-[16px] min-[800px]:px-[24px]">
      <div className="mx-auto flex min-h-full w-full max-w-[960px] flex-col pb-[40px]">
        <h1 className="flex h-[44px] items-end pb-[16px] pt-[20px] text-[20px] font-medium leading-[28px] tracking-[0.02px] text-[rgba(0,0,0,0.88)]">归档数据</h1>
        <div role="tablist" aria-label="归档数据" className="flex shrink-0 items-center gap-[16px]">
          {(["任务", "项目"] as const).map(item => (
            <button key={item} type="button" role="tab" aria-selected={tab === item} onClick={() => { setTab(item); closeMenus(); }} className={`flex h-[36px] shrink-0 cursor-pointer items-center px-[16px] font-normal text-[16px] leading-[24px] tracking-[0.016px] transition-colors ${tab === item ? "rounded-[8px] bg-[#f7f7f7] text-[rgba(0,0,0,0.88)]" : "rounded-[8px] bg-transparent text-[rgba(0,0,0,0.6)] hover:bg-[#f2f2f2]"}`}>{item}</button>
          ))}
        </div>
        {tab === "项目" ? (
          archivedProjects.length > 0 ? (
            <div className="mt-[16px] grid gap-[16px] [grid-template-columns:repeat(auto-fill,minmax(min(288px,100%),1fr))]">
              {/* 与项目列表同一套最小宽度规则：卡片不低于 288，列数由可用宽度自动决定 */}
              {archivedProjects.map(project => (
                <div
                  key={project.id}
                  onMouseEnter={() => setHoveredCard(project.id)}
                  onMouseLeave={() => setHoveredCard(null)}
                  className={`relative flex h-[72px] min-w-0 cursor-pointer items-center rounded-[12px] border border-[#e6e6e6] px-[12px] ${hoveredCard === project.id || cardMenu?.id === project.id ? "bg-[#e6e6e6]" : "bg-white"}`}
                >
                  <div className="flex size-[48px] shrink-0 items-center justify-center rounded-[8px] bg-[#f7f7f7]">
                    <img src="/assets/e5ea3.svg" alt="" />
                  </div>
                  <div className="ml-[12px] min-w-0 flex-1">
                    <p className="truncate text-[14px] font-normal leading-[22px] tracking-[0.014px] text-[rgba(0,0,0,0.88)]">{project.name}</p>
                    <p className="truncate text-[12px] font-normal leading-[20px] tracking-[0.012px] text-[rgba(0,0,0,0.38)]">{project.description || "暂无描述"}</p>
                  </div>
                  <button
                    type="button"
                    aria-label={`${project.name}归档操作`}
                    aria-haspopup="menu"
                    aria-expanded={cardMenu?.id === project.id}
                    onClick={event => { event.stopPropagation(); const target = event.currentTarget; setCardMenu(menu => menu?.id === project.id ? null : { id: project.id, anchor: target }); setTransferSubmenuOpen(false); }}
                    className={`flex size-[24px] shrink-0 cursor-pointer items-center justify-center rounded-[4px] hover:bg-[rgba(0,0,0,0.06)] ${hoveredCard === project.id || cardMenu?.id === project.id ? "opacity-100" : "opacity-0 focus:opacity-100"}`}
                  >
                    <img src="/assets/bbe3b.svg" alt="" />
                  </button>
                </div>
              ))}
            </div>
          ) : emptyState("暂无归档项目")
        ) : archivedTasks.length > 0 ? (
          <div className="mt-[16px] flex flex-col">
            {archivedTasks.map(task => (
              <div
                key={task.id}
                role="button"
                tabIndex={0}
                onClick={() => onSelectTask(task.id)}
                onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onSelectTask(task.id); } }}
                className="group relative flex h-[40px] cursor-pointer items-center gap-[16px] rounded-[8px] px-[8px] hover:bg-[#f2f2f2]"
              >
                <span className="min-w-0 flex-1 truncate text-[14px] font-normal leading-[22px] text-[rgba(0,0,0,0.88)]">{task.title}</span>
                <span className="shrink-0 text-[14px] font-normal leading-[22px] text-[rgba(0,0,0,0.26)] transition-opacity group-hover:opacity-0">{formatArchiveTime(task.createdAt)}</span>
                <button
                  type="button"
                  aria-label={`${task.title}归档操作`}
                  aria-haspopup="menu"
                  aria-expanded={taskMenu?.id === task.id}
                  onClick={event => { event.stopPropagation(); const target = event.currentTarget; setTaskMenu(menu => menu?.id === task.id ? null : { id: task.id, anchor: target }); }}
                  className={`absolute right-[8px] top-1/2 flex size-[24px] -translate-y-1/2 cursor-pointer items-center justify-center rounded-[4px] transition-opacity hover:bg-[rgba(0,0,0,0.06)] focus:opacity-100 ${taskMenu?.id === task.id ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}
                >
                  <img src="/assets/bbe3b.svg" alt="" />
                </button>
              </div>
            ))}
          </div>
        ) : emptyState("暂无归档任务")}
      </div>
      {cardMenu && menuProject && (
        <OperationMenu
          ref={menuRef}
          role="menu"
          aria-label="归档项目操作"
          anchor={cardMenu.anchor}
          align="end"
          onKeyDown={event => { if (event.key === "Escape") { closeMenus(); cardMenu.anchor.focus(); } }}
          className="w-[192px] rounded-[12px] border border-[#f2f2f2] bg-white px-[8px] py-[4px] shadow-[0_0_12px_rgba(0,0,0,0.08)]"
        >
          <div className="flex w-full flex-col py-[4px]">
            <button type="button" role="menuitem" onClick={() => { onUnarchiveProject(menuProject.id); closeMenus(); }} className="flex w-full cursor-pointer items-center gap-[8px] rounded-[8px] px-[8px] py-[11px] text-left hover:bg-[#f7f7f7]">
              <img src="/assets/ae0d0.svg" alt="" className="shrink-0" />
              <span className="font-['PingFang_SC:Regular'] text-[14px] leading-[22px] tracking-[0.014px] text-[rgba(0,0,0,0.88)]">取消归档</span>
            </button>
            <button type="button" role="menuitem" onClick={() => { setEditingProject(menuProject); closeMenus(); }} className="flex w-full cursor-pointer items-center gap-[8px] rounded-[8px] px-[8px] py-[11px] text-left hover:bg-[#f7f7f7]">
              <img src="/assets/e2b81.svg" alt="" className="shrink-0" />
              <span className="font-['PingFang_SC:Regular'] text-[14px] leading-[22px] tracking-[0.014px] text-[rgba(0,0,0,0.88)]">编辑项目信息</span>
            </button>
            <div className="relative" onMouseEnter={openTransfer} onMouseLeave={deferCloseTransfer}>
              <button
                type="button"
                role="menuitem"
                aria-haspopup="menu"
                aria-expanded={transferSubmenuOpen}
                ref={transferTriggerRef}
                onClick={openTransfer}
                className={`flex w-full cursor-pointer items-center gap-[8px] rounded-[8px] px-[8px] py-[11px] text-left ${transferSubmenuOpen ? "bg-[#f7f7f7]" : "hover:bg-[#f7f7f7]"}`}
              >
                <img src="/assets/65325.svg" alt="" className="shrink-0" />
                <span className="min-w-0 flex-1 font-['PingFang_SC:Regular'] text-[14px] leading-[22px] tracking-[0.014px] text-[rgba(0,0,0,0.88)]">移交项目</span>
                <img src="/assets/fb6a4.svg" alt="" className="shrink-0" />
              </button>
              {transferSubmenuOpen && (
                <OperationMenu submenu anchor={transferTriggerRef.current}
                  role="menu"
                  onMouseEnter={openTransfer}
                  onMouseLeave={deferCloseTransfer}
                  className="w-[208px] overflow-hidden rounded-[8px] bg-white shadow-[0_0_12px_rgba(0,0,0,0.08)]"
                >
                  <div className="bg-white px-[16px] py-[4px]">
                    <label className="flex h-[32px] items-center gap-[8px] border-b border-[#1e63f5]">
                      <img src={memberSearchFocused ? "/assets/search-dialog-search.svg" : "/assets/search-dialog-search-default.svg"} alt="" className="size-[16px] shrink-0" />
                      <input
                        autoFocus
                        value={memberSearch}
                        onChange={event => setMemberSearch(event.target.value)}
                        onFocus={() => setMemberSearchFocused(true)}
                        onBlur={() => setMemberSearchFocused(false)}
                        placeholder="搜索"
                        className="min-w-0 flex-1 bg-transparent font-['PingFang_SC:Regular'] text-[14px] leading-[22px] tracking-[0.014px] text-[rgba(0,0,0,0.88)] outline-none placeholder:text-[rgba(0,0,0,0.26)]"
                      />
                      {memberSearch && (
                        <button type="button" aria-label="清空搜索" onMouseDown={event => event.preventDefault()} onClick={() => setMemberSearch("")} className="flex size-[16px] shrink-0 cursor-pointer items-center justify-center">
                          <img src="/assets/f802d.svg" alt="" className="size-[12px]" />
                        </button>
                      )}
                    </label>
                  </div>
                  <div className="max-h-[480px] overflow-y-auto px-[8px]">
                    {members.map((member, index) => (
                      <button
                        key={`${member}-${index}`}
                        type="button"
                        role="menuitem"
                        onClick={() => { onTransferProject(menuProject.id, member); closeMenus(); }}
                        className="flex w-[192px] cursor-pointer items-center rounded-[8px] px-[8px] py-[10px] hover:bg-[#f7f7f7]"
                      >
                        <span className="flex h-[24px] max-w-[144px] items-center gap-[4px] rounded-[16px] bg-[#f7f7f7] pl-[2px] pr-[8px]">
                          <span className="flex size-[20px] shrink-0 items-center justify-center rounded-full bg-[#1e63f5] font-['PingFang_SC:Regular'] text-[12px] leading-[20px] tracking-[0.012px] text-[rgba(255,255,255,0.98)]">
                            {getAvatarInitial(member)}
                          </span>
                          <span className="truncate font-['PingFang_SC:Regular'] text-[12px] leading-[20px] tracking-[0.012px] text-[rgba(0,0,0,0.6)]">
                            {member}
                          </span>
                        </span>
                      </button>
                    ))}
                    {members.length === 0 && <p className="px-[8px] py-[10px] text-[14px] text-[rgba(0,0,0,0.38)]">没有匹配的成员</p>}
                  </div>
                </OperationMenu>
              )}
            </div>
            <button type="button" role="menuitem" onClick={() => { onDeleteProject(menuProject.id); closeMenus(); }} className="flex w-full cursor-pointer items-center gap-[8px] rounded-[8px] px-[8px] py-[11px] text-left hover:bg-[#f7f7f7]">
              <img src="/assets/5ff6b.svg" alt="" className="shrink-0" />
              <span className="font-['PingFang_SC:Regular'] text-[14px] leading-[22px] tracking-[0.014px] text-[rgba(0,0,0,0.88)]">删除</span>
            </button>
          </div>
        </OperationMenu>
      )}
      {taskMenu && menuTask && (
        <OperationMenu
          ref={menuRef}
          role="menu"
          aria-label="归档任务操作"
          anchor={taskMenu.anchor}
          align="end"
          onKeyDown={event => { if (event.key === "Escape") { closeMenus(); taskMenu.anchor.focus(); } }}
          className="w-[160px] rounded-[12px] border border-[#f2f2f2] bg-white px-[8px] py-[4px] shadow-[0_0_12px_rgba(0,0,0,0.08)]"
        >
          <div className="flex w-full flex-col py-[4px]">
            <button type="button" role="menuitem" onClick={() => { onUnarchiveTask(menuTask.id); closeMenus(); }} className="flex w-full cursor-pointer items-center gap-[8px] rounded-[8px] px-[8px] py-[11px] text-left hover:bg-[#f7f7f7]">
              <img src="/assets/ae0d0.svg" alt="" className="shrink-0" />
              <span className="font-['PingFang_SC:Regular'] text-[14px] leading-[22px] tracking-[0.014px] text-[rgba(0,0,0,0.88)]">取消归档</span>
            </button>
            <button type="button" role="menuitem" onClick={() => { onDeleteTask(menuTask.id); closeMenus(); }} className="flex w-full cursor-pointer items-center gap-[8px] rounded-[8px] px-[8px] py-[11px] text-left hover:bg-[#f7f7f7]">
              <img src="/assets/5ff6b.svg" alt="" className="shrink-0" />
              <span className="font-['PingFang_SC:Regular'] text-[14px] leading-[22px] tracking-[0.014px] text-[rgba(0,0,0,0.88)]">删除</span>
            </button>
          </div>
        </OperationMenu>
      )}
      <CreateProjectDialog
        open={editingProject !== null}
        onOpenChange={open => { if (!open) setEditingProject(null); }}
        onCreate={() => {}}
        editProject={editingProject}
        onEdit={updates => { if (editingProject) onEditProject(editingProject.id, updates); setEditingProject(null); }}
      />
    </main>
  );
}

// 项目配置（指令 / 成员）：宽屏右侧边栏与窄屏「配置」页签共用同一份内容
function ProjectConfigurationSections({ project, onEditInstruction, onAddMember }: {
  project: ProjectItem;
  onEditInstruction: () => void;
  onAddMember: () => void;
}) {
  return (
    <>
      <div className="relative flex flex-col gap-[8px] border-b border-[#e6e6e6] p-[16px]">
        <p className="text-[14px] font-bold leading-[24px] tracking-[0.014px] text-[rgba(0,0,0,0.88)]">指令</p>
        <button type="button" aria-label="编辑指令" onClick={onEditInstruction} className="absolute right-[16px] top-[16px] flex size-[24px] cursor-pointer items-center justify-center rounded-[4px] hover:bg-[#f7f7f7]">
          <img src="/assets/49891.svg" alt="" />
        </button>
        <p className={`break-words whitespace-pre-wrap text-[12px] font-normal leading-[20px] tracking-[0.012px] ${project.instruction ? "text-[rgba(0,0,0,0.88)]" : "text-[rgba(0,0,0,0.38)]"}`}>
          {project.instruction || "设定项目背景与规范，让 AI 与你高效协作"}
        </p>
      </div>
      <div className="relative flex flex-col gap-[8px] p-[16px]">
        <p className="text-[14px] font-bold leading-[24px] tracking-[0.014px] text-[rgba(0,0,0,0.88)]">成员</p>
        <button type="button" aria-label="添加成员" onClick={onAddMember} className="absolute right-[16px] top-[16px] flex size-[24px] cursor-pointer items-center justify-center rounded-[4px] hover:bg-[#f7f7f7]">
          <img src="/assets/49891.svg" alt="" />
        </button>
        {project.members?.length ? (
          <div className="flex items-center py-[4px]">
            {project.members.slice(0, 8).map(member => (
              <span key={member.id} title={member.name} className="-mr-[8px] flex size-[24px] shrink-0 items-center justify-center rounded-full border border-white text-[12px] font-normal text-white" style={{ backgroundColor: member.color }}>{getAvatarInitial(member.name)}</span>
            ))}
            {project.members.length > 8 && <span className="ml-[8px] rounded-full border border-[#ebf4ff] px-[4px] text-[12px] text-[#1e63f5]">+{project.members.length - 8}</span>}
          </div>
        ) : <p className="font-['PingFang_SC:Regular'] text-[12px] font-normal leading-[20px] tracking-[0.012px] text-[rgba(0,0,0,0.38)]">协作者</p>}
      </div>
    </>
  );
}

// 「上传文件」下拉（Figma 9484:51165）：本地文件 + 各云来源；云来源进入「选择文件」弹窗
const UPLOAD_MENU_ITEMS: { label: string; icon: string; tab?: CloudSourceTab }[] = [
  { label: "上传本地文件", icon: "/assets/upload-menu-attachment.svg" },
  { label: "从 OneDrive 中添加", icon: "/assets/upload-menu-onedrive.svg", tab: "OneDrive" },
  { label: "从 Outlook 中添加", icon: "/assets/upload-menu-outlook.svg", tab: "Outlook" },
  { label: "从 SharePoint 中添加", icon: "/assets/upload-menu-sharepoint.svg", tab: "SharePoint" },
  { label: "从产物中添加", icon: "/assets/upload-menu-artifact.svg", tab: "产物" },
];

function ProjectHomeView({ project, projects, tasks, onSelectTask, onUpdateTask, onDeleteTask, onCreateProject, inputProps, onUpdateProject, onStartImport, configurationOpen, compact }: {
  project: ProjectItem;
  configurationOpen: boolean;
  // 详情页宽度 < 800px：右侧配置边栏收起，指令 / 成员并入「配置」页签
  compact: boolean;
  projects: ProjectItem[];
  tasks: HistoryItem[];
  onSelectTask: (id: number) => void;
  onUpdateTask: (id: number, updates: Partial<Pick<HistoryItem, "title" | "pinned" | "projectId">>) => void;
  onDeleteTask: (id: number) => void;
  onCreateProject: (project: Omit<ProjectItem, "id">) => number;
  inputProps: React.ComponentProps<typeof ChatInput>;
  onUpdateProject: (updates: Pick<ProjectItem, "instruction"> | Pick<ProjectItem, "members"> | Pick<ProjectItem, "files">) => void;
  // 文件导入会话挂在全局（App 根），浮窗不随项目页卸载而消失
  onStartImport: (files: { name: string; size: number }[], source: CloudSourceTab, projectId: number) => void;
}) {
  const [instructionOpen, setInstructionOpen] = useState(false);
  const [membersOpen, setMembersOpen] = useState(false);
  const [tab, setTab] = useState<"任务" | "来源" | "产物" | "配置">("任务");
  const [filesQuery, setFilesQuery] = useState("");
  const [filesSearchFocused, setFilesSearchFocused] = useState(false);
  // 来源 / 产物 页签的搜索框响应式：搜索框左边缘距左侧 tab 群的间距 < 32px 时收起为图标按钮
  // （以「来源」布局为基准：tab + 16 + 搜索 256 + 16 + 筛选 32 + 16 + 上传按钮 + 最小间距 32）
  const [filesSearchCollapsed, setFilesSearchCollapsed] = useState(false);
  const [filesSearchOpen, setFilesSearchOpen] = useState(false);
  // 来源 / 产物两页签各自独立的筛选条件，字段与交互和资料库一致（格式 + 更新时间）；
  // 来源另加「状态」（已启用 / 停用，Figma 10045:64279）与「上传人」（我 / 其他人）
  const [sourceStatuses, setSourceStatuses] = useState<FileStatus[]>([]);
  const [sourceFormats, setSourceFormats] = useState<FileFormat[]>([]);
  const [sourceTimeFilter, setSourceTimeFilter] = useState<TimeFilter>(null);
  const [sourceUploader, setSourceUploader] = useState<UploaderFilter>(EMPTY_UPLOADER_FILTER);
  const [artifactFormats, setArtifactFormats] = useState<FileFormat[]>([]);
  const [artifactTimeFilter, setArtifactTimeFilter] = useState<TimeFilter>(null);
  // 「其他人」里可选的成员：当前来源列表里真实出现过的上传人（排除「我」），
  // 保证筛选出来的结果不会一片空白
  const sourceOwners = Array.from(new Set((project.files ?? DEMO_PROJECT_FILES).sources.map(file => file.owner)))
    .filter(owner => owner && owner !== SELF_OWNER);
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const filesToolbarRef = useRef<HTMLDivElement>(null);
  const filesTabsRef = useRef<HTMLDivElement>(null);
  const filesUploadRef = useRef<HTMLButtonElement>(null);
  const collapsedSearchInputRef = useRef<HTMLInputElement>(null);
  const [taskMenu, setTaskMenu] = useState<{ id: number; anchor: HTMLButtonElement } | null>(null);
  // 「上传文件」下拉与「选择文件」弹窗
  const [uploadMenuAnchor, setUploadMenuAnchor] = useState<HTMLButtonElement | null>(null);
  const uploadMenuRef = useRef<HTMLDivElement>(null);
  const [selectFileTab, setSelectFileTab] = useState<CloudSourceTab | null>(null);
  const [renamingTask, setRenamingTask] = useState<{ id: number; title: string } | null>(null);
  const [pendingTaskMoveId, setPendingTaskMoveId] = useState<number | null>(null);
  const taskMenuRef = useRef<HTMLDivElement>(null);
  const menuTask = tasks.find(task => task.id === taskMenu?.id);
  const orderedTasks = [...tasks].sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)) || (b.createdAt ?? b.id) - (a.createdAt ?? a.id));

  useEffect(() => {
    if (!taskMenu) return;
    const close = (event: PointerEvent) => {
      if (event.target instanceof Node && !taskMenu.anchor.contains(event.target) && !taskMenuRef.current?.contains(event.target)) setTaskMenu(null);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [taskMenu]);

  useEffect(() => {
    if (!uploadMenuAnchor) return;
    const close = (event: PointerEvent) => {
      if (event.target instanceof Node && !uploadMenuAnchor.contains(event.target) && !uploadMenuRef.current?.contains(event.target)) setUploadMenuAnchor(null);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      uploadMenuAnchor.focus();
      setUploadMenuAnchor(null);
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", escape);
    };
  }, [uploadMenuAnchor]);

  // 测量工具栏可用宽度，判断搜索框是否需要收起：
  // 基准取「来源」页签（含上传按钮，最挤的情况），保证两个页签的搜索收起时机一致。
  useLayoutEffect(() => {
    const measure = () => {
      const toolbar = filesToolbarRef.current;
      if (!toolbar) return;
      const tabsWidth = filesTabsRef.current?.offsetWidth ?? 0;
      // 产物页签没有上传按钮时按来源的上传按钮宽度（实测值，兜底 141）计入
      const uploadWidth = filesUploadRef.current?.offsetWidth ?? 141;
      const needed = tabsWidth + 256 + 16 + 32 + 16 + uploadWidth + 32;
      setFilesSearchCollapsed(toolbar.clientWidth < needed);
    };
    measure();
    const observer = new ResizeObserver(measure);
    if (filesToolbarRef.current) observer.observe(filesToolbarRef.current);
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [tab]);

  // 切页签时收起已展开的搜索，回到图标态
  useEffect(() => {
    setFilesSearchOpen(false);
  }, [tab]);

  // 展开态下内容被清空且输入框已失焦 → 自动收起（与列表页搜索一致）；
  // 空间变宽、搜索框恢复常驻时同步复位展开态
  useEffect(() => {
    if (!filesSearchCollapsed) {
      setFilesSearchOpen(false);
      return;
    }
    if (!filesSearchOpen) return;
    if (!filesQuery && document.activeElement !== collapsedSearchInputRef.current) setFilesSearchOpen(false);
  }, [filesSearchCollapsed, filesSearchOpen, filesQuery]);

  // 变宽脱离紧凑布局后「配置」页签不再存在，自动回到「任务」
  useEffect(() => {
    if (!compact && tab === "配置") setTab("任务");
  }, [compact, tab]);

  return (
    <div className="flex min-h-0 flex-1 items-start gap-[16px] bg-white px-[16px]">
      <div className="flex h-full min-w-0 flex-1 flex-col items-center">
        <div className="relative flex min-h-0 w-full flex-1 flex-col">
          <div className="flex h-[48px] shrink-0 items-center gap-[12px]">
            <div className="flex size-[48px] shrink-0 items-center justify-center rounded-[8px] bg-[#f7f7f7]">
              <img src="/assets/e5ea3.svg" alt="" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[16px] font-bold leading-[24px] tracking-[0.016px] text-[rgba(0,0,0,0.88)]">{project.name}</p>
              <p className="truncate text-[12px] font-normal leading-[20px] tracking-[0.012px] text-[rgba(0,0,0,0.38)]">{project.description || "暂无简介"}</p>
            </div>
          </div>
          {/* Figma 9234:27120 / 9393:81788：Tag-2 胶囊 Tab（65x36 选中 r8 文字 0.88 / 默认 r4 文字 0.6，
              hover 参照 Tag 变体 r8 #F2F2F2），右侧同行放 Search Input 256x32 + 筛选 32x32 +（来源）上传 141x32 */}
          <div ref={filesToolbarRef} className="mt-[16px] flex h-[36px] shrink-0 items-center justify-between gap-[16px]">
            <div ref={filesTabsRef} role="tablist" aria-label="项目内容" className="flex shrink-0 items-center gap-[16px]">
              {(compact ? (["任务", "来源", "产物", "配置"] as const) : (["任务", "来源", "产物"] as const)).map(item => (
                <button key={item} type="button" role="tab" aria-selected={tab === item} onClick={() => { setTab(item); setTaskMenu(null); setUploadMenuAnchor(null); }} className={`flex h-[36px] shrink-0 cursor-pointer items-center px-[16px] font-normal text-[16px] leading-[24px] tracking-[0.016px] transition-colors ${tab === item ? "rounded-[8px] bg-[#f7f7f7] text-[rgba(0,0,0,0.88)]" : "rounded-[8px] bg-transparent text-[rgba(0,0,0,0.6)] hover:bg-[#f2f2f2]"}`}>{item}</button>
              ))}
            </div>
            {(tab === "来源" || tab === "产物") && (
              <div className={`flex min-w-0 items-center gap-[16px] ${filesSearchCollapsed && filesSearchOpen ? "flex-1" : "shrink-0"}`}>
                {filesSearchCollapsed && !filesSearchOpen ? (
                  // 收起态：32x32 搜索图标按钮，点击展开输入框（与列表页搜索交互一致）
                  <button type="button" aria-label="搜索文件名称" aria-expanded={false} onClick={() => setFilesSearchOpen(true)} className="flex size-[32px] shrink-0 cursor-pointer items-center justify-center rounded-[4px] hover:bg-[#f2f2f2] active:bg-[#dcdcdc]">
                    <img src="/assets/project-search-btn.svg" alt="" className="size-[20px]" />
                  </button>
                ) : (
                  <label className={`flex h-[32px] min-w-0 items-center gap-[8px] rounded-[4px] bg-[#f7f7f7] pl-[8px] pr-[8px] ${filesSearchCollapsed ? "flex-1" : "w-[256px] shrink-0"} ${filesSearchFocused ? "" : "pr-[16px]"}`}>
                    <img
                      src={filesSearchFocused ? "/assets/search-dialog-search.svg" : "/assets/search-dialog-search-default.svg"}
                      alt=""
                      className="size-[16px] shrink-0"
                    />
                    <input
                      ref={filesSearchCollapsed ? collapsedSearchInputRef : undefined}
                      autoFocus={filesSearchCollapsed}
                      aria-label="搜索文件名称"
                      placeholder="搜索文件名称"
                      value={filesQuery}
                      onChange={event => setFilesQuery(event.target.value)}
                      onFocus={() => setFilesSearchFocused(true)}
                      onBlur={() => {
                        setFilesSearchFocused(false);
                        if (filesSearchCollapsed && !filesQuery) setFilesSearchOpen(false);
                      }}
                      className="min-w-0 flex-1 bg-transparent text-[14px] font-normal leading-[22px] tracking-[0.014px] text-[rgba(0,0,0,0.88)] outline-none placeholder:text-[rgba(0,0,0,0.26)]"
                    />
                    {filesQuery && (
                      <button type="button" aria-label="清空搜索" onMouseDown={event => event.preventDefault()} onClick={() => setFilesQuery("")} className="flex size-[16px] shrink-0 cursor-pointer items-center justify-center">
                        <img src="/assets/f802d.svg" alt="" className="size-[12px]" />
                      </button>
                    )}
                  </label>
                )}
                <FileFilterButton
                  key={tab}
                  ariaLabel="筛选"
                  statuses={tab === "来源" ? sourceStatuses : undefined}
                  onStatusesChange={tab === "来源" ? setSourceStatuses : undefined}
                  selectedFormats={tab === "来源" ? sourceFormats : artifactFormats}
                  onFormatsChange={tab === "来源" ? setSourceFormats : setArtifactFormats}
                  timeFilter={tab === "来源" ? sourceTimeFilter : artifactTimeFilter}
                  onTimeFilterChange={tab === "来源" ? setSourceTimeFilter : setArtifactTimeFilter}
                  uploader={tab === "来源" ? sourceUploader : undefined}
                  onUploaderChange={tab === "来源" ? setSourceUploader : undefined}
                  uploaderOptions={sourceOwners}
                />
                {tab === "来源" && (
                  <button ref={filesUploadRef} type="button" aria-haspopup="menu" aria-expanded={Boolean(uploadMenuAnchor)} onClick={event => setUploadMenuAnchor(current => current ? null : event.currentTarget)} className="flex h-[32px] shrink-0 cursor-pointer items-center gap-[8px] rounded-[4px] border border-[#1e63f5] px-[16px] text-[14px] font-normal leading-[22px] text-[#1e63f5] hover:bg-[#ebf4ff]">
                    <img src="/assets/project-add-blue.svg" alt="" className="size-[16px] shrink-0" />
                    上传文件
                    <img src="/assets/project-direction-down-blue.svg" alt="" className="size-[16px] shrink-0" />
                  </button>
                )}
              </div>
            )}
          </div>
          <input ref={uploadInputRef} aria-label="上传项目来源文件" type="file" multiple hidden onChange={event => {
            const { additions, errors } = pickSourceFiles(event.target.files ?? new FileList());
            errors.forEach(error => toast.error(error));
            if (additions.length) {
              const base = project.files ?? DEMO_PROJECT_FILES;
              onUpdateProject({ files: { ...base, sources: [...base.sources, ...additions] } });
            }
            event.target.value = "";
          }} />
          {/* Figma 9484:51165：240 宽下拉，右上角对按钮右下角，逐项 44 高 */}
          {uploadMenuAnchor && (
            <OperationMenu ref={uploadMenuRef} anchor={uploadMenuAnchor} gap={8} align="end" role="menu" aria-label="上传文件方式" className="w-[240px] rounded-[12px] border border-[#f2f2f2] bg-white px-[8px] py-[4px] shadow-[0_0_12px_rgba(0,0,0,0.08)]">
              <div className="flex flex-col py-[4px]">
                {UPLOAD_MENU_ITEMS.map(item => (
                  <button key={item.label} type="button" role="menuitem" onClick={() => {
                    setUploadMenuAnchor(null);
                    if (item.tab) setSelectFileTab(item.tab);
                    else uploadInputRef.current?.click();
                  }} className="flex w-full cursor-pointer items-center gap-[8px] rounded-[8px] px-[8px] py-[11px] text-left text-[14px] font-normal leading-[22px] tracking-[0.014px] text-[rgba(0,0,0,0.88)] hover:bg-[#f7f7f7]">
                    <img src={item.icon} alt="" className="size-[16px] shrink-0" />
                    {item.label}
                  </button>
                ))}
              </div>
            </OperationMenu>
          )}
          {selectFileTab && (
            <SelectFileDialog
              initialTab={selectFileTab}
              onClose={() => setSelectFileTab(null)}
              onConfirm={(files, source) => onStartImport(files, source, project.id)}
            />
          )}
          {/* Figma 9234:27120：Tag-2 底边 y=100（y64 + 高36），Item List 顶边 y=116 → 页签行与列表间距 16px。
              「任务」页签另有自己的 12px，「配置」页签内层已带 16px，都不能再叠这一层，否则间距翻倍。 */}
          <div role="tabpanel" aria-label={tab} className={`min-h-0 flex-1 ${tab === "任务" ? "-mx-[8px] overflow-y-auto pt-[12px]" : tab === "配置" ? "flex flex-col" : "flex flex-col pt-[16px]"}`}>
            {tab === "配置" ? (
              // Figma 8819:63414：窄屏把指令 / 成员收进「配置」页签，卡片满宽、圆角 12、边框 #E6E6E6
              <div className="min-h-0 flex-1 overflow-y-auto pt-[16px]">
                <div id="project-configuration" className="overflow-hidden rounded-[12px] border border-[#e6e6e6]">
                  <ProjectConfigurationSections project={project} onEditInstruction={() => setInstructionOpen(true)} onAddMember={() => setMembersOpen(true)} />
                </div>
              </div>
            ) : tab !== "任务" ? (
              <ProjectFilesPanel key={tab} kind={tab === "来源" ? "sources" : "artifacts"} files={project.files ?? DEMO_PROJECT_FILES} query={filesQuery} formats={tab === "来源" ? sourceFormats : artifactFormats} timeFilter={tab === "来源" ? sourceTimeFilter : artifactTimeFilter} statuses={tab === "来源" ? sourceStatuses : undefined} uploader={tab === "来源" ? sourceUploader : undefined} onChange={files => onUpdateProject({ files })} onUploadToProject={file => onStartImport([{ name: file.name, size: file.blob ? file.blob.size : file.size }], "产物", project.id)} />
            ) : orderedTasks.length > 0 ? (
              <div className="flex flex-col gap-[8px]">
                {orderedTasks.map(task => (
                  <div key={task.id} data-project-task={task.id} className={`group flex min-h-[40px] shrink-0 items-center gap-[12px] rounded-[8px] px-[8px] py-[8px] hover:bg-[#f2f2f2] focus-within:bg-[#f2f2f2] ${taskMenu?.id === task.id ? "bg-[#f2f2f2]" : ""}`}>
                    <button type="button" onClick={() => onSelectTask(task.id)} className="flex min-w-0 flex-1 cursor-pointer items-center gap-[12px] bg-transparent p-0 text-left text-[14px] font-normal leading-[22px] tracking-[0.014px] text-[rgba(0,0,0,0.88)]">
                      <span className="truncate">{task.title}</span>
                      {task.pinned && <img src="/assets/896b2.svg" alt="已置顶" className="shrink-0" />}
                    </button>
                    <div className="relative flex h-[24px] min-w-[24px] shrink-0 items-center justify-end">
                      <time className={`text-[14px] font-normal leading-[22px] text-[rgba(0,0,0,0.26)] group-hover:invisible group-focus-within:invisible max-sm:hidden ${taskMenu?.id === task.id ? "invisible" : ""}`}>
                        {task.createdAt ? new Date(task.createdAt).toLocaleString("sv-SE", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }) : ""}
                      </time>
                      <button type="button" aria-label={`任务操作 ${task.title}`} aria-haspopup="menu" aria-expanded={taskMenu?.id === task.id} onClick={event => setTaskMenu(taskMenu?.id === task.id ? null : { id: task.id, anchor: event.currentTarget })} className={`absolute right-0 flex size-[24px] cursor-pointer items-center justify-center rounded-[4px] hover:bg-[#e6e6e6] group-hover:visible group-focus-within:visible [@media(hover:none)]:visible ${taskMenu?.id === task.id ? "visible" : "invisible"}`}>
                        <img src="/assets/bfc6f.svg" alt="" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex min-h-[240px] flex-col items-center justify-center py-[24px] text-[14px] leading-[22px] text-[rgba(0,0,0,0.38)]">
                <img src="/assets/b7105.png" alt="" className="size-[180px] object-cover" />
                <p className="font-medium">暂无项目任务</p>
                <p>快去输入问题发起新的咨询</p>
              </div>
            )}
          </div>
          {tab === "任务" && <div className="mx-auto w-full max-w-[800px] shrink-0 px-[16px] pt-[16px] max-sm:px-0">
            <ChatInput {...inputProps} placeholder={`在“${project.name}”中开始对话`} />
          </div>}
        </div>
        <div className="h-[20px] shrink-0 p-[4px] opacity-0">
          <span className="text-[10px] text-[rgba(0,0,0,0.26)]">内容由AI生成，仅供参考</span>
        </div>
      </div>

      {/* 宽屏：右侧常驻配置边栏（< 800px 时改为「配置」页签，见上方 tabpanel） */}
      {configurationOpen && !compact && <div id="project-configuration" className="w-[320px] shrink-0 overflow-hidden rounded-[12px] border border-[#e6e6e6]">
        <ProjectConfigurationSections project={project} onEditInstruction={() => setInstructionOpen(true)} onAddMember={() => setMembersOpen(true)} />
      </div>}
        {menuTask && taskMenu && (
          <OperationMenu ref={taskMenuRef} anchor={taskMenu.anchor} gap={4} role="menu" aria-label="项目任务操作" onKeyDown={event => {
            if (event.key === "Escape") { taskMenu.anchor.focus(); setTaskMenu(null); }
          }} className="w-[192px] rounded-[12px] border border-[#f2f2f2] bg-white px-[8px] py-[4px] shadow-[0_0_12px_rgba(0,0,0,0.08)]">
            <div className="flex flex-col py-[4px]">
            {[
              { label: menuTask.pinned ? "取消置顶" : "置顶此对话", icon: menuTask.pinned ? "67fe6" : "4363a", action: () => onUpdateTask(menuTask.id, { pinned: !menuTask.pinned }) },
              { label: "重命名", icon: "e2b81", action: () => setRenamingTask({ id: menuTask.id, title: menuTask.title }) },
            ].map(item => (
              <button key={item.label} type="button" role="menuitem" onClick={() => { item.action(); setTaskMenu(null); }} className="flex w-full cursor-pointer items-center gap-[8px] rounded-[8px] px-[8px] py-[11px] text-left text-[14px] font-normal leading-[22px] hover:bg-[#f7f7f7]">
                <img src={`/assets/${item.icon}.svg`} alt="" className="shrink-0" />{item.label}
              </button>
            ))}
            <TaskProjectMoveMenu
              key={menuTask.id}
              projects={projects}
              projectId={menuTask.projectId}
              onMove={projectId => {
                onUpdateTask(menuTask.id, { projectId });
                setTaskMenu(null);
              }}
              onCreate={() => {
                setPendingTaskMoveId(menuTask.id);
                setTaskMenu(null);
              }}
            />
            <button type="button" role="menuitem" onClick={() => { onDeleteTask(menuTask.id); setTaskMenu(null); }} className="flex w-full cursor-pointer items-center gap-[8px] rounded-[8px] px-[8px] py-[11px] text-left text-[14px] font-normal leading-[22px] hover:bg-[#f7f7f7]">
              <img src="/assets/5ff6b.svg" alt="" className="shrink-0" />删除
            </button>
            </div>
          </OperationMenu>
        )}
        <CreateProjectDialog
          open={pendingTaskMoveId !== null}
          onOpenChange={open => { if (!open) setPendingTaskMoveId(null); }}
          onCreate={newProject => {
            const projectId = onCreateProject(newProject);
            if (pendingTaskMoveId !== null) onUpdateTask(pendingTaskMoveId, { projectId });
            setPendingTaskMoveId(null);
          }}
        />
        <Dialog open={renamingTask !== null} onOpenChange={open => { if (!open) setRenamingTask(null); }}>
          <DialogContent aria-describedby={undefined} className="w-[400px] max-w-[calc(100vw-32px)] rounded-[16px] p-[24px]">
            <DialogTitle>重命名任务</DialogTitle>
            <form onSubmit={event => {
              event.preventDefault();
              if (!renamingTask?.title.trim()) return;
              onUpdateTask(renamingTask.id, { title: renamingTask.title.trim() });
              setRenamingTask(null);
            }} className="flex flex-col gap-[16px]">
              <label className="flex flex-col gap-[8px] text-[14px] font-normal">
                任务名称
                <input autoFocus value={renamingTask?.title ?? ""} onChange={event => setRenamingTask(current => current ? { ...current, title: event.target.value } : null)} className="h-[40px] rounded-[8px] border border-[#e6e6e6] px-[12px] outline-none focus:border-[#1e63f5]" />
              </label>
              <div className="flex justify-end gap-[8px]">
                <button type="button" onClick={() => setRenamingTask(null)} className="cursor-pointer rounded-[8px] border border-[#e6e6e6] px-[16px] py-[8px] text-[14px] font-normal">取消</button>
                <button type="submit" disabled={!renamingTask?.title.trim()} className="cursor-pointer rounded-[8px] bg-[#1e63f5] px-[16px] py-[8px] text-[14px] font-normal text-white disabled:cursor-not-allowed disabled:opacity-40">确定</button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
        {instructionOpen && <ProjectInstructionDialog instruction={project.instruction} onClose={() => setInstructionOpen(false)} onSave={instruction => { onUpdateProject({ instruction }); setInstructionOpen(false); }} />}
        {membersOpen && <ProjectMembersDialog members={project.members ?? []} onClose={() => setMembersOpen(false)} onSave={members => { onUpdateProject({ members }); setMembersOpen(false); }} />}
    </div>
  );
}

/* 自动化卡片入场动效：底色 → 图标 → 标题 → 副标题 → 扫光 */
const AUTOMATION_CARD_CSS = `
@keyframes ac-bg{from{opacity:0}to{opacity:1}}
@keyframes ac-icon{from{opacity:0;transform:scale(.6)}60%{opacity:1}to{opacity:1;transform:none}}
@keyframes ac-title{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}
@keyframes ac-sub{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}
@keyframes ac-sweep{0%{opacity:0;transform:translateX(-90%) skewX(-14deg)}22%{opacity:1}80%{opacity:.9}100%{opacity:0;transform:translateX(340%) skewX(-14deg)}}
@keyframes ac-actions{from{opacity:0;transform:translateY(2px)}to{opacity:1;transform:none}}
.ac-bg{animation:ac-bg .24s cubic-bezier(.33,1,.68,1) both}
.ac-icon{animation:ac-icon .30s cubic-bezier(.22,1.25,.42,1) .16s both;transform-origin:left center}
.ac-title{animation:ac-title .24s cubic-bezier(.33,1,.68,1) .30s both}
.ac-sub{animation:ac-sub .24s cubic-bezier(.33,1,.68,1) .40s both}
.ac-sweep{animation:ac-sweep .78s cubic-bezier(.4,0,.2,1) .60s both}
.ac-actions{animation:ac-actions .22s cubic-bezier(.33,1,.68,1) both}
@media (prefers-reduced-motion: reduce){
  .ac-bg,.ac-icon,.ac-title,.ac-sub,.ac-actions{animation:none;opacity:1;transform:none}
  .ac-sweep{animation:none;opacity:0}
}
/* 历史消息：卡片直接呈现，不重播入场与扫光（切换对话回来时不应像重新加载） */
.ac-static,.ac-static .ac-icon,.ac-static .ac-title,.ac-static .ac-sub{animation:none;opacity:1;transform:none}
.ac-static .ac-sweep{animation:none;opacity:0}
`;

function AutomationCard({ automation, onOpen, instant = false }: {
  automation: NonNullable<Message["automation"]>;
  onOpen?: (taskId: string) => void;
  // 历史消息（instant）：不播入场/扫光动画，避免切换对话回来像「重新加载」
  instant?: boolean;
}) {
  // 卡片四态（Figma 9908:45451）：已启用/已暂停 显示「时间 · 任务内容」；
  // 已结束 只显示「已结束」；已删除 标题加删除线并降到 26% 黑，副标题换成「已删除」且整卡不再可点。
  const deleted = automation.status === "已删除";
  const ended = automation.status === "已结束";
  // 副标题由 schedule + 「就」的内容拼成（Figma 9925:54915），不再把 cycle 和 description 硬拼
  const subtitle = deleted
    ? " 已删除"
    : ended
      ? " 已结束"
      : automation.schedule
        ? cardSubtitle(automation.schedule, automation.prompt ?? "", undefined, automation.title)
        : `${automation.cycle} · ${automation.description}`;
  return (
    <>
      <style>{AUTOMATION_CARD_CSS}</style>
      <button
        type="button"
        data-automation-card={automation.taskId}
        data-automation-status={automation.status ?? "已启用"}
        disabled={deleted}
        onClick={() => onOpen?.(automation.taskId)}
        className={`ac-bg relative flex w-full shrink-0 items-center gap-[8px] overflow-hidden rounded-[8px] bg-[#f7f7f7] p-[8px] text-left transition-colors ${deleted ? "cursor-default" : "cursor-pointer hover:bg-[#f2f2f2]"}${instant ? " ac-static" : ""}`}
      >
        <img src={automationIconSrc(automation.icon)} alt="" className="ac-icon size-[32px] shrink-0" />
        <div className="flex min-w-0 flex-1 flex-col gap-[4px]">
          <span className={`ac-title truncate font-['PingFang_SC:Medium'] text-[14px] font-medium leading-[22px] tracking-[0.014px] ${deleted ? "text-[rgba(0,0,0,0.26)] line-through" : "text-[rgba(0,0,0,0.88)]"}`}>
            {automation.title}
          </span>
          <span className="ac-sub truncate font-['PingFang_SC:Regular'] text-[14px] font-normal leading-[22px] tracking-[0.014px] text-[rgba(0,0,0,0.6)]">
            {subtitle}
          </span>
        </div>
        {/* 最后扫过一道高光（只在任务还活着的时候播） */}
        {!deleted && !ended && (
          <span
            aria-hidden
            className="ac-sweep pointer-events-none absolute inset-y-[-20%] left-0 w-[42%]"
            style={{ backgroundImage: "linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.55) 34%, rgba(255,255,255,1) 52%, rgba(255,255,255,0.5) 70%, rgba(255,255,255,0) 100%)" }}
          />
        )}
      </button>
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

function ChatMessageRow({ msg, index, isLastAi, instant, advance, onOpenPpt, onRegeneratePpt, onDownloadArtifact, onOpenAutomation, onFollowUp, onEditMessage, onDeleteMessage, onRetryMessage, onProcessProgress }: {
  msg: Message; index: number; isLastAi?: boolean; instant?: boolean; advance: (i: number) => void;
  onOpenPpt?: () => void; onRegeneratePpt?: () => void;
  onDownloadArtifact: (artifact: TaskArtifact) => void;
  onOpenAutomation?: (taskId: string) => void;
  onFollowUp?: (text: string) => void;
  onEditMessage?: (index: number) => void;
  onDeleteMessage?: (index: number) => void;
  onRetryMessage?: (index: number) => void;
  onProcessProgress?: (index: number, progress: { shown: number; batchStart: number }) => void;
}) {
  // messages without a running typewriter advance the reveal pointer on mount;
  // process messages advance via onGoalDone once their goal finishes typing
  // 重新生成：重挂 Typewriter 重新打字；复制：短暂提示已复制
  const [regenKey, setRegenKey] = useState(0);
  // 历史消息 instant=true 直接显示全文；点「重新生成」时临时关掉以重播打字
  const [localInstant, setLocalInstant] = useState(Boolean(instant));
  useEffect(() => { setLocalInstant(Boolean(instant)); }, [instant]);
  const [copied, setCopied] = useState(false);
  // 复制：Figma 2459:8219 .copy Icon 有 Default（copy-line）与 success（勾）两态，
  // 点击后先切勾并保持 1.5s 再复位；写入剪贴板失败则立刻收回，不假装成功。
  const handleCopy = () => {
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
    navigator.clipboard?.writeText(msg.text ?? "")?.catch(() => setCopied(false));
  };
  // 正文打完字后再让自动化卡片入场，保证「先文字、后卡片」的阅读顺序
  // 历史消息（instant）视为已打完，避免挂载时被重置为 false 导致操作项永不出现
  const [textDone, setTextDone] = useState(instant || !msg.text);
  useEffect(() => { setTextDone(instant || !msg.text); }, [msg.text, instant]);
  // 卡片内容（底色/图标/标题/副标题/扫光）全部演完，才出现下方操作项
  const [actionsShown, setActionsShown] = useState(Boolean(instant));
  useEffect(() => {
    if (!textDone) { setActionsShown(false); return; }
    // 历史消息（instant）直接显示操作项，不再等卡片扫光/延时淡入
    if (instant) { setActionsShown(true); return; }
    // 自动化卡片需等扫光动画演完再显示操作项；普通回答打字结束即可显示
    const delay = msg.automation ? 1400 : 120;
    const id = window.setTimeout(() => setActionsShown(true), delay);
    return () => window.clearTimeout(id);
  }, [msg.automation?.taskId, textDone, instant]);
  const autoAdvance = msg.role === "user" || msg.role === "result" || (msg.role === "ai" && Boolean(msg.thinking));
  useEffect(() => { if (autoAdvance) advance(index); }, [autoAdvance, advance, index]);

  if (msg.role === "user") {
    const hasSendState = msg.sendState === "failed" || msg.sendState === "info";
    return (
      <div className="group/user flex w-full flex-col items-end">
        {/* 附件区（Figma 9369:50206「引用slot → .上传区」）：独立于气泡、位于气泡上方；响应式规则与输入框 AttachmentTray 完全一致 */}
        {msg.attachments && msg.attachments.length > 0 && <MessageAttachments attachments={msg.attachments} />}
        <div className="flex w-full items-center justify-end gap-[12px]">
          {/* 发送状态图标（Figma 9369:50206）：红色感叹号=发送失败，info=信息提示；位于气泡左侧 */}
          {hasSendState && (
            <img
              src={msg.sendState === "failed" ? "/assets/msg-error-fill.svg" : "/assets/msg-info-fill.svg"}
              alt={msg.sendState === "failed" ? "发送失败" : "提示"}
              className="size-[16px] shrink-0"
            />
          )}
          <div className="user-message relative min-w-0 bg-[#f7f7f7] px-[12px] py-[8px] rounded-tl-[8px] rounded-br-[8px] rounded-bl-[8px]">
            {msg.text && <UserMessageText text={msg.text} />}
          </div>
        </div>
        {/* 用户消息操作项（Figma 917:11666）：编辑 / 复制 / 删除，hover 气泡时显示，右对齐 */}
        <div className="flex items-center justify-end gap-[8px] pt-[4px] opacity-0 transition-opacity group-hover/user:opacity-100">
          <button
            type="button"
            aria-label="编辑"
            title="编辑"
            onClick={() => onEditMessage?.(index)}
            className="flex size-[24px] cursor-pointer items-center justify-center rounded-[4px] opacity-60 transition-colors hover:bg-[#f2f2f2] hover:opacity-100"
          >
            <img src="/assets/msg-edit.svg" alt="" className="size-[16px]" />
          </button>
          <button
            type="button"
            aria-label="复制"
            title={copied ? "已复制" : "复制"}
            onClick={handleCopy}
            className="flex size-[24px] cursor-pointer items-center justify-center rounded-[4px] opacity-60 transition-colors hover:bg-[#f2f2f2] hover:opacity-100"
          >
            {/* Figma 2459:8219 .copy Icon：默认 copy-line，点击复制后切 success（勾） */}
            <img src={copied ? "/assets/msg-copy-success.svg" : "/assets/msg-copy-user.svg"} alt="" className="size-[16px]" />
          </button>
          <button
            type="button"
            aria-label="删除"
            title="删除"
            onClick={() => onDeleteMessage?.(index)}
            className="flex size-[24px] cursor-pointer items-center justify-center rounded-[4px] opacity-60 transition-colors hover:bg-[#f2f2f2] hover:opacity-100"
          >
            <img src="/assets/msg-delete.svg" alt="" className="size-[16px]" />
          </button>
        </div>
        {/* 发送失败提示 + 重试（Figma 截图黑色胶囊），失败态显示 */}
        {msg.sendState === "failed" && (
          <button
            type="button"
            onClick={() => onRetryMessage?.(index)}
            className="mt-[4px] flex items-center gap-[8px] rounded-[6px] bg-[rgba(0,0,0,0.88)] px-[10px] py-[5px] text-[12px] leading-[18px] text-white transition-opacity hover:opacity-90"
          >
            <span>发送失败</span>
            <span className="text-[#9cc5ff]">重试</span>
          </button>
        )}
      </div>
    );
  }
  if (msg.role === "process") return (
    <div className="w-full max-w-[768px]"><ExecutionProcess running={Boolean(msg.thinking)} instant={instant} progress={msg.progress} onProgress={p => onProcessProgress?.(index, p)} variant={msg.variant ?? "requirement"} preset={msg.preset} onGoalDone={() => advance(index)} /></div>
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
          <p className="text-[16px] leading-[26px] text-[rgba(0,0,0,0.88)] whitespace-pre-wrap"><Typewriter key={regenKey} instant={localInstant} text={msg.text ?? ""} onDone={() => { setTextDone(true); advance(index); }} /></p>
          {/* 自动化卡片（Figma 9925:54896）：#F7F7F7 底、r8、p8、g8，32 图标 + 标题/副标题 */}
          {msg.automation && textDone && (
            <AutomationCard automation={msg.automation} onOpen={onOpenAutomation} instant={localInstant} />
          )}
          {msg.artifacts && msg.artifacts.length > 0 && (
            <div className="artifact-grid grid w-full gap-[12px]">
              {msg.artifacts.map(artifact => <ArtifactFileCard key={artifact.id} artifact={artifact} onDownload={onDownloadArtifact} />)}
            </div>
          )}
          {/* 回答下方的操作项（Figma MessageActions）：重新生成 / 复制 / 来源。
              所有 AI 回答都渲染：最新一条常显，历史回答默认隐藏、hover 整条消息时淡入 */}
          {actionsShown && (
            <div
              // 历史消息（重新进入/切换对话）不播入场动画：仅保留 hover 的 opacity 过渡
              style={{ animation: localInstant ? "none" : undefined }}
              className={`ac-actions flex items-center gap-[8px] transition-opacity ${isLastAi ? "" : "opacity-0 group-hover/ai:opacity-100"}`}
            >
              <button
                type="button"
                aria-label="重新生成"
                title="重新生成"
                onClick={() => { setTextDone(false); setLocalInstant(false); setRegenKey(key => key + 1); }}
                className="flex size-[24px] cursor-pointer items-center justify-center rounded-[4px] opacity-60 transition-colors hover:bg-[#f2f2f2] hover:opacity-100"
              >
                <img src="/assets/msg-refresh.svg" alt="" className="size-[16px]" />
              </button>
              <button
                type="button"
                aria-label="复制"
                title={copied ? "已复制" : "复制"}
                onClick={handleCopy}
                className="flex size-[24px] cursor-pointer items-center justify-center rounded-[4px] opacity-60 transition-colors hover:bg-[#f2f2f2] hover:opacity-100"
              >
                <img src={copied ? "/assets/msg-copy-success.svg" : "/assets/msg-copy.svg"} alt="" className={copied ? "size-[16px]" : "size-[24px]"} />
              </button>
              {/* 来源：3 个 20px 圆形来源徽标（重叠 -4）+「N个来源」 */}
              <div className="flex items-center gap-[4px] px-[4px]">
                <img src="/assets/msg-sources.svg" alt="" className="h-[20px] w-[52px] shrink-0" />
                <span className="whitespace-nowrap font-['PingFang_SC:Regular'] text-[14px] font-normal leading-[22px] tracking-[0.014px] text-[rgba(0,0,0,0.6)]">9个来源</span>
              </div>
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
                  // 历史消息（重新进入/切换对话）不再重播错峰入场动画，直接呈现
                  style={{ animation: localInstant ? "none" : `followUpIn 320ms cubic-bezier(0.22,1,0.36,1) ${qi * 110}ms both` }}
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

function ChatView({ conversationId, messages, input, onInputChange, onSend, attachments, onAddFiles, onRemoveAttachment, hasProject, projectFiles, showInput = true, onOpenPpt, onRegeneratePpt, pptGeneration, onPptGenerationChange, pptMode, onPptModeChange, pptPages, onPptPagesChange, agentRunning, onStop, onOpenAutomation, onEditMessage, onDeleteMessage, onRetryMessage, onProcessProgress }: {
  conversationId: number | null;
  messages: Message[];
  input: string;
  onInputChange: (v: string) => void;
  onSend: (text?: string, attachments?: ChatAttachment[]) => void;
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
  onEditMessage?: (index: number) => void;
  onDeleteMessage?: (index: number) => void;
  onRetryMessage?: (index: number) => void;
  onProcessProgress?: (index: number, progress: { shown: number; batchStart: number }) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  // useLayoutEffect：切换会话/新消息时在绘制前就定位到底部，
  // 用 useEffect 会先画出「停在旧滚动位置」的一帧，看起来像内容重新加载了一次。
  // 图标/字体高度在下一帧才最终确定，补一次 rAF 校正，避免停在差十几像素的位置。
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    const id = requestAnimationFrame(() => { el.scrollTop = el.scrollHeight; });
    return () => cancelAnimationFrame(id);
  }, [messages]);

  // 回到底部按钮：距底部超过 80px（即下方还有 >80px 内容被遮住）时显示
  const [showBackToBottom, setShowBackToBottom] = useState(false);
  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const distanceToBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    setShowBackToBottom(distanceToBottom > 80);
  }, []);
  const scrollToBottom = useCallback(() => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
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
  // 只有位于消息流末尾的 AI 回答（即当前最新一轮、后面没有任何更新消息）操作项常显；
  // 一旦用户发了新消息/新一轮处理中，旧回答都降为 hover 显示
  const lastAiIndex = messages.length - 1;
  return (
    <div className="flex-1 min-h-0 bg-white flex flex-col">
      <style>{`@keyframes blink{0%,100%{opacity:1}50%{opacity:0}}@keyframes followUpIn{0%{opacity:0;transform:translateY(10px)}100%{opacity:1;transform:translateY(0)}}`}</style>
      <div ref={scrollRef} onScroll={handleScroll} className="flex-1 min-h-0 overflow-y-auto">
        <div className="conversation-gutter min-h-full pt-[16px]">
          <div className="conversation-content mx-auto w-full">
            <div className="conversation-messages flex flex-col pt-[16px] pb-[56px]">
              {messages.map((msg, i) => {
                if (i > revealed) return null;
                // key 带上会话 id：切换会话时强制重挂，避免 React 复用同 index 的旧实例
                // 把上一条会话的 instant / 打字进度 / 操作项状态带过来（表现为内容重新加载、重新打字）
                const rowKey = `${conversationId ?? "draft"}-${i}`;
                if (msg.role === "process" && taskComplete) {
                  return i === firstProcessIndex ? <div key={rowKey} className={`w-full ${spacingBefore(i)}`}><MergedProcess presets={processPresets} /></div> : null;
                }
                return (
                  <div key={rowKey} data-message-index={i} className={`flex w-full flex-col ${spacingBefore(i)}`}>
                    <ChatMessageRow msg={msg} index={i} isLastAi={i === lastAiIndex} instant={Boolean(msg.instant)} advance={advance} onOpenPpt={onOpenPpt} onRegeneratePpt={onRegeneratePpt} onDownloadArtifact={artifact => toast.success(`本地示例：开始下载${artifact.name}`)} onOpenAutomation={onOpenAutomation} onFollowUp={onSend} onEditMessage={onEditMessage} onDeleteMessage={onDeleteMessage} onRetryMessage={onRetryMessage} onProcessProgress={onProcessProgress} />
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
            />
        </div>
      </div>
      <div className="shrink-0 flex items-center justify-center p-[4px]">
        <span className="text-[10px] text-[rgba(0,0,0,0.26)]">内容由AI生成，仅供参考</span>
      </div>
    </div>
  );
}

// ── root ──────────────────────────────────────────────────────────────────────

type ToolKind = "search" | "read" | "extract" | "analyze" | "generate" | "check" | "summarize" | "execute" | "fail" | "chevron";
function TaskIcon({ type, expanded = false }: { type: ToolKind; expanded?: boolean }) {
  const wrap = (content: React.ReactNode) => <span className="relative size-[16px] shrink-0 overflow-hidden">{content}</span>;
  if (type === "search") return wrap(<svg className="absolute inset-[4.16%_7.02%_7.02%_8.33%]" viewBox="0 0 13.543 14.2102" fill="none" preserveAspectRatio="none"><path d={svgProgress.p3b5d3c00} fill="black" fillOpacity="0.38"/><path d={svgProgress.p313b1700} fill="black" fillOpacity="0.38"/></svg>);
  if (type === "read") return wrap(<svg className="absolute inset-0 size-[16px]" viewBox="0 0 16 16" fill="none" preserveAspectRatio="none"><path d="M8.00027 4.66659C9.45956 4.66666 10.7208 5.45135 11.568 6.15356C12.001 6.51248 12.35 6.86963 12.5908 7.13729C12.7116 7.27155 12.8065 7.38476 12.872 7.46541C12.9047 7.50563 12.9303 7.53807 12.9482 7.56112C12.957 7.57251 12.9639 7.58175 12.969 7.58846C12.9716 7.59184 12.9739 7.5948 12.9755 7.59692L12.9775 7.59953L12.9788 7.60083C12.9788 7.60083 12.9724 7.60585 12.4443 7.99992C12.9724 8.39398 12.9788 8.39901 12.9788 8.39901L12.9775 8.40031L12.9755 8.40291C12.9739 8.40504 12.9716 8.408 12.969 8.41138C12.9639 8.41809 12.957 8.42733 12.9482 8.43872C12.9303 8.46177 12.9047 8.49421 12.872 8.53442C12.8065 8.61508 12.7116 8.72828 12.5908 8.86255C12.35 9.13021 12.001 9.48735 11.568 9.84627C10.7208 10.5485 9.45956 11.3332 8.00027 11.3333C6.54088 11.3333 5.27913 10.5485 4.43191 9.84627C3.9989 9.48734 3.6499 9.13019 3.40913 8.86255C3.28834 8.72829 3.19401 8.61508 3.12853 8.53442C3.09581 8.49413 3.07029 8.46181 3.05235 8.43872C3.04339 8.42719 3.03601 8.41813 3.03087 8.41138C3.0283 8.408 3.02596 8.40504 3.02436 8.40291L3.02241 8.40031L3.02176 8.39966L3.55561 7.99992L3.02176 7.60083L3.02241 7.59953L3.02436 7.59692C3.02596 7.5948 3.0283 7.59184 3.03087 7.58846C3.03601 7.5817 3.04339 7.57265 3.05235 7.56112C3.07029 7.53803 3.09581 7.5057 3.12853 7.46541C3.19401 7.38476 3.28834 7.27155 3.40913 7.13729C3.6499 6.86965 3.9989 6.51249 4.43191 6.15356C5.27913 5.45131 6.54088 4.66659 8.00027 4.66659ZM8.00027 5.99992C7.00512 5.99992 6.04416 6.54857 5.28282 7.17961C4.92706 7.47449 4.63505 7.77126 4.42735 7.99992C4.63505 8.22858 4.92706 8.52535 5.28282 8.82023C6.04416 9.45127 7.00512 9.99992 8.00027 9.99992C8.99529 9.99984 9.95581 9.45118 10.7171 8.82023C11.0728 8.52539 11.3649 8.22857 11.5725 7.99992C11.3649 7.77127 11.0728 7.47445 10.7171 7.17961C9.95581 6.54866 8.99529 6 8.00027 5.99992ZM3.55561 7.99992L3.0211 8.39836C2.84489 8.16196 2.84489 7.83788 3.0211 7.60148L3.55561 7.99992ZM12.9788 7.60083C13.1551 7.83727 13.1551 8.16257 12.9788 8.39901L12.4443 7.99992L12.9788 7.60083Z" fill="black" fillOpacity="0.38"/><path d="M8.44428 8.00011C8.44428 7.75473 8.24563 7.55557 8.00027 7.55545C7.75482 7.55545 7.55561 7.75466 7.55561 8.00011C7.55573 8.24547 7.75489 8.44412 8.00027 8.44412C8.24555 8.44401 8.44416 8.2454 8.44428 8.00011ZM9.77762 8.00011C9.7775 8.98178 8.98193 9.77734 8.00027 9.77746C7.01851 9.77746 6.22239 8.98185 6.22228 8.00011C6.22228 7.01828 7.01844 6.22212 8.00027 6.22212C8.98201 6.22224 9.77762 7.01835 9.77762 8.00011Z" fill="black" fillOpacity="0.38"/><path d="M1.3335 9.49992H2.66683V13.3333H6.50016V14.6666H2.60042C1.90086 14.6666 1.3335 14.0992 1.3335 13.3997V9.49992ZM1.3335 2.60018C1.3335 1.90062 1.90086 1.33325 2.60042 1.33325H6.50016V2.66659H2.66683V6.49992H1.3335V2.60018ZM14.6668 13.3997C14.6668 14.0992 14.0995 14.6666 13.3999 14.6666H9.50016V13.3333H13.3335V9.49992H14.6668V13.3997ZM14.6668 6.49992H13.3335V2.66659H9.50016V1.33325H13.3999C14.0995 1.33325 14.6668 1.90062 14.6668 2.60018V6.49992Z" fill="black" fillOpacity="0.38"/></svg>);
  if (type === "extract") return wrap(<><svg className="absolute inset-[8.33%_16.67%_12.5%_8.33%]" viewBox="0 0 12 12.667" fill="none" preserveAspectRatio="none"><path d={svgProgress.p31938000} fill="black" fillOpacity="0.38"/></svg><svg className="absolute inset-[63.33%_12.5%_9.17%_58.33%]" viewBox="0 0 4.66667 4.39974" fill="none" preserveAspectRatio="none"><path d={svgProgress.p1528fd00} fill="black" fillOpacity="0.38"/></svg></>);
  if (type === "analyze") return wrap(<svg className="absolute inset-[12.5%_8.33%_8.33%]" viewBox="0 0 13.3334 12.6667" fill="none" preserveAspectRatio="none"><path d={svgProgress.p39797f00} fill="black" fillOpacity="0.38"/><path d={svgProgress.p3d6ffbf0} fill="black" fillOpacity="0.38"/></svg>);
  if (type === "generate") return wrap(<svg className="absolute inset-[8.33%_12.5%]" viewBox="0 0 12 13.3333" fill="none" preserveAspectRatio="none"><path d={svgProgress.p21d54700} fill="black" fillOpacity="0.38"/></svg>);
  if (type === "check") return wrap(<svg className="absolute left-[1.67px] top-px h-[14.243px] w-[12.667px]" viewBox="0 0 12.6667 14.2427" fill="none" preserveAspectRatio="none">{[svgProgress.p2e680a00,svgProgress.pce82500,svgProgress.p2a4faf00,svgProgress.p2dfb8000,svgProgress.p375f7200,svgProgress.p14ac9ef0].map((d,i)=><path key={i} d={d} fill="black" fillOpacity="0.38"/>)}</svg>);
  if (type === "summarize") return wrap(<svg className="absolute left-0 top-1/2 h-[11.314px] w-[15.98px] -translate-y-1/2" viewBox="0 0 15.9804 11.3137" fill="none" preserveAspectRatio="none"><path d={svgProgress.p1305b900} fill="black" fillOpacity="0.38"/><path d={svgProgress.p3d125080} fill="black" fillOpacity="0.38"/><path d={svgProgress.p3fde1480} fill="black" fillOpacity="0.38"/></svg>);
  if (type === "execute") return wrap(<svg className="absolute inset-[12.5%_9.65%_4.14%_4.17%]" viewBox="0 0 13.7892 13.3381" fill="none" preserveAspectRatio="none"><path d={svgProgress.p2a822e00} fill="black" fillOpacity="0.38"/></svg>);
  if (type === "fail") return wrap(<svg className="absolute inset-[17.59%]" viewBox="0 0 10.371 10.371" fill="none" preserveAspectRatio="none"><path d={svgProgress.p16dcd200} fill="#FC5926"/></svg>);
  // 图标容器按 Figma layout_e4b6f33f 为 16×16；inset 百分比据此计算，
  // 若把高度设成文字行高 22px 会让百分比失准、箭头视觉上偏上。
  return expanded ? <span className="relative block size-[16px] shrink-0"><svg className="absolute inset-[33.8%_23.48%_33.79%_23.48%]" viewBox="0 0 8.48533 5.18533" fill="none" preserveAspectRatio="none"><path d={svgProgress.p33898580} fill="black" fillOpacity="0.38"/></svg></span> : <span className="relative block size-[16px] shrink-0"><svg className="absolute inset-[23.48%_33.8%_23.48%_33.79%]" viewBox="0 0 5.18533 8.48533" fill="none" preserveAspectRatio="none"><path d={svgProgress.p13a1fe00} fill="black" fillOpacity="0.38"/></svg></span>;
}

function ToolLoading({ text }: { text: string }) {
  return <span className="tool-loading inline-block text-[14px] leading-[22px]">
    <style>{`
      .tool-loading{
        color: transparent;
        background-image:
          radial-gradient(closest-side circle at 50% 50%, rgba(0,0,0,0.88) 0%, rgba(0,0,0,0.88) 45%, rgba(0,0,0,0.28) 100%),
          linear-gradient(rgba(0,0,0,0.28), rgba(0,0,0,0.28));
        background-size: 64px 100%, 100% 100%;
        background-repeat: no-repeat, no-repeat;
        background-position: -64px 0, 0 0;
        -webkit-background-clip: text;
        background-clip: text;
        animation: toolScan 1.8s linear infinite;
      }
      @keyframes toolScan{
        from{ background-position: -64px 0, 0 0; }
        to{ background-position: calc(100% + 64px) 0, 0 0; }
      }
    `}</style>
    {text}
  </span>;
}

function Typewriter({ text, speed = 30, className, onDone, instant = false }: { text: string; speed?: number; className?: string; onDone?: () => void; instant?: boolean }) {
  // instant=true：历史消息直接完整显示，不重播打字动画（重新进入会话/切换任务时用）
  const [count, setCount] = useState(instant ? text.length : 0);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;
  useEffect(() => {
    if (instant) {
      setCount(text.length);
      onDoneRef.current?.();
      return;
    }
    setCount(0);
    let i = 0;
    const id = window.setInterval(() => {
      i += 1;
      setCount(i);
      if (i >= text.length) {
        window.clearInterval(id);
        onDoneRef.current?.();
      }
    }, speed);
    return () => window.clearInterval(id);
  }, [text, speed, instant]);
  return <span className={className}>{text.slice(0, count)}</span>;
}

const PROCESS_PRESETS: Record<ProcessVariant, { goal: string; running: string; actions: { label: string; icon: ToolKind }[] }> = {
  requirement: {
    goal: "任务目标：生成符合演示场景、受众与风格要求的 PPT",
    running: "检索资料并梳理制作需求",
    actions: [
      { label: "搜索；检索演示主题相关资料", icon: "search" },
      { label: "读取；加载关键信息", icon: "read" },
      { label: "提取；归纳关键内容", icon: "extract" },
      { label: "分析；提炼内容结构", icon: "analyze" },
      { label: "生成；创建 PPT 制作方案", icon: "generate" },
      { label: "校验；检查内容一致性", icon: "check" },
      { label: "汇总；输出需求确认结果", icon: "summarize" },
    ],
  },
  outline: {
    goal: "任务目标：依据已确认的需求，生成完整的 PPT 大纲",
    running: "拆解需求并编排大纲结构",
    actions: [
      { label: "读取；载入已确认的需求", icon: "read" },
      { label: "搜索；补充章节所需素材", icon: "search" },
      { label: "分析；拆解叙事逻辑与层级", icon: "analyze" },
      { label: "提取；筛选每页核心论点", icon: "extract" },
      { label: "生成；编排页面顺序与标题", icon: "generate" },
      { label: "校验；检查大纲完整性", icon: "check" },
      { label: "汇总；输出大纲确认结果", icon: "summarize" },
    ],
  },
  ppt: {
    goal: "任务目标：依据已确认的大纲，生成可预览的 PPT",
    running: "撰写内容并渲染 PPT 页面",
    actions: [
      { label: "读取；载入已确认的大纲", icon: "read" },
      { label: "生成；撰写每页正文内容", icon: "generate" },
      { label: "分析；匹配版式与配图方案", icon: "analyze" },
      { label: "执行；渲染页面与图表", icon: "execute" },
      { label: "校验；检查排版与一致性", icon: "check" },
      { label: "汇总；输出可预览文件", icon: "summarize" },
    ],
  },
};

function ExecutionProcess({ running, instant = false, progress, onProgress, variant = "requirement", preset: customPreset, onGoalDone }: { running: boolean; instant?: boolean; progress?: { shown: number; batchStart: number }; onProgress?: (p: { shown: number; batchStart: number }) => void; variant?: ProcessVariant; preset?: ProcessPreset; onGoalDone?: () => void }) {
  const preset = customPreset ?? PROCESS_PRESETS[variant];
  const actions = preset.actions;
  const total = actions.length;
  // 恢复用的进度快照（不放进 effect 依赖，避免上报后自我重置）
  const progressRef = useRef(progress);
  progressRef.current = progress;
  const onProgressRef = useRef(onProgress);
  onProgressRef.current = onProgress;
  const [expanded, setExpanded] = useState(Boolean(instant && running));
  const [visibleActions, setVisibleActions] = useState(instant && running ? (progress?.shown ?? total) : 0);
  // index of the first item in the batch that is currently executing
  const [batchStart, setBatchStart] = useState(instant && running ? (progress?.batchStart ?? Math.max(0, (progress?.shown ?? total) - 1)) : 0);
  // becomes true once the goal typewriter has finished for the active run
  const [goalTyped, setGoalTyped] = useState(instant);
  const stepEndRef = useRef<HTMLDivElement>(null);
  const onGoalDoneRef = useRef(onGoalDone);
  onGoalDoneRef.current = onGoalDone;
  // goal 里含完整提问，长提问逐字打要十几秒：按总时长约 2.2s 反推速度，
  // 短文本仍是 30ms/字（原速），长文本加速，避免展开前干等。
  const goalSpeed = Math.min(30, Math.max(5, Math.round(2200 / Math.max(1, preset.goal.length))));

  // 兜底：思考结束切到折叠态时也必须推进消息揭示指针。
  // 长提问的 goal 可能还没打完就被切成折叠（Typewriter 卸载后 onDone 不再触发），
  // 若不推进，后续 AI 回复会被 revealed 机制（i > revealed）永久挡住 → 表现为「执行过程停住」。
  useEffect(() => {
    if (!running) onGoalDoneRef.current?.();
  }, [running]);

  // reset / finalize state whenever the running flag flips
  useEffect(() => {
    if (!running) {
      // execution finished — collapse and show the full step list on demand
      setExpanded(false);
      setVisibleActions(total);
      setBatchStart(total);
      setGoalTyped(false);
      return;
    }
    if (instant) {
      // 历史载入且该任务仍在执行：恢复切走前的步骤进度，
      // 并把最后一批保留为 loading 态，避免重新进入后「工具 loading 消失」。
      const shown = progressRef.current?.shown ?? total;
      setExpanded(true);
      setVisibleActions(shown);
      setBatchStart(progressRef.current?.batchStart ?? Math.max(0, shown - 1));
      setGoalTyped(true);
      return;
    }
    setExpanded(false);
    setVisibleActions(0);
    setBatchStart(0);
    // 历史消息：goal 已视为展示完毕，避免子组件 onDone 先于本 effect 执行后被重置为 false
    setGoalTyped(instant);
  }, [running, total, instant]);

  // 把执行进度回写到消息上，切走任务再回来时能接着显示
  useEffect(() => {
    if (!running || instant) return;
    onProgressRef.current?.({ shown: visibleActions, batchStart });
  }, [running, visibleActions, batchStart, instant]);

  // reveal the tools only after the goal typewriter has actually finished
  useEffect(() => {
    if (!running || !goalTyped) return;
    if (instant) {
      // 历史消息：进度已由上面的 reset effect 恢复，不重播逐批 reveal
      return;
    }
    setExpanded(true);
    let shown = 0;
    let revealTimer: number | undefined;
    // 每次只出现 1 个工具；批间隔 0.9~1.6s，逐个推进但保持节奏。
    const revealBatch = () => {
      const batchSize = 1;
      const start = shown;
      shown = Math.min(total, shown + batchSize);
      setBatchStart(start);
      setVisibleActions(shown);
      if (shown < total) revealTimer = window.setTimeout(revealBatch, 900 + Math.floor(Math.random() * 700));
    };
    revealTimer = window.setTimeout(revealBatch, 320);
    return () => { if (revealTimer) window.clearTimeout(revealTimer); };
  }, [running, goalTyped, total, instant]);

  // keep the newest step in view while the agent is running
  useEffect(() => {
    if (running && visibleActions > 0) {
      stepEndRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [visibleActions, running]);

  if (!running) return (
    <div className="w-full max-w-[768px] flex flex-col gap-[12px]">
      <button onClick={() => setExpanded(v => !v)} className="flex items-center gap-[8px] text-left">
        <span className="text-[14px] leading-[22px] text-[rgba(0,0,0,0.38)] tracking-[0.014px] whitespace-nowrap font-normal">{preset.running}</span>
        <TaskIcon type="chevron" expanded={expanded} />
      </button>
      {expanded && <div className="flex flex-col gap-[12px]">
        <p className="text-[14px] leading-[22px] text-[rgba(0,0,0,0.88)] tracking-[0.014px]">{preset.goal}</p>
        {actions.map(({ label, icon }) => <div key={label} className="flex items-center gap-[8px] text-[14px] leading-[22px] text-[rgba(0,0,0,0.88)] tracking-[0.014px]"><TaskIcon type={icon} /><span>{label}</span></div>)}
      </div>}
    </div>
  );
  return (
    <div className="w-full max-w-[768px] flex flex-col gap-[12px]">
      <p className="text-[14px] leading-[22px] font-normal text-[rgba(0,0,0,0.88)] tracking-[0.014px]"><Typewriter instant={instant} text={preset.goal} speed={goalSpeed} onDone={() => { setGoalTyped(true); onGoalDone?.(); }} /></p>
      {goalTyped && (<>
        <button onClick={() => setExpanded(v => !v)} className="flex items-center gap-[8px] text-left">
          <span className="text-[14px] leading-[22px] text-[rgba(0,0,0,0.38)] tracking-[0.014px] whitespace-nowrap font-normal">{preset.running}</span>
          <TaskIcon type="chevron" expanded={expanded} />
        </button>
        {expanded && <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} transition={{ duration: 0.2, ease: "easeOut" }} className="flex flex-col gap-[12px] overflow-hidden">
          {actions.slice(0, visibleActions).map(({ label, icon }, index) => <motion.div key={label} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.18, ease: "easeOut" }} className="flex items-center gap-[8px] text-[14px] leading-[22px] text-[rgba(0,0,0,0.88)] tracking-[0.014px]">
            {index >= batchStart ? <RadarArcLoader /> : <TaskIcon type={icon} />}
            {index >= batchStart ? <ToolLoading text={`正在${label.split("；")[0]}相关信息`} /> : <span>{label}</span>}
          </motion.div>)}
          <div ref={stepEndRef} aria-hidden className="h-px w-full shrink-0" />
        </motion.div>}
      </>)}
    </div>
  );
}

// once the whole task is done, all stages collapse into a single "任务已完成"
function MergedProcess({ presets }: { presets: ProcessPreset[] }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="w-full max-w-[768px] flex flex-col gap-[12px]">
      <button onClick={() => setExpanded(v => !v)} className="flex items-center gap-[8px] text-left">
        <span className="text-[14px] leading-[22px] text-[rgba(0,0,0,0.38)] tracking-[0.014px] whitespace-nowrap font-normal">任务已完成</span>
        <TaskIcon type="chevron" expanded={expanded} />
      </button>
      {expanded && <div className="flex flex-col gap-[20px]">
        {presets.map((preset, vi) => {
          return (
            <div key={vi} className="flex flex-col gap-[12px]">
              <p className="text-[14px] leading-[22px] text-[rgba(0,0,0,0.38)] tracking-[0.014px] font-normal">{preset.running}</p>
              <p className="text-[14px] leading-[22px] text-[rgba(0,0,0,0.88)] tracking-[0.014px]">{preset.goal}</p>
              {preset.actions.map(({ label, icon }) => <div key={label} className="flex items-center gap-[8px] text-[14px] leading-[22px] text-[rgba(0,0,0,0.88)] tracking-[0.014px]"><TaskIcon type={icon} /><span>{label}</span></div>)}
            </div>
          );
        })}
      </div>}
    </div>
  );
}

export default function App() {
  const isMobile = useIsMobile(800);
  const [mobileNavigationOpen, setMobileNavigationOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [pptGeneration, setPptGeneration] = useState(false);
  const [pptMode, setPptMode] = useState<PptMode>("PowerPoint");
  const [pptPages, setPptPages] = useState<PptPageCount>("智能匹配");
  const [stage, setStage] = useState<PptStage>("idle");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [searchOpen, setSearchOpen] = useState(false);
  const [projectConfigurationOpen, setProjectConfigurationOpen] = useState(true);
  // 项目详情页宽度 < 800px 时进入紧凑布局：右侧「指令 / 成员」边栏收起，内容并入「配置」页签
  const [detailCompact, setDetailCompact] = useState(false);
  const detailContentRef = useRef<HTMLDivElement>(null);
  const [projectListOpen, setProjectListOpen] = useState(false);
  const [automationOpen, setAutomationOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  // 资料库「上传到项目 → 新建项目」唤起同一个创建项目弹窗
  const [libraryCreateProjectOpen, setLibraryCreateProjectOpen] = useState(false);
  // 删除项目统一先弹确认窗（侧栏「···」、项目列表、项目详情、归档页共用）
  const [deleteProjectId, setDeleteProjectId] = useState<number | null>(null);
  // 移交项目统一先弹确认窗（Figma 9244:31238）：由 App 层持有，避免弹窗随操作菜单一起卸载。
  // 侧栏「···」、项目卡片、项目详情、项目列表、归档页五个入口都先走这里，确定后才真正移交。
  const [transferConfirm, setTransferConfirm] = useState<{ projectId: number; member: string } | null>(null);
  const requestTransfer = (projectId: number, member: string) => setTransferConfirm({ projectId, member });
  // 删除任务（会话）统一确认弹窗（Figma 459:38570）
  const [deleteChatTaskId, setDeleteChatTaskId] = useState<number | null>(null);
  const [activeHistoryId, setActiveHistoryId] = useState<number | null>(null);
  const [activeProjectId, setActiveProjectId] = useState<number | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  // 自动化任务由 App 持有：点「创建」会进入新会话，自动化页会卸载，任务不能跟着丢
  const [automationTasks, setAutomationTasks] = useState<AutomationTask[]>(INITIAL_AUTOMATION_TASKS);
  // 任务状态一变，会话里的自动化卡片要跟着变（Figma 9908:45451）：
  // 任务被删 → 卡片留在原地转「已删除」（标题加删除线、不再可点）；暂停/结束同理回写。
  // 列表页、会话详情栏、创建流程三处都改任务，统一从 applyTasks 走，卡片状态就不会漏同步。
  const automationTasksRef = useRef<AutomationTask[]>(automationTasks);
  automationTasksRef.current = automationTasks;
  const applyTasks = (updater: AutomationTask[] | ((current: AutomationTask[]) => AutomationTask[])) => {
    const next = typeof updater === "function" ? updater(automationTasksRef.current) : updater;
    automationTasksRef.current = next;
    setAutomationTasks(next);
    // 卡片可能挂在当前会话（messages）里，也可能躺在其它历史会话（history[].messages）里
    const syncCards = (list: Message[]): Message[] => {
      if (!list.some(message => message.automation)) return list;
      let changed = false;
      const mapped = list.map(message => {
        const card = message.automation;
        if (!card) return message;
        const task = next.find(item => item.id === card.taskId);
        const status = (task ? task.status : "已删除") as AutomationCardStatus;
        if (card.status === status) return message;
        changed = true;
        return { ...message, automation: { ...card, status } };
      });
      return changed ? mapped : list;
    };
    setMessages(syncCards);
    setHistory(current => (
      current.some(item => item.messages.some(message => message.automation))
        ? current.map(item => {
          const messages = syncCards(item.messages);
          return messages === item.messages ? item : { ...item, messages };
        })
        : current
    ));
  };
  // 会话里点自动化卡片 → 打开右侧详情栏（Figma 9787:71282 / 9925:54837）；
  // 宽度、拖拽与铺满断点走统一规则（use-detail-panel-width），与自动化任务页一致
  const [chatAutomationId, setChatAutomationId] = useState<string | null>(null);
  const [projects, setProjects] = useState<ProjectItem[]>([]);

  // TaskPanel（文件导入悬浮面板，9753:63653）：状态提到根组件，切换页面不中断；
  // 记录累加不清空，仅在「项目」「资料库」两个导航内展示
  const [importTasks, setImportTasks] = useState<ImportTask[] | null>(null);
  const [importCollapsed, setImportCollapsed] = useState(false);
  const importTimersRef = useRef<number[]>([]);

  // 导入完成的文件写入该任务的目标项目「来源」；经 ref 转发保证读到最新状态
  const appendImportSources = (files: { name: string; size: number }[], projectId: number) => {
    setProjects(current => current.map(project => {
      if (project.id !== projectId) return project;
      const base = project.files ?? DEMO_PROJECT_FILES;
      return { ...project, files: { ...base, sources: [...base.sources, ...createCloudSourceFiles(files)] } };
    }));
  };
  const appendSourcesRef = useRef(appendImportSources);
  appendSourcesRef.current = appendImportSources;

  // 单个文件延时后标记完成并写入来源
  const scheduleImport = (task: ImportTask, file: { name: string; size: number }, delay: number) => {
    const timer = window.setTimeout(() => {
      importTimersRef.current = importTimersRef.current.filter(item => item !== timer);
      setImportTasks(current => current?.map(item => item.id === task.id ? { ...item, status: "done" } : item) ?? null);
      appendSourcesRef.current([file], task.projectId);
    }, delay);
    importTimersRef.current.push(timer);
  };

  const retryImportTask = (id: string) => {
    const task = importTasks?.find(item => item.id === id);
    if (!task) return;
    setImportTasks(current => current?.map(item => item.id === id ? { ...item, status: "uploading", failKind: undefined } : item) ?? null);
    scheduleImport(task, { name: task.name, size: task.size }, 1500);
  };

  const retryFailedImports = () => {
    const failed = (importTasks ?? []).filter(item => item.status === "failed");
    if (!failed.length) return;
    setImportTasks(current => current?.map(item => item.status === "failed" ? { ...item, status: "uploading", failKind: undefined } : item) ?? null);
    failed.forEach((task, index) => scheduleImport(task, { name: task.name, size: task.size }, 1200 + index * 500));
  };

  const startFileImport = (files: { name: string; size: number }[], source: CloudSourceTab, projectId: number) => {
    const badge = source === "OneDrive" ? "/assets/badge-onedrive.svg"
      : source === "SharePoint" ? "/assets/badge-sharepoint.svg"
      : undefined;
    // 演示两种失败态（9544:34251）：第 2 个解析失败、第 4 个上传失败，其余依次上传完成
    const tasks: ImportTask[] = files.map((file, index) => {
      const failed = index === 1
        ? { status: "failed" as const, failKind: "parse" as const }
        : index === 3 ? { status: "failed" as const, failKind: "upload" as const } : null;
      return {
        id: `import-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 7)}`,
        name: file.name,
        size: file.size,
        projectId,
        ...(badge ? { badge } : {}),
        ...(failed ?? { status: "uploading" as const }),
      };
    });
    setImportCollapsed(false);
    // 记录累加：新批次追加在已有记录之后，不覆盖上一批（面板关闭时为 null，等同新建列表）
    setImportTasks(current => [...(current ?? []), ...tasks]);
    tasks.forEach((task, index) => {
      if (task.status !== "uploading") return;
      scheduleImport(task, files[index], 1200 + index * 600);
    });
    const okCount = tasks.filter(task => task.status !== "failed").length;
    const finishTimer = window.setTimeout(() => {
      importTimersRef.current = importTimersRef.current.filter(item => item !== finishTimer);
      if (okCount) toast.success(`已添加 ${okCount} 个文件到来源`);
    }, 1200 + files.length * 600 + 120);
    importTimersRef.current.push(finishTimer);
  };

  useEffect(() => () => {
    importTimersRef.current.forEach(timer => window.clearTimeout(timer));
    importTimersRef.current = [];
  }, []);
  const nextHistoryId = useRef(1);
  const activeRunId = useRef(0);
  // 记录每个会话最新的运行 id：切到别的任务时，原任务的后台流程仍可继续推进，
  // 只有当同一会话里又发起了新一轮运行时才作废旧的那一轮。
  const runIdByConversation = useRef(new Map<number, number>());
  // setTimeout 回调里读最新会话 id（state 会过期）
  const activeHistoryIdRef = useRef<number | null>(null);
  activeHistoryIdRef.current = activeHistoryId;
  // 当前会话的消息实时回写历史条目。
  // 之前只有「切走后由后台回调 applyToConversation 写入」才同步，历史条目的 messages 常年为空：
  // 切换任务会丢内容，迟到的异步结果还会被追加到别的会话上（任务串台）。
  const messagesOwnerRef = useRef<number | null>(null);
  useEffect(() => { messagesOwnerRef.current = activeHistoryId; }, [activeHistoryId]);
  useEffect(() => {
    const owner = messagesOwnerRef.current;
    if (owner === null) return;
    setHistory(h => {
      let changed = false;
      const next = h.map(item => {
        if (item.id !== owner || item.messages === messages) return item;
        changed = true;
        return { ...item, messages };
      });
      return changed ? next : h;
    });
  }, [messages]);
  const [attachments, setAttachments] = useState<ChatAttachment[]>([]);
  const attachmentsRef = useRef<ChatAttachment[]>([]);
  const uploadTimers = useRef(new Map<string, number>());
  const [dragActive, setDragActive] = useState(false);
  const dragDepth = useRef(0);

  // 详情页基准取「左侧主内容区」宽度（不含右侧配置边栏）：
  // 主内容区 = 页面宽 − 左右内边距 32 − 与边栏的间距 16 − 边栏 320；
  // 主内容区 < 800px 时右侧边栏不再常驻，「指令 / 成员」并入「配置」页签。
  // 用固定基准（始终按边栏常驻计算）而非实测主列，避免收起边栏后宽度反增导致反复切换。
  useLayoutEffect(() => {
    const element = detailContentRef.current;
    if (!element) return;
    const update = () => setDetailCompact(element.clientWidth - 368 < 800);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const replaceAttachments = useCallback((next: ChatAttachment[]) => {
    attachmentsRef.current = next;
    setAttachments(next);
  }, []);

  const clearDraftAttachments = useCallback((revokePreviews: boolean) => {
    uploadTimers.current.forEach(timer => window.clearTimeout(timer));
    uploadTimers.current.clear();
    if (revokePreviews) {
      attachmentsRef.current.forEach(attachment => {
        if (attachment.previewUrl) URL.revokeObjectURL(attachment.previewUrl);
      });
    }
    replaceAttachments([]);
  }, [replaceAttachments]);

  const handleRemoveAttachment = useCallback((id: string) => {
    const timer = uploadTimers.current.get(id);
    if (timer) window.clearTimeout(timer);
    uploadTimers.current.delete(id);
    const attachment = attachmentsRef.current.find(item => item.id === id);
    if (attachment?.previewUrl) URL.revokeObjectURL(attachment.previewUrl);
    replaceAttachments(attachmentsRef.current.filter(item => item.id !== id));
  }, [replaceAttachments]);

  const handleAddFiles = useCallback((files: File[]) => {
    const accepted: File[] = [];
    let unsupportedCount = 0;
    let oversizedCount = 0;
    let emptyCount = 0;
    let overLimitCount = 0;

    files.forEach(file => {
      const virtual = readVirtualFile(file);
      if (virtual) {
        // 云盘站点/文件夹等虚拟条目：无真实内容，跳过格式/大小校验，单独构造 ready 附件
        return;
      }
      const validationError = getAttachmentValidationError(file);
      if (validationError === "format") {
        unsupportedCount += 1;
      } else if (validationError === "size") {
        oversizedCount += 1;
      } else if (validationError === "empty") {
        emptyCount += 1;
      } else if (attachmentsRef.current.length + accepted.length >= MAX_ATTACHMENTS) {
        overLimitCount += 1;
      } else {
        accepted.push(file);
      }
    });

    if (unsupportedCount) toast.error(`${unsupportedCount} 个文件的格式不支持`);
    if (oversizedCount) toast.error(`${oversizedCount} 个文件超过大小限制`);
    if (emptyCount) toast.error(`${emptyCount} 个空文件无法上传`);
    if (overLimitCount) toast.error(`最多上传 ${MAX_ATTACHMENTS} 个文件`);

    const added = accepted.map((file, index): ChatAttachment => {
      const extension = getAttachmentExtension(file.name);
      const image = ["png", "jpg", "jpeg"].includes(extension);
      const meta = readFileMeta(file);
      return {
        id: `${Date.now()}-${index}-${Math.random().toString(36).slice(2)}`,
        file,
        name: file.name,
        size: file.size,
        extension,
        image,
        ...(image ? { previewUrl: URL.createObjectURL(file) } : {}),
        status: "uploading",
        // 来源角标 / 自定义副标题（Outlook 邮件副标题=发件人）
        ...(meta?.badge ? { badge: meta.badge } : {}),
        ...(meta?.subtitle ? { subtitle: meta.subtitle } : {}),
      };
    });

    // 虚拟条目（站点/文件夹）：直接 ready，带自定义图标与副标题
    const virtuals = files.flatMap((file, index): ChatAttachment[] => {
      const virtual = readVirtualFile(file);
      if (!virtual) return [];
      // 去重：同名已存在则不再添加
      if (attachmentsRef.current.some(item => item.name === file.name)) return [];
      if (attachmentsRef.current.length + added.length >= MAX_ATTACHMENTS) return [];
      const extension = getAttachmentExtension(file.name);
      return [{
        id: `virtual-${Date.now()}-${index}-${Math.random().toString(36).slice(2)}`,
        file,
        name: file.name,
        size: file.size,
        extension,
        image: false,
        status: "ready",
        icon: virtual.icon,
        subtitle: virtual.subtitle,
        ...(virtual.badge ? { badge: virtual.badge } : {}),
      }];
    });

    const next = [...added, ...virtuals];
    if (!next.length) return;
    replaceAttachments([...attachmentsRef.current, ...next]);

    added.forEach(attachment => {
      const markProcessing = window.setTimeout(() => {
        uploadTimers.current.delete(attachment.id);
        replaceAttachments(attachmentsRef.current.map(item => (
          item.id === attachment.id ? { ...item, status: "processing" } : item
        )));
        const markReady = window.setTimeout(() => {
          uploadTimers.current.delete(attachment.id);
          replaceAttachments(attachmentsRef.current.map(item => (
            item.id === attachment.id ? { ...item, status: "ready" } : item
          )));
        }, 500);
        uploadTimers.current.set(attachment.id, markReady);
      }, 500);
      uploadTimers.current.set(attachment.id, markProcessing);
    });
  }, [replaceAttachments]);

  useEffect(() => () => {
    uploadTimers.current.forEach(timer => window.clearTimeout(timer));
  }, []);

  useEffect(() => {
    if (!isMobile) setMobileNavigationOpen(false);
  }, [isMobile]);

  // 详情栏是「内容 320 + 详情 320」的双栏：再加 240 导航共需 880。
  // 窗口窄于 880 时先自动收起左侧导航（腾出 240，两栏都保住 320），而不是把两栏压窄
  // —— 自动化任务页的列表详情、会话页的会话详情都按这条走；
  // 窗口变宽或关掉详情栏时，把自己收起的那一次还原（用户手动收起的保持不动）。
  const sidebarOpenRef = useRef(sidebarOpen);
  sidebarOpenRef.current = sidebarOpen;
  const autoCollapsedNav = useRef(false);
  useEffect(() => {
    if (isMobile) return;
    const narrow = window.matchMedia("(max-width: 879px)");
    const sync = () => {
      if ((automationOpen || chatAutomationId !== null) && narrow.matches) {
        if (sidebarOpenRef.current) {
          autoCollapsedNav.current = true;
          setSidebarOpen(false);
        }
        return;
      }
      if (autoCollapsedNav.current) {
        autoCollapsedNav.current = false;
        setSidebarOpen(true);
      }
    };
    sync();
    narrow.addEventListener("change", sync);
    return () => narrow.removeEventListener("change", sync);
  }, [isMobile, automationOpen, chatAutomationId]);

  const resetPptFlow = useCallback(() => setStage("idle"), []);

  // keep the active conversation's transcript in sync with the history list
  useEffect(() => {
    if (activeHistoryId === null) return;
    setHistory(h => h.map(i => (i.id === activeHistoryId ? { ...i, messages } : i)));
  }, [messages, activeHistoryId]);

  // deleting the open conversation returns to the home view
  useEffect(() => {
    if (activeHistoryId !== null && !history.some(i => i.id === activeHistoryId)) {
      setActiveHistoryId(null);
      setMessages([]);
      setStage("idle");
    }
  }, [history, activeHistoryId]);

  useEffect(() => {
    if (selectedProjectId !== null && !projects.some(project => project.id === selectedProjectId)) {
      setSelectedProjectId(null);
    }
  }, [projects, selectedProjectId]);

  const activeTaskProjectId = history.find(item => item.id === activeHistoryId)?.projectId;
  useEffect(() => {
    if (activeHistoryId === null || !history.some(item => item.id === activeHistoryId)) return;
    setActiveProjectId(activeTaskProjectId ?? null);
  }, [activeHistoryId, activeTaskProjectId]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSelectHistory = (id: number) => {
    const item = history.find(i => i.id === id);
    if (!item) return;
    setMobileNavigationOpen(false);
    setStage("idle");
    setProjectListOpen(false);
    setAutomationOpen(false);
    setLibraryOpen(false);
    clearDraftAttachments(true);
    setInput("");
    setActiveHistoryId(id);
    setActiveProjectId(item.projectId ?? null);
    setSelectedProjectId(null);
    // 从历史载入的消息打上 instant 标记：直接完整显示，不重播打字动画
    setMessages(item.messages.map(m => ({ ...m, instant: true })));
  };

  // 把一次更新写回指定会话：当前正在看的就是 setMessages，否则写进历史列表，
  // 保证切走的任务在后台继续推进（进度、完成态都不丢）。
  const applyToConversation = (conversationId: number, updater: (list: Message[]) => Message[]) => {
    if (activeHistoryIdRef.current === conversationId) {
      setMessages(updater);
    } else {
      setHistory(h => h.map(i => (i.id === conversationId ? { ...i, messages: updater(i.messages) } : i)));
    }
  };

  // 执行过程把已展开的步骤数回写到消息上：切走再回来能续上，工具 loading 态不会丢
  const handleProcessProgress = (index: number, progress: { shown: number; batchStart: number }) => {
    setMessages(prev => prev.map((m, i) => (i === index ? { ...m, progress } : m)));
  };

  const handleSelectProject = (id: number) => {
    setMobileNavigationOpen(false);
    activeRunId.current += 1;
    setMessages([]);
    clearDraftAttachments(true);
    setInput("");
    setPptGeneration(false);
    setStage("idle");
    setProjectListOpen(false);
    setAutomationOpen(false);
    setLibraryOpen(false);
    setActiveHistoryId(null);
    setActiveProjectId(id);
    setSelectedProjectId(null);
  };

  // 用户消息操作项回调（Figma 9369:50206）：编辑回填输入框、删除消息、失败重试重新发送
  const handleEditMessage = (index: number) => {
    const msg = messages[index];
    if (msg?.role === "user") setInput(msg.text);
  };
  const handleDeleteMessage = (index: number) => {
    const target = messages[index];
    setMessages(prev => prev.filter((_, i) => i !== index));
    if (target?.role === "process" || target?.role === "result") {
      activeRunId.current++;
      // 删掉正在执行的步骤：作废该会话的后台流程，避免回调又把消息补回来
      if (activeHistoryId !== null) runIdByConversation.current.delete(activeHistoryId);
    }
  };
  const handleRetryMessage = (index: number) => {
    const target = messages[index];
    if (!target || target.role !== "user") return;
    setMessages(prev => prev.map((m, i) => i === index ? { ...m, sendState: undefined } : m));
    // 重试即重新走一次发送流程（去掉「模拟失败」前缀后作为真实提问）
    const retryText = target.text.replace(/模拟失败|模拟提示/g, "").trim() || "找出近一周的邮件";
    window.setTimeout(() => handleSend(retryText, target.attachments), 0);
  };

  const handleSend = (suggestion?: string, sentAttachments: ChatAttachment[] = [], options?: { automationRun?: boolean }) => {
    const text = (suggestion ?? input).trim();
    if (!text) return;
    if (sentAttachments.some(attachment => attachment.status !== "ready")) return;
    const targetProjectId = activeProjectId ?? selectedProjectId;
    const shouldGeneratePpt = pptGeneration || isPPTIntent(text);
    const runId = ++activeRunId.current;
    setInput("");
    clearDraftAttachments(false);
    setPptGeneration(false);
    // 「创建自动化任务」→ 直接进自动化创建流程（与自动化页「创建」同一链路），
    // 周期条件从文案里解析；任务结果回写本会话（不另开新会话）。
    // automationRun：自动化任务「立即执行」发的消息 —— 任务文案里常带「创建自动化任务」字样，
    // 不能再被意图识别拦回去重新创建，必须当普通消息执行。
    if (!options?.automationRun && isAutomationIntent(text)) {
      const parsed = parseAutomationSchedule(text);
      handleLaunchAutomationChat({ schedule: parsed.schedule, prompt: text, newSessionEachRun: false, title: parsed.title, goal: parsed.goal });
      return;
    }
    const historyTitle = text || sentAttachments[0]?.name || "附件会话";
    // create a history entry when starting a brand-new conversation
    const isNewConversation = activeHistoryId === null;
    let conversationId = activeHistoryId;
    if (conversationId === null) {
      conversationId = nextHistoryId.current++;
      setHistory(h => [{ id: conversationId as number, title: historyTitle.slice(0, 20), createdAt: Date.now(), messages: [], ...(targetProjectId !== null ? { projectId: targetProjectId } : {}) }, ...h]);
      setActiveHistoryId(conversationId);
      setActiveProjectId(targetProjectId);
    }
    const convId = conversationId;
    // 该会话的最新运行轮次：切到别的任务不会作废它，只有本会话再发新一轮才会
    runIdByConversation.current.set(convId, runId);
    setSelectedProjectId(null);
    // 演示入口（Figma 9369:50206 用户消息变体）：
    //   「模拟失败」→ 红色感叹号 + 发送失败/重试；「模拟提示」→ info 图标。
    // 二者作为独立消息展示，不进入 AI 流程；其余普通提问保持原样。
    const demoState: Message["sendState"] = text.includes("模拟失败") ? "failed" : text.includes("模拟提示") ? "info" : undefined;
    // 新一轮消息进来前，先把之前的消息标记成「历史态」（instant）：
    // 旧回答不该再播一次打字 / 卡片入场，否则新消息一落地，上面的 AI 回复看起来像重新加载了一遍。
    // 仍在执行中的 process（thinking）跳过，避免把它切成"恢复进度"态。
    const freezePrevious = (list: Message[]): Message[] => list.map(m => (
      m.instant || (m.role === "process" && m.thinking) ? m : { ...m, instant: true }
    ));
    if (demoState) {
      const appendUser: (list: Message[]) => Message[] = prev => [...freezePrevious(prev), { role: "user", text, attachments: sentAttachments, sendState: demoState }];
      if (isNewConversation) setMessages(appendUser); else applyToConversation(convId, appendUser);
      return;
    }
    const processText = text || "处理上传的文件";
    const initialProcess: Message = shouldGeneratePpt
      ? { role: "process", text: "", thinking: true, variant: "requirement" }
      : { role: "process", text: "", thinking: true, variant: "requirement", preset: buildQueryProcess(processText) };
    {
      const appendRun: (list: Message[]) => Message[] = prev => [...freezePrevious(prev), { role: "user", text, attachments: sentAttachments }, initialProcess];
      if (isNewConversation) setMessages(appendRun); else applyToConversation(convId, appendRun);
    }

    // AI returns summary first
    setTimeout(() => {
      if (runIdByConversation.current.get(convId) !== runId) return;
      if (shouldGeneratePpt) {
        applyToConversation(convId, prev => {
          const next = [...prev];
          const idx = next.findLastIndex(m => m.role === "process" && m.thinking);
          if (idx !== -1) next[idx] = { ...next[idx], thinking: false };
          next.push({ role: "ai", text: "好的，我来帮您生成PPT。需要先确认演示场景、受众、页数和风格，以便提供针对性的内容结构。", followUps: DEFAULT_FOLLOW_UPS });
          return next;
        });
        // panel appears after AI summary is shown
        setTimeout(() => { if (activeHistoryIdRef.current === convId && runIdByConversation.current.get(convId) === runId) setStage("requirement"); }, 400);
      } else {
        applyToConversation(convId, prev => {
          const next = [...prev];
          const idx = next.findLastIndex(m => m.role === "process" && m.thinking);
          if (idx !== -1) next[idx] = { ...next[idx], thinking: false };
          const artifacts = buildTaskArtifacts(processText);
          next.push(artifacts.length ? { role: "ai", text: "帮您整理好了", artifacts, followUps: DEFAULT_FOLLOW_UPS } : { role: "ai", text: "好的，我来帮您处理这个请求。", followUps: DEFAULT_FOLLOW_UPS });
          return next;
        });
      }
    }, 15000);
  };

  const handleRequirementConfirm = () => {
    const runId = ++activeRunId.current;
    const convId = activeHistoryIdRef.current;
    setStage("outline_generating");
    setMessages(prev => [...prev, { role: "process", text: "", thinking: true, variant: "outline" }]);
    setTimeout(() => {
      if (activeRunId.current !== runId || convId === null) return;
      applyToConversation(convId, prev => {
        const next = [...prev];
        const idx = next.findLastIndex(m => m.role === "process" && m.thinking);
        if (idx !== -1) next[idx] = { ...next[idx], thinking: false };
        next.push({ role: "ai", text: "需求已确认，大纲生成完成，请确认以下结构。", followUps: DEFAULT_FOLLOW_UPS });
        return next;
      });
      setTimeout(() => { if (activeRunId.current === runId) setStage("outline"); }, 400);
    }, 24000);
  };

  const handleOutlineConfirm = () => {
    const runId = ++activeRunId.current;
    const convId = activeHistoryIdRef.current;
    setStage("ppt_generating");
    setMessages(prev => [...prev, { role: "process", text: "", thinking: true, variant: "ppt" }]);
    setTimeout(() => {
      if (activeRunId.current !== runId || convId === null) return;
      applyToConversation(convId, prev => {
        const next = [...prev];
        const idx = next.findLastIndex(m => m.role === "process" && m.thinking);
        if (idx !== -1) next[idx] = { ...next[idx], thinking: false };
        next.push({ role: "result", text: "", artifacts: [{ id: `${Date.now()}-pptx`, name: PPT_ARTIFACT_NAME, extension: "pptx", size: "12.6M" }] });
        return next;
      });
      setTimeout(() => { if (activeRunId.current === runId) setStage("preview"); }, 400);
    }, 20000);
  };

  const handleStop = () => {
    activeRunId.current += 1;
    setStage("idle");
    setMessages(prev => prev.map(message => message.role === "process" && message.thinking ? { ...message, thinking: false } : message));
  };

  const handleNewChat = () => {
    setMobileNavigationOpen(false);
    activeRunId.current += 1;
    setMessages([]);
    clearDraftAttachments(true);
    setInput("");
    setPptGeneration(false);
    setPptMode("PowerPoint");
    setPptPages("智能匹配");
    setStage("idle");
    setProjectListOpen(false);
    setAutomationOpen(false);
    setArchiveOpen(false);
    setLibraryOpen(false);
    setActiveHistoryId(null);
    setActiveProjectId(null);
    setSelectedProjectId(null);
  };
  const handleAddLibraryFileToTask = (file: { id: string; name: string; size: string; extension?: string }) => {
    handleNewChat();
    const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
    const size = parseFileSize(file.size);
    const image = ["png", "jpg", "jpeg"].includes(extension);
    const fakeFile = new File([new Uint8Array(Math.min(size, 1024))], file.name, { type: image ? `image/${extension}` : "application/octet-stream" });
    Object.defineProperty(fakeFile, "size", { value: size });
    const attachment: ChatAttachment = {
      id: `library-${Date.now()}-${file.id}`,
      file: fakeFile,
      name: file.name,
      size,
      extension,
      image,
      status: "ready",
    };
    replaceAttachments([attachment]);
  };
  const handleOpenProjects = () => {
    setMobileNavigationOpen(false);
    activeRunId.current += 1;
    setMessages([]);
    clearDraftAttachments(true);
    setInput("");
    setPptGeneration(false);
    setStage("idle");
    setProjectListOpen(true);
    setAutomationOpen(false);
    setArchiveOpen(false);
    setLibraryOpen(false);
    setActiveHistoryId(null);
    setActiveProjectId(null);
    setSelectedProjectId(null);
  };
  // 「立即执行」复用真实发送流程：handleSend 每次渲染重建，用 ref 拿最新一份，
  // 避免切换会话后闭包里的 activeHistoryId 还是旧值
  const sendRunRef = useRef<(text?: string, attachments?: ChatAttachment[], options?: { automationRun?: boolean }) => void>(() => {});
  sendRunRef.current = handleSend;
  // 新建自动化任务弹窗点「创建」：不是直接往列表塞一条，而是发起一个新会话（任务），
  // 由 AI 承接并完成创建。排期条件转成自然语言写进 AI 的过程与回复里。
  const handleLaunchAutomationChat = ({ schedule, prompt, attachments, newSessionEachRun, title: titleOverride, goal: goalOverride }: { schedule: ScheduleState; prompt: string; attachments?: ChatAttachment[]; newSessionEachRun: boolean; title?: string; goal?: string }) => {
    const summary = summarizeSchedule(schedule);
    const when = describeSchedule(schedule);
    const title = titleOverride?.trim() || prompt.split("\n")[0].trim() || "未命名自动化任务";
    // 「就」的内容：卡片副标题与任务详情用；从聊天文案进来时已剥掉「创建…／每天…」这类前缀
    const goal = goalOverride?.trim() || prompt;
    const runId = ++activeRunId.current;
    const taskId = `automation-${Date.now()}`;
    // 图标不写死：按标题 + 「就」的内容去图标词表里分词匹配（icons.kubai.design）
    const icon = resolveAutomationIcon(`${title} ${goal}`);

    // 离开自动化页 → 新会话
    setMobileNavigationOpen(false);
    setAutomationOpen(false);
    setProjectListOpen(false);
    setArchiveOpen(false);
    setLibraryOpen(false);
    setSelectedProjectId(null);
    setActiveProjectId(null);
    // 附件交给了新会话与新建的任务：预览地址要继续用，不能回收
    clearDraftAttachments(!attachments?.length);
    setInput("");
    setPptGeneration(false);
    setStage("idle");

    const id = nextHistoryId.current++;
    setHistory(h => [{ id, title: title.slice(0, 20), createdAt: Date.now(), messages: [] }, ...h]);
    setActiveHistoryId(id);
    setMessages([
      { role: "user", text: prompt, ...(attachments?.length ? { attachments } : {}) },
      {
        role: "process",
        text: "",
        thinking: true,
        variant: "requirement",
        preset: {
          goal: "好的，我来帮你创建这个自动化任务",
          running: "正在创建自动化任务",
          actions: [
            { label: `读取；识别执行时间「${when}」`, icon: "read" },
            { label: "生成；创建自动化任务", icon: "generate" },
            { label: "校验；校验配置并启用任务", icon: "check" },
          ],
        },
      },
    ]);

    // AI「创建完成」：任务才真正落到「自动化任务」列表（本地模拟，后续可换真实 Agent）
    runIdByConversation.current.set(id, runId);
    window.setTimeout(() => {
      if (runIdByConversation.current.get(id) !== runId) return;
      // 结果按会话写回：用户可能已经切回别的任务，直接 setMessages 会把结果追加到别人的会话里
      applyToConversation(id, prev => {
        const next = [...prev];
        const index = next.findLastIndex(message => message.role === "process" && message.thinking);
        if (index !== -1) next[index] = { ...next[index], thinking: false };
        next.push({
          role: "ai",
          text: `已创建自动化任务「${title}」，${when} 自动执行。\n任务已启用，你可以在「自动化任务」里暂停、修改或查看执行记录。`,
          // 卡片就展示在回复下方，点它打开右侧详情（Figma 9925:54837）
          automation: { taskId, title, cycle: summary.cycle, description: summary.description, icon, status: "已启用", schedule, prompt: goal },
          // 卡片下方的延展问题（Figma 9925:54837「延展问题」模块）
          followUps: [
            "这个任务的执行记录在哪里查看？",
            "把执行时间改成每天 09:00",
            "给这个任务设置一个结束时间",
          ],
        });
        return next;
      });
      applyTasks(current => [
        {
          id: taskId,
          title,
          cycle: summary.cycle,
          description: summary.description,
          status: "已启用",
          schedule,
          prompt: goal,
          icon,
          // 运行记录先铺一组示例（Figma 9908:45451），「立即执行」会再插新的；
          // 带上创建会话 id：这些记录点图钉时也能跳回本对话
          records: buildRunRecords(goal, schedule.time, id),
          // 执行方式：勾选了「每次执行都开启新会话」→ 每次执行开新对话；
          // 否则写回本会话（sourceConversationId）。会话被删时当次执行也开新对话。
          newSessionEachRun,
          sourceConversationId: id,
          ...(attachments?.length ? { attachments } : {}),
        },
        ...current,
      ]);
    }, 6200);
  };

  // 「立即执行」= 把任务内容当作一条消息发进落点会话，走真实的执行流程（发送 → 过程 → 回复），
  // 不是再生成一张任务卡片。落点由执行方式决定：
  //   勾选「每次执行都开启新会话」→ 每次执行都新开一个对话；
  //   未勾选 → 写回创建本任务的会话（sourceConversationId）；
  //   未勾选但那个会话已被删除 → 当次也新开一个对话兜底。
  // 执行时会切到落点会话，直观看到任务真的跑了起来。
  const handleRunAutomationTask = (task: AutomationTask) => {
    const gotoConversation = (id: number) => {
      setMobileNavigationOpen(false);
      setStage("idle");
      setProjectListOpen(false);
      setAutomationOpen(false);
      setArchiveOpen(false);
      setLibraryOpen(false);
      clearDraftAttachments(true);
      setInput("");
      setActiveProjectId(history.find(i => i.id === id)?.projectId ?? null);
      setSelectedProjectId(null);
      setActiveHistoryId(id);
    };
    const sourceExists = task.sourceConversationId !== undefined && history.some(item => item.id === task.sourceConversationId);
    // 这次执行落在哪个对话的第几条消息：运行记录要记下来，图钉才能定位回去
    let runConversationId: number;
    let runMessageIndex: number;
    if (!task.newSessionEachRun && sourceExists && task.sourceConversationId !== undefined) {
      const convId = task.sourceConversationId;
      runConversationId = convId;
      const base = activeHistoryIdRef.current === convId ? messages : (history.find(i => i.id === convId)?.messages ?? []);
      // 发送后追加的那条用户消息的位置
      runMessageIndex = base.length;
      if (activeHistoryIdRef.current !== convId) {
        // 切到创建会话：已有消息按历史处理（instant 不重播动画），任务消息接着往下发
        gotoConversation(convId);
        setMessages(base.map(m => ({ ...m, instant: true })));
      }
      // 正在看的就是创建会话：什么都不用动，消息直接续在后面
    } else {
      // 新开一个对话：标题取任务名，任务内容将作为首条消息发出
      const id = nextHistoryId.current++;
      runConversationId = id;
      runMessageIndex = 0;
      setHistory(h => [{ id, title: task.title.slice(0, 20), createdAt: Date.now(), messages: [] }, ...h]);
      gotoConversation(id);
      setActiveProjectId(null);
      setMessages([]);
    }
    applyTasks(current => current.map(item => item.id === task.id
      ? {
        ...item,
        records: [makeRunRecord(item.prompt, runConversationId, runMessageIndex), ...(item.records ?? [])],
        status: item.schedule.cycle === "仅一次" ? "已结束" : item.status,
      }
      : item));
    toast.success("任务已开始执行", { id: "automation-task-status" });
    // 等上面的切换（activeHistoryId）提交后再走真实发送流程；
    // automationRun：跳过「创建自动化任务」意图识别（任务文案常含「创建」字样，不能又被拦去新建）；
    // 附件随任务一起发出去：任务「就」里挂的文件就是这次执行的输入
    window.setTimeout(() => sendRunRef.current(task.prompt, task.attachments ?? [], { automationRun: true }), 80);
  };

  // 运行记录右侧图钉：定位到这次执行所在的对话消息。
  // 边界情况：所属对话（任务）已被删除 → 不跳转，toast 提示该任务已删除。
  const handleLocateRunRecord = (task: AutomationTask, record: RunRecord) => {
    const conversationId = record.conversationId ?? task.sourceConversationId;
    const target = conversationId !== undefined ? history.find(item => item.id === conversationId) : undefined;
    if (!target) {
      toast.error("该任务已删除", { id: "automation-locate" });
      return;
    }
    setMobileNavigationOpen(false);
    setStage("idle");
    setProjectListOpen(false);
    setAutomationOpen(false);
    setArchiveOpen(false);
    setLibraryOpen(false);
    setChatAutomationId(null);
    clearDraftAttachments(true);
    setInput("");
    setSelectedProjectId(null);
    setActiveProjectId(target.projectId ?? null);
    setActiveHistoryId(target.id);
    setMessages(target.messages.map(m => ({ ...m, instant: true })));
    // 等会话渲染完再滚过去：优先按记录里的消息位置，找不到再退回「含该任务卡片 / 任务文案的最后一条」
    window.setTimeout(() => {
      const rows = [...document.querySelectorAll<HTMLElement>("[data-message-index]")];
      const byIndex = record.messageIndex !== undefined
        ? rows.find(el => Number(el.dataset.messageIndex) === record.messageIndex) ?? rows[record.messageIndex]
        : undefined;
      const fallback = [...rows].reverse().find(el => (
        el.querySelector(`[data-automation-card="${task.id}"]`) || el.innerText.includes(task.prompt.slice(0, 10))
      ));
      const node = byIndex ?? fallback;
      if (!node) return;
      node.scrollIntoView({ behavior: "smooth", block: "center" });
      node.animate(
        [{ backgroundColor: "rgba(30,99,245,0.10)" }, { backgroundColor: "rgba(30,99,245,0)" }],
        { duration: 1600, easing: "ease-out" },
      );
    }, 260);
  };

  // Figma 9625:49728：左侧导航「自动化任务」→ 自动化任务页（与项目页互斥，复用同一套组件/响应式）
  const handleOpenAutomation = () => {
    setMobileNavigationOpen(false);
    activeRunId.current += 1;
    setMessages([]);
    clearDraftAttachments(true);
    setInput("");
    setPptGeneration(false);
    setStage("idle");
    setProjectListOpen(false);
    setAutomationOpen(true);
    setArchiveOpen(false);
    setLibraryOpen(false);
    setActiveHistoryId(null);
    setActiveProjectId(null);
    setSelectedProjectId(null);
  };
  // Figma 9446:47192 / 9423:124200 / 9638:46195：头像菜单「归档数据」→ 归档页（任务/项目两个 tab）
  const handleOpenArchive = () => {
    setMobileNavigationOpen(false);
    activeRunId.current += 1;
    setMessages([]);
    clearDraftAttachments(true);
    setInput("");
    setPptGeneration(false);
    setStage("idle");
    setProjectListOpen(false);
    setAutomationOpen(false);
    setArchiveOpen(true);
    setLibraryOpen(false);
    setActiveHistoryId(null);
    setActiveProjectId(null);
    setSelectedProjectId(null);
  };
  const handleOpenLibrary = () => {
    handleNewChat();
    setLibraryOpen(true);
  };
  const handleNewProjectTask = (projectId: number) => {
    handleNewChat();
    setSelectedProjectId(projectId);
  };
  const firstMessageTitle = messages[0]?.text || messages[0]?.attachments?.[0]?.name || "新对话";
  const chatTitle = messages.length > 0
    ? firstMessageTitle.slice(0, 20) + (firstMessageTitle.length > 20 ? "…" : "")
    : undefined;
  const activeProject = projects.find(project => project.id === activeProjectId) ?? null;
  const activeTask = history.find(item => item.id === activeHistoryId) ?? null;

  // 删除项目：所有入口（侧栏「···」、项目列表卡片、项目详情、归档页）先弹确认窗，
  // 点「确定」才真正删除项目与项目内任务，并 toast「删除成功」
  const handleRequestDeleteProject = (id: number) => setDeleteProjectId(id);
  const handleConfirmDeleteProject = () => {
    if (deleteProjectId === null) return;
    const id = deleteProjectId;
    setDeleteProjectId(null);
    setProjects(current => current.filter(project => project.id !== id));
    setHistory(current => current.filter(task => task.projectId !== id));
    // 删的是当前打开的项目 → 退回项目列表，避免停留在已删除的项目页
    if (activeProjectId === id) handleOpenProjects();
    toast.success("删除成功");
  };

  // 删除任务（会话）：侧栏「···」、归档页、项目详情三处入口都先弹确认窗（Figma 459:38570），
  // 点「确定」才真正从历史里移除；删的是当前打开的会话时退回空白新会话
  const handleRequestDeleteChatTask = (id: number) => setDeleteChatTaskId(id);
  const handleConfirmDeleteChatTask = () => {
    if (deleteChatTaskId === null) return;
    const id = deleteChatTaskId;
    setDeleteChatTaskId(null);
    setHistory(current => current.filter(task => task.id !== id));
    if (activeHistoryId === id) {
      // 作废这条会话还在跑的后台流程，再清空会话区，避免停留在已删除的任务里
      activeRunId.current += 1;
      runIdByConversation.current.delete(id);
      setMessages([]);
      setActiveHistoryId(null);
      setChatAutomationId(null);
    }
  };

  // 会话页右侧自动化详情栏：只在会话视图里生效（切走/新建会话自动收起）
  const chatAutomationTask = chatAutomationId && messages.length > 0 && !automationOpen && !libraryOpen && !archiveOpen && !projectListOpen
    ? automationTasks.find(task => task.id === chatAutomationId) ?? null
    : null;

  useEffect(() => { setChatAutomationId(null); }, [activeHistoryId]);

  // 会话页详情栏的删除确认（与自动化任务页同款弹窗，Figma 9877:63376）：
  // 任务从列表移除，会话里的卡片留着转「已删除」（Figma 9908:45451），applyTasks 负责回写
  const [deleteAutomationTaskId, setDeleteAutomationTaskId] = useState<string | null>(null);
  const deleteAutomationTask = deleteAutomationTaskId ? automationTasks.find(item => item.id === deleteAutomationTaskId) ?? null : null;
  const confirmDeleteAutomationTask = () => {
    if (deleteAutomationTaskId === null) return;
    const id = deleteAutomationTaskId;
    setDeleteAutomationTaskId(null);
    applyTasks(current => current.filter(item => item.id !== id));
    setChatAutomationId(null);
    toast.success("自动化任务已删除", { id: "automation-task-status" });
  };

  const handleChatAutomationOperate = (label: string, task: AutomationTask) => {
    if (label === "删除") {
      // 先弹风险确认（Figma 9877:63376），确认后才真正删除
      setDeleteAutomationTaskId(task.id);
      return;
    }
    if (label === "暂停") {
      applyTasks(current => current.map(item => item.id === task.id ? { ...item, status: "已暂停" } : item));
      toast.success("任务已暂停", { id: "automation-task-status" });
      return;
    }
    if (label === "启用") {
      applyTasks(current => current.map(item => item.id === task.id ? { ...item, status: "已启用" } : item));
      toast.success("任务已开启", { id: "automation-task-status" });
      return;
    }
    // 立即执行：与自动化页同一套——插运行记录 + 执行结果写进落点会话（创建会话 or 新开会话）
    if (label === "立即执行") {
      handleRunAutomationTask(task);
    }
  };
  const activeTaskProject = projects.find(project => project.id === activeTask?.projectId);
  const activeTaskArtifacts: LocatedTaskArtifact[] = messages.flatMap((message, messageIndex) => (
    (message.artifacts ?? []).map(artifact => ({ ...artifact, messageIndex }))
  ));
  const handleLocateArtifact = (artifact: LocatedTaskArtifact) => {
    const row = document.querySelector<HTMLElement>(`[data-message-index="${artifact.messageIndex}"]`);
    const target = row?.querySelector<HTMLElement>(`[data-artifact-id="${artifact.id}"]`) ?? row;
    if (!target) return;
    target.scrollIntoView({ behavior: "smooth", block: "center" });
    target.animate([{ boxShadow: "0 0 0 2px #1e63f5" }, { boxShadow: "0 0 0 2px rgba(30,99,245,0)" }], { duration: 1600, easing: "ease-out" });
  };
  const isFileDrag = (event: React.DragEvent) => Array.from(event.dataTransfer.types).includes("Files");
  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    if (!isFileDrag(event)) return;
    event.preventDefault();
    dragDepth.current = 0;
    setDragActive(false);
    const files = Array.from(event.dataTransfer.files);
    if (files.length) handleAddFiles(files);
    else toast.error("暂不支持上传文件夹");
  };

  const sidebar = (
        <Sidebar
          history={history}
          setHistory={setHistory}
          projects={projects}
          setProjects={setProjects}
          mobile={isMobile}
          onClose={() => isMobile ? setMobileNavigationOpen(false) : setSidebarOpen(false)}
          onNewChat={handleNewChat}
          onOpenProjects={handleOpenProjects}
          onOpenAutomation={handleOpenAutomation}
          onOpenArchive={handleOpenArchive}
          onOpenLibrary={handleOpenLibrary}
          onNewProjectTask={handleNewProjectTask}
          projectListOpen={projectListOpen}
          automationOpen={automationOpen}
          libraryOpen={libraryOpen}
          activeId={activeHistoryId}
          activeProjectId={activeProjectId}
          onSelect={handleSelectHistory}
          onSelectProject={handleSelectProject}
          onRequestDeleteProject={handleRequestDeleteProject}
          onRequestDeleteTask={handleRequestDeleteChatTask}
          onRequestTransfer={requestTransfer}
          onSearch={() => setSearchOpen(true)}
        />
  );

  return (
    <Sheet open={isMobile && mobileNavigationOpen} onOpenChange={setMobileNavigationOpen}>
    {/* relative：详情栏铺满态（内容区 < 640）要按「前一个兄弟」的偏移定位，
        祖先没有定位容器就只能按视口算，会话页会盖住左侧导航 */}
    <div className="w-screen h-screen flex flex-row overflow-hidden relative">
      {!isMobile && sidebarOpen && sidebar}
      {isMobile && (
        <SheetContent side="left" aria-describedby={undefined} className="w-[240px] max-w-full gap-0 border-0 p-0 shadow-none sm:max-w-[240px] [&>button]:hidden">
          <SheetTitle className="sr-only">导航</SheetTitle>
          {sidebar}
        </SheetContent>
      )}
      {/* main content: header always at App level so sidebar can never affect it */}
      <div
        ref={detailContentRef}
        className="chat-layout relative z-20 flex min-h-0 min-w-[320px] flex-1 flex-col bg-white p-0"
        onDragEnter={event => {
          if (!isFileDrag(event)) return;
          event.preventDefault();
          dragDepth.current += 1;
          setDragActive(true);
        }}
        onDragOver={event => {
          if (!isFileDrag(event)) return;
          event.preventDefault();
          event.dataTransfer.dropEffect = "copy";
        }}
        onDragLeave={event => {
          if (!isFileDrag(event)) return;
          dragDepth.current = Math.max(0, dragDepth.current - 1);
          if (!dragDepth.current) setDragActive(false);
        }}
        onDrop={handleDrop}
      >
        {/* 自动化任务页（Figma 9937:57105）没有全局顶栏：详情栏 header 直接贴窗口顶部；移动端保留顶栏以免失去导航入口 */}
        {automationOpen && !isMobile ? null : (
        <ChatHeader
          title={chatTitle}
          projectOverview={activeProject && !activeTask && !projectListOpen ? { name: activeProject.name, onOpenProjects: handleOpenProjects } : undefined}
          actions={activeProject && !activeTask && !projectListOpen ? (
            <ProjectHeaderActions
              key={activeProject.id}
              project={activeProject}
              panelOpen={projectConfigurationOpen}
              showPanelToggle={!detailCompact}
              onTogglePanel={() => setProjectConfigurationOpen(open => !open)}
              onEdit={updates => setProjects(current => current.map(project => project.id === activeProject.id ? { ...project, name: updates.name, description: updates.description } : project))}
              onTransfer={owner => requestTransfer(activeProject.id, owner)}
              onArchive={() => {
                const projectId = activeProject.id;
                setProjects(current => current.map(project => project.id === projectId ? { ...project, archived: true } : project));
                setHistory(current => current.map(task => task.projectId === projectId ? { ...task, archived: true } : task));
                showArchiveToast(() => {
                  setProjects(current => current.map(project => project.id === projectId ? { ...project, archived: false } : project));
                  setHistory(current => current.map(task => task.projectId === projectId ? { ...task, archived: false } : task));
                });
                handleOpenProjects();
              }}
              onDelete={() => handleRequestDeleteProject(activeProject.id)}
            />
          ) : activeTask && messages.length > 0 ? (
            <TaskHeaderActions
              key={activeTask.id}
              task={activeTask}
              projects={projects}
              artifacts={activeTaskArtifacts}
              setHistory={setHistory}
              setProjects={setProjects}
              onLocateArtifact={handleLocateArtifact}
              onRequestDeleteTask={handleRequestDeleteChatTask}
            />
          ) : undefined}
          projectBreadcrumb={activeProject && activeTask ? { projectName: activeProject.name, taskName: activeTask.title, onSelectProject: () => handleSelectProject(activeProject.id) } : undefined}
          mobile={isMobile}
          sidebarOpen={!isMobile && sidebarOpen}
          onSidebarToggle={() => setSidebarOpen(o => !o)}
          onNewChat={handleNewChat}
        />
        )}
        <div className={libraryOpen ? "flex min-h-0 flex-1 flex-col" : "hidden"}>
          <LibraryView active={libraryOpen} onAddToTask={handleAddLibraryFileToTask} projects={projects.filter(project => !project.archived).map(project => ({ id: project.id, name: project.name }))} onUploadToProject={(file, projectId) => startFileImport([{ name: file.name, size: parseFileSize(file.size) }], "产物", projectId)} onCreateProject={() => setLibraryCreateProjectOpen(true)} />
        </div>
        {libraryOpen ? null : automationOpen
          ? <AutomationView tasks={automationTasks} onTasksChange={applyTasks} onLaunchChat={handleLaunchAutomationChat} onRunTask={handleRunAutomationTask} onLocateRun={handleLocateRunRecord} navCollapsed={!isMobile && !sidebarOpen} onSidebarToggle={() => setSidebarOpen(o => !o)} onNewChat={handleNewChat} />
          : archiveOpen
          ? <ArchiveView
              projects={projects}
              tasks={history}
              onUnarchiveProject={id => {
                setProjects(current => current.map(project => project.id === id ? { ...project, archived: false } : project));
                setHistory(current => current.map(task => task.projectId === id ? { ...task, archived: false } : task));
                toast.success("项目已取消归档");
              }}
              onEditProject={(id, updates) => {
                setProjects(current => current.map(project => project.id === id ? { ...project, name: updates.name, description: updates.description } : project));
                toast.success("项目信息已更新");
              }}
              onTransferProject={requestTransfer}
              onDeleteProject={handleRequestDeleteProject}
              onSelectTask={id => { setArchiveOpen(false); handleSelectHistory(id); }}
              onUnarchiveTask={id => {
                setHistory(current => current.map(task => task.id === id ? { ...task, archived: false } : task));
                toast.success("任务已取消归档");
              }}
              onDeleteTask={handleRequestDeleteChatTask}
            />
          : projectListOpen
          ? <ProjectListView
              projects={projects}
              onSelectProject={handleSelectProject}
              onCreateProject={project => {
                const id = Date.now();
                setProjects(current => [...current, { ...project, id }]);
                handleSelectProject(id);
              }}
              onEditProject={(id, updates) => {
                setProjects(current => current.map(project => project.id === id ? { ...project, name: updates.name, description: updates.description } : project));
              }}
              onArchiveProject={id => {
                setProjects(current => current.map(project => project.id === id ? { ...project, archived: true } : project));
                setHistory(current => current.map(item => item.projectId === id ? { ...item, archived: true } : item));
                showArchiveToast(() => {
                  setProjects(current => current.map(project => project.id === id ? { ...project, archived: false } : project));
                  setHistory(current => current.map(item => item.projectId === id ? { ...item, archived: false } : item));
                });
              }}
              onDeleteProject={handleRequestDeleteProject}
              onTransferProject={requestTransfer}
            />
          : messages.length > 0
            ? <ChatView
              conversationId={activeHistoryId}
              messages={messages}
              input={input}
              onInputChange={setInput}
              onSend={handleSend}
              attachments={attachments}
              onAddFiles={handleAddFiles}
              onRemoveAttachment={handleRemoveAttachment}
              showInput={stage !== "requirement" && stage !== "outline"}
              hasProject={Boolean(activeTaskProject)}
              projectFiles={activeTaskProject ? activeTaskProject.files ?? DEMO_PROJECT_FILES : undefined}
              onOpenPpt={() => setStage("preview")}
              onRegeneratePpt={handleOutlineConfirm}
              pptGeneration={pptGeneration}
              onPptGenerationChange={setPptGeneration}
              pptMode={pptMode}
              onPptModeChange={setPptMode}
              pptPages={pptPages}
              onPptPagesChange={setPptPages}
              agentRunning={messages.some(message => message.role === "process" && Boolean(message.thinking))}
              onStop={handleStop}
              onOpenAutomation={setChatAutomationId}
              onEditMessage={handleEditMessage}
              onDeleteMessage={handleDeleteMessage}
              onRetryMessage={handleRetryMessage}
              onProcessProgress={handleProcessProgress}
            />
          : activeProject
            ? <ProjectHomeView
                key={activeProject.id}
                project={activeProject}
                onStartImport={startFileImport}
                configurationOpen={projectConfigurationOpen}
                compact={detailCompact}
                projects={projects}
                onCreateProject={project => {
                  const id = Date.now();
                  setProjects(current => [...current, { ...project, id }]);
                  return id;
                }}
                tasks={history.filter(task => task.projectId === activeProject.id && !task.archived)}
                onSelectTask={handleSelectHistory}
                onUpdateTask={(id, updates) => setHistory(current => current.map(task => task.id === id ? { ...task, ...updates } : task))}
                onDeleteTask={handleRequestDeleteChatTask}
                onUpdateProject={updates => setProjects(current => current.map(project => project.id === activeProject.id ? { ...project, ...updates } : project))}
                inputProps={{
                  hasProject: true,
                  projectFiles: activeProject.files ?? DEMO_PROJECT_FILES,
                  value: input,
                  onChange: setInput,
                  onSend: handleSend,
                  attachments,
                  onAddFiles: handleAddFiles,
                  onRemoveAttachment: handleRemoveAttachment,
                  pptGeneration,
                  onPptGenerationChange: setPptGeneration,
                  pptMode,
                  onPptModeChange: setPptMode,
                  pptPages,
                  onPptPagesChange: setPptPages,
                }}
              />
          : <HomeView
              input={input}
              onInputChange={setInput}
              onSend={handleSend}
              attachments={attachments}
              onAddFiles={handleAddFiles}
              onRemoveAttachment={handleRemoveAttachment}
              pptGeneration={pptGeneration}
              onPptGenerationChange={setPptGeneration}
              pptMode={pptMode}
              onPptModeChange={setPptMode}
              pptPages={pptPages}
              onPptPagesChange={setPptPages}
              projects={projects}
              selectedProjectId={selectedProjectId}
              onSelectProject={setSelectedProjectId}
              onCreateProject={project => {
                const id = Date.now();
                setProjects(current => [...current, { ...project, id }]);
                setSelectedProjectId(id);
              }}
            />
        }
        <CreateProjectDialog
          open={libraryCreateProjectOpen}
          onOpenChange={setLibraryCreateProjectOpen}
          onCreate={project => {
            const id = Date.now();
            setProjects(current => [...current, { ...project, id }]);
            handleSelectProject(id);
          }}
        />
        <DeleteProjectDialog
          open={deleteProjectId !== null}
          onOpenChange={open => { if (!open) setDeleteProjectId(null); }}
          onConfirm={handleConfirmDeleteProject}
        />
        <DeleteTaskDialog
          open={deleteAutomationTask !== null}
          taskTitle={deleteAutomationTask?.title ?? ""}
          onOpenChange={next => { if (!next) setDeleteAutomationTaskId(null); }}
          onConfirm={confirmDeleteAutomationTask}
        />
        <DeleteChatTaskDialog
          open={deleteChatTaskId !== null}
          onOpenChange={next => { if (!next) setDeleteChatTaskId(null); }}
          onConfirm={handleConfirmDeleteChatTask}
        />
        {dragActive && (
          <div className="pointer-events-none absolute inset-0 z-[100] flex items-center justify-center bg-white/80 backdrop-blur-[1px]">
            <div className="flex flex-col items-center gap-[8px] rounded-[16px] border-2 border-dashed border-[#1e63f5] px-[40px] py-[32px] text-center text-[16px] text-[rgba(0,0,0,0.88)]">
              <span className="text-[28px] leading-none text-[#1e63f5]">+</span>
              <span>文件拖放到此处即可上传</span>
              <span className="text-[12px] text-[rgba(0,0,0,0.38)]">支持图片、PDF、Office 文档及常见文本文件</span>
            </div>
          </div>
        )}
      </div>
      {/* 会话里点自动化卡片 → 右侧详情栏（Figma 9787:71282 / 9925:54837）；
          宽度与响应规则统一走 use-detail-panel-width：默认内容区 50%（320~720，可拖拽），
          内容区不足 640 时铺满内容区（不浮起来），顶部左箭头返回会话 */}
      {chatAutomationTask && (
        <AutomationDetailPanel
          task={chatAutomationTask}
          contentAware
          onClose={() => setChatAutomationId(null)}
          onOperate={handleChatAutomationOperate}
          onLocateRun={record => handleLocateRunRecord(chatAutomationTask, record)}
          onChange={patch => {
            const targetId = chatAutomationTask.id;
            applyTasks(current => current.map(item => item.id === targetId ? { ...item, ...patch } : item));
            // 卡片上的标题/周期/内容跟着详情栏的修改同步，避免两处不一致
            if (patch.title || patch.cycle || patch.description || patch.schedule || patch.prompt) {
              setMessages(prev => prev.map(message => message.automation?.taskId === targetId
                ? {
                  ...message,
                  automation: {
                    ...message.automation,
                    title: patch.title ?? message.automation.title,
                    cycle: patch.cycle ?? message.automation.cycle,
                    description: patch.description ?? message.automation.description,
                    schedule: patch.schedule ?? message.automation.schedule,
                    prompt: patch.prompt ?? message.automation.prompt,
                  },
                }
                : message));
            }
          }}
        />
      )}
      {/* right-hand PPT viewer, shares the row with the chat column */}
      {stage === "preview" && <PptPanel onClose={() => setStage("idle")} />}
      {/* panels / preview (z-50, fixed) */}
      {/*  these stay here so they overlay regardless of sidebar */}

      <RequirementPanel
        visible={stage === "requirement"}
        onClose={resetPptFlow}
        onConfirm={handleRequirementConfirm}
        pptMode={pptMode}
        onPptModeChange={setPptMode}
        initialPages={pptPages}
        mainOffset={!isMobile && sidebarOpen ? 120 : 0}
      />
      <OutlinePanel
        visible={stage === "outline"}
        onClose={resetPptFlow}
        onConfirm={handleOutlineConfirm}
        mainOffset={!isMobile && sidebarOpen ? 120 : 0}
      />
    </div>
    <SearchDialog open={searchOpen} onClose={() => setSearchOpen(false)} />
    {/* Figma 9244:31238：选人后统一在 App 层弹确认窗，点确定才真正移交 */}
    <TransferConfirmDialog
      member={transferConfirm?.member ?? null}
      onCancel={() => setTransferConfirm(null)}
      onConfirm={() => {
        if (transferConfirm) {
          const { projectId, member } = transferConfirm;
          setProjects(current => current.map(project => project.id === projectId ? { ...project, owner: member } : project));
          toast.success(`本地示例：项目已移交给${member}`);
        }
        setTransferConfirm(null);
      }}
    />
    {/* 导入面板只在「项目」「资料库」两个导航内出现；切到其他页面仅隐藏，记录与进度保留 */}
    {importTasks && (libraryOpen || projectListOpen || activeProjectId !== null) && (
      <ImportTaskPanel
        tasks={importTasks}
        collapsed={importCollapsed}
        onToggleCollapsed={() => setImportCollapsed(current => !current)}
        onRetry={retryImportTask}
        onRetryAll={retryFailedImports}
        onClose={() => setImportTasks(null)}
      />
    )}
    <Toaster position="top-center" />
    </Sheet>
  );
}
