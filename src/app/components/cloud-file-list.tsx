// 共享云盘树：OneDrive / SharePoint 的示例数据、面包屑下钻与行样式。
// 输入框附件面板（attachment-picker）与「选择文件」弹窗（select-file-dialog）共用，
// 保证两处选择时的内容、层级与交互响应规则一致（Figma 9622:48234 / 48275 / 48350 / 9661:46705）。
import { useEffect, useState } from "react";
import { getAttachmentIcon } from "./attachment-tray";

export type CloudFileKind = "all" | "image" | "document" | "email";

// 与输入框附件面板一致的筛选选项（Figma 云盘选择面板）
export const CLOUD_KIND_FILTERS: { value: CloudFileKind; label: string }[] = [
  { value: "all", label: "全部类型" },
  { value: "image", label: "图片" },
  { value: "document", label: "文档" },
  { value: "email", label: "邮件文件" },
];

export type CloudEntry = {
  id: string;
  name: string;
  kind: "folder" | "site" | "file";
  icon: string;
  meta: string;
  disabled?: boolean;
  bigFolderIcon?: boolean;
  children?: CloudEntry[];
  // 弹窗提交到「来源」时使用的字节数（输入框不使用）
  size?: number;
};

export const CLOUD_FOLDER_ICON = "/assets/cloud-folder.png";
export const CLOUD_SITE_ICON = "/assets/cloud-site.svg";
const CLOUD_UNCHECKED = "/assets/checkbox-unchecked.svg";
const CLOUD_CHECKED = "/assets/checkbox-checked.svg";
export const DEMO_STAMP = "2017.8.21 17:49";
export const DEMO_SIZE_STAMP = `36 MB · ${DEMO_STAMP}`;
const SIZE_36MB = 36 * 1024 * 1024;

export function cloudIcon(name: string) {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "pdf") return "/assets/attachment-pdf.svg";
  if (["doc", "docx"].includes(ext)) return "/assets/attachment-word.svg";
  return getAttachmentIcon(ext);
}

export function cloudEntryKind(entry: CloudEntry): Exclude<CloudFileKind, "all"> {
  const ext = entry.name.split(".").pop()?.toLowerCase() ?? "";
  if (["jpg", "jpeg", "png", "gif", "webp"].includes(ext)) return "image";
  if (["eml", "msg"].includes(ext)) return "email";
  return "document";
}

// 列表排序规则：禁用（不可选）条目稳定排到最后，其余保持原顺序
export function sortDisabledLast<T extends { disabled?: boolean }>(entries: T[]): T[] {
  return entries
    .map((entry, index) => ({ entry, index }))
    .sort((a, b) => Number(Boolean(a.entry.disabled)) - Number(Boolean(b.entry.disabled)) || a.index - b.index)
    .map(({ entry }) => entry);
}

export function demoFile(id: string, name: string, icon: string, meta = DEMO_SIZE_STAMP, disabled = false, size = SIZE_36MB): CloudEntry {
  return { id, name, kind: "file", icon, meta, disabled, size };
}

