'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useBotStore, Target } from '@/store/botStore';
import { useWhatsApp, WaGroup } from '@/hooks/use-whatsapp';
import { useHistoryDb } from '@/hooks/use-history-db';
import { useMessagesDb } from '@/hooks/use-messages-db';
import { WhatsAppConnector } from './WhatsAppConnector';
import Image from 'next/image';
import {
  Play, Square, Send, Clock, Smartphone,
  ChevronUp, ChevronDown, CheckCircle, AlertCircle,
  Users, RefreshCw, Loader2, X, Paperclip, Plus, ShieldCheck, CalendarClock, Radio,
} from 'lucide-react';

function pad(n: number) { return String(n).padStart(2, '0'); }
function formatCountdown(s: number) { return `${pad(Math.floor(s / 60))}:${pad(s % 60)}`; }

// ── Scheduler state (vem do servidor) ────────────────────────────────────────

interface SchedulerState {
  running: boolean;
  intervalMinutes: number;
  jitterPercent: number;
  scheduleEnabled: boolean;
  scheduleStart: string;
  scheduleEnd: string;
  statusEnabled: boolean;
  groupsEnabled: boolean;
  targets: Target[];
  currentIndex: number;
  nextFireAt: number | null;
}

const DEFAULT_SCHEDULER: SchedulerState = {
  running: false,
  intervalMinutes: 30,
  jitterPercent: 20,
  scheduleEnabled: false,
  scheduleStart: '08:00',
  scheduleEnd: '22:00',
  statusEnabled: false,
  groupsEnabled: true,
  targets: [],
  currentIndex: 0,
  nextFireAt: null,
};

// ── MultiGroupPicker ──────────────────────────────────────────────────────────

