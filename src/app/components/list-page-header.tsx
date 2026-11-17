import { useEffect, useRef, useState } from "react";

// 列表页共享组件（项目页 / 自动化任务页 / 资料库页复用同一套 Figma 组件、响应式规则与交互）
// Figma 9187:44647 / 9532:10168 / 9598:39360「Search Input」「Icon Button」

// 响应式搜索组件：
// ≥800px：256x32 搜索框常驻（放大镜 black 0.26 → #1C61F1 激活态，输入后出清空按钮）
// <800px：收起为 32x32 搜索按钮（hover #F2F2F2 / pressed #DCDCDC），点击展开输入框；
//         清空且失焦自动收起，点击 ✕ 清空时阻止 blur 误收起
export function ListPageSearch({ value, onValueChange, placeholder, ariaLabel, narrowPlaceholder = "搜索" }: {
  value: string;
  onValueChange: (value: string) => void;
  placeholder: string;
  ariaLabel: string;
  narrowPlaceholder?: string;
}) {
  const [focused, setFocused] = useState(false);
  const [open, setOpen] = useState(false);
  // 兜底：展开状态下内容被清空且输入框已失焦（如失焦后点击 ✕ 清空，onBlur 已错过）→ 自动收起。
  // 用 document.activeElement 实时判断，避免 autoFocus 与 focused 状态不同步时误收起
  const narrowSearchInputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (open && !value && document.activeElement !== narrowSearchInputRef.current) {
      setOpen(false);
    }
  }, [open, value]);
  const searchIcon = focused ? "/assets/search-dialog-search.svg" : "/assets/search-dialog-search-default.svg";
  return (
    <>
      <div className="ml-auto hidden h-[32px] w-[256px] shrink-0 items-center gap-[8px] rounded-[4px] bg-[#f7f7f7] pl-[8px] pr-[16px] min-[800px]:flex">
        <img src={searchIcon} alt="" className="size-[16px] shrink-0" />
        <input
          value={value}
          onChange={event => onValueChange(event.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder={placeholder}
          aria-label={ariaLabel}
          className="min-w-0 flex-1 bg-transparent font-normal text-[14px] leading-[22px] tracking-[0.014px] text-[rgba(0,0,0,0.88)] outline-none placeholder:text-[rgba(0,0,0,0.26)]"
        />
        {value && (
          <button
            type="button"
            aria-label="清空搜索"
            onClick={() => onValueChange("")}
            className="flex size-[16px] shrink-0 cursor-pointer items-center justify-center"
          >
            <img src="/assets/f802d.svg" alt="" className="size-[12px]" />
          </button>
        )}
      </div>
      <div className="flex min-w-0 flex-1 items-center justify-end gap-[12px] min-[800px]:hidden">
        {open ? (
          <div className="flex h-[32px] min-w-0 flex-1 items-center gap-[8px] rounded-[4px] bg-[#f7f7f7] pl-[8px] pr-[8px]">
            <img src={searchIcon} alt="" className="size-[16px] shrink-0" />
            <input
              ref={narrowSearchInputRef}
              autoFocus
              value={value}
              onChange={event => onValueChange(event.target.value)}
              onFocus={() => setFocused(true)}
              onBlur={() => {
                setFocused(false);
                if (!value) setOpen(false);
              }}
              placeholder={narrowPlaceholder}
              aria-label={ariaLabel}
              className="min-w-0 flex-1 bg-transparent font-normal text-[14px] leading-[22px] tracking-[0.014px] text-[rgba(0,0,0,0.88)] outline-none placeholder:text-[rgba(0,0,0,0.26)]"
            />
            {value && (
              <button
                type="button"
                aria-label="清空搜索"
                onMouseDown={event => event.preventDefault()}
                onClick={() => onValueChange("")}
                className="flex size-[16px] shrink-0 cursor-pointer items-center justify-center"
              >
                <img src="/assets/f802d.svg" alt="" className="size-[12px]" />
              </button>
            )}
          </div>
        ) : (
          <button
            type="button"
            aria-label={ariaLabel}
            onClick={() => setOpen(true)}
            className="flex size-[32px] shrink-0 cursor-pointer items-center justify-center rounded-[4px] hover:bg-[#f2f2f2] active:bg-[#dcdcdc]"
          >
            <img src="/assets/project-search-btn.svg" alt="" className="size-[20px]" />
          </button>
        )}
      </div>
    </>
  );
}

// 列表页页头：标题 20px/28 Medium + 共享搜索 + 操作按钮插槽（响应式由插槽内按钮自行控制）
export function ListPageHeader({ title, query, onQueryChange, searchPlaceholder, searchAriaLabel, narrowSearchPlaceholder, children }: {
  title: string;
  query: string;
  onQueryChange: (value: string) => void;
  searchPlaceholder: string;
  searchAriaLabel: string;
  narrowSearchPlaceholder?: string;
  children?: React.ReactNode;
}) {
  return (
    <header className="flex shrink-0 items-center gap-[12px] pb-[16px] pl-0 pr-0 pt-0">
      <h1 className="min-w-fit shrink-0 font-['PingFang_SC:Medium'] text-[20px] font-medium leading-[28px] tracking-[0.02px] text-[rgba(0,0,0,0.88)]">
        {title}
      </h1>
      <ListPageSearch
        value={query}
        onValueChange={onQueryChange}
        placeholder={searchPlaceholder}
        ariaLabel={searchAriaLabel}
        narrowPlaceholder={narrowSearchPlaceholder}
      />
      {children}
    </header>
  );
}
