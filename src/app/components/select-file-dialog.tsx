import { useEffect, useRef, useState } from "react";
import { Dialog, DialogClose, DialogContent, DialogTitle } from "./ui/dialog";
import { OperationMenu } from "./operation-menu";
import { FILE_FORMATS, formatByExtension, matchFileFilters } from "./file-filter";
import type { FileFormat, TimeFilter } from "./file-filter";
import { OUTLOOK_EMAILS, OUTLOOK_NARROW_BREAKPOINT, OutlookEmailList, emailBlob, emailDate, emailFileName, emailSearchText } from "./outlook-emails";
import type { OutlookEmail } from "./outlook-emails";
import { CloudFileList, collectCloudFiles, ONE_DRIVE_ROOT, SHAREPOINT_ROOT, CLOUD_KIND_FILTERS } from "./cloud-file-list";
import type { CloudEntry, CloudFileKind } from "./cloud-file-list";

// 点击「上传文件」下拉里的云来源（Figma 9484:51165）后弹出的「选择文件」（Figma 9553:41101）
// 结构：标题 / 云来源页签 / 搜索 + 筛选 / 可多选列表 / 已选数量 + 取消 + 确定
// Outlook 页签与输入框附件面板的 Outlook 完全一致（邮件列表，见 ./outlook-emails）
export type CloudSourceTab = "Outlook" | "OneDrive" | "SharePoint" | "产物";

export const CLOUD_SOURCE_TABS: CloudSourceTab[] = ["Outlook", "OneDrive", "SharePoint", "产物"];