function MultiGroupPicker({
  groups,
  loading,
  targets,
  onAdd,
  onRemove,
  onRefresh,
}: {
  groups: WaGroup[];
  loading: boolean;
  targets: Target[];
  onAdd: (t: Target) => void;
  onRemove: (id: string) => void;
  onRefresh: () => void;
}) {
  const [search, setSearch] = useState('');
  const [showList, setShowList] = useState(false);

  const selectedIds = new Set(targets.map((t) => t.id));
  const filtered = groups.filter(
    (g) => g.name.toLowerCase().includes(search.toLowerCase())
  );

  const handleAddManual = () => {
    const raw = search.trim().replace(/\D/g, '');
    if (!raw) return;
    const id = raw + '@c.us';
    if (!selectedIds.has(id)) onAdd({ id, name: '+' + raw });
    setSearch('');
    setShowList(false);
  };

  const isManualNumber = /^\+?\d{7,}$/.test(search.trim());

  return (
    <div className="space-y-2">
      {targets.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {targets.map((t) => (
            <span
              key={t.id}
              className="inline-flex items-center gap-1.5 pl-2.5 pr-1.5 py-1 rounded-full text-xs font-medium"
              style={{ background: 'var(--wa-light-green)', color: 'var(--wa-dark-green)' }}
            >
              <Users size={11} className="shrink-0" />
              <span className="max-w-[120px] truncate">{t.name}</span>
              <button
                onClick={() => onRemove(t.id)}
                className="rounded-full hover:opacity-70 transition-opacity"
                title={`Remover ${t.name}`}
              >
                <X size={12} />
              </button>
            </span>
          ))}
          {targets.length > 1 && (
            <span
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold"
              style={{ background: 'var(--secondary)', color: 'var(--muted-foreground)' }}
            >
              {targets.length} destinos
            </span>
          )}
        </div>
      )}

      <div className="flex gap-2">
        <div className="relative flex-1">
          <input
            type="text"
            className="w-full text-sm rounded-xl border pl-3 pr-3 py-2 focus:outline-none focus:ring-2"
            style={{ borderColor: 'var(--border)', background: 'var(--secondary)', color: 'var(--foreground)' }}
            placeholder="Buscar grupo ou digitar número (ex: 5511999...)..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setShowList(true); }}
            onFocus={() => setShowList(true)}
            onKeyDown={(e) => { if (e.key === 'Enter' && isManualNumber) handleAddManual(); }}
          />
        </div>
        <button
          onClick={onRefresh}
          disabled={loading}
          className="w-9 h-9 shrink-0 rounded-xl flex items-center justify-center disabled:opacity-40 hover:opacity-80"
          style={{ background: 'var(--secondary)' }}
          title="Atualizar lista de grupos"
        >
          {loading ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
        </button>
      </div>

      {(showList || search) && (
        <div
          className="rounded-xl border overflow-hidden divide-y"
          style={{ borderColor: 'var(--border)', maxHeight: 220, overflowY: 'auto' }}
        >
          {isManualNumber && (
            <button
              onClick={handleAddManual}
              className="w-full flex items-center gap-3 px-3 py-2.5 text-left text-sm transition-colors hover:opacity-90"
              style={{ background: 'var(--wa-light-green)', color: 'var(--wa-dark-green)' }}
            >
              <span
                className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 font-bold text-sm"
                style={{ background: 'var(--wa-green)', color: 'white' }}
              >
                +
              </span>
              <span className="flex-1 font-medium">Adicionar {search.trim().replace(/\D/g, '')} como destino</span>
              <Plus size={15} className="shrink-0" />
            </button>
          )}

          {loading && groups.length === 0 ? (
            <div className="flex items-center justify-center gap-2 py-5 text-sm text-muted-foreground">
              <Loader2 size={15} className="animate-spin" /> Carregando grupos...
            </div>
          ) : filtered.length === 0 && !isManualNumber ? (
            <p className="text-center text-xs text-muted-foreground py-4">
              {groups.length === 0
                ? 'Conecte o WhatsApp e clique em ↻ para carregar grupos.'
                : 'Nenhum grupo corresponde. Digite um número para adicionar diretamente.'}
            </p>
          ) : (
            filtered.map((g) => {
              const selected = selectedIds.has(g.id);
              return (
                <button
                  key={g.id}
                  onClick={() => {
                    selected ? onRemove(g.id) : onAdd({ id: g.id, name: g.name });
                    setSearch('');
                    setShowList(false);
                  }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 text-left text-sm transition-colors hover:opacity-90"
                  style={{
                    background: selected ? 'var(--wa-light-green)' : 'white',
                    color: selected ? 'var(--wa-dark-green)' : 'var(--foreground)',
                  }}
                >
                  <span
                    className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 font-bold text-sm"
                    style={{
                      background: selected ? 'var(--wa-green)' : 'var(--secondary)',
                      color: selected ? 'white' : 'var(--muted-foreground)',
                    }}
                  >
                    {g.name.charAt(0).toUpperCase()}
                  </span>
                  <span className="flex-1 truncate font-medium">{g.name}</span>
                  {g.participantsCount > 0 && (
                    <span className="text-xs text-muted-foreground shrink-0 flex items-center gap-1">
                      <Users size={11} />
                      <span translate="no">{g.participantsCount}</span>
                    </span>
                  )}
                  {selected
                    ? <CheckCircle size={15} style={{ color: 'var(--wa-green)' }} className="shrink-0" />
                    : <Plus size={15} className="shrink-0 text-muted-foreground" />}
                </button>
              );
            })
          )}
        </div>
      )}

      {targets.length === 0 && !showList && !search && (
        <p className="text-xs text-muted-foreground">
          Digite um número (ex: 5511999...) ou clique em ↻ para carregar grupos.
        </p>
      )}
    </div>
  );
}

// ── SchedulerPanel ────────────────────────────────────────────────────────────

export function SchedulerPanel() {
  const { messages, currentIndex: storeIndex } = useBotStore();
  const { state: waState, fetchGroups, sendMessage, postStatus } = useWhatsApp();
  const { addHistoryDb } = useHistoryDb();
  const { refreshMessages } = useMessagesDb();

  // Estado do scheduler vem do servidor
  const [sched, setSched] = useState<SchedulerState>(DEFAULT_SCHEDULER);
  const [sendResult, setSendResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [sending, setSending] = useState(false);
  const [groups, setGroups] = useState<WaGroup[]>([]);
  const [groupsLoading, setGroupsLoading] = useState(false);
  const [fallbackPhone, setFallbackPhone] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  // Countdown derivado de nextFireAt do servidor
  const [secondsLeft, setSecondsLeft] = useState(0);
  const totalSecondsRef = useRef(0);

  const isWaReady = waState.status === 'ready';

  // ── Carrega estado inicial do scheduler ──────────────────────────────────
  // Tenta wa-server; se falhar (Render dormindo), usa o banco como fallback
  useEffect(() => {
    // Scheduler roda no cliente — carrega config do banco
    fetch('/api/bot-state')
      .then((r) => r.json())
      .then((d: {
        targets?: Target[];
        intervalMinutes?: number;
        jitterPercent?: number;
        scheduleEnabled?: boolean;
        scheduleStart?: string;
        scheduleEnd?: string;
        statusEnabled?: boolean;
        groupsEnabled?: boolean;
        currentIndex?: number;
      }) => {
        setSched((s) => ({
          ...s,
          targets:         d.targets         ?? s.targets,
          intervalMinutes: d.intervalMinutes  ?? s.intervalMinutes,
          jitterPercent:   d.jitterPercent    ?? s.jitterPercent,
          scheduleEnabled: d.scheduleEnabled  ?? s.scheduleEnabled,
          scheduleStart:   d.scheduleStart    ?? s.scheduleStart,
          scheduleEnd:     d.scheduleEnd      ?? s.scheduleEnd,
          statusEnabled:   d.statusEnabled    ?? s.statusEnabled,
          groupsEnabled:   d.groupsEnabled    ?? s.groupsEnabled,
        }));
      })
      .catch(() => {});
  }, []);

  // ── Timer cliente: dispara mensagens sem depender de servidor externo ──────
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fireNow = useCallback(async () => {
    if (!isWaReady) return;
    const currentMessages = useBotStore.getState().messages;
    const currentIdx = useBotStore.getState().currentIndex;
    const msg = currentMessages[currentIdx] ?? currentMessages[0];
    if (!msg) return;

    const targets = sched.targets;
    const results: string[] = [];

    if (sched.groupsEnabled && targets.length > 0) {
      for (const t of targets) {
        const media = msg.mediaDataUrl
          ? { dataUrl: msg.mediaDataUrl, type: msg.mediaType ?? 'image/jpeg', name: msg.mediaName ?? 'promo.jpg' }
          : undefined;
        const r = await sendMessage(t.id, msg.text, media);
        results.push(r.ok ? `✓ ${t.name}` : `✗ ${t.name}: ${r.error}`);
      }
    }

    if (sched.statusEnabled) {
      const media = msg.mediaDataUrl
        ? { dataUrl: msg.mediaDataUrl, type: msg.mediaType ?? 'image/jpeg', name: msg.mediaName ?? 'promo.jpg' }
        : undefined;
      const r = await postStatus(msg.text, media);
      results.push(r.ok ? '✓ Status' : `✗ Status: ${r.error}`);
    }

    const allOk = results.every((r) => r.startsWith('✓'));
    addHistoryDb({
      messageId: msg.id,
      messageText: msg.text,
      hasMedia: !!msg.mediaDataUrl,
      targets: targets,
      sentAt: Date.now(),
    });

    setSendResult({ ok: allOk, msg: results.join(' · ') || 'Enviado.' });
    setTimeout(() => { refreshMessages(); setSendResult(null); }, 3000);

    // Avança índice
    useBotStore.getState().advanceIndex();
  }, [isWaReady, sched.groupsEnabled, sched.statusEnabled, sched.targets, addHistoryDb, refreshMessages]);

  // Agenda próximo disparo
  const scheduleNext = useCallback((intervalMin: number, jitter: number) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    const base = intervalMin * 60 * 1000;
    const jitterMs = base * (jitter / 100);
    const delay = base + (Math.random() * 2 - 1) * jitterMs;
    const nextAt = Date.now() + delay;
    setSched((s) => ({ ...s, nextFireAt: nextAt }));
    timerRef.current = setTimeout(async () => {
      await fireNow();
      // Reagenda se ainda running
      setSched((s) => {
        if (s.running) scheduleNext(s.intervalMinutes, s.jitterPercent);
        return s;
      });
    }, delay);
  }, [fireNow]);

  // Limpa timer ao desmontar
  useEffect(() => {
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, []);

  // ── Countdown local (atualiza a cada segundo com base em nextFireAt do servidor) ──
  useEffect(() => {
    const id = setInterval(() => {
      if (!sched.running || !sched.nextFireAt) { setSecondsLeft(0); return; }
      const remaining = Math.max(0, Math.round((sched.nextFireAt - Date.now()) / 1000));
      setSecondsLeft(remaining);
      if (totalSecondsRef.current === 0 && sched.intervalMinutes) {
        totalSecondsRef.current = sched.intervalMinutes * 60;
      }
    }, 1000);
    return () => clearInterval(id);
  }, [sched.running, sched.nextFireAt, sched.intervalMinutes]);

  // Sincroniza totalSecondsRef ao trocar intervalo
  useEffect(() => {
    totalSecondsRef.current = sched.intervalMinutes * 60;
  }, [sched.intervalMinutes]);

  const loadGroups = useCallback(async () => {
    setGroupsLoading(true);
    const list = await fetchGroups();
    setGroups(list);
    setGroupsLoading(false);
  }, [fetchGroups]);

  useEffect(() => {
    if (isWaReady) loadGroups();
    else setGroups([]);
  }, [isWaReady, loadGroups]);

  // ── Salva sched no banco sempre que targets ou config mudam ─────────────
  const schedSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (schedSaveTimer.current) clearTimeout(schedSaveTimer.current);
    schedSaveTimer.current = setTimeout(() => {
      fetch('/api/bot-state', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targets:         sched.targets,
          intervalMinutes: sched.intervalMinutes,
          jitterPercent:   sched.jitterPercent,
          scheduleEnabled: sched.scheduleEnabled,
          scheduleStart:   sched.scheduleStart,
          scheduleEnd:     sched.scheduleEnd,
          statusEnabled:   sched.statusEnabled,
          groupsEnabled:   sched.groupsEnabled,
          currentIndex:    sched.currentIndex ?? 0,
        }),
      }).catch(() => {});
    }, 800);
    return () => { if (schedSaveTimer.current) clearTimeout(schedSaveTimer.current); };
  }, [
    sched.targets, sched.intervalMinutes, sched.jitterPercent,
    sched.scheduleEnabled, sched.scheduleStart, sched.scheduleEnd,
    sched.statusEnabled, sched.groupsEnabled, sched.currentIndex,
  ]);

  // ── Helpers de config ────────────────────────────────────────────────────
  const updateConfig = useCallback((patch: Partial<SchedulerState>) => {
    setSched((s) => ({ ...s, ...patch }));
  }, []);

  const handleAddTarget = useCallback((t: Target) => {
    const newTargets = sched.targets.some((x) => x.id === t.id)
      ? sched.targets
      : [...sched.targets, t];
    updateConfig({ targets: newTargets });
  }, [sched.targets, updateConfig]);

  const handleRemoveTarget = useCallback((id: string) => {
    updateConfig({ targets: sched.targets.filter((t) => t.id !== id) });
  }, [sched.targets, updateConfig]);

  // ── Toggle ligar/desligar ────────────────────────────────────────────────
  const handleToggle = useCallback(() => {
    if (sched.running) {
      // Para o bot
      if (timerRef.current) clearTimeout(timerRef.current);
      setSched((s) => ({ ...s, running: false, nextFireAt: null }));
      setSecondsLeft(0);
      totalSecondsRef.current = 0;
    } else {
      // Inicia o bot
      setSched((s) => ({ ...s, running: true }));
      totalSecondsRef.current = sched.intervalMinutes * 60;
      scheduleNext(sched.intervalMinutes, sched.jitterPercent);
    }
  }, [sched.running, sched.intervalMinutes, sched.jitterPercent, scheduleNext]);

  // ── Envio manual imediato ────────────────────────────────────────────────
  const handleSendNow = async () => {
    if (sending) return;
    setSending(true);
    setSendResult(null);
    try {
      if (isWaReady) {
        await fireNow();
        setTimeout(() => { refreshMessages(); setSendResult(null); }, 1200);
      } else {
        // fallback: abre WhatsApp Web
        const msg = messages[storeIndex] ?? messages[0];
        if (!msg) return;
        const phone = fallbackPhone.replace(/\D/g, '');
        const encoded = encodeURIComponent(msg.text);
        const link = phone.length >= 7 ? `https://wa.me/${phone}?text=${encoded}` : 'https://web.whatsapp.com/';
        window.open(link, '_blank');
        addHistoryDb({ messageId: msg.id, messageText: msg.text, hasMedia: !!msg.mediaDataUrl, targets: phone ? [{ id: phone, name: phone }] : [], sentAt: Date.now() });
        setSendResult({ ok: true, msg: 'Mensagem aberta no WhatsApp Web.' });
        setTimeout(() => { refreshMessages(); setSendResult(null); }, 1200);
      }
    } catch {
      setSendResult({ ok: false, msg: 'Erro ao enviar.' });
      setTimeout(() => setSendResult(null), 5000);
    } finally {
      setSending(false);
    }
  };

  const currentMsg = messages[storeIndex] ?? messages[0] ?? null;

  const canStart = messages.length > 0 && (
    isWaReady
      ? (sched.targets.length > 0 && sched.groupsEnabled) || sched.statusEnabled
      : true
  );

  const progressTotal = totalSecondsRef.current > 0 ? totalSecondsRef.current : sched.intervalMinutes * 60;
  const progress = progressTotal > 0 ? Math.max(0, Math.min(1, secondsLeft / progressTotal)) : 0;

  return (
    <div className="space-y-4">
      <WhatsAppConnector />

      {/* Prévia da mensagem atual */}
      {currentMsg && (
        <div className="rounded-2xl border p-4 space-y-2" style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>
          <p className="text-xs font-semibold" style={{ color: 'var(--wa-dark-green)' }}>
            Mensagem {messages.indexOf(currentMsg) + 1} de {messages.length} · próxima a enviar
          </p>
          {currentMsg.mediaDataUrl && currentMsg.mediaType?.startsWith('image/') && (
            <div className="rounded-xl overflow-hidden border" style={{ borderColor: 'var(--border)' }}>
              <Image src={currentMsg.mediaDataUrl} alt={currentMsg.mediaName ?? 'imagem'}
                width={400} height={160} className="w-full object-cover max-h-36" style={{ objectFit: 'cover' }} />
            </div>
          )}
          {currentMsg.mediaDataUrl && !currentMsg.mediaType?.startsWith('image/') && (
            <div className="flex items-center gap-2 rounded-xl px-3 py-2" style={{ background: 'var(--secondary)' }}>
              <Paperclip size={13} style={{ color: 'var(--wa-dark-green)' }} />
              <span className="text-xs text-muted-foreground truncate">{currentMsg.mediaName}</span>
            </div>
          )}
          {currentMsg.text && (
            <p className="text-sm whitespace-pre-wrap break-words rounded-xl px-3 py-2"
              style={{ background: 'var(--wa-light-green)', color: 'var(--foreground)' }}>
              {currentMsg.text}
            </p>
          )}
        </div>
      )}

      {/* Painel principal */}
      <div className="rounded-2xl border p-4 space-y-4" style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>

        {/* Destino */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold flex items-center gap-1.5" style={{ color: 'var(--wa-dark-green)' }}>
            {isWaReady ? <Users size={13} /> : <Smartphone size={13} />}
            {isWaReady
              ? `Grupos de destino${sched.targets.length > 0 ? ` (${sched.targets.length} selecionado${sched.targets.length > 1 ? 's' : ''})` : ''}`
              : 'Número de telefone (fallback WhatsApp Web)'}
          </label>

          {isWaReady ? (
            <MultiGroupPicker
              groups={groups}
              loading={groupsLoading}
              targets={sched.targets}
              onAdd={handleAddTarget}
              onRemove={handleRemoveTarget}
              onRefresh={loadGroups}
            />
          ) : (
            <>
              <input type="text"
                className="w-full text-sm rounded-xl border px-3 py-2 focus:outline-none focus:ring-2"
                style={{ borderColor: 'var(--border)', background: 'var(--secondary)', color: 'var(--foreground)' }}
                placeholder="Ex: 5511999999999 (com código do país)"
                value={fallbackPhone}
                onChange={(e) => setFallbackPhone(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Conecte o WhatsApp acima para selecionar múltiplos grupos.
              </p>
            </>
          )}
        </div>

        {/* Toggles — só quando WA conectado */}
        {isWaReady && (
          <div className="space-y-2">
            {/* Toggle: grupos */}
            <div
              className="rounded-xl border p-3 flex items-center justify-between gap-3"
              style={{ borderColor: sched.groupsEnabled ? 'rgba(37,211,102,0.4)' : 'var(--border)', background: sched.groupsEnabled ? 'rgba(37,211,102,0.06)' : 'transparent' }}
            >
              <div className="flex items-center gap-2 min-w-0">
                <Users size={15} style={{ color: sched.groupsEnabled ? 'var(--wa-green)' : 'var(--muted-foreground)', flexShrink: 0 }} />
                <div className="min-w-0">
                  <p className="text-xs font-semibold leading-tight" style={{ color: sched.groupsEnabled ? 'var(--wa-dark-green)' : 'var(--foreground)' }}>
                    Enviar para os grupos
                  </p>
                  <p className="text-xs text-muted-foreground leading-tight mt-0.5">
                    {sched.groupsEnabled
                      ? sched.targets.length > 0 ? `${sched.targets.length} grupo${sched.targets.length > 1 ? 's' : ''} selecionado${sched.targets.length > 1 ? 's' : ''}` : 'Nenhum grupo selecionado acima'
                      : 'Ativar para enviar para os grupos selecionados'}
                  </p>
                </div>
              </div>
              <button type="button" onClick={() => updateConfig({ groupsEnabled: !sched.groupsEnabled })}
                className="w-10 h-5 rounded-full relative transition-colors shrink-0"
                style={{ background: sched.groupsEnabled ? 'var(--wa-green)' : 'var(--border)' }}>
                <span className="absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all"
                  style={{ left: sched.groupsEnabled ? '22px' : '2px' }} />
              </button>
            </div>

            {/* Toggle: Status */}
            <div
              className="rounded-xl border p-3 flex items-center justify-between gap-3"
              style={{ borderColor: sched.statusEnabled ? 'rgba(37,211,102,0.4)' : 'var(--border)', background: sched.statusEnabled ? 'rgba(37,211,102,0.06)' : 'transparent' }}
            >
              <div className="flex items-center gap-2 min-w-0">
                <Radio size={15} style={{ color: sched.statusEnabled ? 'var(--wa-green)' : 'var(--muted-foreground)', flexShrink: 0 }} />
                <div className="min-w-0">
                  <p className="text-xs font-semibold leading-tight" style={{ color: sched.statusEnabled ? 'var(--wa-dark-green)' : 'var(--foreground)' }}>
                    Postar no Status do WhatsApp
                  </p>
                  <p className="text-xs text-muted-foreground leading-tight mt-0.5">
                    {sched.statusEnabled ? 'Cada envio também posta no seu Status/Story' : 'Ativar para postar no Status junto com os grupos'}
                  </p>
                </div>
              </div>
              <button type="button" onClick={() => updateConfig({ statusEnabled: !sched.statusEnabled })}
                className="w-10 h-5 rounded-full relative transition-colors shrink-0"
                style={{ background: sched.statusEnabled ? 'var(--wa-green)' : 'var(--border)' }}>
                <span className="absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all"
                  style={{ left: sched.statusEnabled ? '22px' : '2px' }} />
              </button>
            </div>
          </div>
        )}

        {/* Intervalo */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold flex items-center gap-1.5" style={{ color: 'var(--wa-dark-green)' }}>
            <Clock size={13} /> Intervalo entre envios
          </label>
          <div className="flex items-center gap-3">
            <input
              type="range" min={1} max={120} step={1}
              value={sched.intervalMinutes}
              onChange={(e) => updateConfig({ intervalMinutes: Number(e.target.value) })}
              className="flex-1 accent-green-500"
              disabled={sched.running}
            />
            <div className="flex items-center gap-1 rounded-xl border px-2 py-1" style={{ borderColor: 'var(--border)', background: 'var(--secondary)', color: 'var(--foreground)', minWidth: 80 }}>
              <button onClick={() => updateConfig({ intervalMinutes: Math.max(1, sched.intervalMinutes - 1) })} disabled={sched.running || sched.intervalMinutes <= 1}
                className="w-6 h-6 flex items-center justify-center rounded-lg disabled:opacity-30 hover:opacity-70">
                <ChevronDown size={14} />
              </button>
              <span className="text-sm font-semibold flex-1 text-center" translate="no">{sched.intervalMinutes}m</span>
              <button onClick={() => updateConfig({ intervalMinutes: Math.min(120, sched.intervalMinutes + 1) })} disabled={sched.running || sched.intervalMinutes >= 120}
                className="w-6 h-6 flex items-center justify-center rounded-lg disabled:opacity-30 hover:opacity-70">
                <ChevronUp size={14} />
              </button>
            </div>
          </div>
        </div>

        {/* Configurações avançadas */}
        <button
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="w-full flex items-center justify-between text-xs font-semibold py-1 hover:opacity-70 transition-opacity"
          style={{ color: 'var(--muted-foreground)' }}
        >
          <span className="flex items-center gap-1.5">
            <ShieldCheck size={13} /> Configurações avançadas
          </span>
          {showAdvanced ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>

        {showAdvanced && (
          <div className="space-y-4 pt-1">
            {/* Jitter anti-ban */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold flex items-center gap-1.5" style={{ color: 'var(--wa-dark-green)' }}>
                <ShieldCheck size={13} /> Variação aleatória anti-ban
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="range" min={0} max={50} step={5}
                  value={sched.jitterPercent}
                  onChange={(e) => updateConfig({ jitterPercent: Number(e.target.value) })}
                  className="flex-1 accent-green-500"
                  disabled={sched.running}
                />
                <span className="text-sm font-semibold rounded-xl border px-3 py-1" style={{ borderColor: 'var(--border)', background: 'var(--secondary)', color: 'var(--foreground)', minWidth: 52 }} translate="no">
                  ±{sched.jitterPercent}%
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                Adiciona variação aleatória ao intervalo (ex: 30min ±20% = entre 24 e 36 min).
              </p>
            </div>

            {/* Horário de funcionamento */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold flex items-center gap-1.5" style={{ color: 'var(--wa-dark-green)' }}>
                  <CalendarClock size={13} /> Horário de funcionamento
                </label>
                <button type="button" onClick={() => updateConfig({ scheduleEnabled: !sched.scheduleEnabled })}
                  className="w-10 h-5 rounded-full relative transition-colors"
                  style={{ background: sched.scheduleEnabled ? 'var(--wa-green)' : 'var(--border)' }}>
                  <span className="absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all"
                    style={{ left: sched.scheduleEnabled ? '22px' : '2px' }} />
                </button>
              </div>
              {sched.scheduleEnabled && (
                <div className="flex items-center gap-2">
                  <input type="time" value={sched.scheduleStart}
                    onChange={(e) => updateConfig({ scheduleStart: e.target.value })}
                    className="flex-1 text-sm rounded-xl border px-3 py-2 focus:outline-none"
                    style={{ borderColor: 'var(--border)', background: 'var(--secondary)', color: 'var(--foreground)' }} />
                  <span className="text-xs text-muted-foreground">até</span>
                  <input type="time" value={sched.scheduleEnd}
                    onChange={(e) => updateConfig({ scheduleEnd: e.target.value })}
                    className="flex-1 text-sm rounded-xl border px-3 py-2 focus:outline-none"
                    style={{ borderColor: 'var(--border)', background: 'var(--secondary)', color: 'var(--foreground)' }} />
                </div>
              )}
              {sched.scheduleEnabled && (
                <p className="text-xs text-muted-foreground">
                  O bot só enviará entre {sched.scheduleStart} e {sched.scheduleEnd}. Fora desse horário, aguarda 1 min e verifica novamente.
                </p>
              )}
            </div>
          </div>
        )}

        {/* Countdown */}
        {sched.running && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground flex items-center gap-1">
                <Clock size={12} /> Próximo envio em
              </span>
              <span className="font-mono font-bold" style={{ color: 'var(--wa-dark-green)' }} translate="no">
                {formatCountdown(secondsLeft)}
              </span>
            </div>
            <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--secondary)' }}>
              <div
                className="h-full rounded-full transition-all duration-1000"
                style={{ width: `${progress * 100}%`, background: 'var(--wa-green)' }}
              />
            </div>
          </div>
        )}

        {/* Feedback */}
        {sendResult && (
          <div className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm"
            style={{ background: sendResult.ok ? 'var(--wa-light-green)' : '#FEE2E2', color: sendResult.ok ? 'var(--wa-dark-green)' : '#991B1B' }}>
            {sendResult.ok ? <CheckCircle size={14} /> : <AlertCircle size={14} />}
            {sendResult.msg}
          </div>
        )}

        {/* Botões */}
        <div className="flex gap-2">
          <button
            onClick={handleToggle}
            disabled={!canStart && !sched.running}
            className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-xl font-semibold text-sm disabled:opacity-40 transition-opacity"
            style={{ background: sched.running ? '#EF4444' : 'var(--wa-green)', color: 'white' }}
          >
            {sched.running
              ? <><Square size={16} />Parar bot</>
              : <><Play size={16} />Iniciar bot</>}
          </button>

          <button
            onClick={handleSendNow}
            disabled={messages.length === 0 || sending}
            className="flex items-center justify-center gap-2 px-4 py-3.5 rounded-xl font-semibold text-sm disabled:opacity-40 transition-opacity"
            style={{ background: 'var(--secondary)', color: 'var(--foreground)' }}
            title="Enviar agora (ignora o timer)"
          >
            {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
          </button>
        </div>

        {!canStart && !sched.running && messages.length > 0 && (
          <p className="text-xs text-center text-muted-foreground">
            {isWaReady
              ? 'Ative "Enviar para grupos" com ao menos um grupo, ou ative "Postar no Status".'
              : 'Adicione ao menos uma mensagem na aba Mensagens.'}
          </p>
        )}
        {messages.length === 0 && (
          <p className="text-xs text-center text-muted-foreground">
            Adicione ao menos uma mensagem na aba <strong>Mensagens</strong>.
          </p>
        )}
      </div>

      {/* Como funciona */}
      <div className="rounded-2xl border p-4 space-y-2"
        style={{ background: 'rgba(37,211,102,0.05)', borderColor: 'rgba(37,211,102,0.2)' }}>
        <p className="text-xs font-semibold" style={{ color: 'var(--wa-dark-green)' }}>Como funciona</p>
        <ol className="text-xs text-muted-foreground space-y-1 list-decimal list-inside">
          <li>Conecte seu WhatsApp escaneando o QR Code acima.</li>
          <li>Adicione mensagens na aba <strong>Mensagens</strong>.</li>
          <li>Busque e adicione <strong>múltiplos grupos</strong> — cada disparo vai para todos ao mesmo tempo.</li>
          <li>Clique em <strong>Iniciar bot</strong> para começar.</li>
          <li>O bot roda no servidor — feche o navegador sem preocupação.</li>
        </ol>
      </div>
    </div>
  );
}
