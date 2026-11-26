// 资料库「没有匹配结果」时的空状态文案与恢复操作。
// 纯逻辑独立成 .ts，组件与测试共用同一份判定，避免文案和按钮口径漂移。
// 判定条件与列表过滤（matchFileFilters）保持一致：搜索按去首尾空格后的文本判定，
// 筛选是否生效复用 hasActiveFileFilters 的口径。

/** 恢复操作：只清搜索 / 只重置筛选 / 两者一起清除 */
export type LibraryRecoveryAction = "clear-search" | "reset-filters" | "clear-search-and-filters";

export type LibraryEmptyState = {
  /** 空状态标题 */
  title: string;
  /** 恢复操作；资料库本身没有文件时为 null（不显示没有意义的按钮） */
  recovery: { action: LibraryRecoveryAction; label: string } | null;
};

/**
 * 资料库没有匹配结果时该显示什么、给出哪个恢复操作。
 * @param totalCount 资料库里的文件总数
 * @param query 搜索框原文；去掉首尾空格后为空视为「没有搜索」
 * @param filtersActive 是否生效了筛选条件
 */
export function resolveLibraryEmptyState(input: {
  totalCount: number;
  query: string;
  filtersActive: boolean;
}): LibraryEmptyState {
  // 资料库本身没有任何文件：只说「暂无资料」，没有条件可以恢复
  if (input.totalCount === 0) return { title: "暂无资料", recovery: null };

  const searchActive = input.query.trim().length > 0;
  if (searchActive && input.filtersActive) {
    return {
      title: "没有符合搜索和筛选条件的资料",
      recovery: { action: "clear-search-and-filters", label: "清除搜索和筛选" },
    };
  }
  if (searchActive) {
    return { title: "未找到相关资料", recovery: { action: "clear-search", label: "清空搜索" } };
  }
  if (input.filtersActive) {
    return { title: "没有符合筛选条件的资料", recovery: { action: "reset-filters", label: "重置筛选" } };
  }
  // 既没有搜索也没有筛选：没有可恢复的条件，只给中性文案
  return { title: "暂无资料", recovery: null };
}
