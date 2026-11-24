import { useSyncExternalStore } from "react";

// 连接器状态在「输入框 + 子面板」与「连接器管理页」之间共享：
// 默认全部未连接；任一处连接/解除连接后，另一处同步反映。
export type ConnectorInfo = {
  id: string;
  name: string;
  description: string;
  detail: string;
  icon: string;
};

export const CONNECTORS: ConnectorInfo[] = [
  {
    id: "onedrive", name: "OneDrive", description: "连接 Microsoft OneDrive 中的文件",
    detail: "轻松访问、搜索、整理并共享 OneDrive 中的文件，提高工作效率。",
    icon: "/assets/connector-card-1.svg",
  },
  {
    id: "outlook", name: "Outlook", description: "连接 Outlook 邮件与日历",
    detail: "轻松访问、搜索、整理并回复电子邮件，提高工作效率。",
    icon: "/assets/connector-card-2.svg",
  },
  {
    id: "sharepoint", name: "SharePoint", description: "连接 SharePoint 站点文档",
    detail: "轻松访问、搜索并整理 SharePoint 站点文档，提高工作效率。",
    icon: "/assets/connector-card-3.svg",
  },
  {
    id: "google", name: "Google Drive", description: "连接 Google Drive 云端文件",
    detail: "轻松访问、搜索并整理 Google Drive 云端文件，提高工作效率。",
    icon: "/assets/connector-card-4.svg",
  },
];

type State = { connectedIds: string[]; enabledIds: string[] };
let state: State = { connectedIds: [], enabledIds: [] };
const listeners = new Set<() => void>();
const emit = () => listeners.forEach(listener => listener());

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
function getSnapshot() { return state; }

export function useConnectorState() {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

function reorder(ids: string[], connected: boolean) {
  // 已连接排前面、未连接排后面，组内保持 CONNECTORS 的顺序
  return CONNECTORS.map(c => c.id).filter(id => state.connectedIds.includes(id) === connected);
}

export function connectConnector(id: string) {
  if (state.connectedIds.includes(id)) return;
  state = {
    connectedIds: [...state.connectedIds, id],
    enabledIds: [...state.enabledIds, id],
  };
  emit();
}

export function disconnectConnector(id: string) {
  if (!state.connectedIds.includes(id)) return;
  state = {
    connectedIds: state.connectedIds.filter(x => x !== id),
    enabledIds: state.enabledIds.filter(x => x !== id),
  };
  emit();
}

export function toggleConnectorEnabled(id: string) {
  state = {
    ...state,
    enabledIds: state.enabledIds.includes(id)
      ? state.enabledIds.filter(x => x !== id)
      : [...state.enabledIds, id],
  };
  emit();
}

export function isConnected(snap: State, id: string) {
  return snap.connectedIds.includes(id);
}

export function isEnabled(snap: State, id: string) {
  return snap.enabledIds.includes(id);
}

export function orderedConnected(snap: State) {
  return CONNECTORS.filter(c => snap.connectedIds.includes(c.id));
}

export function orderedAvailable(snap: State) {
  return CONNECTORS.filter(c => !snap.connectedIds.includes(c.id));
}
