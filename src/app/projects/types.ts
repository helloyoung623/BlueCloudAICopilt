import type { FileStatus } from "../components/file-filter";
import type { ProjectMember } from "../components/project-settings-dialogs";

// 状态口径与筛选「状态」字段共用一套（file-filter 的 FileStatus）
export type SourceStatus = FileStatus;
export type ProjectFile = {
  id: string;
  name: string;
  owner: string;
  createdAt: number;
  status: SourceStatus;
} & ({ blob: Blob; url?: never; size?: never } | { url: string; size: number; blob?: never });
export type ProjectFiles = { sources: ProjectFile[]; artifacts: ProjectFile[] };

export type ProjectItem = {
  id: number;
  name: string;
  description?: string;
  instruction: string;
  pinned?: boolean;
  members?: ProjectMember[];
  files?: ProjectFiles;
  owner?: string;
  archived?: boolean;
};
