'use client';

import { useState, useCallback } from 'react';
import { useBotStore, HistoryEntry } from '@/store/botStore';
import { useHistoryDb } from '@/hooks/use-history-db';
import { useWhatsApp } from '@/hooks/use-whatsapp';
import { Trash2, Clock, Paperclip, Users, Send, Loader2, CheckCircle, AlertCircle } from 'lucide-react';

function formatDate(ts: number) {
  return new Date(ts).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}

function timeAgo(ts: number) {
  const d = (Date.now() - ts) / 1000;
  if (d < 60) return `${Math.floor(d)}s atrás`;
  if (d < 3600) return `${Math.floor(d / 60)}min atrás`;
  if (d < 86400) return `${Math.floor(d / 3600)}h atrás`;
  return `${Math.floor(d / 86400)}d atrás`;
}

function ResendButton({ entry }: { entry: HistoryEntry }) {
  const [status, setStatus] = useState<'idle' | 'sending' | 'ok' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const { state: waState, sendMessage, postStatus } = useWhatsApp();
  const { addHistoryDb } = useHistoryDb();

  const handleResend = useCallback(async () => {
    if (status === 'sending') return;
    setStatus('sending');
    setErrorMsg('');

    try {
      const store = useBotStore.getState();

      // Tenta encontrar a mensagem original para pegar a mídia
      const originalMsg = store.messages.find((m) => m.id === entry.messageId);
      const media = originalMsg?.mediaDataUrl
        ? { dataUrl: originalMsg.mediaDataUrl, type: originalMsg.mediaType ?? 'application/octet-stream', name: originalMsg.mediaName ?? 'file' }
        : undefined;

      const targets = entry.targets ?? [];
      const shouldSendGroups = targets.length > 0 && waState.status === 'ready';
      const shouldPostStatus = store.statusEnabled && waState.status === 'ready';

      if (!shouldSendGroups && !shouldPostStatus) {
        setStatus('error');
        setErrorMsg(waState.status !== 'ready' ? 'Conecte o WhatsApp primeiro.' : 'Nenhum destino configurado.');
        setTimeout(() => setStatus('idle'), 3000);
        return;
      }

      const [results, statusResult] = await Promise.all([
        shouldSendGroups
          ? Promise.all(targets.map((t) => sendMessage(t.id, entry.messageText, media)))
          : Promise.resolve([] as { ok: boolean; error?: string }[]),
        shouldPostStatus
          ? postStatus(entry.messageText, media)
          : Promise.resolve({ ok: false as const, error: 'desativado' }),
      ]);

      const anyOk = results.some((r) => r.ok) || (shouldPostStatus && statusResult.ok);

      if (anyOk) {
        await addHistoryDb({
          messageId:   entry.messageId,
          messageText: entry.messageText,
          hasMedia:    entry.hasMedia,
          targets:     targets,
          sentAt:      Date.now(),
        });
        setStatus('ok');
        setTimeout(() => setStatus('idle'), 3000);
      } else {
        const err = results.find((r) => !r.ok)?.error ?? 'Falha ao reenviar';
        setStatus('error');
        setErrorMsg(err ?? 'Falha ao reenviar');
        setTimeout(() => setStatus('idle'), 4000);
      }
    } catch (err) {
      setStatus('error');
      setErrorMsg(String(err));
      setTimeout(() => setStatus('idle'), 4000);
    }
  }, [entry, status, waState.status, sendMessage, postStatus, addHistoryDb]);

  return (
    <div className="flex flex-col gap-1">
      <button
        onClick={handleResend}
        disabled={status === 'sending'}
        className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full font-medium disabled:opacity-50 transition-opacity hover:opacity-80"
        style={{
          background: status === 'ok' ? 'var(--wa-light-green)' : status === 'error' ? '#FEE2E2' : 'var(--secondary)',
          color: status === 'ok' ? 'var(--wa-dark-green)' : status === 'error' ? '#991B1B' : 'var(--foreground)',
        }}
        title="Reenviar para os mesmos grupos"
      >
        {status === 'sending' && <Loader2 size={11} className="animate-spin" />}
        {status === 'ok' && <CheckCircle size={11} />}
        {status === 'error' && <AlertCircle size={11} />}
        {status === 'idle' && <Send size={11} />}
        {status === 'sending' ? 'Enviando...' : status === 'ok' ? 'Enviado!' : status === 'error' ? 'Falhou' : 'Reenviar'}
      </button>
      {status === 'error' && errorMsg && (
        <p className="text-xs px-1" style={{ color: '#991B1B' }}>{errorMsg}</p>
      )}
    </div>
  );
}

