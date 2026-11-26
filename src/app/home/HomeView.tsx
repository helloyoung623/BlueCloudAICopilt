import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { motion } from "motion/react";
import { OperationMenu } from "../components/operation-menu";
import { HomeBackground } from "../components/home-background";
import { useUserProfile } from "../user-profile";
import { ChatInput } from "../chat/ChatInput";
import { AIIcon } from "../ppt/panels";
import type { PptMode, PptPageCount } from "../ppt/types";
import type { ChatAttachment } from "../components/attachment-tray";
import type { ProjectItem } from "../projects/types";
import { DEMO_PROJECT_FILES } from "../components/project-files";
import { CreateProjectDialog } from "../projects/ProjectViews";

function HomeProjectPicker({ projects, selectedProjectId, onSelectProject, onCreateProject }: {
  projects: ProjectItem[];
  selectedProjectId: number | null;
  onSelectProject: (id: number | null) => void;
  onCreateProject: (project: Omit<ProjectItem, "id">) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [createProjectOpen, setCreateProjectOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);
  const selectedProject = projects.find(project => project.id === selectedProjectId) ?? null;

  useEffect(() => {
    if (!menuOpen) return;
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (!pickerRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", closeOnOutsideClick);
    return () => document.removeEventListener("mousedown", closeOnOutsideClick);
  }, [menuOpen]);

  return (
    <>
      <div ref={pickerRef} className="relative w-full px-[16px]">
        {menuOpen && (
          <OperationMenu role="menu" gap={4} anchor={pickerRef.current?.querySelector("button") ?? null} className="flex w-[232px] flex-col overflow-y-auto rounded-[12px] border border-[#f2f2f2] bg-white px-[8px] py-[4px] shadow-[0_0_12px_rgba(0,0,0,0.08)]">
            <div className="flex max-h-[470px] w-full shrink-0 flex-col overflow-x-hidden overflow-y-auto py-[4px]">
              {projects.length === 0 && (
                <div className="shrink-0 rounded-[8px] px-[8px] py-[11px] text-[14px] font-normal leading-[22px] tracking-[0.014px] text-[rgba(0,0,0,0.38)]">
                  暂无项目
                </div>
              )}
              {projects.map(project => {
                const isSelected = selectedProjectId === project.id;
                return (
                  <button
                    key={project.id}
                    type="button"
                    role="menuitemradio"
                    aria-checked={isSelected}
                    onClick={() => {
                      onSelectProject(project.id);
                      setMenuOpen(false);
                    }}
                    className="flex w-full shrink-0 cursor-pointer items-center gap-[8px] rounded-[8px] px-[8px] py-[11px] text-left hover:bg-[#f7f7f7]"
                  >
                    <img src="/assets/d95df.svg" alt="" className="shrink-0" />
                    <span className={`min-w-0 flex-1 truncate text-[14px] leading-[22px] tracking-[0.014px] text-[rgba(0,0,0,0.88)] ${isSelected ? "font-medium" : "font-normal"}`}>
                      {project.name}
                    </span>
                    {isSelected && <img src="/assets/ecd73.svg" alt="" className="shrink-0" />}
                  </button>
                );
              })}
              <div className="relative h-0 w-full shrink-0">
                <img src="/assets/4b9c6.svg" alt="" className="absolute left-0 top-[-0.5px] max-w-none" />
              </div>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  setCreateProjectOpen(true);
                }}
                className="flex w-full shrink-0 cursor-pointer items-center gap-[8px] rounded-[8px] px-[8px] py-[11px] text-left hover:bg-[#f7f7f7]"
              >
                <img src="/assets/eede2.svg" alt="" className="shrink-0" />
                <span className="text-[14px] font-normal leading-[22px] tracking-[0.014px] text-[rgba(0,0,0,0.88)]">新建项目</span>
              </button>
              {selectedProject && <button
                type="button"
                role="menuitem"
                onClick={() => {
                  onSelectProject(null);
                  setMenuOpen(false);
                }}
                className="flex w-full shrink-0 cursor-pointer items-center gap-[8px] rounded-[8px] px-[8px] py-[11px] text-left hover:bg-[#f7f7f7]"
              >
                <img src="/assets/92b7f.svg" alt="" className="shrink-0" />
                <span className="text-[14px] font-normal leading-[22px] tracking-[0.014px] text-[rgba(0,0,0,0.88)]">不选择项目</span>
              </button>}
            </div>
          </OperationMenu>
        )}
        <div className="flex h-[40px] w-full items-center overflow-hidden rounded-t-[16px] bg-[#f7f7f7] py-[4px] pl-[8px] pr-[4px]">
          <button
            type="button"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen(open => !open)}
            className={`flex min-w-0 cursor-pointer items-center gap-[8px] rounded-full px-[8px] py-[4px] transition-colors ${menuOpen ? "bg-[#e6e6e6]" : "hover:bg-[#e6e6e6]"}`}
          >
            <img src={selectedProject ? "/assets/6bcaa.svg" : "/assets/658f1.svg"} alt="" className="shrink-0" />
            <span className={`truncate font-['PingFang_SC:Regular'] text-[14px] font-normal leading-[22px] tracking-[0.014px] ${selectedProject ? "text-[rgba(0,0,0,0.88)]" : "text-[rgba(0,0,0,0.6)]"}`}>
              {selectedProject?.name ?? "选择项目"}
            </span>
          </button>
        </div>
      </div>
      <CreateProjectDialog
        open={createProjectOpen}
        onOpenChange={setCreateProjectOpen}
        onCreate={onCreateProject}
      />
    </>
  );
}

