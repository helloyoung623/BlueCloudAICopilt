import { useEffect, useRef, useState } from "react";
import { format, startOfDay, subDays } from "date-fns";
import { toast } from "sonner";
import { OperationMenu } from "./operation-menu";
import { SmallTip } from "./task-artifacts";
import { Dialog, DialogClose, DialogContent, DialogTitle } from "./ui/dialog";
import { ListPageHeader } from "./list-page-header";
import { FileFilterButton, formatByExtension, matchFileFilters } from "./file-filter";
import type { FileFormat, TimeFilter } from "./file-filter";
import "./library-view.css";

type LibraryFile = {
  id: string;
  name: string;
  source: string;
  modified: Date;
  size: string;
  format: FileFormat;
  icon: string;
};

const actions = [
  { label: "重命名", icon: "e2b81" },
  { label: "定位到消息位置", icon: "locate-message" },
  { label: "添加到任务", icon: "7f5ce" },
  { label: "下载", icon: "1d2af" },
  { label: "上传到项目", icon: "1d8f2" },
  { label: "删除", icon: "5ff6b" },
];

const iconByExtension: Record<string, string> = {
  pdf: "18532",
  doc: "7957f",
  docx: "7957f",
  xls: "569df",
  xlsx: "569df",
  ppt: "d14e7",
  pptx: "d14e7",
  png: "23ed1",
  jpg: "23ed1",
  jpeg: "23ed1",
};

// 来源两种形式：独立任务名（如「季度经营复盘」）；项目下的任务产物「项目名称/任务名称」（如「星辰探索计划/方案评审」）。
// 后者的项目名、任务名各最多显示 5 个字，超出以 … 截断（渲染时由 formatSource 处理，title 保留完整值）。
const exampleFileSeeds: Array<[string, string, number, string]> = [
  ["项目方案.pdf", "季度经营复盘", 0, "2.9MB"],
  ["调研报告.docx", "星辰探索计划/过去对话摘要", 3, "1.3MB"],
  ["数据统计.xlsx", "数据看板搭建", 15, "2.9MB"],
  ["演示.pptx", "蓝海创新项目/市场调研", 45, "2.9MB"],
  ["设计参考.png", "用户体验优化", 90, "1.2MB"],
  ["年度经营分析报告.pdf", "季度经营复盘", 6, "3.4MB"],
  ["会议纪要.docx", "会议待办跟进", 1, "0.8MB"],
  ["财务报表.xlsx", "年度预算编制/费用测算", 22, "1.9MB"],
  ["产品路线图规划.pptx", "产品需求评审", 38, "4.2MB"],
  ["用户调研.png", "绿洲环保行动/访谈记录", 67, "2.1MB"],
  ["合同.pdf", "合同审阅记录", 12, "1.6MB"],
  ["需求说明文档.docx", "智能客服建设/需求梳理", 4, "0.9MB"],
  ["客户名单.xlsx", "海外市场调研/线索汇总", 30, "1.1MB"],
  ["新员工入职培训材料.pptx", "培训材料整理", 58, "5.3MB"],
  ["界面截图.png", "未来城市构建/交互原型", 9, "3.7MB"],
  ["市场分析.pdf", "银河数据分析/报表导出", 27, "2.4MB"],
  ["技术方案.docx", "数据中台迁移/架构设计", 5, "1.5MB"],
  ["库存统计表.xlsx", "供应链协同/对账", 41, "0.7MB"],
  ["第三季度工作汇报.pptx", "季度经营复盘", 73, "6.1MB"],
  ["图标.png", "品牌焕新工程/视觉稿", 18, "0.5MB"],
  ["信息安全规范手册.pdf", "安全合规审计/整改清单", 33, "2.2MB"],
  ["项目计划.docx", "星辰探索计划/立项草案", 2, "1.0MB"],
  ["销售数据.xlsx", "周报自动生成", 49, "3.3MB"],
  ["竞品分析报告.pptx", "竞品调研汇总", 81, "2.8MB"],
  ["海报设计.png", "品牌焕新工程/主视觉", 25, "4.6MB"],
  ["发票扫描件.pdf", "年度预算编制/报销凭证", 7, "0.6MB"],
  ["操作手册.docx", "知识库问答", 14, "1.8MB"],
  ["排期表.xlsx", "智慧园区升级/工期排期", 36, "0.9MB"],
  ["答辩讲稿.pptx", "虚拟顾问交流", 96, "2.0MB"],
  ["流程图.png", "移动端改版/交互流程", 52, "1.4MB"],
];

