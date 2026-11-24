import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { OperationMenu } from "./operation-menu";
import {
  connectConnector as storeConnect, disconnectConnector as storeDisconnect,
  CONNECTORS, orderedAvailable, orderedConnected, useConnectorState,
} from "./connectors-store";
import type { ConnectorInfo } from "./connectors-store";

// Figma 10118:87777 / 10126:98522 / 10122:98024 / 10122:98264
// 标题下 2 列卡片网格，不做分组；已连接排前、未连接排后。
// 卡片整体可点击：未连接 → 连接弹窗，已连接 → 详情弹窗。
// 右侧 + 保留原来的 loading → toast 连接；右侧 … 打开 160px 操作菜单。
function ConnectorCard({
  connector,
  connected,
  loading,
  onOpen,
  onConnect,
  onMoreClick,
}: {
  connector: ConnectorInfo;
  connected: boolean;
  loading: boolean;
  onOpen: () => void;
  onConnect: () => void;
  onMoreClick: (anchor: HTMLElement) => void;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`${connector.name}详情`}
      onClick={onOpen}
      onKeyDown={event => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpen();
        }
      }}
      className="flex h-[72px] min-w-0 cursor-pointer items-center gap-[12px] rounded-[12px] border border-[#e6e6e6] px-[12px] transition-colors hover:bg-[#e6e6e6] focus-visible:bg-[#e6e6e6] focus-visible:outline-none"
    >
      <div className="flex size-[48px] shrink-0 items-center justify-center rounded-[8px] bg-[#f7f7f7]">
        <img src={connector.icon} alt="" className="size-[24px]" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[14px] font-normal leading-[22px] tracking-[0.014px] text-[rgba(0,0,0,0.88)]">{connector.name}</p>
        <p className="truncate text-[12px] font-normal leading-[20px] tracking-[0.012px] text-[rgba(0,0,0,0.38)]">{connector.description}</p>
      </div>
      {connected ? (
        <button
          type="button"
          aria-label={`${connector.name}更多`}
          title="更多"
          onClick={event => { event.stopPropagation(); onMoreClick(event.currentTarget); }}
          className="flex size-[24px] shrink-0 cursor-pointer items-center justify-center rounded-[4px] bg-transparent hover:bg-[#e6e6e6] focus-visible:bg-[#e6e6e6]"
        >
          <img src="/assets/connector-more.svg" alt="" className="size-[16px]" />
        </button>
      ) : (
        <button
          type="button"
          aria-label={`添加${connector.name}`}
          title="添加"
          disabled={loading}
          onClick={event => { event.stopPropagation(); onConnect(); }}
          className="flex size-[24px] shrink-0 cursor-pointer items-center justify-center rounded-[4px] bg-transparent hover:bg-[#e6e6e6] focus-visible:bg-[#e6e6e6] disabled:cursor-default disabled:hover:bg-transparent"
        >
          {loading
            ? <span className="block size-[14px] animate-spin rounded-full border-2 border-[rgba(0,0,0,0.15)] border-t-[rgba(0,0,0,0.65)]" />
            : <img src="/assets/49891.svg" alt="" className="size-[16px]" />}
        </button>
      )}
    </div>
  );
}

