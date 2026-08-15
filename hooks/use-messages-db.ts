'use client';

import { useEffect, useCallback } from 'react';
import { useBotStore, BotMessage } from '@/store/botStore';

type DbMessage = Omit<BotMessage, 'id' | 'createdAt'> & {
  id: string;
  createdAt: number;
  sortOrder: number;
  hasMedia?: boolean;
};

async function apiFetch(path: string, options?: RequestInit) {
  const res = await fetch(path, options);
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(err.error ?? `HTTP ${res.status}`);
  }
  return res.json();
}

export async function removeMessagePersisted(id: string): Promise<void> {
  useBotStore.getState().removeMessage(id);
  try {
    await apiFetch(`/api/messages?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
  } catch (err) {
    console.error('[removeMessagePersisted] error:', err);
  }
}

let clientLoadPromise: Promise<void> | null = null;

function loadFromDb(): Promise<void> {
  if (clientLoadPromise) return clientLoadPromise;
  clientLoadPromise = apiFetch('/api/messages')
    .then((rows: DbMessage[]) => {
      const msgs: BotMessage[] = rows.map((r) => ({
        id:           r.id,
        text:         r.text,
        mediaDataUrl: r.mediaDataUrl ?? undefined,
        mediaName:    r.mediaName ?? undefined,
        mediaType:    r.mediaType ?? undefined,
        sendOnce:     r.sendOnce ?? false,
        createdAt:    r.createdAt,
        // hasMedia vem do campo SQL calculado; se mediaDataUrl já veio, também é true
        hasMedia:     !!(r.hasMedia || r.mediaDataUrl),
      }));
      useBotStore.setState({ messages: msgs });
    })
    .catch((err) => {
      console.error('[useMessagesDb] load error:', err);
      clientLoadPromise = null;
    });
  return clientLoadPromise;
}

/** Força um novo fetch do banco, ignorando o cache da promise anterior. */
export async function refreshMessagesFromDb(): Promise<void> {
  clientLoadPromise = null;
  return loadFromDb();
}

export function useMessagesDb() {
  useEffect(() => {
    loadFromDb();
  }, []);

  const addMessage = useCallback(
    async (msg: Omit<BotMessage, 'id' | 'createdAt'>) => {
      const id = crypto.randomUUID();
      const createdAt = Date.now();
      const sortOrder = useBotStore.getState().messages.length;

      useBotStore.setState((state) => ({
        messages: [...state.messages, { id, createdAt, ...msg }],
      }));

      try {
        await apiFetch('/api/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id, createdAt, sortOrder, ...msg }),
        });
      } catch (err) {
        console.error('[useMessagesDb] addMessage error:', err);
      }
    },
    []
  );

  const updateMessage = useCallback(
    async (id: string, patch: Partial<Pick<BotMessage, 'text' | 'mediaDataUrl' | 'mediaName' | 'mediaType' | 'sendOnce'>>) => {
      useBotStore.getState().updateMessage(id, patch);
      try {
        await apiFetch(`/api/messages/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(patch),
        });
      } catch (err) {
        console.error('[useMessagesDb] updateMessage error:', err);
      }
    },
    []
  );

  const removeMessage = useCallback(
    async (id: string) => {
      useBotStore.getState().removeMessage(id);
      try {
        await apiFetch(`/api/messages?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
      } catch (err) {
        console.error('[useMessagesDb] removeMessage error:', err);
      }
    },
    []
  );

  const reorderMessages = useCallback(
    async (from: number, to: number) => {
      useBotStore.getState().reorderMessages(from, to);
      const reordered = useBotStore.getState().messages;
      try {
        await Promise.all(
          reordered.map((m, idx) =>
            apiFetch(`/api/messages/${m.id}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ sortOrder: idx }),
            })
          )
        );
      } catch (err) {
        console.error('[useMessagesDb] reorderMessages error:', err);
      }
    },
    []
  );

  const refreshMessages = useCallback(() => refreshMessagesFromDb(), []);

  return { addMessage, updateMessage, removeMessage, reorderMessages, refreshMessages };
}
