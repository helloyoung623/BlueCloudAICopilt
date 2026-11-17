import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import { createPortal } from "react-dom";
import { addMonths, addYears, endOfDay, format, startOfDay, subDays } from "date-fns";
import { zhCN } from "date-fns/locale";
import type { DateRange } from "react-day-picker";
import { OperationMenu } from "./operation-menu";
import { Calendar } from "./ui/calendar";
import "./library-view.css";

// 文件筛选：资料库与项目「来源 / 产物」共用同一套字段与交互
// 字段：格式（文档 / 表格 / 其他，多选）+ 更新时间（近 7 天 / 近 30 天 / 自定义区间）
export type FileFormat = "文档" | "表格" | "其他";
export type TimeFilter =
  | { kind: "recent"; days: 7 | 30 }
  | { kind: "custom"; from: Date; to: Date }
  | null;

export const FILE_FORMATS: FileFormat[] = ["文档", "表格", "其他"];

export function formatByExtension(name: string): FileFormat {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "pdf" || ["doc", "docx"].includes(ext)) return "文档";
  if (["xls", "xlsx", "csv"].includes(ext)) return "表格";
  return "其他";
}

export function displayDate(date: Date) {
  return format(date, "yyyy.M.d");
}

export function hasActiveFileFilters(formats: FileFormat[], timeFilter: TimeFilter) {
  return formats.length > 0 || timeFilter !== null;
}

// 名称 / 格式 / 更新时间 三项命中判定，资料库与项目文件列表共用
export function matchFileFilters(
  file: { name: string; format: FileFormat; modified: Date },
  options: { query?: string; formats: FileFormat[]; timeFilter: TimeFilter },
) {
  const query = options.query?.trim().toLocaleLowerCase() ?? "";
  if (query && !file.name.toLocaleLowerCase().includes(query)) return false;
  if (options.formats.length && !options.formats.includes(file.format)) return false;
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

// 筛选按钮 + 菜单 + 日期浮层/抽屉，资料库与项目「来源 / 产物」共用，
// 保证字段、选中态、hover、点击响应与键盘行为完全一致。
export function FileFilterButton({ active = true, selectedFormats, onFormatsChange, timeFilter, onTimeFilterChange, ariaLabel = "筛选" }: {
  // 页面切走后传 false，自动收起菜单与日期层，避免浮层残留在隐藏页面上
  active?: boolean;
  selectedFormats: FileFormat[];
  onFormatsChange: (next: FileFormat[]) => void;
  timeFilter: TimeFilter;
  onTimeFilterChange: (next: TimeFilter) => void;
  ariaLabel?: string;
}) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [calendarPlacement, setCalendarPlacement] = useState<CalendarPlacement | null>(null);
  const [calendarAnchor, setCalendarAnchor] = useState<HTMLButtonElement | null>(null);
  const hasFilters = hasActiveFileFilters(selectedFormats, timeFilter);

  const closeCalendar = () => {
    setCalendarOpen(false);
    setCalendarPlacement(null);
    setCalendarAnchor(null);
  };

  useEffect(() => {
    if (active) return;
    setOpen(false);
    closeCalendar();
  }, [active]);

  useEffect(() => {
    if (!open) return;
    const dismiss = (event: PointerEvent) => {
      if (!(event.target instanceof Node)) return;
      // 日期模态层（popover / 全屏 sheet）内的点击不应触发筛选菜单的关闭逻辑
      if (popoverRef.current?.contains(event.target)) return;
      if (event.target instanceof Element && event.target.closest(".library-date-layer")) return;
      if (buttonRef.current?.contains(event.target) || menuRef.current?.contains(event.target)) return;
      setOpen(false);
      closeCalendar();
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (calendarOpen) closeCalendar();
      else setOpen(false);
    };
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", dismiss);
      document.removeEventListener("keydown", escape);
    };
  }, [open, calendarOpen]);

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
    }} className={`library-filter-trigger ${hasFilters ? "library-filter-active" : ""}`}>
      <img src={hasFilters ? "/assets/88901.svg" : "/assets/filter-btn.svg"} alt="" />
    </button>
    {open && <OperationMenu ref={menuRef} anchor={buttonRef.current} align="auto" gap={4} role="dialog" aria-label={ariaLabel} className="library-surface library-filter-menu">
      <div className="library-filter-heading">格式</div>
      {FILE_FORMATS.map(item => <button key={item} type="button" role="checkbox" aria-checked={selectedFormats.includes(item)} onClick={() => onFormatsChange(selectedFormats.includes(item) ? selectedFormats.filter(value => value !== item) : [...selectedFormats, item])} className="library-filter-item">
        {item}{selectedFormats.includes(item) && <img src="/assets/ecd73.svg" alt="" />}
      </button>)}
      <div className="library-filter-heading">更新时间</div>
      {([7, 30] as const).map(days => <button key={days} type="button" role="radio" aria-checked={timeFilter?.kind === "recent" && timeFilter.days === days} onClick={() => {
        onTimeFilterChange(timeFilter?.kind === "recent" && timeFilter.days === days ? null : { kind: "recent", days });
        closeCalendar();
      }} className="library-filter-item">
        近 {days}天{timeFilter?.kind === "recent" && timeFilter.days === days && <img src="/assets/ecd73.svg" alt="" />}
      </button>)}
      <div className="library-custom-row" data-selected={timeFilter?.kind === "custom" || undefined} data-calendar-open={calendarOpen || undefined}>
        <button type="button" aria-label={timeFilter?.kind === "custom" ? `自定义时间 ${displayDate(timeFilter.from)} 至 ${displayDate(timeFilter.to)}` : "自定义时间"} onClick={event => openCalendar(event.currentTarget)} className="library-filter-item library-custom-value">
          <span className="truncate">{timeFilter?.kind === "custom" ? `${displayDate(timeFilter.from)} ~ ${displayDate(timeFilter.to)}` : "自定义"}</span>
        </button>
        {timeFilter?.kind === "custom" ? <>
          <img src="/assets/ecd73.svg" alt="" className="library-custom-check" />
          <div className="library-custom-actions">
            <button type="button" aria-label="编辑自定义时间" className="library-custom-edit" onClick={event => openCalendar(event.currentTarget)}><img src="/assets/479d2.svg" alt="" /></button>
            <button type="button" aria-label="清除自定义时间" onClick={() => { onTimeFilterChange(null); closeCalendar(); }}><img src="/assets/c134a.svg" alt="" /></button>
          </div>
        </> : <img aria-hidden src="/assets/fb6a4.svg" alt="" className="library-custom-check" />}
      </div>
    </OperationMenu>}
    {open && calendarOpen && calendarPlacement?.mode === "popover" && <RangeCalendarPopover value={timeFilter} placement={calendarPlacement} containerRef={popoverRef} onSelect={onCalendarSelect} />}
    {open && calendarOpen && calendarPlacement?.mode === "sheet" && <DateRangeSheet value={timeFilter} open onClose={closeCalendar} onSelect={onCalendarSelect} />}
  </>;
}
