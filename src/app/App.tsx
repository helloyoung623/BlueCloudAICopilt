import { forwardRef, useState, useRef, useEffect, useLayoutEffect, useCallback, useMemo, lazy, Suspense } from "react";
import type { CSSProperties } from "react";
import { motion } from "motion/react";
import svgTask from "@/imports/任务执行过程/svg-tkwirjnqmk";
import svgSearching from "@/imports/搜索中/svg-pcft5f0tqe";
import { PptResultMessage } from "./components/ppt-result";import { DotmCircular2 } from "./components/dotm-circular-2";
import { RadarArcLoader } from "./components/radar-arc-loader";
import { HomeBackground } from "./components/home-background";
import { RichText, RICH_TEXT_CSS, normalizeAiHtml, visibleTextLength, truncateHtmlByVisibleText } from "./components/rich-text";
import { OneDriveCard, OutlookCard, RESULT_CARD_CSS, type OneDriveFile, type OutlookMail, type QuotePayload } from "./components/result-cards";
import { ArtifactFileCard, SmallTip, TaskArtifactsButton } from "./components/task-artifacts";
import { KubaiIcon, kubaiNameFromUrl } from "./components/kubai-icon";
import type { LocatedTaskArtifact, TaskArtifact } from "./components/task-artifacts";
import { Dialog, DialogClose, DialogContent, DialogTitle } from "./components/ui/dialog";
import { Sheet } from "./components/ui/sheet";
import { useIsMobile } from "./components/ui/use-mobile";
import { OperationMenu } from "./components/operation-menu";
import { AddContentMenu } from "./components/add-content-menu";
import { ProjectInstructionDialog, ProjectMembersDialog, ProjectMemberTag } from "./components/project-settings-dialogs";
import type { ProjectMember } from "./components/project-settings-dialogs";
import { UserAvatar } from "./components/user-avatar";
import { useUserProfile } from "./user-profile";
import { AttachmentTray, MessageAttachments, MAX_ATTACHMENTS, formatFileSize, getAttachmentExtension, getAttachmentIcon, getAttachmentValidationError, makeVirtualFile, readFileMeta, readVirtualFile } from "./components/attachment-tray";
import type { ChatAttachment } from "./components/attachment-tray";
import { AttachmentPicker } from "./components/attachment-picker";
import type { AttachmentSource } from "./components/attachment-picker";
import { DEMO_PROJECT_FILES, ProjectFilesPanel, createCloudSourceFiles, pickSourceFiles } from "./components/project-files";
import type { ProjectFiles } from "./components/project-files";
import { SelectFileDialog } from "./components/select-file-dialog";
import type { CloudSourceTab } from "./components/select-file-dialog";
import type { ImportTask } from "./components/import-task-panel";
import { FileFilterButton, EMPTY_UPLOADER_FILTER, SELF_OWNER } from "./components/file-filter";
import type { FileFormat, FileStatus, TimeFilter, UploaderFilter } from "./components/file-filter";
import { Popover, PopoverAnchor } from "./components/ui/popover";
import { toast } from "sonner";
import { Toaster } from "./components/ui/sonner";
import { type AgentEvent, type AgentSource } from "./agent-client";
import { condenseAutomationTitle } from "./automation-title";
import { ListPageHeader } from "./components/list-page-header";
// 自动化的常量/工具/类型直连子模块；组件走 lazy，避免聚合出口把整模块拖进首屏。
import { INITIAL_TASKS as INITIAL_AUTOMATION_TASKS, TASK_OPERATIONS } from "./components/automation/constants";
import { summarizeSchedule, describeSchedule, cardSubtitle, resolveAutomationIcon, automationIconSrc, buildRunRecords, makeRunRecord, buildDefaultSchedule } from "./components/automation/utils";
import { useDismissOnOutside } from "./components/automation/hooks";
import type { AutomationIcon, AutomationTask, AutomationCardStatus, ScheduleState, RunRecord } from "./components/automation/types";
import type { AgentRound, HistoryItem, Message, ProcessPreset, ProcessVariant, ToolKind } from "./chat/types";
import { deriveRunningTaskIds, findLastIndex, freezePreviousMessages, getAnswerDoneKey, sameIdSet, sameSidebarTasks, toInstantMessages, toSidebarTasks } from "./chat/conversation-state";
import { ConversationDomainProvider, useLatestHandlers, useStableValue } from "./chat/conversation-context";
import type { ConversationActions } from "./chat/conversation-context";
import { ChatDomainProvider } from "./chat/chat-domain";
import { useConversationStore } from "./chat/use-conversation-store";
import { clearConversationCaches } from "./chat/run-caches";
import { createDeferredTimers } from "./chat/deferred-timers";
import { finalizeBodyOnlyMessages, finalizeInterruptedMessages, isGenerating } from "./chat/generation-state";
import { useGenerationRuns } from "./chat/use-generation-runs";
import { startAgentStream } from "./chat/agent-stream";
import type { OutlinePage, PptPageCount, PptStage } from "./ppt/types";
import { buildAutomationLaunch, type AutomationLaunchInput } from "./automation/launch";
import { addSourcesToProject, buildImportTasks, parseFileSize } from "./projects/project-files";
import { ExecutionProcess, MergedProcess, PROCESS_PRESETS, intentIcon, runningActionText, toToolKind } from "./chat/execution-process";
import { ChatInput } from "./chat/ChatInput";
import { ChatView } from "./chat/ChatView";
import type { ProjectItem } from "./projects/types";
import { CreateProjectDialog, ProjectActionsMenu, TaskProjectMoveMenu, TransferConfirmDialog } from "./projects/ProjectViews";
import { ProjectArchivePage, ProjectHeaderActionsHost, ProjectHomePage, ProjectListPage } from "./projects/ProjectPages";
import { SidebarHost } from "./sidebar/SidebarHost";
import { readStoredSidebarWidth, storeSidebarWidth } from "./sidebar/sidebar-width";
import { DeleteChatTaskDialog, DeleteProjectDialog, SearchDialog } from "./dialogs/AppDialogs";
import { HomeView } from "./home/HomeView";
import { ChatHeader, TaskHeaderActions } from "./chat/ChatHeader";

// ── 按需加载的页面/弹层 ──────────────────────────────────────────────────────
// 这些模块只在用户点开对应入口后才渲染；拆成独立 chunk，首屏不再下载其代码。
// fallback 用 null：它们出现时容器已就位，不额外占空间、不会让布局跳动。
const AutomationView = lazy(() => import("./components/automation/automation-list").then(m => ({ default: m.AutomationView })));
const AutomationDetailPanel = lazy(() => import("./components/automation/automation-detail-panel").then(m => ({ default: m.AutomationDetailPanel })));
const DeleteTaskDialog = lazy(() => import("./components/automation/delete-task-dialog").then(m => ({ default: m.DeleteTaskDialog })));
const ConnectorsView = lazy(() => import("./components/connectors-view").then(m => ({ default: m.ConnectorsView })));
const LibraryView = lazy(() => import("./components/library-view").then(m => ({ default: m.LibraryView })));
const PptPanel = lazy(() => import("./components/ppt-panel").then(m => ({ default: m.PptPanel })));
const RequirementPanel = lazy(() => import("./ppt/flow-panels").then(m => ({ default: m.RequirementPanel })));
const OutlinePanel = lazy(() => import("./ppt/flow-panels").then(m => ({ default: m.OutlinePanel })));
const ImportTaskPanel = lazy(() => import("./components/import-task-panel").then(m => ({ default: m.ImportTaskPanel })));


// ── helpers ───────────────────────────────────────────────────────────────────

const isPPTIntent = (t: string) => /ppt|演示|幻灯|slide/i.test(t) || t.includes("PPT");

// 自动化任务不再由前端关键词拦截：是不是「要创建一个定时任务」由模型自己判断，
// 条件不齐时模型先追问，齐了才调 create_automation 工具。前端只接工具结果落库。
// 下面三条是任务卡片下方固定的延展问题（与「自动化任务」页创建入口保持一致）。
const AUTOMATION_FOLLOW_UPS = [
  "这个任务的执行记录在哪里查看？",
  "把执行时间改成每天 09:00",
  "给这个任务设置一个结束时间",
];

// 工具返回的自动化任务参数（server/tools.mjs 的 buildAutomation）→ 前端任务卡片结构
// icon：服务端拿 AI 给的关键词去 icons.kubai.design 检索到的图标（url 走 /api/icon 代理）
type AgentAutomationOutput = { created: boolean; missing?: string[]; question?: string; automation?: { title: string; goal: string; cycle: string; time: string; weekdays: string[]; monthDays: string[]; icon?: { name: string; url: string; page?: string; matched?: string[] } } };

