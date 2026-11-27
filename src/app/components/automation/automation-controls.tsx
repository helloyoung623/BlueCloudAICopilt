import { Fragment, useEffect, useRef, useState } from "react";
import { OperationMenu } from "../operation-menu";
import type { CalendarDate, CustomUnit, Cycle, EndMode, ScheduleState } from "./types";
import { CYCLE_DIVIDERS, CUSTOM_UNITS, CYCLES, DAYS, END_MODES, HOUR_OPTIONS, MINUTE_OPTIONS, TIMEZONES, WEEKDAYS, WHEEL_CENTER_TOP, WHEEL_ROW_H } from "./constants";
import { buildDefaultEndDate, joinChoices } from "./utils";
import { useDismissOnOutside, useUnlockScrollInDialog } from "./hooks";

// Tag-2 组件 Size=L（与项目页/自动化页共用同一套 Figma 组件 9625:52202）
function TagTabs<T extends string>({ items, active, onChange, pbClass = "pb-[16px]" }: {
  items: readonly T[];
  active: T;
  onChange: (item: T) => void;
  // tabs 与下方内容的间距：自动化任务页按 Figma 9937:57105 需要更小间距
  pbClass?: string;
}) {
  return (
    <div className={`flex shrink-0 items-center gap-[16px] ${pbClass}`}>
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

// 通用下拉 chip：点击弹出 OperationMenu，选中项带蓝色对勾
function SelectChip({ options, value, onChange, width = 120, forceBelow = false, maxHeight, dividerAfter, arrow = true }: {
  options: readonly string[];
  value: string;
  onChange: (value: string) => void;
  width?: number;
  forceBelow?: boolean;
  maxHeight?: number;
  // 在这些选项后面渲染分隔线（如周期菜单：仅一次、每年之后）
  dividerAfter?: readonly string[];
  // chip 右侧显示 down-small 箭头（Figma 9698:62714：所有周期 chip 均带箭头）
  arrow?: boolean;
}) {
  const [anchor, setAnchor] = useState<HTMLButtonElement | null>(null);
  useDismissOnOutside(anchor, setAnchor);
  const unlockScroll = useUnlockScrollInDialog();
  return (
    <Fragment>
      <button
        type="button"
        onClick={event => setAnchor(current => current ? null : event.currentTarget)}
        className="flex h-[32px] shrink-0 cursor-pointer items-center justify-center gap-[8px] rounded-[4px] bg-[#f7f7f7] px-[8px] font-['PingFang_SC:Regular'] text-[14px] font-normal leading-[22px] tracking-[0.014px] text-[rgba(0,0,0,0.88)] hover:bg-[#e6e6e6]"
      >
        <span className="whitespace-nowrap">{value}</span>
        {arrow && <img src="/assets/automation-down-small.svg" alt="" className="size-[16px] shrink-0" />}
      </button>
      {anchor && <OperationMenu
        anchor={anchor}
        gap={8}
        forceBelow={forceBelow}
        className="flex flex-col rounded-[12px] border border-[#f2f2f2] bg-white p-[4px] px-[8px] py-[4px] shadow-[0_0_12px_rgba(0,0,0,0.08)]"
        style={{ width }}
        onClick={event => event.stopPropagation()}
        onPointerDown={event => event.stopPropagation()}
      >
        {/* 长列表（如每月 31 天）在内层容器滚动：确定性的 max-height + overflow-y，
            与 OperationMenu 根节点解耦，避免 ResizeObserver 反馈循环导致滚动失效 */}
        <div
          ref={unlockScroll}
          className={`flex flex-col gap-[2px] py-[4px] ${maxHeight != null ? "-mr-[8px] pr-[8px]" : ""}`}
          style={maxHeight != null ? { maxHeight, overflowY: "auto" } : undefined}
        >
          {options.map(option => (
            <Fragment key={option}>
              <button
                type="button"
                onClick={() => { onChange(option); setAnchor(null); }}
                className={`flex h-[44px] shrink-0 cursor-pointer items-center gap-[8px] rounded-[8px] px-[8px] text-left font-['PingFang_SC:Regular'] text-[14px] leading-[22px] tracking-[0.014px] hover:bg-[#f2f2f2] ${option === value ? "bg-white text-[rgba(0,0,0,0.88)]" : "text-[rgba(0,0,0,0.88)]"}`}
                style={{ fontWeight: option === value ? 500 : 400 }}
              >
                <span className="min-w-0 flex-1 truncate">{option}</span>
                {option === value && <img src="/assets/automation-check.svg" alt="" className="size-[16px] shrink-0" />}
              </button>
              {/* Figma 9773:69719：指定选项后的 #F2F2F2 分隔线（左右缩进 8px） */}
              {dividerAfter?.includes(option) && <div className="mx-[8px] my-[4px] h-px shrink-0 bg-[#f2f2f2]" />}
            </Fragment>
          ))}
        </div>
      </OperationMenu>}
    </Fragment>
  );
}

// 多选 chip：周几 / 日期用。样式与 SelectChip 一致（灰底 chip + 下拉白卡 + 蓝色对勾，
// 字重不改），唯一差别是最大宽度 268px：多选很多日期时不能撑出容器，超出省略，
// 完整内容走 title / aria-label。逻辑：点选项只切换勾选、面板不收起，可一次选多个；
// chip 文本按「、」拼接。
function MultiSelectChip({ options, values, onChange, ariaLabel, width = 120, forceBelow = false, maxHeight }: {
  options: readonly string[];
  values: string[];
  onChange: (values: string[]) => void;
  ariaLabel: string;
  width?: number;
  forceBelow?: boolean;
  maxHeight?: number;
}) {
  const [anchor, setAnchor] = useState<HTMLButtonElement | null>(null);
  useDismissOnOutside(anchor, setAnchor);
  const unlockScroll = useUnlockScrollInDialog();
  const selected = values.filter(value => options.includes(value));
  const label = selected.length ? joinChoices(selected) : "请选择";
  const toggle = (option: string) => {
    if (selected.includes(option)) {
      // 至少保留一项，否则排期条件会变成空文案
      if (selected.length === 1) return;
      onChange(selected.filter(value => value !== option));
    } else {
      // 按 options 的顺序落库，保证「周一、周三」的展示顺序稳定
      onChange(options.filter(value => value === option || selected.includes(value)));
    }
  };
  return (
    <Fragment>
      <button
        type="button"
        aria-label={`${ariaLabel}：${selected.length ? joinChoices(selected) : "未选择"}`}
        title={selected.length ? joinChoices(selected) : undefined}
        onClick={event => setAnchor(current => current ? null : event.currentTarget)}
        className="flex h-[32px] max-w-[268px] shrink-0 cursor-pointer items-center justify-center gap-[8px] rounded-[4px] bg-[#f7f7f7] px-[8px] font-['PingFang_SC:Regular'] text-[14px] font-normal leading-[22px] tracking-[0.014px] text-[rgba(0,0,0,0.88)] hover:bg-[#e6e6e6]"
      >
        <span className="min-w-0 truncate whitespace-nowrap">{label}</span>
        <img src="/assets/automation-down-small.svg" alt="" className="size-[16px] shrink-0" />
      </button>
      {anchor && <OperationMenu
        anchor={anchor}
        gap={8}
        forceBelow={forceBelow}
        className="flex flex-col rounded-[12px] border border-[#f2f2f2] bg-white p-[4px] px-[8px] py-[4px] shadow-[0_0_12px_rgba(0,0,0,0.08)]"
        style={{ width }}
        onClick={event => event.stopPropagation()}
        onPointerDown={event => event.stopPropagation()}
      >
        <div
          ref={unlockScroll}
          className={`flex flex-col gap-[2px] py-[4px] ${maxHeight != null ? "-mr-[8px] pr-[8px]" : ""}`}
          style={maxHeight != null ? { maxHeight, overflowY: "auto" } : undefined}
        >
          {options.map(option => {
            const checked = selected.includes(option);
            return (
              <button
                key={option}
                type="button"
                role="checkbox"
                aria-checked={checked}
                onClick={() => toggle(option)}
                className={`flex h-[44px] shrink-0 cursor-pointer items-center gap-[8px] rounded-[8px] px-[8px] text-left font-['PingFang_SC:Regular'] text-[14px] leading-[22px] tracking-[0.014px] hover:bg-[#f2f2f2] ${checked ? "bg-white text-[rgba(0,0,0,0.88)]" : "text-[rgba(0,0,0,0.88)]"}`}
                style={{ fontWeight: checked ? 500 : 400 }}
              >
                <span className="min-w-0 flex-1 truncate">{option}</span>
                {checked && <img src="/assets/automation-check.svg" alt="" className="size-[16px] shrink-0" />}
              </button>
            );
          })}
        </div>
      </OperationMenu>}
    </Fragment>
  );
}

// 时间选择器（Figma 9988:58658 Time picker，实例见 9783:70644）：
// 128×256 白底 r8、投影 0 0 8 rgba(0,0,0,.08)；内容左右各 16px，时/分两列各占 48；
// 行高 48、可见 5 行，选中值固定在中间槽位（上下各 1px rgba(0,0,0,.1) 细线），

function TimeWheelColumn({ options, value, onChange, align }: {
  options: readonly string[];
  value: string;
  onChange: (value: string) => void;
  align?: "left" | "right";
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const snapTimer = useRef<number | undefined>(undefined);
  const valueRef = useRef(value);
  valueRef.current = value;

  // 展开时把当前值滚到中间槽位
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTop = Math.max(0, options.indexOf(valueRef.current)) * WHEEL_ROW_H;
    return () => window.clearTimeout(snapTimer.current);
  }, [options]);

  // Radix Dialog 打开时会在 document 上锁滚动，portal 面板里即使有 overflow 也滚不动。
  // 在列自身上接管 wheel（只绑定一次、卸载时移除），手动滚 scrollTop。
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      event.stopPropagation();
      const step = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? el.clientHeight : 1;
      el.scrollTop += event.deltaY * step;
    };
    el.addEventListener("wheel", onWheel, { passive: false, capture: true });
    return () => el.removeEventListener("wheel", onWheel, true);
  }, []);

  const handleScroll = () => {
    const el = listRef.current;
    if (!el) return;
    const index = Math.min(options.length - 1, Math.max(0, Math.round(el.scrollTop / WHEEL_ROW_H)));
    if (options[index] !== valueRef.current) onChange(options[index]);
    // 滚动静止后对齐到整行。不用 CSS scroll-snap：滚轮是手动改 scrollTop 的，
    // 强制吸附会把小幅滚动立刻弹回原处，滚轮就转不动了。
    window.clearTimeout(snapTimer.current);
    snapTimer.current = window.setTimeout(() => {
      const node = listRef.current;
      if (!node) return;
      const target = Math.round(node.scrollTop / WHEEL_ROW_H) * WHEEL_ROW_H;
      if (Math.abs(node.scrollTop - target) > 0.5) node.scrollTo({ top: target, behavior: "smooth" });
    }, 160);
  };

  return (
    <div
      ref={listRef}
      onScroll={handleScroll}
      className="wheel-scroll h-[256px] min-w-0 flex-1 overflow-y-auto overscroll-contain"
    >
      <div className="h-[104px] shrink-0" aria-hidden />
      {options.map(option => (
        <button
          key={option}
          type="button"
          onClick={() => {
            onChange(option);
            listRef.current?.scrollTo({ top: options.indexOf(option) * WHEEL_ROW_H, behavior: "smooth" });
          }}
          className={`flex h-[48px] w-full shrink-0 cursor-pointer items-center font-['PingFang_SC:Regular'] text-[14px] leading-[22px] tracking-[0.014px] ${align === "right" ? "justify-end" : "justify-start"} ${option === value ? "text-[rgba(0,0,0,0.88)]" : "text-[rgba(0,0,0,0.38)] hover:text-[rgba(0,0,0,0.6)]"}`}
          style={{ fontWeight: option === value ? 500 : 400 }}
        >
          {option}
        </button>
      ))}
      <div className="h-[104px] shrink-0" aria-hidden />
    </div>
  );
}

