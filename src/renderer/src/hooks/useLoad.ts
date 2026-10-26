import { useCallback, useEffect, useRef, useState } from 'react';

import { UI_EVENTS } from '@shared/ipc-channels';
import type { ApiResult } from '@shared/types';

import { api, call, errorMessage } from '../utils/api';

const SKELETON_DELAY_MS = 300;

interface LoadState<T> {
  data: T | null;
  error: string | null;
  /** 0.3초 넘게 걸릴 때만 true (짧은 깜빡임 방지) */
  showSkeleton: boolean;
  reload: () => void;
}

/** 데이터를 불러오고, Main에서 데이터 변경 이벤트가 오면 다시 불러온다. */
export function useLoad<T>(loader: () => Promise<ApiResult<T>>, deps: unknown[]): LoadState<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showSkeleton, setShowSkeleton] = useState(false);
  const requestId = useRef(0);
  // loader는 렌더마다 새로 만들어지므로 호출 측이 넘긴 deps로만 갱신한다.
  const load = useCallback(loader, deps);

  const reload = useCallback(() => {
    const id = ++requestId.current;
    const timer = setTimeout(() => setShowSkeleton(true), SKELETON_DELAY_MS);
    call(load())
      .then((next) => {
        if (id !== requestId.current) return;
        setData(next);
        setError(null);
      })
      .catch((err) => {
        if (id === requestId.current) setError(errorMessage(err));
      })
      .finally(() => {
        clearTimeout(timer);
        if (id === requestId.current) setShowSkeleton(false);
      });
  }, [load]);

  useEffect(() => {
    reload();
    return api.on(UI_EVENTS.DATA_CHANGED, reload);
  }, [reload]);

  return { data, error, showSkeleton, reload };
}
