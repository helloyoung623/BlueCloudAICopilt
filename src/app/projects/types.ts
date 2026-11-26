import type { ProjectFiles } from "../components/project-files";
import type { ProjectMember } from "../components/project-settings-dialogs";

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