// ---- 批量模拟数据：扩展名均为受支持类型，图标由 cloudIcon 按扩展名生成（与输入框共用同一套多格式图标）----
// 格式覆盖：xls/xlsx/csv（Excel）、ppt/pptx（PPT）、pdf、doc/docx（Word）、eml/msg（邮件）、txt/md/html（其它），
// 图标在组件内均已有对应样式，选中前后保持一致。第三种标记 = 是否禁用（禁用行会由列表排到最后）。
type FileSeed = [name: string, disabled?: boolean];
const FILE_SEEDS: FileSeed[] = [
  ["2026年度预算规划.xlsx"],
  ["产品发布计划书.pptx"],
  ["合同签订规范.pdf"],
  ["项目需求说明书.docx"],
  ["客户名单与跟进记录.csv"],
  ["品牌升级方案.ppt"],
  ["用户调研报告.pdf"],
  ["会议纪要_1108.doc"],
  ["项目排期甘特图.xls"],
  ["新人入职培训.pptx"],
  ["财务报表_10月.pdf"],
  ["技术方案文档.docx"],
  ["库存盘点明细表.csv"],
  ["季度业务复盘.pptx"],
  ["产品设计规范.pdf"],
  ["商务往来邮件.eml"],
  ["部门费用报销明细.xlsx"],
  ["客户提案通用模板.pptx"],
  ["员工手册.pdf"],
  ["岗位职责说明.docx"],
  ["员工业绩考核表.xlsx"],
  ["年度战略发布会.ppt"],
  ["市场调研白皮书.pdf"],
  ["项目沟通记录.msg"],
  ["需求变更清单.txt"],
  ["接口说明文档.md"],
  ["常见问题汇总.html"],
  ["归档_历史版本.PPTX", true],
  ["归档_只读副本.XLSX", true],
];
const DEMO_SIZES = ["36 MB", "1.2 MB", "8.4 MB", "512 KB", "24.6 MB", "3.8 MB", "128 KB", "76 MB", "15.3 MB"];
const DEMO_TIMES = ["2017.8.21 17:49", "2026.11.12 09:30", "2026.10.28 14:05", "2025.12.31 23:59", "2026.9.6 11:22", "2026.8.15 16:48"];
const DEMO_TASKS = ["品牌升级项目", "Q4销售分析", "官网改版", "数据中台建设", "年度招聘计划", "客户满意度调研", "产品迭代V3", "财务审计"];
const demoMeta = (i: number) => `${DEMO_SIZES[i % DEMO_SIZES.length]} · ${DEMO_TIMES[i % DEMO_TIMES.length]}`;
// 不可选条目稳定排到最后（排序规则在各列表渲染处统一执行，这里保持数据源顺序）
export function makeDemoFiles(prefix: string, count: number, start = 0): CloudEntry[] {
  return FILE_SEEDS.slice(start, start + count).map(([name, disabled], i) =>
    demoFile(`${prefix}-${start + i}`, name, cloudIcon(name), demoMeta(start + i), disabled ?? false));
}
export function makeDemoArtifacts(prefix: string, count: number, start = 0): CloudEntry[] {
  return FILE_SEEDS.slice(start, start + count).map(([name, disabled], i) =>
    demoFile(`${prefix}-${start + i}`, name, cloudIcon(name), `${DEMO_TASKS[(start + i) % DEMO_TASKS.length]} · ${demoMeta(start + i)}`, disabled ?? false));
}

// OneDrive：根级 = 文件夹 + 文件 + 禁用文件；文件夹内 = 子文件夹 + 文件 + 禁用文件（对齐 48234 / 48275）
export const ONE_DRIVE_ROOT: CloudEntry[] = [
  { id: "od-folder", name: "文件夹名称", kind: "folder", icon: CLOUD_FOLDER_ICON, meta: DEMO_STAMP, bigFolderIcon: true, children: [
    { id: "od-sub-folder", name: "设计系统", kind: "folder", icon: CLOUD_FOLDER_ICON, meta: DEMO_STAMP, bigFolderIcon: true, children: [
      demoFile("od-sub-1", "文件名称.PPTX", "/assets/select-file-ppt.svg"),
      demoFile("od-sub-2", "文件名称.XLSX", "/assets/select-file-excel.svg"),
    ] },
    demoFile("od-1", "文件的名称表示.XLSX", "/assets/select-file-excel.svg"),
    demoFile("od-2", "文件名称.PPTX", "/assets/select-file-ppt.svg"),
    demoFile("od-3", "文件名称.PPTX", "/assets/select-file-other.svg", DEMO_SIZE_STAMP, true),
  ] },
  demoFile("od-4", "文件的名称表示.XLSX", "/assets/select-file-excel.svg"),
  demoFile("od-5", "文件名称.PPTX", "/assets/select-file-ppt.svg"),
  demoFile("od-6", "文件名称.PPTX", "/assets/select-file-other.svg", DEMO_SIZE_STAMP, true),
  // 追加模拟数据（根级凑够 20~30 条）
  ...makeDemoFiles("od-root", 21),
  // 不可选归档项：由列表排序规则自动排到最后
  demoFile("od-disabled-1", "归档_历史版本.PPTX", "/assets/select-file-other.svg", DEMO_SIZE_STAMP, true),
  demoFile("od-disabled-2", "归档_只读副本.XLSX", "/assets/select-file-other.svg", DEMO_SIZE_STAMP, true),
];

