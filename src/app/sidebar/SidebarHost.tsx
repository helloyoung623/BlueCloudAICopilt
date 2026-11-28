import type { ComponentProps } from "react";
import { SheetContent, SheetTitle } from "../components/ui/sheet";
import { Sidebar } from "./Sidebar";
import { SIDEBAR_WIDTH_WIDE } from "./sidebar-width";

// 侧栏在两层之间：会话域（任务投影 / 活动会话 / 执行中 / 未读）由 ConversationDomainProvider
// 直接提供给 Sidebar，这里只承接「桌面常驻 / 移动端抽屉」两种装载方式，原来的条件与文案原样保留。
// Sheet 根仍在 App（它包住整个页面）。
type Props = ComponentProps<typeof Sidebar> & {
  isMobile: boolean;
  sidebarOpen: boolean;
};

export function SidebarHost({ isMobile, sidebarOpen, ...sidebarProps }: Props) {
  const sidebar = <Sidebar {...sidebarProps} mobile={isMobile} />;

  return (
    <>
      {!isMobile && sidebarOpen && sidebar}
      {isMobile && (
        <SheetContent
          side="left"
          aria-describedby={undefined}
          className="max-w-full gap-0 border-0 p-0 shadow-none [&>button]:hidden"
          style={{ width: SIDEBAR_WIDTH_WIDE }}
        >
          <SheetTitle className="sr-only">导航</SheetTitle>
          {sidebar}
        </SheetContent>
      )}
    </>
  );
}
