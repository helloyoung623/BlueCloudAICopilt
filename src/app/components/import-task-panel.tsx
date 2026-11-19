import { useEffect, useRef } from "react";
import { getAttachmentIcon, formatFileSize } from "./attachment-tray";

// TaskPanel（文件导入悬浮面板）交互规范 9753:63653：
// - 页面右下角悬浮固定，宽 360，最大高度 400（超出时头部固定、列表区滚动）
// - 进行中：标题「文件导入中（X/Y）」，仅保留 全部重试（有失败项）+ 收起，无关闭按钮
// - 已完成：标题「文件导入已完成（X/Y）」，包含 全部重试（有失败项）+ 收起 + 关闭
// - 收起态：256 宽胶囊条，标题同步状态，保留展开按钮
// - 行状态：上传中（蓝字 + Loading）、上传失败/解析失败（红字 + 单项重试图标，无悬浮文字按钮）、
//   已完成（格式 · 体积 + 右侧完成图标）

export type ImportTaskStatus = "uploading" | "failed" | "done";

export type ImportTask = {
  id: string;
  name: string;
  size: number;
  /** 目标项目：批次可来自不同项目，写入来源时按任务自带的 projectId 定位 */
  projectId: number;
  /** 来源角标（OneDrive / SharePoint），Outlook / 产物 / 本地文件不显示 */
  badge?: string;
  status: ImportTaskStatus;
  /** 失败类型：upload = 上传失败，parse = 解析失败 */
  failKind?: "upload" | "parse";
};

const HEAD_ICONS = {
  refresh: "/assets/taskpanel-refresh.svg",
  done: "/assets/taskpanel-done.svg",
  // 注意：两个 svg 的文件名和图形是反的（collapse 画的是向外扩、expand 画的是向内收），
  // 这里按「图形语义」对应按钮：展开面板用向外扩，收起面板用向内收。
  collapse: "/assets/taskpanel-expand.svg",
  expand: "/assets/taskpanel-collapse.svg",
  close: "/assets/search-dialog-close.svg",
};

function IconButton({ icon, label, onClick }: { icon: string; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="flex size-[24px] shrink-0 cursor-pointer items-center justify-center rounded-[4px] hover:bg-[#f2f2f2]"
    >
      <img src={icon} alt="" className="size-[16px]" />
    </button>
  );
}

// 行第二行状态文案（12/20）：
// 上传中 = 蓝字 + Loading；失败 = 红字；完成 = 灰字「格式 · 体积」
function RowStatusLine({ task }: { task: ImportTask }) {
  if (task.status === "uploading") {
    return (
      <span className="flex items-center gap-[4px]">
        <img src="/assets/attachment-loading.svg" alt="" className="size-[16px] animate-spin" />
        <span className="text-[12px] font-normal leading-[20px] text-[#1e63f5]">上传中</span>
      </span>
    );
  }
  if (task.status === "failed") {
    return (
      <span className="text-[12px] font-normal leading-[20px] text-[#fc5926]">
        {task.failKind === "parse" ? "解析失败" : "上传失败"}
      </span>
    );
  }
  const ext = (task.name.split(".").pop() ?? "").toUpperCase();
  return (
    <span className="truncate text-[12px] font-normal leading-[20px] text-[rgba(0,0,0,0.38)]">
      {`${ext} · ${formatFileSize(task.size)}`}
    </span>
  );
}

