import { useEffect, useRef, useState } from "react";
import { Dialog, DialogClose, DialogContent, DialogTitle } from "./ui/dialog";
import { OperationMenu } from "./operation-menu";
import { FILE_FORMATS, formatByExtension, matchFileFilters } from "./file-filter";
import type { FileFormat, TimeFilter } from "./file-filter";

// 点击「上传文件」下拉里的云来源（Figma 9484:51165）后弹出的「选择文件」（Figma 9553:41101）
// 结构：标题 / 云来源页签 / 搜索 + 筛选 / 可多选文件列表 / 已选数量 + 取消 + 确定
export type CloudSourceTab = "Outlook" | "OneDrive" | "SharePoint" | "产物";

export const CLOUD_SOURCE_TABS: CloudSourceTab[] = ["Outlook", "OneDrive", "SharePoint", "产物"];

// 文件夹内部的文件不单独成行（设计稿：选中文件夹时只高亮文件夹这一行，
// 底部计数按文件夹内的文件数累加），因此 children 只用于计数与提交。
type CloudChildFile = { id: string; name: string; size: number; icon: string };

type CloudEntry = {
  id: string;
  name: string;
  kind: "folder" | "file";
  icon: string;
  size?: number;
  modified: Date;
  disabled?: boolean;
  children?: CloudChildFile[];
};