// 时间 chip：点开双列滚轮（时 / 分），滚动或点选实时回写 HH:mm
// variant="field"：高级设置「指定时间」用的带描边方框（Figma 9904:38056 / 10031:61074），
// 白底 + #E6E6E6 描边 + r4，尺寸随内容（h32 / px8），与左侧日期框同一行同一高度。
function TimeChip({ value, onChange, variant = "chip" }: { value: string; onChange: (value: string) => void; variant?: "chip" | "field" }) {
  const [anchor, setAnchor] = useState<HTMLButtonElement | null>(null);
  useDismissOnOutside(anchor, setAnchor);
  const [hour, minute] = value.split(":");
  return (
    <Fragment>
      <button
        type="button"
        onClick={event => setAnchor(current => current ? null : event.currentTarget)}
        className={`flex h-[32px] shrink-0 cursor-pointer items-center justify-center rounded-[4px] px-[8px] font-['PingFang_SC:Regular'] text-[14px] font-normal leading-[22px] tracking-[0.014px] text-[rgba(0,0,0,0.88)] ${variant === "field" ? "border border-[#e6e6e6] bg-white hover:border-[#1e63f5]" : "bg-[#f7f7f7] hover:bg-[#e6e6e6]"}`}
      >
        <span className="whitespace-nowrap">{value}</span>
      </button>
      {anchor && <OperationMenu
        anchor={anchor}
        gap={8}
        className="relative overflow-hidden rounded-[8px] bg-white shadow-[0_0_8px_rgba(0,0,0,0.08)]"
        style={{ width: 128 }}
        onPointerDown={event => event.stopPropagation()}
      >
        <div className="flex h-[256px] w-full items-stretch px-[16px]">
          <TimeWheelColumn options={HOUR_OPTIONS} value={hour ?? "00"} onChange={next => onChange(`${next}:${minute ?? "00"}`)} />
          <TimeWheelColumn options={MINUTE_OPTIONS} value={minute ?? "00"} onChange={next => onChange(`${hour ?? "00"}:${next}`)} align="right" />
        </div>
        <div className="pointer-events-none absolute left-[16px] right-[16px] top-[104px] h-px bg-[rgba(0,0,0,0.1)]" />
        <div className="pointer-events-none absolute left-[16px] right-[16px] top-[152px] h-px bg-[rgba(0,0,0,0.1)]" />
      </OperationMenu>}
    </Fragment>
  );
}

