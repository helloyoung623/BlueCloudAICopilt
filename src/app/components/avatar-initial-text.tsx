import type { ReactElement } from "react";
import { useAvatarInitial } from "./avatar-initial-async";

/**
 * 只渲染头像首字母文字的组件。
 * 放在 members.map() 里使用，确保 hook 处于独立组件中而非循环里调用。
 * 外观由外层 span 决定，这里仅输出文本，画面与原来完全一致。
 */
export function AvatarInitialText({ name }: { name: string }): ReactElement {
  return <>{useAvatarInitial(name)}</>;
}
