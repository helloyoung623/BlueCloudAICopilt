import { useCallback, useEffect, useRef, useState } from "react";
import ShapeWaves from "./components/shape-waves";
import { resetUserProfile } from "./user-profile";
import "./login-page.css";

/**
 * 登录页。
 * 宽屏（≥800px）：Figma 572:153，居中玻璃卡片。
 * 窄屏（<800px）：Figma 244:216，品牌区在上、操作区贴底的两段式布局。
 * 背景由 ShapeWaves 生成：灰色三角点阵，鼠标划过亮成品牌蓝。
 */
export default function LoginPage() {
  // 设计稿中协议勾选框为已选状态（CheckBox Icon · Status=Selected）
  const [agreed, setAgreed] = useState(true);
  // 窄屏（<800px）点阵用更浅的灰，与两段式布局的留白更搭
  const [narrow, setNarrow] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(max-width: 799px)").matches,
  );
  const [loading, setLoading] = useState(false);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    document.title = "登录 · 世纪互联办公智能体";
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, []);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 799px)");
    const onChange = () => setNarrow(mq.matches);
    onChange();
    mq.addEventListener?.("change", onChange);
    return () => mq.removeEventListener?.("change", onChange);
  }, []);

  const handleLogin = useCallback(() => {
    if (loading || !agreed) return;
    setLoading(true);
    // 演示用：真实环境这里跳转 Microsoft OAuth，成功回调后再进产品
    timerRef.current = window.setTimeout(() => {
      // 每次登录成功都换一个本地随机身份（名字 + 头像）。
      // 接入真实微软登录后，这里改成 setAccountProfile({ displayName: account.name })。
      resetUserProfile();
      // 跳转后由 App 弹「登录成功」（页面已换，只能用 sessionStorage 传递）
      try {
        window.sessionStorage.setItem("wb:login-success", "1");
      } catch {
        // 隐私模式忽略
      }
      window.location.href = "/";
    }, 1200);
  }, [agreed, loading]);

  // idle：可点击；loading：跳转中；locked：未同意协议（Figma 270:46 禁用态）
  const state = loading ? "loading" : agreed ? "idle" : "locked";

  return (
    <div className="login-page">
      <div className="login-page__bg">
        <ShapeWaves
          text=""
          fontFamily={'Geist, "Geist Sans", system-ui, sans-serif'}
          fontWeight={500}
          textSize={0.6}
          shapes="triangles"
          cellSize={10}
          dotSize={0.75}
          color={narrow ? "#cacaca" : "#8a8a8a"}
          hoverColor="#1e63f5"
          backgroundColor="#ffffff"
          speed={1}
          scale={1}
          contrast={1}
          brightness={0.4}
          flow={0}
          direction={0}
          fade={0.25}
          interactive
          splashRadius={40}
          splashStrength={0.4}
          glow={0.35}
          intro
          introDuration={1.6}
          paused={false}
        />
      </div>

      <div className="login-card">
        <h1 className="login-card__title">欢迎登录</h1>

        <div className="login-card__brand">
          <img className="login-card__mark" src="/assets/login/login-logo.svg" alt="" />
          <img
            className="login-card__wordmark"
            src="/assets/login/login-wordmark.svg"
            alt="世纪互联办公智能体"
          />
        </div>

        <div className="login-card__body">
          <button
            type="button"
            className="login-submit"
            data-state={state}
            onClick={handleLogin}
            disabled={state !== "idle"}
            aria-busy={loading}
          >
            {loading ? (
              <span className="login-submit__spinner" aria-hidden="true" />
            ) : (
              <img className="login-submit__icon" src="/assets/login/login-ms-icon.svg" alt="" />
            )}
            <span>{loading ? "登录中" : "使用微软账号登录"}</span>
          </button>

          <div className="login-agreement">
            <button
              type="button"
              className="login-check"
              role="checkbox"
              aria-checked={agreed}
              aria-label="同意用户协议和隐私政策"
              onClick={() => setAgreed((value) => !value)}
            >
              <span className="login-check__box">
                <img className="login-check__tick" src="/assets/login/login-checkbox-checked.svg" alt="" />
              </span>
            </button>

            <p className="login-agreement__text">
              请阅读并同意
              <button type="button" className="login-agreement__link">
                《用户协议》
              </button>
              和
              <button type="button" className="login-agreement__link">
                《隐私政策》
              </button>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
