import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { MAX_ATTACHMENTS, formatFileSize, getAttachmentIcon, makeVirtualFile } from "./attachment-tray";
import type { ChatAttachment } from "./attachment-tray";
import { OperationMenu } from "./operation-menu";
import { PopoverContent } from "./ui/popover";
import type { ProjectFiles } from "./project-files";

export type AttachmentSource = "Outlook" | "OneDrive" | "SharePoint" | "项目资料" | "产物";
type FileKind = "all" | "image" | "document" | "email";

// Figma 9650:46400 / 1132:19398「Outlook 选择面板」邮件列表示例数据。
// 行形态由面板宽度响应式决定（< 720px 无头像、正文换行），不在数据里写死。
type ExampleEmail = { id: string; sender: string; avatar: string; avatarBg: string; avatarColor: string; title: string; body: string; time: string };

const OUTLOOK_EMAILS: ExampleEmail[] = [
  { id: "zhang-wei-q4", sender: "张伟", avatar: "张", avatarBg: "#e6fffa", avatarColor: "#12c2c2", title: "Q4 销售数据汇总及分析报告", body: "各位好，Q4 销售数据已经整理完毕，整体同比增长 12.5%，详细数据请见附件，有问题随时沟通。", time: "2026年2月5日  22:23" },
  { id: "li-na-review", sender: "李娜", avatar: "李", avatarBg: "#f0fdf4", avatarColor: "#22c45e", title: "关于下周产品评审会的安排", body: "评审会定于下周三下午 2 点在 3 号会议室举行，请各项目组提前准备好演示材料。", time: "2026年2月5日  18:47" },
  { id: "wang-qiang-contract", sender: "王强", avatar: "王", avatarBg: "#fff0f0", avatarColor: "#f1222e", title: "合同审批流程已提交，麻烦跟进", body: "世纪互联合作协议已进入法务审批环节，预计本周五完成，麻烦王总审阅。", time: "2026年2月5日  15:12" },
  { id: "chen-xiaomei-budget", sender: "陈晓梅", avatar: "陈", avatarBg: "#fffcf2", avatarColor: "#d9b40c", title: "2026 年预算调整方案征求意见", body: "按财务部要求，各部门需在本周五前反馈预算调整意见，逾期视为无异议。", time: "2026年2月4日  17:30" },
  { id: "liu-yang-weekly", sender: "刘洋", avatar: "刘", avatarBg: "#e6fffa", avatarColor: "#12c2c2", title: "智能助手项目周报（第 6 周）", body: "本周完成归档页面开发与可撤销 toast 联调，下周进行整体回归测试。", time: "2026年2月4日  11:20" },
  { id: "zhao-lei-visit", sender: "赵磊", avatar: "赵", avatarBg: "#e6fffa", avatarColor: "#12c2c2", title: "客户拜访安排确认", body: "已与世纪互联确认拜访时间为下周四上午，会议邀请已发出，请查收日历。", time: "2026年2月3日  16:05" },
  { id: "zhou-jie-training", sender: "周洁", avatar: "周", avatarBg: "#e6fffa", avatarColor: "#12c2c2", title: "新员工入职培训材料更新", body: "附件为最新版培训材料，请各部门负责人转发给近期入职的同事。", time: "2026年2月2日  09:41" },
  { id: "wu-min-server", sender: "吴敏", avatar: "吴", avatarBg: "#e6fffa", avatarColor: "#12c2c2", title: "服务器迁移窗口通知", body: "本周六 22:00-24:00 进行服务器迁移，期间服务可能短暂中断，请提前做好准备。", time: "2026年1月30日  19:08" },
  { id: "zheng-hao-design", sender: "郑浩", avatar: "郑", avatarBg: "#e6fffa", avatarColor: "#12c2c2", title: "设计评审反馈汇总", body: "针对 V2.0 设计稿的评审意见已汇总到文档，详见附件，预计下周三前完成修改。", time: "2026年1月29日  14:26" },
  { id: "long-title-supply-chain", sender: "孙晓琳", avatar: "孙", avatarBg: "#eef2ff", avatarColor: "#4f46e5", title: "关于 2026 年第四季度全球供应链优化方案及区域仓储履约效率提升专项评审会议的通知与安排", body: "各位同事好，为进一步提升四季度全球供应链的响应速度与区域仓储的履约效率，公司决定召开专项评审会议，请各区域负责人提前准备相关数据与材料，会议纪要及议程详见附件，如有时间冲突请尽早反馈。", time: "2026年2月6日  09:15" },
  { id: "long-title-design-walkthrough", sender: "何俊杰", avatar: "何", avatarBg: "#fdf2f8", avatarColor: "#db2777", title: "Re: 蓝云 AI 助手 V2.0 版本设计走查、交互细节确认与下周灰度发布计划安排（含附件，请查收）", body: "大家好，附件是蓝云 AI 助手 V2.0 版本的最新设计走查记录，包含交互细节的确认结论与下周灰度发布的详细计划，请产品、设计、研发三方负责人于本周五前完成审阅并回复意见，谢谢配合。", time: "2026年2月6日  10:32" },
  { id: "long-title-schedule-change", sender: "林思远", avatar: "林", avatarBg: "#fff7ed", avatarColor: "#ea580c", title: "【重要】关于调整本周五产品迭代评审时间、参会人员名单及会议材料提交截止日期的补充说明", body: "因部分同事时间冲突，原定于本周五下午的产品迭代评审会调整至周六上午十点，参会人员名单与材料提交截止日期同步顺延，请相关人员留意最新日历邀请并按更新后的时间准备。", time: "2026年2月6日  11:48" },
];