// ── header ────────────────────────────────────────────────────────────────────


const SUGGESTIONS = ["找出近一周的邮件", "创建一个自动化任务，每天早上汇总未读邮件", "生成一份智能助手项目汇报PPT"];

// 推荐问题入场：淡入 + 上浮，位移逐颗加大形成视差层次（只走 transform/opacity，不占布局）
function suggestInStyle(shift: number, delay: number): CSSProperties {
  return {
    "--suggest-shift": `${shift}px`,
    animation: `suggestIn .52s cubic-bezier(.22,.61,.36,1) ${delay}s both`,
  } as unknown as CSSProperties;
}

function HomeView({ input, onInputChange, onSend, attachments, onAddFiles, onRemoveAttachment, pptGeneration, onPptGenerationChange, pptMode, onPptModeChange, pptPages, onPptPagesChange, projects, selectedProjectId, onSelectProject, onCreateProject, onOpenConnectors }: {
  input: string;
  onInputChange: (v: string) => void;
  onSend: (text?: string, attachments?: ChatAttachment[]) => void;
  attachments: ChatAttachment[];
  onAddFiles: (files: File[]) => void;
  onRemoveAttachment: (id: string) => void;
  pptGeneration: boolean; onPptGenerationChange: (selected: boolean) => void;
  pptMode: PptMode; onPptModeChange: (mode: PptMode) => void;
  pptPages: PptPageCount; onPptPagesChange: (pages: PptPageCount) => void;
  projects: ProjectItem[];
  selectedProjectId: number | null;
  onSelectProject: (id: number | null) => void;
  onCreateProject: (project: Omit<ProjectItem, "id">) => void;
  onOpenConnectors?: () => void;
}) {
  const selectedProject = projects.find(project => project.id === selectedProjectId);
  // 问候语里的名字：当前是本地随机身份，接入真实登录后自动变成账号名称
  const profile = useUserProfile();
  return (
    // 背景层（点阵 + 开场 shader）已上移到主内容区最外层的 HomeBackground（含顶栏整块），
    // 这里保持透明让背景透出，自身不再画任何背景。
    <div className="flex-1 min-h-0 bg-transparent flex flex-col overflow-hidden">
      <style>{`@keyframes suggestIn{0%{opacity:0;transform:translateY(var(--suggest-shift,14px)) scale(.98)}100%{opacity:1;transform:translateY(0) scale(1)}}
@media (prefers-reduced-motion: reduce){[data-suggest-in]{animation:none!important;opacity:1!important;transform:none!important}}`}</style>
      <div className="conversation-gutter relative flex-1 min-h-0">
        <div className="conversation-content relative mx-auto flex h-full min-h-0 w-full flex-col items-center pt-[clamp(16px,14vh,160px)] [@media(max-height:520px)]:pt-0">
          {/* 矮窗口（如预览面板约 400px 高）时，欢迎区可压缩滚动，保证底部输入框和发送按钮始终可见 */}
          <div className="flex min-h-0 w-full flex-1 flex-col items-center overflow-y-auto [@media(max-height:520px)]:hidden">
          <div className="shrink-0 flex items-baseline gap-[8px] pb-[16px]">
            <span className="text-[46px] font-semibold leading-[56px] text-[rgba(0,0,0,0.88)] tracking-[0.046px]">Hi，{profile.displayName}</span>
          </div>
          <div className="flex flex-col items-center w-full">
            <div className="shrink-0 flex items-center gap-[8px] pt-[32px] pb-[20px]" data-suggest-in style={suggestInStyle(8, 0)}>
              <svg width="80" height="1" viewBox="0 0 80 1" fill="none"><path d="M0 0.5H80" stroke="url(#gl)" /><defs><linearGradient id="gl" x1="0" y1="1" x2="80" y2="1" gradientUnits="userSpaceOnUse"><stop stopOpacity="0" /><stop offset="1" stopOpacity="0.3" /></linearGradient></defs></svg>
              <span className="text-[14px] leading-[22px] text-[rgba(0,0,0,0.38)] whitespace-nowrap">试试这些</span>
              <svg width="80" height="1" viewBox="0 0 80 1" fill="none"><path d="M0 0.5H80" stroke="url(#gr)" /><defs><linearGradient id="gr" x1="0" y1="1" x2="80" y2="1" gradientUnits="userSpaceOnUse"><stop stopOpacity="0.3" /><stop offset="1" stopOpacity="0" /></linearGradient></defs></svg>
            </div>
            <div className="shrink-0 flex flex-wrap items-center justify-center gap-[12px]">
              {SUGGESTIONS.map((s, i) => (
                <button key={s} onClick={() => onSend(s)} data-suggest-in style={suggestInStyle(18 + i * 7, 0.08 + i * 0.075)} className="flex items-center gap-[10px] px-[8px] py-[8px] bg-[#f7f7f7] hover:bg-[#e6e6e6] rounded-[8px] transition-colors cursor-pointer">
                  <AIIcon uid={`s${i}`} />
                  <span className="text-[14px] leading-[22px] text-[rgba(0,0,0,0.88)] whitespace-nowrap font-normal">{s}</span>
                </button>
              ))}
            </div>
          </div>
          </div>
          <div className="mt-auto w-full shrink-0 shadow-none">
            <HomeProjectPicker
              projects={projects}
              selectedProjectId={selectedProjectId}
              onSelectProject={onSelectProject}
              onCreateProject={onCreateProject}
            />
            <ChatInput
              value={input}
              hasProject={Boolean(selectedProject)}
              projectFiles={selectedProject ? selectedProject.files ?? DEMO_PROJECT_FILES : undefined}
              onChange={onInputChange}
              onSend={onSend}
              attachments={attachments}
              onAddFiles={onAddFiles}
              onRemoveAttachment={onRemoveAttachment}
              pptGeneration={pptGeneration}
              onPptGenerationChange={onPptGenerationChange}
              pptMode={pptMode}
              onPptModeChange={onPptModeChange}
              pptPages={pptPages}
              onPptPagesChange={onPptPagesChange}
              onOpenConnectors={onOpenConnectors}
            />
          </div>
        </div>
      </div>
      <div className="flex h-[22px] shrink-0 items-center justify-center p-[4px] opacity-0">
        <span className="text-[10px] text-[rgba(0,0,0,0.26)]">内容由AI生成，仅供参考</span>
      </div>
    </div>
  );
}


// Figma 9244:31238「移交项目」确认弹窗：选择人员后先确认，点确定才真正移交

export { HomeView };
