import { useMemo } from "react";
import { GradientAvatar } from "@outpacelabs/avatars";

/**
 * 用户头像（@outpacelabs/avatars，Dither 风格）。
 *
 * 每个用户随机分配一个 seed：首次遇到该用户名时随机生成，之后存 localStorage，
 * 所以同一个人每次进来看到的都是同一个头像，换浏览器 / 清缓存才会重新抽。
 */
const STORAGE_KEY = "wb:user-avatar-seeds";

type SeedMap = Record<string, number>;

const readSeeds = (): SeedMap => {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : null;
    return parsed && typeof parsed === "object" ? (parsed as SeedMap) : {};
  } catch {
    return {};
  }
};

const writeSeeds = (seeds: SeedMap) => {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(seeds));
  } catch {
    // 无痕模式写不进去：退化为本次会话内随机，不影响显示
  }
};

export function getUserAvatarSeed(name: string): number {
  const key = name.trim();
  if (!key) return 0;
  const seeds = readSeeds();
  const existing = seeds[key];
  if (typeof existing === "number" && Number.isFinite(existing)) return existing;
  // 32 位种子：不同用户几乎不可能撞同一个头像
  const seed = Math.floor(Math.random() * 0x100000000);
  writeSeeds({ ...seeds, [key]: seed });
  return seed;
}

export function UserAvatar({
  name,
  size = 24,
  className,
  seed: seedProp,
}: {
  name: string;
  size?: number;
  className?: string;
  /** 直接指定种子（当前用户头像来自 user-profile，走这条）；不传则按 name 分配 */
  seed?: number;
}) {
  const seed = useMemo(
    () => (typeof seedProp === "number" ? seedProp : getUserAvatarSeed(name)),
    [name, seedProp],
  );
  return (
    <GradientAvatar
      seed={seed}
      size={size}
      pattern="dither"
      radius="9999px"
      className={className}
    />
  );
}