function makeExampleFiles(): LibraryFile[] {
  const today = startOfDay(new Date());
  return exampleFileSeeds.map(([name, source, daysAgo, size], index) => ({
    id: String(index + 1),
    name,
    source,
    modified: subDays(today, daysAgo),
    size,
    format: formatByExtension(name),
    icon: iconByExtension[name.split(".").pop()?.toLowerCase() ?? ""] ?? "18532",
  }));
}

// 来源显示：项目下的任务产物「项目名称/任务名称」，项目名与任务名各最多 5 个字，超出以 … 截断。
// 独立任务名（无 /）保持原样。
const SOURCE_SEGMENT_MAX = 5;
function formatSource(source: string) {
  if (!source.includes("/")) return source;
  return source.split("/").map(segment => {
    const chars = Array.from(segment);
    return chars.length > SOURCE_SEGMENT_MAX ? chars.slice(0, SOURCE_SEGMENT_MAX).join("") + "…" : segment;
  }).join("/");
}

function FileIcon({ icon }: { icon: string }) {
  return <span className="relative block size-[16px] shrink-0 overflow-hidden">
    <img alt="" src={`/assets/${icon}.svg`} className={icon === "18532" ? "absolute left-0 top-0 max-w-none origin-top-left scale-[0.666667]" : "block max-w-none"} />
  </span>;
}