const emailFileName = (email: ExampleEmail) => `Outlook-${email.sender}-${email.id}.eml`;

const emailBlob = (email: ExampleEmail) => new Blob(
  [`From: ${email.sender} <demo@example.invalid>\r\nTo: team@example.invalid\r\nSubject: ${email.title}\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n${email.body}\r\n`],
  { type: "message/rfc822" },
);

// Figma 9650:46400「CheckBox Icon」：未选中 = 白底深描边 + 内部 9x9 浅灰；选中态稿中未给出，按产品语言用蓝底白勾
/* Figma 9650:46400「CheckBox Icon」：16x16 容器，内为 12x12 描边方框（描边 rgba(0,0,0,0.38)） */
function EmailCheckbox({ checked }: { checked: boolean }) {
  return (
    <img
      src={checked ? "/assets/checkbox-checked.svg" : "/assets/checkbox-unchecked.svg"}
      alt=""
      width={16}
      height={16}
      className="block size-[16px] shrink-0"
      aria-hidden
    />
  );
}


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

// ============ 云盘来源列表（Figma 9622:48234 / 48275 / 48350 / 9661:46705 / 48317）============
// 列表语言统一：checkbox16 + 图标32 + 名称14/0.88 + 元信息12/0.6，行间 gap4、hover #F7F7F7、选中底 #F2F2F2；
// 文件夹/站点可进入并显示面包屑；产物无文件夹，元信息额外带「任务名称 · 」前缀。
type CloudEntry = {
  id: string;
  name: string;
  kind: "folder" | "site" | "file";
  icon: string;
  meta: string;
  disabled?: boolean;
  bigFolderIcon?: boolean;
  children?: CloudEntry[];
  real?: ExampleFile;
};

const CLOUD_FOLDER_ICON = "/assets/cloud-folder.png";
const CLOUD_SITE_ICON = "/assets/cloud-site.svg";
const CLOUD_UNCHECKED = "/assets/checkbox-unchecked.svg";
const CLOUD_CHECKED = "/assets/checkbox-checked.svg";
const DEMO_STAMP = "2017.8.21 17:49";
const DEMO_SIZE_STAMP = `36 MB · ${DEMO_STAMP}`;

function cloudIcon(name: string) {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  // 与输入框附件共用映射：选择器显示什么图标，选中后输入框就显示什么图标。
  if (ext === "pdf") return "/assets/attachment-pdf.svg";
  if (["doc", "docx"].includes(ext)) return "/assets/attachment-word.svg";
  return getAttachmentIcon(ext);
}

const demoFile = (id: string, name: string, icon: string, meta = DEMO_SIZE_STAMP, disabled = false): CloudEntry =>
  ({ id, name, kind: "file", icon, meta, disabled });

