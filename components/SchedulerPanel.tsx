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
  Server,
} from 'lucide-react';

function pad(n: number) { return String(n).padStart(2, '0'); }
function formatCountdown(s: number) { return `${pad(Math.floor(s / 60))}:${pad(s % 60)}`; }

// ── Scheduler state ───────────────────────────────────────────────────────────

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

// ── API helpers ───────────────────────────────────────────────────────────────

async function waPost(path: string, body?: unknown) {
  const res = await fetch(`/api/wa/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.json();
}

async function waGet(path: string) {
  const res = await fetch(`/api/wa/${path}`);
  return res.json();
}

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
  const { state: waState, fetchGroups } = useWhatsApp();
  const { addHistoryDb } = useHistoryDb();
  const { refreshMessages } = useMessagesDb();

  const [sched, setSched] = useState<SchedulerState>(DEFAULT_SCHEDULER);
  const [sendResult, setSendResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [sending, setSending] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [groups, setGroups] = useState<WaGroup[]>([]);
  const [groupsLoading, setGroupsLoading] = useState(false);
  const [fallbackPhone, setFallbackPhone] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [serverOffline, setServerOffline] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const totalSecondsRef = useRef(0);

  const isWaReady = waState.status === 'ready';

  // ── Polling do estado do scheduler no wa-server ───────────────────────────
  const pollScheduler = useCallback(async () => {
    try {
      const data = await waGet('scheduler/state') as Partial<SchedulerState> & { error?: string };
      if (data.error) { setServerOffline(true); return; }
      setServerOffline(false);
      setSched((s) => ({
        ...s,
        running:         data.running         ?? s.running,
        intervalMinutes: data.intervalMinutes  ?? s.intervalMinutes,
        jitterPercent:   data.jitterPercent    ?? s.jitterPercent,
        scheduleEnabled: data.scheduleEnabled  ?? s.scheduleEnabled,
        scheduleStart:   data.scheduleStart    ?? s.scheduleStart,
        scheduleEnd:     data.scheduleEnd      ?? s.scheduleEnd,
        statusEnabled:   data.statusEnabled    ?? s.statusEnabled,
        groupsEnabled:   data.groupsEnabled    ?? s.groupsEnabled,
        targets:         data.targets          ?? s.targets,
        currentIndex:    data.currentIndex     ?? s.currentIndex,
        nextFireAt:      data.nextFireAt       ?? s.nextFireAt,
      }));
    } catch {
      setServerOffline(true);
    }
  }, []);

  // Carrega estado inicial e depois faz polling a cada 5s
  useEffect(() => {
    pollScheduler();
    const id = setInterval(pollScheduler, 5000);
    return () => clearInterval(id);
  }, [pollScheduler]);

  // ── Countdown baseado em nextFireAt ───────────────────────────────────────
  useEffect(() => {
    const id = setInterval(() => {
      if (!sched.running || !sched.nextFireAt) { setSecondsLeft(0); return; }
      const remaining = Math.max(0, Math.round((sched.nextFireAt - Date.now()) / 1000));
      setSecondsLeft(remaining);
      if (totalSecondsRef.current === 0) totalSecondsRef.current = sched.intervalMinutes * 60;
    }, 1000);
    return () => clearInterval(id);
  }, [sched.running, sched.nextFireAt, sched.intervalMinutes]);

  useEffect(() => {
    totalSecondsRef.current = sched.intervalMinutes * 60;
  }, [sched.intervalMinutes]);

  // ── Envia config atualizada para o wa-server (debounce 800ms) ────────────
  const configTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pushConfig = useCallback((patch: Partial<SchedulerState>) => {
    setSched((s) => {
      const next = { ...s, ...patch };
      if (configTimer.current) clearTimeout(configTimer.current);
      configTimer.current = setTimeout(() => {
        waPost('scheduler/config', {
          intervalMinutes: next.intervalMinutes,
          jitterPercent:   next.jitterPercent,
          scheduleEnabled: next.scheduleEnabled,
          scheduleStart:   next.scheduleStart,
          scheduleEnd:     next.scheduleEnd,
          statusEnabled:   next.statusEnabled,
          groupsEnabled:   next.groupsEnabled,
          targets:         next.targets,
          currentIndex:    next.currentIndex,
        }).catch(() => {});
      }, 800);
      return next;
    });
  }, []);

  const handleAddTarget = useCallback((t: Target) => {
    setSched((s) => {
      if (s.targets.some((x) => x.id === t.id)) return s;
      const targets = [...s.targets, t];
      pushConfig({ targets });
      return { ...s, targets };
    });
  }, [pushConfig]);

  const handleRemoveTarget = useCallback((id: string) => {
    setSched((s) => {
      const targets = s.targets.filter((t) => t.id !== id);
      pushConfig({ targets });
      return { ...s, targets };
    });
  }, [pushConfig]);

  // ── Grupos ────────────────────────────────────────────────────────────────
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

  // ── Toggle ligar/desligar (chama wa-server) ───────────────────────────────
  const handleToggle = useCallback(async () => {
    setToggling(true);
    try {
      if (sched.running) {
        await waPost('scheduler/stop');
        setSched((s) => ({ ...s, running: false, nextFireAt: null }));
        setSecondsLeft(0);
      } else {
        const config = {
          intervalMinutes: sched.intervalMinutes,
          jitterPercent:   sched.jitterPercent,
          scheduleEnabled: sched.scheduleEnabled,
          scheduleStart:   sched.scheduleStart,
          scheduleEnd:     sched.scheduleEnd,
          statusEnabled:   sched.statusEnabled,
          groupsEnabled:   sched.groupsEnabled,
          targets:         sched.targets,
        };
        const data = await waPost('scheduler/start', config) as Partial<SchedulerState>;
        setSched((s) => ({ ...s, ...data, running: true }));
        totalSecondsRef.current = sched.intervalMinutes * 60;
      }
      setTimeout(pollScheduler, 1000);
    } finally {
      setToggling(false);
    }
  }, [sched, pollScheduler]);

  // ── Envio manual imediato ─────────────────────────────────────────────────
  const handleSendNow = async () => {
    if (sending) return;
    setSending(true);
    setSendResult(null);
    try {
      if (isWaReady && !serverOffline) {
        await waPost('scheduler/fire');
        setSendResult({ ok: true, msg: 'Disparado! Verifique o histórico em instantes.' });
        setTimeout(() => { refreshMessages(); setSendResult(null); pollScheduler(); }, 2000);
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

  const canStart = messages.length > 0 && !serverOffline && (
    isWaReady
      ? (sched.targets.length > 0 && sched.groupsEnabled) || sched.statusEnabled
      : true
  );

  const progressTotal = totalSecondsRef.current > 0 ? totalSecondsRef.current : sched.intervalMinutes * 60;
  const progress = progressTotal > 0 ? Math.max(0, Math.min(1, secondsLeft / progressTotal)) : 0;

  return (
    <div className="space-y-4">
      <WhatsAppConnector />

      {/* Banner: wa-server offline */}
      {serverOffline && (
        <div className="rounded-xl border px-3 py-2.5 flex items-center gap-2 text-sm"
          style={{ background: 'rgba(239,68,68,0.08)', borderColor: 'rgba(239,68,68,0.3)', color: '#ef4444' }}>
          <AlertCircle size={15} className="shrink-0" />
          <span>wa-server não está respondendo. Verifique se o <code className="text-xs">node wa-server.js</code> e o ngrok estão rodando no seu PC.</span>
        </div>
      )}

      {/* Banner: bot rodando no servidor */}
      {sched.running && !serverOffline && (
        <div className="rounded-xl border px-3 py-2.5 flex items-center gap-2 text-sm"
          style={{ background: 'rgba(37,211,102,0.08)', borderColor: 'rgba(37,211,102,0.3)', color: 'var(--wa-dark-green)' }}>
          <Server size={14} className="shrink-0" />
          <span>Bot rodando no servidor do seu PC — funciona mesmo com o site fechado.</span>
        </div>
      )}

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
            <div className="rounded-xl border p-3 flex items-center justify-between gap-3"
              style={{ borderColor: sched.groupsEnabled ? 'rgba(37,211,102,0.4)' : 'var(--border)', background: sched.groupsEnabled ? 'rgba(37,211,102,0.06)' : 'transparent' }}>
              <div className="flex items-center gap-2 min-w-0">
                <Users size={15} style={{ color: sched.groupsEnabled ? 'var(--wa-green)' : 'var(--muted-foreground)', flexShrink: 0 }} />
                <div className="min-w-0">
                  <p className="text-xs font-semibold leading-tight" style={{ color: sched.groupsEnabled ? 'var(--wa-dark-green)' : 'var(--foreground)' }}>Enviar para os grupos</p>
                  <p className="text-xs text-muted-foreground leading-tight mt-0.5">
                    {sched.groupsEnabled
                      ? sched.targets.length > 0 ? `${sched.targets.length} grupo${sched.targets.length > 1 ? 's' : ''} selecionado${sched.targets.length > 1 ? 's' : ''}` : 'Nenhum grupo selecionado acima'
                      : 'Ativar para enviar para os grupos selecionados'}
                  </p>
                </div>
              </div>
              <button type="button" onClick={() => pushConfig({ groupsEnabled: !sched.groupsEnabled })}
                className="w-10 h-5 rounded-full relative transition-colors shrink-0"
                style={{ background: sched.groupsEnabled ? 'var(--wa-green)' : 'var(--border)' }}>
                <span className="absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all"
                  style={{ left: sched.groupsEnabled ? '22px' : '2px' }} />
              </button>
            </div>

            <div className="rounded-xl border p-3 flex items-center justify-between gap-3"
              style={{ borderColor: sched.statusEnabled ? 'rgba(37,211,102,0.4)' : 'var(--border)', background: sched.statusEnabled ? 'rgba(37,211,102,0.06)' : 'transparent' }}>
              <div className="flex items-center gap-2 min-w-0">
                <Radio size={15} style={{ color: sched.statusEnabled ? 'var(--wa-green)' : 'var(--muted-foreground)', flexShrink: 0 }} />
                <div className="min-w-0">
                  <p className="text-xs font-semibold leading-tight" style={{ color: sched.statusEnabled ? 'var(--wa-dark-green)' : 'var(--foreground)' }}>Postar no Status do WhatsApp</p>
                  <p className="text-xs text-muted-foreground leading-tight mt-0.5">
                    {sched.statusEnabled ? 'Cada envio também posta no seu Status/Story' : 'Ativar para postar no Status junto com os grupos'}
                  </p>
                </div>
              </div>
              <button type="button" onClick={() => pushConfig({ statusEnabled: !sched.statusEnabled })}
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
            <input type="range" min={1} max={120} step={1}
              value={sched.intervalMinutes}
              onChange={(e) => pushConfig({ intervalMinutes: Number(e.target.value) })}
              className="flex-1 accent-green-500"
              disabled={sched.running}
            />
            <div className="flex items-center gap-1 rounded-xl border px-2 py-1" style={{ borderColor: 'var(--border)', background: 'var(--secondary)', color: 'var(--foreground)', minWidth: 80 }}>
              <button onClick={() => pushConfig({ intervalMinutes: Math.max(1, sched.intervalMinutes - 1) })} disabled={sched.running || sched.intervalMinutes <= 1}
                className="w-6 h-6 flex items-center justify-center rounded-lg disabled:opacity-30 hover:opacity-70">
                <ChevronDown size={14} />
              </button>
              <span className="text-sm font-semibold flex-1 text-center" translate="no">{sched.intervalMinutes}m</span>
              <button onClick={() => pushConfig({ intervalMinutes: Math.min(120, sched.intervalMinutes + 1) })} disabled={sched.running || sched.intervalMinutes >= 120}
                className="w-6 h-6 flex items-center justify-center rounded-lg disabled:opacity-30 hover:opacity-70">
                <ChevronUp size={14} />
              </button>
            </div>
          </div>
        </div>

        {/* Configurações avançadas */}
        <button onClick={() => setShowAdvanced(!showAdvanced)}
          className="w-full flex items-center justify-between text-xs font-semibold py-1 hover:opacity-70 transition-opacity"
          style={{ color: 'var(--muted-foreground)' }}>
          <span className="flex items-center gap-1.5"><ShieldCheck size={13} /> Configurações avançadas</span>
          {showAdvanced ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>

        {showAdvanced && (
          <div className="space-y-4 pt-1">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold flex items-center gap-1.5" style={{ color: 'var(--wa-dark-green)' }}>
                <ShieldCheck size={13} /> Variação aleatória anti-ban
              </label>
              <div className="flex items-center gap-3">
                <input type="range" min={0} max={50} step={5}
                  value={sched.jitterPercent}
                  onChange={(e) => pushConfig({ jitterPercent: Number(e.target.value) })}
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

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold flex items-center gap-1.5" style={{ color: 'var(--wa-dark-green)' }}>
                  <CalendarClock size={13} /> Horário de funcionamento
                </label>
                <button type="button" onClick={() => pushConfig({ scheduleEnabled: !sched.scheduleEnabled })}
                  className="w-10 h-5 rounded-full relative transition-colors"
                  style={{ background: sched.scheduleEnabled ? 'var(--wa-green)' : 'var(--border)' }}>
                  <span className="absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all"
                    style={{ left: sched.scheduleEnabled ? '22px' : '2px' }} />
                </button>
              </div>
              {sched.scheduleEnabled && (
                <div className="flex items-center gap-2">
                  <input type="time" value={sched.scheduleStart}
                    onChange={(e) => pushConfig({ scheduleStart: e.target.value })}
                    className="flex-1 text-sm rounded-xl border px-3 py-2 focus:outline-none"
                    style={{ borderColor: 'var(--border)', background: 'var(--secondary)', color: 'var(--foreground)' }} />
                  <span className="text-xs text-muted-foreground">até</span>
                  <input type="time" value={sched.scheduleEnd}
                    onChange={(e) => pushConfig({ scheduleEnd: e.target.value })}
                    className="flex-1 text-sm rounded-xl border px-3 py-2 focus:outline-none"
                    style={{ borderColor: 'var(--border)', background: 'var(--secondary)', color: 'var(--foreground)' }} />
                </div>
              )}
              {sched.scheduleEnabled && (
                <p className="text-xs text-muted-foreground">
                  O bot só enviará entre {sched.scheduleStart} e {sched.scheduleEnd}.
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
              <div className="h-full rounded-full transition-all duration-1000"
                style={{ width: `${progress * 100}%`, background: 'var(--wa-green)' }} />
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
            disabled={(!canStart && !sched.running) || toggling || serverOffline}
            className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-xl font-semibold text-sm disabled:opacity-40 transition-opacity"
            style={{ background: sched.running ? '#EF4444' : 'var(--wa-green)', color: 'white' }}
          >
            {toggling
              ? <Loader2 size={16} className="animate-spin" />
              : sched.running ? <><Square size={16} />Parar bot</> : <><Play size={16} />Iniciar bot</>}
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

        {!canStart && !sched.running && messages.length > 0 && !serverOffline && (
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
          <li>Selecione os grupos de destino e clique em <strong>Iniciar bot</strong>.</li>
          <li>O bot roda no <strong>wa-server.js no seu PC</strong> — feche o site sem preocupação.</li>
          <li>O site fechado não para o bot. Só fechar o PowerShell para o bot.</li>
        </ol>
      </div>
    </div>
  );
}