export function HistoryPanel() {
  const { history } = useBotStore();
  const { clearHistoryDb } = useHistoryDb();

  // Carrega histórico do banco na montagem (via useHistoryDb interno)
  useHistoryDb();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Clock size={16} style={{ color: 'var(--wa-dark-green)' }} />
          <span className="text-sm font-semibold">
            {history.length} {history.length === 1 ? 'envio registrado' : 'envios registrados'}
          </span>
        </div>
        {history.length > 0 && (
          <button onClick={clearHistoryDb}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full"
            style={{ background: '#FEE2E2', color: '#EF4444' }}>
            <Trash2 size={12} />
            Limpar
          </button>
        )}
      </div>

      {history.length === 0 ? (
        <div className="text-center py-12 space-y-2">
          <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-3"
            style={{ background: 'var(--secondary)' }}>
            <span className="text-3xl">📋</span>
          </div>
          <p className="font-medium text-foreground">Nenhum envio ainda</p>
          <p className="text-sm text-muted-foreground">Os envios realizados aparecerão aqui com timestamp.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {history.map((entry, i) => (
            <div key={entry.id} className="rounded-2xl border p-3 space-y-2"
              style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>

              {/* Header row */}
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full"
                    style={{ background: 'var(--wa-light-green)', color: 'var(--wa-dark-green)' }}>
                    #{history.length - i}
                  </span>
                  {entry.hasMedia && (
                    <span className="text-xs font-medium px-2 py-0.5 rounded-full flex items-center gap-1"
                      style={{ background: '#EFF6FF', color: '#3B82F6' }}>
                      <Paperclip size={10} />
                      mídia
                    </span>
                  )}
                  {entry.targets && entry.targets.length > 0 && (
                    <span className="text-xs font-medium px-2 py-0.5 rounded-full flex items-center gap-1"
                      style={{ background: 'var(--secondary)', color: 'var(--muted-foreground)' }}>
                      <Users size={10} />
                      {entry.targets.length} {entry.targets.length === 1 ? 'grupo' : 'grupos'}
                    </span>
                  )}
                </div>
                {/* Botão reenviar */}
                <ResendButton entry={entry} />
              </div>

              {/* Timestamp */}
              <span className="text-xs text-muted-foreground block" translate="no">
                {formatDate(entry.sentAt)} · {timeAgo(entry.sentAt)}
              </span>

              {/* Destination chips */}
              {entry.targets && entry.targets.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {entry.targets.map((t) => (
                    <span key={t.id}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs"
                      style={{ background: 'rgba(37,211,102,0.1)', color: 'var(--wa-dark-green)' }}>
                      <Users size={9} />
                      <span className="max-w-[100px] truncate">{t.name}</span>
                    </span>
                  ))}
                </div>
              )}

              {/* Message text */}
              {entry.messageText ? (
                <p className="text-sm whitespace-pre-wrap break-words rounded-xl px-3 py-2"
                  style={{ background: 'var(--wa-light-green)', color: 'var(--foreground)' }}>
                  {entry.messageText}
                </p>
              ) : (
                <p className="text-xs text-muted-foreground italic px-1">Somente mídia</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
