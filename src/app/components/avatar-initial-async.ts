import { useEffect, useState } from "react";

/**
 * 头像首字（异步版）。
 *
 * 同步版 getAvatarInitial 保留原 API 供单测使用，但 UI 不再引用它：
 * 那样 pinyin-pro 的静态 import 会被 Rollup 摇掉，只在异步 chunk 中存在。
 *
 * 这里只在「首字符是汉字」时才动态加载拼音库；加载结果与失败状态都做模块级缓存，
 * 因此拼音库最多请求一次，失败后保留汉字占位、不重试、不抛错。
 */

type PinyinFn = (text: string, options: { pattern: "first"; toneType: "none" }) => string;
type PinyinLoader = () => Promise<PinyinFn>;

export type AvatarInitialResolver = {
  /** 返回最终首字母；非汉字立即返回，汉字在库就绪后返回拼音首字母，失败返回汉字占位 */
  resolve: (name: string) => Promise<string>;
};

const firstCharOf = (name: string): string => Array.from(name.trim())[0] ?? "";
const isHan = (char: string): boolean => /\p{Script=Han}/u.test(char);

/** 同步占位：汉字保留自身，其余沿用同步版规则（首字符大写） */
export function getAvatarInitialPlaceholder(name: string): string {
  const first = firstCharOf(name);
  return isHan(first) ? first : first.toUpperCase();
}

/**
 * 可注入 loader 的解析器工厂。生产用真实动态 import；单测注入 mock 或失败的 loader。
 * 缓存位于闭包内，工厂只调用一次，等价于模块级缓存。
 */
export function createAvatarInitialResolver(loadPinyin: PinyinLoader): AvatarInitialResolver {
  let pinyinPromise: Promise<PinyinFn | null> | null = null;
  const resolved = new Map<string, string>();

  const ensurePinyin = (): Promise<PinyinFn | null> => {
    if (!pinyinPromise) {
      // 失败也缓存成 null，避免反复重试
      pinyinPromise = Promise.resolve()
        .then(loadPinyin)
        .catch(() => null);
    }
    return pinyinPromise;
  };

  return {
    resolve(name) {
      const first = firstCharOf(name);
      if (!first || !isHan(first)) return Promise.resolve(getAvatarInitialPlaceholder(name));

      const cached = resolved.get(first);
      if (cached !== undefined) return Promise.resolve(cached);

      return ensurePinyin().then(pinyin => {
        if (!pinyin) return first; // 加载失败：保留汉字占位
        let initial = "";
        try {
          initial = pinyin(first, { pattern: "first", toneType: "none" }).toUpperCase();
        } catch {
          initial = "";
        }
        if (!initial) return first;
        resolved.set(first, initial);
        return initial;
      });
    },
  };
}

/** 生产单例：首次遇到汉字名字时才真正下载拼音库 */
const resolver = createAvatarInitialResolver(() =>
  import("pinyin-pro").then(mod => mod.pinyin as PinyinFn),
);

/** UI 用：同步返回占位，拼音库就绪后更新为首字母 */
export function useAvatarInitial(name: string): string {
  const [value, setValue] = useState(() => getAvatarInitialPlaceholder(name));

  useEffect(() => {
    let active = true;
    const first = firstCharOf(name);
    if (!first || !isHan(first)) {
      // 非汉字：立即给出最终结果，不加载拼音库
      setValue(first.toUpperCase());
      return;
    }
    setValue(first); // name 变化时先回到占位
    void resolver.resolve(name).then(next => {
      if (active) setValue(next);
    });
    return () => { active = false; };
  }, [name]);

  return value;
}