export function LibraryView({ active, onAddToTask }: { active: boolean; onAddToTask?: (file: LibraryFile) => void }) {
  const [files, setFiles] = useState(makeExampleFiles);
  const [query, setQuery] = useState("");
  const [selectedFormats, setSelectedFormats] = useState<FileFormat[]>([]);
  const [timeFilter, setTimeFilter] = useState<TimeFilter>(null);
  const [menu, setMenu] = useState<{ file: LibraryFile; anchor: HTMLButtonElement } | null>(null);
  const [projectAnchor, setProjectAnchor] = useState<HTMLButtonElement | null>(null);
  const [dialog, setDialog] = useState<{ type: "rename" | "delete"; file: LibraryFile } | null>(null);
  const [draftName, setDraftName] = useState("");
  const viewRef = useRef<HTMLDivElement>(null);
  const rowMenuRef = useRef<HTMLDivElement>(null);
  const projectMenuRef = useRef<HTMLDivElement>(null);
  const projectCloseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const openProjectMenu = (anchor: HTMLButtonElement) => {
    if (projectCloseTimer.current) clearTimeout(projectCloseTimer.current);
    setProjectAnchor(anchor);
  };
  const deferCloseProjectMenu = () => {
    if (projectCloseTimer.current) clearTimeout(projectCloseTimer.current);
    projectCloseTimer.current = setTimeout(() => setProjectAnchor(null), 140);
  };
  useEffect(() => () => {
    if (projectCloseTimer.current) clearTimeout(projectCloseTimer.current);
  }, []);

  useEffect(() => {
    if (active) return;
    setMenu(null);
    setProjectAnchor(null);
    setDialog(null);
  }, [active]);

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

  const visible = files.filter(file => matchFileFilters(file, { query, formats: selectedFormats, timeFilter }));

  const chooseAction = (action: string, file: LibraryFile) => {
    setMenu(null);
    if (action === "重命名") {
      setDraftName(file.name);
      setDialog({ type: "rename", file });
    } else if (action === "删除") {
      setDialog({ type: "delete", file });
    } else if (action === "添加到任务") {
      onAddToTask?.(file);
    } else {
      toast.info(`「${action}」为交互示例，未连接真实文件或任务`);
    }
  };

  return (
    <div ref={viewRef} className="library-surface library-view">
      <div className="mx-auto w-full max-w-[960px]">
        <ListPageHeader
          title="资料库"
          query={query}
          onQueryChange={setQuery}
          searchPlaceholder="搜索文件名称"
          searchAriaLabel="搜索文件名称"
        >
          <FileFilterButton
            active={active}
            selectedFormats={selectedFormats}
            onFormatsChange={setSelectedFormats}
            timeFilter={timeFilter}
            onTimeFilterChange={setTimeFilter}
          />
        </ListPageHeader>
      </div>

      <div className="library-list">
        {visible.length ? <div className="library-scroll">
          <table className="library-table">
            <colgroup><col /><col className="library-col-source" /><col className="library-col-time" /><col className="library-col-size" /></colgroup>
            <thead><tr><th>文件名</th><th className="library-col-source">来源</th><th className="library-col-time">更新时间</th><th className="library-col-size">大小</th></tr></thead>
            <tbody>{visible.map(file => <tr key={file.id} data-menu-open={menu?.file.id === file.id || undefined}>
              <td><div className="library-filename"><FileIcon icon={file.icon} /><SmallTip label={file.name} side="top" className="max-w-[calc(100vw-16px)] whitespace-normal break-all"><span tabIndex={0} className="min-w-0 flex-1 truncate">{file.name}</span></SmallTip></div>
                <button type="button" aria-label={`文件操作 ${file.name}`} aria-haspopup="menu" aria-expanded={menu?.file.id === file.id} onClick={event => { setProjectAnchor(null); setMenu(current => current?.file.id === file.id ? null : { file, anchor: event.currentTarget }); }} className="library-row-action"><img src="/assets/64110.svg" alt="" /></button>
              </td>
              <td className="library-col-source truncate" title={file.source}>{formatSource(file.source)}</td>
              <td className="library-col-time">{format(file.modified, "yyyy/MM/dd")}</td>
              <td className="library-col-size">{file.size}</td>
            </tr>)}</tbody>
          </table>
        </div> : <div className="library-empty">
          <img src="/assets/c0d09.png" alt="" />
          <span>{files.length === 0 ? "暂无资料" : "没有符合筛选条件的资料"}</span>
        </div>}
      </div>

      {active && menu && <OperationMenu ref={rowMenuRef} anchor={menu.anchor} align="end" gap={4} role="menu" onMouseEnter={() => { if (projectCloseTimer.current) clearTimeout(projectCloseTimer.current); }} className="library-surface w-[192px] rounded-[12px] border border-[#f2f2f2] bg-white p-[8px] shadow-[0_0_12px_rgba(0,0,0,0.08)]">
        {actions.map(action => {
          const isProject = action.label === "上传到项目";
          return <button key={action.label} type="button" role="menuitem" aria-haspopup={isProject ? "menu" : undefined} aria-expanded={isProject ? Boolean(projectAnchor) : undefined}
            onMouseEnter={isProject ? event => openProjectMenu(event.currentTarget) : undefined}
            onMouseLeave={isProject ? deferCloseProjectMenu : undefined}
            onClick={event => {
              if (isProject) { openProjectMenu(event.currentTarget); return; }
              chooseAction(action.label, menu.file);
            }} className={`flex h-[44px] w-full items-center gap-[8px] rounded-[8px] px-[8px] text-left ${isProject && projectAnchor ? "bg-[#f2f2f2]" : "hover:bg-[#f2f2f2]"}`}>
            <img src={`/assets/${action.icon}.svg`} alt="" /><span className="flex-1">{action.label}</span>{isProject && <img src="/assets/chevron-right-line.svg" alt="" aria-hidden />}
          </button>;
        })}
      </OperationMenu>}
      {active && menu && projectAnchor && <OperationMenu ref={projectMenuRef} anchor={projectAnchor} submenu role="menu" aria-label="选择项目" onMouseEnter={() => { if (projectCloseTimer.current) clearTimeout(projectCloseTimer.current); }} onMouseLeave={deferCloseProjectMenu} className="library-surface w-[232px] overflow-hidden rounded-[12px] border border-[#f2f2f2] bg-white px-[8px] py-[4px] shadow-[0_0_12px_rgba(0,0,0,0.08)]">
        <div className="flex max-h-[480px] flex-col overflow-y-auto py-[4px]">
          <button type="button" role="menuitem" onClick={() => {
            toast.info("「示例项目」为交互示例，未连接真实项目");
            setProjectAnchor(null);
            setMenu(null);
          }} className="flex w-full cursor-pointer items-center gap-[8px] rounded-[8px] px-[8px] py-[11px] text-left hover:bg-[#f7f7f7]">
            <img src="/assets/d95df.svg" alt="" className="shrink-0" />
            <span className="min-w-0 flex-1 truncate">示例项目</span>
          </button>
          <div className="relative h-px w-full"><img src="/assets/4b9c6.svg" alt="" className="absolute left-0 top-0" /></div>
          <button type="button" role="menuitem" onClick={() => {
            toast.info("「新建项目」为交互示例，未连接真实项目");
            setProjectAnchor(null);
            setMenu(null);
          }} className="flex w-full cursor-pointer items-center gap-[8px] rounded-[8px] px-[8px] py-[11px] text-left hover:bg-[#f7f7f7]">
            <img src="/assets/eede2.svg" alt="" className="shrink-0" />新建项目
          </button>
        </div>
      </OperationMenu>}
      <Dialog open={active && dialog !== null} onOpenChange={open => { if (!open) setDialog(null); }}>
        <DialogContent aria-describedby={undefined} className={`library-surface library-dialog w-[calc(100%-32px)] max-w-[480px] gap-0 overflow-hidden border-0 bg-white p-0 shadow-[0_0_12px_rgba(0,0,0,0.08)] ${dialog?.type === "delete" ? "rounded-[8px]" : "rounded-[12px]"}`}>
          {dialog?.type === "delete" ? <>
            <div className="flex items-center gap-[8px] px-[16px] pt-[24px]">
              <img src="/assets/dialog-delete-icon.svg" alt="" className="size-[24px] shrink-0" />
              <DialogTitle className="flex-1 text-[20px] font-medium leading-[28px] tracking-[0.001em] text-[rgba(0,0,0,0.88)]">确定删除？</DialogTitle>
              <DialogClose aria-label="关闭" className="relative flex size-[24px] shrink-0 cursor-pointer items-center justify-center rounded-[4px] hover:bg-[#f2f2f2]">
                <img src="/assets/search-dialog-close.svg" alt="" className="size-[20px]" />
              </DialogClose>
            </div>
            <p className="px-[16px] pb-0 pl-[48px] pt-[16px] text-[14px] font-normal leading-[22px] tracking-[0.014px] text-[rgba(0,0,0,0.88)]">确认删除“{dialog.file.name}”吗？删除后将不可恢复。</p>
            <div className="flex items-center justify-end gap-[24px] px-[16px] pb-[16px] pt-[24px]">
              <DialogClose asChild><button type="button" className="rounded-[4px] px-[4px] py-[3px] text-[14px] font-normal leading-[22px] text-[rgba(0,0,0,0.6)] hover:bg-[#f2f2f2]">取消</button></DialogClose>
              <button type="button" onClick={() => {
                if (!dialog) return;
                setFiles(current => current.filter(file => file.id !== dialog.file.id));
                setDialog(null);
              }} className="rounded-[4px] bg-[#1e63f5] px-[16px] py-[5px] text-[14px] font-normal leading-[22px] text-white hover:bg-[#1755e0]">确定</button>
            </div>
          </> : <>
            <div className="flex items-center justify-between px-[24px] pb-[4px] pt-[16px]">
              <DialogTitle className="text-[16px] font-medium leading-[24px] tracking-[0.001em] text-[rgba(0,0,0,0.88)]">重命名</DialogTitle>
              <DialogClose aria-label="关闭" className="relative flex size-[24px] shrink-0 cursor-pointer items-center justify-center rounded-[4px] hover:bg-[#f2f2f2]">
                <img src="/assets/search-dialog-close.svg" alt="" className="size-[20px]" />
              </DialogClose>
            </div>
            <div className="px-[12px] pb-0 pt-[16px]">
              <div className="px-[12px] pb-[24px]">
                <div className="flex h-[32px] items-center gap-[8px] rounded-[4px] border border-[#e6e6e6] px-[8px] focus-within:border-[#1e63f5]">
                  <input autoFocus value={draftName} maxLength={30} onChange={event => setDraftName(event.target.value)} placeholder="请输入" aria-label="文件名称" className="min-w-0 flex-1 bg-transparent text-[14px] font-normal leading-[22px] text-[rgba(0,0,0,0.88)] outline-none placeholder:text-[rgba(0,0,0,0.26)]" />
                  <span className="shrink-0 text-[14px] leading-[22px] text-[rgba(0,0,0,0.38)]">{draftName.length}/30</span>
                </div>
              </div>
            </div>
            <div className="flex items-center justify-end gap-[24px] border-t border-[#f2f2f2] px-[24px] py-[16px]">
              <DialogClose asChild><button type="button" className="rounded-[4px] px-[4px] py-[3px] text-[14px] font-normal leading-[22px] text-[rgba(0,0,0,0.6)] hover:bg-[#f2f2f2]">取消</button></DialogClose>
              <button type="button" onClick={() => {
                if (!dialog) return;
                if (!draftName.trim()) { toast.error("文件名称不能为空"); return; }
                setFiles(current => current.map(file => file.id === dialog.file.id ? { ...file, name: draftName.trim() } : file));
                setDialog(null);
              }} className="rounded-[4px] bg-[#1e63f5] px-[16px] py-[5px] text-[14px] font-normal leading-[22px] text-white hover:bg-[#1755e0]">确定</button>
            </div>
          </>}
        </DialogContent>
      </Dialog>
    </div>
  );
}
