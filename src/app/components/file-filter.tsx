import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import { createPortal } from "react-dom";
import { addMonths, addYears, endOfDay, format, startOfDay, subDays } from "date-fns";
import { zhCN } from "date-fns/locale";
import type { DateRange } from "react-day-picker";
import { OperationMenu } from "./operation-menu";
import { ProjectMemberTag } from "./project-settings-dialogs";
import { Calendar } from "./ui/calendar";
import "./library-view.css";

// 文件筛选：资料库与项目「来源 / 产物」共用同一套字段与交互
// 字段（Figma 10045:64279）：状态（仅来源：已启用 / 停用）+ 格式（文档 / 表格 / 其他）
//   + 上传人（仅来源：我 / 其他人）+ 更新时间（近 7 天 / 近 30 天 / 自定义区间）
export type FileFormat = "文档" | "表格" | "文件夹" | "其他";
// 与 project-files 的 SourceStatus 同一口径，只是不带业务前缀
export type FileStatus = "enabled" | "disabled";
export const FILE_STATUS_OPTIONS: { value: FileStatus; label: string }[] = [
  { value: "enabled", label: "已启用" },
  { value: "disabled", label: "停用" },
];
export type TimeFilter =
  | { kind: "recent"; days: 7 | 30 }
  | { kind: "custom"; from: Date; to: Date }
  | null;

// 「上传人」筛选（Figma 10045:64279）：「我」是一个独立开关，成员多选放在「其他人」里
export type UploaderFilter = { mine: boolean; members: string[] };
export const EMPTY_UPLOADER_FILTER: UploaderFilter = { mine: false, members: [] };
// 当前用户上传的文件在数据里固定记为「我」
export const SELF_OWNER = "我";

export const FILE_FORMATS: FileFormat[] = ["文档", "表格", "其他"];
// 附件面板的「格式」多一项「文件夹」（Figma 10069:64630）：云盘树里文件夹/站点也是可选条目
export const CLOUD_FORMATS: FileFormat[] = ["文档", "表格", "文件夹", "其他"];

// 「选择成员」里头像胶囊的底色：按名字做稳定映射，同一个人每次都是同一个颜色
const OWNER_COLORS = ["#1e63f5", "#00bfc4", "#00c853", "#ff2442", "#ffcc00", "#9254ff"];
function ownerColor(name: string) {
  let hash = 0;
  for (const char of name) hash = (hash * 31 + (char.codePointAt(0) ?? 0)) >>> 0;
  return OWNER_COLORS[hash % OWNER_COLORS.length];
}

export function isUploaderFilterActive(filter?: UploaderFilter) {
  return Boolean(filter && (filter.mine || filter.members.length > 0));
}

// 已选成员摘要：1 人显示姓名；2 人「A、B」；更多人「A、B等 N人」（Figma 10045:64279 的「张三、李四等 9人」）
export function describeUploaders(members: string[]) {
  if (members.length === 0) return "";
  if (members.length === 1) return members[0];
  if (members.length === 2) return `${members[0]}、${members[1]}`;
  return `${members[0]}、${members[1]}等 ${members.length}人`;
}

export function formatByExtension(name: string): FileFormat {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "pdf" || ["doc", "docx"].includes(ext)) return "文档";
  if (["xls", "xlsx", "csv"].includes(ext)) return "表格";
  return "其他";
}

export function displayDate(date: Date) {
  return format(date, "yyyy.M.d");
}

export function hasActiveFileFilters(formats: FileFormat[], timeFilter: TimeFilter, uploader?: UploaderFilter, statuses?: FileStatus[]) {
  return formats.length > 0 || timeFilter !== null || isUploaderFilterActive(uploader) || Boolean(statuses?.length);
}

