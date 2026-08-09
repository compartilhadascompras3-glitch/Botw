'use client';

import { useEffect, useRef, useCallback } from 'react';
import { useBotStore, HistoryEntry, Target } from '@/store/botStore';

type DbHistoryRow = {
  id: string;
  messageId: string;
  messageText: string;
  hasMedia: boolean;
  targets: Target[];
  sentAt: number;
};

async function apiFetch(path: string, options?: RequestInit) {
  const res = await fetch(path, options);
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(err.error ?? `HTTP ${res.status}`);
  }
  return res.json();
}

let globalLoaded = false;

async function loadHistoryFromDb(): Promise<void> {
  return apiFetch('/api/history')
    .then((rows: DbHistoryRow[]) => {
      const entries: HistoryEntry[] = rows.map((r) => ({
        id:          r.id,
        messageId:   r.messageId,
        messageText: r.messageText,
        hasMedia:    r.hasMedia,
        targets:     r.targets ?? [],
        sentAt:      r.sentAt,
      }));
      useBotStore.setState({ history: entries });
    })
    .catch((err) => console.error('[useHistoryDb] load error:', err));
}

export async function refreshHistoryFromDb(): Promise<void> {
  globalLoaded = false;
  return loadHistoryFromDb();
}

export function useHistoryDb() {
  const loadedRef = useRef(false);

  useEffect(() => {
    if (loadedRef.current || globalLoaded) return;
    loadedRef.current = true;
    globalLoaded = true;
    loadHistoryFromDb();
  }, []);

  const addHistoryDb = useCallback(async (entry: Omit<HistoryEntry, 'id'>) => {
    const id = crypto.randomUUID();
    useBotStore.setState((state) => ({
      history: [{ ...entry, id }, ...state.history].slice(0, 200),
    }));
    try {
      await apiFetch('/api/history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, ...entry }),
      });
    } catch (err) {
      console.error('[useHistoryDb] addHistoryDb error:', err);
    }
  }, []);

  const clearHistoryDb = useCallback(async () => {
    useBotStore.getState().clearHistory();
    try {
      await apiFetch('/api/history?all=1', { method: 'DELETE' });
    } catch (err) {
      console.error('[useHistoryDb] clearHistoryDb error:', err);
    }
  }, []);

  const refreshHistory = useCallback(() => refreshHistoryFromDb(), []);

  return { addHistoryDb, clearHistoryDb, refreshHistory };
}
