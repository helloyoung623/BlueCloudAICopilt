import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { toast } from "sonner";
import { OperationMenu } from "./operation-menu";
import { EXAMPLE_FILES } from "./attachment-picker";
import { formatFileSize, getAttachmentExtension, getAttachmentValidationError } from "./attachment-tray";
import { formatByExtension, matchFileFilters } from "./file-filter";
import { createCloudSourceFiles, DEMO_FILE_URL } from "../projects/project-files";
export { createCloudSourceFiles } from "../projects/project-files";
import type { FileFormat, FileStatus, TimeFilter, UploaderFilter } from "./file-filter";
import { SmallTip } from "./task-artifacts";

// 状态口径与筛选「状态」字段共用一套（file-filter 的 FileStatus）
export type SourceStatus = FileStatus;
export type ProjectFile = {
  id: string;
  name: string;
  owner: string;
  createdAt: number;
  status: SourceStatus;
} & ({ blob: Blob; url?: never; size?: never } | { url: string; size: number; blob?: never });
export type ProjectFiles = { sources: ProjectFile[]; artifacts: ProjectFile[] };

const statuses: SourceStatus[] = ["enabled", "enabled", "disabled", "enabled", "enabled"];
// 上传人样例：两字 / 三字姓名混用，拼音首字母（C L W S Z H）互不重复
const DEMO_OWNERS = ["陈志远", "林晚晴", "吴敏", "苏子墨", "郑浩", "韩静怡"];
// 产物「来源」列展示任务（或「项目/任务」）名称，与资料库来源列口径一致
const DEMO_ARTIFACT_SOURCES = [
  "季度经营复盘", "星辰探索计划/方案评审", "数据看板搭建", "蓝海创新项目/市场调研",
  "用户体验优化", "数据中台迁移/架构设计", "供应链协同/对账", "品牌焕新工程/视觉稿",
];

const kb = (value: number) => Math.round(value * 1024);
const mb = (value: number) => Math.round(value * 1024 * 1024);
const dayAgo = (days: number) => Date.now() - days * 86_400_000;

// 来源补充样例：[文件名, 大小, 距今天数]，与上面 5 条合计 30 条，日期分散在近 100 天内，
// 便于验证「近 7 天 / 近 30 天 / 自定义」筛选的真实响应。
const EXTRA_SOURCE_SEEDS: Array<[string, number, number]> = [
  ["需求确认纪要.docx", kb(128), 9],
  ["立项评审材料.pptx", mb(4.6), 12],
  ["预算明细表.xlsx", kb(320), 15],
  ["供应商报价单.pdf", kb(880), 18],
  ["竞品调研报告.pdf", mb(2.4), 21],
  ["用户访谈记录.docx", kb(96), 24],
  ["项目里程碑计划.xlsx", kb(210), 28],
  ["视觉规范说明.pdf", mb(3.1), 31],
  ["会议录音转写.md", kb(42), 34],
  ["风险登记表.xlsx", kb(156), 38],
  ["数据字典.csv", kb(64), 41],
  ["接口联调说明.md", kb(28), 45],
  ["测试用例清单.xlsx", kb(480), 49],
  ["上线检查清单.docx", kb(88), 52],
  ["项目周报第8期.pdf", kb(720), 56],
  ["项目周报第9期.pdf", kb(760), 60],
  ["合同扫描件.pdf", mb(1.8), 64],
  ["采购清单.xlsx", kb(132), 68],
  ["培训课件.pptx", mb(6.2), 72],
  ["现场验收单.jpeg", mb(2.1), 76],
  ["环境配置说明.md", kb(36), 80],
  ["安全评估报告.pdf", mb(1.4), 84],
  ["满意度问卷结果.csv", kb(96), 88],
  ["结项申请.docx", kb(74), 92],
  ["复盘会议纪要.docx", kb(110), 96],
];

// 产物补充样例：同样补到 30 条
const EXTRA_ARTIFACT_SEEDS: Array<[string, number, number]> = [
  ["项目方案初稿.docx", kb(320), 9],
  ["需求拆解清单.xlsx", kb(180), 12],
  ["竞品对比分析.pptx", mb(3.4), 15],
  ["用户画像报告.pdf", mb(1.6), 18],
  ["原型交互说明.md", kb(48), 21],
  ["数据看板截图.png", mb(1.2), 24],
  ["里程碑甘特图.xlsx", kb(260), 28],
  ["风险评估表.xlsx", kb(150), 31],
  ["技术选型对比.docx", kb(210), 34],
  ["接口文档.pdf", kb(940), 38],
  ["测试报告.docx", kb(380), 41],
  ["性能压测结果.xlsx", kb(420), 45],
  ["上线公告.md", kb(18), 49],
  ["培训手册.pdf", mb(2.8), 52],
  ["运营数据周报.xlsx", kb(300), 56],
  ["用户反馈汇总.csv", kb(120), 60],
  ["需求变更记录.docx", kb(140), 64],
  ["架构设计图.png", kb(860), 68],
  ["部署手册.md", kb(60), 72],
  ["复盘报告.pptx", mb(2.2), 76],
  ["成本核算表.xlsx", kb(240), 80],
  ["供应商对比.pdf", mb(1.3), 84],
  ["质量检查表.xlsx", kb(170), 88],
  ["演示脚本.docx", kb(90), 92],
  ["知识沉淀文档.md", kb(72), 96],
];