// Figma 10122:98024（未连接）/ 10122:98264（已连接）
function ConnectorDialog({
  connector,
  connected,
  loading,
  onClose,
  onConnect,
  onDisconnect,
  onRevalidate,
}: {
  connector: ConnectorInfo;
  connected: boolean;
  loading: boolean;
  onClose: () => void;
  onConnect: () => void;
  onDisconnect: () => void;
  onRevalidate: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-[300] flex items-center justify-center bg-[rgba(0,0,0,0.5)]"
      onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="connector-dialog-title"
        className="relative flex w-[560px] max-w-[calc(100vw-32px)] flex-col items-center gap-[32px] rounded-[16px] bg-white p-[24px]"
      >
        <button
          type="button"
          aria-label="关闭"
          onClick={onClose}
          className="absolute right-[12px] top-[12px] flex size-[24px] cursor-pointer items-center justify-center rounded-[4px] bg-transparent hover:bg-[#e6e6e6] focus-visible:bg-[#e6e6e6]"
        >
          <img src="/assets/connector-modal-close.svg" alt="" className="size-[16px]" />
        </button>

        <div className="flex items-center gap-[16px]">
          {/* 左框：产品 logo；右框：要连接的连接器对象（Figma 10122:98024） */}
          <div className="flex size-[80px] shrink-0 items-center justify-center rounded-[12px] border border-[#e6e6e6] bg-white">
            <img src="/assets/connector-product-logo.svg" alt="" className="size-[56px]" />
          </div>
          <img src="/assets/connector-link.svg" alt="" className="size-[16px] shrink-0" />
          <div className="flex size-[80px] shrink-0 items-center justify-center rounded-[12px] border border-[#e6e6e6] bg-white">
            <img src={connector.icon} alt="" className="size-[48px]" />
          </div>
        </div>

        <div className="flex w-full flex-col items-center gap-[8px]">
          <h2 id="connector-dialog-title" className="text-[20px] font-medium leading-[28px] tracking-[0.02px] text-black">连接 {connector.name}</h2>
          <p className="text-center text-[14px] font-normal leading-[22px] tracking-[0.014px] text-[rgba(0,0,0,0.38)]">{connector.detail}</p>
        </div>

        {connected ? (
          <div className="flex items-center justify-center gap-[12px]">
            <button
              type="button"
              onClick={onRevalidate}
              className="flex cursor-pointer items-center gap-[8px] rounded-[8px] border border-[#e6e6e6] bg-white px-[16px] py-[5px] text-[14px] font-normal leading-[22px] tracking-[0.014px] text-[rgba(0,0,0,0.88)] hover:bg-[#e6e6e6] focus-visible:bg-[#e6e6e6]"
            >
              <img src="/assets/connector-refresh.svg" alt="" className="size-[16px]" />
              重新验证
            </button>
            <button
              type="button"
              onClick={onDisconnect}
              className="flex cursor-pointer items-center gap-[8px] rounded-[8px] border border-[#e6e6e6] bg-white px-[16px] py-[5px] text-[14px] font-normal leading-[22px] tracking-[0.014px] text-[rgba(0,0,0,0.88)] hover:bg-[#e6e6e6] focus-visible:bg-[#e6e6e6]"
            >
              <img src="/assets/connector-delete2.svg" alt="" className="size-[16px]" />
              解除连接
            </button>
          </div>
        ) : (
          <button
            type="button"
            disabled={loading}
            onClick={onConnect}
            className="flex cursor-pointer items-center gap-[8px] rounded-[8px] bg-[#1e63f5] px-[16px] py-[5px] text-[14px] font-normal leading-[22px] tracking-[0.014px] text-[rgba(255,255,255,0.98)] hover:bg-[#1554d1] disabled:cursor-default disabled:bg-[#99c3ff]"
          >
            {loading
              ? <span className="block size-[14px] animate-spin rounded-full border-2 border-[rgba(255,255,255,0.4)] border-t-white" />
              : <>{`连接 ${connector.name}`}<img src="/assets/connector-external.svg" alt="" className="size-[16px]" /></>}
          </button>
        )}
      </section>
    </div>
  );
}