// 名称 / 状态 / 格式 / 上传人 / 更新时间 五项命中判定，资料库与项目文件列表共用
export function matchFileFilters(
  file: { name: string; format: FileFormat; modified: Date; owner?: string; status?: FileStatus },
  options: { query?: string; formats: FileFormat[]; timeFilter: TimeFilter; uploader?: UploaderFilter; statuses?: FileStatus[] },
) {
  const query = options.query?.trim().toLocaleLowerCase() ?? "";
  if (query && !file.name.toLocaleLowerCase().includes(query)) return false;
  if (options.formats.length && !options.formats.includes(file.format)) return false;
  if (options.statuses?.length && (!file.status || !options.statuses.includes(file.status))) return false;
  const uploader = options.uploader;
  if (isUploaderFilterActive(uploader) && uploader) {
    const mine = uploader.mine && file.owner === SELF_OWNER;
    const picked = uploader.members.length > 0 && Boolean(file.owner) && uploader.members.includes(file.owner as string);
    if (!mine && !picked) return false;
  }
  const { timeFilter } = options;
  if (!timeFilter) return true;
  const today = startOfDay(new Date());
  const from = timeFilter.kind === "recent" ? subDays(today, timeFilter.days - 1) : timeFilter.from;
  const to = timeFilter.kind === "recent" ? today : timeFilter.to;
  return file.modified >= startOfDay(from) && file.modified <= endOfDay(to);
}

// 双月并排浮层总宽：每月 288px（含内部 padding / 分隔线），共 576px。
// 定位时按此宽度预留，保证「左边缘距内容区 ≥ 16px」的判断与实际渲染一致。
const CALENDAR_POPOVER_WIDTH = 576;

// react-day-picker 统一 class 映射（两种布局共用同一套日期格样式）
const CALENDAR_CLASSNAMES = {
  months: "block", caption: "sr-only", nav: "hidden", month: "block",
  table: "library-calendar-grid", head: "sr-only", head_row: "sr-only",
  head_cell: "sr-only", row: "library-calendar-week",
  cell: "library-calendar-cell", day: "library-calendar-day",
  day_selected: "library-day-selected", day_range_start: "library-range-start",
  day_range_end: "library-range-end", day_range_middle: "library-range-middle",
  day_today: "library-day-today",
};

type CalendarPlacement = { mode: "popover"; left: number; top: number } | { mode: "sheet" };

// 双月并排浮层：Figma 9830:74921（9849:42184）。固定在筛选菜单左侧、顶部对齐「自定义」行，
// 不翻边、不遮挡标题；每月独立«‹月›»翻页头 + 分隔线 + 星期头。
function RangeCalendarPopover({ value, placement, containerRef, onSelect }: {
  value: TimeFilter;
  placement: Extract<CalendarPlacement, { mode: "popover" }>;
  containerRef: RefObject<HTMLDivElement | null>;
  onSelect: (from: Date, to: Date) => void;
}) {
  const [start, setStart] = useState<Date | undefined>();
  const [month, setMonth] = useState(() => value?.kind === "custom" ? value.from : new Date());
  const [top, setTop] = useState(placement.top);
  const selected: DateRange | undefined = start ? { from: start, to: undefined }
    : value?.kind === "custom" ? { from: value.from, to: value.to } : undefined;
  useEffect(() => {
    setStart(undefined);
    setMonth(value?.kind === "custom" ? value.from : new Date());
  }, []);
  // 顶部对齐锚点行，但在视口底部放不下时只允许整体上移，绝不横向翻边。
  useLayoutEffect(() => {
    const node = containerRef.current;
    if (!node) return;
    const maxTop = Math.max(8, window.innerHeight - node.offsetHeight - 8);
    setTop(Math.max(8, Math.min(placement.top, maxTop)));
  }, [containerRef, placement.top, month]);
  const chooseDay = (day: Date) => {
    if (!start) { setStart(day); return; }
    const from = day < start ? day : start;
    const to = day < start ? start : day;
    setStart(undefined);
    onSelect(startOfDay(from), startOfDay(to));
  };
  const months = [month, addMonths(month, 1)];
  const grid = (shownMonth: Date, index: number) => <Calendar
    mode="range" month={shownMonth} onMonthChange={next => setMonth(addMonths(next, -index))}
    selected={selected} onDayClick={chooseDay} locale={zhCN} weekStartsOn={0} showOutsideDays={false}
    className="p-0" fixedWeeks classNames={CALENDAR_CLASSNAMES} />;
  return createPortal(
    <div ref={containerRef} role="dialog" aria-label="选择日期" className="library-surface library-calendar-popover"
      style={{ position: "fixed", left: placement.left, top, zIndex: 400 }}>
      {months.map((shownMonth, index) => <div key={index} className="library-cal-month">
        <div className="library-cal-head">
          <button type="button" aria-label="上一年" onClick={() => setMonth(current => addYears(current, -1))}><img src="/assets/cal-double-left.svg" alt="" /></button>
          <button type="button" aria-label="上个月" onClick={() => setMonth(current => addMonths(current, -1))}><img src="/assets/cal-left.svg" alt="" /></button>
          <span>{format(shownMonth, "yyyy年M月")}</span>
          <button type="button" aria-label="下个月" onClick={() => setMonth(current => addMonths(current, 1))}><img src="/assets/cal-right.svg" alt="" /></button>
          <button type="button" aria-label="下一年" onClick={() => setMonth(current => addYears(current, 1))}><img src="/assets/cal-double-right.svg" alt="" /></button>
        </div>
        <div className="library-cal-divider" />
        <div className="library-cal-weekdays" aria-hidden>
          {["日", "一", "二", "三", "四", "五", "六"].map(label => <span key={label}>{label}</span>)}
        </div>
        {grid(shownMonth, index)}
      </div>)}
    </div>,
    document.body,
  );
}