// SharePoint：根级 = 站点列表；站点内 = 文件夹 + 文件 + 禁用文件（对齐 48350 / 9661:46705）
export const SHAREPOINT_ROOT: CloudEntry[] = [
  { id: "sp-site-1", name: "站点名称站点名称站点名称站点名称站点名称", kind: "site", icon: CLOUD_SITE_ICON, meta: "www.站点地址", children: [
    { id: "sp-folder", name: "文件夹名称", kind: "folder", icon: CLOUD_FOLDER_ICON, meta: DEMO_STAMP, bigFolderIcon: true, children: [
      demoFile("sp-sub-1", "文件的名称表示.XLSX", "/assets/select-file-excel.svg"),
      demoFile("sp-sub-2", "文件名称.PPTX", "/assets/select-file-ppt.svg"),
    ] },
    demoFile("sp-1", "文件的名称表示.XLSX", "/assets/select-file-excel.svg"),
    demoFile("sp-2", "文件名称.PPTX", "/assets/select-file-ppt.svg"),
    demoFile("sp-3", "文件名称.PPTX", "/assets/select-file-other.svg", DEMO_SIZE_STAMP, true),
  ] },
  { id: "sp-site-2", name: "站点名称", kind: "site", icon: CLOUD_SITE_ICON, meta: "站点地址", children: [
    demoFile("sp2-1", "文件的名称表示.XLSX", "/assets/select-file-excel.svg"),
    demoFile("sp2-2", "文件名称.PPTX", "/assets/select-file-ppt.svg"),
  ] },
  // 追加模拟站点（根级凑够 20~30 个），每个站点带一批子条目
  ...Array.from({ length: 20 }, (_, index): CloudEntry => ({
    id: `sp-site-more-${index}`,
    name: ["市场部协作站点", "产品研发站点", "人力资源站点", "财务共享站点", "销售运营站点"][index % 5] + (index >= 5 ? ` ${Math.floor(index / 5) + 1}` : ""),
    kind: "site" as const,
    icon: CLOUD_SITE_ICON,
    meta: `www.sharepoint-${index + 1}.com`,
    children: [
      { id: `spm-folder-${index}`, name: "项目文档", kind: "folder" as const, icon: CLOUD_FOLDER_ICON, meta: DEMO_STAMP, bigFolderIcon: true, children: makeDemoFiles(`spm-f${index}`, 6, 0) },
      ...makeDemoFiles(`spm-${index}`, 20, 0),
    ],
  })),
];

// 递归收集条目下的所有文件（文件夹/站点选中时使用）
export function collectCloudFiles(entry: CloudEntry): CloudEntry[] {
  if (entry.kind === "file") return [entry];
  return (entry.children ?? []).flatMap(collectCloudFiles);
}

/* 云盘树列表：面包屑 + 可选中行。文件夹/站点下钻由组件内部维护层级；
   选中态由外部通过 isSelected 注入，点击复选框/整行分别回调 onToggle / onOpenFile。
   行样式与 Figma 9622 系列一致：checkbox16 + 图标32（文件夹大图标40）+ 名称14/0.88 + 元信息12/0.6，
   行 gap4、hover #F7F7F7、选中底 #F2F2F2、禁用文字 0.26。 */