// OneDrive：根级 = 文件夹 + 文件 + 禁用文件；文件夹内 = 子文件夹 + 文件 + 禁用文件（对齐 48234 / 48275）
const ONE_DRIVE_ROOT: CloudEntry[] = [
  { id: "od-folder", name: "文件夹名称", kind: "folder", icon: CLOUD_FOLDER_ICON, meta: DEMO_STAMP, bigFolderIcon: true, children: [
    { id: "od-sub-folder", name: "设计系统", kind: "folder", icon: CLOUD_FOLDER_ICON, meta: DEMO_STAMP, bigFolderIcon: true, children: [
      demoFile("od-sub-1", "文件名称.PPTX", "/assets/select-file-ppt.svg"),
      demoFile("od-sub-2", "文件名称.XLSX", "/assets/select-file-excel.svg"),
    ] },
    demoFile("od-1", "文件的名称表示.EXE", "/assets/select-file-excel.svg"),
    demoFile("od-2", "文件名称.PPTX", "/assets/select-file-ppt.svg"),
    demoFile("od-3", "文件名称.PPTX", "/assets/select-file-other.svg", DEMO_SIZE_STAMP, true),
  ] },
  demoFile("od-4", "文件的名称表示.EXE", "/assets/select-file-excel.svg"),
  demoFile("od-5", "文件名称.PPTX", "/assets/select-file-ppt.svg"),
  demoFile("od-6", "文件名称.PPTX", "/assets/select-file-other.svg", DEMO_SIZE_STAMP, true),
];

// SharePoint：根级 = 站点列表；站点内 = 文件夹 + 文件 + 禁用文件（对齐 48350 / 9661:46705）
const SHAREPOINT_ROOT: CloudEntry[] = [
  { id: "sp-site-1", name: "站点名称站点名称站点名称站点名称站点名称", kind: "site", icon: CLOUD_SITE_ICON, meta: "www.站点地址", children: [
    { id: "sp-folder", name: "文件夹名称", kind: "folder", icon: CLOUD_FOLDER_ICON, meta: DEMO_STAMP, bigFolderIcon: true, children: [
      demoFile("sp-sub-1", "文件的名称表示.EXE", "/assets/select-file-excel.svg"),
      demoFile("sp-sub-2", "文件名称.PPTX", "/assets/select-file-ppt.svg"),
    ] },
    demoFile("sp-1", "文件的名称表示.EXE", "/assets/select-file-excel.svg"),
    demoFile("sp-2", "文件名称.PPTX", "/assets/select-file-ppt.svg"),
    demoFile("sp-3", "文件名称.PPTX", "/assets/select-file-other.svg", DEMO_SIZE_STAMP, true),
  ] },
  { id: "sp-site-2", name: "站点名称", kind: "site", icon: CLOUD_SITE_ICON, meta: "站点地址", children: [
    demoFile("sp2-1", "文件的名称表示.EXE", "/assets/select-file-excel.svg"),
    demoFile("sp2-2", "文件名称.PPTX", "/assets/select-file-ppt.svg"),
  ] },
];