// 数字步进器（Figma 9891:71449 「常规」组件 9528:43362）：
// 宽 80、高 32、#F7F7F7 底 r4；左侧输入区与右侧 24px 步进按钮之间 1px #E6E6E6
// 竖直分割线（像素采样 x482-484），上下按钮间的横分割线已 baked 在图标里。
function NumberStepper({ value, onChange, min = 1, max = 999, width = 80, suffix }: {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  width?: number;
  // Figma 9904:38428：「重复 N 次后」——输入区右侧的后缀文案（Black 0.6）
  suffix?: string;
}) {
  const clamp = (next: number) => Math.min(max, Math.max(min, next));
  return (
    <div className="flex h-[32px] shrink-0 items-stretch overflow-hidden rounded-[4px] bg-[#f7f7f7]" style={{ width }}>
      <div className="flex min-w-0 flex-1 items-center gap-[4px] border-r border-[#e6e6e6] px-[8px]">
        <input
          type="text"
          inputMode="numeric"
          value={value}
          onChange={event => {
            const parsed = parseInt(event.target.value, 10);
            onChange(Number.isNaN(parsed) ? min : clamp(parsed));
          }}
          className="min-w-0 flex-1 bg-transparent text-left font-['PingFang_SC:Regular'] text-[14px] font-normal leading-[22px] tracking-[0.014px] text-[rgba(0,0,0,0.88)] outline-none"
        />
        {suffix && (
          <span className="shrink-0 whitespace-nowrap font-['PingFang_SC:Regular'] text-[14px] font-normal leading-[20px] tracking-[0.014px] text-[rgba(0,0,0,0.6)]">
            {suffix}
          </span>
        )}
      </div>
      <div className="flex w-[24px] shrink-0 flex-col">
        <button
          type="button"
          aria-label="增加"
          onClick={() => onChange(clamp(value + 1))}
          className="flex h-[16px] cursor-pointer items-center justify-center hover:bg-[#e6e6e6]"
        >
          <img src="/assets/automation-step-up.svg" alt="" className="h-[16px] w-[24px]" />
        </button>
        <button
          type="button"
          aria-label="减少"
          onClick={() => onChange(clamp(value - 1))}
          className="flex h-[16px] cursor-pointer items-center justify-center hover:bg-[#e6e6e6]"
        >
          <img src="/assets/automation-step-down.svg" alt="" className="h-[16px] w-[24px]" />
        </button>
      </div>
    </div>
  );
}