export function CloudFileList({
  source,
  query,
  kind = "all",
  isSelected,
  onToggle,
  onOpenFile,
  pendingName,
  className = "",
}: {
  source: "OneDrive" | "SharePoint";
  query: string;
  kind?: CloudFileKind;
  isSelected: (entry: CloudEntry) => boolean;
  onToggle: (entry: CloudEntry) => void;
  onOpenFile: (entry: CloudEntry) => void;
  pendingName?: string | null;
  className?: string;
}) {
  const [trail, setTrail] = useState<CloudEntry[]>([]);
  // 切换来源时回到根级，避免停留在上一来源的文件夹内
  useEffect(() => setTrail([]), [source]);

  const root = source === "OneDrive" ? ONE_DRIVE_ROOT : SHAREPOINT_ROOT;
  const level = trail.length ? trail[trail.length - 1].children ?? [] : root;
  const q = query.trim().toLowerCase();
  const visible = sortDisabledLast(level.filter(entry => {
    const matchesQuery = entry.name.toLowerCase().includes(q);
    const matchesKind = kind === "all" || entry.kind !== "file" || cloudEntryKind(entry) === kind;
    return matchesQuery && matchesKind;
  }));

  const open = (entry: CloudEntry) => {
    if (entry.disabled) return;
    if (entry.kind !== "file") {
      setTrail(current => [...current, entry]);
      return;
    }
    onOpenFile(entry);
  };

  return (
    <div className={`flex flex-col gap-[16px] ${className}`}>
      {trail.length > 0 && (
        <nav aria-label="当前位置" className="flex flex-wrap items-center gap-[8px] text-[12px] leading-[20px] tracking-[0.012px]">
          <button type="button" onClick={() => setTrail([])} className="cursor-pointer text-[12px] font-normal leading-[20px] text-[rgba(0,0,0,0.38)] hover:text-[rgba(0,0,0,0.88)]">{source}</button>
          {trail.map((crumb, index) => (
            <span key={crumb.id} className="flex items-center gap-[8px]">
              <span aria-hidden className="text-[12px] font-normal leading-[20px] text-[rgba(0,0,0,0.26)]">/</span>
              <button type="button" onClick={() => setTrail(current => current.slice(0, index + 1))} className={`cursor-pointer text-[12px] font-normal leading-[20px] ${index === trail.length - 1 ? "text-[rgba(0,0,0,0.88)]" : "text-[rgba(0,0,0,0.38)] hover:text-[rgba(0,0,0,0.88)]"}`}>{crumb.name}</button>
            </span>
          ))}
        </nav>
      )}
      <div className="flex flex-col gap-[4px]">
        {visible.map(entry => {
          const selected = isSelected(entry);
          const pending = pendingName === entry.name;
          return (
            <div
              key={entry.id}
              role="button"
              tabIndex={entry.disabled ? -1 : 0}
              aria-label={entry.name}
              aria-pressed={entry.kind === "file" ? selected : undefined}
              aria-disabled={entry.disabled || undefined}
              aria-busy={pending || undefined}
              title={entry.name}
              onClick={() => open(entry)}
              onKeyDown={event => {
                if (entry.disabled) return;
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  open(entry);
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
                  onClick={event => { event.stopPropagation(); onToggle(entry); }}
                  className="flex size-[16px] shrink-0 cursor-pointer items-center justify-center p-0"
                >
                  <img src={selected ? CLOUD_CHECKED : CLOUD_UNCHECKED} alt="" />
                </button>
              )}
              <span className="flex size-[32px] shrink-0 items-center justify-center">
                <img src={entry.icon} alt="" className={entry.bigFolderIcon ? "size-[40px] max-w-none shrink-0" : "size-[32px] shrink-0 object-contain"} />
              </span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className={`truncate text-[14px] leading-[22px] tracking-[0.014px] ${entry.disabled ? "text-[rgba(0,0,0,0.26)]" : "text-[rgba(0,0,0,0.88)]"}`}>{entry.name}</span>
                <span className={`truncate text-[12px] leading-[20px] tracking-[0.012px] ${entry.disabled ? "text-[rgba(0,0,0,0.26)]" : "text-[rgba(0,0,0,0.6)]"}`}>{pending ? "读取中" : entry.meta}</span>
              </span>
            </div>
          );
        })}
        {!visible.length && <p className="py-[40px] text-center text-[14px] text-[rgba(0,0,0,0.38)]">没有匹配的文件</p>}
      </div>
    </div>
  );
}
