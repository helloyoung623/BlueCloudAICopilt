import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { MAX_ATTACHMENTS, formatFileSize, getAttachmentIcon, makeVirtualFile, stampFileMeta } from "./attachment-tray";
import type { ChatAttachment } from "./attachment-tray";
import { OperationMenu } from "./operation-menu";
import { CLOUD_FORMATS, FileFilterButton, FilterResetRow, formatByExtension, matchFileFilters } from "./file-filter";
import type { FileFormat, TimeFilter } from "./file-filter";
import { OUTLOOK_EMAILS, OUTLOOK_NARROW_BREAKPOINT, OutlookEmailList, emailBlob, emailFileName, emailSearchText } from "./outlook-emails";
import type { OutlookEmail } from "./outlook-emails";
import { PopoverContent } from "./ui/popover";
import type { ProjectFiles } from "./project-files";

export type AttachmentSource = "Outlook" | "OneDrive" | "SharePoint" | "项目资料" | "产物";
type FileKind = "all" | "image" | "document" | "email";
// 一层列表的搜索 + 筛选状态；按作用域保存，离开时销毁
type ScopeState = { query: string; formats: FileFormat[]; timeFilter: TimeFilter };
const EMPTY_SCOPE: ScopeState = { query: "", formats: [], timeFilter: null };

// 邮件数据与行样式见 ./outlook-emails（与「选择文件」弹窗的 Outlook 页签共用）
const SOURCE_BADGE: Partial<Record<AttachmentSource, string>> = {
  OneDrive: "/assets/badge-onedrive.svg",
  SharePoint: "/assets/badge-sharepoint.svg",
};
const OUTLOOK_BADGE = "/assets/badge-outlook.svg";

function examplePdf(title: string) {
  const stream = `BT /F1 18 Tf 48 780 Td (${title}) Tj ET`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
  ];
  let content = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(content.length);
    content += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = content.length;
  content += `xref\n0 ${offsets.length}\n0000000000 65535 f \n`;
  content += offsets.slice(1).map(offset => `${String(offset).padStart(10, "0")} 00000 n \n`).join("");
  return new Blob([`${content}trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`], { type: "application/pdf" });
}

type ExampleFile = { name: string; kind: Exclude<FileKind, "all">; extension: string; metaLabel?: string } & (
  { url: string; size: number; blob?: never } | { blob: Blob; url?: never; size?: never }
);

export const EXAMPLE_FILES: ExampleFile[] = [
  { name: "项目现场照片.jpeg", kind: "image", extension: "jpeg", url: "/assets/attachment-example.jpeg", size: 61385 },
  { name: "项目方案与实施计划.pdf", kind: "document", extension: "pdf", blob: examplePdf("Example project plan") },
  { name: "项目资料索引.html", kind: "document", extension: "html", blob: new Blob(["<!doctype html><meta charset=\"utf-8\"><title>Example index</title><h1>Example project files</h1>"], { type: "text/html" }) },
  { name: "项目进展通知.eml", kind: "email", extension: "eml", blob: new Blob(["From: demo@example.invalid\r\nTo: team@example.invalid\r\nSubject: Example project update\r\nContent-Type: text/plain; charset=utf-8\r\n\r\nThis is a local example attachment.\r\n"], { type: "message/rfc822" }) },
  { name: "项目交付说明.pdf", kind: "document", extension: "pdf", blob: examplePdf("Example delivery notes") },
];

const FILTERS: { value: FileKind; label: string }[] = [
  { value: "all", label: "全部类型" },
  { value: "image", label: "图片" },
  { value: "document", label: "文档" },
  { value: "email", label: "邮件文件" },
];

