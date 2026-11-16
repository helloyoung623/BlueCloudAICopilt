import { useEffect, useRef, useState } from "react";
import { addMonths, addYears, endOfDay, format, startOfDay, subDays } from "date-fns";
import { zhCN } from "date-fns/locale";
import type { DateRange } from "react-day-picker";
import { toast } from "sonner";
import { OperationMenu } from "./operation-menu";
import { SmallTip } from "./task-artifacts";
import { Calendar } from "./ui/calendar";
import { Dialog, DialogContent, DialogTitle } from "./ui/dialog";
import { Sheet, SheetContent, SheetTitle } from "./ui/sheet";
import "./library-view.css";

type FileFormat = "文档" | "表格" | "其他";
type LibraryFile = {
  id: string;
  name: string;
  source: string;
  modified: Date;
  size: string;
  format: FileFormat;
  icon: string;
};
type TimeFilter =
  | { kind: "recent"; days: 7 | 30 }
  | { kind: "custom"; from: Date; to: Date }
  | null;
type CalendarLayout = "double" | "single" | "inline" | "sheet";

const formats: FileFormat[] = ["文档", "表格", "其他"];
const actions = [
  { label: "重命名", icon: "e2b81" },
  { label: "定位到消息位置", icon: "fb6a4" },
  { label: "添加到任务", icon: "7f5ce" },
  { label: "下载", icon: "1d2af" },
  { label: "上传到项目", icon: "1d8f2" },
  { label: "删除", icon: "5ff6b" },
];

function makeExampleFiles(): LibraryFile[] {
  const today = startOfDay(new Date());
  return [
    { id: "1", name: "项目方案.pdf", source: "Aiden Chen", modified: today, size: "2.9MB", format: "文档", icon: "18532" },
    { id: "2", name: "调研报告.docx", source: "项目名称/任务名称", modified: subDays(today, 3), size: "1.3MB", format: "文档", icon: "7957f" },
    { id: "3", name: "数据统计.xlsx", source: "任务名称", modified: subDays(today, 15), size: "2.9MB", format: "表格", icon: "569df" },
    { id: "4", name: "项目演示.pptx", source: "Sophie Zhang", modified: subDays(today, 45), size: "2.9MB", format: "其他", icon: "d14e7" },
    { id: "5", name: "设计参考.png", source: "Liam Huang", modified: subDays(today, 90), size: "1.2MB", format: "其他", icon: "23ed1" },
  ];
}

function displayDate(date: Date) {
  return format(date, "yyyy.M.d");
}

function FileIcon({ icon }: { icon: string }) {
  return <span className="relative block size-[16px] shrink-0 overflow-hidden">
    <img alt="" src={`/assets/${icon}.svg`} className={icon === "18532" ? "absolute left-0 top-0 max-w-none origin-top-left scale-[0.666667]" : "block max-w-none"} />
  </span>;
}

