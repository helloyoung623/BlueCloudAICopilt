import { useEffect, useRef, useState } from "react";
import { GenerationRunController, type GenerationStates } from "./generation-runs.ts";

// React 只负责把控制器的状态快照呈现给 UI；
// 运行号、AbortController 和计时器都在控制器里按会话管理，不在这里堆业务逻辑。
export function useGenerationRuns() {
  const [states, setStates] = useState<GenerationStates>(() => new Map());
  const controllerRef = useRef<GenerationRunController | null>(null);
  if (!controllerRef.current) controllerRef.current = new GenerationRunController(setStates);
  const controller = controllerRef.current;

  useEffect(() => () => controller.dispose(), [controller]);

  return { states, controller };
}
