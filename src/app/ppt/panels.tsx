import { useCallback, useEffect, useRef, useState } from "react";
import { OperationMenu } from "../components/operation-menu";
import svgPaths from "@/imports/默认首页-1/svg-4ly00k0kqz";
import svgPanel from "@/imports/需求确认-1/svg-1yxmq1shfb";
import svgOutline from "@/imports/大纲/svg-fzbroqn38q";
import svgPresentation from "@/imports/Ppt-1/svg-b6redky6le";
import svgPptToggle from "@/imports/Container/svg-ky29gei8j7";
import imgStyle1 from "@/imports/需求确认-1/29d4a489057188d7298a9a9f8b923d2d9c630925.png";
import imgStyle2 from "@/imports/需求确认-1/f49f63a62b02589f759f36fc0961c6709a8e1bdf.png";
import imgStyle3 from "@/imports/需求确认-1/9b2936619dc23e46dde47ce229cadb09c1b911ab.png";
import type { OutlinePage, PptMode, PptPageCount } from "./types";

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

// 弹层固定 800 宽。
const PANEL_WIDTH = 800;
// 弹层右边缘与窗口右边缘之间至少留的间距。
const PANEL_VIEWPORT_GAP = 16;

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
        width: PANEL_WIDTH, maxHeight: 560, bottom: 22,
        // 弹层默认居中在主内容区（mainOffset = 侧栏宽度的一半）。
        // 侧栏可以拖宽，主内容区随之变窄，弹层跟着右移就会把右边缘顶出窗口，
        // 关闭按钮落到屏幕外点不到 —— 这里把居中位置限制在「右边缘离窗口 16px」以内，
        // 保证关闭 / 确认控件始终在屏幕内可点。
        left: `min(calc(50% + ${mainOffset}px), calc(100% - ${PANEL_WIDTH / 2 + PANEL_VIEWPORT_GAP}px))`,
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

function CloseBtn({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button onClick={onClick} aria-label={label} className="w-[24px] h-[24px] flex items-center justify-center rounded-[4px] hover:bg-[#f7f7f7] shrink-0 cursor-pointer">
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
          <CloseBtn label="关闭需求确认" onClick={onClose} />
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
            {(["5～8页", "8～12页", "12～18页"] as PptPageCount[]).map(s => (
              <OptionItem key={s} label={s} selected={pages === s} onClick={() => setPages(s as "5～8页" | "8～12页" | "12～18页")} />
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
          ? { type: "text" as const, text: p.content.type === "text" ? p.content.text + "（已根据您的需求调整）" : (p.content as unknown as { text: string }).text }
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
          <CloseBtn label="关闭大纲" onClick={onClose} />
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

export { AIIcon, RequirementPanel, OutlinePanel, PptGenerationToggle, PptSettingPicker, mockOutlinePages };
export type { PptSettingPickerProps };
