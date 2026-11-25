import { useSyncExternalStore } from "react";

/**
 * 本地用户档案。
 *
 * 阶段一（当前）：没有真实登录。每次登录成功都会随机生成一个中文名 + 一个头像种子，
 * 存进 localStorage，所以刷新、重开页面看到的都是同一个人；重新登录会换一个新身份。
 *
 * 阶段二（接入微软 / 谷歌登录后）：在 OAuth 回调里调用 setAccountProfile({ displayName })，
 * 名字与头像换成真实账号的，并把 source 标为 "account"。UI 侧只认 useUserProfile()，
 * 不需要改任何展示代码。
 */
export type UserProfile = {
  /** 本地档案 id；接入真实登录后可用它映射到 userId */
  id: string;
  displayName: string;
  avatarSeed: number;
  /** local = 本地随机身份；account = 真实登录身份 */
  source: "local" | "account";
};

const STORAGE_KEY = "wb:user-profile";

const SURNAMES = [
  "王", "李", "张", "刘", "陈", "杨", "黄", "赵", "吴", "周",
  "徐", "孙", "马", "朱", "胡", "郭", "何", "高", "林", "罗",
  "郑", "梁", "谢", "宋", "唐", "许", "韩", "冯", "邓", "曹",
  "彭", "曾", "肖", "田", "董", "袁", "潘", "于", "蒋", "蔡",
  "余", "杜", "叶", "程", "苏", "魏", "吕", "丁", "任", "沈",
  "姚", "卢", "姜", "崔", "钟", "谭", "陆", "汪", "范", "金",
  "石", "廖", "贾", "夏", "韦", "方", "白", "邹", "孟", "熊",
  "秦", "邱", "江", "尹", "薛", "段", "雷", "侯", "龙", "史",
  "陶", "黎", "贺", "顾", "毛", "郝", "龚", "邵", "万", "钱",
  "严", "武", "戴", "莫", "孔", "向", "汤",
] as const;

const GIVEN_NAMES = [
  "子", "涵", "宇", "轩", "然", "嘉", "铭", "昊", "思", "雨",
  "晨", "博", "文", "睿", "一", "诺", "梓", "沐", "清", "知",
  "远", "安", "宁", "和", "星", "亦", "舟", "朗", "昀", "恬",
  "瑶", "舒", "言", "墨", "锦", "辞", "意", "恒", "骁", "珂",
  "瑾", "渝", "禾", "屿", "弈", "妍", "婧", "琬", "仪", "瑄",
  "芷", "荞", "悦", "欣", "可", "心", "若", "彤", "依", "朵",
] as const;

let cache: UserProfile | null = null;
const listeners = new Set<() => void>();

const emit = () => {
  listeners.forEach((listener) => listener());
};

const pick = <T,>(list: readonly T[]): T => list[Math.floor(Math.random() * list.length)];

function randomId(): string {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
  } catch {
    // 非安全上下文没有 randomUUID，走下面的兜底
  }
  return `local-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function randomAvatarSeed(): number {
  return Math.floor(Math.random() * 0x100000000);
}

/** 随机中文姓名：约 1/3 单字名、2/3 双字名，姓与名都是常见的字，读起来像真人。 */
function randomName(): string {
  const surname = pick(SURNAMES);
  const first = pick(GIVEN_NAMES);
  if (Math.random() < 0.35) return `${surname}${first}`;
  let second = pick(GIVEN_NAMES);
  let guard = 0;
  while (second === first && guard < 8) {
    second = pick(GIVEN_NAMES);
    guard += 1;
  }
  return `${surname}${first}${second}`;
}

function createProfile(): UserProfile {
  return {
    id: randomId(),
    displayName: randomName(),
    avatarSeed: randomAvatarSeed(),
    source: "local",
  };
}

function persist(profile: UserProfile) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
  } catch {
    // 无痕模式写不进去：本次会话内仍然可用，只是重开页面会换一个身份
  }
}

/** 读取当前档案；没有（或损坏）就当场生成一个并落盘。结果在内存里缓存，引用保持稳定。 */
export function readUserProfile(): UserProfile {
  if (cache) return cache;
  let parsed: Partial<UserProfile> | null = null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    parsed = raw ? (JSON.parse(raw) as Partial<UserProfile>) : null;
  } catch {
    parsed = null;
  }
  if (parsed && typeof parsed.displayName === "string" && parsed.displayName.trim()) {
    cache = {
      id: typeof parsed.id === "string" && parsed.id ? parsed.id : randomId(),
      displayName: parsed.displayName,
      avatarSeed:
        typeof parsed.avatarSeed === "number" && Number.isFinite(parsed.avatarSeed)
          ? parsed.avatarSeed
          : randomAvatarSeed(),
      source: parsed.source === "account" ? "account" : "local",
    };
    return cache;
  }
  cache = createProfile();
  persist(cache);
  return cache;
}

function setProfile(next: UserProfile): UserProfile {
  cache = next;
  persist(next);
  emit();
  return next;
}

/** 登录成功时调用：换一个全新的本地身份（名字、头像一起换）。 */
export function resetUserProfile(): UserProfile {
  return setProfile(createProfile());
}

/**
 * 接入真实登录后调用：用账号里的名字（和可选头像）覆盖本地随机身份。
 * 例：setAccountProfile({ displayName: account.name })
 */
export function setAccountProfile(input: {
  displayName: string;
  avatarSeed?: number;
  id?: string;
}): UserProfile {
  const current = readUserProfile();
  return setProfile({
    id: input.id ?? current.id,
    displayName: input.displayName.trim() || current.displayName,
    avatarSeed: input.avatarSeed ?? randomAvatarSeed(),
    source: "account",
  });
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

/** 组件里统一的取值方式：名字或头像变了会自动重渲染。 */
export function useUserProfile(): UserProfile {
  return useSyncExternalStore(subscribe, readUserProfile, readUserProfile);
}