function RangeCalendar({ value, months, onSelect, onBack }: {
  value: TimeFilter;
  months: 1 | 2;
  onSelect: (from: Date, to: Date) => void;
  onBack?: () => void;
}) {
  const [start, setStart] = useState<Date | undefined>();
  const [month, setMonth] = useState(() => value?.kind === "custom" ? value.from : new Date());
  const selected: DateRange | undefined = start ? { from: start, to: undefined }
    : value?.kind === "custom" ? { from: value.from, to: value.to } : undefined;

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
  const calendarMonths = months === 2 ? [month, addMonths(month, 1)] : [month];
  return (
    <div className="library-surface library-calendar" aria-label="选择自定义日期范围">
      {onBack && <button type="button" onClick={onBack} className="mb-[8px] rounded px-[4px] py-[4px] text-[14px] hover:bg-[#f2f2f2]">‹ 返回筛选</button>}
      <div className="sr-only" aria-live="polite">
        {start ? `已选开始日期 ${displayDate(start)}，请选择结束日期` : value?.kind === "custom" ? `${displayDate(value.from)} ~ ${displayDate(value.to)}` : "请选择开始日期和结束日期"}
      </div>
      <div className="library-calendar-months">
        {calendarMonths.map((shownMonth, index) => (
          <div key={index} className="library-calendar-month">
            <div className="library-calendar-header">
              <button type="button" aria-label="上一年" onClick={() => setMonth(current => addYears(current, -1))} className="rounded p-[2px] hover:bg-[#f2f2f2]"><img src="/assets/f8b4d.svg" alt="" className="-rotate-90 -scale-y-100" /></button>
              <button type="button" aria-label="上个月" onClick={() => setMonth(current => addMonths(current, -1))} className="rounded p-[2px] hover:bg-[#f2f2f2]"><img src="/assets/4b6a1.svg" alt="" /></button>
              <span>{format(shownMonth, "yyyy年M月")}</span>
              <button type="button" aria-label="下个月" onClick={() => setMonth(current => addMonths(current, 1))} className="rounded p-[2px] hover:bg-[#f2f2f2]"><img src="/assets/84dc3.svg" alt="" /></button>
              <button type="button" aria-label="下一年" onClick={() => setMonth(current => addYears(current, 1))} className="rounded p-[2px] hover:bg-[#f2f2f2]"><img src="/assets/3f65c.svg" alt="" className="-rotate-90 -scale-y-100" /></button>
            </div>
            <Calendar mode="range" month={shownMonth} onMonthChange={next => setMonth(addMonths(next, -index))} selected={selected} onDayClick={chooseDay} locale={zhCN} weekStartsOn={0} showOutsideDays={false}
              className="p-0" fixedWeeks classNames={{
                months: "block", caption: "sr-only", nav: "hidden", month: "block",
                table: "library-calendar-grid", head_row: "library-calendar-weekdays",
                head_cell: "library-calendar-weekday", row: "library-calendar-week",
                cell: "library-calendar-cell", day: "library-calendar-day",
                day_selected: "library-day-selected", day_range_start: "library-range-start",
                day_range_end: "library-range-end", day_range_middle: "library-range-middle",
                day_today: "library-day-today",
              }} />
          </div>
        ))}
      </div>
    </div>
  );
}

