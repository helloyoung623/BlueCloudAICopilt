import { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { RadarArcLoader } from "../components/radar-arc-loader";
import svgProgress from "@/imports/渐进式ReAct/svg-x4n03n8we0";
import type { AgentRound, ProcessPreset, ProcessVariant, ToolKind } from "./types";

const REACT_ICONS: Partial<Record<ToolKind, string>> = {
  memory: "/assets/react-memory.svg", clarify: "/assets/react-clarify.svg", terminal: "/assets/react-terminal.svg",
  think: "/assets/react-think.svg", skill: "/assets/react-skill.svg", "react-read": "/assets/react-read.svg",
  "react-analyze": "/assets/react-analyze.svg", "react-generate": "/assets/react-generate.svg",
  "react-check": "/assets/react-check.svg", "react-summarize": "/assets/react-summarize.svg",
  "react-execute": "/assets/react-execute.svg", "react-fail": "/assets/react-fail.svg",
};
function TaskIcon({ type, expanded = false }: { type: ToolKind; expanded?: boolean }) {
  const wrap = (content: React.ReactNode) => <span className="relative size-[16px] shrink-0 overflow-hidden">{content}</span>;
  const reactSrc = REACT_ICONS[type];
  if (reactSrc) return wrap(<img src={reactSrc} alt="" className="absolute inset-0 size-[16px]" />);
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

// 动作执行中的文案：规范要求 text 用自带动词的短句（加载目标网页中的关键信息），
// 执行中由界面补「正在」；已经带时态的文案不再重复加。
function runningActionText(label: string) {
  const action = label.includes("；") ? label.split("；").slice(1).join("；").trim() : label;
  return /^(正在|已)/.test(action) ? action : `正在${action}`;
}

// 服务端下发的 icon 可能是 Figma ReAct 名称，也可能是旧的分类名；
// 统一收敛成 UI 用的 ToolKind。plan.summary 与 tool.call 共用，避免两处映射不一致。
const REACT_ICON_KINDS: ToolKind[] = ["memory", "clarify", "terminal", "think", "skill", "react-read", "react-analyze", "react-generate", "react-check", "react-summarize", "react-execute", "react-fail"];
const LEGACY_ICON_MAP: Record<string, ToolKind> = { time: "search", calculate: "execute", tool: "execute", search: "search", read: "read" };
function toToolKind(rawIcon: string): ToolKind {
  return REACT_ICON_KINDS.includes(rawIcon as ToolKind) ? (rawIcon as ToolKind) : (LEGACY_ICON_MAP[rawIcon] ?? "execute");
}

// 执行意图规范（过程透明度）里的 12 种 type 与 Figma 10083:64848 的 12 个图标一一对应。
// 界面上只靠图标区分类型，文案绝不能出现 type 本身。
const INTENT_ICON: Record<string, ToolKind> = {
  read: "react-read", memory: "memory", clarify: "clarify", run: "terminal", think: "think",
  skill: "skill", analyze: "react-analyze", generate: "react-generate", verify: "react-check",
  summarize: "react-summarize", execute: "react-execute", error: "react-fail",
};
function intentIcon(type: unknown): ToolKind {
  const key = typeof type === "string" ? type.trim() : "";
  return INTENT_ICON[key] ?? toToolKind(key);
}

// 真 agent 的单轮「行动说明 + 执行意图集合」块。多轮工具时每组独立折叠，
// 和 Figma 里重复出现的说明 / 意图结构一致。
/** 合并相邻的同类动作：查两个城市不该出现两行「获取重庆天气」「获取北京天气」，
 *  按用户要的样子合成一条「获取重庆和北京的天气」。 */
function compressActions(actions: AgentRound["actions"]) {
  const merged: AgentRound["actions"] = [];
  const seen = new Set<string>();
  // 多轮里模型可能每个城市各发一条「获取X天气」、每轮各发一条「结合天气判断…」。
  // 全部天气查询合并成一条「获取重庆和北京天气」（插在第一条天气原本的位置），
  // 其余动作按文案去重只留一条，保证展开后是「一个集合列表」而不是每轮一份。
  const weatherCities: string[] = [];
  let weatherAction: AgentRound["actions"][number] | null = null;
  let weatherIndex = -1;
  for (const action of actions) {
    const weather = /^获取(.+?)天气$/.exec(action.label);
    if (weather) {
      if (!weatherAction) { weatherAction = action; weatherIndex = merged.length; }
      if (!weatherCities.includes(weather[1])) weatherCities.push(weather[1]);
      continue;
    }
    if (seen.has(action.label)) continue;
    seen.add(action.label);
    merged.push(action);
  }
  if (weatherAction) {
    const label = weatherCities.length > 1
      ? `获取${weatherCities.join("和")}天气`
      : weatherAction.label;
    merged.splice(Math.min(weatherIndex, merged.length), 0, { ...weatherAction, label });
  }
  return merged;
}

/** 行动说明在执行时是「正在…」；跑完后还留着「正在」会和上面的「任务已完成」打架，
 *  完成态统一改成「已…」，并给「并」补个逗号（已查询重庆天气，并判断是否适合出行）。 */
function doneSummary(summary: string) {
  const text = String(summary ?? "").trim();
  if (!text.startsWith("正在")) return text;
  return text.replace(/^正在/, "已").replace(/并(?=[^，。])/g, "，并");
}

function IntentBlock({ running, stopped = false, summary, title, actions, progress, stepEndRef, animateIn = false }: { running: boolean; stopped?: boolean; summary: string; title?: string; actions: AgentRound["actions"]; progress: AgentRound["progress"]; stepEndRef?: { current: HTMLDivElement | null }; animateIn?: boolean }) {
  const [expanded, setExpanded] = useState(running);
  useEffect(() => { setExpanded(running); }, [running]);
  const hasSummary = summary.trim().length > 0;
  const targetShown = Math.min(actions.length, progress?.shown ?? actions.length);
  const batchStart = Math.min(targetShown, progress?.batchStart ?? targetShown);
  // 动作都跑完、但正文还没开始（模型在生成回答）时继续给一行 loading，
  // 否则工具结束后会有几秒完全静止，看起来像卡住。
  const showGenerating = running && targetShown >= actions.length && batchStart >= actions.length;
  // 逐条揭示（用户要求）：服务端可能把整组执行意图一次性下发（plan.summary），
  // 直接渲染就会「一下全冒出来」。整块内容排成一条序列——
  // 行动说明 → 折叠短语 → 每条动作 → 「正在生成回答」，第一条立刻出现，
  // 之后每条间隔 400ms。历史/已完成任务（animateIn=false 或已结束）直接全量。
  const staggered = running && animateIn;
  const headRows = (hasSummary ? 1 : 0) + (actions.length > 0 ? 1 : 0);
  const targetStep = headRows + targetShown + (showGenerating ? 1 : 0);
  const [step, setStep] = useState(0);
  // 行动说明（用户可见的推理摘要）也要打字机效果：这一行打完再出下一行，
  // 否则文字还没出现完，折叠短语/动作行就顶上来了。
  const [summaryTyped, setSummaryTyped] = useState(false);
  useEffect(() => { if (!staggered) setSummaryTyped(true); }, [staggered]);
  useEffect(() => {
    if (!staggered || step >= targetStep) return;
    if (step === 1 && hasSummary && !summaryTyped) return;
    const id = window.setTimeout(() => setStep(s => s + 1), step === 0 ? 0 : 400);
    return () => window.clearTimeout(id);
  }, [staggered, step, targetStep, summaryTyped, hasSummary]);
  const revealed = staggered ? Math.min(step, targetStep) : targetStep;
  const showSummary = hasSummary && revealed >= 1;
  const showTitle = actions.length > 0 && revealed >= (hasSummary ? 1 : 0) + 1;
  const shown = Math.max(0, Math.min(revealed - headRows, targetShown));
  const generatingShown = showGenerating && revealed >= headRows + targetShown + 1;
  // 动作列表：执行中必须用静态容器。ToolLoading 的扫描效果靠 background-clip:text，
  // 一旦套上 framer-motion 的 opacity/height 入场动画（会创建合成层，动画期间 opacity:0），
  // 文字会整段透明不可见，看起来就是「工具调用没有 loading」。
  const list = (
    <div className="flex flex-col gap-[12px]">
      {actions.slice(0, shown).map(({ label, icon }, index) => {
        // 被中断的一轮：正在跑的那一步不会再跑下去，不显示转圈，
        // 也不把它算成已完成（文案保持原样，不做「正在…」→「已…」的改写）。
        const pending = !stopped && index >= batchStart;
        return (
          <div key={`${label}-${index}`} className="flex items-center gap-[8px] text-[14px] leading-[22px] text-[rgba(0,0,0,0.88)] tracking-[0.014px]">
            {pending ? <RadarArcLoader /> : <TaskIcon type={icon} />}
            {pending ? <ToolLoading text={runningActionText(label)} /> : <span>{label}</span>}
          </div>
        );
      })}
      {/* 动作都跑完、但正文还没开始（模型在生成回答）时继续给一行 loading，
          否则工具结束后会有几秒完全静止，看起来像卡住；同样按 400ms 排在最后出现 */}
      {generatingShown && (
        <div className="flex items-center gap-[8px] text-[14px] leading-[22px] tracking-[0.014px]">
          <RadarArcLoader />
          <ToolLoading text="正在生成回答" />
        </div>
      )}
      <div ref={stepEndRef} aria-hidden className="h-px w-full shrink-0" />
    </div>
  );
  return (
    <div className="flex flex-col gap-[12px]">
      {showSummary && <p className="text-[14px] leading-[22px] text-[rgba(0,0,0,0.88)] tracking-[0.014px]"><Typewriter text={running || stopped ? summary : doneSummary(summary)} speed={staggered ? 26 : 16} onDone={() => setSummaryTyped(true)} /></p>}
      {showTitle && (
        <button onClick={() => setExpanded(v => !v)} className="flex self-start items-center gap-[8px] text-left">
          {/* 折叠入口写「这一组动作在做什么」的静态短语（天气查询与出行建议），
              不是「显示执行意图」这种功能名——那是内部叫法，不该出现在界面上 */}
          <span className="text-[14px] leading-[22px] text-[rgba(0,0,0,0.38)] tracking-[0.014px] whitespace-nowrap font-normal">{title || "执行过程"}</span>
          <TaskIcon type="chevron" expanded={expanded} />
        </button>
      )}
      {expanded && actions.length > 0 && (running
        ? list
        : <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} transition={{ duration: 0.2, ease: "easeOut" }} className="flex flex-col gap-[12px] overflow-hidden">{list}</motion.div>)}
    </div>
  );
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

const PROCESS_PRESETS: Record<ProcessVariant, ProcessPreset> = {
  requirement: {
    summary: "正在梳理演示场景与表达要求",
    running: "正在梳理制作需求",
    title: "需求梳理",
    actions: [
      { label: "读取项目背景与参考资料", icon: "react-read" },
      { label: "拆解受众与表达重点", icon: "react-analyze" },
      { label: "拟定页数与风格建议", icon: "react-generate" },
      { label: "汇总待确认的需求清单", icon: "react-summarize" },
    ],
  },
  outline: {
    summary: "正在编排页面结构与叙事顺序",
    running: "正在编排大纲结构",
    title: "大纲编排",
    actions: [
      { label: "载入已确认的需求", icon: "react-read" },
      { label: "拆解叙事层级与重点", icon: "react-analyze" },
      { label: "编排页面顺序与标题", icon: "react-generate" },
      { label: "核对大纲的完整与均衡", icon: "react-check" },
      { label: "输出可确认的大纲", icon: "react-summarize" },
    ],
  },
  ppt: {
    summary: "正在撰写每页内容并渲染页面",
    running: "正在生成页面内容",
    title: "页面生成",
    actions: [
      { label: "载入已确认的大纲", icon: "react-read" },
      { label: "撰写每页正文内容", icon: "react-generate" },
      { label: "匹配版式与配图方案", icon: "react-analyze" },
      { label: "渲染页面与图表", icon: "react-execute" },
      { label: "检查排版与内容一致性", icon: "react-check" },
      { label: "输出可预览文件", icon: "react-summarize" },
    ],
  },
};

function ExecutionProcess({ running, stopped = false, instant = false, progress, controlled = false, summary, rounds, onProgress, variant = "requirement", preset: customPreset, onGoalDone }: { running: boolean; stopped?: boolean; instant?: boolean; progress?: { shown: number; batchStart: number }; controlled?: boolean; summary?: string; rounds?: AgentRound[]; onProgress?: (p: { shown: number; batchStart: number }) => void; variant?: ProcessVariant; preset?: ProcessPreset; onGoalDone?: () => void }) {
  const preset = customPreset ?? PROCESS_PRESETS[variant];
  const actions = preset.actions;
  const total = actions.length;
  // 被用户中断的一轮：收尾文案是「已停止生成」，不能写成「任务已完成」。
  const finishedLabel = stopped ? "已停止生成" : "任务已完成";
  // 恢复用的进度快照（不放进 effect 依赖，避免上报后自我重置）
  const progressRef = useRef(progress);
  progressRef.current = progress;
  const onProgressRef = useRef(onProgress);
  onProgressRef.current = onProgress;
  const [expanded, setExpanded] = useState(Boolean(instant && running));
  // 完成态里「显示执行意图」单独一层折叠，和外层「任务已完成」互不影响
  const [intentExpanded, setIntentExpanded] = useState(false);
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
  const goalSpeed = Math.min(30, Math.max(5, Math.round(2200 / Math.max(1, (preset.goal ?? "").length))));
  // 真 agent 链路不展示「任务目标：…」引导句：等待阶段直接显示带扫描效果的「正在思考」。
  // 演示链路现在也改用规范的两层结构（行动说明 + 折叠短语 + 动作），不再有「任务目标」打字机，
  // 只有仍带 goal 的旧数据才保留打字效果。
  const showGoal = !controlled && Boolean(preset.goal);
  const stepsReady = controlled || goalTyped;

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
    // 历史消息：goal 已视为展示完毕，避免子组件 onDone 先于本 effect 执行后被重置为 false；
    // 没有 goal 打字机（新结构：行动说明直接显示）时同样视为已就绪，否则动作永远不揭示。
    setGoalTyped(instant || !showGoal);
  }, [running, total, instant, showGoal]);

  // 把执行进度回写到消息上，切走任务再回来时能接着显示
  useEffect(() => {
    if (!running || instant || controlled) return; // 受控模式的进度来自服务端，不需要回写
    onProgressRef.current?.({ shown: visibleActions, batchStart });
  }, [running, visibleActions, batchStart, instant, controlled]);

  // 真 agent 受控模式：步骤完全由服务端 tool.call/tool.result 推进，不跑本地逐批揭示定时器。
  // 同时把 progress 同步进本地 state（用于滚动/展开），并强制 goal 视为已打完、列表展开。
  useEffect(() => {
    if (!controlled || !running) return;
    setGoalTyped(true);
    setExpanded(true);
    const shown = progress?.shown ?? visibleActions;
    setVisibleActions(shown);
    setBatchStart(progress?.batchStart ?? shown);
  }, [controlled, running, progress?.shown, progress?.batchStart]);

  // reveal the tools only after the goal typewriter has actually finished
  useEffect(() => {
    if (!running || !goalTyped) return;
    if (controlled) return; // 真 agent：进度由服务端事件驱动，不用本地伪节奏
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

  // keep the newest step in view while the agent is running —— 但只在用户仍贴着底部时跟，
  // 用户自己往上翻了就别把他拽回来（工具步骤会一条条出现，抢滚动会很难读）。
  useEffect(() => {
    if (!running || visibleActions === 0) return;
    const node = stepEndRef.current;
    if (!node) return;
    const scroller = node.closest("[data-chat-scroll]") as HTMLElement | null;
    if (scroller && scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight > 80) return;
    node.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [visibleActions, running]);

  // 真 agent 多轮工具：**所有任务一律不分拆**（用户明确要求）。不管跑多少轮工具、
  // 调多少个工具，界面上永远只有一个任务块：一条任务级行动说明（第一轮下发、
  // 完成态把「正在」改成「已」）+ 一个折叠短语 + 一个合并去重后的动作列表
  // （compressActions：天气查询合并成「获取A和B天气」，其余动作按文案去重）。
  // 任务完成后（Figma 4379:44310）整块收进一行灰色「任务已完成 〉」。
  if (controlled && rounds && rounds.length > 0) {
    const allActions = compressActions(rounds.flatMap(round => round.actions));
    const headRound = rounds[0];
    const mergedProgress = {
      shown: rounds.reduce((sum, round) => sum + (round.progress?.shown ?? round.actions.length), 0),
      batchStart: rounds.reduce((sum, round) => sum + (round.progress?.batchStart ?? round.actions.length), 0),
    };
    if (!running) {
      return (
        <div className="w-full max-w-[768px] flex flex-col gap-[12px]">
          <button onClick={() => setExpanded(v => !v)} className="flex self-start items-center gap-[4px] text-left">
            <span className="text-[14px] leading-[22px] text-[rgba(0,0,0,0.38)] tracking-[0.014px] whitespace-nowrap font-normal">{finishedLabel}</span>
            <TaskIcon type="chevron" expanded={expanded} />
          </button>
          {expanded && <div className="flex flex-col gap-[20px]">
            <IntentBlock running={false} stopped={stopped} animateIn={false} summary={headRound.summary} title={headRound.title} actions={allActions} progress={mergedProgress} />
          </div>}
        </div>
      );
    }
    return (
      <div className="w-full max-w-[768px] flex flex-col gap-[20px]">
        <IntentBlock running={running} animateIn={!instant} summary={headRound.summary} title={headRound.title} actions={allActions} progress={mergedProgress} stepEndRef={stepEndRef} />
      </div>
    );
  }

  if (!running) {
    // 完成后整块收进「任务已完成 〉」（Figma 4379:44310），展开后才是
    // 行动说明 → 折叠短语 → 动作行。真 agent 与演示链路（卡片 / PPT）现在同一套结构。
    if (controlled || preset.summary) {
      const intentSummary = (summary ?? preset.summary ?? "").trim();
      return (
        <div className="w-full max-w-[768px] flex flex-col gap-[12px]">
          <button onClick={() => setExpanded(v => !v)} className="flex self-start items-center gap-[4px] text-left">
            <span className="text-[14px] leading-[22px] text-[rgba(0,0,0,0.38)] tracking-[0.014px] whitespace-nowrap font-normal">{finishedLabel}</span>
            <TaskIcon type="chevron" expanded={expanded} />
          </button>
          {expanded && <div className="flex flex-col gap-[12px]">
            {intentSummary && <p className="text-[14px] leading-[22px] text-[rgba(0,0,0,0.88)] tracking-[0.014px]">{intentSummary}</p>}
            {actions.length > 0 && (
              <button onClick={() => setIntentExpanded(v => !v)} className="flex self-start items-center gap-[8px] text-left">
                <span className="text-[14px] leading-[22px] text-[rgba(0,0,0,0.38)] tracking-[0.014px] whitespace-nowrap font-normal">{preset.title ?? "执行过程"}</span>
                <TaskIcon type="chevron" expanded={intentExpanded} />
              </button>
            )}
            {intentExpanded && <div className="flex flex-col gap-[12px]">
              {actions.map(({ label, icon }) => <div key={label} className="flex items-center gap-[8px] text-[14px] leading-[22px] text-[rgba(0,0,0,0.88)] tracking-[0.014px]"><TaskIcon type={icon} /><span>{label}</span></div>)}
            </div>}
          </div>}
        </div>
      );
    }
    return (
      <div className="w-full max-w-[768px] flex flex-col gap-[12px]">
        <>
          <button onClick={() => setExpanded(v => !v)} className="flex self-start items-center gap-[8px] text-left">
            <span className="text-[14px] leading-[22px] text-[rgba(0,0,0,0.38)] tracking-[0.014px] whitespace-nowrap font-normal">{preset.running}</span>
            <TaskIcon type="chevron" expanded={expanded} />
          </button>
          {expanded && <div className="flex flex-col gap-[12px]">
            {showGoal && <p className="text-[14px] leading-[22px] text-[rgba(0,0,0,0.88)] tracking-[0.014px]">{preset.goal}</p>}
            {actions.map(({ label, icon }) => <div key={label} className="flex items-center gap-[8px] text-[14px] leading-[22px] text-[rgba(0,0,0,0.88)] tracking-[0.014px]"><TaskIcon type={icon} /><span>{label}</span></div>)}
          </div>}
        </>
      </div>
    );
  }
  // 演示链路（卡片 / PPT 三阶段）：结构、文案规范与真 agent 完全一致，
  // 只是动作进度由本地的逐条揭示（visibleActions / batchStart）驱动。
  if (!controlled && preset.summary) {
    return (
      <div className="w-full max-w-[768px]">
        <IntentBlock
          running
          animateIn={false}
          summary={preset.summary}
          title={preset.title}
          actions={actions}
          progress={{ shown: visibleActions, batchStart }}
          stepEndRef={stepEndRef}
        />
      </div>
    );
  }
  return (
    <div className="w-full max-w-[768px] flex flex-col gap-[12px]">
      {showGoal && <p className="text-[14px] leading-[22px] font-normal text-[rgba(0,0,0,0.88)] tracking-[0.014px]"><Typewriter instant={instant} text={preset.goal!} speed={goalSpeed} onDone={() => { setGoalTyped(true); onGoalDone?.(); }} /></p>}
      {stepsReady && (<>
        {controlled ? (
          !summary?.trim() ? (
            <div className="flex items-center"><ToolLoading text={preset.running} /></div>
          ) : (
            <>
              <p className="text-[14px] leading-[22px] text-[rgba(0,0,0,0.88)] tracking-[0.014px]">{summary}</p>
              {actions.length > 0 && (
                <button onClick={() => setExpanded(v => !v)} className="flex self-start items-center gap-[8px] text-left">
                  <span className="text-[14px] leading-[22px] text-[rgba(0,0,0,0.38)] tracking-[0.014px] whitespace-nowrap font-normal">{preset.title ?? "执行过程"}</span>
                  <TaskIcon type="chevron" expanded={expanded} />
                </button>
              )}
            </>
          )
        ) : (
          <button onClick={() => setExpanded(v => !v)} className="flex self-start items-center gap-[8px] text-left">
            <span className="text-[14px] leading-[22px] text-[rgba(0,0,0,0.38)] tracking-[0.014px] whitespace-nowrap font-normal">{preset.running}</span>
            <TaskIcon type="chevron" expanded={expanded} />
          </button>
        )}
        {expanded && actions.length > 0 && <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} transition={{ duration: 0.2, ease: "easeOut" }} className="flex flex-col gap-[12px] overflow-hidden">
          {actions.slice(0, visibleActions).map(({ label, icon }, index) => <motion.div key={label} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.18, ease: "easeOut" }} className="flex items-center gap-[8px] text-[14px] leading-[22px] text-[rgba(0,0,0,0.88)] tracking-[0.014px]">
            {index >= batchStart ? <RadarArcLoader /> : <TaskIcon type={icon} />}
            {index >= batchStart ? <ToolLoading text={runningActionText(label)} /> : <span>{label}</span>}
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
      <button onClick={() => setExpanded(v => !v)} className="flex self-start items-center gap-[8px] text-left">
        <span className="text-[14px] leading-[22px] text-[rgba(0,0,0,0.38)] tracking-[0.014px] whitespace-nowrap font-normal">任务已完成</span>
        <TaskIcon type="chevron" expanded={expanded} />
      </button>
      {expanded && <div className="flex flex-col gap-[20px]">
        {presets.map((preset, vi) => {
          return (
            <IntentBlock
              key={vi}
              running={false}
              animateIn={false}
              summary={preset.summary ?? preset.running}
              title={preset.title}
              actions={preset.actions}
              progress={{ shown: preset.actions.length, batchStart: preset.actions.length }}
            />
          );
        })}
      </div>}
    </div>
  );
}

export { ExecutionProcess, MergedProcess, PROCESS_PRESETS, intentIcon, toToolKind, runningActionText };
