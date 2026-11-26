export type PptStage = "idle" | "requirement" | "outline_generating" | "outline" | "ppt_generating" | "preview";
export type PptMode = "标准" | "PowerPoint";
export type PptPageCount = "智能匹配" | "5～8页" | "8～12页" | "12～18页";

export type OutlinePageContent =
  | { type: "text"; text: string }
  | { type: "list"; items: string[] };

export type OutlinePage = { id: number; pageLabel: string; title: string; content: OutlinePageContent };