// 「新建自动化任务」弹窗发起的一轮：seed 给服务端补参数，meta 用来还原任务与卡片。
type LaunchAutomationPayload = {
  seed: { title?: string; goal: string; cycle?: string; time: string; weekdays: string[]; monthDays: string[] };
  meta: { title: string; goal: string; schedule: ScheduleState; newSessionEachRun: boolean; attachments?: ChatAttachment[] };
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

// 演示链路的推荐追问：也按「细节深挖 / 场景延伸 / 行动产出」三条生成，不再用万金油模板。
const RICH_TEXT_FOLLOW_UPS = [
  "H3 和 H4 视觉上差多少？",
  "这套样式怎么用在周报里？",
  "帮我按这套样式写一份周报",
];
const PPT_FOLLOW_UPS = [
  "这套大纲适合什么受众？",
  "每页需要配什么图表？",
  "直接把大纲生成完整PPT",
];
const OUTLOOK_FOLLOW_UPS = [
  "这几封邮件需要我回复吗？",
  "邮件里的附件怎么批量下载？",
  "帮我把邮件要点整理成表格",
];
const ONEDRIVE_FOLLOW_UPS = [
  "这几个文件内容有什么区别？",
  "文件里的数据是最新的吗？",
  "帮我把文件内容整理成摘要文档",
];

// 富文本示例（Figma 2759:15863「HTML」）：发「富文本示例」触发展示，覆盖全部标签。
// 末尾两条是安全探针：script 与 onerror 必须被白名单过滤，不得执行。
const RICH_TEXT_SAMPLE_LEAD = "已为你整理相关内容，要点如下：";
const RICH_TEXT_SAMPLE_HTML = [
  "<h1>蓝云 AI 富文本样式一览</h1>",
  "<p>这是一段<strong>加粗</strong>与<del>删除线</del>混排的正文，还有行内代码 <code>const answer = true</code> 以及一个<a href=\"https://example.com\">示例链接</a>。</p>",
  "<h2>标题层级</h2><h3>第三级</h3><h4>第四级</h4><h5>第五级</h5><h6>第六级</h6>",
  "<hr>",
  "<blockquote><p>引用块内部的正文仍使用正文样式，首段没有额外的上边距。</p><p>第二段引用。</p></blockquote>",
  "<h2>列表</h2>",
  "<ol><li>一级数字项<ol><li>二级字母项<ol><li>三级罗马项<ol><li>四级数字项</li></ol></li></ol></li></ol></li><li>另一个一级项</li></ol>",
  "<ul><li>无序项一</li><li>无序项二</li></ul>",
  "<h2>数据表</h2>",
  "<table><thead><tr><th>项目</th><th>状态</th><th data-align=\"right\">数量</th></tr></thead><tbody><tr><td>文档</td><td>已完成</td><td>128</td></tr><tr><td>表格</td><td>进行中</td><td>16</td></tr></tbody></table>",
  "<h2>代码块</h2>",
  "<pre><code class=\"language-js\">// 这是注释\nfunction greet(name) {\n  const greeting = \"hello\";\n  const count = 42;\n  return greeting + name + count;\n}\nconsole.log(greet(\"蓝云\"));</code></pre>",
  "<p>插图示例：</p><img src=\"/assets/b7105.png\" alt=\"示例图片\" width=\"320\">",
  "<script>window.__ACRT_XSS__ = 1</script>",
  "<img src=\"x\" onerror=\"window.__ACRT_XSS__ = 2\" alt=\"安全探针\">",
].join("\n");
const RICH_TEXT_SAMPLE_PLAIN = [
  "蓝云 AI 富文本样式一览",
  "这是一段加粗与删除线混排的正文，还有行内代码 const answer = true 以及一个示例链接。",
  "标题层级 / 第三级 / 第四级 / 第五级 / 第六级",
  "引用块内部的正文仍使用正文样式，首段没有额外的上边距。第二段引用。",
  "列表：1. 一级数字项  a. 二级字母项  i. 三级罗马项  1. 四级数字项  2. 另一个一级项；无序项一、无序项二。",
  "数据表：项目 / 状态 / 数量；文档 / 已完成 / 128；表格 / 进行中 / 16。",
  "代码块：// 这是注释 / function greet(name) / const greeting = hello / const count = 42 / return greeting + name + count / console.log(greet(蓝云))。",
  "插图示例。",
].join("\n");

// 搜索结果卡片示例（Figma 7279:64072 / 6103:19374）：发「文件卡片」/「邮件卡片」触发
const ONE_DRIVE_SAMPLE: OneDriveFile[] = [
  { name: "2026 产品规划资料库", meta: "张三于 7 月 1 日修改 · 36 MB", kind: "site", highlight: "包含年度 roadmap、产品路线图与评审纪要" },
  { name: "Q3 销售预测.xlsx", meta: "李四于 7 月 3 日修改 · 1.2 MB", kind: "xlsx", highlight: "汇总华东、华南区域 Q3 营收与成本预测" },
  { name: "产品战略发布会.pptx", meta: "王五于 7 月 2 日修改 · 8.4 MB", kind: "pptx", highlight: "包含新产品定位、发布节奏与关键里程碑" },
];
const OUTLOOK_SAMPLE: OutlookMail[] = [
  { sender: "陈思远", title: "关于 2026 产品路线图评审的会议纪要", body: "附件是本周评审的最终版路线图，请查收并确认 Q3 里程碑。", time: "2026年7月3日 10:24", flagged: true, highlight: "请在本周五前确认 Q3 里程碑", avatarColor: 0 },
  { sender: "林悦", title: "Q3 销售预测数据已更新", body: "华东与华南区域数据已合并，请查看附件中的预测表。", time: "2026年7月2日 16:08", highlight: "华东区域预测较上季度增长 12%", avatarColor: 1 },
  { sender: "王建国", title: "产品发布会物料最终确认", body: "主视觉和演示文稿已定稿，麻烦确认后安排上传。", time: "2026年7月1日 09:41", avatarColor: 2 },
];

// 演示链路的执行过程：和真 agent 同一套文案规矩 —— 行动说明用「正在…」，
// 折叠入口是概括动作集合的名词短语，动作行自带动词、不出现工具名与分类前缀。
const buildQueryProcess = (query: string, kind: "outlook" | "onedrive" = "outlook"): ProcessPreset => {
  const topic = query.length > 24 ? `${query.slice(0, 24)}…` : query;
  if (kind === "onedrive") {
    return {
      summary: `正在检索 OneDrive 中与「${topic}」相关的文件`,
      running: "正在检索文件并整理结果",
      title: "文件检索与整理",
      actions: [
        { label: "检索 OneDrive 中的相关文件", icon: "react-read" },
        { label: "加载文件摘要与更新时间", icon: "react-read" },
        { label: "归纳文件的用途与差异", icon: "react-analyze" },
        { label: "整理成可直接引用的文件清单", icon: "react-summarize" },
      ],
    };
  }
  return {
    summary: `正在检索近一周的邮件并整理关键信息`,
    running: "正在检索邮件并整理结果",
    title: "邮件检索与整理",
    actions: [
      { label: "检索近一周收到的邮件", icon: "react-read" },
      { label: "加载邮件正文与附件信息", icon: "react-read" },
      { label: "归纳邮件中的关键事项", icon: "react-analyze" },
      { label: "整理成可直接查看的邮件清单", icon: "react-summarize" },
    ],
  };
};

/* 自动化卡片入场动效：底色 → 图标 → 标题 → 副标题 → 扫光 */
// ── root ──────────────────────────────────────────────────────────────────────

// Figma ReAct 图标：文件路径映射（SVG 自带 fill-opacity 0.38，与 T2 文字同色）
// 未选中会话时消息区展示的空数组；保持引用稳定，避免无关更新触发 ChatView 重渲染。
const EMPTY_MESSAGES: Message[] = [];

export default function App() {
  // 登录页跳转过来时带一个一次性标记：等 Toaster 挂载后弹「登录成功」
  useEffect(() => {
    let flag: string | null = null;
    try {
      flag = window.sessionStorage.getItem("wb:login-success");
      if (flag) window.sessionStorage.removeItem("wb:login-success");
    } catch {
      flag = null;
    }
    if (!flag) return;
    const timer = window.setTimeout(() => toast.success("登录成功"), 280);
    return () => window.clearTimeout(timer);
  }, []);

  const isMobile = useIsMobile(800);
  const [mobileNavigationOpen, setMobileNavigationOpen] = useState(false);
  // 会话域单一真相：当前草稿、历史会话、活动会话、未读都在一个 reducer 里。
  // 活动会话消息直接从 conversations 查出，不再用 effect 在两份消息之间同步。
  // 桥接只有一个实现（useConversationStore）：dispatch 只进同步 store，React 只采纳
  // store 推来的整份快照，不会再跑一次带副作用的 updater。
  const { state: conversationState, store: conversationStore, dispatch: dispatchConversation } = useConversationStore();
  const history = conversationState.conversations;
  const activeHistoryId = conversationState.activeId;
  const messages = activeHistoryId === null
    ? conversationState.draft
    : (history.find(item => item.id === activeHistoryId)?.messages ?? EMPTY_MESSAGES);
  const unreadTaskIds = conversationState.unread;
  const shownRecommendationKeys = conversationState.shownRecommendations;
  const activeHistoryIdRef = useRef<number | null>(null);
  activeHistoryIdRef.current = activeHistoryId;
  // 延迟发送（自动化立即执行、失败重试）只查同步 store：
  // 新建会话已 dispatch 但 React 还没提交时，这里也已经能看到；删除同理立即不可见。
  const deferredTimers = useRef(createDeferredTimers(
    (callback, delay) => window.setTimeout(callback, delay),
    handle => window.clearTimeout(handle),
  ));
  useEffect(() => () => deferredTimers.current.dispose(), []);
  // 同一个事件里切换/新建会话后紧接着写消息：ref 先同步，消息才会落到新会话。
  // 下面几个写入口都依赖 dispatchConversation（本身引用恒定）；写明依赖而不是空数组，
  // 免得以后 dispatchConversation 一旦换实现就变成抓旧闭包。
  const setActiveHistoryId = useCallback((id: number | null) => {
    activeHistoryIdRef.current = id;
    dispatchConversation({ type: "select", id });
  }, [dispatchConversation]);
  const setHistory = useCallback((updater: HistoryItem[] | ((current: HistoryItem[]) => HistoryItem[])) => {
    dispatchConversation({ type: "updateConversations", updater });
  }, [dispatchConversation]);
  const setMessages = useCallback((updater: Message[] | ((current: Message[]) => Message[])) => {
    dispatchConversation({ type: "updateMessages", id: activeHistoryIdRef.current, updater });
  }, [dispatchConversation]);
  // 离开会话页时清空的是「未建会话的草稿视图」，不是删掉历史会话里的消息。
  const clearDraft = useCallback(() => {
    dispatchConversation({ type: "updateMessages", id: null, updater: () => [] });
  }, [dispatchConversation]);
  const handleRecommendationsShown = useCallback((key: string) => {
    dispatchConversation({ type: "recommendationsShown", key });
  }, [dispatchConversation]);
  const [input, setInput] = useState("");
  const [pptGeneration, setPptGeneration] = useState(false);
  const [pptPages, setPptPages] = useState<PptPageCount>("智能匹配");
  const [stage, setStage] = useState<PptStage>("idle");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  // 侧边栏宽度：桌面端可拖右边缘调整，记住上次拖到的宽度
  const [sidebarWidth, setSidebarWidth] = useState(() => readStoredSidebarWidth());
  const [searchOpen, setSearchOpen] = useState(false);
  const [projectConfigurationOpen, setProjectConfigurationOpen] = useState(true);
  // 项目详情页宽度 < 800px 时进入紧凑布局：右侧「指令 / 成员」边栏收起，内容并入「配置」页签
  const [detailCompact, setDetailCompact] = useState(false);
  const detailContentRef = useRef<HTMLDivElement>(null);
  const [projectListOpen, setProjectListOpen] = useState(false);
  const [automationOpen, setAutomationOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [connectorOpen, setConnectorOpen] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  // 资料库首次打开后才加载并挂载；之后即使关闭也保持挂载（仅 hidden），保住筛选/滚动状态。
  const [libraryEverOpened, setLibraryEverOpened] = useState(false);
  useEffect(() => {
    if (libraryOpen) setLibraryEverOpened(true);
  }, [libraryOpen]);
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
  const [activeProjectId, setActiveProjectId] = useState<number | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);
  // 自动化任务由 App 持有：点「创建」会进入新会话，自动化页会卸载，任务不能跟着丢
  const [automationTasks, setAutomationTasks] = useState<AutomationTask[]>(INITIAL_AUTOMATION_TASKS);
  // 模型调 create_automation 成功时，任务先落库、卡片先缓存；
  // 等这条回答的 run.end 落地，再把卡片挂到对应的 AI 消息上（卡片必须在回复下方）。
  const pendingAutomation = useRef(new Map<string, NonNullable<Message["automation"]>>());
  // 「新建自动化任务」弹窗发起的一轮：带上弹窗里填好的结构化条件。
  // seed 传给服务端（模型不用再追问、参数以用户填写为准），meta 留在前端保证任务与卡片跟弹窗一致。
  const launchAutomation = useRef(new Map<string, LaunchAutomationPayload>());
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
    // 活动会话的消息就在 conversations 里，下面的 setHistory 已经覆盖；
    // 只有「未建会话」的草稿才需要单独同步，避免同一份消息被写两次。
    if (activeHistoryIdRef.current === null) setMessages(syncCards);
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
    setProjects(current => addSourcesToProject(current, files, projectId, DEMO_PROJECT_FILES));
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
    // 演示两种失败态（9544:34251）的规则已抽到 projects/project-files.ts
    const tasks: ImportTask[] = buildImportTasks(files, source, projectId);
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
  // 运行号、每个会话的生成状态、SSE 控制器和计时器统一由这个控制器按会话管理；
  // App 只把状态快照用于 UI，把事件映射成消息，不再直接持有这些 ref / setState。
  const { states: generationByConversation, controller: generationRuns } = useGenerationRuns();
  // 标记某会话本轮是否已收到真实工具事件：首个 tool.call 到来时清掉本地占位步骤
  const realToolMode = useRef(new Map<number, boolean>());
  // plan.summary 会预置本轮动作（先展示 loading），tool.call 按顺序认领这些动作，
  // 记下每轮已认领数量，避免同一条动作被追加两次。
  const confirmedByRound = useRef(new Map<string, number>());
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
        // 来源角标 / 自定义副标题（Outlook 邮件副标题=发件人）/ 云盘条目唯一来源
        ...(meta?.badge ? { badge: meta.badge } : {}),
        ...(meta?.subtitle ? { subtitle: meta.subtitle } : {}),
        ...(meta?.origin ? { origin: meta.origin } : {}),
      };
    });

    // 虚拟条目（站点/文件夹）：直接 ready，带自定义图标与副标题
    const virtuals = files.flatMap((file, index): ChatAttachment[] => {
      const virtual = readVirtualFile(file);
      if (!virtual) return [];
      // 去重：有来源标识时按来源+条目判重（不同站点同名文件夹互不冲突）；否则沿用同名去重
      if (attachmentsRef.current.some(item => virtual.origin
        ? item.origin === virtual.origin
        : item.name === file.name)) return [];
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
        ...(virtual.origin ? { origin: virtual.origin } : {}),
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

  // 记住侧边栏宽度：刷新 / 重开页面还是上次拖到的大小
  useEffect(() => {
    storeSidebarWidth(sidebarWidth);
  }, [sidebarWidth]);

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

  // deleting the open conversation returns to the home view
  useEffect(() => {
    if (activeHistoryId !== null && !history.some(i => i.id === activeHistoryId)) {
      setActiveHistoryId(null);
      clearDraft();
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

  // 后台会话的流式回调也按会话 id 直接写进它的消息列表：
  // 当前在看哪一个会话不影响写入目标，切走的任务照样继续推进。
  const applyToConversation = useCallback((conversationId: number, updater: (list: Message[]) => Message[]) => {
    dispatchConversation({ type: "updateMessages", id: conversationId, updater });
  }, []);

  const handleSelectHistory = (id: number) => {
    const item = history.find(i => i.id === id);
    if (!item) return;
    setMobileNavigationOpen(false);
    setStage("idle");
    setProjectListOpen(false);
    setAutomationOpen(false);
    setLibraryOpen(false);
    setConnectorOpen(false);
    clearDraftAttachments(true);
    setInput("");
    setActiveHistoryId(id);
    setActiveProjectId(item.projectId ?? null);
    setSelectedProjectId(null);
    // 从历史载入的消息打上 instant 标记：直接完整显示，不重播打字动画
    // 同时清掉 needsTypewriter，避免切回来又逐字打一遍
    // 按 id 在 reducer 里取当前消息再标记 instant；不能用切会话前拿到的 item.messages 快照，
    // 否则同一批里刚落地的后台流式内容会被旧快照盖掉。
    applyToConversation(id, toInstantMessages);
  };

  // 执行过程把已展开的步骤数回写到消息上：切走再回来能续上，工具 loading 态不会丢
  const handleProcessProgress = (index: number, progress: { shown: number; batchStart: number }) => {
    setMessages(prev => prev.map((m, i) => (i === index ? { ...m, progress } : m)));
  };

  const handleSelectProject = (id: number) => {
    setMobileNavigationOpen(false);
    generationRuns.invalidateGlobal();
    clearDraft();
    clearDraftAttachments(true);
    setInput("");
    setPptGeneration(false);
    setStage("idle");
    setProjectListOpen(false);
    setAutomationOpen(false);
    setLibraryOpen(false);
    setConnectorOpen(false);
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
      generationRuns.invalidateGlobal();
      // 删掉正在执行的步骤：作废该会话的后台流程，避免回调又把消息补回来
      if (activeHistoryId !== null) {
        const deletedRunId = generationRuns.runIdOf(activeHistoryId);
        generationRuns.invalidateRun(activeHistoryId);
        // 删的正是还在跑的那一步：把请求也断掉、生成状态清掉，
        // 否则发送按钮会一直停在「暂停生成」。
        if (target.role === "process" && target.thinking) {
          generationRuns.abort(activeHistoryId);
          generationRuns.clearState(activeHistoryId);
          // 这一轮不会再兑现的等待：卡片缓存与弹窗发起参数一并清掉。
          const deletedKey = deletedRunId !== undefined ? `${activeHistoryId}:${deletedRunId}` : undefined;
          if (deletedKey) {
            pendingAutomation.current.delete(deletedKey);
            launchAutomation.current.delete(deletedKey);
          }
        }
      }
    }
  };
  const handleRetryMessage = (index: number) => {
    const target = messages[index];
    if (!target || target.role !== "user") return;
    // 目标会话在点击这一刻就定下来：写入与请求都用它，不再混用旧闭包和当前会话 ref。
    const targetId = conversationStore.getState().activeId;
    // 重试即重新走一次发送流程（去掉「模拟失败」前缀后作为真实提问）
    const retryText = target.text.replace(/模拟失败|模拟提示/g, "").trim() || "找出近一周的邮件";
    const clearFailed = (list: Message[]) => (
      list[index]?.role === "user" && list[index]?.text === target.text
        ? list.map((message, i) => (i === index ? { ...message, sendState: undefined } : message))
        : list
    );
    deferredTimers.current.schedule(() => {
      const snapshot = conversationStore.getState();
      if (targetId === null) {
        // 草稿重试：期间切到别的会话就放弃，不把草稿消息投到新会话；仍在草稿才照常重试。
        // 原来点击时就清掉失败标记，放弃后看起来像重试成功；现在标记留着并明确告知取消。
        if (snapshot.activeId !== null) {
          toast.info("已切换会话，重试已取消", { id: "retry-cancelled" });
          return;
        }
        dispatchConversation({ type: "updateMessages", id: null, updater: clearFailed });
        sendRunRef.current(retryText, target.attachments);
        return;
      }
      // 会话在这 0ms 内被删：reducer 本来也会丢弃迟到写入，这里连请求一起放弃，不复活会话。
      if (!snapshot.conversations.some(item => item.id === targetId)) {
        toast.info("会话已删除，重试已取消", { id: "retry-cancelled" });
        return;
      }
      applyToConversation(targetId, clearFailed);
      sendRunRef.current(retryText, target.attachments, { conversationId: targetId });
    }, 0);
  };

  // 卡片「引用」：与「加号」上传的附件完全同款——真实文件类型图标 / 文件名 /「类型 · 大小」副标题 / 来源角标。
  // 已引用（origin 命中）不再重复添加，toast 提示「已引用」；移除附件后引用按钮自动复位。
  const handleQuoteAttachment = (payload: QuotePayload) => {
    if (attachmentsRef.current.some(item => item.origin === payload.key)) {
      toast.info("已引用");
      return;
    }
    if (attachmentsRef.current.length >= MAX_ATTACHMENTS) {
      toast.error(`最多上传 ${MAX_ATTACHMENTS} 个文件`);
      return;
    }
    const extension = getAttachmentExtension(payload.name);
    const icon = payload.icon ?? getAttachmentIcon(extension);
    const file = makeVirtualFile(payload.name, icon, payload.subtitle, payload.badge, payload.key);
    const attachment: ChatAttachment = {
      id: `quote-${payload.key}-${Date.now()}`,
      file,
      name: payload.name,
      size: 1,
      extension,
      image: false,
      status: "ready",
      icon,
      subtitle: payload.subtitle,
      badge: payload.badge,
      origin: payload.key,
    };
    replaceAttachments([...attachmentsRef.current, attachment]);
  };
  // 重新生成：删除当前回答，从对应的提问重新走一次 AI 执行流程；
  // 不再重挂打字机把同一段文字再打一遍。
  const handleRegenerateMessage = (index: number) => {
    const target = messages[index];
    if (target?.role !== "ai") return;
    let query = "";
    for (let i = index - 1; i >= 0; i--) {
      if (messages[i].role === "user") { query = messages[i].text; break; }
    }
    if (!query) return;
    handleSend(query, [], { regenerateFrom: index });
  };

  const handleSend = (suggestion?: string, sentAttachments: ChatAttachment[] = [], options?: { automationRun?: boolean; regenerateFrom?: number; launch?: LaunchAutomationPayload; conversationTitle?: string; forceNewConversation?: boolean; runningLabel?: string; conversationId?: number }) => {
    const text = (suggestion ?? input).trim();
    if (!text) return;
    if (sentAttachments.some(attachment => attachment.status !== "ready")) return;
    const isRegenerate = typeof options?.regenerateFrom === "number";
    // 弹窗创建自动化任务时强制开新会话：不能落到用户上一次看的那条任务里
    const forceNew = options?.forceNewConversation === true;
    const targetProjectId = forceNew ? null : (activeProjectId ?? selectedProjectId);
    const shouldGeneratePpt = !isRegenerate && (pptGeneration || isPPTIntent(text));
    const runId = generationRuns.nextRunId();
    // 重新生成不应清空用户正在编辑的草稿
    if (!isRegenerate) {
      setInput("");
      clearDraftAttachments(false);
      setPptGeneration(false);
    }
    // 自动化任务不再在这里拦截：说「以后每天早上九点提醒我」时，
    // 由模型自己判断是自动化意图 → 条件齐全才调 create_automation 工具，
    // 前端在 tool.result 里落库并挂出任务卡片（条件不齐时模型会先追问，不会走到创建）。
    const historyTitle = options?.conversationTitle?.trim() || text || sentAttachments[0]?.name || "附件会话";
    // 延迟触发的发送（自动化立即执行、失败重试）带显式落点：只写回这个会话，
    // 不看用户此刻在看哪里；原定会话已删除就直接放弃，绝不另建或投到当前会话。
    // 这里只查同步 store：新建会话即使 React 还没提交也已经存在，不会被误判为「已删除」。
    const snapshot = conversationStore.getState();
    const explicitConversationId = options?.conversationId;
    if (explicitConversationId !== undefined && !snapshot.conversations.some(item => item.id === explicitConversationId)) return;
    // create a history entry when starting a brand-new conversation
    const isNewConversation = explicitConversationId === undefined && (snapshot.activeId === null || forceNew);
    let conversationId = explicitConversationId ?? (isNewConversation ? null : snapshot.activeId);
    if (conversationId === null) {
      conversationId = nextHistoryId.current++;
      setHistory(h => [{ id: conversationId as number, title: historyTitle.slice(0, 20), createdAt: Date.now(), messages: [], ...(targetProjectId !== null ? { projectId: targetProjectId } : {}) }, ...h]);
      setActiveHistoryId(conversationId);
      setActiveProjectId(targetProjectId);
    }
    const convId = conversationId;
    // 请求上下文在追加本轮消息之前取快照：否则 store 会把刚追加的用户消息也算进去，
    // 请求里就多出一条重复提问。
    const live = conversationStore.getState();
    const ownerMessages = isNewConversation
      ? []
      : (live.conversations.find(item => item.id === convId)?.messages ?? (live.activeId === convId ? live.draft : []));
    // 该会话的最新运行轮次：切到别的任务不会作废它，只有本会话再发新一轮才会
    generationRuns.claimRun(convId, runId);
    // 弹窗创建自动化任务：这一轮的结构化条件按「会话+轮次」登记，
    // 服务端据此补齐工具参数（模型不用再追问），前端据此保证任务与卡片跟弹窗一致
    if (options?.launch) launchAutomation.current.set(`${convId}:${runId}`, options.launch);
    setSelectedProjectId(null);
    // 演示入口（Figma 9369:50206 用户消息变体）：
    //   「模拟失败」→ 红色感叹号 + 发送失败/重试；「模拟提示」→ info 图标。
    // 二者作为独立消息展示，不进入 AI 流程；其余普通提问保持原样。
    const demoState: Message["sendState"] = text.includes("模拟失败") ? "failed" : text.includes("模拟提示") ? "info" : undefined;
    // 新一轮消息进来前，先把之前的消息标记成「历史态」（instant）：
    // 旧回答不该再播一次打字 / 卡片入场，否则新消息一落地，上面的 AI 回复看起来像重新加载了一遍。
    // 仍在执行中的 process（thinking）跳过，避免把它切成"恢复进度"态。
    const freezePrevious = freezePreviousMessages;
    if (demoState) {
      const appendUser: (list: Message[]) => Message[] = prev => [...freezePrevious(prev), { role: "user", text, attachments: sentAttachments, sendState: demoState }];
      if (isNewConversation) setMessages(appendUser); else applyToConversation(convId, appendUser);
      return;
    }
    // 富文本示例：跳过 15s 执行过程，直接给出一条覆盖全部标签的 AI 回答
    if (text.includes("富文本示例")) {
      const appendRich: (list: Message[]) => Message[] = prev => [
        ...freezePrevious(prev),
        { role: "user", text, attachments: sentAttachments },
        { role: "ai", text: RICH_TEXT_SAMPLE_LEAD, html: RICH_TEXT_SAMPLE_HTML, plainText: RICH_TEXT_SAMPLE_PLAIN, animateRich: true, followUps: RICH_TEXT_FOLLOW_UPS },
      ];
      if (isNewConversation) setMessages(appendRich); else applyToConversation(convId, appendRich);
      return;
    }
    // 搜索结果卡片示例：和普通提问一样先跑执行过程，结束后再返回 OneDrive / Outlook 卡片
    // 首页推荐问题「找出近一周的邮件」也走 Outlook 邮件卡片演示
    const cardDemo = (text.includes("邮件卡片") || text.includes("找出近一周的邮件")) ? "outlook" : text.includes("文件卡片") ? "onedrive" : null;
    const useRealAgent = !shouldGeneratePpt && !cardDemo;
    const processText = text || "处理上传的文件";
    // 同一会话里发起新一轮前，先把上一轮没收尾的残留收掉：断开旧请求、保留已收到的正文、
    // 把没跑完的执行过程标记为「已停止生成」。否则旧轮次会一直转圈，正文也永远打不完。
    // 正文已经发完的上一轮例外：不掐断它的连接，让服务端把剩下的部分（推荐追问）发完；
    // 它迟到的结束事件会被运行号守卫丢弃，不会改到新一轮。
    let keepPreviousStream = false;
    if (!isNewConversation) {
      // 读控制器里的实时状态，不读 React 快照：answer.end 到达即已 phase=idle，
      // 但 React 可能还没提交这一帧，拿旧快照会把「正文已发完、等追问」的上一轮误判成仍在生成，
      // 于是多掐断一条本该自己走完的连接（追问就永远不来了）。与延迟发送同一原则：不等提交。
      const previous = generationRuns.stateOf(convId);
      const wasGenerating = isGenerating(previous);
      const previousRunId = previous?.runId;
      keepPreviousStream = previous?.phase === "idle";
      if (!keepPreviousStream) generationRuns.abort(convId);
      // 上一轮不会再兑现的等待：卡片缓存与弹窗发起参数。真的建出来的卡片挂回上一轮的回答，
      // 没建出来的绝不伪造成功。
      const previousKey = previousRunId !== undefined ? `${convId}:${previousRunId}` : undefined;
      const previousCard = previousKey ? pendingAutomation.current.get(previousKey) : undefined;
      if (previousKey) {
        pendingAutomation.current.delete(previousKey);
        launchAutomation.current.delete(previousKey);
      }
      // 上一轮还在生成中才把它算作「已停止生成」；已经正常结束的轮次保持「任务已完成」。
      applyToConversation(convId, prev => finalizeInterruptedMessages(prev, {
        runId: previousRunId,
        interrupted: wasGenerating,
        automation: previousCard,
      }));
    }
    // 真 agent 链路不预置任何本地工具步骤：模型没发 tool.call 前只显示中性的「正在理解」，
    // 收到真实 tool.call 后才按模型选择的工具追加步骤；若整轮无工具，answer.start 会直接收起这条 process。
    const initialProcess: Message = shouldGeneratePpt
      ? { role: "process", text: "", thinking: true, variant: "requirement", runId }
      : useRealAgent
        ? {
          role: "process",
          text: "",
          thinking: true,
          variant: "requirement",
          controlledProcess: true,
          runId,
          // 弹窗创建自动化任务：过程里的说话人改成任务口吻（步骤仍由真实工具调用驱动）
          preset: options?.launch
            ? { goal: "好的，我来帮你创建这个自动化任务", running: options.runningLabel ?? "正在思考", actions: [] }
            : { goal: `任务目标：${processText}`, running: options?.runningLabel ?? "正在思考", actions: [] },
        }
        : { role: "process", text: "", thinking: true, variant: "requirement", runId, preset: buildQueryProcess(processText, cardDemo === "onedrive" ? "onedrive" : "outlook") };
    {
      const appendRun: (list: Message[]) => Message[] = prev => {
        // 重新生成：截掉旧回答（及其后的消息），从对应提问重新挂执行过程
        if (isRegenerate) {
          // 同时截掉这轮回答前面的执行过程：否则旧的「任务已完成」会留在页面上，
          // 和新生成的执行过程并排出现两条，且旧的那条永远没有正文跟随。
          let cut = options!.regenerateFrom!;
          while (cut > 0 && prev[cut - 1]?.role === "process") cut -= 1;
          const base = prev.slice(0, cut).map(m => (
            m.instant || (m.role === "process" && m.thinking) ? m : { ...m, instant: true }
          ));
          return [...base, initialProcess];
        }
        return [...freezePrevious(prev), { role: "user", text, attachments: sentAttachments }, initialProcess];
      };
      if (isNewConversation) setMessages(appendRun); else applyToConversation(convId, appendRun);
    }
    // 这一轮进入「生成中」：请求开始 → 正文结束（answer.end）之间，发送按钮是「暂停生成」。
    generationRuns.begin(convId, runId);

    // 普通提问：走真实模型流式输出；PPT / 卡片演示仍保留原模拟链路
    if (useRealAgent) {
      // 上一轮正文已经发完时保留它的连接（让它自己走完）；其余情况在前面已掐断。
      // 旧连接按 runId 单独登记，新一轮登记不会覆盖它，停止/删除/卸载仍能中止。
      realToolMode.current.delete(convId);
      for (const key of [...confirmedByRound.current.keys()]) {
        if (key.startsWith(`${convId}:`)) confirmedByRound.current.delete(key);
      }

      // 上下文要带上这一会话里已经说出口的内容。
      // 正文已结束（answer.end 到了）但这一轮还没收尾（run.end 没到）时，这条回答的状态
      // 还是 streaming，可它其实已经说完了 —— 不能因为状态没收尾就把这段 assistant 正文漏掉，
      // 否则下一轮请求里模型看不到自己上一轮的回答。
      const prior = (isRegenerate ? ownerMessages.slice(0, options!.regenerateFrom!) : ownerMessages)
        .filter(m => (m.role === "user" || m.role === "ai") && !(m.streaming && !m.bodyDone) && !m.sendState)
        // 空白的 assistant 轮次不发给服务端：模型会当成自己说过一句空话。
        .filter(m => m.role === "user" || Boolean((m.plainText || m.text).trim()))
        .map(m => ({ role: (m.role === "ai" ? "assistant" : "user") as "user" | "assistant", content: (m.plainText || m.text).slice(0, 8000) }));
      const attachmentNote = sentAttachments.length ? `[附件：${sentAttachments.map(a => a.name).join("、")}] ` : "";
      const apiMessages = [...prior, { role: "user" as const, content: `${attachmentNote}${text}`.slice(0, 8000) }];

      let aiAppended = false;
      let fullText = "";
      let answerStarted = false;
      // 结果自检结论：verify.result 在 answer.start 之前就到，先存着，建消息时带上
      let verifyState: Message["verify"];

      const clearProcessAndFail = () => {
        applyToConversation(convId, prev => {
          const next = prev.filter(m => !(m.role === "process" && m.thinking) && !(m.role === "ai" && m.streaming));
          const lastUser = findLastIndex(next, m => m.role === "user");
          if (lastUser !== -1) next[lastUser] = { ...next[lastUser], sendState: "failed" as const };
          return next;
        });
      };

      // 会话 + runId 守卫和结束事件判定由 agent-stream 服务负责；这里只把事件映射成消息。
      const handleEvent = (event: AgentEvent) => {
        if (event.type === "plan.summary") {
          // 「正在思考」结束后，先落一行用户可见的行动说明 / 下一步计划 / 推理摘要，
          // 再等 tool.call 推进「显示执行意图」里每条的状态。每一轮工具调用各自成块。
          // 服务端随摘要一起下发本轮的执行意图集合（type/text/status），前端立刻按 status 渲染
          // 已完成与执行中，否则工具很快返回时，摘要与「已完成」之间没有任何执行反馈。
          const textSummary = typeof event.data.text === "string" ? event.data.text.trim() : "";
          // 折叠入口标题：概括这一组动作的静态短语（天气查询与出行建议），不是固定功能名
          const textTitle = typeof event.data.title === "string" ? event.data.title.trim() : "";
          const roundIndex = Number.isInteger(event.data.round) ? (event.data.round as number) : undefined;
          // type 只用于选图标；text 是规范要求的自带动词短句，直接当文案，不带任何类型前缀。
          const intents = (Array.isArray(event.data.intents) ? event.data.intents : [])
            .filter(i => i && typeof i.text === "string" && i.text.trim())
            .map(i => ({ label: i.text.trim(), icon: intentIcon(i.type), done: (i.status ?? "running") === "done" }));
          const plannedActions = intents.map(({ label, icon }) => ({ label, icon }));
          // 服务端保证 done 在前、running 在后：第一个未完成项之后都按执行中渲染
          const firstRunning = intents.findIndex(i => !i.done);
          const batchStart = firstRunning === -1 ? plannedActions.length : firstRunning;
          const slots = (Array.isArray(event.data.slots) ? event.data.slots : []).filter(n => Number.isInteger(n)) as number[];
          if (!textSummary && !plannedActions.length) return;
          applyToConversation(convId, prev => {
            const next = [...prev];
            const idx = findLastIndex(next, m => m.role === "process" && m.thinking);
            if (idx === -1) return next;
            const rounds = [...(next[idx].rounds ?? [])];
            if (roundIndex !== undefined && rounds[roundIndex]) {
              const target = rounds[roundIndex];
              // 服务端预置的意图优先（同一批动作在 tool.call 里按 slots 认领，不重复追加）
              rounds[roundIndex] = plannedActions.length && target.actions.length === 0
                ? { ...target, summary: textSummary || target.summary, title: textTitle || target.title, actions: plannedActions, progress: { shown: plannedActions.length, batchStart }, slots }
                : { ...target, summary: textSummary || target.summary, title: textTitle || target.title };
            } else {
              rounds.push({
                summary: textSummary,
                title: textTitle,
                actions: plannedActions,
                progress: { shown: plannedActions.length, batchStart },
                slots,
              });
            }
            next[idx] = { ...next[idx], summary: textSummary || next[idx].summary, rounds };
            return next;
          });
        } else if (event.type === "tool.phase") {
          // 工具阶段：process 保持 thinking（转圈 + 步骤逐个展开），此时下方绝不出现正文
          if (event.data.stage === "start") {
            const steps = event.data.steps;
            if (Array.isArray(steps) && steps.length) {
              applyToConversation(convId, prev => {
                const next = [...prev];
                const idx = findLastIndex(next, m => m.role === "process" && m.thinking);
                if (idx !== -1) {
                  next[idx] = {
                    ...next[idx],
                    preset: { goal: next[idx].preset?.goal ?? `任务目标：${text}`, running: next[idx].preset?.running ?? `围绕「${text}」检索并整理信息`, actions: steps.map(s => ({ label: s.label, icon: s.icon as ToolKind })) },
                  };
                }
                return next;
              });
            }
          }
        } else if (event.type === "step.end") {
          // 兼容旧的占位步骤事件（真 agent 下服务端不再发，保留以防回退）
          const done = Number(event.data.index) + 1;
          applyToConversation(convId, prev => {
            const next = [...prev];
            const idx = findLastIndex(next, m => m.role === "process" && m.thinking);
            if (idx !== -1 && Number.isFinite(done)) {
              const total = next[idx].preset?.actions.length ?? done;
              next[idx] = { ...next[idx], progress: { shown: Math.min(total, Math.max(next[idx].progress?.shown ?? 0, done)), batchStart: Math.min(total, Math.max(next[idx].progress?.batchStart ?? 0, done)) } };
            }
            return next;
          });
        } else if (event.type === "tool.call") {
          // 真实工具调用：只推进对应轮次的执行意图状态，不新增文案。
          // plan.summary 已经按服务端下发的 intents 预置好整组意图，服务端的 slots 记录
          // 「第 i 个 tool_call 对应第几条意图」，这里精确认领，避免靠文案相等匹配而重复追加
          // （模型给的意图文案与工具的动作文案本来就不一致）。
          const icon = toToolKind(typeof event.data.icon === "string" ? event.data.icon : "");
          const label = typeof event.data.label === "string" ? event.data.label : "";
          const roundIndex = Number.isInteger(event.data.round) ? (event.data.round as number) : undefined;
          applyToConversation(convId, prev => {
            const next = [...prev];
            const idx = findLastIndex(next, m => m.role === "process" && m.thinking);
            if (idx === -1) return next;
            const current = next[idx].preset;
            const realMode = realToolMode.current.get(convId) ?? false;
            const actions = realMode ? [...(current?.actions ?? [])] : [];
            actions.push({ label, icon });
            realToolMode.current.set(convId, true);
            const rounds = [...(next[idx].rounds ?? [])];
            if (rounds.length === 0) rounds.push({ summary: next[idx].summary || "正在调用工具处理您的请求", actions: [], progress: { shown: 0, batchStart: 0 } });
            const target = roundIndex !== undefined && rounds[roundIndex] ? roundIndex : rounds.length - 1;
            while (rounds.length <= target) rounds.push({ summary: "正在调用工具处理您的请求", actions: [], progress: { shown: 0, batchStart: 0 } });
            const targetRound = rounds[target];
            const confirmKey = `${convId}:${target}`;
            const confirmed = confirmedByRound.current.get(confirmKey) ?? 0;
            const slot = targetRound.slots?.[confirmed];
            const claim = Number.isInteger(slot) && (slot as number) < targetRound.actions.length ? (slot as number) : -1;
            const roundActions = claim >= 0 ? targetRound.actions : [...targetRound.actions, { label, icon }];
            const activeIndex = claim >= 0 ? claim : roundActions.length - 1;
            confirmedByRound.current.set(confirmKey, confirmed + 1);
            rounds[target] = {
              ...targetRound,
              actions: roundActions,
              slots: claim >= 0 ? targetRound.slots : [...(targetRound.slots ?? []), activeIndex],
              // batchStart 指向刚认领的这一条：它之后的都算执行中
              progress: { shown: roundActions.length, batchStart: activeIndex },
            };
            next[idx] = {
              ...next[idx],
              controlledProcess: true,
              rounds,
              preset: { goal: current?.goal ?? `任务目标：${text}`, running: (typeof event.data.running === "string" && event.data.running) || runningActionText(label), actions },
              progress: { shown: actions.length, batchStart: actions.length - 1 },
            };
            return next;
          });
        } else if (event.type === "tool.result") {
          // 工具执行完成：把对应轮次里正在执行的步骤推进为完成（batchStart 越界即全部完成）
          const roundIndex = Number.isInteger(event.data.round) ? (event.data.round as number) : undefined;
          applyToConversation(convId, prev => {
            const next = [...prev];
            const idx = findLastIndex(next, m => m.role === "process" && m.thinking);
            if (idx === -1) return next;
            const actions = next[idx].preset?.actions ?? [];
            const rounds = [...(next[idx].rounds ?? [])];
            if (rounds.length) {
              const target = roundIndex !== undefined && rounds[roundIndex] ? roundIndex : rounds.length - 1;
              const targetRound = rounds[target];
              // 动作文案可能被服务端纠正过（创建任务的条件不齐 → 「核对任务条件」）：
              // 用 tool.result 下发的 label 覆盖刚执行的那一条，别让执行过程显示成已创建。
              const roundActions = [...targetRound.actions];
              const activeIndex = targetRound.progress.batchStart;
              const finalLabel = typeof event.data.label === "string" ? event.data.label : "";
              if (finalLabel && roundActions[activeIndex] && roundActions[activeIndex].label !== finalLabel) {
                roundActions[activeIndex] = { ...roundActions[activeIndex], label: finalLabel };
              }
              rounds[target] = { ...targetRound, actions: roundActions, progress: { shown: roundActions.length, batchStart: roundActions.length } };
            }
            next[idx] = { ...next[idx], rounds, progress: { shown: actions.length, batchStart: actions.length } };
            return next;
          });
          // 模型调了 create_automation 且条件齐全：任务立刻落到「自动化任务」列表，
          // 卡片暂存在 pendingAutomation，等 run.end 落地时挂到这条回答下方。
          // 条件不齐时服务端返回 created:false（只有 question），这里不会建任何任务。
          if (event.data.name === "create_automation" && event.data.ok) {
            const output = event.data.output as AgentAutomationOutput | undefined;
            const created = output?.created ? output.automation : undefined;
            if (created) {
              // 从弹窗发起时，排期 / 任务名以弹窗里填的为准（模型只负责确认 + 给图标关键词）；
              // 纯对话里创建的任务没有 launch，就按模型返回的参数还原。
              const launch = launchAutomation.current.get(`${convId}:${runId}`);
              const base = buildDefaultSchedule();
              const schedule: ScheduleState = launch?.meta.schedule ?? {
                ...base,
                cycle: created.cycle as ScheduleState["cycle"],
                time: created.time,
                weekdays: created.weekdays.length ? created.weekdays : base.weekdays,
                monthDays: created.monthDays.length ? created.monthDays : base.monthDays,
              };
              const summary = summarizeSchedule(schedule);
              // 标题是任务的概括：模型给的（服务端已收敛）优先，其次弹窗里填的名字，
              // 最后才是「就」的内容；到这里再过一次收敛，保证 15 字左右、最多 30 字。
              const goal = launch?.meta.goal ?? created.goal;
              const title = condenseAutomationTitle(created.title, launch?.meta.title || goal);
              const taskId = `automation-${Date.now()}`;
              // 图标优先用服务端到 icons.kubai.design 检索到的那个（/api/icon 代理，统一主色）；
              // 检索失败时按任务语义退回本地图标。
              const icon = resolveAutomationIcon(`${title} ${goal} ${created.icon?.name ?? ""}`);
              const iconUrl = created.icon?.url;
              applyTasks(current => [{
                id: taskId,
                title,
                cycle: summary.cycle,
                description: summary.description,
                status: "已启用",
                schedule,
                prompt: goal,
                icon,
                ...(iconUrl ? { iconUrl } : {}),
                // 运行记录挂上本会话 id：点记录上的定位能跳回这段对话
                records: buildRunRecords(goal, schedule.time, convId),
                newSessionEachRun: launch?.meta.newSessionEachRun ?? false,
                sourceConversationId: convId,
                ...(launch?.meta.attachments?.length ? { attachments: launch.meta.attachments } : {}),
              }, ...current]);
              pendingAutomation.current.set(`${convId}:${runId}`, {
                taskId,
                title,
                cycle: summary.cycle,
                description: summary.description,
                icon,
                ...(iconUrl ? { iconUrl } : {}),
                status: "已启用",
                schedule,
                prompt: goal,
              });
            }
          }
        } else if (event.type === "verify.start" || event.type === "verify.retry") {
          // 结果自检：正文发出前，服务端先拿回答跟本轮工具的真实记录对账。
          // 在最后一轮执行过程末尾补一条「核对回答与依据」（重写时再补一条），
          // 复用同一套逐条揭示，所以它会排在动作行之后。
          const label = typeof event.data.label === "string" && event.data.label
            ? event.data.label
            : (event.type === "verify.retry" ? "按依据重写回答" : "核对回答与依据");
          const icon: ToolKind = event.type === "verify.retry" ? "react-analyze" : "react-check";
          applyToConversation(convId, prev => {
            const next = [...prev];
            const idx = findLastIndex(next, m => m.role === "process" && m.thinking);
            if (idx === -1) return next;
            const rounds = [...(next[idx].rounds ?? [])];
            if (!rounds.length) return next;
            const last = rounds[rounds.length - 1];
            const actions = [...last.actions, { label, icon }];
            // 新加的这条在执行中，前面的都算完成
            rounds[rounds.length - 1] = { ...last, actions, progress: { shown: actions.length, batchStart: actions.length - 1 } };
            next[idx] = { ...next[idx], rounds };
            return next;
          });
        } else if (event.type === "verify.result") {
          // 核对结束：整组动作收尾。没通过时正文里已经有服务端写的说明，这里只负责不再转圈。
          verifyState = {
            ok: event.data.ok === true,
            retried: event.data.retried === true,
            note: typeof event.data.note === "string" ? event.data.note : "",
          };
          applyToConversation(convId, prev => {
            const next = [...prev];
            const idx = findLastIndex(next, m => m.role === "process" && m.thinking);
            if (idx === -1) return next;
            const rounds = [...(next[idx].rounds ?? [])];
            if (!rounds.length) return next;
            const last = rounds[rounds.length - 1];
            rounds[rounds.length - 1] = { ...last, progress: { shown: last.actions.length, batchStart: last.actions.length } };
            next[idx] = { ...next[idx], rounds };
            return next;
          });
        } else if (event.type === "answer.start") {
          // 工具处理全部结束，这一刻才允许正文出现。
          // 没有真实 tool.call 的轮次直接移除 process，不再留下本地预置的假工具步骤；
          // 有真实工具调用时才收起执行过程供展开查看。
          answerStarted = true;
          // 正文开始流式输出：整轮仍在生成中，发送按钮继续是「暂停生成」。
          const hadRealTools = realToolMode.current.get(convId) === true;
          applyToConversation(convId, prev => {
            const next = hadRealTools
              ? prev.map(m => (m.role === "process" && m.thinking ? { ...m, thinking: false } : m))
              : prev.filter(m => !(m.role === "process" && m.thinking));
            // 本轮工具已经建好任务时，卡片在这里就先挂上（不等 run.end），
            // 否则操作项会按「无卡片」的 120ms 先冒出来，卡片晚到再插到它上面把操作项顶下去。
            const pendingCard = pendingAutomation.current.get(`${convId}:${runId}`);
            // 从弹窗发起创建时卡片要等 run.end 兜底生成，这期间也别先出操作项。
            const cardPending = !pendingCard && launchAutomation.current.has(`${convId}:${runId}`);
            if (!next.some(m => m.role === "ai" && m.streaming)) next.push({ role: "ai", text: "", instant: true, streaming: true, needsTypewriter: true, runId, ...(pendingCard ? { automation: pendingCard } : {}), ...(cardPending ? { automationPending: true } : {}), ...(verifyState ? { verify: verifyState } : {}) });
            return next;
          });
          // 指针推进由 ChatView 内部的 ChatMessageRow（打字完成回调 advance）负责，
          // 这里不要再调 advance —— App 作用域里没有该函数，调用会抛错并被 SSE 解析静默吞掉。
        } else if (event.type === "message.delta") {
          const delta = typeof event.data.text === "string" ? event.data.text : "";
          if (!delta) return;
          fullText += delta;
          // answer.start 之前的 delta 一律不渲染（服务端正常情况下不会这样发，这里是防御）
          if (!answerStarted) return;
          applyToConversation(convId, prev => {
            const next = [...prev];
            const idx = findLastIndex(next, m => m.role === "ai" && m.streaming);
            if (idx !== -1) {
              next[idx] = { ...next[idx], text: fullText, instant: true, needsTypewriter: true };
            } else {
              aiAppended = true;
              const pendingCard = pendingAutomation.current.get(`${convId}:${runId}`);
              const cardPending = !pendingCard && launchAutomation.current.has(`${convId}:${runId}`);
              next.push({ role: "ai", text: fullText, instant: true, streaming: true, needsTypewriter: true, runId, ...(pendingCard ? { automation: pendingCard } : {}), ...(cardPending ? { automationPending: true } : {}), ...(verifyState ? { verify: verifyState } : {}) });
            }
            return next;
          });
        } else if (event.type === "answer.end") {
          // 正文已发完，推荐追问还在服务端生成：先标记 bodyDone，
          // 打字机收尾后操作项立即出现，不再跟推荐问题一起出来。
          // 正文结束＝整轮生成结束：恢复发送按钮，不因为推荐追问还在生成就一直是「暂停生成」。
          applyToConversation(convId, prev => {
            const next = [...prev];
            const idx = findLastIndex(next, m => m.role === "ai" && m.streaming);
            if (idx !== -1) next[idx] = { ...next[idx], bodyDone: true };
            return next;
          });
        } else if (event.type === "run.end") {
          const finalText = typeof event.data.text === "string" && event.data.text ? event.data.text : fullText;
          const plainText = typeof event.data.plainText === "string" && event.data.plainText ? event.data.plainText : undefined;
          // 来源只有服务端真实下发且非空时才落到消息；无来源的回答不带此字段，徽标不显示。
          const sources = Array.isArray(event.data.sources) && event.data.sources.length ? event.data.sources : undefined;
          // 推荐追问由服务端按当前回答生成；没有就不显示，不再兜底到万金油模板。
          const followUps = Array.isArray(event.data.followUps)
            ? event.data.followUps.filter((q): q is string => typeof q === "string" && Boolean(q.trim())).slice(0, 3)
            : [];
          const hadRealTools = realToolMode.current.get(convId) === true;
          // 本轮真的创建了自动化任务：卡片挂在回答下方，延展问题换成任务相关那三条
          // （模型生成追问时还不知道卡片的存在，给不出「执行记录在哪看」这类问题）。
          const automationKey = `${convId}:${runId}`;
          let automation = pendingAutomation.current.get(automationKey);
          pendingAutomation.current.delete(automationKey);
          const launch = launchAutomation.current.get(automationKey);
          launchAutomation.current.delete(automationKey);
          // 兜底：从弹窗发起时条件本来就齐全，模型偶尔只回一句话、没真的调工具，
          // 这时按弹窗里的条件把任务补上，避免「点了创建却没生成任务」。
          if (!automation && launch) {
            const summary = summarizeSchedule(launch.meta.schedule);
            const taskId = `automation-${Date.now()}`;
            const seedTitle = condenseAutomationTitle(launch.meta.title, launch.meta.goal);
            const icon = resolveAutomationIcon(`${seedTitle} ${launch.meta.goal}`);
            applyTasks(current => [{
              id: taskId,
              title: seedTitle,
              cycle: summary.cycle,
              description: summary.description,
              status: "已启用",
              schedule: launch.meta.schedule,
              prompt: launch.meta.goal,
              icon,
              records: buildRunRecords(launch.meta.goal, launch.meta.schedule.time, convId),
              newSessionEachRun: launch.meta.newSessionEachRun,
              sourceConversationId: convId,
              ...(launch.meta.attachments?.length ? { attachments: launch.meta.attachments } : {}),
            }, ...current]);
            automation = {
              taskId,
              title: seedTitle,
              cycle: summary.cycle,
              description: summary.description,
              icon,
              status: "已启用",
              schedule: launch.meta.schedule,
              prompt: launch.meta.goal,
            };
          }
          applyToConversation(convId, prev => {
            const next = hadRealTools
              ? prev.map(m => (m.role === "process" && m.thinking ? { ...m, thinking: false } : m))
              : prev.filter(m => !(m.role === "process" && m.thinking));
            const idx = findLastIndex(next, m => m.role === "ai" && m.streaming);
            const content = finalText || "（模型未返回内容）";
            const follow = automation ? AUTOMATION_FOLLOW_UPS : (followUps.length ? followUps : undefined);
            if (idx !== -1) {
              next[idx] = { ...next[idx], text: content, plainText: plainText, streaming: false, followUps: follow, followUpsReady: true, instant: true, sources, needsTypewriter: true, runId, automationPending: false, ...(automation ? { automation } : {}) };
            } else {
              next.push({ role: "ai", text: content, plainText: plainText, followUps: follow, followUpsReady: true, instant: true, sources, needsTypewriter: true, runId, automationPending: false, ...(automation ? { automation } : {}) });
            }
            return next;
          });
        } else if (event.type === "run.error") {
          const message = typeof event.data.message === "string" ? event.data.message : "模型调用失败";
          pendingAutomation.current.delete(`${convId}:${runId}`);
          clearProcessAndFail();
          if (activeHistoryIdRef.current === convId) toast.error(message);
        }
      };

      // 请求生命周期（AbortController、事件守卫、连接结束后的四种结局）交给服务；
      // 这里只负责把收尾结果写回消息和自动化卡片缓存。
      const takePendingCard = () => {
        const automationKey = `${convId}:${runId}`;
        const card = pendingAutomation.current.get(automationKey);
        pendingAutomation.current.delete(automationKey);
        launchAutomation.current.delete(automationKey);
        return card;
      };
      startAgentStream({
        controller: generationRuns,
        conversationId: convId,
        runId,
        messages: apiMessages,
        automationRun: options?.automationRun === true,
        automationSeed: options?.launch?.seed,
        callbacks: {
          onEvent: handleEvent,
          onBodyOnly: () => {
            // 正文写完、追问没来：正文保留并收尾，不按失败处理。
            const card = takePendingCard();
            applyToConversation(convId, prev => finalizeBodyOnlyMessages(prev, { runId, automation: card }));
          },
          onFailed: () => {
            takePendingCard();
            clearProcessAndFail();
          },
          onError: message => { if (activeHistoryIdRef.current === convId) toast.error(message); },
        },
      });
      return;
    }

    // 以下为演示态：PPT 生成 / OneDrive / Outlook 卡片仍使用本地脚本
    generationRuns.schedule(convId, runId, () => {
      if (shouldGeneratePpt) {
        applyToConversation(convId, prev => {
          const next = [...prev];
          const idx = findLastIndex(next, m => m.role === "process" && m.thinking);
          if (idx !== -1) next[idx] = { ...next[idx], thinking: false };
          next.push({ role: "ai", text: "好的，我来帮您生成PPT。需要先确认演示场景、受众、页数和风格，以便提供针对性的内容结构。", followUps: PPT_FOLLOW_UPS });
          return next;
        });
        generationRuns.schedule(convId, runId, () => { if (activeHistoryIdRef.current === convId) setStage("requirement"); }, 400);
      } else if (cardDemo) {
        applyToConversation(convId, prev => {
          const next = [...prev];
          const idx = findLastIndex(next, m => m.role === "process" && m.thinking);
          if (idx !== -1) next[idx] = { ...next[idx], thinking: false };
          // 搜索卡片本身就是「来源」：用真实返回的条目数作为来源徽标数量，不再写死 9。
          next.push(cardDemo === "outlook"
            ? { role: "ai", text: "查到了以下邮件，共 3 封。", outlookMails: OUTLOOK_SAMPLE, sources: OUTLOOK_SAMPLE.map(m => ({ title: m.title, kind: "outlook" })), followUps: OUTLOOK_FOLLOW_UPS }
            : { role: "ai", text: "在 OneDrive 里找到 3 个相关文件。", oneDriveFiles: ONE_DRIVE_SAMPLE, sources: ONE_DRIVE_SAMPLE.map(f => ({ title: f.name, kind: "onedrive" })), followUps: ONEDRIVE_FOLLOW_UPS });
          return next;
        });
      }
      // 演示链路跑完：这一轮不再生成中，发送按钮恢复。
      generationRuns.clearState(convId, runId);
    }, 15000);
  };

  const handleRequirementConfirm = () => {
    const runId = generationRuns.nextRunId();
    const convId = activeHistoryIdRef.current;
    setStage("outline_generating");
    setMessages(prev => [...prev, { role: "process", text: "", thinking: true, variant: "outline", runId }]);
    if (convId !== null) generationRuns.begin(convId, runId);
    generationRuns.scheduleGlobal(runId, () => {
      if (convId === null) return;
      applyToConversation(convId, prev => {
        const next = [...prev];
        const idx = findLastIndex(next, m => m.role === "process" && m.thinking);
        if (idx !== -1) next[idx] = { ...next[idx], thinking: false };
        next.push({ role: "ai", text: "需求已确认，大纲生成完成，请确认以下结构。", followUps: PPT_FOLLOW_UPS });
        return next;
      });
      generationRuns.clearState(convId, runId);
      generationRuns.scheduleGlobal(runId, () => setStage("outline"), 400);
    }, 24000);
  };

  const handleOutlineConfirm = () => {
    const runId = generationRuns.nextRunId();
    const convId = activeHistoryIdRef.current;
    setStage("ppt_generating");
    setMessages(prev => [...prev, { role: "process", text: "", thinking: true, variant: "ppt", runId }]);
    if (convId !== null) generationRuns.begin(convId, runId);
    generationRuns.scheduleGlobal(runId, () => {
      if (convId === null) return;
      applyToConversation(convId, prev => {
        const next = [...prev];
        const idx = findLastIndex(next, m => m.role === "process" && m.thinking);
        if (idx !== -1) next[idx] = { ...next[idx], thinking: false };
        next.push({ role: "result", text: "", artifacts: [{ id: `${Date.now()}-pptx`, name: PPT_ARTIFACT_NAME, extension: "pptx", size: "12.6M" }] });
        return next;
      });
      generationRuns.clearState(convId, runId);
      generationRuns.scheduleGlobal(runId, () => setStage("preview"), 400);
    }, 20000);
  };

  // 「暂停生成」：中断当前会话这一轮的请求。
  // 保留已经收到的正文和已经记下的执行步骤；没跑完的执行过程显示「已停止生成」，
  // 不显示「任务已完成」，也不当成请求故障（不弹失败提示、不把消息标成发送失败）。
  const handleStop = () => {
    const convId = activeHistoryIdRef.current;
    if (convId === null) return;
    const runId = generationRuns.stateOf(convId)?.runId;
    // 作废本会话的轮次并中断请求；状态留在 idle（发送按钮恢复），迟到的事件按 runId 丢弃。
    generationRuns.stop(convId);
    // 清理这一轮不会再兑现的等待：卡片缓存与弹窗发起参数。
    // 真的建出来的任务已经在列表里，卡片也挂回这条回答；没建出来的绝不伪造成功。
    const automationKey = runId !== undefined ? `${convId}:${runId}` : undefined;
    const card = automationKey ? pendingAutomation.current.get(automationKey) : undefined;
    if (automationKey) {
      pendingAutomation.current.delete(automationKey);
      launchAutomation.current.delete(automationKey);
    }
    // 保留已经收到的正文和已经记下的执行步骤；这一轮的执行过程显示「已停止生成」，
    // 不显示「任务已完成」，也不当成请求故障（不弹失败提示、不把消息标成发送失败）。
    applyToConversation(convId, prev => finalizeInterruptedMessages(prev, {
      runId,
      interrupted: true,
      automation: card,
    }));
    setStage("idle");
  };

  const handleNewChat = () => {
    setMobileNavigationOpen(false);
    generationRuns.invalidateGlobal();
    clearDraft();
    clearDraftAttachments(true);
    setInput("");
    setPptGeneration(false);
    setPptPages("智能匹配");
    setStage("idle");
    setProjectListOpen(false);
    setAutomationOpen(false);
    setArchiveOpen(false);
    setConnectorOpen(false);
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
    generationRuns.invalidateGlobal();
    clearDraft();
    clearDraftAttachments(true);
    setInput("");
    setPptGeneration(false);
    setStage("idle");
    setProjectListOpen(true);
    setAutomationOpen(false);
    setArchiveOpen(false);
    setConnectorOpen(false);
    setLibraryOpen(false);
    setActiveHistoryId(null);
    setActiveProjectId(null);
    setSelectedProjectId(null);
  };
  // 延迟发送复用真实发送流程：用 ref 拿最新一份 handleSend，目标会话再由 options.conversationId 显式指定。
  const sendRunRef = useRef<(text?: string, attachments?: ChatAttachment[], options?: { automationRun?: boolean; conversationId?: number }) => void>(() => {});
  sendRunRef.current = handleSend;
  // 新建自动化任务弹窗点「创建」：不是直接往列表塞一条，而是发起一个新会话（任务），
  // 由 AI 承接并完成创建。排期条件转成自然语言写进 AI 的过程与回复里。
  // 新建自动化任务弹窗点「创建」：不再本地演一遍假流程，
  // 而是把弹窗里填好的条件写成一句话，发起一轮真实对话 —— 执行过程来自真实工具调用，
  // 回复由模型生成，任务由 create_automation 落库，图标由模型给关键词后到 icons.kubai.design 检索。
  // 弹窗里填的周期 / 时刻 / 任务名通过 launch.seed 一起带过去，模型漏字段也不会跑偏。
  const handleLaunchAutomationChat = (input: AutomationLaunchInput) => {
    const { attachments } = input;
    // 参数拼装已抽成纯函数，便于验证「用户填的值不被默认参数改写」。
    const launch = buildAutomationLaunch(input, describeSchedule);
    // 离开自动化页 → 新会话（handleSend 里强制开新会话，不落到上一个任务里）
    setMobileNavigationOpen(false);
    setAutomationOpen(false);
    setProjectListOpen(false);
    setArchiveOpen(false);
    setConnectorOpen(false);
    setLibraryOpen(false);
    setSelectedProjectId(null);
    setActiveProjectId(null);
    setStage("idle");
    setPptGeneration(false);
    // 附件交给新会话与新建的任务：预览地址要继续用，不能回收
    clearDraftAttachments(!attachments?.length);
    handleSend(launch.instruction, attachments ?? [], {
      conversationTitle: launch.conversationTitle,
      forceNewConversation: true,
      launch: { seed: launch.seed, meta: launch.meta },
    });
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
      setConnectorOpen(false);
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
        applyToConversation(convId, toInstantMessages);
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
      clearDraft();
    }
    applyTasks(current => current.map(item => item.id === task.id
      ? {
        ...item,
        records: [makeRunRecord(item.prompt, runConversationId, runMessageIndex), ...(item.records ?? [])],
        status: item.schedule.cycle === "仅一次" ? "已结束" : item.status,
      }
      : item));
    toast.success("任务已开始执行", { id: "automation-task-status" });
    // 等状态切换落定后再走真实发送流程；不依赖固定延迟是否足够 React 提交：
    // 新建会话由同步 store 登记，提交慢也能识别；已删除则立即识别。
    // automationRun：跳过「创建自动化任务」意图识别（任务文案常含「创建」字样，不能又被拦去新建）；
    // 附件随任务一起发出去：任务「就」里挂的文件就是这次执行的输入。
    // 显式带上落点会话：窗口期内用户切到别的任务也不会改投当前会话；目标会话被删则
    // 按「删除正在生成的会话」既有行为放弃这次延迟发送，不新建、不复活；卸载时清掉定时器。
    deferredTimers.current.schedule(() => {
      if (!conversationStore.getState().conversations.some(item => item.id === runConversationId)) {
        // 点击时已经提示「任务已开始执行」：目标消失后必须更正，不能让用户以为跑过了。
        toast.error("目标会话已删除，任务未执行", { id: "automation-task-status" });
        return;
      }
      sendRunRef.current(task.prompt, task.attachments ?? [], { automationRun: true, conversationId: runConversationId });
    }, 80);
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
    setConnectorOpen(false);
    setLibraryOpen(false);
    setChatAutomationId(null);
    clearDraftAttachments(true);
    setInput("");
    setSelectedProjectId(null);
    setActiveProjectId(target.projectId ?? null);
    setActiveHistoryId(target.id);
    applyToConversation(target.id, toInstantMessages);
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
    generationRuns.invalidateGlobal();
    clearDraft();
    clearDraftAttachments(true);
    setInput("");
    setPptGeneration(false);
    setStage("idle");
    setProjectListOpen(false);
    setAutomationOpen(true);
    setArchiveOpen(false);
    setConnectorOpen(false);
    setLibraryOpen(false);
    setActiveHistoryId(null);
    setActiveProjectId(null);
    setSelectedProjectId(null);
  };
  // Figma 9446:47192 / 9423:124200 / 9638:46195：头像菜单「归档数据」→ 归档页（任务/项目两个 tab）
  const handleOpenArchive = () => {
    setMobileNavigationOpen(false);
    generationRuns.invalidateGlobal();
    clearDraft();
    clearDraftAttachments(true);
    setInput("");
    setPptGeneration(false);
    setStage("idle");
    setProjectListOpen(false);
    setAutomationOpen(false);
    setArchiveOpen(true);
    setLibraryOpen(false);
    setConnectorOpen(false);
    setActiveHistoryId(null);
    setActiveProjectId(null);
    setSelectedProjectId(null);
  };
  // Figma 10118:87777：输入框 + 菜单 / 头像菜单的「连接器」都进入同一页
  const handleOpenConnectors = () => {
    setMobileNavigationOpen(false);
    generationRuns.invalidateGlobal();
    clearDraft();
    clearDraftAttachments(true);
    setInput("");
    setPptGeneration(false);
    setStage("idle");
    setProjectListOpen(false);
    setAutomationOpen(false);
    setArchiveOpen(false);
    setLibraryOpen(false);
    setConnectorOpen(true);
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

  // 删除会话的唯一出口：会话本身（含未读 / 执行中记忆 / 已展示推荐 key）、这一会话的生成请求、
  // 定时器、以及按「会话:轮次」登记的运行期缓存，全部在这里一次性回收。
  // 三个入口（单删任务、删项目、侧栏兜底 removeProjectTasks）都走这里 —— 只从列表里移除的话，
  // 后台还在跑的连接和计时器会继续往一个已经不存在的会话里写，缓存也会一直留着。
  const forgetConversations = useCallback((ids: readonly number[]) => {
    if (!ids.length) return;
    dispatchConversation({ type: "deleteConversations", ids });
    ids.forEach(id => {
      // 删掉的会话即使还在后台生成，也要立刻中断并作废它的回调。
      generationRuns.forget(id);
      clearConversationCaches(id, {
        pendingAutomation: pendingAutomation.current,
        launchAutomation: launchAutomation.current,
        confirmedByRound: confirmedByRound.current,
        realToolMode: realToolMode.current,
      });
    });
  }, [dispatchConversation, generationRuns]);

  // 删除项目：所有入口（侧栏「···」、项目列表卡片、项目详情、归档页）先弹确认窗，
  // 点「确定」才真正删除项目与项目内任务，并 toast「删除成功」
  const handleRequestDeleteProject = (id: number) => setDeleteProjectId(id);
  const handleConfirmDeleteProject = () => {
    if (deleteProjectId === null) return;
    const id = deleteProjectId;
    setDeleteProjectId(null);
    setProjects(current => current.filter(project => project.id !== id));
    // 项目里的任务也是会话：删项目等于批量删会话，生成请求/计时器/缓存一并回收。
    forgetConversations(
      conversationStore.getState().conversations.filter(task => task.projectId === id).map(task => task.id),
    );
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
    // 会话本身（含未读、执行中记忆、已展示推荐 key）、生成请求、定时器和运行期缓存一起回收；
    // 只清这个 id，其他会话的状态原样保留。
    forgetConversations([id]);
    if (activeHistoryId === id) {
      generationRuns.invalidateGlobal();
      clearDraft();
      setActiveHistoryId(null);
      setChatAutomationId(null);
    }
  };

  // 会话页右侧自动化详情栏：只在会话视图里生效（切走/新建会话自动收起）
  const chatAutomationTask = chatAutomationId && messages.length > 0 && !automationOpen && !libraryOpen && !archiveOpen && !connectorOpen && !projectListOpen
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
  // 会话卡片 hover 操作项：与列表卡片同一套菜单。卡片只带 taskId，
  // 这里补成真实任务再走同一个 handler；编辑 / 执行记录 都在右侧详情栏里看。
  const handleChatCardOperate = (label: string, taskId: string) => {
    const task = automationTasksRef.current.find(item => item.id === taskId);
    if (!task) {
      toast.error("该任务已删除", { id: "automation-task-status" });
      return;
    }
    if (label === "编辑" || label === "执行记录") {
      setChatAutomationId(taskId);
      return;
    }
    handleChatAutomationOperate(label, task);
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

  // 当前会话是否在生成中：请求开始 → 正文结束（answer.end）之间为真，
  // 思考、工具执行、正文流式输出三个阶段都能停。
  // 按会话隔离：这里只看当前会话自己的状态，后台会话的生成不会把暂停按钮带过来。
  const agentRunning = activeHistoryId !== null && isGenerating(generationByConversation.get(activeHistoryId));

  // ── 会话域 / 聊天域给组件消费的值 ──────────────────────────────────────────
  // 侧栏只拿任务投影（不含 messages）：流式正文每来一个 token，投影内容不变、引用也不变，
  // Context 就不会把整个侧栏带着重渲染。
  const sidebarTasks = useStableValue(useMemo(() => toSidebarTasks(history), [history]), sameSidebarTasks);
  // 当前会话的 messages 可能比 history 回写早一帧，活动会话的生成态单独补进来。
  const activeHasThinking = messages.some(message => message.role === "process" && message.thinking);
  const activeAnswerDoneKey = getAnswerDoneKey(activeHistoryId, messages);
  const activeAnswerPending = activeHistoryId !== null
    && activeAnswerDoneKey !== null
    && !activeHasThinking
    && !shownRecommendationKeys.has(activeAnswerDoneKey);
  const runningTaskIds = useStableValue(
    useMemo(
      () => deriveRunningTaskIds(history, activeHistoryId, activeHasThinking || activeAnswerPending),
      [history, activeHistoryId, activeHasThinking, activeAnswerPending],
    ),
    sameIdSet,
  );
  const conversationActions = useMemo<ConversationActions>(() => ({
    togglePinned: (id, pinned) => setHistory(items => items.map(item => (item.id === id ? { ...item, pinned } : item))),
    renameTask: (id, title) => setHistory(items => items.map(item => (item.id === id ? { ...item, title } : item))),
    moveTask: (id, projectId) => setHistory(items => items.map(item => (item.id === id ? { ...item, projectId } : item))),
    archiveTask: (id, archived) => setHistory(items => items.map(item => (item.id === id ? { ...item, archived } : item))),
    archiveProjectTasks: (projectId, archived) => setHistory(items => items.map(item => (item.projectId === projectId ? { ...item, archived } : item))),
    // 删项目内任务同样走「删会话」这一条路径，否则会漏掉生成请求/缓存/会话域状态的回收。
    removeProjectTasks: projectId => forgetConversations(
      conversationStore.getState().conversations.filter(item => item.projectId === projectId).map(item => item.id),
    ),
  }), [setHistory, forgetConversations, conversationStore]);
  const conversationDomain = useMemo(() => ({
    tasks: sidebarTasks,
    activeId: activeHistoryId,
    runningTaskIds,
    unreadTaskIds,
    actions: conversationActions,
  }), [sidebarTasks, activeHistoryId, runningTaskIds, unreadTaskIds, conversationActions]);
  // 消息级操作每次渲染都重建：处理函数是普通闭包（不是 useCallback），一旦缓存就会读到旧会话/旧消息。
  // ChatView 本来就是流式正文的消费方，随父级重渲染即可，不需要在这里做引用稳定。
  const chatDomain = {
    conversationId: activeHistoryId,
    messages,
    running: agentRunning,
    actions: {
      editMessage: handleEditMessage,
      deleteMessage: handleDeleteMessage,
      retryMessage: handleRetryMessage,
      regenerateMessage: handleRegenerateMessage,
      processProgress: handleProcessProgress,
      recommendationsShown: handleRecommendationsShown,
    },
  };
  // 侧栏的回调引用保持稳定，配合 Sidebar 的 memo：流式正文重渲染不会把整个侧栏带着重渲染。
  const sidebarHandlers = useLatestHandlers({
    onClose: () => { if (isMobile) setMobileNavigationOpen(false); else setSidebarOpen(false); },
    onNewChat: handleNewChat,
    onOpenProjects: handleOpenProjects,
    onOpenAutomation: handleOpenAutomation,
    onOpenArchive: handleOpenArchive,
    onOpenLibrary: handleOpenLibrary,
    onOpenConnectors: handleOpenConnectors,
    onNewProjectTask: handleNewProjectTask,
    onSelect: handleSelectHistory,
    onSelectProject: handleSelectProject,
    onRequestDeleteProject: handleRequestDeleteProject,
    onRequestDeleteTask: handleRequestDeleteChatTask,
    onRequestTransfer: requestTransfer,
    onSearch: () => setSearchOpen(true),
  });

  return (
    <Sheet open={isMobile && mobileNavigationOpen} onOpenChange={setMobileNavigationOpen}>
    {/* relative：详情栏铺满态（内容区 < 640）要按「前一个兄弟」的偏移定位，
        祖先没有定位容器就只能按视口算，会话页会盖住左侧导航。
        --nav-width：左侧导航实际占掉的宽度（收起或移动端时为 0）。
        PPT 弹层按它对齐到对话区里，不越过导航、也不越过窗口右边缘。 */}
    <div
      className="w-screen h-screen flex flex-row overflow-hidden relative"
      style={{ "--nav-width": `${isMobile || !sidebarOpen ? 0 : sidebarWidth}px` } as React.CSSProperties}
    >
      <ConversationDomainProvider value={conversationDomain}>
      <SidebarHost
        {...sidebarHandlers}
        projects={projects}
        setProjects={setProjects}
        isMobile={isMobile}
        sidebarOpen={sidebarOpen}
        width={sidebarWidth}
        onWidthChange={setSidebarWidth}
        projectListOpen={projectListOpen}
        automationOpen={automationOpen}
        libraryOpen={libraryOpen}
        connectorOpen={connectorOpen}
        activeProjectId={activeProjectId}
      />
      </ConversationDomainProvider>
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
        {/* 首页背景层（点阵 + 开场 5s shader 光效）：挂在主内容区最外层，absolute inset-0
            连顶栏一起盖满，避免顶部出现白色缺口。仅首页挂载；负 z 在白底之上、内容之下。 */}
        {!libraryOpen && !automationOpen && !archiveOpen && !connectorOpen && !projectListOpen && !activeProject && messages.length === 0 && (
          <HomeBackground />
        )}
        {/* 自动化任务页（Figma 9937:57105）与连接器页（Figma 10118:87777）没有全局顶栏；
            移动端保留顶栏以免失去导航入口 */}
        {(automationOpen || connectorOpen) && !isMobile ? null : (
        <ChatHeader
          title={chatTitle}
          projectOverview={activeProject && !activeTask && !projectListOpen ? { name: activeProject.name, onOpenProjects: handleOpenProjects } : undefined}
          actions={activeProject && !activeTask && !projectListOpen ? (
            <ProjectHeaderActionsHost
              project={activeProject}
              setProjects={setProjects}
              setHistory={setHistory}
              panelOpen={projectConfigurationOpen}
              showPanelToggle={!detailCompact}
              onTogglePanel={() => setProjectConfigurationOpen(open => !open)}
              onOpenProjects={handleOpenProjects}
              onRequestDeleteProject={handleRequestDeleteProject}
              onRequestTransfer={requestTransfer}
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
        {libraryEverOpened && (
        <div className={libraryOpen ? "flex min-h-0 flex-1 flex-col" : "hidden"}>
          <Suspense fallback={null}>
          <LibraryView active={libraryOpen} onAddToTask={handleAddLibraryFileToTask} projects={projects.filter(project => !project.archived).map(project => ({ id: project.id, name: project.name }))} onUploadToProject={(file, projectId) => startFileImport([{ name: file.name, size: parseFileSize(file.size) }], "产物", projectId)} onCreateProject={() => setLibraryCreateProjectOpen(true)} />
          </Suspense>
        </div>
        )}
        {libraryOpen ? null : automationOpen
          ? <Suspense fallback={null}><AutomationView tasks={automationTasks} onTasksChange={applyTasks} onLaunchChat={handleLaunchAutomationChat} onRunTask={handleRunAutomationTask} onLocateRun={handleLocateRunRecord} navCollapsed={!isMobile && !sidebarOpen} onSidebarToggle={() => setSidebarOpen(o => !o)} onNewChat={handleNewChat} /></Suspense>
          : archiveOpen
          ? <ProjectArchivePage
              projects={projects}
              tasks={history}
              setProjects={setProjects}
              setHistory={setHistory}
              onRequestDeleteProject={handleRequestDeleteProject}
              onRequestDeleteTask={handleRequestDeleteChatTask}
              onRequestTransfer={requestTransfer}
              onSelectTask={id => { setArchiveOpen(false); setConnectorOpen(false); handleSelectHistory(id); }}
            />
          : connectorOpen
          ? <Suspense fallback={null}><ConnectorsView /></Suspense>
          : projectListOpen
          ? <ProjectListPage
              projects={projects}
              setProjects={setProjects}
              setHistory={setHistory}
              onSelectProject={handleSelectProject}
              onRequestDeleteProject={handleRequestDeleteProject}
              onRequestTransfer={requestTransfer}
            />
          : messages.length > 0
            ? <ChatDomainProvider value={chatDomain}>
              <ChatView
              input={input}
              onInputChange={setInput}
              onSend={handleSend}
              onQuote={handleQuoteAttachment}
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
              pptPages={pptPages}
              onPptPagesChange={setPptPages}
              onStop={handleStop}
              onOpenAutomation={setChatAutomationId}
              onAutomationOperate={handleChatCardOperate}
              onOpenConnectors={handleOpenConnectors}
            />
            </ChatDomainProvider>
          : activeProject
            ? <ProjectHomePage
                project={activeProject}
                projects={projects}
                tasks={history.filter(task => task.projectId === activeProject.id && !task.archived)}
                configurationOpen={projectConfigurationOpen}
                compact={detailCompact}
                setProjects={setProjects}
                setHistory={setHistory}
                onSelectTask={handleSelectHistory}
                onRequestDeleteTask={handleRequestDeleteChatTask}
                onSelectProject={handleSelectProject}
                onStartImport={startFileImport}
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
                  pptPages,
                  onPptPagesChange: setPptPages,
                  onOpenConnectors: handleOpenConnectors,
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
              onOpenConnectors={handleOpenConnectors}
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
        <Suspense fallback={null}>
        <DeleteTaskDialog
          open={deleteAutomationTask !== null}
          taskTitle={deleteAutomationTask?.title ?? ""}
          onOpenChange={next => { if (!next) setDeleteAutomationTaskId(null); }}
          onConfirm={confirmDeleteAutomationTask}
        />
        </Suspense>
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
        <Suspense fallback={null}>
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
        </Suspense>
      )}
      {/* right-hand PPT viewer, shares the row with the chat column */}
      {stage === "preview" && <Suspense fallback={null}><PptPanel onClose={() => setStage("idle")} /></Suspense>}
      {/* panels / preview (z-50, fixed) */}
      {/*  these stay here so they overlay regardless of sidebar */}

      <Suspense fallback={null}>
      <RequirementPanel
        visible={stage === "requirement"}
        onClose={resetPptFlow}
        onConfirm={handleRequirementConfirm}
        initialPages={pptPages}
      />
      </Suspense>
      <Suspense fallback={null}>
      <OutlinePanel
        visible={stage === "outline"}
        onClose={resetPptFlow}
        onConfirm={handleOutlineConfirm}
      />
      </Suspense>
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
      <Suspense fallback={null}>
      <ImportTaskPanel
        tasks={importTasks}
        collapsed={importCollapsed}
        onToggleCollapsed={() => setImportCollapsed(current => !current)}
        onRetry={retryImportTask}
        onRetryAll={retryFailedImports}
        onClose={() => setImportTasks(null)}
      />
      </Suspense>
    )}
    <Toaster position="top-center" />
    </Sheet>
  );
}
