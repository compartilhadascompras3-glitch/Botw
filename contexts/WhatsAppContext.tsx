'use client';

import { createContext, useContext, useEffect, useState, useCallback, useRef, ReactNode } from 'react';

const WA_SERVER = '/api/wa';

export type WaStatus = 'disconnected' | 'qr' | 'connecting' | 'ready' | 'auth_failure';

export interface WaState {
  status: WaStatus;
  message: string;
  qr: string | null;
}

export interface WaGroup {
  id: string;
  name: string;
  participantsCount: number;
}

interface WaContextValue {
  state: WaState;
  waking: boolean;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  sendMessage: (to: string, message: string, media?: { dataUrl: string; type: string; name: string }) => Promise<{ ok: boolean; error?: string }>;
  fetchGroups: () => Promise<WaGroup[]>;
  postStatus: (message: string, media?: { dataUrl: string; type: string; name: string }) => Promise<{ ok: boolean; error?: string }>;
}

const WaContext = createContext<WaContextValue | null>(null);

export function WhatsAppProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<WaState>({
    status: 'disconnected',
    message: 'Iniciando servidor...',
    qr: null,
  });
  const [waking, setWaking] = useState(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const statusRef = useRef<WaStatus>('disconnected');

  useEffect(() => {
    function stopPolling() {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }

    async function pollOnce() {
      try {
        const r = await fetch(`${WA_SERVER}/status`);
        if (!r.ok) return;
        const d = await r.json() as WaState;
        const prevStatus = statusRef.current;
        statusRef.current = d.status;
        setState({ status: d.status, message: d.message, qr: d.qr ?? null });

        // Ajusta velocidade do poll baseado no novo estado
        if (prevStatus !== d.status) {
          // Mudou de ready → não-ready: acelera (3s)
          if (prevStatus === 'ready' && d.status !== 'ready') {
            stopPolling();
            intervalRef.current = setInterval(pollOnce, 3000);
          }
          // Mudou de não-ready → ready: desacelera (30s)
          if (prevStatus !== 'ready' && d.status === 'ready') {
            stopPolling();
            intervalRef.current = setInterval(pollOnce, 30000);
          }
        }
      } catch {
        // rede caiu — mantém estado atual
      }
    }

    async function init() {
      setWaking(false);
      // Poll imediato
      await pollOnce();
      // Começa intervalos: rápido se não conectado, lento se já conectado
      stopPolling();
      const fast = statusRef.current !== 'ready';
      intervalRef.current = setInterval(pollOnce, fast ? 3000 : 30000);
    }

    init();
    return () => stopPolling();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const connect = useCallback(async () => {
    setState((prev) => ({ ...prev, status: 'connecting', message: 'Conectando...' }));
    try {
      await fetch(`${WA_SERVER}/connect`, { method: 'POST' });
    } catch {
      setState({ status: 'disconnected', message: 'Falha ao conectar', qr: null });
    }
  }, []);

  const disconnect = useCallback(async () => {
    await fetch(`${WA_SERVER}/disconnect`, { method: 'POST' });
    setState({ status: 'disconnected', message: 'Desconectado', qr: null });
  }, []);

  const sendMessage = useCallback(async (
    to: string,
    message: string,
    media?: { dataUrl: string; type: string; name: string }
  ): Promise<{ ok: boolean; error?: string }> => {
    try {
      const r = await fetch(`${WA_SERVER}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to,
          message,
          mediaDataUrl: media?.dataUrl,
          mediaType: media?.type,
          mediaName: media?.name,
        }),
      });
      return await r.json();
    } catch (err: unknown) {
      return { ok: false, error: String(err) };
    }
  }, []);

  const fetchGroups = useCallback(async (): Promise<WaGroup[]> => {
    try {
      const r = await fetch(`${WA_SERVER}/groups`);
      const d = await r.json();
      return d.groups ?? [];
    } catch {
      return [];
    }
  }, []);

  const postStatus = useCallback(async (
    message: string,
    media?: { dataUrl: string; type: string; name: string }
  ): Promise<{ ok: boolean; error?: string }> => {
    try {
      const r = await fetch(`${WA_SERVER}/post-status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message,
          mediaDataUrl: media?.dataUrl,
          mediaType: media?.type,
          mediaName: media?.name,
        }),
      });
      return await r.json();
    } catch (err: unknown) {
      return { ok: false, error: String(err) };
    }
  }, []);

  return (
    <WaContext.Provider value={{ state, waking, connect, disconnect, sendMessage, fetchGroups, postStatus }}>
      {children}
    </WaContext.Provider>
  );
}

export function useWhatsApp(): WaContextValue {
  const ctx = useContext(WaContext);
  if (!ctx) throw new Error('useWhatsApp deve ser usado dentro de WhatsAppProvider');
  return ctx;
}