const stampOf = (time: number) => {
  const date = new Date(time);
  return `${date.getFullYear()}.${date.getMonth() + 1}.${date.getDate()} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
};

// 产物无文件夹（Figma 9622:48317）：无项目上下文时用示例文件，元信息带「任务名称 · 」
const DEMO_ARTIFACT_ENTRIES: CloudEntry[] = [
  demoFile("ar-1", "名称超出的部分\"…\"表示.PDF", "/assets/attachment-pdf.svg", `任务名称 · ${DEMO_SIZE_STAMP}`),
  demoFile("ar-2", "文件的名称表示.EXE", "/assets/select-file-excel.svg", `任务名称 · ${DEMO_SIZE_STAMP}`),
  demoFile("ar-3", "文件名称.PPTX", "/assets/select-file-ppt.svg", `任务名称任务名称任务名称任务名称任务名称… · ${DEMO_SIZE_STAMP}`),
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
  const [query, setQuery] = useState("");
  const [queryFocused, setQueryFocused] = useState(false);
  const [kind, setKind] = useState<FileKind>("all");
  const [filterOpen, setFilterOpen] = useState(false);
  const [pendingName, setPendingName] = useState<string | null>(null);
  // Figma 9650:46400（宽，带头像）/ 1132:19398（窄，无头像+正文换行）：
  // 以面板实际宽度为准，< 720px 切窄版布局。
  const [panelNarrow, setPanelNarrow] = useState(false);
  const [panelEl, setPanelEl] = useState<HTMLDivElement | null>(null);
  // 云盘层级导航：面包屑路径（每级是一 folder/site），空数组 = 根级
  const [cloudTrail, setCloudTrail] = useState<CloudEntry[]>([]);
  const pendingRef = useRef(false);
  const filterRef = useRef<HTMLButtonElement>(null);
  const filterMenuRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const id = useId();
  const projectRecords = source === "项目资料" ? projectFiles?.sources.filter(file => file.status === "enabled") : source === "产物" ? projectFiles?.artifacts : undefined;
  const availableFiles: ExampleFile[] = projectRecords ? projectRecords.map(file => {
    const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
    const kind = ["jpg", "jpeg", "png"].includes(extension) ? "image" : ["eml", "msg"].includes(extension) ? "email" : "document";
    return file.blob
      ? { name: file.name, kind, extension, blob: file.blob }
      : { name: file.name, kind, extension, url: file.url, size: file.size };
  }) : EXAMPLE_FILES;
  const visibleFiles = availableFiles.filter(file =>
    (kind === "all" || file.kind === kind) && file.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()),
  );

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

  // 面板宽度 < 720px → 窄版：隐藏头像、正文换行。
  // 面板走 Portal 渲染，故用 callback ref 拿到节点后再 observe（挂载时 panelRef 仍为 null）。
  useLayoutEffect(() => {
    if (!panelEl) return;
    const update = () => setPanelNarrow(panelEl.clientWidth < 720);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(panelEl);
    return () => observer.disconnect();
  }, [panelEl]);

  const selectFile = async (item: typeof EXAMPLE_FILES[number]) => {
    const name = `${source}-${item.name}`;
    const selected = attachments.find(attachment => attachment.name === name);
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
      onAddFiles([new File([blob], name, { type: blob.type })]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "无法读取示例文件，请重试");
    } finally {
      pendingRef.current = false;
      setPendingName(null);
    }
  };

  const selectEmail = (email: ExampleEmail) => {
    const name = emailFileName(email);
    const selected = attachments.find(attachment => attachment.name === name);
    if (selected) {
      onRemove(selected.id);
      return;
    }
    if (attachments.length >= MAX_ATTACHMENTS) {
      toast.error(`最多上传 ${MAX_ATTACHMENTS} 个文件`);
      return;
    }
    onAddFiles([new File([emailBlob(email)], name, { type: "message/rfc822" })]);
  };

  const visibleEmails = OUTLOOK_EMAILS.filter(email =>
    `${email.sender} ${email.title} ${email.body}`.toLowerCase().includes(query.trim().toLowerCase()),
  );

  // 云盘列表：OneDrive / SharePoint 走层级 mock 数据，产物走真实 artifacts（无文件夹），项目资料沿用真实文件。
  const isCloudTree = source === "OneDrive" || source === "SharePoint";
  const cloudTreeRoot = source === "OneDrive" ? ONE_DRIVE_ROOT : SHAREPOINT_ROOT;
  const artifactEntries: CloudEntry[] = (projectFiles?.artifacts ?? []).length
    ? (projectFiles?.artifacts ?? []).map(file => ({
        id: file.id,
        name: file.name,
        kind: "file" as const,
        icon: cloudIcon(file.name),
        // 设计稿产物元信息：任务名称 · 大小 · 时间；任务名称取自 artifact.owner
        meta: `${file.owner} · ${formatFileSize(file.blob ? file.blob.size : file.size)} · ${stampOf(file.createdAt)}`,
        real: file.blob
          ? { name: file.name, kind: "document" as const, extension: file.name.split(".").pop()?.toLowerCase() ?? "", blob: file.blob }
          : { name: file.name, kind: "document" as const, extension: file.name.split(".").pop()?.toLowerCase() ?? "", url: file.url, size: file.size },
      }))
    : DEMO_ARTIFACT_ENTRIES;
  const projectEntries: CloudEntry[] = availableFiles.map(file => ({
    id: file.name,
    name: file.name,
    kind: "file",
    icon: file.kind === "image" ? "" : cloudIcon(file.name),
    meta: `${file.extension.toUpperCase()} · ${formatFileSize(file.blob ? file.blob.size : file.size)}`,
    real: file,
  }));

  // 当前层级条目：树形来源根据 cloudTrail 下钻，产物/项目资料为平铺列表
  const cloudLevelEntries: CloudEntry[] = isCloudTree
    ? cloudTrail.length ? (cloudTrail[cloudTrail.length - 1].children ?? []) : cloudTreeRoot
    : source === "产物" ? artifactEntries : projectEntries;
  const cloudVisibleEntries = cloudLevelEntries.filter(entry =>
    entry.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()),
  );

  // viaCheckbox=true 表示点在复选框上：所有条目都切换附件勾选；否则文件夹/站点下钻、文件加入附件。
  const openCloudEntry = (entry: CloudEntry, viaCheckbox = false) => {
    if (entry.disabled) return;
    if (entry.kind !== "file") {
      if (viaCheckbox) {
        // 站点/文件夹不是真实文件：用虚拟 File 加入输入框，图标与元信息跟随条目。
        const name = `${source}-${entry.name}`;
        const existing = attachments.find(attachment => attachment.name === name);
        if (existing) {
          onRemove(existing.id);
        } else if (attachments.length >= MAX_ATTACHMENTS) {
          toast.error(`最多上传 ${MAX_ATTACHMENTS} 个文件`);
        } else {
          onAddFiles([makeVirtualFile(name, entry.icon, entry.meta)]);
        }
        return;
      }
      setCloudTrail(trail => [...trail, entry]);
      setQuery("");
      return;
    }
    const item = entry.real ?? {
      name: entry.name,
      kind: "document" as const,
      extension: entry.name.split(".").pop()?.toLowerCase() ?? "",
      blob: examplePdf(entry.name),
    };
    void selectFile(item);
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
        if (event.target instanceof Element && event.target.closest("[data-operation-menu]")) event.preventDefault();
      }}
      onEscapeKeyDown={event => {
        if (filterOpen) {
          event.preventDefault();
          setFilterOpen(false);
          filterRef.current?.focus();
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
            onClick={() => {
              onSourceChange(tab);
              setQuery("");
              setKind("all");
              setFilterOpen(false);
              setCloudTrail([]);
            }}
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
            aria-label="搜索文件"
            value={query}
            onChange={event => setQuery(event.target.value)}
            onFocus={() => setQueryFocused(true)}
            onBlur={() => setQueryFocused(false)}
            placeholder="搜索"
            className="min-w-0 flex-1 bg-transparent text-[14px] font-normal leading-[22px] tracking-[0.014px] text-[rgba(0,0,0,0.88)] outline-none placeholder:text-[rgba(0,0,0,0.26)]"
          />
          {query && (
            <button type="button" aria-label="清空搜索" onMouseDown={event => event.preventDefault()} onClick={() => setQuery("")} className="flex size-[16px] shrink-0 cursor-pointer items-center justify-center">
              <img src="/assets/f802d.svg" alt="" className="size-[12px]" />
            </button>
          )}
        </label>
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
          </OperationMenu>
        )}
      </div>
      <div id={`${id}-files`} role="tabpanel" aria-labelledby={`${id}-${source}`} className="outlook-scroll min-h-0 flex-1 overflow-y-auto [scrollbar-gutter:stable]">
        {source === "Outlook" ? (
          /* 邮件区域布局规则：
             1. 标题 max-width 480px，超出省略号；
             2. 正文占标题外的剩余宽度（flex-1），超出省略号；
             3. 面板宽 < 720px：隐藏头像、正文换行（1132:19398 三行版）；>= 720px 带头像、标题正文同行（9650:46400）。 */
          <div className="flex flex-col gap-[16px]">
            {visibleEmails.map(email => {
              const name = emailFileName(email);
              const selected = attachments.some(attachment => attachment.name === name);
              return panelNarrow ? (
                /* 窄版（< 720px，Figma 1132:19398）：无头像；
                   第一行 cb + 发件人 + 12px 时间靠右；第二行标题（pl24、max-w480 截断）；第三行正文（pl24、独立成行、截断）。 */
                <button
                  key={email.id}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => selectEmail(email)}
                  className="flex w-full shrink-0 cursor-pointer flex-col justify-center gap-[4px] rounded-[8px] bg-transparent pr-[16px] text-left font-normal"
                >
                  <span className="flex h-[22px] items-center gap-[8px]">
                    <EmailCheckbox checked={selected} />
                    <span className="shrink-0 truncate text-[14px] font-medium leading-[22px] tracking-[0.014px] text-[rgba(0,0,0,0.88)]">{email.sender}</span>
                    <span className="min-w-0 flex-1 truncate text-right text-[12px] leading-[20px] tracking-[0.012px] text-[rgba(0,0,0,0.6)]">{email.time}</span>
                  </span>
                  <span className="flex min-w-0 pl-[24px]">
                    <span className="max-w-[480px] min-w-0 truncate text-[14px] leading-[22px] tracking-[0.014px] text-[rgba(0,0,0,0.88)]">{email.title}</span>
                  </span>
                  <span className="flex min-w-0 pl-[24px]">
                    <span className="min-w-0 flex-1 truncate text-[14px] leading-[22px] tracking-[0.014px] text-[rgba(0,0,0,0.6)]">{email.body}</span>
                  </span>
                </button>
              ) : (
                /* 宽版（>= 720px，Figma 9650:46400）：h64 = py8 + 内容48；
                   头像 48 + 文本块（第一行 发件人/时间，第二行 标题 max480 + 正文占剩余），标题正文同行且均截断。 */
                <button
                  key={email.id}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => selectEmail(email)}
                  className="flex h-[64px] w-full shrink-0 cursor-pointer items-center gap-[8px] rounded-[8px] bg-transparent py-[8px] pr-[16px] text-left font-normal"
                >
                  <EmailCheckbox checked={selected} />
                  <span className="flex size-[48px] shrink-0 items-center justify-center rounded-full text-[20px] font-normal leading-[28px]" style={{ background: email.avatarBg, color: email.avatarColor }}>{email.avatar}</span>
                  <span className="flex h-[48px] min-w-0 flex-1 flex-col gap-[4px]">
                    <span className="flex h-[22px] items-baseline">
                      <span className="min-w-0 flex-1 truncate text-[14px] font-medium leading-[22px] tracking-[0.014px] text-[rgba(0,0,0,0.88)]">{email.sender}</span>
                      <span className="shrink-0 pl-[12px] text-[14px] leading-[22px] tracking-[0.014px] text-[rgba(0,0,0,0.6)]">{email.time}</span>
                    </span>
                    <span className="flex h-[22px] min-w-0 gap-[8px]">
                      <span className="max-w-[480px] min-w-0 truncate text-[14px] leading-[22px] tracking-[0.014px] text-[rgba(0,0,0,0.88)]">{email.title}</span>
                      <span className="min-w-0 flex-1 truncate text-[14px] leading-[22px] tracking-[0.014px] text-[rgba(0,0,0,0.6)]">{email.body}</span>
                    </span>
                  </span>
                </button>
              );
            })}
            {!visibleEmails.length && <p className="py-[40px] text-center text-[14px] text-[rgba(0,0,0,0.38)]">没有匹配的邮件</p>}
          </div>
        ) : (
        <div className="flex flex-col gap-[16px]">
          {/* 面包屑（Figma 9622:48275 / 9661:46705）：进入文件夹/站点后出现，12px，最后一级 0.88、其余 0.38、分隔符 0.26 */}
          {isCloudTree && cloudTrail.length > 0 && (
            <nav aria-label="当前位置" className="flex flex-wrap items-center gap-[8px] text-[12px] leading-[20px] tracking-[0.012px]">
              <button type="button" onClick={() => setCloudTrail([])} className="cursor-pointer text-[12px] font-normal leading-[20px] text-[rgba(0,0,0,0.38)] hover:text-[rgba(0,0,0,0.88)]">{source}</button>
              {cloudTrail.map((crumb, index) => (
                <span key={crumb.id} className="flex items-center gap-[8px]">
                  <span aria-hidden className="text-[12px] font-normal leading-[20px] text-[rgba(0,0,0,0.26)]">/</span>
                  <button type="button" onClick={() => setCloudTrail(trail => trail.slice(0, index + 1))} className={`cursor-pointer text-[12px] font-normal leading-[20px] ${index === cloudTrail.length - 1 ? "text-[rgba(0,0,0,0.88)]" : "text-[rgba(0,0,0,0.38)] hover:text-[rgba(0,0,0,0.88)]"}`}>{crumb.name}</button>
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
              const selected = attachments.some(attachment => attachment.name === name);
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
