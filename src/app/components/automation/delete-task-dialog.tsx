import { Dialog, DialogClose, DialogContent, DialogTitle } from "../ui/dialog";

// ============================================================================
// 删除自动化任务确认弹窗（Figma 9877:63376）：风险提示
// 480 宽 / 8 圆角；标题行（24 删除图标 + 20/28 Medium「确定删除？」+ 右上关闭）、
// 风险文案左缩进 48 与标题文字对齐、底部右对齐「取消 / 确定」。
// 确认后由上层真正删除任务。
// ============================================================================
export function DeleteTaskDialog({ open, taskTitle, onOpenChange, onConfirm }: {
  open: boolean;
  taskTitle: string;
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
          <DialogTitle className="min-w-0 flex-1 truncate text-[20px] font-medium leading-[28px] tracking-[0.001em] text-[rgba(0,0,0,0.88)]">
            确定删除？
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
        <p className="px-[16px] pb-0 pl-[48px] pt-[16px] text-[14px] font-normal leading-[22px] tracking-[0.014px] text-[rgba(0,0,0,0.88)]">
          确定要删除「{taskTitle}」吗？此操作无法撤销。删除后不再自动执行。
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
      </DialogContent>
    </Dialog>
  );
}