const at = (daysAgo: number, hour: number, minute: number) => {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysAgo, hour, minute);
};
// 设计稿时间格式：2017.8.21 17:49
const stamp = (date: Date) => `${date.getFullYear()}.${date.getMonth() + 1}.${date.getDate()} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
const sizeText = (size: number) => size >= 1024 * 1024 ? `${Math.round(size / (1024 * 1024))} MB` : `${Math.max(1, Math.round(size / 1024))} KB`;

const FOLDER_ICON = "/assets/select-file-folder.png";
const EXCEL_ICON = "/assets/select-file-excel.svg";
const PPT_ICON = "/assets/select-file-ppt.svg";
const OTHER_ICON = "/assets/select-file-other.svg";
const WORD_ICON = "/assets/attachment-word.svg";
const PDF_ICON = "/assets/attachment-pdf.svg";

const mb = (value: number) => Math.round(value * 1024 * 1024);
const kb = (value: number) => Math.round(value * 1024);

const CLOUD_FILES: Record<CloudSourceTab, CloudEntry[]> = {
  OneDrive: [
    {
      id: "onedrive-folder",
      name: "项目资料归档",
      kind: "folder",
      icon: FOLDER_ICON,
      modified: at(3, 17, 49),
      children: [
        { id: "onedrive-folder-spec", name: "需求规格说明书.XLSX", size: mb(36), icon: EXCEL_ICON },
        { id: "onedrive-folder-report", name: "立项汇报.PPTX", size: mb(36), icon: PPT_ICON },
      ],
    },
    { id: "onedrive-budget", name: "项目排期与预算.XLSX", kind: "file", icon: EXCEL_ICON, size: mb(36), modified: at(3, 17, 49) },
    { id: "onedrive-compare", name: "竞品对比分析.PPTX", kind: "file", icon: PPT_ICON, size: mb(36), modified: at(5, 9, 12) },
    { id: "onedrive-legacy", name: "旧版方案.PPTX", kind: "file", icon: OTHER_ICON, size: mb(36), modified: at(11, 20, 6), disabled: true },
  ],
  Outlook: [
    {
      id: "outlook-folder",
      name: "往来邮件附件",
      kind: "folder",
      icon: FOLDER_ICON,
      modified: at(1, 10, 24),
      children: [
        { id: "outlook-folder-minutes", name: "项目启动会纪要.PDF", size: kb(820), icon: PDF_ICON },
        { id: "outlook-folder-letter", name: "客户需求确认函.DOCX", size: kb(460), icon: WORD_ICON },
      ],
    },
    { id: "outlook-quote", name: "供应商报价单.XLSX", kind: "file", icon: EXCEL_ICON, size: kb(312), modified: at(6, 11, 5) },
    { id: "outlook-align", name: "需求对齐说明.DOCX", kind: "file", icon: WORD_ICON, size: kb(268), modified: at(2, 15, 38) },
  ],
  SharePoint: [
    {
      id: "sharepoint-folder",
      name: "团队共享资料",
      kind: "folder",
      icon: FOLDER_ICON,
      modified: at(2, 16, 30),
      children: [
        { id: "sharepoint-folder-api", name: "接口设计文档.DOCX", size: mb(1.4), icon: WORD_ICON },
        { id: "sharepoint-folder-guide", name: "产品使用规范.PDF", size: mb(2.6), icon: PDF_ICON },
      ],
    },
    { id: "sharepoint-version", name: "版本发布记录.XLSX", kind: "file", icon: EXCEL_ICON, size: kb(268), modified: at(8, 14, 12) },
    { id: "sharepoint-review", name: "季度复盘.PPTX", kind: "file", icon: PPT_ICON, size: mb(3.1), modified: at(4, 9, 48) },
  ],
  产物: [
    { id: "artifact-draft", name: "项目方案初稿.DOCX", kind: "file", icon: WORD_ICON, size: kb(320), modified: at(1, 9, 30) },
    { id: "artifact-breakdown", name: "需求拆解清单.XLSX", kind: "file", icon: EXCEL_ICON, size: kb(180), modified: at(3, 14, 6) },
    { id: "artifact-compare", name: "竞品对比分析.PPTX", kind: "file", icon: PPT_ICON, size: mb(3.4), modified: at(5, 18, 42) },
    { id: "artifact-review", name: "复盘报告.PPTX", kind: "file", icon: PPT_ICON, size: mb(2.2), modified: at(9, 10, 18) },
  ],
};

const TIME_OPTIONS: { label: string; value: TimeFilter }[] = [
  { label: "全部时间", value: null },
  { label: "近 7 天", value: { kind: "recent", days: 7 } },
  { label: "近 30 天", value: { kind: "recent", days: 30 } },
];

export function SelectFileDialog({ initialTab, onClose, onConfirm }: {
  initialTab: CloudSourceTab;
  onClose: () => void;
  onConfirm: (files: { name: string; size: number }[]) => void;
}) {
  const [tab, setTab] = useState<CloudSourceTab>(initialTab);
  const [query, setQuery] = useState("");
  const [formats, setFormats] = useState<FileFormat[]>([]);
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

  const entries = CLOUD_FILES[tab];
  // 只有文件参与筛选；文件夹看其内部文件是否命中
  const visible = entries.filter(entry => {
    const hits = (name: string) => matchFileFilters(
      { name, format: formatByExtension(name), modified: entry.modified },
      { query, formats, timeFilter },
    );
    if (entry.kind === "folder") return (entry.children ?? []).some(file => hits(file.name));
    return hits(entry.name);
  });

  // 文件夹整行选中，计数按内部文件数累加
  const fileCountOf = (entry: CloudEntry) => entry.kind === "folder" ? entry.children?.length ?? 0 : 1;
  const selectedCount = entries.reduce((total, entry) => total + (selected.has(entry.id) ? fileCountOf(entry) : 0), 0);

  const toggle = (entry: CloudEntry) => {
    if (entry.disabled) return;
    setSelected(current => {
      const next = new Set(current);
      if (next.has(entry.id)) next.delete(entry.id);
      else next.add(entry.id);
      return next;
    });
  };

  const confirm = () => {
    const files = entries.flatMap(entry => {
      if (!selected.has(entry.id)) return [];
      if (entry.kind === "folder") return (entry.children ?? []).map(file => ({ name: file.name, size: file.size }));
      return [{ name: entry.name, size: entry.size ?? 0 }];
    });
    if (!files.length) return;
    onConfirm(files);
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
                <button key={item} type="button" role="tab" aria-selected={tab === item} onClick={() => { setTab(item); setSelected(new Set()); setQuery(""); }} className={`relative flex h-full shrink-0 cursor-pointer items-center text-[16px] leading-[24px] tracking-[0.016px] transition-colors ${tab === item ? "text-[#1e63f5]" : "text-[rgba(0,0,0,0.6)] hover:text-[rgba(0,0,0,0.88)]"}`}>
                  <span className={tab === item ? "font-medium" : "font-normal"}>{item}</span>
                  {tab === item && <span aria-hidden className="absolute inset-x-0 bottom-[-1px] h-[2px] bg-[#1e63f5]" />}
                </button>
              ))}
            </div>

            <div className="flex shrink-0 items-center gap-[12px]">
              <label className="flex h-[32px] min-w-0 flex-1 items-center gap-[8px] rounded-[8px] bg-[#f7f7f7] pl-[8px] pr-[16px]">
                <img src="/assets/search-dialog-search-default.svg" alt="" className="size-[16px] shrink-0" />
                <input aria-label="搜索文件名称" placeholder="搜索" value={query} onChange={event => setQuery(event.target.value)} className="min-w-0 flex-1 bg-transparent text-[14px] font-normal leading-[22px] outline-none placeholder:text-[rgba(0,0,0,0.38)]" />
              </label>
              <button type="button" aria-label="筛选" aria-haspopup="menu" aria-expanded={Boolean(filterAnchor)} onClick={event => setFilterAnchor(current => current ? null : event.currentTarget)} className={`flex size-[32px] shrink-0 cursor-pointer items-center justify-center rounded-[4px] hover:bg-[#f2f2f2] ${formats.length || timeFilter ? "bg-[#ebf4ff]" : ""}`}>
                <img src="/assets/project-filter.svg" alt="" className="size-[20px]" />
              </button>
            </div>

            <div className="flex min-h-0 flex-1 flex-col gap-[4px] overflow-y-auto">
              {visible.length ? visible.map(entry => {
                const checked = selected.has(entry.id);
                return (
                  <button key={entry.id} type="button" role="checkbox" aria-checked={checked} disabled={entry.disabled} onClick={() => toggle(entry)} className={`flex w-full shrink-0 items-center gap-[8px] rounded-[8px] px-[8px] py-[8px] text-left transition-colors disabled:cursor-not-allowed ${checked ? "bg-[#f2f2f2]" : entry.disabled ? "" : "hover:bg-[#f7f7f7]"}`}>
                    <img src={checked ? "/assets/checkbox-checked.svg" : "/assets/checkbox-unchecked.svg"} alt="" className={`size-[16px] shrink-0 ${entry.disabled ? "opacity-0" : ""}`} />
                    {/* 设计稿里文件夹图标是 40×40 的图片压在 32 的坑位上，视觉比其他类型图标略大 */}
                    <span className="flex size-[32px] shrink-0 items-center justify-center">
                      <img src={entry.icon} alt="" className={entry.kind === "folder" ? "size-[40px] max-w-none shrink-0" : "size-[32px] shrink-0 object-contain"} />
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className={`truncate text-[14px] font-normal leading-[22px] tracking-[0.014px] ${entry.disabled ? "text-[rgba(0,0,0,0.26)]" : "text-[rgba(0,0,0,0.88)]"}`}>{entry.name}</span>
                      <span className={`truncate text-[12px] font-normal leading-[20px] tracking-[0.012px] ${entry.disabled ? "text-[rgba(0,0,0,0.26)]" : "text-[rgba(0,0,0,0.6)]"}`}>
                        {entry.kind === "folder" ? stamp(entry.modified) : `${sizeText(entry.size ?? 0)} · ${stamp(entry.modified)}`}
                      </span>
                    </span>
                  </button>
                );
              }) : <p role="status" className="px-[8px] py-[24px] text-center text-[14px] leading-[22px] text-[rgba(0,0,0,0.38)]">没有匹配的文件</p>}
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
              {FILE_FORMATS.map(format => {
                const on = formats.includes(format);
                return (
                  <button key={format} type="button" role="menuitemcheckbox" aria-checked={on} onClick={() => setFormats(current => on ? current.filter(item => item !== format) : [...current, format])} className="flex w-full cursor-pointer items-center justify-between rounded-[8px] px-[8px] py-[11px] text-left text-[14px] font-normal leading-[22px] text-[rgba(0,0,0,0.88)] hover:bg-[#f7f7f7]">
                    {format}{on && <img src="/assets/ecd73.svg" alt="" />}
                  </button>
                );
              })}
              <span aria-hidden className="my-[4px] h-[1px] bg-[#f2f2f2]" />
              {TIME_OPTIONS.map(option => {
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