export const DEMO_PROJECT_FILES: ProjectFiles = {
  sources: [
    ...EXAMPLE_FILES.map((file, index) => ({
      ...file,
      id: `source-${index}`,
      owner: DEMO_OWNERS[index],
      createdAt: dayAgo([0, 1, 3, 5, 7][index] ?? index),
      status: statuses[index],
    })),
    ...EXTRA_SOURCE_SEEDS.map(([name, size, days], index) => ({
      id: `source-${index + EXAMPLE_FILES.length}`,
      name,
      url: DEMO_FILE_URL,
      size,
      owner: DEMO_OWNERS[(index + EXAMPLE_FILES.length) % DEMO_OWNERS.length],
      createdAt: dayAgo(days),
      status: (index % 7 === 0 ? "disabled" : "enabled") as SourceStatus,
    })),
  ],
  artifacts: [
    ...EXAMPLE_FILES.map((file, index) => ({
      ...file,
      id: `artifact-${index}`,
      owner: DEMO_ARTIFACT_SOURCES[index % DEMO_ARTIFACT_SOURCES.length],
      createdAt: dayAgo([0, 1, 3, 5, 7][index] ?? index),
      status: "enabled" as SourceStatus,
    })),
    ...EXTRA_ARTIFACT_SEEDS.map(([name, size, days], index) => ({
      id: `artifact-${index + EXAMPLE_FILES.length}`,
      name,
      url: DEMO_FILE_URL,
      size,
      owner: DEMO_ARTIFACT_SOURCES[(index + 1) % DEMO_ARTIFACT_SOURCES.length],
      createdAt: dayAgo(days),
      status: "enabled" as SourceStatus,
    })),
  ],
};

const STATUS_LABELS: Record<SourceStatus, string> = { enabled: "已启用", disabled: "停用" };
const STATUS_ICONS: Record<SourceStatus, string> = { enabled: "eb6f2", disabled: "6c389" };

export function getSourceActions(status: SourceStatus) {
  return [status === "enabled" ? "停用" : "启用", "下载", "删除"];
}

function fileIcon(name: string) {
  const extension = getAttachmentExtension(name);
  if (extension === "pdf") return "18532";
  if (["doc", "docx"].includes(extension)) return "7957f";
  if (["xls", "xlsx", "csv"].includes(extension)) return "569df";
  if (["ppt", "pptx"].includes(extension)) return "d14e7";
  if (["html", "md"].includes(extension)) return "ea65a";
  if (["jpg", "jpeg", "png"].includes(extension)) return "23ed1";
  return "75599";
}

export function pickSourceFiles(fileList: FileList): { additions: ProjectFile[]; errors: string[] } {
  const additions: ProjectFile[] = [];
  const errors: string[] = [];
  for (const file of Array.from(fileList)) {
    const error = getAttachmentValidationError(file);
    if (error) {
      errors.push(`${file.name}：${error === "format" ? "不支持该文件格式" : error === "empty" ? "文件为空" : "文件大小超出限制"}`);
      continue;
    }
    additions.push({ id: crypto.randomUUID(), name: file.name, blob: file, owner: "我", createdAt: Date.now(), status: "enabled" });
  }
  return { additions, errors };
}