const at = (daysAgo: number, hour: number, minute: number) => {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysAgo, hour, minute);
};
// 设计稿时间格式：2017.8.21 17:49
const stamp = (date: Date) => `${date.getFullYear()}.${date.getMonth() + 1}.${date.getDate()} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
const sizeText = (size: number) => size >= 1024 * 1024 ? `${Math.round(size / (1024 * 1024))} MB` : `${Math.max(1, Math.round(size / 1024))} KB`;

const EXCEL_ICON = "/assets/select-file-excel.svg";
const PPT_ICON = "/assets/select-file-ppt.svg";
const WORD_ICON = "/assets/attachment-word.svg";
const mb = (value: number) => Math.round(value * 1024 * 1024);
const kb = (value: number) => Math.round(value * 1024);

// 仅「产物」页签保留扁平文件列表；OneDrive / SharePoint 改走共享云盘树（与输入框附件面板一致）。
const ARTIFACT_FILES: CloudEntry[] = [
  { id: "artifact-draft", name: "项目方案初稿.DOCX", kind: "file", icon: WORD_ICON, meta: `${sizeText(kb(320))} · ${stamp(at(1, 9, 30))}`, size: kb(320) },
  { id: "artifact-breakdown", name: "需求拆解清单.XLSX", kind: "file", icon: EXCEL_ICON, meta: `${sizeText(kb(180))} · ${stamp(at(3, 14, 6))}`, size: kb(180) },
  { id: "artifact-compare", name: "竞品对比分析.PPTX", kind: "file", icon: PPT_ICON, meta: `${sizeText(mb(3.4))} · ${stamp(at(5, 18, 42))}`, size: mb(3.4) },
  { id: "artifact-review", name: "复盘报告.PPTX", kind: "file", icon: PPT_ICON, meta: `${sizeText(mb(2.2))} · ${stamp(at(9, 10, 18))}`, size: mb(2.2) },
];

const TIME_OPTIONS: { label: string; value: TimeFilter }[] = [
  { label: "全部时间", value: null },
  { label: "近 7 天", value: { kind: "recent", days: 7 } },
  { label: "近 30 天", value: { kind: "recent", days: 30 } },
];

export function SelectFileDialog({ initialTab, onClose, onConfirm }: {
  initialTab: CloudSourceTab;
  onClose: () => void;
  onConfirm: (files: { name: string; size: number }[], source: CloudSourceTab) => void;
}) {
  const [tab, setTab] = useState<CloudSourceTab>(initialTab);
  const [query, setQuery] = useState("");
  const [queryFocused, setQueryFocused] = useState(false);
  const [formats, setFormats] = useState<FileFormat[]>([]);
  const [cloudKind, setCloudKind] = useState<CloudFileKind>("all");
  const [timeFilter, setTimeFilter] = useState<TimeFilter>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [filterAnchor, setFilterAnchor] = useState<HTMLButtonElement | null>(null);
  const filterMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!filterAnchor) return;
    const close = (event: PointerEvent) => {
      if (!(event.target instanceof Node)) return;
      if (filterAnchor.contains(event.target) || filterMenuRef.current?.contains(event.target)) return;
      setFilterAnchor(null);
    };
    // Esc 只收起筛选菜单，不关闭整个「选择文件」弹窗
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      setFilterAnchor(null);
    };
    document.addEventListener("pointerdown", close);
    window.addEventListener("keydown", escape, true);
    return () => {
      document.removeEventListener("pointerdown", close);
      window.removeEventListener("keydown", escape, true);
    };
  }, [filterAnchor]);

  // 列表宽度 < 断点时邮件行走窄版（无头像、正文换行），与输入框附件面板同一判定
  const [narrow, setNarrow] = useState(false);
  // 弹窗内容走 Portal，首次 effect 时 ref 还是 null，故用 callback ref 拿节点后再 observe
  const [listEl, setListEl] = useState<HTMLDivElement | null>(null);
  const isOutlook = tab === "Outlook";

  useEffect(() => {
    if (!listEl) return;
    const update = () => setNarrow(listEl.clientWidth < OUTLOOK_NARROW_BREAKPOINT);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(listEl);
    return () => observer.disconnect();
  }, [listEl]);

  const isCloudTree = tab === "OneDrive" || tab === "SharePoint";
  const cloudRoot = tab === "OneDrive" ? ONE_DRIVE_ROOT : SHAREPOINT_ROOT;

  // 产物页签：扁平文件列表，沿用格式/时间筛选
  const visibleArtifacts = isOutlook || isCloudTree ? [] : ARTIFACT_FILES.filter(entry =>
    matchFileFilters(
      { name: entry.name, format: formatByExtension(entry.name), modified: new Date() },
      { query, formats, timeFilter },
    ),
  );

  // 邮件：搜索命中发件人/标题/正文，时间筛选按邮件时间；格式筛选对邮件不适用
  const visibleEmails = OUTLOOK_EMAILS.filter(email => {
    if (query.trim() && !emailSearchText(email).toLowerCase().includes(query.trim().toLowerCase())) return false;
    return matchFileFilters({ name: email.title, format: "其他", modified: emailDate(email.time) }, { formats: [], timeFilter });
  });

  const toggle = (id: string) => setSelected(current => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });

  // 云盘树：整行选中，计数与提交都按「条目下的文件数」累加（文件夹/站点含其全部后代文件）
  const cloudFileCount = (entry: CloudEntry) => entry.kind === "file" ? 1 : collectCloudFiles(entry).length;
  const cloudEntryById = new Map<string, CloudEntry>();
  const indexCloud = (entries: CloudEntry[]) => entries.forEach(entry => { cloudEntryById.set(entry.id, entry); if (entry.children) indexCloud(entry.children); });
  indexCloud(cloudRoot);

  const selectedCount = isOutlook
    ? OUTLOOK_EMAILS.filter(email => selected.has(email.id)).length
    : isCloudTree
      ? Array.from(selected).reduce((total, id) => {
          const entry = cloudEntryById.get(id);
          return total + (entry && !entry.disabled ? cloudFileCount(entry) : 0);
        }, 0)
      : visibleArtifacts.filter(entry => selected.has(entry.id)).length;

  const confirm = () => {
    const files = isOutlook
      ? OUTLOOK_EMAILS.filter(email => selected.has(email.id)).map(email => ({ name: emailFileName(email), size: emailBlob(email).size }))
      : isCloudTree
        ? Array.from(selected).flatMap(id => {
            const entry = cloudEntryById.get(id);
            if (!entry || entry.disabled) return [];
            return collectCloudFiles(entry).filter(file => !file.disabled).map(file => ({ name: file.name, size: file.size ?? 0 }));
          })
        : visibleArtifacts.filter(entry => selected.has(entry.id)).map(entry => ({ name: entry.name, size: entry.size ?? 0 }));
    if (!files.length) return;
    onConfirm(files, tab);
    onClose();
  };

  return (
    <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
      <DialogContent aria-describedby={undefined} className="flex max-h-[calc(100dvh-32px)] w-[720px] max-w-[calc(100%-32px)] flex-col gap-0 overflow-hidden rounded-[12px] border-0 bg-white p-0 shadow-[0_0_12px_rgba(0,0,0,0.08)] sm:max-w-[calc(100%-32px)] [&>button]:hidden">
        <div className="relative shrink-0 px-[24px] py-[16px]">
          <DialogTitle className="text-[16px] font-medium leading-[24px] tracking-[0.016px] text-[rgba(0,0,0,0.88)]">选择文件</DialogTitle>
          <DialogClose asChild>
            <button type="button" aria-label="关闭选择文件弹窗" className="absolute right-[24px] top-[16px] flex size-[24px] items-center justify-center rounded-[4px] outline-none hover:bg-[#f7f7f7]">
              <img src="/assets/f802d.svg" alt="" />
            </button>
          </DialogClose>
        </div>

        <div className="min-h-0 px-[24px]">
          <div className="flex h-[420px] min-h-0 flex-col gap-[16px]">
            {/* 云来源页签：整行 48 高（含底部 1px 分隔线），选中项 2px 蓝线压住分隔线 */}
            <div role="tablist" aria-label="文件来源" className="flex h-[48px] shrink-0 items-end gap-[24px] border-b border-[#e6e6e6]">
              {CLOUD_SOURCE_TABS.map(item => (
                <button key={item} type="button" role="tab" aria-selected={tab === item} onClick={() => { setTab(item); setSelected(new Set()); setQuery(""); setCloudKind("all"); setFormats([]); setTimeFilter(null); }} className={`relative flex h-full shrink-0 cursor-pointer items-center text-[16px] leading-[24px] tracking-[0.016px] transition-colors ${tab === item ? "text-[#1e63f5]" : "text-[rgba(0,0,0,0.6)] hover:text-[rgba(0,0,0,0.88)]"}`}>
                  <span className={tab === item ? "font-medium" : "font-normal"}>{item}</span>
                  {tab === item && <span aria-hidden className="absolute inset-x-0 bottom-[-1px] h-[2px] bg-[#1e63f5]" />}
                </button>
              ))}
            </div>

            <div className="flex shrink-0 items-center gap-[12px]">
              <label className="flex h-[32px] min-w-0 flex-1 items-center gap-[8px] rounded-[8px] bg-[#f7f7f7] pl-[8px] pr-[16px]">
                <img src={queryFocused ? "/assets/search-dialog-search.svg" : "/assets/search-dialog-search-default.svg"} alt="" className="size-[16px] shrink-0" />
                <input
                  aria-label="搜索文件名称"
                  placeholder="搜索"
                  value={query}
                  onChange={event => setQuery(event.target.value)}
                  onFocus={() => setQueryFocused(true)}
                  onBlur={() => setQueryFocused(false)}
                  className="min-w-0 flex-1 bg-transparent text-[14px] font-normal leading-[22px] tracking-[0.014px] text-[rgba(0,0,0,0.88)] outline-none placeholder:text-[rgba(0,0,0,0.26)]"
                />
                {query && (
                  <button type="button" aria-label="清空搜索" onMouseDown={event => event.preventDefault()} onClick={() => setQuery("")} className="flex size-[16px] shrink-0 cursor-pointer items-center justify-center">
                    <img src="/assets/f802d.svg" alt="" className="size-[12px]" />
                  </button>
                )}
              </label>
              <button type="button" aria-label="筛选" aria-haspopup="menu" aria-expanded={Boolean(filterAnchor)} onClick={event => setFilterAnchor(current => current ? null : event.currentTarget)} className={`flex size-[32px] shrink-0 cursor-pointer items-center justify-center rounded-[4px] hover:bg-[#f2f2f2] ${formats.length || timeFilter || cloudKind !== "all" ? "bg-[#ebf4ff]" : ""}`}>
                <img src="/assets/project-filter.svg" alt="" className="size-[20px]" />
              </button>
            </div>

            <div ref={setListEl} className="min-h-0 flex-1 overflow-y-auto">
              {isOutlook ? (
                <OutlookEmailList
                  emails={visibleEmails}
                  isSelected={email => selected.has(email.id)}
                  onToggle={email => toggle(email.id)}
                  narrow={narrow}
                />
              ) : isCloudTree ? (
                <CloudFileList
                  source={tab as "OneDrive" | "SharePoint"}
                  query={query}
                  kind={cloudKind}
                  isSelected={entry => selected.has(entry.id)}
                  onToggle={entry => toggle(entry.id)}
                  onOpenFile={entry => toggle(entry.id)}
                />
              ) : (
              <div className="flex flex-col gap-[4px]">
              {visibleArtifacts.length ? visibleArtifacts.map(entry => {
                const checked = selected.has(entry.id);
                return (
                  <button key={entry.id} type="button" role="checkbox" aria-checked={checked} disabled={entry.disabled} onClick={() => toggle(entry.id)} className={`flex w-full shrink-0 items-center gap-[8px] rounded-[8px] px-[8px] py-[8px] text-left transition-colors disabled:cursor-not-allowed ${checked ? "bg-[#f2f2f2]" : entry.disabled ? "" : "hover:bg-[#f7f7f7]"}`}>
                    <img src={checked ? "/assets/checkbox-checked.svg" : "/assets/checkbox-unchecked.svg"} alt="" className={`size-[16px] shrink-0 ${entry.disabled ? "opacity-0" : ""}`} />
                    <span className="flex size-[32px] shrink-0 items-center justify-center">
                      <img src={entry.icon} alt="" className="size-[32px] shrink-0 object-contain" />
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className={`truncate text-[14px] font-normal leading-[22px] tracking-[0.014px] ${entry.disabled ? "text-[rgba(0,0,0,0.26)]" : "text-[rgba(0,0,0,0.88)]"}`}>{entry.name}</span>
                      <span className={`truncate text-[12px] font-normal leading-[20px] tracking-[0.012px] ${entry.disabled ? "text-[rgba(0,0,0,0.26)]" : "text-[rgba(0,0,0,0.6)]"}`}>{entry.meta}</span>
                    </span>
                  </button>
                );
              }) : <p role="status" className="px-[8px] py-[24px] text-center text-[14px] leading-[22px] text-[rgba(0,0,0,0.38)]">没有匹配的文件</p>}
              </div>
              )}
            </div>
          </div>
        </div>

        <div className="flex shrink-0 items-center justify-between gap-[24px] px-[24px] py-[24px]">
          <span aria-live="polite" className="text-[14px] font-normal leading-[22px] tracking-[0.014px] text-[rgba(0,0,0,0.88)]">已选择{selectedCount}个文件</span>
          <div className="flex shrink-0 items-center gap-[24px]">
            <DialogClose asChild>
              <button type="button" className="rounded-[4px] px-[4px] py-[3px] text-[14px] font-normal leading-[22px] text-[rgba(0,0,0,0.6)] hover:bg-[#f7f7f7]">取消</button>
            </DialogClose>
            <button type="button" disabled={selectedCount === 0} onClick={confirm} className="rounded-[4px] bg-[#1e63f5] px-[16px] py-[5px] text-[14px] font-normal leading-[22px] text-white hover:bg-[#4788ff] active:bg-[#0e45cf] disabled:bg-[#99c3ff] disabled:text-white/55">确定</button>
          </div>
        </div>

        {filterAnchor && (
          <OperationMenu ref={filterMenuRef} anchor={filterAnchor} gap={8} align="end" role="menu" aria-label="筛选文件" className="w-[168px] rounded-[12px] border border-[#f2f2f2] bg-white px-[8px] py-[4px] shadow-[0_0_12px_rgba(0,0,0,0.08)]">
            <div className="flex flex-col py-[4px]">
              {/* 云盘页签（OneDrive/SharePoint）与输入框一样按类型筛选；产物按格式；邮件只看时间 */}
              {isCloudTree && CLOUD_KIND_FILTERS.map(filter => {
                const on = cloudKind === filter.value;
                return (
                  <button key={filter.value} type="button" role="menuitemradio" aria-checked={on} onClick={() => { setCloudKind(filter.value); setFilterAnchor(null); }} className={`flex w-full cursor-pointer rounded-[8px] px-[8px] py-[8px] text-left text-[14px] font-normal hover:bg-[#f2f2f2] ${on ? "text-[#1e63f5]" : "text-[rgba(0,0,0,0.88)]"}`}>
                    {filter.label}
                  </button>
                );
              })}
              {!isOutlook && !isCloudTree && FILE_FORMATS.map(format => {
                const on = formats.includes(format);
                return (
                  <button key={format} type="button" role="menuitemcheckbox" aria-checked={on} onClick={() => setFormats(current => on ? current.filter(item => item !== format) : [...current, format])} className="flex w-full cursor-pointer items-center justify-between rounded-[8px] px-[8px] py-[11px] text-left text-[14px] font-normal leading-[22px] text-[rgba(0,0,0,0.88)] hover:bg-[#f7f7f7]">
                    {format}{on && <img src="/assets/ecd73.svg" alt="" />}
                  </button>
                );
              })}
              <span aria-hidden className={`my-[4px] h-[1px] bg-[#f2f2f2] ${isOutlook || isCloudTree ? "hidden" : ""}`} />
              {!isCloudTree && TIME_OPTIONS.map(option => {
                const recentDays = timeFilter?.kind === "recent" ? timeFilter.days : null;
                const on = option.value === null ? timeFilter === null : option.value.kind === "recent" && recentDays === option.value.days;
                return (
                  <button key={option.label} type="button" role="menuitemradio" aria-checked={on} onClick={() => setTimeFilter(option.value)} className="flex w-full cursor-pointer items-center justify-between rounded-[8px] px-[8px] py-[11px] text-left text-[14px] font-normal leading-[22px] text-[rgba(0,0,0,0.88)] hover:bg-[#f7f7f7]">
                    {option.label}{on && <img src="/assets/ecd73.svg" alt="" />}
                  </button>
                );
              })}
            </div>
          </OperationMenu>
        )}
      </DialogContent>
    </Dialog>
  );
}