function TaskRow({ task, onRetry }: { task: ImportTask; onRetry: (id: string) => void }) {
  const failed = task.status === "failed";
  return (
    <div
      className={`flex h-[56px] shrink-0 items-center gap-[8px] rounded-[8px] px-[8px] transition-colors ${failed ? "bg-[#f7f7f7] hover:bg-[#f2f2f2]" : "bg-[#f7f7f7]"}`}
    >
      <span className="relative flex size-[32px] shrink-0 items-center justify-center">
        <img src={getAttachmentIcon((task.name.split(".").pop() ?? "").toLowerCase())} alt="" className="size-[32px]" />
        {task.badge && <img src={task.badge} alt="" className="absolute bottom-[-2px] right-[-2px] size-[16px]" />}
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-[14px] font-normal leading-[22px] text-[rgba(0,0,0,0.88)]">{task.name}</span>
        <RowStatusLine task={task} />
      </span>
      {/* 失败行：单项重试图标常驻（不出现悬浮文字按钮） */}
      {failed && (
        <button
          type="button"
          aria-label={`重试 ${task.name}`}
          onClick={() => onRetry(task.id)}
          className="mr-[4px] flex size-[24px] shrink-0 cursor-pointer items-center justify-center rounded-[4px] hover:bg-[#e6e6e6]"
        >
          <img src={HEAD_ICONS.refresh} alt="" className="size-[16px]" />
        </button>
      )}
      {/* 完成行：右侧完成图标（9540:10217），与重试图标同一右侧基线 */}
      {task.status === "done" && (
        <span className="mr-[4px] flex size-[24px] shrink-0 items-center justify-center">
          <img src={HEAD_ICONS.done} alt="已完成" className="size-[16px]" />
        </span>
      )}
    </div>
  );
}

export function ImportTaskPanel({ tasks, collapsed, onToggleCollapsed, onRetry, onRetryAll, onClose }: {
  tasks: ImportTask[];
  collapsed: boolean;
  onToggleCollapsed: () => void;
  onRetry: (id: string) => void;
  onRetryAll: () => void;
  onClose: () => void;
}) {
  const total = tasks.length;
  const doneCount = tasks.filter(task => task.status === "done").length;
  const hasFailed = tasks.some(task => task.status === "failed");
  const importing = tasks.some(task => task.status === "uploading");
  const title = `${importing ? "文件导入中" : "文件导入已完成"}（${doneCount}/${total}）`;

  // 记录累加（新批次追加在末尾）：列表超出 400 高时自动滚到底部，保证新一批任务可见
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = listRef.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, [total]);

  if (collapsed) {
    // 收起胶囊态（9545:40028）：256 宽，仅标题 + 展开按钮
    return (
      <section
        aria-label="文件导入面板"
        className="fixed bottom-[32px] right-[32px] z-50 flex w-[256px] flex-col rounded-[8px] border border-[#f2f2f2] bg-white shadow-[0_0_12px_rgba(0,0,0,0.08)]"
      >
        <div className="flex items-center gap-[12px] px-[16px] py-[8px]">
          <span className="min-w-0 flex-1 truncate text-[14px] font-medium leading-[22px] text-[rgba(0,0,0,0.88)]">{title}</span>
          <IconButton icon={HEAD_ICONS.expand} label="展开文件导入面板" onClick={onToggleCollapsed} />
        </div>
      </section>
    );
  }

  return (
    <section
      aria-label="文件导入面板"
      className="fixed bottom-[32px] right-[32px] z-50 flex max-h-[400px] w-[360px] flex-col rounded-[8px] border border-[#f2f2f2] bg-white shadow-[0_0_12px_rgba(0,0,0,0.08)]"
    >
      <div className="flex shrink-0 items-center gap-[12px] px-[16px] py-[8px]">
        <span className="min-w-0 flex-1 truncate text-[14px] font-medium leading-[22px] text-[rgba(0,0,0,0.88)]">{title}</span>
        {hasFailed && <IconButton icon={HEAD_ICONS.refresh} label="全部重试" onClick={onRetryAll} />}
        <IconButton icon={HEAD_ICONS.collapse} label="收起文件导入面板" onClick={onToggleCollapsed} />
        {/* 关闭按钮仅当队列中无上传中/处理中任务时显示 */}
        {!importing && <IconButton icon={HEAD_ICONS.close} label="关闭文件导入面板" onClick={onClose} />}
      </div>
      <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto">
        {/* 列表上内边距 4px（Figma 9540:10224 / 9544:34255：padding 4px 16px 16px） */}
        <div className="flex flex-col gap-[12px] px-[16px] pt-[4px] pb-[16px]">
          {tasks.map(task => <TaskRow key={task.id} task={task} onRetry={onRetry} />)}
        </div>
      </div>
    </section>
  );
}