export function ProjectFilesPanel({ kind, files, query, formats, timeFilter, statuses, uploader, onChange, onUploadToProject }: {
  kind: "sources" | "artifacts";
  files: ProjectFiles;
  query: string;
  formats: FileFormat[];
  timeFilter: TimeFilter;
  // 状态筛选（仅来源：已启用 / 停用）
  statuses?: FileStatus[];
  // 上传人筛选（仅来源有意义，产物不传）
  uploader?: UploaderFilter;
  onChange: (files: ProjectFiles) => void;
  /** 产物「上传到项目资料」：交给上层走文件导入面板流程 */
  onUploadToProject?: (file: ProjectFile) => void;
}) {
  const [menu, setMenu] = useState<{ id: string; anchor: HTMLButtonElement } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [downloading, setDownloading] = useState(false);
  const source = kind === "sources";
  const records = files[kind];
  // 与资料库同一套筛选判定：名称 / 状态 / 格式 / 上传人 / 更新时间
  const visible = records.filter(file => matchFileFilters(
    { name: file.name, format: formatByExtension(file.name), modified: new Date(file.createdAt), owner: file.owner, status: file.status },
    { query, formats, timeFilter, uploader, statuses },
  ));
  const selected = records.find(file => file.id === menu?.id);

  useEffect(() => {
    if (!menu) return;
    const close = (event: PointerEvent) => {
      if (event.target instanceof Node && !menu.anchor.contains(event.target) && !menuRef.current?.contains(event.target)) setMenu(null);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [menu]);

  const download = async (file: ProjectFile) => {
    setDownloading(true);
    try {
      let blob = file.blob;
      if (file.url) {
        const response = await fetch(file.url);
        if (!response.ok) throw new Error(`下载失败 (${response.status})`);
        blob = await response.blob();
      }
      if (!blob?.size) throw new Error("文件内容不存在，无法下载");
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = file.name;
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "下载失败，请重试");
    } finally {
      setDownloading(false);
    }
  };

  const operate = (action: string, file: ProjectFile) => {
    if (action === "下载") void download(file);
    else if (action === "删除") onChange({ ...files, [kind]: records.filter(item => item.id !== file.id) });
    else if (action === "上传到项目资料") {
      // 与输入框选产物一致：进入文件导入面板，完成后由导入流程写入「来源」
      onUploadToProject?.(file);
    } else {
      onChange({ ...files, sources: records.map(item => item.id === file.id ? { ...item, status: action === "停用" ? "disabled" : "enabled" } : item) });
    }
    setMenu(null);
  };

  const actions = selected ? source ? getSourceActions(selected.status) : ["上传到项目资料", "下载", "删除"] : [];

  // 响应式列规则（Figma 9906:45129）：
  // - 非文件列每列宽度 = 容器总宽 / 6，并限制在 128 ~ 320px；文件名占剩余全部宽度
  // - 文件名实时宽度 < 320px 时按优先级依次隐藏：大小 → 时间 → 上传人(来源) → 状态
  const hideOrder = source ? ["size", "time", "owner", "status"] : ["size", "time", "source"];
  const [columnLayout, setColumnLayout] = useState<{ width: number; hidden: string[] }>({ width: 128, hidden: [] });
  const bodyRef = useRef<HTMLDivElement>(null);
  const hideOrderKey = hideOrder.join(",");

  useLayoutEffect(() => {
    const element = bodyRef.current;
    if (!element) return;
    const update = () => {
      const total = element.clientWidth;
      if (!total) return;
      const width = Math.min(320, Math.max(128, total / 6));
      const hidden: string[] = [];
      while (hidden.length < hideOrder.length && total - (hideOrder.length - hidden.length) * width < 320) {
        hidden.push(hideOrder[hidden.length]);
      }
      setColumnLayout({ width, hidden });
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    window.addEventListener("resize", update);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", update);
    };
  }, [hideOrderKey]);

  const showOwner = !columnLayout.hidden.includes(source ? "owner" : "source");
  const showTime = !columnLayout.hidden.includes("time");
  const showStatus = source && !columnLayout.hidden.includes("status");
  const showSize = !columnLayout.hidden.includes("size");
  // 列展示顺序（Figma 9234:27120）：文件名 → 状态（仅来源）→ 上传人/来源 → 时间 → 大小
  const columns = [
    { key: "name", label: "文件名", visible: true },
    { key: "status", label: "状态", visible: showStatus },
    { key: "owner", label: source ? "上传人" : "来源", visible: showOwner },
    { key: "time", label: source ? "上传时间" : "生成时间", visible: showTime },
    { key: "size", label: "大小", visible: showSize },
  ].filter(column => column.visible);

  return (
    <div className="flex min-h-0 flex-1 flex-col" data-project-files={kind}>
      {visible.length > 0 ? (
        <div ref={bodyRef} className="min-h-0 flex-1 overflow-y-auto">
          <table className="w-full table-fixed border-collapse text-left text-[14px] font-normal leading-[22px] tracking-[0.014px] text-[rgba(0,0,0,0.88)]">
            <colgroup>
              {columns.map(column => column.key === "name"
                ? <col key={column.key} />
                : <col key={column.key} style={{ width: columnLayout.width }} />)}
            </colgroup>
            <thead>
              <tr className="h-[40px] text-[rgba(0,0,0,0.6)]">
                {columns.map(column => <th key={column.key} className="sticky top-0 z-[2] bg-white px-[8px] text-left align-middle font-normal">{column.label}</th>)}
              </tr>
            </thead>
            <tbody>
              {visible.map(file => {
                const content: Record<string, ReactNode> = {
                  name: (
                    <div className="flex min-w-0 items-center gap-[8px]">
                      <span className="size-[16px] shrink-0"><span className={`inline-flex origin-top-left ${fileIcon(file.name) === "18532" ? "size-[24px] scale-[0.666667]" : ""}`}><img src={`/assets/${fileIcon(file.name)}.svg`} alt="" className="max-w-none" /></span></span>
                      <SmallTip label={file.name} side="top" className="max-w-[calc(100vw-16px)] whitespace-normal break-all"><span className="block min-w-0 truncate">{file.name}</span></SmallTip>
                    </div>
                  ),
                  status: <div className="flex items-center gap-[8px]"><img src={`/assets/${STATUS_ICONS[file.status]}.svg`} alt="" />{STATUS_LABELS[file.status]}</div>,
                  owner: <SmallTip label={file.owner} side="top" className="max-w-[calc(100vw-16px)] whitespace-normal break-all"><span className="inline-block max-w-full truncate align-bottom">{file.owner}</span></SmallTip>,
                  time: new Date(file.createdAt).toLocaleDateString("sv-SE").replace(/-/g, "/"),
                  size: formatFileSize(file.blob ? file.blob.size : file.size),
                };
                const cells = columns.map(column => ({ key: column.key, node: content[column.key] }));
                // 操作按钮挂在最后一个可见单元格内绝对定位，悬浮覆盖在最后一列之上、不占列宽
                const lastKey = cells[cells.length - 1].key;
                return (
                  <tr key={file.id} data-project-file={file.id} data-file-status={file.status} className={`group border-t border-[#f2f2f2] hover:z-[1] hover:bg-white hover:shadow-[0_0_8px_rgba(0,0,0,0.08)] focus-within:z-[1] focus-within:shadow-[0_0_8px_rgba(0,0,0,0.08)] ${menu?.id === file.id ? "z-[1] shadow-[0_0_8px_rgba(0,0,0,0.08)]" : ""}`}>
                    {cells.map(cell => (
                      <td key={cell.key} className={`h-[48px] px-[8px] ${cell.key === lastKey ? "relative pr-[32px]" : ""}`}>
                        {cell.node}
                        {/* 与资料库表格的更多按钮（.library-row-action）保持同一套视觉：
                            白底 + 左侧白色渐隐投影（不再生成灰色方块），hover 才变 #F2F2F2；
                            默认隐藏，行 hover / 键盘聚焦 / 菜单打开时显现，触屏设备常显。 */}
                        {cell.key === lastKey && (
                          <button type="button" aria-label={`文件操作 ${file.name}`} aria-haspopup="menu" aria-expanded={menu?.id === file.id} onClick={event => setMenu(menu?.id === file.id ? null : { id: file.id, anchor: event.currentTarget })} className={`absolute top-1/2 right-[8px] flex size-[24px] -translate-y-1/2 cursor-pointer items-center justify-center rounded-[4px] bg-white shadow-[-8px_0_8px_#fff] hover:bg-[#f2f2f2] group-hover:visible group-focus-within:visible [@media(hover:none)]:visible ${menu?.id === file.id ? "visible" : "invisible"}`}>
                            <img src="/assets/64110.svg" alt="" />
                          </button>
                        )}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className={`flex flex-col items-center pt-[16px]`}>
          <img src="/assets/c0d09.png" alt="" className="size-[320px] max-w-full object-contain" />
          <p className="-mt-[54px] pb-[32px] text-[14px] font-normal leading-[22px] tracking-[0.014px] text-[rgba(0,0,0,0.38)]">{records.length ? "没有匹配的文件" : "暂无文件"}</p>
        </div>
      )}
      {menu && selected && (
        <OperationMenu ref={menuRef} anchor={menu.anchor} gap={8} role="menu" aria-label={source ? "来源文件操作" : "产物文件操作"} onKeyDown={event => {
          if (event.key === "Escape") { menu.anchor.focus(); setMenu(null); }
        }} className="w-[192px] rounded-[12px] border border-[#f2f2f2] bg-white px-[8px] py-[4px] shadow-[0_0_12px_rgba(0,0,0,0.08)]">
          <div className="flex flex-col py-[4px]">
            {actions.map(action => (
              <button key={action} type="button" role="menuitem" disabled={downloading && action === "下载"} onClick={() => operate(action, selected)} className="flex w-full cursor-pointer items-center gap-[8px] rounded-[8px] px-[8px] py-[11px] text-left text-[14px] font-normal leading-[22px] tracking-[0.014px] hover:bg-[#f7f7f7] disabled:opacity-40">
                <img src={`/assets/${action === "停用" ? "415d1" : action === "启用" ? "c7dee" : action === "下载" ? "1d2af" : action === "删除" ? "5ff6b" : "d6cab"}.svg`} alt="" />{action}
              </button>
            ))}
          </div>
        </OperationMenu>
      )}
    </div>
  );
}