export function ConnectorsView() {
  const state = useConnectorState();
  const connected = orderedConnected(state);
  const available = orderedAvailable(state);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [dialogId, setDialogId] = useState<string | null>(null);
  const [moreId, setMoreId] = useState<string | null>(null);
  const [moreAnchor, setMoreAnchor] = useState<HTMLElement | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => () => { timers.current.forEach(clearTimeout); }, []);

  const dialogConnector = dialogId ? CONNECTORS.find(c => c.id === dialogId) ?? null : null;
  const dialogConnected = dialogId ? state.connectedIds.includes(dialogId) : false;
  const moreConnector = moreId ? CONNECTORS.find(c => c.id === moreId) ?? null : null;

  useEffect(() => {
    if (!dialogId) return;
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") setDialogId(null); };
    document.addEventListener("keydown", close);
    return () => document.removeEventListener("keydown", close);
  }, [dialogId]);

  // 模拟连接：loading 1.5s → toast → 更新共享状态（弹窗此时会切换成已连接态）
  const connect = (item: ConnectorInfo) => {
    if (loadingId) return;
    setLoadingId(item.id);
    const timer = setTimeout(() => {
      toast.success(`已连接 ${item.name}`);
      storeConnect(item.id);
      setDialogId(current => current === item.id ? null : current);
      setLoadingId(null);
      timers.current = timers.current.filter(t => t !== timer);
    }, 1500);
    timers.current.push(timer);
  };

  const disconnect = (item: ConnectorInfo) => {
    storeDisconnect(item.id);
    setDialogId(null);
    setMoreId(null);
    setMoreAnchor(null);
    toast.success(`已解除连接 ${item.name}`);
  };

  const revalidate = () => {
    toast.success("重新验证成功");
    setMoreId(null);
    setMoreAnchor(null);
  };

  useEffect(() => {
    if (!moreId) return;
    const close = (event: MouseEvent) => {
      if (!moreAnchor?.contains(event.target as Node) &&
          !(event.target as HTMLElement).closest("[data-connector-more-menu]")) {
        setMoreId(null);
        setMoreAnchor(null);
      }
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [moreId, moreAnchor]);

  const renderCard = (connector: ConnectorInfo, isConnected: boolean) => (
    <ConnectorCard
      key={connector.id}
      connector={connector}
      connected={isConnected}
      loading={loadingId === connector.id}
      onOpen={() => setDialogId(connector.id)}
      onConnect={() => connect(connector)}
      onMoreClick={anchor => { setDialogId(null); setMoreId(connector.id); setMoreAnchor(anchor); }}
    />
  );

  return (
    // Figma 10126:98522：标题框位于 y=48，网格紧接其下
    <main className="relative min-h-0 flex-1 overflow-y-auto bg-white px-[16px] pt-[48px] min-[800px]:px-[24px]">
      <div className="mx-auto flex min-h-full w-full max-w-[960px] flex-col pb-[40px]">
        <h1 className="flex h-[44px] items-end pb-[16px] text-[20px] font-medium leading-[28px] tracking-[0.02px] text-[rgba(0,0,0,0.88)]">连接器</h1>
        {/* 不做分组：已连接的排前面，未连接的排后面，共用一张 2 列网格 */}
        <div className="grid grid-cols-1 gap-[16px] min-[640px]:grid-cols-2">
          {[...connected, ...available].map(connector =>
            renderCard(connector, state.connectedIds.includes(connector.id))
          )}
        </div>
      </div>
      {moreConnector && moreAnchor && (
        <OperationMenu
          anchor={moreAnchor}
          align="end"
          gap={8}
          data-connector-more-menu=""
          role="menu"
          aria-label="连接器操作"
          className="w-[160px] overflow-hidden rounded-[12px] border border-[#f2f2f2] bg-white px-[8px] py-[4px] shadow-[0_0_12px_rgba(0,0,0,0.08)]"
        >
          <div className="flex w-full flex-col py-[4px]">
            <button
              type="button"
              role="menuitem"
              onClick={() => disconnect(moreConnector)}
              className="flex h-[44px] w-full cursor-pointer items-center gap-[8px] rounded-[8px] px-[8px] text-left text-[14px] font-normal leading-[22px] tracking-[0.014px] text-[rgba(0,0,0,0.88)] hover:bg-[#e6e6e6] focus-visible:bg-[#e6e6e6]"
            >
              <img src="/assets/connector-delete.svg" alt="" className="size-[16px] shrink-0" />
              <span className="min-w-0 flex-1 truncate">解除连接</span>
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={revalidate}
              className="flex h-[44px] w-full cursor-pointer items-center gap-[8px] rounded-[8px] px-[8px] text-left text-[14px] font-normal leading-[22px] tracking-[0.014px] text-[rgba(0,0,0,0.88)] hover:bg-[#e6e6e6] focus-visible:bg-[#e6e6e6]"
            >
              <img src="/assets/automation-menu-refresh.svg" alt="" className="size-[16px] shrink-0" />
              <span className="min-w-0 flex-1 truncate">重新验证</span>
            </button>
          </div>
        </OperationMenu>
      )}
      {dialogConnector && (
        <ConnectorDialog
          connector={dialogConnector}
          connected={dialogConnected}
          loading={loadingId === dialogConnector.id}
          onClose={() => setDialogId(null)}
          onConnect={() => connect(dialogConnector)}
          onDisconnect={() => disconnect(dialogConnector)}
          onRevalidate={revalidate}
        />
      )}
    </main>
  );
}