// ============ 云盘来源列表 ============
// 数据与云盘树组件见 ./cloud-file-list（与「选择文件」弹窗的 OneDrive / SharePoint 页签共用）。
// 云盘树：checkbox16 + 图标32 + 名称14/0.88 + 元信息12/0.6，行间 gap4、hover #F7F7F7、选中底 #F2F2F2；
// 文件夹/站点可进入并显示面包屑；产物无文件夹，元信息额外带「任务名称 · 」前缀。
import {
  CloudFileList as SharedCloudFileList,
  ONE_DRIVE_ROOT,
  SHAREPOINT_ROOT,
  cloudIcon,
  demoFile,
  makeDemoArtifacts,
  sortDisabledLast,
  CLOUD_FOLDER_ICON,
  CLOUD_SITE_ICON,
  DEMO_STAMP,
  DEMO_SIZE_STAMP,
} from "./cloud-file-list";
import type { CloudEntry as BaseCloudEntry } from "./cloud-file-list";

// 输入框侧条目额外携带真实文件（可能来自项目产物/资料），供加入附件时使用
// modified：真实创建时间（有则用，无则从 meta 里的日期解析），供「更新时间」筛选使用
type CloudEntry = BaseCloudEntry & { real?: ExampleFile; modified?: number };

const CLOUD_UNCHECKED = "/assets/checkbox-unchecked.svg";
const CLOUD_CHECKED = "/assets/checkbox-checked.svg";

// 条目在「格式」筛选里的归类：文件夹/站点归为「文件夹」，文件按扩展名分文档/表格/其他
function cloudEntryFormat(entry: CloudEntry): FileFormat {
  return entry.kind === "file" ? formatByExtension(entry.name) : "文件夹";
}
// 更新时间筛选的基准时间：优先真实 createdAt，其次从 meta 文本里的「2026.11.12 09:30」解析
function cloudEntryModified(entry: CloudEntry): Date {
  if (entry.modified) return new Date(entry.modified);
  const match = entry.meta.match(/(\d{4})\.(\d{1,2})\.(\d{1,2})/);
  return match ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])) : new Date(0);
}


