import { useEffect, useState } from "react";
import { Dialog, DialogClose, DialogContent, DialogTitle } from "../ui/dialog";
import { Popover, PopoverAnchor } from "../ui/popover";
import { AddContentMenu } from "../add-content-menu";
import { AttachmentPicker } from "../attachment-picker";
import type { AttachmentSource } from "../attachment-picker";
import { AttachmentTray } from "../attachment-tray";
import type { ChatAttachment } from "../attachment-tray";
import { useDraftAttachments } from "../use-draft-attachments";
import type { ScheduleState } from "./types";
import { buildDefaultSchedule } from "./utils";
import { AdvancedSettings, ScheduleEditor } from "./automation-controls";

// ============================================================================
// 新建自动化任务弹窗（Figma 9665 / 9782 / 9783 / 9785 Modal 720px）
// ============================================================================
function CreateAutomationDialog({ open, onOpenChange, onCreate }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // 点「创建」发起一个新会话，由 AI 创建这条任务（Figma 9625:49728）
  // newSessionEachRun：高级设置里「每次执行都开启新会话」的勾选结果，随任务保存
  onCreate: (schedule: ScheduleState, prompt: string, attachments: ChatAttachment[], newSessionEachRun: boolean) => void;
}) {
  const [schedule, setSchedule] = useState<ScheduleState>(() => buildDefaultSchedule());
  const [prompt, setPrompt] = useState("");
  // 「就」里的 + 与输入框同一套面板：菜单 → 文件选择/云盘面板 → 附件卡片
  const { attachments, addFiles, removeAttachment, clearAttachments } = useDraftAttachments();
  const [attachmentSource, setAttachmentSource] = useState<AttachmentSource | null>(null);
  // 高级设置（Figma 9783:70644）：默认收起；勾选项放外层，创建时一并带出
  const [advOpen, setAdvOpen] = useState(false);
  const [newSessionEachRun, setNewSessionEachRun] = useState(false);

  useEffect(() => {
    if (open) {
      // 每次打开都重新取系统当前时间作为预填值（时刻 / 周几 / 几号）
      setSchedule(buildDefaultSchedule());
      setPrompt("");
      setAdvOpen(false);
      setNewSessionEachRun(false);
      setAttachmentSource(null);
      clearAttachments();
    }
  }, [open, clearAttachments]);

  const patchSchedule = (patch: Partial<ScheduleState>) => setSchedule(current => ({ ...current, ...patch }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* 弹窗距视口上下各至少 32px：max-h = 100vh - 64px；内容超出时只有中间「内容区」滚动，
          标题栏与底部操作区固定不动（grid: auto / minmax(0,1fr) / auto） */}
      <DialogContent
        aria-describedby={undefined}
        className="grid max-h-[calc(100vh-64px)] w-[720px] max-w-[calc(100%-32px)] grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden rounded-[12px] border-0 bg-white p-0 shadow-[0_0_12px_rgba(0,0,0,0.08)] sm:max-w-[720px] [&>button]:hidden"
      >
        {/* 标题栏：padding 16px 24px */}
        <div className="flex w-full flex-col gap-[4px] px-[24px] py-[16px]">
          <div className="relative h-[24px] w-full">
            <DialogTitle className="font-['PingFang_SC:Medium'] text-[16px] font-medium leading-[24px] tracking-[0.016px] text-[rgba(0,0,0,0.88)]">
              新建自动化任务
            </DialogTitle>
            <DialogClose asChild>
              <button
                type="button"
                aria-label="关闭新建自动化任务弹窗"
                className="absolute right-0 top-0 flex size-[24px] cursor-pointer items-center justify-center rounded-[4px] hover:bg-[#f7f7f7]"
              >
                <img src="/assets/f802d.svg" alt="" />
              </button>
            </DialogClose>
          </div>
        </div>

        {/* 内容区：padding 16px 12px, gap 24px。高度受限时自身滚动（标题/操作区固定） */}
        <div className="flex min-h-0 w-full flex-col gap-[24px] overflow-y-auto px-[12px] py-[16px] [scrollbar-width:thin] [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-[rgba(0,0,0,0.2)] [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar]:w-[8px]">
          {/* 当 行 */}
          <div className="flex w-full flex-col gap-[12px] px-[12px]">
            <span className="font-['TCloudNumber'] text-[14px] font-normal leading-[22px] text-[rgba(0,0,0,0.88)]">当</span>
            <div className="flex min-h-[40px] w-full flex-wrap items-center gap-[8px] rounded-[8px] border border-[#e6e6e6] bg-white px-[12px] py-[8px]">
              <img src="/assets/automation-time-range.svg" alt="" className="size-[16px] shrink-0" />
              <ScheduleEditor schedule={schedule} onChange={patchSchedule} />
            </div>
          </div>

          {/* 就 行 */}
          <div className="flex w-full flex-col gap-[12px] px-[12px]">
            <span className="font-['TCloudNumber'] text-[14px] font-normal leading-[22px] text-[rgba(0,0,0,0.88)]">就</span>
            <Popover open={attachmentSource !== null} onOpenChange={next => { if (!next) setAttachmentSource(null); }}>
              <PopoverAnchor asChild>
                {/* 滚动区 = 整个文字区（含 12px 内边距），滚动条落在框的最右边；
                    文字不再由 textarea 自己滚，避免出现「文字溢到框外、滚动条缩在中间」 */}
                <div className="relative flex w-full flex-col overflow-hidden rounded-[8px] border border-[#e6e6e6] bg-white focus-within:border-[#1e63f5]">
                  <div className="flex max-h-[132px] min-h-0 flex-col gap-[8px] overflow-y-auto px-[12px] pb-[12px] pt-[12px]">
                    <AttachmentTray attachments={attachments} onRemove={removeAttachment} />
                    <textarea
                      rows={1}
                      value={prompt}
                      onChange={event => setPrompt(event.target.value)}
                      placeholder="希望我干什么？"
                      className="block min-h-[22px] w-full shrink-0 resize-none bg-transparent font-['PingFang_SC:Regular'] text-[14px] font-normal leading-[22px] tracking-[0.014px] text-[rgba(0,0,0,0.88)] outline-none placeholder:text-[rgba(0,0,0,0.26)] [field-sizing:content]"
                    />
                  </div>
                  <div className="flex items-center gap-[8px] p-[8px]">
                    <AddContentMenu
                      hasProject={false}
                      onAddFiles={addFiles}
                      onSelectSource={setAttachmentSource}
                      iconSrc="/assets/automation-add-dark.svg"
                      iconClassName="size-[16px]"
                      onOpenChange={next => { if (next) setAttachmentSource(null); }}
                    />
                  </div>
                </div>
              </PopoverAnchor>
              {attachmentSource && (
                <AttachmentPicker
                  source={attachmentSource}
                  hasProject={false}
                  onSourceChange={setAttachmentSource}
                  attachments={attachments}
                  onAddFiles={addFiles}
                  onRemove={removeAttachment}
                  onClose={() => setAttachmentSource(null)}
                />
              )}
            </Popover>
          </div>

          {/* 高级设置：Figma 9783:70663（容器 padding 0 8px），展开后箭头翻转为 up-small */}
          <div className="flex w-full flex-col gap-[10px] px-[8px]">
            <button
              type="button"
              aria-expanded={advOpen}
              onClick={() => setAdvOpen(current => !current)}
              className="flex w-fit cursor-pointer items-center gap-[8px] rounded-[4px] px-[4px] py-[3px] text-[14px] font-normal leading-[22px] tracking-[0.014px] text-[rgba(0,0,0,0.6)] hover:bg-[#f7f7f7]"
            >
              <span>高级设置</span>
              <img
                src={advOpen ? "/assets/automation-up-small.svg" : "/assets/automation-down-small.svg"}
                alt=""
                className="size-[16px] shrink-0"
              />
            </button>
          </div>

          {advOpen && <AdvancedSettings newSession={newSessionEachRun} onNewSessionChange={setNewSessionEachRun} executionTime={schedule.time} />}
        </div>

        {/* 操作区：padding 24px, flex-end, gap 24px, 上边框 */}
        <div className="flex h-[80px] w-full items-center justify-end gap-[24px] border-t border-[#f2f2f2] px-[24px]">
          <DialogClose asChild>
            <button
              type="button"
              className="cursor-pointer rounded-[4px] px-[4px] py-[3px] text-[14px] font-normal leading-[22px] tracking-[0.014px] text-[rgba(0,0,0,0.6)] hover:bg-[#f7f7f7]"
            >
              取消
            </button>
          </DialogClose>
          <button
            type="button"
            disabled={!prompt.trim()}
            onClick={() => {
              onCreate(schedule, prompt.trim(), attachments, newSessionEachRun);
              // 附件已带进新会话，预览地址还要继续用，不能回收
              clearAttachments(false);
              onOpenChange(false);
            }}
            className="cursor-pointer rounded-[4px] bg-[#1e63f5] px-[16px] py-[5px] text-[14px] font-normal leading-[22px] tracking-[0.014px] text-[rgba(255,255,255,0.98)] hover:bg-[#1554d1] disabled:cursor-not-allowed disabled:bg-[#99c3ff] disabled:text-[rgba(255,255,255,0.55)] disabled:hover:bg-[#99c3ff]"
          >
            创建
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// 「选择日」日历面板（Figma 组件 9849:42119 / 实例 9867:62728，见节点 9783:70498）
// 排期「每年」的月日 chip 与高级设置「指定时间」的 DatePicker 共用这一个组件。
// 面板：288 宽 / padding 16 / 区块间距 16 / r8 / 无描边 / shadow 0 0 12 rgba(0,0,0,.08)
// 头部 ‹ YYYY年MM月 ›：左右各一枚 16×16 单箭头（left-small / right-small，black .38），
//   年月文案 Medium/T3（16/24，black .88）居中占满剩余宽度，逐月翻页并跨年进位
// 分隔线 1px #F2F2F2
// 星期表头 日 一 二 三 四 五 六（周日为一周首日）：12/18 black .26，7 等分列、列间距 4
// 日期网格：每行 7 格等分、行间距 16，数字固定在 28×28 内居中（Regular/T2，14/22，black .88）
// 今天（9421:108344）：数字变 #1E63F5；选中（9421:108343）：28px 胶囊 #1E63F5 / r32 / 文字 rgba(255,255,255,.9)
// 设计稿里日期是 1~31 顺序占位，这里按真实年月排布，月初偏移与月末补位留空以保持网格对齐。
// ============================================================================

export { CreateAutomationDialog };
