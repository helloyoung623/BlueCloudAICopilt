import { endOfDay, format, startOfDay, subDays } from "date-fns";

// 文件筛选：资料库与项目「来源 / 产物」共用同一套字段与交互。
// 纯逻辑独立成 .ts，组件与测试共用同一份判定，避免 UI 改动影响口径。
export type FileFormat = "文档" | "表格" | "文件夹" | "其他";
export type FileStatus = "enabled" | "disabled";
export const FILE_STATUS_OPTIONS: { value: FileStatus; label: string }[] = [
  { value: "enabled", label: "已启用" },
  { value: "disabled", label: "停用" },
];
export type TimeFilter =
  | { kind: "recent"; days: 7 | 30 }
  | { kind: "custom"; from: Date; to: Date }
  | null;

export type UploaderFilter = { mine: boolean; members: string[] };
export const EMPTY_UPLOADER_FILTER: UploaderFilter = { mine: false, members: [] };
export const SELF_OWNER = "我";

export const FILE_FORMATS: FileFormat[] = ["文档", "表格", "其他"];
export const CLOUD_FORMATS: FileFormat[] = ["文档", "表格", "文件夹", "其他"];

const OWNER_COLORS = ["#1e63f5", "#00bfc4", "#00c853", "#ff2442", "#ffcc00", "#9254ff"];
export function ownerColor(name: string) {
  let hash = 0;
  for (const char of name) hash = (hash * 31 + (char.codePointAt(0) ?? 0)) >>> 0;
  return OWNER_COLORS[hash % OWNER_COLORS.length];
}

export function isUploaderFilterActive(filter?: UploaderFilter) {
  return Boolean(filter && (filter.mine || filter.members.length > 0));
}

export function describeUploaders(members: string[]) {
  if (members.length === 0) return "";
  if (members.length === 1) return members[0];
  if (members.length === 2) return `${members[0]}、${members[1]}`;
  return `${members[0]}、${members[1]}等 ${members.length}人`;
}

export function formatByExtension(name: string): FileFormat {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "pdf" || ["doc", "docx"].includes(ext)) return "文档";
  if (["xls", "xlsx", "csv"].includes(ext)) return "表格";
  return "其他";
}

export function displayDate(date: Date) {
  return format(date, "yyyy.M.d");
}

export function hasActiveFileFilters(formats: FileFormat[], timeFilter: TimeFilter, uploader?: UploaderFilter, statuses?: FileStatus[]) {
  return formats.length > 0 || timeFilter !== null || isUploaderFilterActive(uploader) || Boolean(statuses?.length);
}

// 名称 / 状态 / 格式 / 上传人 / 更新时间 五项命中判定，资料库与项目文件列表共用。
export function matchFileFilters(
  file: { name: string; format: FileFormat; modified: Date; owner?: string; status?: FileStatus },
  options: { query?: string; formats: FileFormat[]; timeFilter: TimeFilter; uploader?: UploaderFilter; statuses?: FileStatus[] },
) {
  const query = options.query?.trim().toLocaleLowerCase() ?? "";
  if (query && !file.name.toLocaleLowerCase().includes(query)) return false;
  if (options.formats.length && !options.formats.includes(file.format)) return false;
  if (options.statuses?.length && (!file.status || !options.statuses.includes(file.status))) return false;
  const uploader = options.uploader;
  if (isUploaderFilterActive(uploader) && uploader) {
    const mine = uploader.mine && file.owner === SELF_OWNER;
    const picked = uploader.members.length > 0 && Boolean(file.owner) && uploader.members.includes(file.owner as string);
    if (!mine && !picked) return false;
  }
  const { timeFilter } = options;
  if (!timeFilter) return true;
  const today = startOfDay(new Date());
  const from = timeFilter.kind === "recent" ? subDays(today, timeFilter.days - 1) : timeFilter.from;
  const to = timeFilter.kind === "recent" ? today : timeFilter.to;
  return file.modified >= startOfDay(from) && file.modified <= endOfDay(to);
}