const stampOf = (time: number) => {
  const date = new Date(time);
  return `${date.getFullYear()}.${date.getMonth() + 1}.${date.getDate()} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
};

// 产物无文件夹（Figma 9622:48317）：无项目上下文时用示例文件，元信息带「任务名称 · 」
const DEMO_ARTIFACT_ENTRIES: CloudEntry[] = [
  demoFile("ar-1", "名称超出的部分\"…\"表示.PDF", "/assets/attachment-pdf.svg", `任务名称 · ${DEMO_SIZE_STAMP}`),
  demoFile("ar-2", "文件的名称表示.XLSX", "/assets/select-file-excel.svg", `任务名称 · ${DEMO_SIZE_STAMP}`),
  demoFile("ar-3", "文件名称.PPTX", "/assets/select-file-ppt.svg", `任务名称任务名称任务名称任务名称任务名称… · ${DEMO_SIZE_STAMP}`),
  // 追加模拟产物（凑够 20~30 条，元信息带「任务名称 · 」前缀）
  ...makeDemoArtifacts("ar-more", 21),
  // 不可选归档项：由列表排序规则自动排到最后
  demoFile("ar-disabled-1", "归档_历史版本.PPTX", "/assets/select-file-other.svg", `任务名称 · ${DEMO_SIZE_STAMP}`, true),
  demoFile("ar-disabled-2", "归档_只读副本.XLSX", "/assets/select-file-other.svg", `任务名称 · ${DEMO_SIZE_STAMP}`, true),
];

function PickerImage({ file }: { file: ExampleFile }) {
  const [preview, setPreview] = useState(file.url);
  useEffect(() => {
    if (!file.blob) {
      setPreview(file.url);
      return;
    }
    const url = URL.createObjectURL(file.blob);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file.blob, file.url]);
  return <img src={preview} alt="" className="size-[32px] shrink-0 rounded-[4px] object-cover" />;
}

export function AttachmentPicker({ source, hasProject, projectFiles, onSourceChange, attachments, onAddFiles, onRemove, onClose }: {
  source: AttachmentSource;
  hasProject: boolean;
  projectFiles?: ProjectFiles;
  onSourceChange: (source: AttachmentSource) => void;
  attachments: ChatAttachment[];
  onAddFiles: (files: File[]) => void;
  onRemove: (id: string) => void;
  onClose: () => void;
}) {
  // 搜索与筛选属于「当前这一层列表」，按 scope 存放而不是 tab 级全局变量：
  // scope key = OneDrive / 项目资料 / 产物 / Outlook，SharePoint 为 sp:root 或 sp:${站点id}。
  // 进入站点 → 新空作用域；返回站点列表 → 销毁站点作用域并清空站点层搜索；站点 A/B 互不串。
  // OneDrive / 产物 / 项目资料的搜索筛选按产品决策保留，切回 tab 时不丢失。
  const [scopes, setScopes] = useState<Record<string, ScopeState>>({});
  const [queryFocused, setQueryFocused] = useState(false);
  const [kind, setKind] = useState<FileKind>("all"); // 仅 Outlook 沿用「全部类型/图片/文档/邮件文件」单选
  const [filterOpen, setFilterOpen] = useState(false);
  const [fullFilterOpen, setFullFilterOpen] = useState(false);
  const [pendingName, setPendingName] = useState<string | null>(null);
  // Figma 9650:46400（宽，带头像）/ 1132:19398（窄，无头像+正文换行）：
  // 以面板实际宽度为准，< OUTLOOK_NARROW_BREAKPOINT 切窄版布局。
  const [panelNarrow, setPanelNarrow] = useState(false);
  const [panelEl, setPanelEl] = useState<HTMLDivElement | null>(null);
  // 云盘层级导航：面包屑路径（每级是 folder/site），空数组 = 根级
  const [cloudTrail, setCloudTrail] = useState<CloudEntry[]>([]);
  const pendingRef = useRef(false);
  const filterRef = useRef<HTMLButtonElement>(null);
  const filterMenuRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const id = useId();
  const isCloudTree = source === "OneDrive" || source === "SharePoint";
  const currentSite = source === "SharePoint" ? cloudTrail[0] : undefined;
  const scopeKey = currentSite ? `sp:${currentSite.id}` : source === "SharePoint" ? "sp:root" : source;
  const scope = scopes[scopeKey] ?? EMPTY_SCOPE;
  const { query, formats, timeFilter } = scope;

  const updateScope = useCallback((key: string, patch: Partial<ScopeState>) => {
    setScopes(prev => ({ ...prev, [key]: { ...EMPTY_SCOPE, ...prev[key], ...patch } }));
  }, []);
  const clearScope = useCallback((key: string) => {
    setScopes(prev => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }, []);
  const setQuery = useCallback((value: string) => updateScope(scopeKey, { query: value }), [scopeKey, updateScope]);
  const setFormats = useCallback((value: FileFormat[]) => updateScope(scopeKey, { formats: value }), [scopeKey, updateScope]);
  const setTimeFilter = useCallback((value: TimeFilter) => updateScope(scopeKey, { timeFilter: value }), [scopeKey, updateScope]);

  // 层级导航统一走这里：离开站点时销毁该站点作用域，返回站点列表时清空站点层搜索，
  // 已勾选文件（App 层 attachments）不参与，天然跨层保留。
  const navigateTrail = (nextTrail: CloudEntry[]) => {
    if (currentSite && currentSite.id !== nextTrail[0]?.id) clearScope(`sp:${currentSite.id}`);
    if (source === "SharePoint" && !currentSite && nextTrail[0]) clearScope(`sp:${nextTrail[0].id}`);
    if (!nextTrail.length && source === "SharePoint") updateScope("sp:root", { query: "" });
    setCloudTrail(nextTrail);
    setFullFilterOpen(false);
    setFilterOpen(false);
  };
  const changeTab = (tab: AttachmentSource) => {
    if (source === "SharePoint") {
      if (currentSite) clearScope(`sp:${currentSite.id}`);
      updateScope("sp:root", { query: "" });
    }
    setCloudTrail([]);
    setKind("all");
    setFilterOpen(false);
    setFullFilterOpen(false);
    onSourceChange(tab);
  };
  const projectRecords = source === "项目资料" ? projectFiles?.sources.filter(file => file.status === "enabled") : source === "产物" ? projectFiles?.artifacts : undefined;
  const availableFiles: ExampleFile[] = projectRecords ? projectRecords.map(file => {
    const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
    const kind = ["jpg", "jpeg", "png"].includes(extension) ? "image" : ["eml", "msg"].includes(extension) ? "email" : "document";
    return file.blob
      ? { name: file.name, kind, extension, blob: file.blob }
      : { name: file.name, kind, extension, url: file.url, size: file.size };
  }) : EXAMPLE_FILES;
  // 非 Outlook 页签沿用资料库/项目同一套筛选判定：格式（含文件夹）+ 更新时间 + 搜索词。
  // Outlook 仍用原来的「邮件文件」类型单选，不参与这套字段。
  const useFullFilter = source !== "Outlook";
  useEffect(() => {
    if (!filterOpen) return;
    const close = (event: PointerEvent) => {
      if (event.target instanceof Node && !filterRef.current?.contains(event.target) && !filterMenuRef.current?.contains(event.target)) {
        setFilterOpen(false);
      }
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [filterOpen]);

  // 面板宽度 < 断点 → 窄版：隐藏头像、正文换行。
  // 面板走 Portal 渲染，故用 callback ref 拿到节点后再 observe（挂载时 panelRef 仍为 null）。
  useLayoutEffect(() => {
    if (!panelEl) return;
    const update = () => setPanelNarrow(panelEl.clientWidth < OUTLOOK_NARROW_BREAKPOINT);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(panelEl);
    return () => observer.disconnect();
  }, [panelEl]);

  // 勾选身份用「来源 + 条目 id」而不是文件名：不同站点的同名文件互不覆盖，
  // 切换作用域/被筛选隐藏也不影响底部已选汇总。
  const entryOrigin = (entry: CloudEntry) => `${source}:${entry.id}`;

  const selectFile = async (item: typeof EXAMPLE_FILES[number], origin: string) => {
    const name = `${source}-${item.name}`;
    const selected = attachments.find(attachment => attachment.origin === origin);
    if (selected) {
      onRemove(selected.id);
      return;
    }
    if (pendingRef.current) return;
    if (attachments.length >= MAX_ATTACHMENTS) {
      toast.error(`最多上传 ${MAX_ATTACHMENTS} 个文件`);
      return;
    }
    pendingRef.current = true;
    setPendingName(name);
    try {
      let blob = item.blob;
      if (item.url) {
        const response = await fetch(item.url);
        if (!response.ok) throw new Error(`示例文件读取失败 (${response.status})`);
        blob = await response.blob();
      }
      if (!blob) throw new Error("示例文件内容不存在");
      const file = new File([blob], name, { type: blob.type });
      const badge = SOURCE_BADGE[source];
      onAddFiles([stampFileMeta(file, { ...(badge ? { badge } : {}), origin })]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "无法读取示例文件，请重试");
    } finally {
      pendingRef.current = false;
      setPendingName(null);
    }
  };

  const selectEmail = (email: OutlookEmail) => {
    const name = emailFileName(email);
    const origin = `Outlook:${email.id}`;
    const selected = attachments.find(attachment => attachment.origin === origin);
    if (selected) {
      onRemove(selected.id);
      return;
    }
    if (attachments.length >= MAX_ATTACHMENTS) {
      toast.error(`最多上传 ${MAX_ATTACHMENTS} 个文件`);
      return;
    }
    // 设计稿 9935:55306：邮件角标为 Outlook，副标题显示发件人
    onAddFiles([stampFileMeta(new File([emailBlob(email)], name, { type: "message/rfc822" }), {
      badge: OUTLOOK_BADGE,
      subtitle: email.sender,
      origin,
    })]);
  };

  const visibleEmails = OUTLOOK_EMAILS.filter(email =>
    emailSearchText(email).toLowerCase().includes(query.trim().toLowerCase()),
  );

  // 云盘列表：OneDrive / SharePoint 走层级 mock 数据，产物走真实 artifacts（无文件夹），项目资料沿用真实文件。
  const cloudTreeRoot = source === "OneDrive" ? ONE_DRIVE_ROOT : SHAREPOINT_ROOT;
  const artifactEntries: CloudEntry[] = (projectFiles?.artifacts ?? []).length
    ? (projectFiles?.artifacts ?? []).map(file => ({
        id: file.id,
        name: file.name,
        kind: "file" as const,
        icon: cloudIcon(file.name),
        // 设计稿产物元信息：任务名称 · 大小 · 时间；任务名称取自 artifact.owner
        meta: `${file.owner} · ${formatFileSize(file.blob ? file.blob.size : file.size)} · ${stampOf(file.createdAt)}`,
        modified: file.createdAt,
        real: file.blob
          ? { name: file.name, kind: "document" as const, extension: file.name.split(".").pop()?.toLowerCase() ?? "", blob: file.blob }
          : { name: file.name, kind: "document" as const, extension: file.name.split(".").pop()?.toLowerCase() ?? "", url: file.url, size: file.size },
      }))
    : DEMO_ARTIFACT_ENTRIES;
  const projectEntries: CloudEntry[] = availableFiles.map((file, index) => ({
    id: file.name,
    name: file.name,
    kind: "file",
    icon: file.kind === "image" ? "" : cloudIcon(file.name),
    meta: `${file.extension.toUpperCase()} · ${formatFileSize(file.blob ? file.blob.size : file.size)}`,
    modified: projectRecords?.[index]?.createdAt,
    real: file,
  }));

  // 当前层级条目：树形来源根据 cloudTrail 下钻，产物/项目资料为平铺列表
  const cloudLevelEntries: CloudEntry[] = isCloudTree
    ? cloudTrail.length ? (cloudTrail[cloudTrail.length - 1].children ?? []) : cloudTreeRoot
    : source === "产物" ? artifactEntries : projectEntries;
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const cloudVisibleEntries = sortDisabledLast(cloudLevelEntries.filter(entry => {
    if (normalizedQuery && !entry.name.toLocaleLowerCase().includes(normalizedQuery)) return false;
    // 文件夹/站点始终是路径入口，不受文件类型与更新时间筛选影响，否则用户会找不到路。
    if (entry.kind !== "file") return true;
    return matchFileFilters(
      { name: entry.name, format: cloudEntryFormat(entry), modified: cloudEntryModified(entry) },
      { formats: useFullFilter ? formats : [], timeFilter: useFullFilter ? timeFilter : null },
    );
  }));
  // 占位文字写明搜索范围：站点层搜站点名，站点内限定当前站点，其余页签搜文件名
  const searchPlaceholder = source === "SharePoint"
    ? (currentSite ? `搜索 ${currentSite.name} 中的文件` : "搜索站点")
    : source === "Outlook" ? "搜索邮件" : "搜索文件名";

  // viaCheckbox=true 表示点在复选框上：所有条目都切换附件勾选；否则文件夹/站点下钻、文件加入附件。
  const openCloudEntry = (entry: CloudEntry, viaCheckbox = false) => {
    if (entry.disabled) return;
    const origin = entryOrigin(entry);
    if (entry.kind !== "file") {
      if (viaCheckbox) {
        // 站点/文件夹不是真实文件：用虚拟 File 加入输入框，图标与元信息跟随条目。
        const name = `${source}-${entry.name}`;
        const existing = attachments.find(attachment => attachment.origin === origin);
        if (existing) {
          onRemove(existing.id);
        } else if (attachments.length >= MAX_ATTACHMENTS) {
          toast.error(`最多上传 ${MAX_ATTACHMENTS} 个文件`);
        } else {
          // 文件夹显示来源角标；站点按设计稿不加角标
          const badge = entry.kind === "folder" ? SOURCE_BADGE[source] : undefined;
          onAddFiles([makeVirtualFile(name, entry.icon, entry.meta, badge, origin)]);
        }
        return;
      }
      navigateTrail([...cloudTrail, entry]);
      return;
    }
    const item = entry.real ?? {
      name: entry.name,
      kind: "document" as const,
      extension: entry.name.split(".").pop()?.toLowerCase() ?? "",
      blob: examplePdf(entry.name),
    };
    void selectFile(item, origin);
  };

  return (
    <PopoverContent
      ref={setPanelEl}
      side="top"
      align="start"
      sideOffset={8}
      collisionPadding={8}
      aria-label="选择工作内容"
      onOpenAutoFocus={event => {
        event.preventDefault();
        searchRef.current?.focus();
      }}
      onCloseAutoFocus={event => {
        event.preventDefault();
        onClose();
      }}
      onInteractOutside={event => {
        // 筛选菜单、日期浮层/抽屉都挂在 body 上；点它们不算点出附件面板
        if (event.target instanceof Element && event.target.closest("[data-operation-menu], .library-calendar-popover, .library-date-layer")) event.preventDefault();
      }}
      onEscapeKeyDown={event => {
        // 筛选菜单/日期层开着时，Esc 先关它们，不能连整个附件面板一起关掉。
        // FileFilterButton 自己有 document 级 Esc 监听会关菜单，这里只负责拦住 Popover 的关闭。
        if (filterOpen) {
          event.preventDefault();
          setFilterOpen(false);
          filterRef.current?.focus();
        } else if (fullFilterOpen) {
          event.preventDefault();
        }
      }}
      className="z-[350] flex h-[420px] max-h-[var(--radix-popover-content-available-height)] w-[var(--radix-popover-trigger-width)] flex-col gap-[16px] overflow-hidden rounded-[20px] border border-[#f2f2f2] bg-white pl-[16px] pr-0 pt-0 pb-[12px] shadow-[0_0_12px_rgba(0,0,0,0.08)]"
    >
      <div role="tablist" aria-label="文件来源" className="flex h-[48px] shrink-0 gap-[24px] overflow-x-auto border-b border-[#e6e6e6] pr-[16px]">
        {(["Outlook", "OneDrive", "SharePoint", "项目资料", "产物"] as const).filter(tab => tab !== "项目资料" || hasProject).map(tab => (
          <button
            key={tab}
            id={`${id}-${tab}`}
            type="button"
            role="tab"
            aria-selected={source === tab}
            aria-controls={`${id}-files`}
            onClick={() => changeTab(tab)}
            className={`h-[48px] shrink-0 cursor-pointer border-b-2 bg-transparent p-0 text-[16px] leading-[24px] tracking-[0.016px] ${source === tab ? "border-[#1e63f5] font-medium text-[#1e63f5]" : "border-transparent font-normal text-[rgba(0,0,0,0.6)]"}`}
          >
            {tab}
          </button>
        ))}
      </div>
      <div className="flex shrink-0 items-center gap-[12px] pr-[16px]">
        <label className="flex h-[32px] min-w-0 flex-1 items-center gap-[8px] rounded-[8px] bg-[#f7f7f7] pl-[8px] pr-[16px]">
          <img src={queryFocused ? "/assets/search-dialog-search.svg" : "/assets/search-dialog-search-default.svg"} alt="" className="size-[16px] shrink-0" />
          <input
            ref={searchRef}
            aria-label={searchPlaceholder}
            value={query}
            onChange={event => setQuery(event.target.value)}
            onFocus={() => setQueryFocused(true)}
            onBlur={() => setQueryFocused(false)}
            placeholder={searchPlaceholder}
            className="min-w-0 flex-1 bg-transparent text-[14px] font-normal leading-[22px] tracking-[0.014px] text-[rgba(0,0,0,0.88)] outline-none placeholder:text-[rgba(0,0,0,0.26)]"
          />
          {query && (
            <button type="button" aria-label="清空搜索" onMouseDown={event => event.preventDefault()} onClick={() => setQuery("")} className="flex size-[16px] shrink-0 cursor-pointer items-center justify-center">
              <img src="/assets/f802d.svg" alt="" className="size-[12px]" />
            </button>
          )}
        </label>
        {/* SharePoint 站点列表页（根级）没有筛选、图标直接隐藏；进入站点后才出现。
            除 Outlook（沿用邮件类型单选）以外，其他页签统一用完整筛选：格式（文档/表格/文件夹/其他）
            + 更新时间（近 7 天 / 近 30 天 / 自定义），与资料库/项目筛选同一套组件与交互。 */}
        {!(source === "SharePoint" && cloudTrail.length === 0) && (useFullFilter ? (
          <FileFilterButton
            ariaLabel="筛选"
            selectedFormats={formats}
            onFormatsChange={setFormats}
            formatOptions={CLOUD_FORMATS}
            timeFilter={timeFilter}
            onTimeFilterChange={setTimeFilter}
            onOpenChange={setFullFilterOpen}
          />
        ) : (
          <>
            <button ref={filterRef} type="button" aria-label={`筛选文件：${FILTERS.find(filter => filter.value === kind)?.label}`} aria-haspopup="menu" aria-expanded={filterOpen} onClick={() => setFilterOpen(open => !open)} className={`flex size-[32px] shrink-0 cursor-pointer items-center justify-center rounded-[4px] ${filterOpen || kind !== "all" ? "bg-[#ebf4ff]" : "hover:bg-[#f2f2f2]"}`}>
              <img src="/assets/6d02b.svg" alt="" />
            </button>
            {filterOpen && (
              <OperationMenu ref={filterMenuRef} anchor={filterRef.current} gap={4} role="menu" aria-label="文件类型" onKeyDown={event => {
                if (event.key === "Escape") {
                  event.stopPropagation();
                  setFilterOpen(false);
                  filterRef.current?.focus();
                }
              }} className="w-[168px] rounded-[12px] border border-[#f2f2f2] bg-white p-[8px] shadow-[0_0_12px_rgba(0,0,0,0.08)]">
                {FILTERS.map(filter => (
                  <button key={filter.value} type="button" role="menuitemradio" aria-checked={kind === filter.value} onClick={() => {
                    setKind(filter.value);
                    setFilterOpen(false);
                  }} className={`flex w-full cursor-pointer rounded-[8px] px-[8px] py-[8px] text-left text-[14px] font-normal hover:bg-[#f2f2f2] ${kind === filter.value ? "text-[#1e63f5]" : ""}`}>{filter.label}</button>
                ))}
                {/* Figma 9773:69397：非「全部类型」时显示重置入口 */}
                {kind !== "all" && <FilterResetRow onReset={() => setKind("all")} />}
              </OperationMenu>
            )}
          </>
        ))}
      </div>
      {/* 面板本体左内边距 16、右侧留给滚动条（pr-0），因此列表内容右侧再补 10px：
          16px 减去 .outlook-scroll 的 6px 滚动条宽度，让行的底色左右同为 16px，滚动条仍贴最右。 */}
      <div id={`${id}-files`} role="tabpanel" aria-labelledby={`${id}-${source}`} className="outlook-scroll min-h-0 flex-1 overflow-y-auto pr-[calc(16px-6px)] [scrollbar-gutter:stable]">
        {source === "Outlook" ? (
          <OutlookEmailList
            emails={visibleEmails}
            isSelected={email => attachments.some(attachment => attachment.origin === `Outlook:${email.id}`)}
            onToggle={selectEmail}
            narrow={panelNarrow}
          />
        ) : (
        <div className="flex flex-col gap-[16px]">
          {/* 面包屑（Figma 9622:48275 / 9661:46705）：进入文件夹/站点后出现，12px，最后一级 0.88、其余 0.38、分隔符 0.26 */}
          {isCloudTree && cloudTrail.length > 0 && (
            <nav aria-label="当前位置" className="flex flex-wrap items-center gap-[8px] text-[12px] leading-[20px] tracking-[0.012px]">
              <button type="button" onClick={() => navigateTrail([])} className="cursor-pointer text-[12px] font-normal leading-[20px] text-[rgba(0,0,0,0.38)] hover:text-[rgba(0,0,0,0.88)]">{source}</button>
              {cloudTrail.map((crumb, index) => (
                <span key={crumb.id} className="flex items-center gap-[8px]">
                  <span aria-hidden className="text-[12px] font-normal leading-[20px] text-[rgba(0,0,0,0.26)]">/</span>
                  <button type="button" onClick={() => navigateTrail(cloudTrail.slice(0, index + 1))} className={`cursor-pointer text-[12px] font-normal leading-[20px] ${index === cloudTrail.length - 1 ? "text-[rgba(0,0,0,0.88)]" : "text-[rgba(0,0,0,0.38)] hover:text-[rgba(0,0,0,0.88)]"}`}>{crumb.name}</button>
                </span>
              ))}
            </nav>
          )}
          {/* 纵向列表行（Figma 9622:48234 等）：checkbox16 + 图标32 + [名称14/0.88、元信息12/0.6]，行 gap4、hover #F7F7F7、选中底 #F2F2F2 */}
          <div className="flex flex-col gap-[4px]">
            {cloudVisibleEntries.map(entry => {
              const isFile = entry.kind === "file";
              const item = entry.real;
              // 文件夹/站点以虚拟附件名进输入框；文件用真实附件名。选中态统一由 attachments 驱动
              const name = isFile && item ? `${source}-${item.name}` : `${source}-${entry.name}`;
              const selected = attachments.some(attachment => attachment.origin === entryOrigin(entry));
              const pending = isFile && pendingName === name;
              return (
                <div
                  key={entry.id}
                  role="button"
                  tabIndex={entry.disabled ? -1 : 0}
                  aria-label={entry.name}
                  aria-pressed={isFile ? selected : undefined}
                  aria-disabled={entry.disabled || undefined}
                  aria-busy={pending || undefined}
                  title={entry.name}
                  onClick={() => openCloudEntry(entry)}
                  onKeyDown={event => {
                    if (entry.disabled) return;
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      openCloudEntry(entry);
                    }
                  }}
                  className={`flex w-full shrink-0 items-center gap-[8px] rounded-[8px] px-[8px] py-[8px] text-left font-normal outline-none focus-visible:ring-1 focus-visible:ring-[#1c61f1] ${entry.disabled ? "cursor-not-allowed" : "cursor-pointer"} ${selected ? "bg-[#f2f2f2]" : "hover:bg-[#f7f7f7]"}`}
                >
                  {entry.disabled ? (
                    <img src={CLOUD_UNCHECKED} alt="" className="size-[16px] shrink-0 opacity-40" />
                  ) : (
                    <button
                      type="button"
                      aria-label={selected ? `取消选择 ${entry.name}` : `选择 ${entry.name}`}
                      aria-pressed={selected}
                      onClick={event => { event.stopPropagation(); openCloudEntry(entry, true); }}
                      className="flex size-[16px] shrink-0 cursor-pointer items-center justify-center p-0"
                    >
                      <img src={selected ? CLOUD_CHECKED : CLOUD_UNCHECKED} alt="" />
                    </button>
                  )}
                  <span className="flex size-[32px] shrink-0 items-center justify-center">
                    {entry.kind === "folder" || entry.kind === "site" ? (
                      <img src={entry.icon} alt="" className={entry.bigFolderIcon ? "size-[40px] max-w-none shrink-0" : "size-[32px] shrink-0 object-contain"} />
                    ) : item?.kind === "image" ? (
                      <PickerImage file={item} />
                    ) : (
                      <img src={entry.icon} alt="" className={`size-[32px] shrink-0 object-contain ${entry.disabled ? "opacity-30" : ""}`} />
                    )}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className={`truncate text-[14px] leading-[22px] tracking-[0.014px] ${entry.disabled ? "text-[rgba(0,0,0,0.26)]" : "text-[rgba(0,0,0,0.88)]"}`}>{entry.name}</span>
                    <span className={`truncate text-[12px] leading-[20px] tracking-[0.012px] ${entry.disabled ? "text-[rgba(0,0,0,0.26)]" : "text-[rgba(0,0,0,0.6)]"}`}>{pending ? "读取中" : entry.meta}</span>
                  </span>
                </div>
              );
            })}
            {!cloudVisibleEntries.length && <p className="py-[40px] text-center text-[14px] text-[rgba(0,0,0,0.38)]">没有匹配的文件</p>}
          </div>
        </div>
        )}
      </div>
      <span className="sr-only">当前使用本地示例文件，选中文件会添加到输入框附件。</span>
    </PopoverContent>
  );
}
