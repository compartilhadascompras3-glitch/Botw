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
  // Guarda o QR atual para não trocar enquanto o usuário está tentando escanear
  const currentQrRef = useRef<string | null>(null);

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

        setState((prev) => {
          const newQr = d.qr ?? null;
          // Se já tem QR na tela, não troca — mantém o atual até o usuário escanear
          // ou o status mudar para conectando/conectado
          const keepOldQr = prev.status === 'qr' && !!prev.qr && d.status === 'qr';
          return {
            status: d.status,
            message: d.message,
            qr: keepOldQr ? prev.qr : newQr,
          };
        });
        currentQrRef.current = d.qr ?? null;

        // Ajusta velocidade do poll baseado no novo estado
        if (prevStatus !== d.status) {
          if (d.status === 'ready') {
            // Conectou — desacelera polling
            stopPolling();
            intervalRef.current = setInterval(pollOnce, 30000);
          } else if (prevStatus === 'ready') {
            // Desconectou — acelera polling
            stopPolling();
            intervalRef.current = setInterval(pollOnce, 3000);
          } else if (d.status === 'connecting') {
            // Conectando — poll rápido para detectar conexão logo
            stopPolling();
            intervalRef.current = setInterval(pollOnce, 1500);
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
      // No modo QR, poll lento (15s) — QR do WhatsApp dura ~20s,
      // mas não precisamos trocar a imagem na tela o tempo todo
      const interval = statusRef.current === 'ready' ? 30000
                     : statusRef.current === 'connecting' ? 1500
                     : statusRef.current === 'qr' ? 15000
                     : fast ? 3000 : 30000;
      intervalRef.current = setInterval(pollOnce, interval);
    }

    init();
    return () => stopPolling();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const connect = useCallback(async () => {
    setState((prev) => ({ ...prev, status: 'connecting', message: 'Conectando...' }));
    currentQrRef.current = null; // limpa QR antigo para aceitar o novo
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
