import { useEffect, useRef, useState } from "react";
import { Dialog, DialogClose, DialogContent, DialogTitle } from "../components/ui/dialog";

const SEARCH_TIME = "2026-09-12 18:32";
const SEARCH_PAGE_SIZE = 10;
const SEARCH_TASKS = [
  "智能助手对话", "虚拟顾问交流", "自动问答记录", "过去对话摘要示例", "机器学习对话", "AI交互历史",
  "季度经营复盘", "产品需求评审", "客户访谈纪要", "数据看板搭建",
  "合同审阅记录", "周报自动生成", "竞品调研汇总", "培训材料整理", "会议待办跟进", "知识库问答",
];
const SEARCH_PROJECTS = [
  "星辰探索计划", "蓝海创新项目", "绿洲环保行动", "项目名称", "未来城市构建", "银河数据分析",
  "智慧园区升级", "供应链协同", "品牌焕新工程", "海外市场调研",
  "智能客服建设", "数据中台迁移", "年度预算编制", "安全合规审计", "用户体验优化", "移动端改版",
];

function DeleteProjectDialog({ open, onOpenChange, onConfirm }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        aria-describedby={undefined}
        className="w-[480px] max-w-[calc(100%-32px)] gap-0 overflow-hidden rounded-[8px] border-0 bg-white p-0 shadow-[0_0_12px_rgba(0,0,0,0.08)] sm:max-w-[calc(100%-32px)] [&>button]:hidden"
      >
        <div className="flex items-center gap-[8px] px-[16px] pt-[24px]">
          <img src="/assets/dialog-delete-icon.svg" alt="" className="size-[24px] shrink-0" />
          <DialogTitle className="min-w-0 flex-1 text-[20px] font-medium leading-[28px] tracking-[0.001em] text-[rgba(0,0,0,0.88)]">
            确定要删除此项目吗？
          </DialogTitle>
          <DialogClose asChild>
            <button
              type="button"
              aria-label="关闭删除项目弹窗"
              className="flex size-[24px] shrink-0 cursor-pointer items-center justify-center rounded-[4px] hover:bg-[#f2f2f2]"
            >
              <img src="/assets/search-dialog-close.svg" alt="" className="size-[20px]" />
            </button>
          </DialogClose>
        </div>
        <p className="px-[16px] pb-0 pl-[48px] pt-[16px] text-[14px] font-normal leading-[22px] tracking-[0.014px] text-[rgba(0,0,0,0.88)]">
          删除后项目将被永久删除，项目内所有任务及产物，且不可恢复。
        </p>
        <div className="flex items-center justify-end gap-[24px] px-[16px] pb-[16px] pt-[16px]">
          <DialogClose asChild>
            <button
              type="button"
              className="cursor-pointer rounded-[4px] px-[4px] py-[3px] text-[14px] font-normal leading-[22px] tracking-[0.014px] text-[rgba(0,0,0,0.6)] hover:bg-[#f2f2f2]"
            >
              取消
            </button>
          </DialogClose>
          <button
            type="button"
            onClick={onConfirm}
            className="cursor-pointer rounded-[4px] bg-[#1e63f5] px-[16px] py-[5px] text-[14px] font-normal leading-[22px] tracking-[0.014px] text-[rgba(255,255,255,0.98)] hover:bg-[#1554d1]"
          >
            确定
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ *
 * 删除任务（会话）确认弹窗 — Figma 459:38570
 * 480 宽 / 8 圆角 / 内边距 24 16 0；标题行（24 取消圆叉 + 20/28 中黑 + 右上关闭，gap 8）、
 * 说明文案左缩进 32（与标题文字对齐）、底部上下 16 留白 + 右对齐「取消 / 确定」（gap 24）。
 * 侧栏「···」、归档页、项目详情三处删任务都先走这里，确定后才真正删。
 * ------------------------------------------------------------------ */
function DeleteChatTaskDialog({ open, onOpenChange, onConfirm }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        aria-describedby={undefined}
        className="w-[480px] max-w-[calc(100%-32px)] gap-0 overflow-hidden rounded-[8px] border-0 bg-white p-0 shadow-[0_0_12px_rgba(0,0,0,0.08)] sm:max-w-[calc(100%-32px)] [&>button]:hidden"
      >
        <div className="flex flex-col gap-[16px] px-[16px] pt-[24px]">
          <div className="flex items-center gap-[8px]">
            <img src="/assets/dialog-delete-icon.svg" alt="" className="size-[24px] shrink-0" />
            <DialogTitle className="min-w-0 flex-1 truncate text-[20px] font-medium leading-[28px] tracking-[0.001em] text-[rgba(0,0,0,0.88)]">
              确定删除此任务？
            </DialogTitle>
            <DialogClose asChild>
              <button
                type="button"
                aria-label="关闭删除任务弹窗"
                className="flex size-[24px] shrink-0 cursor-pointer items-center justify-center rounded-[4px] hover:bg-[#f2f2f2]"
              >
                <img src="/assets/search-dialog-close.svg" alt="" className="size-[20px]" />
              </button>
            </DialogClose>
          </div>
          <p className="pl-[32px] text-[14px] font-normal leading-[22px] tracking-[0.014px] text-[rgba(0,0,0,0.88)]">
            删除后，聊天记录将不可恢复。
          </p>
          <div className="flex items-center justify-end gap-[24px] pb-[16px] pt-[16px]">
            <DialogClose asChild>
              <button
                type="button"
                className="cursor-pointer rounded-[4px] px-[4px] py-[3px] text-[14px] font-normal leading-[22px] tracking-[0.014px] text-[rgba(0,0,0,0.6)] hover:bg-[#f2f2f2]"
              >
                取消
              </button>
            </DialogClose>
            <DialogClose asChild>
              <button
                type="button"
                onClick={onConfirm}
                className="cursor-pointer rounded-[4px] bg-[#1e63f5] px-[16px] py-[5px] text-[14px] font-normal leading-[22px] tracking-[0.014px] text-[rgba(255,255,255,0.98)] hover:bg-[#1554d1]"
              >
                确定
              </button>
            </DialogClose>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ *
 * 退出登录确认弹窗 — Figma 2740:14632
 * 480 宽 / 8 圆角 / 内边距 24 16 0；标题行（24 info-fill + 20/28 中黑 + 右上关闭，gap 8）、
 * 说明文案左缩进 32（与标题文字对齐）、底部上下 16 留白 + 右对齐「取消 / 确定」（gap 24）。
 * 与删除任务弹窗同构，只有图标和文案不同。
 * ------------------------------------------------------------------ */

function SearchDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [tab, setTab] = useState<"任务" | "项目">("任务");
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);
  const [loadedCount, setLoadedCount] = useState(SEARCH_PAGE_SIZE);
  const [hasLoadedMore, setHasLoadedMore] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const loadingRef = useRef(false);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    const timer = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.clearTimeout(timer);
    };
  }, [open, onClose]);

  // 切换 Tab 或输入关键词时回到第一页
  useEffect(() => {
    setLoadedCount(SEARCH_PAGE_SIZE);
    setHasLoadedMore(false);
    loadingRef.current = false;
    if (listRef.current) listRef.current.scrollTop = 0;
  }, [tab, query]);

  // 一批数据落地后解锁，允许用户继续下滑加载
  useEffect(() => {
    loadingRef.current = false;
  }, [loadedCount]);

  if (!open) return null;

  const keyword = query.trim();
  const pool = tab === "任务" ? SEARCH_TASKS : SEARCH_PROJECTS;
  const filtered = keyword ? pool.filter(item => item.includes(keyword)) : pool;
  const visible = filtered.slice(0, loadedCount);
  const hasMore = loadedCount < filtered.length;
  const isEmpty = filtered.length === 0;
  // 「没有更多了」只在发生过一次加载、且数据已全部取完后出现
  const showNoMore = hasLoadedMore && !hasMore && !isEmpty;

  // 下拉滚动到列表底部时自动追加下一批，无需点击
  const handleScroll = () => {
    const el = listRef.current;
    if (!el || !hasMore || loadingRef.current) return;
    if (el.scrollHeight - el.scrollTop - el.clientHeight <= 24) {
      loadingRef.current = true;
      setLoadedCount(count => count + SEARCH_PAGE_SIZE);
      setHasLoadedMore(true);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-black/50"
      onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="搜索"
        onMouseDown={event => {
          const target = event.target as HTMLElement;
          if (!target.closest("input, button")) inputRef.current?.blur();
        }}
        className="flex h-[560px] w-[800px] max-w-[calc(100vw-32px)] flex-col gap-[8px] overflow-hidden rounded-[12px] bg-white pb-[16px] pt-[16px]"
      >
        {/* 标题 / 搜索框 / Tab —— 设计稿 Frame 1182，内容左右各内缩 16px → 768 宽 */}
        <div className="flex shrink-0 flex-col gap-[12px] px-[16px] pb-[12px]">
          <div className="flex h-[32px] items-center justify-between">
            <span className="text-[16px] leading-[24px] tracking-[0.016px] text-[rgba(0,0,0,0.88)]">搜索</span>
            <button
              type="button"
              aria-label="关闭搜索"
              onClick={onClose}
              className="flex size-[32px] cursor-pointer items-center justify-center rounded-[4px] hover:bg-[#f7f7f7]"
            >
              <img alt="" className="size-[20px]" src="/assets/search-dialog-close.svg" />
            </button>
          </div>
          {/* Search Input：激活仅放大镜 icon 由灰变蓝，圆角 / 背景 / 占位色保持不变 */}
          <div className="flex h-[32px] items-center gap-[8px] rounded-[8px] bg-[#f7f7f7] px-[8px]">
            <img
              alt=""
              className="size-[16px] shrink-0"
              src={focused ? "/assets/search-dialog-search.svg" : "/assets/search-dialog-search-default.svg"}
            />
            <input
              ref={inputRef}
              value={query}
              onChange={event => setQuery(event.target.value)}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              placeholder="搜索"
              className="h-[22px] min-w-0 flex-1 border-0 bg-transparent p-0 font-normal text-[14px] leading-[22px] tracking-[0.014px] text-[rgba(0,0,0,0.88)] outline-none placeholder:text-[rgba(0,0,0,0.4)]"
            />
            {query && (
              <button
                type="button"
                aria-label="清空搜索"
                onMouseDown={event => event.preventDefault()}
                onClick={() => { setQuery(""); inputRef.current?.focus(); }}
                className="flex size-[16px] shrink-0 cursor-pointer items-center justify-center opacity-30 hover:opacity-60"
              >
                <img alt="" className="size-[16px]" src="/assets/search-dialog-close.svg" />
              </button>
            )}
          </div>
          {/* Tab「Tag-2」Size=M：Hover=true+Selected=false (9436:38023) → #F2F2F2/r4 */}
          <div className="flex h-[32px] items-center gap-[16px]">
            {(["任务", "项目"] as const).map(item => (
              <button
                key={item}
                type="button"
                onMouseDown={event => event.preventDefault()}
                onClick={() => setTab(item)}
                className={`flex h-[32px] cursor-pointer items-center rounded-[4px] px-[8px] font-normal text-[14px] leading-[22px] tracking-[0.014px] text-[rgba(0,0,0,0.88)] ${tab === item ? "bg-[#f7f7f7]" : "bg-transparent hover:bg-[#f2f2f2]"}`}
              >
                {item}
              </button>
            ))}
          </div>
        </div>

        {isEmpty ? (
          <div className="flex min-h-0 flex-1 items-center justify-center">
            <img alt="未找到任何结果" className="size-[240px]" src="/assets/search-dialog-empty.png" />
          </div>
        ) : (
          <div ref={listRef} onScroll={handleScroll} className="min-h-0 flex-1 overflow-y-auto px-[8px]">
            <div className="flex flex-col gap-[8px]">
              {visible.map(title => (
                <div
                  key={title}
                  className="group flex h-[40px] cursor-pointer items-center justify-between rounded-[8px] px-[8px] hover:bg-[#f2f2f2]"
                >
                  <span className="min-w-0 flex-1 truncate text-[14px] leading-[22px] tracking-[0.014px] text-[rgba(0,0,0,0.88)]">{title}</span>
                  <span className="shrink-0 text-[14px] leading-[22px] tracking-[0.014px] text-[rgba(0,0,0,0.26)] group-hover:hidden">{SEARCH_TIME}</span>
                  <button
                    type="button"
                    aria-label={`更多操作：${title}`}
                    className="hidden size-[24px] shrink-0 cursor-pointer items-center justify-center rounded-[4px] group-hover:flex"
                  >
                    <img alt="" className="size-[16px]" src="/assets/search-dialog-more.svg" />
                  </button>
                </div>
              ))}
              {showNoMore && (
                <div className="flex h-[32px] items-center justify-center text-[14px] leading-[22px] tracking-[0.014px] text-[rgba(0,0,0,0.26)]">没有更多了</div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}


export { DeleteProjectDialog, DeleteChatTaskDialog, SearchDialog };