// 底部弹出的「选择日期范围」抽屉：严格按 Figma 9849:55044
// 双月上下堆叠 + 顶部标题栏（选择日期 / 关闭）。
function DateRangeSheet({ value, open, onClose, onSelect }: {
  value: TimeFilter;
  open: boolean;
  onClose: () => void;
  onSelect: (from: Date, to: Date) => void;
}) {
  const [start, setStart] = useState<Date | undefined>();
  const [month, setMonth] = useState(() => value?.kind === "custom" ? value.from : new Date());
  const selected: DateRange | undefined = start ? { from: start, to: undefined }
    : value?.kind === "custom" ? { from: value.from, to: value.to } : undefined;

  useEffect(() => {
    if (open) {
      setStart(undefined);
      setMonth(value?.kind === "custom" ? value.from : new Date());
    }
  }, [open]);

  const chooseDay = (day: Date) => {
    if (!start) {
      setStart(day);
      return;
    }
    const from = day < start ? day : start;
    const to = day < start ? start : day;
    setStart(undefined);
    onSelect(startOfDay(from), startOfDay(to));
  };
  if (!open) return null;
  const months = [month, addMonths(month, 1)];
  return createPortal(
    <div className="library-date-layer library-surface" role="presentation">
      <div className="library-date-backdrop" onClick={onClose} />
      <div className="library-date-sheet" role="dialog" aria-modal="true" aria-label="选择日期">
        <div className="library-date-sheet-head">
          <span className="library-date-sheet-title">选择日期</span>
          <button type="button" aria-label="关闭" onClick={onClose} className="library-date-close">
            <img src="/assets/search-dialog-close.svg" alt="" />
          </button>
        </div>
        <div className="library-date-weekdays" aria-hidden>
          {["日", "一", "二", "三", "四", "五", "六"].map(label => <span key={label}>{label}</span>)}
        </div>
        <div className="sr-only" aria-live="polite">
          {start ? `已选开始日期 ${displayDate(start)}，请选择结束日期` : value?.kind === "custom" ? `${displayDate(value.from)} ~ ${displayDate(value.to)}` : "请选择开始日期和结束日期"}
        </div>
        <div className="library-date-months">
          {months.map((shownMonth, index) => (
            <div key={index} className="library-date-month-block">
              <div className="library-date-month-title">{format(shownMonth, "yyyy年M月")}</div>
              <Calendar mode="range" month={shownMonth} onMonthChange={next => setMonth(addMonths(next, -index))} selected={selected} onDayClick={chooseDay} locale={zhCN} weekStartsOn={0} showOutsideDays={false}
                className="p-0" fixedWeeks classNames={CALENDAR_CLASSNAMES} />
            </div>
          ))}
        </div>
      </div>
    </div>,
    document.body,
  );
}

// 菜单底部「重置筛选项」行（Figma 9773:69397）：分隔线 + 刷新图标 + 文字。
// 三套下拉筛选面板（资料库 / 项目来源产物 / 选择文件 / 附件）共用，
// 由调用方按需渲染 —— 只有任一筛选项生效时才出现。
export function FilterResetRow({ onReset }: { onReset: () => void }) {
  return <>
    <div aria-hidden className="mx-[8px] my-[4px] h-[1px] bg-[#f2f2f2]" />
    <button type="button" role="menuitem" onClick={onReset}
      className="flex h-[44px] w-full cursor-pointer items-center gap-[8px] rounded-[8px] px-[8px] py-[11px] text-left text-[14px] font-normal leading-[22px] tracking-[0.014px] text-[rgba(0,0,0,0.88)] hover:bg-[#f2f2f2]">
      <img src="/assets/msg-refresh.svg" alt="" className="size-[16px] shrink-0" />
      <span>重置筛选项</span>
    </button>
  </>;
}

