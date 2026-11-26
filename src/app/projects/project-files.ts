import type { ProjectFile, ProjectFiles } from "../components/project-files.ts";
import type { ImportTask } from "../components/import-task-panel.tsx";
import type { CloudSourceTab } from "../components/select-file-dialog.tsx";

export const DEMO_FILE_URL = "/assets/attachment-example.jpeg";

const SIZE_UNITS = { B: 1, KB: 1024, MB: 1024 ** 2, GB: 1024 ** 3 } as const;

// 「2.9MB / 860KB」这类展示用文案 → 字节数；无法识别时用 2MB 兜底。
export function parseFileSize(size: string) {
  const match = /^([\d.]+)\s*(B|KB|MB|GB)$/i.exec(size.trim());
  if (!match) return 2 * 1024 * 1024;
  const unit = match[2].toUpperCase() as keyof typeof SIZE_UNITS;
  return Math.max(1, Math.round(Number.parseFloat(match[1]) * (SIZE_UNITS[unit] ?? SIZE_UNITS.MB)));
}

// 云来源（OneDrive / Outlook / SharePoint / 产物）选择文件后加入「来源」。
export function createCloudSourceFiles(files: { name: string; size: number }[]): ProjectFile[] {
  return files.map(file => ({
    id: crypto.randomUUID(),
    name: file.name,
    url: DEMO_FILE_URL,
    size: file.size,
    owner: "我",
    createdAt: Date.now(),
    status: "enabled",
  }));
}

// 导入完成的文件写入目标项目「来源」；其它项目保持原对象不变。
export function addSourcesToProject<T extends ProjectItemLike>(
  projects: readonly T[],
  files: { name: string; size: number }[],
  projectId: number,
  fallbackFiles: ProjectFiles,
): T[] {
  return projects.map(project => {
    if (project.id !== projectId) return project;
    const base = project.files ?? fallbackFiles;
    return { ...project, files: { ...base, sources: [...base.sources, ...createCloudSourceFiles(files)] } };
  });
}

type ProjectItemLike = { id: number; files?: ProjectFiles };

// 导入批次：保留原演示口径——第 2 个解析失败、第 4 个上传失败，其余上传中。
// now/random 可注入，方便测试断言，不改动线上行为。
export function buildImportTasks(
  files: { name: string; size: number }[],
  source: CloudSourceTab,
  projectId: number,
  options: { now?: () => number; random?: () => number } = {},
): ImportTask[] {
  const now = options.now ?? Date.now;
  const random = options.random ?? Math.random;
  const badge = source === "OneDrive" ? "/assets/badge-onedrive.svg"
    : source === "SharePoint" ? "/assets/badge-sharepoint.svg"
      : undefined;

  return files.map((file, index) => {
    const failed = index === 1
      ? { status: "failed" as const, failKind: "parse" as const }
      : index === 3 ? { status: "failed" as const, failKind: "upload" as const } : null;
    return {
      id: `import-${now()}-${index}-${random().toString(36).slice(2, 7)}`,
      name: file.name,
      size: file.size,
      projectId,
      ...(badge ? { badge } : {}),
      ...(failed ?? { status: "uploading" as const }),
    };
  });
}
