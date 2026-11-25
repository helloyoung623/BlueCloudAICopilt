import { useEffect, useState } from "react";
import { DotField } from "./dot-field";
import { ChishShader } from "./chish-shader";

const INTRO_KEY = "home-bg-intro-last";
const INTRO_INTERVAL = 2 * 60 * 60 * 1000; // 开场动效间隔：2 小时

/** 距上次播放是否已超过 2 小时（决定本次进首页要不要播开场动效） */
function shouldPlayIntro(): boolean {
  try {
    const last = Number(localStorage.getItem(INTRO_KEY) || 0);
    return Date.now() - last >= INTRO_INTERVAL;
  } catch {
    return true;
  }
}

function markIntroPlayed() {
  try {
    localStorage.setItem(INTRO_KEY, String(Date.now()));
  } catch {
    /* localStorage 不可用时每次都播 */
  }
}

/**
 * 首页背景层（挂在主内容区最外层，absolute inset-0 盖满含顶栏的整个区域）：
 * - 开场（2 小时内只播一次）：ChishShader 光效（用户 @chish · OpenShaders 提供，light 白底，
 *   wrapper 透明度 18%）垫底，小圆点白色 #ffffff；5s 后 shader 600ms 淡出并卸载（释放 GPU），
 *   小圆点变灰。
 * - 非「新任务」首页 / 2 小时内再次进入：不播开场，直接灰点常驻。
 * - 小圆点每次出现都从透明度 0% → 100% 淡入 500ms。
 * 负 z-index：位于主区白底之上、所有页面内容之下。仅首页挂载，其他页面不渲染。
 */
export function HomeBackground() {
  const [phase, setPhase] = useState<"showing" | "fading" | "done">(() => {
    if (!shouldPlayIntro()) return "done";
    markIntroPlayed();
    return "showing";
  });

  useEffect(() => {
    if (phase === "done") return; // 2 小时内再次进入：不播开场
    const fadeTimer = window.setTimeout(() => setPhase("fading"), 5000);
    const doneTimer = window.setTimeout(() => setPhase("done"), 5600);
    return () => { window.clearTimeout(fadeTimer); window.clearTimeout(doneTimer); };
  }, []);

  return (
    <>
      {phase !== "done" && (
        <div aria-hidden className={`absolute inset-0 -z-20 transition-opacity duration-[600ms] ease-out ${phase === "fading" ? "opacity-0" : "opacity-[0.18]"}`}>
          <ChishShader theme="light" background={{ light: "#ffffff" }} onError={() => setPhase("done")} />
        </div>
      )}
      {/* 小圆点出现时从透明度 0% 淡入到 100%（500ms） */}
      <div aria-hidden className="absolute inset-0 -z-10 animate-[dot-fade-in_500ms_ease-out_both]">
        <DotField dotColor={phase === "done" ? "#000000" : "#ffffff"} />
      </div>
    </>
  );
}