// 时区下拉（Figma 9783:70668）：256×32、#E6E6E6 描边、r4、右侧 down-small
function TimezoneSelect({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const [anchor, setAnchor] = useState<HTMLButtonElement | null>(null);
  useDismissOnOutside(anchor, setAnchor);
  return (
    <Fragment>
      <button
        type="button"
        onClick={event => setAnchor(current => current ? null : event.currentTarget)}
        className="flex h-[32px] w-auto min-w-[256px] shrink-0 cursor-pointer items-center justify-between gap-[8px] self-start rounded-[8px] border border-[#e6e6e6] px-[8px] py-[5px] font-['PingFang_SC:Regular'] text-[14px] font-normal leading-[22px] tracking-[0.014px] text-[rgba(0,0,0,0.88)] hover:border-[#1e63f5]"
      >
        <span className="min-w-0 flex-1 whitespace-nowrap text-left">{value}</span>
        <img src="/assets/automation-down-small.svg" alt="" className="size-[16px] shrink-0" />
      </button>
      {anchor && <OperationMenu
        anchor={anchor}
        gap={8}
        className="flex flex-col rounded-[12px] border border-[#f2f2f2] bg-white p-[4px] px-[8px] py-[4px] shadow-[0_0_12px_rgba(0,0,0,0.08)]"
        style={{ width: 256 }}
        onClick={event => event.stopPropagation()}
        onPointerDown={event => event.stopPropagation()}
      >
        <div className="flex flex-col gap-[2px] py-[4px]">
          {TIMEZONES.map(option => (
            <button
              key={option}
              type="button"
              onClick={() => { onChange(option); setAnchor(null); }}
              className={`flex h-[44px] shrink-0 cursor-pointer items-center gap-[8px] rounded-[8px] px-[8px] text-left font-['PingFang_SC:Regular'] text-[14px] leading-[22px] tracking-[0.014px] text-[rgba(0,0,0,0.88)] hover:bg-[#f2f2f2]`}
              style={{ fontWeight: option === value ? 500 : 400 }}
            >
              <span className="min-w-0 flex-1 truncate">{option}</span>
              {option === value && <img src="/assets/automation-check.svg" alt="" className="size-[16px] shrink-0" />}
            </button>
          ))}
        </div>
      </OperationMenu>}
    </Fragment>
  );
}

// ============================================================================
// 排期条件 chip 组（弹窗 9665:49114 与右侧详情栏 9787:71282 共用）
//   分/小时 → 自定义 每 1 小时（10000:58940，到单位 chip 为止）
//   天    → 自定义 每 1 天 于 18:00（9891:71448）
//   周    → 自定义 每 1 周 于 [周几（多选）] 的 18:00（9891:72000）
//   月    → 自定义 每 1 月 于 [日期（多选）] 的 18:00（9891:72961）
// 「每周 / 每月」后面的周几、日期以及「自定义」里的周/月均为多选；四个入口共用本节。
// ============================================================================
function ScheduleEditor({ schedule, onChange }: {
  schedule: ScheduleState;
  onChange: (patch: Partial<ScheduleState>) => void;
}) {
  const muted = "shrink-0 whitespace-nowrap font-['PingFang_SC:Regular'] text-[14px] font-normal leading-[22px] tracking-[0.014px] text-[rgba(0,0,0,0.38)]";
  const cycle = schedule.cycle;
  const timeChip = <TimeChip value={schedule.time} onChange={time => onChange({ time })} />;
  // 「的 + 时间」不可拆成两组：320 宽的详情栏折行时不会把「的」单独留在上一行
  const tail = (withDe: boolean) => (
    <span className="flex shrink-0 items-center gap-[8px]">
      {withDe && <span className={muted}>的</span>}
      {timeChip}
    </span>
  );
  return (
    <>
      {/* 周期 chip 统一带 down-small 箭头（Figma 9665:49114 / 9698:62714） */}
      <SelectChip
        options={CYCLES}
        value={cycle}
        onChange={value => onChange({ cycle: value as Cycle })}
        width={120}
        dividerAfter={CYCLE_DIVIDERS}
        arrow
      />
      {/* 「自定义」的「于」跟在单位 chip 之后，其余周期「于」紧跟周期 chip */}
      {cycle !== "自定义" && <span className={muted}>于</span>}

      {cycle === "每天" && timeChip}

      {cycle === "每周" && <>
        <MultiSelectChip options={WEEKDAYS} values={schedule.weekdays} onChange={weekdays => onChange({ weekdays })} ariaLabel="选择周几" />
        {tail(true)}
      </>}

      {cycle === "每月" && <>
        {/* 31 天单列长列表：固定在下方、最高 320px 可滚动，可勾选多天 */}
        <MultiSelectChip options={DAYS} values={schedule.monthDays} onChange={monthDays => onChange({ monthDays })} ariaLabel="选择日期" forceBelow maxHeight={320} />
        {tail(true)}
      </>}

      {(cycle === "每年" || cycle === "仅一次") && <>
        <YearDateChip
          month={schedule.yearMonth}
          day={schedule.yearDay}
          onMonthChange={yearMonth => onChange({ yearMonth })}
          onDayChange={yearDay => onChange({ yearDay })}
        />
        {tail(true)}
      </>}

      {cycle === "自定义" && <>
        <span className={muted}>每</span>
        <NumberStepper value={schedule.customInterval} onChange={customInterval => onChange({ customInterval })} />
        <SelectChip
          options={CUSTOM_UNITS}
          value={schedule.customUnit}
          onChange={value => onChange({ customUnit: value as CustomUnit })}
          width={88}
          arrow
        />
        {/* 分 / 小时：Figma 10000:58940 到单位 chip 就结束，不落到具体时刻；
            天 / 周 / 月才继续「于 [星期/日期] 的 18:00」 */}
        {schedule.customUnit !== "分" && schedule.customUnit !== "小时" && <>
          <span className={muted}>于</span>
          {/* 周：追加星期 chip；月：追加日期 chip（31 天列表固定下方、最高 320 可滚动） */}
          {schedule.customUnit === "周" && <MultiSelectChip options={WEEKDAYS} values={schedule.weekdays} onChange={weekdays => onChange({ weekdays })} ariaLabel="选择周几" />}
          {schedule.customUnit === "月" && <MultiSelectChip options={DAYS} values={schedule.customMonthDays} onChange={customMonthDays => onChange({ customMonthDays })} ariaLabel="选择日期" forceBelow maxHeight={320} />}
          {tail(schedule.customUnit === "周" || schedule.customUnit === "月")}
        </>}
      </>}
    </>
  );
}

// ============================================================================
// 高级设置（Figma 9783:70644 / 9904:38056 / 9904:38242）
// 结束时间（三选一）+ 执行方式（复选框）+ 时区下拉；弹窗与详情栏共用
// ============================================================================
function AdvancedSettings({ newSession, onNewSessionChange, executionTime }: {
  // 「每次执行都开启新会话」由外部（弹窗 / 详情栏）持有：弹窗创建时要带上，详情栏编辑时要回写任务
  newSession: boolean;
  onNewSessionChange: (value: boolean) => void;
  // 「当」的执行时刻：指定时间的截止时刻默认跟它一致（都是当前时间派生）
  executionTime: string;
}) {
  const [endMode, setEndMode] = useState<EndMode>("永不");
  const [endDate, setEndDate] = useState<CalendarDate>(() => buildDefaultEndDate());
  const [endDateAnchor, setEndDateAnchor] = useState<HTMLButtonElement | null>(null);
  useDismissOnOutside(endDateAnchor, setEndDateAnchor);
  // 指定时间的时刻（Figma 9904:38056 右侧框）：与「当」用同一个时间滚轮，默认跟执行时刻一致
  const [endTime, setEndTime] = useState(executionTime);
  const [repeatTimes, setRepeatTimes] = useState<number>(10);
  const [timezone, setTimezone] = useState<string>(TIMEZONES[0]);
  return (
    <div className="flex w-full flex-col gap-[24px]">
      {/* 结束时间：竖排单选（Figma 9904:38083 Radio-Group：Style=Vertical，行高 22、gap 8）。
          日期框 / 步进器在设计稿里都是「绝对定位」的子节点（x=89，y=25 / y=55，尺寸 136/120 × 32），
          不参与排版，所以切换选项时三行位置完全不动（无抖动），两者左边线严格同一条 x 轴。 */}
      <div className="flex w-full flex-col gap-[8px] px-[12px]">
        <span className="font-['TCloudNumber'] text-[14px] font-normal leading-[22px] text-[rgba(0,0,0,0.88)]">结束时间</span>
        <div className="relative flex w-fit flex-col gap-[8px] self-start">
          {END_MODES.map(mode => (
            <button
              key={mode}
              type="button"
              role="radio"
              aria-checked={endMode === mode}
              onClick={() => setEndMode(mode)}
              className="flex h-[22px] cursor-pointer items-center gap-[8px] font-['PingFang_SC:Regular'] text-[14px] font-normal leading-[22px] tracking-[0.014px] text-[rgba(0,0,0,0.88)]"
            >
              <img
                src={endMode === mode ? "/assets/automation-radio-on.svg" : "/assets/automation-radio-off.svg"}
                alt=""
                className="size-[16px] shrink-0"
              />
              <span className="whitespace-nowrap">{mode}</span>
            </button>
          ))}

          {/* Figma 9904:38096：指定时间 → DatePicker 136×32（#E6E6E6 描边，r4），绝对值 x=89 / y=25。
              点击弹出与「每年」月日 chip 同一个「选择日」面板（9849:42119），不再是浏览器原生日期控件。 */}
          {endMode === "指定时间" && (
            <Fragment>
              <button
                type="button"
                aria-label="选择结束日期"
                onClick={event => setEndDateAnchor(current => current ? null : event.currentTarget)}
                className="absolute left-[89px] top-[25px] flex h-[32px] w-[136px] cursor-pointer items-center gap-[8px] rounded-[4px] border border-[#e6e6e6] bg-white px-[8px] text-left hover:border-[#1e63f5]"
              >
                <img src="/assets/automation-date-range.svg" alt="" className="size-[16px] shrink-0" />
                <span className="min-w-0 flex-1 truncate font-['PingFang_SC:Regular'] text-[14px] font-normal leading-[22px] tracking-[0.014px] text-[rgba(0,0,0,0.88)]">
                  {`${endDate.year}/${String(endDate.month).padStart(2, "0")}/${String(endDate.day).padStart(2, "0")}`}
                </span>
              </button>
              {endDateAnchor && <CalendarMenu
                anchor={endDateAnchor}
                onClose={() => setEndDateAnchor(null)}
                selected={endDate}
                onSelect={setEndDate}
              />}
              {/* 时刻框：Figma 9904:38056，绝对 x=233（89 + 日期框 136 + 8），同高 32，
                  点开就是「当」那套 24h 双列滚轮 */}
              <div className="absolute left-[233px] top-[25px]">
                <TimeChip value={endTime} onChange={setEndTime} variant="field" />
              </div>
            </Fragment>
          )}

          {/* Figma 9904:38428：重复 → 120 宽步进器 + 「次后」后缀，绝对值 x=89 / y=55 */}
          {endMode === "重复" && (
            <div className="absolute left-[89px] top-[55px]">
              <NumberStepper value={repeatTimes} onChange={setRepeatTimes} width={120} suffix="次后" min={1} max={99} />
            </div>
          )}
        </div>
      </div>

      {/* 执行方式：复选框「每次执行都开启新会话」 */}
      <div className="flex w-full flex-col gap-[8px] px-[12px]">
        <span className="font-['TCloudNumber'] text-[14px] font-normal leading-[22px] text-[rgba(0,0,0,0.88)]">执行方式</span>
        <button
          type="button"
          role="checkbox"
          aria-checked={newSession}
          onClick={() => onNewSessionChange(!newSession)}
          className="flex w-fit cursor-pointer items-center gap-[8px] font-['PingFang_SC:Regular'] text-[14px] font-normal leading-[22px] tracking-[0.014px] text-[rgba(0,0,0,0.88)]"
        >
          {newSession ? (
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="size-[16px] shrink-0" aria-hidden>
              <rect x="2" y="2" width="12" height="12" rx="3" fill="#1E63F5" />
              <path d="M5 8.2L7.1 10.3L11 6.4" stroke="#FFFFFF" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          ) : (
            <img src="/assets/automation-checkbox-off.svg" alt="" className="size-[16px] shrink-0" />
          )}
          <span className="whitespace-nowrap">每次执行都开启新会话</span>
        </button>
      </div>

      {/* 时区：256×32 下拉（#E6E6E6 描边） */}
      <div className="flex w-full flex-col gap-[8px] px-[12px]">
        <span className="font-['TCloudNumber'] text-[14px] font-normal leading-[22px] text-[rgba(0,0,0,0.88)]">时区</span>
        <TimezoneSelect value={timezone} onChange={setTimezone} />
      </div>
    </div>
  );
}

// ============================================================================
// 新建自动化任务弹窗（Figma 9665 / 9782 / 9783 / 9785 Modal 720px）
// ============================================================================

// 分隔线 1px #F2F2F2
// 星期表头 日 一 二 三 四 五 六（周日为一周首日）：12/18 black .26，7 等分列、列间距 4
// 日期网格：每行 7 格等分、行间距 16，数字固定在 28×28 内居中（Regular/T2，14/22，black .88）
// 今天（9421:108344）：数字变 #1E63F5；选中（9421:108343）：28px 胶囊 #1E63F5 / r32 / 文字 rgba(255,255,255,.9)
// 设计稿里日期是 1~31 顺序占位，这里按真实年月排布，月初偏移与月末补位留空以保持网格对齐。
// ============================================================================
function CalendarMenu({ anchor, onClose, selected, onSelect }: {
  anchor: HTMLElement;
  onClose: () => void;
  selected: CalendarDate;
  onSelect: (value: CalendarDate) => void;
}) {
  const unlockScroll = useUnlockScrollInDialog();
  // 打开时定位到已选年月；翻页只改面板视图，点中日期才回写并关闭
  const [view, setView] = useState({ year: selected.year, month: selected.month });
  const today = new Date();
  const firstWeekday = new Date(view.year, view.month - 1, 1).getDay();
  const daysInMonth = new Date(view.year, view.month, 0).getDate();
  const cells: (number | null)[] = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: daysInMonth }, (_, index) => index + 1),
  ];
  while (cells.length % 7) cells.push(null);
  const rows = Array.from({ length: cells.length / 7 }, (_, index) => cells.slice(index * 7, index * 7 + 7));
  const shiftMonth = (delta: number) => {
    const next = new Date(view.year, view.month - 1 + delta, 1);
    setView({ year: next.getFullYear(), month: next.getMonth() + 1 });
  };
  const inSelectedMonth = view.year === selected.year && view.month === selected.month;
  return (
    <OperationMenu anchor={anchor} gap={8} forceBelow className="rounded-[8px] bg-white p-[16px] shadow-[0_0_12px_rgba(0,0,0,0.08)]" style={{ width: 288 }} onPointerDown={event => event.stopPropagation()}>
      <div className="flex flex-col gap-[16px]">
        <div className="flex items-center gap-[16px]">
          <button type="button" aria-label="上一月" onClick={() => shiftMonth(-1)} className="flex size-[16px] shrink-0 cursor-pointer items-center justify-center">
            <img src="/assets/cal-left.svg" alt="" className="size-[16px]" />
          </button>
          <span className="flex-1 text-center font-['PingFang_SC:Medium'] text-[16px] font-medium leading-[24px] tracking-[0.016px] text-[rgba(0,0,0,0.88)]">
            {view.year}年{view.month}月
          </span>
          <button type="button" aria-label="下一月" onClick={() => shiftMonth(1)} className="flex size-[16px] shrink-0 cursor-pointer items-center justify-center">
            <img src="/assets/cal-right.svg" alt="" className="size-[16px]" />
          </button>
        </div>
        <div className="h-[1px] w-full bg-[#f2f2f2]" />
        <div ref={unlockScroll} className="flex flex-col gap-[16px]">
          <div className="flex gap-[4px]">
            {["日", "一", "二", "三", "四", "五", "六"].map(label => (
              <span key={label} className="flex-1 text-center font-['PingFang_SC:Regular'] text-[12px] leading-[18px] tracking-[0.012px] text-[rgba(0,0,0,0.26)]">
                {label}
              </span>
            ))}
          </div>
          {rows.map((row, rowIndex) => (
            <div key={rowIndex} className="flex">
              {row.map((item, index) => {
                if (item === null) return <span key={`pad-${index}`} className="h-[28px] flex-1" />;
                const isSelected = inSelectedMonth && item === selected.day;
                const isToday = view.year === today.getFullYear() && view.month === today.getMonth() + 1 && item === today.getDate();
                return (
                  <button
                    key={item}
                    type="button"
                    aria-label={`${view.year}年${view.month}月${item}日`}
                    onClick={() => { onSelect({ year: view.year, month: view.month, day: item }); onClose(); }}
                    className="flex flex-1 cursor-pointer justify-center"
                  >
                    <span className={`flex h-[28px] w-[28px] items-center justify-center rounded-[32px] font-['PingFang_SC:Regular'] text-[14px] leading-[22px] tracking-[0.014px] ${isSelected ? "bg-[#1e63f5] text-[rgba(255,255,255,0.9)]" : `${isToday ? "text-[#1e63f5]" : "text-[rgba(0,0,0,0.88)]"} hover:bg-[#f2f2f2]`}`}>
                      {item}
                    </span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </OperationMenu>
  );
}

// 月日 chip：Figma 9783:70498「每年」弹窗里的「11月5号」，点击弹出上面共用的「选择日」面板。
// 排期只有月日、没有年份，年份取今年作为面板定位与翻页起点，选中后只回写月与日。
function YearDateChip({ month, day, onMonthChange, onDayChange }: {
  month: number;
  day: string;
  onMonthChange: (month: number) => void;
  onDayChange: (day: string) => void;
}) {
  const [anchor, setAnchor] = useState<HTMLButtonElement | null>(null);
  useDismissOnOutside(anchor, setAnchor);
  return (
    <Fragment>
      <button
        type="button"
        onClick={event => setAnchor(current => current ? null : event.currentTarget)}
        className="flex h-[32px] shrink-0 cursor-pointer items-center justify-center gap-[8px] rounded-[4px] bg-[#f7f7f7] px-[8px] font-['PingFang_SC:Regular'] text-[14px] font-normal leading-[22px] tracking-[0.014px] text-[rgba(0,0,0,0.88)] hover:bg-[#e6e6e6]"
      >
        <span className="whitespace-nowrap">{month}月{day}</span>
        {/* Figma 9785:71155：月日 chip 同样带 down-small 箭头（16×16） */}
        <img src="/assets/automation-down-small.svg" alt="" className="size-[16px] shrink-0" />
      </button>
      {anchor && <CalendarMenu
        anchor={anchor}
        onClose={() => setAnchor(null)}
        selected={{ year: new Date().getFullYear(), month, day: parseInt(day) || 1 }}
        onSelect={({ month: nextMonth, day: nextDay }) => {
          if (nextMonth !== month) onMonthChange(nextMonth);
          onDayChange(`${nextDay}号`);
        }}
      />}
    </Fragment>
  );
}

// ============================================================================
// 任务卡片（Figma 9625:49728 #9706:63239 / #9706:63243）
// h≈48，圆角 8px，32px 文档图标 + 标题 Medium/T2 + 副标题 Regular/T2(0.6)。
// hover：行背景 #F2F2F2，右侧浮现两个 32×32 图标按钮（暂停 / 更多）。
// 点「更多」：弹出 192px DropdownMenu（编辑 / 立即执行 / 执行记录 / 删除）。
// 点卡片本身：展开右侧自动化详情栏（Figma 9787:71282）。
// ============================================================================

export { TagTabs, SelectChip, MultiSelectChip, TimeWheelColumn, TimeChip, NumberStepper, TimezoneSelect, ScheduleEditor, AdvancedSettings, CalendarMenu, YearDateChip };