export function LibraryView({ active }: { active: boolean }) {
  const [files, setFiles] = useState(makeExampleFiles);
  const [query, setQuery] = useState("");
  const [selectedFormats, setSelectedFormats] = useState<FileFormat[]>([]);
  const [timeFilter, setTimeFilter] = useState<TimeFilter>(null);
  const [filterAnchor, setFilterAnchor] = useState<HTMLButtonElement | null>(null);
  const [calendarAnchor, setCalendarAnchor] = useState<HTMLButtonElement | null>(null);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [calendarLayout, setCalendarLayout] = useState<CalendarLayout>("double");
  const [menu, setMenu] = useState<{ file: LibraryFile; anchor: HTMLButtonElement } | null>(null);
  const [projectAnchor, setProjectAnchor] = useState<HTMLButtonElement | null>(null);
  const [dialog, setDialog] = useState<{ type: "rename" | "delete"; file: LibraryFile } | null>(null);
  const [draftName, setDraftName] = useState("");
  const filterRef = useRef<HTMLDivElement>(null);
  const calendarRef = useRef<HTMLDivElement>(null);
  const rowMenuRef = useRef<HTMLDivElement>(null);
  const projectMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (active) return;
    setFilterAnchor(null);
    setCalendarOpen(false);
    setMenu(null);
    setProjectAnchor(null);
    setDialog(null);
  }, [active]);

  const updateCalendarLayout = () => {
    if (window.innerWidth < 600) {
      setCalendarLayout("sheet");
      return;
    }
    const trigger = filterAnchor?.getBoundingClientRect();
    if (!trigger) return;
    const right = Math.min(window.innerWidth - 8, trigger.right);
    const left = Math.max(8, right - 240);
    const available = Math.max(left - 12, window.innerWidth - right - 12);
    setCalendarLayout(available >= 576 ? "double" : available >= 288 ? "single" : "inline");
  };
  useEffect(() => {
    if (!filterAnchor) return;
    const dismiss = (event: PointerEvent) => {
      if (!(event.target instanceof Node)) return;
      if (filterAnchor.contains(event.target) || filterRef.current?.contains(event.target) || calendarRef.current?.contains(event.target)) return;
      if (calendarOpen && calendarLayout === "sheet") return;
      setFilterAnchor(null);
      setCalendarOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (calendarOpen) setCalendarOpen(false);
      else setFilterAnchor(null);
    };
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", escape);
    window.addEventListener("resize", updateCalendarLayout);
    return () => {
      document.removeEventListener("pointerdown", dismiss);
      document.removeEventListener("keydown", escape);
      window.removeEventListener("resize", updateCalendarLayout);
    };
  }, [filterAnchor, calendarOpen, calendarLayout]);
  useEffect(() => {
    if (!menu) return;
    const dismiss = (event: PointerEvent) => {
      if (event.target instanceof Node && !menu.anchor.contains(event.target) && !rowMenuRef.current?.contains(event.target) && !projectMenuRef.current?.contains(event.target)) {
        setMenu(null);
        setProjectAnchor(null);
      }
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setMenu(null);
      setProjectAnchor(null);
      menu.anchor.focus();
    };
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", dismiss);
      document.removeEventListener("keydown", escape);
    };
  }, [menu]);

  const hasFilters = selectedFormats.length > 0 || timeFilter !== null;
  const today = startOfDay(new Date());
  const visible = files.filter(file => {
    if (!file.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())) return false;
    if (selectedFormats.length && !selectedFormats.includes(file.format)) return false;
    if (!timeFilter) return true;
    const from = timeFilter.kind === "recent" ? subDays(today, timeFilter.days - 1) : timeFilter.from;
    const to = timeFilter.kind === "recent" ? today : timeFilter.to;
    return file.modified >= startOfDay(from) && file.modified <= endOfDay(to);
  });

  const openCalendar = (anchor: HTMLButtonElement) => {
    setCalendarAnchor(anchor);
    updateCalendarLayout();
    setCalendarOpen(true);
  };
  const calendar = (months: 1 | 2, onBack?: () => void) => <RangeCalendar value={timeFilter} months={months} onBack={onBack} onSelect={(from, to) => {
    setTimeFilter({ kind: "custom", from, to });
    setCalendarOpen(false);
  }} />;

  const chooseAction = (action: string, file: LibraryFile) => {
    setMenu(null);
    if (action === "重命名") {
      setDraftName(file.name);
      setDialog({ type: "rename", file });
    } else if (action === "删除") {
      setDialog({ type: "delete", file });
    } else {
      toast.info(`「${action}」为交互示例，未连接真实文件或任务`);
    }
  };

  return (
    <div className="library-surface library-view">
      <div className="library-header">
        <h1>资料库</h1>
        <div className="library-controls">
          <label className="library-search">
            <img src="/assets/11400.svg" alt="" />
            <input aria-label="搜索文件名称" placeholder="搜索文件名称" value={query} onChange={event => setQuery(event.target.value)} className="min-w-0 flex-1 border-0 bg-transparent outline-none placeholder:text-[rgba(0,0,0,0.38)]" />
          </label>
          <button type="button" aria-label="筛选" aria-expanded={Boolean(filterAnchor)} aria-haspopup="dialog" onClick={event => {
            setFilterAnchor(current => current ? null : event.currentTarget);
            setCalendarOpen(false);
          }} className={`library-filter-trigger ${hasFilters ? "library-filter-active" : ""}`}>
            <img src={hasFilters ? "/assets/88901.svg" : "/assets/6d02b.svg"} alt="" />
          </button>
        </div>
      </div>

      <div className="library-list">
        {visible.length ? <div className="min-h-0 overflow-y-auto">
          <table className="library-table">
            <colgroup><col /><col className="library-col-source" /><col className="library-col-time" /><col className="library-col-size" /></colgroup>
            <thead><tr><th>文件名</th><th className="library-col-source">来源</th><th className="library-col-time">更新时间</th><th className="library-col-size">大小</th></tr></thead>
            <tbody>{visible.map(file => <tr key={file.id} data-menu-open={menu?.file.id === file.id || undefined}>
              <td><div className="library-filename"><FileIcon icon={file.icon} /><SmallTip label={file.name} side="top" className="max-w-[calc(100vw-16px)] whitespace-normal break-all"><span tabIndex={0} className="min-w-0 flex-1 truncate">{file.name}</span></SmallTip></div>
                <button type="button" aria-label={`文件操作 ${file.name}`} aria-haspopup="menu" aria-expanded={menu?.file.id === file.id} onClick={event => { setProjectAnchor(null); setMenu(current => current?.file.id === file.id ? null : { file, anchor: event.currentTarget }); }} className="library-row-action"><img src="/assets/64110.svg" alt="" /></button>
              </td>
              <td className="library-col-source truncate" title={file.source}>{file.source}</td>
              <td className="library-col-time">{format(file.modified, "yyyy/MM/dd")}</td>
              <td className="library-col-size">{file.size}</td>
            </tr>)}</tbody>
          </table>
        </div> : <div className="library-empty">
          <img src="/assets/c0d09.png" alt="" />
          <span>{files.length === 0 ? "暂无资料" : "没有符合筛选条件的资料"}</span>
        </div>}
      </div>

      {active && filterAnchor && !(calendarOpen && calendarLayout === "sheet") && <OperationMenu ref={filterRef} anchor={filterAnchor} align="end" gap={4} role="dialog" aria-label="筛选资料" className={`library-surface library-filter-menu ${calendarOpen && calendarLayout === "inline" ? "library-filter-calendar" : ""}`}>
        {calendarOpen && calendarLayout === "inline" ? calendar(1, () => setCalendarOpen(false)) : <>
          <div className="library-filter-heading">格式</div>
          {formats.map(item => <button key={item} type="button" role="checkbox" aria-checked={selectedFormats.includes(item)} onClick={() => setSelectedFormats(current => current.includes(item) ? current.filter(value => value !== item) : [...current, item])} className="library-filter-item">
            {item}{selectedFormats.includes(item) && <img src="/assets/ecd73.svg" alt="" />}
          </button>)}
          <div className="library-filter-heading">更新时间</div>
          {([7, 30] as const).map(days => <button key={days} type="button" role="radio" aria-checked={timeFilter?.kind === "recent" && timeFilter.days === days} onClick={() => { setTimeFilter(current => current?.kind === "recent" && current.days === days ? null : { kind: "recent", days }); setCalendarOpen(false); }} className="library-filter-item">
            近 {days}天{timeFilter?.kind === "recent" && timeFilter.days === days && <img src="/assets/ecd73.svg" alt="" />}
          </button>)}
          <div className="library-custom-row" data-selected={timeFilter?.kind === "custom" || undefined}>
            <button type="button" aria-label={timeFilter?.kind === "custom" ? `自定义时间 ${displayDate(timeFilter.from)} 至 ${displayDate(timeFilter.to)}` : "自定义时间"} onClick={event => openCalendar(event.currentTarget)} className="library-filter-item library-custom-value">
              <span className="truncate">{timeFilter?.kind === "custom" ? `${displayDate(timeFilter.from)} ~ ${displayDate(timeFilter.to)}` : "自定义"}</span>
            </button>
            {timeFilter?.kind === "custom" ? <>
              <img src="/assets/ecd73.svg" alt="" className="library-custom-check" />
              <div className="library-custom-actions">
                <button type="button" aria-label="编辑自定义时间" onClick={event => openCalendar(event.currentTarget)}><img src="/assets/479d2.svg" alt="" /></button>
                <button type="button" aria-label="清除自定义时间" onClick={() => { setTimeFilter(null); setCalendarOpen(false); }}><img src="/assets/c134a.svg" alt="" /></button>
              </div>
            </> : <img aria-hidden src="/assets/fb6a4.svg" alt="" className="library-custom-check" />}
          </div>
        </>}
      </OperationMenu>}
      {active && filterAnchor && calendarOpen && calendarAnchor && (calendarLayout === "double" || calendarLayout === "single") &&
        <OperationMenu ref={calendarRef} anchor={calendarAnchor} submenu role="dialog" aria-label="自定义日期" className="library-surface library-calendar-popover">
          {calendar(calendarLayout === "double" ? 2 : 1)}
        </OperationMenu>}
      <Sheet open={active && calendarOpen && calendarLayout === "sheet"} onOpenChange={open => { if (!open) setCalendarOpen(false); }}>
        <SheetContent side="bottom" aria-describedby={undefined} className="library-surface library-calendar-sheet max-h-[90vh] overflow-auto rounded-t-[16px] p-[16px]">
          <SheetTitle>自定义时间</SheetTitle>
          {calendar(1)}
        </SheetContent>
      </Sheet>

      {active && menu && <OperationMenu ref={rowMenuRef} anchor={menu.anchor} align="end" gap={4} role="menu" className="library-surface w-[192px] rounded-[12px] border border-[#f2f2f2] bg-white p-[8px] shadow-[0_0_12px_rgba(0,0,0,0.08)]">
        {actions.map(action => <button key={action.label} type="button" role="menuitem" aria-haspopup={action.label === "上传到项目" ? "menu" : undefined} aria-expanded={action.label === "上传到项目" ? Boolean(projectAnchor) : undefined} onClick={event => {
          if (action.label === "上传到项目") setProjectAnchor(current => current ? null : event.currentTarget);
          else chooseAction(action.label, menu.file);
        }} className="flex h-[44px] w-full items-center gap-[8px] rounded-[8px] px-[8px] text-left hover:bg-[#f2f2f2]">
          <img src={`/assets/${action.icon}.svg`} alt="" /><span className="flex-1">{action.label}</span>{action.label === "上传到项目" && <span aria-hidden>›</span>}
        </button>)}
      </OperationMenu>}
      {active && menu && projectAnchor && <OperationMenu ref={projectMenuRef} anchor={projectAnchor} submenu role="menu" aria-label="选择项目" className="library-surface w-[192px] rounded-[12px] border border-[#f2f2f2] bg-white p-[8px] shadow-[0_0_12px_rgba(0,0,0,0.08)]">
        {["示例项目", "新建项目"].map(project => <button key={project} type="button" role="menuitem" onClick={() => {
          toast.info(`「${project}」为交互示例，未连接真实项目`);
          setProjectAnchor(null);
          setMenu(null);
        }} className="flex h-[44px] w-full items-center rounded-[8px] px-[8px] text-left hover:bg-[#f2f2f2]">{project}</button>)}
      </OperationMenu>}
      <Dialog open={active && dialog !== null} onOpenChange={open => { if (!open) setDialog(null); }}>
        <DialogContent aria-describedby={undefined} className="library-surface w-[calc(100%-32px)] max-w-[480px]">
          <DialogTitle>{dialog?.type === "rename" ? "重命名" : "确定删除？"}</DialogTitle>
          {dialog?.type === "rename" ? <label className="flex flex-col gap-[8px] text-[14px]">文件名称<input autoFocus value={draftName} onChange={event => setDraftName(event.target.value)} className="rounded border border-[#d9d9d9] px-[8px] py-[6px]" /></label> : <p className="text-[14px]">确认删除“{dialog?.file.name}”？此操作仅影响本地示例。</p>}
          <div className="flex justify-end gap-[8px]">
            <button type="button" onClick={() => setDialog(null)} className="rounded px-[12px] py-[6px] hover:bg-[#f2f2f2]">取消</button>
            <button type="button" onClick={() => {
              if (!dialog) return;
              if (dialog.type === "rename") {
                if (!draftName.trim()) { toast.error("文件名称不能为空"); return; }
                setFiles(current => current.map(file => file.id === dialog.file.id ? { ...file, name: draftName.trim() } : file));
              } else setFiles(current => current.filter(file => file.id !== dialog.file.id));
              setDialog(null);
            }} className="rounded bg-[#1e63f5] px-[12px] py-[6px] text-white">确定</button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
