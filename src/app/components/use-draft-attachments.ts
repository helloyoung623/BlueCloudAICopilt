import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  MAX_ATTACHMENTS,
  getAttachmentExtension,
  getAttachmentValidationError,
  readFileMeta,
  readVirtualFile,
} from "./attachment-tray";
import type { ChatAttachment } from "./attachment-tray";

// ============================================================================
// 弹窗内的附件草稿（自动化任务弹窗「就」的 + 用）
// 规则与输入框完全一致：格式/大小/空文件/数量上限校验、上传→解析→就绪的状态流转、
// 云盘站点与文件夹等虚拟条目直接就绪、移除时回收预览地址。
// 输入框那一套挂在 App 上（要跨页面保留草稿），这里独立成 hook 供弹窗使用。
// options.onChange 让「宿主已经有附件数据」的场景（如自动化任务详情栏）把变更写回去；
// options.initial 只在挂载时取一次，切换宿主用 reset。
// ============================================================================
export function useDraftAttachments(options: { initial?: ChatAttachment[]; onChange?: (next: ChatAttachment[]) => void } = {}) {
  const [attachments, setAttachments] = useState<ChatAttachment[]>(options.initial ?? []);
  const attachmentsRef = useRef<ChatAttachment[]>(options.initial ?? []);
  const uploadTimers = useRef(new Map<string, number>());
  const onChangeRef = useRef(options.onChange);
  onChangeRef.current = options.onChange;

  const replaceAttachments = useCallback((next: ChatAttachment[]) => {
    attachmentsRef.current = next;
    setAttachments(next);
    onChangeRef.current?.(next);
  }, []);

  // 换宿主（切换任务）时用：直接替换本地列表，不再回调 onChange，避免把旧列表写回新宿主
  const resetAttachments = useCallback((next: ChatAttachment[]) => {
    uploadTimers.current.forEach(timer => window.clearTimeout(timer));
    uploadTimers.current.clear();
    attachmentsRef.current = next;
    setAttachments(next);
  }, []);

  const addFiles = useCallback((files: File[]) => {
    const accepted: File[] = [];
    let unsupportedCount = 0;
    let oversizedCount = 0;
    let emptyCount = 0;
    let overLimitCount = 0;

    files.forEach(file => {
      if (readVirtualFile(file)) return;
      const validationError = getAttachmentValidationError(file);
      if (validationError === "format") {
        unsupportedCount += 1;
      } else if (validationError === "size") {
        oversizedCount += 1;
      } else if (validationError === "empty") {
        emptyCount += 1;
      } else if (attachmentsRef.current.length + accepted.length >= MAX_ATTACHMENTS) {
        overLimitCount += 1;
      } else {
        accepted.push(file);
      }
    });

    if (unsupportedCount) toast.error(`${unsupportedCount} 个文件的格式不支持`);
    if (oversizedCount) toast.error(`${oversizedCount} 个文件超过大小限制`);
    if (emptyCount) toast.error(`${emptyCount} 个空文件无法上传`);
    if (overLimitCount) toast.error(`最多上传 ${MAX_ATTACHMENTS} 个文件`);

    const added = accepted.map((file, index): ChatAttachment => {
      const extension = getAttachmentExtension(file.name);
      const image = ["png", "jpg", "jpeg"].includes(extension);
      const meta = readFileMeta(file);
      return {
        id: `${Date.now()}-${index}-${Math.random().toString(36).slice(2)}`,
        file,
        name: file.name,
        size: file.size,
        extension,
        image,
        ...(image ? { previewUrl: URL.createObjectURL(file) } : {}),
        status: "uploading",
        ...(meta?.badge ? { badge: meta.badge } : {}),
        ...(meta?.subtitle ? { subtitle: meta.subtitle } : {}),
      };
    });

    const virtuals = files.flatMap((file, index): ChatAttachment[] => {
      const virtual = readVirtualFile(file);
      if (!virtual) return [];
      if (attachmentsRef.current.some(item => item.name === file.name)) return [];
      if (attachmentsRef.current.length + added.length >= MAX_ATTACHMENTS) return [];
      const extension = getAttachmentExtension(file.name);
      return [{
        id: `virtual-${Date.now()}-${index}-${Math.random().toString(36).slice(2)}`,
        file,
        name: file.name,
        size: file.size,
        extension,
        image: false,
        status: "ready",
        icon: virtual.icon,
        subtitle: virtual.subtitle,
        ...(virtual.badge ? { badge: virtual.badge } : {}),
      }];
    });

    const next = [...added, ...virtuals];
    if (!next.length) return;
    replaceAttachments([...attachmentsRef.current, ...next]);

    // 上传中 → 解析中 → 就绪，与输入框的节奏一致（各 500ms）
    added.forEach(attachment => {
      const markProcessing = window.setTimeout(() => {
        uploadTimers.current.delete(attachment.id);
        replaceAttachments(attachmentsRef.current.map(item => (
          item.id === attachment.id ? { ...item, status: "processing" } : item
        )));
        const markReady = window.setTimeout(() => {
          uploadTimers.current.delete(attachment.id);
          replaceAttachments(attachmentsRef.current.map(item => (
            item.id === attachment.id ? { ...item, status: "ready" } : item
          )));
        }, 500);
        uploadTimers.current.set(attachment.id, markReady);
      }, 500);
      uploadTimers.current.set(attachment.id, markProcessing);
    });
  }, [replaceAttachments]);

  const removeAttachment = useCallback((id: string) => {
    const timer = uploadTimers.current.get(id);
    if (timer) window.clearTimeout(timer);
    uploadTimers.current.delete(id);
    const attachment = attachmentsRef.current.find(item => item.id === id);
    if (attachment?.previewUrl) URL.revokeObjectURL(attachment.previewUrl);
    replaceAttachments(attachmentsRef.current.filter(item => item.id !== id));
  }, [replaceAttachments]);

  // revokePreviews=false 用于「附件已交给上层（如带进新会话）」的场景：
  // 此时预览地址还要被消息里的图片继续使用，回收会把图弄成空白。
  const clearAttachments = useCallback((revokePreviews = true) => {
    uploadTimers.current.forEach(timer => window.clearTimeout(timer));
    uploadTimers.current.clear();
    if (revokePreviews) {
      attachmentsRef.current.forEach(attachment => {
        if (attachment.previewUrl) URL.revokeObjectURL(attachment.previewUrl);
      });
    }
    replaceAttachments([]);
  }, [replaceAttachments]);

  useEffect(() => () => {
    uploadTimers.current.forEach(timer => window.clearTimeout(timer));
    attachmentsRef.current.forEach(attachment => {
      if (attachment.previewUrl) URL.revokeObjectURL(attachment.previewUrl);
    });
  }, []);

  return { attachments, addFiles, removeAttachment, clearAttachments, resetAttachments };
}