// 筛选按钮 + 菜单 + 日期浮层/抽屉，资料库与项目「来源 / 产物」共用，
// 保证字段、选中态、hover、点击响应与键盘行为完全一致。
export function FileFilterButton({ active = true, selectedFormats, onFormatsChange, formatOptions = FILE_FORMATS, timeFilter, onTimeFilterChange, statuses, onStatusesChange, uploader, onUploaderChange, uploaderOptions, ariaLabel = "筛选", onOpenChange, menuTitle, showCount = false }: {
  // 页面切走后传 false，自动收起菜单与日期层，避免浮层残留在隐藏页面上
  active?: boolean;
  selectedFormats: FileFormat[];
  onFormatsChange: (next: FileFormat[]) => void;
  // 格式分组的选项，默认资料库/项目的「文档/表格/其他」；附件面板传含「文件夹」的 CLOUD_FORMATS
  formatOptions?: FileFormat[];
  // 菜单开合回调：外层 Popover 需要据此拦截 Esc，先关筛选菜单而不是关掉整个面板
  onOpenChange?: (open: boolean) => void;
  // 菜单标题：SharePoint 站点内显示「筛选 · {站点名}」，提示条件只作用于当前站点
  menuTitle?: string;
  // 有生效条件时在图标右上角显示角标，数字=生效字段个数（附件面板各层级使用）
  showCount?: boolean;
  timeFilter: TimeFilter;
  onTimeFilterChange: (next: TimeFilter) => void;
  // 「状态」这一组只有项目「来源」需要（文件有启用 / 停用态）；不传 onStatusesChange 时整组不渲染
  statuses?: FileStatus[];
  onStatusesChange?: (next: FileStatus[]) => void;
  // 「上传人」这一组只有项目「来源」需要；不传 onUploaderChange 时整组不渲染。
  // 支持函数式更新：连续快速勾选多个成员时，每次都基于最新值合并，不会互相覆盖。
  uploader?: UploaderFilter;
  onUploaderChange?: (next: UploaderFilter | ((prev: UploaderFilter) => UploaderFilter)) => void;
  // 「其他人」里可选的成员（取当前列表里出现过的上传人，排除「我」）
  uploaderOptions?: string[];
  ariaLabel?: string;
}) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const ownerPickerRef = useRef<HTMLDivElement>(null);
  // 「选择成员」浮层的锚点行：未选时是「其他人」，已选时是摘要行（两者互斥渲染）。
  // 必须用 state 存节点：勾选成员后行会被替换，若继续用 ref，OperationMenu 拿到的
  // 还是已卸载的旧按钮（rect 全 0），面板会被兜底定位到视口左上角。
  const [otherRow, setOtherRow] = useState<HTMLButtonElement | null>(null);
  const ownerSearchRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [calendarPlacement, setCalendarPlacement] = useState<CalendarPlacement | null>(null);
  const [calendarAnchor, setCalendarAnchor] = useState<HTMLButtonElement | null>(null);
  const [ownerPickerOpen, setOwnerPickerOpen] = useState(false);
  const [ownerQuery, setOwnerQuery] = useState("");
  const [ownerSearchFocused, setOwnerSearchFocused] = useState(false);
  const hasUploader = Boolean(uploader && onUploaderChange);
  const hasStatus = Boolean(statuses && onStatusesChange);
  const hasFilters = hasActiveFileFilters(selectedFormats, timeFilter, uploader, statuses);
  // 角标数按「字段」计而不是按选项个数计：格式/更新时间/状态/上传人各算一个字段
  const activeFieldCount = Number(selectedFormats.length > 0) + Number(timeFilter !== null)
    + Number(Boolean(statuses?.length)) + Number(isUploaderFilterActive(uploader));
  // 展开「选择成员」：与「自定义」日期一致，点击触发、点击外部或 Esc 收起，
  // 打开期间保持显示（支持连续多选，选完一个人不会自动消失）。
  // 搜索框默认就是激活态（Figma 9421:107428 Status=激活）：先置 focused 让下划线/放大镜立刻变蓝，
  // 再由 useEffect 真正把焦点交给输入框。
  const openOwnerPicker = () => {
    setOwnerPickerOpen(true);
    setOwnerSearchFocused(true);
  };
  const closeOwnerPicker = () => {
    setOwnerPickerOpen(false);
    setOwnerQuery("");
    setOwnerSearchFocused(false);
  };
  // OperationMenu 首帧是 visibility:hidden（定位测量完才显示），此时 input.focus() 无效，
  // 因此等下一帧面板真正可见后再聚焦，保证「默认激活搜索框」稳定生效。
  useEffect(() => {
    if (!ownerPickerOpen) return;
    const frame = requestAnimationFrame(() => ownerSearchRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [ownerPickerOpen]);

  const closeCalendar = () => {
    setCalendarOpen(false);
    setCalendarPlacement(null);
    setCalendarAnchor(null);
  };

  useEffect(() => {
    if (active) return;
    setOpen(false);
    closeCalendar();
    closeOwnerPicker();
  }, [active]);

  // 菜单开合同步给外层：附件面板嵌在 Popover 里，需要知道筛选菜单是否展开来决定 Esc 的归属
  useEffect(() => { onOpenChange?.(open); }, [open, onOpenChange]);

  useEffect(() => {
    if (!open) return;
    const dismiss = (event: PointerEvent) => {
      if (!(event.target instanceof Node)) return;
      // 日期模态层（popover / 全屏 sheet）内的点击不应触发筛选菜单的关闭逻辑
      if (popoverRef.current?.contains(event.target)) return;
      if (event.target instanceof Element && event.target.closest(".library-date-layer")) return;
      // 「选择成员」面板同样挂在 body 上，点到它里面不算点外部
      if (ownerPickerRef.current?.contains(event.target)) return;
      if (buttonRef.current?.contains(event.target) || menuRef.current?.contains(event.target)) return;
      setOpen(false);
      closeCalendar();
      closeOwnerPicker();
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (calendarOpen) closeCalendar();
      else if (ownerPickerOpen) closeOwnerPicker();
      else setOpen(false);
    };
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", dismiss);
      document.removeEventListener("keydown", escape);
    };
  }, [open, calendarOpen, ownerPickerOpen]);

  // 只有两种布局：
  // 1) 双月并排浮层，放在筛选菜单左侧、顶部对齐「自定义」行；
  // 2) 放不下时改为上下堆叠的底部抽屉。
  // 切换条件：双月浮层左边缘距显示区域（屏幕）最左边必须 ≥ 16px。
  const openCalendar = (anchor: HTMLButtonElement) => {
    const menuRect = menuRef.current?.getBoundingClientRect();
    const anchorRect = anchor.getBoundingClientRect();
    const left = (menuRect?.left ?? anchorRect.left) - 4 - CALENDAR_POPOVER_WIDTH;
    setCalendarPlacement(left < 16 ? { mode: "sheet" } : { mode: "popover", left, top: anchorRect.top });
    setCalendarAnchor(anchor);
    setCalendarOpen(true);
  };

  const onCalendarSelect = (from: Date, to: Date) => {
    onTimeFilterChange({ kind: "custom", from, to });
    closeCalendar();
  };

  // 「重置筛选项」：把本面板负责的所有筛选字段一次性还原到默认值。
  // 状态/上传人这两组是可选的（资料库/产物不传），没有就不重置。
  const resetFilters = () => {
    onFormatsChange([]);
    onTimeFilterChange(null);
    if (onStatusesChange) onStatusesChange([]);
    if (onUploaderChange) onUploaderChange(EMPTY_UPLOADER_FILTER);
    closeCalendar();
    closeOwnerPicker();
  };

  useEffect(() => {
    if (!calendarOpen || !calendarAnchor) return;
    const onResize = () => {
      const menuRect = menuRef.current?.getBoundingClientRect();
      const anchorRect = calendarAnchor.getBoundingClientRect();
      const left = (menuRect?.left ?? anchorRect.left) - 4 - CALENDAR_POPOVER_WIDTH;
      setCalendarPlacement(left < 16 ? { mode: "sheet" } : { mode: "popover", left, top: anchorRect.top });
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [calendarOpen, calendarAnchor]);

  return <>
    <button ref={buttonRef} type="button" aria-label={ariaLabel} aria-expanded={open} aria-haspopup="dialog" onClick={() => {
      setOpen(current => !current);
      closeCalendar();
    }}       className={`library-filter-trigger ${hasFilters ? "library-filter-active" : ""}`}>
      <img src={hasFilters ? "/assets/88901.svg" : "/assets/filter-btn.svg"} alt="" />
      {showCount && activeFieldCount > 0 && <span aria-hidden className="library-filter-badge">{activeFieldCount}</span>}
    </button>
    {open && <OperationMenu
      ref={menuRef}
      anchor={buttonRef.current}
      align="auto"
      gap={4}
      role="dialog"
      aria-label={ariaLabel}
      className="library-surface library-filter-menu"
      // 点菜单里其它任何选项（状态 / 格式 / 我 / 时间）都收起「选择成员」面板与日期浮层，
      // 只保留「自定义」时间行本身（点它是打开/编辑日期）和上传人摘要行（点它是继续编辑成员）不被误关。
      // 两个浮层都挂在 body 上，点它们内部不会冒泡到菜单，所以这里只处理菜单内的点击。
      onClickCapture={event => {
        if (!(event.target instanceof Element)) return;
        if (event.target.closest(".library-time-row")) return;
        closeOwnerPicker();
        closeCalendar();
      }}
    >
      {menuTitle && <div className="library-filter-title">{menuTitle}</div>}
      {/* 状态（Figma 10045:64279）：已启用 / 停用，多选；表头「状态」列的同一份口径 */}
      {hasStatus && statuses && onStatusesChange && <>
        <div className="library-filter-heading">状态</div>
        {FILE_STATUS_OPTIONS.map(option => <button key={option.value} type="button" role="checkbox" aria-checked={statuses.includes(option.value)} onClick={() => onStatusesChange(statuses.includes(option.value) ? statuses.filter(value => value !== option.value) : [...statuses, option.value])} className="library-filter-item">
          {option.label}{statuses.includes(option.value) && <img src="/assets/ecd73.svg" alt="" />}
        </button>)}
      </>}
      <div className="library-filter-heading">格式</div>
      {formatOptions.map(item => <button key={item} type="button" role="checkbox" aria-checked={selectedFormats.includes(item)} onClick={() => onFormatsChange(selectedFormats.includes(item) ? selectedFormats.filter(value => value !== item) : [...selectedFormats, item])} className="library-filter-item">
        {item}{selectedFormats.includes(item) && <img src="/assets/ecd73.svg" alt="" />}
      </button>)}
      {hasUploader && uploader && onUploaderChange && <>
        {/* 上传人（Figma 10045:64279）：我 / 其他人；选了成员后「其他人」换成摘要行，
            摘要行的选中态与「自定义时间」完全一致 —— hover 出「编辑 + 删除」。
            「其他人」与「自定义」日期一致：点击展开「选择成员」面板，点外部或 Esc 收起，
            面板打开期间保持显示，方便连续勾选多个成员；搜索框默认激活。 */}
        <div className="library-filter-heading">上传人</div>
        <button type="button" role="checkbox" aria-checked={uploader.mine} onClick={() => onUploaderChange(prev => ({ ...prev, mine: !prev.mine }))} className="library-filter-item">
          我{uploader.mine && <img src="/assets/ecd73.svg" alt="" />}
        </button>
        {uploader.members.length === 0 ? (
          <button
            ref={setOtherRow}
            type="button"
            aria-haspopup="dialog"
            aria-expanded={ownerPickerOpen}
            onClick={openOwnerPicker}
            className="library-filter-item"
          >
            其他人<span aria-hidden className="flex size-[16px] shrink-0 items-center justify-center"><img src="/assets/c29c9.svg" alt="" /></span>
          </button>
        ) : (
          <div className="library-value-row" data-selected data-editing={ownerPickerOpen || undefined}>
            <button ref={setOtherRow} type="button" aria-label={`上传人筛选 ${describeUploaders(uploader.members)}`} onClick={openOwnerPicker} className="library-filter-item library-value-text">
              <span className="truncate">{describeUploaders(uploader.members)}</span>
            </button>
            <img src="/assets/ecd73.svg" alt="" className="library-value-check" />
            <div className="library-value-actions">
              <button type="button" aria-label="编辑上传人筛选" className="library-value-edit" onClick={openOwnerPicker}><img src="/assets/479d2.svg" alt="" /></button>
              <button type="button" aria-label="清除上传人筛选" onClick={() => { onUploaderChange(prev => ({ ...prev, members: [] })); closeOwnerPicker(); }}><img src="/assets/c134a.svg" alt="" /></button>
            </div>
          </div>
        )}
      </>}
      <div className="library-filter-heading">更新时间</div>
      {([7, 30] as const).map(days => <button key={days} type="button" role="radio" aria-checked={timeFilter?.kind === "recent" && timeFilter.days === days} onClick={() => {
        onTimeFilterChange(timeFilter?.kind === "recent" && timeFilter.days === days ? null : { kind: "recent", days });
        closeCalendar();
      }} className="library-filter-item">
        近 {days}天{timeFilter?.kind === "recent" && timeFilter.days === days && <img src="/assets/ecd73.svg" alt="" />}
      </button>)}
      <div className="library-value-row library-time-row" data-selected={timeFilter?.kind === "custom" || undefined} data-editing={calendarOpen || undefined}>
        <button type="button" aria-label={timeFilter?.kind === "custom" ? `自定义时间 ${displayDate(timeFilter.from)} 至 ${displayDate(timeFilter.to)}` : "自定义时间"} onClick={event => openCalendar(event.currentTarget)} className="library-filter-item library-value-text">
          <span className="truncate">{timeFilter?.kind === "custom" ? `${displayDate(timeFilter.from)} ~ ${displayDate(timeFilter.to)}` : "自定义"}</span>
        </button>
        {timeFilter?.kind === "custom" ? <>
          <img src="/assets/ecd73.svg" alt="" className="library-value-check" />
          <div className="library-value-actions">
            <button type="button" aria-label="编辑自定义时间" className="library-value-edit" onClick={event => openCalendar(event.currentTarget)}><img src="/assets/479d2.svg" alt="" /></button>
            <button type="button" aria-label="清除自定义时间" onClick={() => { onTimeFilterChange(null); closeCalendar(); }}><img src="/assets/c134a.svg" alt="" /></button>
          </div>
        </> : <img aria-hidden src="/assets/fb6a4.svg" alt="" className="library-value-check" />}
      </div>
      {/* Figma 9773:69397：任一筛选项生效后，菜单底部出现「重置筛选项」，点击一次性清空 */}
      {hasFilters && <FilterResetRow onReset={resetFilters} />}
    </OperationMenu>}
    {open && ownerPickerOpen && uploader && onUploaderChange && (
      <OperationMenu
        ref={ownerPickerRef}
        submenu
        anchor={otherRow}
        gap={4}
        role="dialog"
        aria-label="选择上传人"
        className="library-surface library-owner-picker"
      >
        <label className="library-owner-search">
          <img src={ownerSearchFocused ? "/assets/search-dialog-search.svg" : "/assets/search-dialog-search-default.svg"} alt="" className="size-[16px] shrink-0" />
          <input
            ref={ownerSearchRef}
            aria-label="搜索上传人"
            placeholder="搜索"
            value={ownerQuery}
            onChange={event => setOwnerQuery(event.target.value)}
            onFocus={() => setOwnerSearchFocused(true)}
            onBlur={() => setOwnerSearchFocused(false)}
          />
        </label>
        <div className="library-owner-list">
          {(uploaderOptions ?? []).filter(name => name.includes(ownerQuery.trim())).map(name => {
            const checked = uploader.members.includes(name);
            return (
              <button
                key={name}
                type="button"
                role="checkbox"
                aria-checked={checked}
                // 勾选后焦点留在搜索框里，可以接着输入继续找下一个人
                onMouseDown={event => event.preventDefault()}
                onClick={() => onUploaderChange(prev => ({ ...prev, members: checked ? prev.members.filter(item => item !== name) : [...prev.members, name] }))}
                className="library-owner-option"
              >
                <ProjectMemberTag member={{ name, color: ownerColor(name) }} />
                {checked && <img src="/assets/ecd73.svg" alt="" />}
              </button>
            );
          })}
          {(uploaderOptions ?? []).filter(name => name.includes(ownerQuery.trim())).length === 0 && (
            <p role="status" className="library-owner-empty">{uploaderOptions?.length ? "暂无匹配成员" : "暂无可选成员"}</p>
          )}
        </div>
      </OperationMenu>
    )}
    {open && calendarOpen && calendarPlacement?.mode === "popover" && <RangeCalendarPopover value={timeFilter} placement={calendarPlacement} containerRef={popoverRef} onSelect={onCalendarSelect} />}
    {open && calendarOpen && calendarPlacement?.mode === "sheet" && <DateRangeSheet value={timeFilter} open onClose={closeCalendar} onSelect={onCalendarSelect} />}
  </>;
}
