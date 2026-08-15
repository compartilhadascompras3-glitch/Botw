'use client';

import { useRef, useState, useEffect } from 'react';
import Image from 'next/image';
import { useBotStore, BotMessage, Target } from '@/store/botStore';
import { useMessagesDb } from '@/hooks/use-messages-db';
import {
  Plus, Trash2, Edit2, Check, X, GripVertical,
  ImagePlus, FileText, Film, Music, Paperclip, Zap,
  Send, Loader2, CheckCircle, AlertCircle,
} from 'lucide-react';
import { PromoGenerator } from './PromoGenerator';
import { useWhatsApp } from '@/hooks/use-whatsapp';

// ── SendOnceToggle ────────────────────────────────────────────────────────────

function SendOnceToggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl border text-sm font-medium transition-all"
      style={{
        borderColor: value ? '#F59E0B' : 'var(--border)',
        background: value ? '#FFFBEB' : 'var(--secondary)',
        color: value ? '#92400E' : 'var(--muted-foreground)',
      }}
    >
      <span
        className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
        style={{ background: value ? '#FDE68A' : 'var(--border)', color: value ? '#92400E' : 'var(--muted-foreground)' }}
      >
        <Zap size={14} fill={value ? 'currentColor' : 'none'} />
      </span>
      <div className="flex-1 text-left">
        <span className="block text-xs font-semibold" style={{ color: value ? '#92400E' : 'var(--foreground)' }}>
          Enviar 1x e apagar
        </span>
        <span className="block text-xs" style={{ color: value ? '#B45309' : 'var(--muted-foreground)' }}>
          {value ? 'Ativo — será removida após o envio' : 'Inativo — fica na fila e se repete'}
        </span>
      </div>
      {/* Toggle pill */}
      <span
        className="w-9 h-5 rounded-full shrink-0 relative transition-colors"
        style={{ background: value ? '#F59E0B' : 'var(--border)' }}
      >
        <span
          className="absolute top-0.5 w-4 h-4 rounded-full shadow transition-all"
          style={{ background: 'white', left: value ? '18px' : '2px' }}
        />
      </span>
    </button>
  );
}

// ── helpers ──────────────────────────────────────────────────────────────────

const ACCEPT = 'image/*,video/*,audio/*,application/pdf,.pdf,.doc,.docx,.xls,.xlsx,.txt';
const MAX_MB = 16;

function mediaIcon(type?: string) {
  if (!type) return <Paperclip size={13} />;
  if (type.startsWith('image/')) return <ImagePlus size={13} />;
  if (type.startsWith('video/')) return <Film size={13} />;
  if (type.startsWith('audio/')) return <Music size={13} />;
  return <FileText size={13} />;
}

function readAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/** Comprime imagens para JPEG ≤800KB de base64 (~600KB de arquivo) */
async function compressImage(file: File): Promise<{ dataUrl: string; name: string; type: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      const img = new window.Image();
      img.onerror = reject;
      img.onload = () => {
        const MAX_B64 = 800 * 1024; // 800KB de base64
        const canvas = document.createElement('canvas');
        let { width, height } = img;

        // Reduz dimensões se muito grande
        const MAX_DIM = 1600;
        if (width > MAX_DIM || height > MAX_DIM) {
          const ratio = Math.min(MAX_DIM / width, MAX_DIM / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }
        canvas.width = width;
        canvas.height = height;
        canvas.getContext('2d')!.drawImage(img, 0, 0, width, height);

        // Tenta qualidades decrescentes até caber em 800KB
        let quality = 0.85;
        let dataUrl = canvas.toDataURL('image/jpeg', quality);
        while (dataUrl.length > MAX_B64 && quality > 0.3) {
          quality -= 0.1;
          dataUrl = canvas.toDataURL('image/jpeg', quality);
        }

        resolve({ dataUrl, name: file.name.replace(/\.[^.]+$/, '.jpg'), type: 'image/jpeg' });
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

// ── MediaPicker ───────────────────────────────────────────────────────────────

function MediaPicker({
  dataUrl,
  name,
  type,
  onChange,
  onRemove,
}: {
  dataUrl?: string;
  name?: string;
  type?: string;
  onChange: (dataUrl: string, name: string, type: string) => void;
  onRemove: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState('');

  const handleFile = async (file: File) => {
    setError('');
    if (file.size > MAX_MB * 1024 * 1024) {
      setError(`Arquivo muito grande. Máximo ${MAX_MB} MB.`);
      return;
    }
    if (file.type.startsWith('image/')) {
      // Comprime imagens para ≤800KB de base64 antes de salvar
      const compressed = await compressImage(file);
      onChange(compressed.dataUrl, compressed.name, compressed.type);
    } else {
      const url = await readAsDataURL(file);
      onChange(url, file.name, file.type);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  if (dataUrl && type?.startsWith('image/')) {
    return (
      <div className="relative rounded-xl overflow-hidden border" style={{ borderColor: 'var(--border)' }}>
        <Image src={dataUrl} alt={name ?? 'mídia'} width={400} height={220}
          className="w-full object-cover max-h-48" style={{ objectFit: 'cover' }} />
        <button
          onClick={onRemove}
          className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full flex items-center justify-center shadow"
          style={{ background: 'rgba(0,0,0,0.55)', color: 'white' }}
          title="Remover imagem"
        >
          <X size={12} />
        </button>
      </div>
    );
  }

  if (dataUrl) {
    return (
      <div className="flex items-center gap-2 rounded-xl border px-3 py-2" style={{ borderColor: 'var(--border)', background: 'var(--secondary)' }}>
        <span style={{ color: 'var(--wa-dark-green)' }}>{mediaIcon(type)}</span>
        <span className="flex-1 text-xs truncate text-muted-foreground">{name}</span>
        <button onClick={onRemove} className="text-muted-foreground hover:text-destructive transition-colors" title="Remover">
          <X size={13} />
        </button>
      </div>
    );
  }

  return (
    <div>
      <input ref={inputRef} type="file" accept={ACCEPT} className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ''; }} />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        onDrop={handleDrop}
        onDragOver={(e) => e.preventDefault()}
        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-dashed text-xs font-medium transition-opacity hover:opacity-80"
        style={{ borderColor: 'var(--wa-green)', color: 'var(--wa-dark-green)', background: 'rgba(37,211,102,0.04)' }}
      >
        <ImagePlus size={15} />
        Anexar imagem / vídeo / documento
      </button>
      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
      <p className="text-xs text-muted-foreground mt-1">Máx. {MAX_MB} MB · imagem, vídeo, áudio ou documento</p>
    </div>
  );
}

// ── MessageCard ───────────────────────────────────────────────────────────────

function MessageCard({
  message, index, isNext, onEdit, onDelete, onSendNow,
}: {
  message: BotMessage;
  index: number;
  isNext: boolean;
  onEdit: (id: string, patch: Partial<Pick<BotMessage, 'text' | 'mediaDataUrl' | 'mediaName' | 'mediaType' | 'sendOnce'>>) => void;
  onDelete: (id: string) => void;
  onSendNow: (msg: BotMessage) => Promise<{ groupsSent: number; statusPosted: boolean }>;
}) {
  const [editing, setEditing] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendFeedback, setSendFeedback] = useState<{ ok: boolean; msg: string } | null>(null);
  const [draftText, setDraftText] = useState(message.text);
  const [draftSendOnce, setDraftSendOnce] = useState(!!message.sendOnce);
  const [draftMedia, setDraftMedia] = useState<{ dataUrl: string; name: string; type: string } | null>(
    message.mediaDataUrl ? { dataUrl: message.mediaDataUrl, name: message.mediaName ?? '', type: message.mediaType ?? '' } : null
  );
  // Lazy-load: se hasMedia=true mas mediaDataUrl ainda não carregou, busca do banco
  const [loadedDataUrl, setLoadedDataUrl] = useState<string | undefined>(message.mediaDataUrl);
  useEffect(() => {
    if (message.mediaDataUrl) { setLoadedDataUrl(message.mediaDataUrl); return; }
    if (!message.hasMedia) return;
    fetch(`/api/messages?id=${encodeURIComponent(message.id)}`)
      .then(r => r.ok ? r.json() : null)
      .then((row: { mediaDataUrl?: string; mediaName?: string; mediaType?: string } | null) => {
        if (row?.mediaDataUrl) setLoadedDataUrl(row.mediaDataUrl);
      })
      .catch(() => { /* sem imagem */ });
  }, [message.id, message.hasMedia, message.mediaDataUrl]);

  const handleSave = () => {
    if (!draftText.trim() && !draftMedia) return;
    onEdit(message.id, {
      text: draftText.trim(),
      mediaDataUrl: draftMedia?.dataUrl,
      mediaName: draftMedia?.name,
      mediaType: draftMedia?.type,
      sendOnce: draftSendOnce,
    });
    setEditing(false);
  };

  const handleCancel = () => {
    setDraftText(message.text);
    setDraftMedia(message.mediaDataUrl ? { dataUrl: message.mediaDataUrl, name: message.mediaName ?? '', type: message.mediaType ?? '' } : null);
    setEditing(false);
  };

  const handleSendNow = async () => {
    setSending(true);
    setSendFeedback(null);
    try {
      // Garante que a imagem está carregada antes de enviar
      let msgToSend = message;
      if (message.hasMedia && !message.mediaDataUrl && !loadedDataUrl) {
        try {
          const row = await fetch(`/api/messages?id=${encodeURIComponent(message.id)}`).then(r => r.json()) as { mediaDataUrl?: string; mediaName?: string; mediaType?: string };
          if (row.mediaDataUrl) {
            setLoadedDataUrl(row.mediaDataUrl);
            msgToSend = { ...message, mediaDataUrl: row.mediaDataUrl, mediaName: row.mediaName, mediaType: row.mediaType };
          }
        } catch { /* sem imagem */ }
      } else if (loadedDataUrl && !message.mediaDataUrl) {
        msgToSend = { ...message, mediaDataUrl: loadedDataUrl };
      }
      const result = await onSendNow(msgToSend);
      const parts: string[] = [];
      if (result.groupsSent > 0) parts.push(`${result.groupsSent} grupo${result.groupsSent > 1 ? 's' : ''}`);
      if (result.statusPosted) parts.push('Status');
      setSendFeedback({ ok: true, msg: `Enviado: ${parts.join(' + ')} ✓` });
    } catch (e: unknown) {
      setSendFeedback({ ok: false, msg: e instanceof Error ? e.message : 'Erro ao enviar' });
    } finally {
      setSending(false);
      setTimeout(() => setSendFeedback(null), 5000);
    }
  };

  const hasMedia = !!(message.hasMedia || message.mediaDataUrl || loadedDataUrl);
  const displayDataUrl = loadedDataUrl ?? message.mediaDataUrl;

  return (
    <div className="rounded-2xl shadow-sm border overflow-hidden transition-all"
      style={{ background: 'var(--card)', borderColor: isNext ? 'var(--wa-green)' : 'var(--border)', borderWidth: isNext ? 2 : 1 }}>

      <div className="flex items-start gap-3 p-3">
        {/* Number badge */}
        <div className="flex flex-col items-center gap-1 pt-0.5 shrink-0">
          <GripVertical size={16} className="text-muted-foreground cursor-grab" />
          <span className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold"
            style={{ background: isNext ? 'var(--wa-green)' : 'var(--secondary)', color: isNext ? 'white' : 'var(--muted-foreground)' }}>
            {index + 1}
          </span>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0 space-y-2">
          {isNext && (
            <span className="inline-block text-xs font-semibold px-2 py-0.5 rounded-full"
              style={{ background: 'var(--wa-light-green)', color: 'var(--wa-dark-green)' }}>
              Próxima a enviar
            </span>
          )}

          {editing ? (
            <>
              <textarea
                className="w-full text-sm rounded-lg border px-3 py-2 resize-none focus:outline-none focus:ring-2"
                style={{ borderColor: 'var(--wa-green)', minHeight: 72, background: 'var(--secondary)', color: 'var(--foreground)' }}
                placeholder="Texto da mensagem (opcional se houver mídia)"
                value={draftText}
                onChange={(e) => setDraftText(e.target.value)}
                autoFocus
                onKeyDown={(e) => { if (e.key === 'Escape') handleCancel(); }}
              />
              <MediaPicker
                dataUrl={draftMedia?.dataUrl}
                name={draftMedia?.name}
                type={draftMedia?.type}
                onChange={(dataUrl, name, type) => setDraftMedia({ dataUrl, name, type })}
                onRemove={() => setDraftMedia(null)}
              />
              <SendOnceToggle value={draftSendOnce} onChange={setDraftSendOnce} />
            </>
          ) : (
            <>
              {/* sendOnce badge */}
              {message.sendOnce && (
                <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full"
                  style={{ background: '#FDE68A', color: '#92400E' }}>
                  <Zap size={10} fill="currentColor" /> Enviar 1x e apagar
                </span>
              )}
              {/* Media preview (read mode) */}
              {hasMedia && message.mediaType?.startsWith('image/') && (
                <div className="rounded-xl overflow-hidden border" style={{ borderColor: 'var(--border)' }}>
                  {displayDataUrl
                    ? <Image src={displayDataUrl} alt={message.mediaName ?? 'imagem'}
                        width={400} height={200} className="w-full object-cover max-h-40" style={{ objectFit: 'cover' }} />
                    : <div className="w-full max-h-40 h-24 flex items-center justify-center animate-pulse"
                        style={{ background: 'var(--secondary)' }}>
                        <span className="text-xs text-muted-foreground">Carregando imagem…</span>
                      </div>
                  }
                </div>
              )}
              {hasMedia && !message.mediaType?.startsWith('image/') && (
                <div className="flex items-center gap-2 rounded-xl px-3 py-2"
                  style={{ background: 'var(--secondary)' }}>
                  <span style={{ color: 'var(--wa-dark-green)' }}>{mediaIcon(message.mediaType)}</span>
                  <span className="text-xs text-muted-foreground truncate">{message.mediaName ?? 'arquivo'}</span>
                </div>
              )}
              {message.text && (
                <p className="text-sm whitespace-pre-wrap break-words text-foreground">{message.text}</p>
              )}
              {!message.text && !hasMedia && (
                <p className="text-sm text-muted-foreground italic">Mensagem vazia</p>
              )}
            </>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 shrink-0">
          {editing ? (
            <>
              <button onClick={handleSave} disabled={!draftText.trim() && !draftMedia}
                className="p-1.5 rounded-full hover:opacity-80 disabled:opacity-40"
                style={{ background: 'var(--wa-green)', color: 'white' }} title="Salvar">
                <Check size={14} />
              </button>
              <button onClick={handleCancel}
                className="p-1.5 rounded-full"
                style={{ background: 'var(--secondary)', color: 'var(--muted-foreground)' }} title="Cancelar">
                <X size={14} />
              </button>
            </>
          ) : (
            <>
              <button
                onClick={handleSendNow}
                disabled={sending}
                className="p-1.5 rounded-full hover:opacity-80 disabled:opacity-40"
                style={{ background: 'var(--wa-light-green)', color: 'var(--wa-dark-green)' }}
                title="Enviar agora (grupos + Status)"
              >
                {sending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
              </button>
              <button onClick={() => { setDraftText(message.text); setEditing(true); }}
                className="p-1.5 rounded-full hover:opacity-80"
                style={{ background: 'var(--secondary)', color: 'var(--muted-foreground)' }} title="Editar">
                <Edit2 size={14} />
              </button>
              <button onClick={() => onDelete(message.id)}
                className="p-1.5 rounded-full hover:opacity-80"
                style={{ background: '#FEE2E2', color: '#EF4444' }} title="Remover">
                <Trash2 size={14} />
              </button>
            </>
          )}
        </div>
      </div>

      {sendFeedback && (
        <div className="flex items-center gap-2 px-4 py-2 text-xs font-medium border-t"
          style={{
            background: sendFeedback.ok ? 'var(--wa-light-green)' : '#FEE2E2',
            color: sendFeedback.ok ? 'var(--wa-dark-green)' : '#991B1B',
            borderColor: sendFeedback.ok ? 'rgba(37,211,102,0.2)' : '#FECACA',
          }}>
          {sendFeedback.ok ? <CheckCircle size={13} /> : <AlertCircle size={13} />}
          {sendFeedback.msg}
        </div>
      )}
    </div>
  );
}

// ── MessageList ───────────────────────────────────────────────────────────────

export function MessageList() {
  const { messages, currentIndex, targets } = useBotStore();
  const { addMessage, updateMessage, removeMessage, refreshMessages } = useMessagesDb();
  const { state: waState, sendMessage, postStatus } = useWhatsApp();
  const [showForm, setShowForm] = useState(false);

  const handleSendNow = async (msg: BotMessage): Promise<{ groupsSent: number; statusPosted: boolean }> => {
    if (waState.status !== 'ready') {
      throw new Error('WhatsApp não conectado. Conecte primeiro na aba de conexão.');
    }

    const media = msg.mediaDataUrl
      ? { dataUrl: msg.mediaDataUrl, type: msg.mediaType ?? 'application/octet-stream', name: msg.mediaName ?? 'arquivo' }
      : undefined;

    // Dispara grupos e status em paralelo
    const groupTargets = targets.length > 0 ? targets : [];
    const [groupResults, statusResult] = await Promise.all([
      groupTargets.length > 0
        ? Promise.all(groupTargets.map((t: Target) => sendMessage(t.id, msg.text, media)))
        : Promise.resolve([]),
      postStatus(msg.text, media),
    ]);

    const groupsSent = groupResults.filter((r) => r.ok).length;
    const statusPosted = statusResult.ok;

    // Falha total: nenhum grupo enviado E status falhou
    if (groupTargets.length > 0 && groupsSent === 0 && !statusPosted) {
      throw new Error(groupResults[0]?.error ?? 'Falha ao enviar');
    }

    return { groupsSent, statusPosted };
  };
  const [newText, setNewText] = useState('');
  const [newMedia, setNewMedia] = useState<{ dataUrl: string; name: string; type: string } | null>(null);
  const [newSendOnce, setNewSendOnce] = useState(false);

  const handleAdd = () => {
    if (!newText.trim() && !newMedia) return;
    addMessage({
      text: newText.trim(),
      mediaDataUrl: newMedia?.dataUrl,
      mediaName: newMedia?.name,
      mediaType: newMedia?.type,
      sendOnce: newSendOnce,
    });
    setNewText('');
    setNewMedia(null);
    setNewSendOnce(false);
    setShowForm(false);
    setTimeout(() => refreshMessages(), 400);
  };

  const handleCancel = () => { setShowForm(false); setNewText(''); setNewMedia(null); setNewSendOnce(false); };

  const canAdd = !!(newText.trim() || newMedia);

  return (
    <div className="space-y-4">
      {/* AI Promo Generator */}
      <PromoGenerator />

      {/* Add form */}
      {showForm ? (
        <div className="rounded-2xl shadow-sm border p-4 space-y-3"
          style={{ background: 'var(--card)', borderColor: 'var(--wa-green)', borderWidth: 2 }}>
          <p className="text-sm font-semibold" style={{ color: 'var(--wa-dark-green)' }}>Nova mensagem</p>

          <textarea
            className="w-full text-sm rounded-xl border px-3 py-2 resize-none focus:outline-none focus:ring-2"
            style={{ borderColor: 'var(--wa-green)', minHeight: 90, background: 'var(--secondary)', color: 'var(--foreground)' }}
            placeholder="Texto da mensagem (opcional se anexar mídia)..."
            value={newText}
            onChange={(e) => setNewText(e.target.value)}
            autoFocus
            onKeyDown={(e) => { if (e.key === 'Escape') handleCancel(); }}
          />

          <MediaPicker
            dataUrl={newMedia?.dataUrl}
            name={newMedia?.name}
            type={newMedia?.type}
            onChange={(dataUrl, name, type) => setNewMedia({ dataUrl, name, type })}
            onRemove={() => setNewMedia(null)}
          />

          <SendOnceToggle value={newSendOnce} onChange={setNewSendOnce} />

          <p className="text-xs text-muted-foreground">Esc para cancelar</p>

          <div className="flex gap-2">
            <button onClick={handleAdd} disabled={!canAdd}
              className="flex-1 py-2 rounded-xl text-sm font-semibold disabled:opacity-40"
              style={{ background: 'var(--wa-green)', color: 'white' }}>
              Adicionar mensagem
            </button>
            <button onClick={handleCancel}
              className="px-4 py-2 rounded-xl text-sm font-medium"
              style={{ background: 'var(--secondary)', color: 'var(--muted-foreground)' }}>
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        <button onClick={() => setShowForm(true)}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl border-2 border-dashed text-sm font-medium hover:opacity-80"
          style={{ borderColor: 'var(--wa-green)', color: 'var(--wa-dark-green)', background: 'rgba(37,211,102,0.05)' }}>
          <Plus size={18} />
          Adicionar mensagem
        </button>
      )}

      {/* List */}
      {messages.length === 0 ? (
        <div className="text-center py-12 space-y-2">
          <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-3"
            style={{ background: 'var(--secondary)' }}>
            <span className="text-3xl">💬</span>
          </div>
          <p className="font-medium text-foreground">Nenhuma mensagem ainda</p>
          <p className="text-sm text-muted-foreground">Adicione mensagens acima para o bot enviar automaticamente.</p>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground px-1">
            {messages.length} {messages.length === 1 ? 'mensagem' : 'mensagens'} ·{' '}
            {messages.filter(m => m.sendOnce).length > 0
              ? `${messages.filter(m => m.sendOnce).length} envio único · restantes repetem em ciclo`
              : 'enviadas em ordem, rotacionando'}
          </p>
          {messages.map((msg, i) => (
            <MessageCard
              key={msg.id}
              message={msg}
              index={i}
              isNext={i === currentIndex}
              onEdit={(id, patch) => { updateMessage(id, patch); setTimeout(() => refreshMessages(), 400); }}
              onDelete={(id) => { removeMessage(id); setTimeout(() => refreshMessages(), 400); }}
              onSendNow={async (m) => { const r = await handleSendNow(m); setTimeout(() => refreshMessages(), 600); return r; }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
