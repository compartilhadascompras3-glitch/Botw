'use client';

import { useState, useEffect, useRef } from 'react';
import {
  X, Loader2, Check, Copy, MessageSquare, ExternalLink,
  RefreshCw, AlertCircle, Pencil
} from 'lucide-react';
import type { MLProduct } from '@/app/api/ml-deals/route';
import type { AmazonProduct, ShopeeProduct } from '@/lib/promobit';

type AnyProduct = MLProduct | AmazonProduct | ShopeeProduct;

function isAmazon(p: AnyProduct): p is AmazonProduct {
  return (p as AmazonProduct).source === 'amazon';
}

interface AddToBotModalProps {
  product: AnyProduct | null;
  onClose: () => void;
  onConfirm: (product: AnyProduct, text: string, affiliateLink: string) => Promise<void>;
}

interface PromoResult {
  product: string;
  versions: string[];
}

function stripLinkLine(text: string): string {
  return text
    .split('\n')
    .filter((line) => !/^👉\s*https?:\/\//i.test(line.trim()))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function AddToBotModal({ product, onClose, onConfirm }: AddToBotModalProps) {
  // IA state
  const [versions, setVersions] = useState<string[]>([]);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  // Texto editado (separado por versão para preservar edições ao navegar)
  const [editedTexts, setEditedTexts] = useState<string[]>([]);

  // Link afiliado
  const [affiliateLink, setAffiliateLink] = useState('');

  // Save state
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [copyDone, setCopyDone] = useState(false);

  const linkInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Reset ao abrir com novo produto
  useEffect(() => {
    if (!product) return;
    setVersions([]);
    setEditedTexts([]);
    setSelectedIdx(0);
    setAiError(null);
    setAffiliateLink('');
    setSaved(false);
    generateTexts(product);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product]);

  // Quando versões chegam, inicializa os textos editáveis
  useEffect(() => {
    setEditedTexts(versions.map((v) => v));
  }, [versions]);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = textareaRef.current.scrollHeight + 'px';
    }
  }, [editedTexts, selectedIdx]);

  const generateTexts = async (p: AnyProduct) => {
    setAiLoading(true);
    setAiError(null);
    try {
      // 1. Busca a imagem como base64 via proxy
      let imageBase64 = '';
      let mimeType = 'image/jpeg';
      const proxyRes = await fetch(`/api/image-proxy?url=${encodeURIComponent(p.thumbnail)}`);
      if (proxyRes.ok) {
        const proxyData = await proxyRes.json() as { dataUrl: string; contentType: string };
        const dataUrl = proxyData.dataUrl ?? '';
        const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
        if (match) { mimeType = match[1]; imageBase64 = match[2]; }
      }

      if (!imageBase64) throw new Error('Não foi possível carregar a imagem do produto.');

      // 2. Chama a IA com dados do produto (ajuda modelos com visão fraca a preencher preço)
      const res = await fetch('/api/generate-promo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64,
          mimeType,
          link: '',
          title: p.title,
          price: p.price,
          originalPrice: p.original_price ?? undefined,
          discountPercent: p.discount_percent,
        }),
        signal: AbortSignal.timeout(40000),
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        throw new Error(`Erro ${res.status}: ${errText.slice(0, 100)}`);
      }

      const data = await res.json() as PromoResult;
      if (!data.versions || data.versions.length === 0) throw new Error('Nenhum texto gerado');

      const cleaned = data.versions.map(stripLinkLine);
      setVersions(cleaned);
      setSelectedIdx(0);
    } catch (e) {
      setAiError(e instanceof Error ? e.message : 'Falha ao gerar texto');
    } finally {
      setAiLoading(false);
    }
  };

  const currentText = editedTexts[selectedIdx] ?? '';
  const setCurrentText = (val: string) => {
    setEditedTexts((prev) => {
      const next = [...prev];
      next[selectedIdx] = val;
      return next;
    });
  };

  const getFinalText = (idx: number) => {
    const base = editedTexts[idx] ?? '';
    if (affiliateLink.trim()) return base + '\n\n👉 ' + affiliateLink.trim();
    return base;
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(getFinalText(selectedIdx));
      setCopyDone(true);
      setTimeout(() => setCopyDone(false), 2000);
    } catch { /* ignore */ }
  };

  const handleConfirm = async () => {
    if (!product || editedTexts.length === 0) return;
    setSaving(true);
    try {
      await onConfirm(product, getFinalText(selectedIdx), affiliateLink.trim());
      setSaved(true);
      setTimeout(() => { setSaved(false); onClose(); }, 1500);
    } catch { /* erro no pai */ } finally {
      setSaving(false);
    }
  };

  const openApp = () => {
    if (!product) return;
    window.open(product.permalink, '_blank', 'noopener,noreferrer');
    setTimeout(() => linkInputRef.current?.focus(), 600);
  };

  if (!product) return null;

  const isAmz = isAmazon(product);
  const accentColor = isAmz ? '#FF9900' : '#00D4FF';
  const accentBg = isAmz ? 'rgba(255,153,0,0.12)' : 'rgba(0,212,255,0.12)';
  const accentBorder = isAmz ? 'rgba(255,153,0,0.3)' : 'rgba(0,212,255,0.25)';

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      style={{ background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(6px)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="w-full sm:max-w-xl max-h-[95vh] flex flex-col rounded-t-[28px] sm:rounded-[24px] overflow-hidden"
        style={{ background: '#0d0d0d', border: '1px solid rgba(255,255,255,0.08)' }}
      >
        {/* ── Header ── */}
        <div className="flex items-center justify-between px-5 pt-5 pb-4 shrink-0" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
          <div className="flex items-center gap-3 min-w-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={product.thumbnail} alt="" className="w-11 h-11 rounded-xl object-contain shrink-0" style={{ background: '#111' }} />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-white line-clamp-1 leading-tight">{product.title}</p>
              <p className="text-xs mt-0.5" style={{ color: accentColor }}>
                {isAmz ? '🛒 Amazon' : '🛍️ Mercado Livre'} · -{product.discount_percent}%
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="ml-3 w-8 h-8 shrink-0 rounded-full flex items-center justify-center cursor-pointer"
            style={{ background: 'rgba(255,255,255,0.06)' }}
          >
            <X size={15} style={{ color: '#888' }} />
          </button>
        </div>

        {/* ── Body ── */}
        <div className="overflow-y-auto flex-1 px-5 py-4 flex flex-col gap-4" style={{ scrollbarWidth: 'none' }}>

          {/* Link de afiliado */}
          <div>
            <p className="text-[11px] font-semibold mb-2 uppercase tracking-wider" style={{ color: '#666' }}>
              Link de afiliado
            </p>
            <div className="flex items-center gap-2 rounded-2xl px-3 py-2.5" style={{ background: '#111', border: '1px solid rgba(255,255,255,0.08)' }}>
              <input
                ref={linkInputRef}
                type="url"
                value={affiliateLink}
                onChange={(e) => setAffiliateLink(e.target.value)}
                placeholder="Cole seu link de afiliado aqui..."
                className="flex-1 bg-transparent text-sm text-white outline-none placeholder:text-[#444]"
              />
              {affiliateLink && (
                <button onClick={() => setAffiliateLink('')} className="p-0.5 cursor-pointer shrink-0" style={{ color: '#555' }}>
                  <X size={13} />
                </button>
              )}
            </div>
            <button
              onClick={openApp}
              className="mt-2 w-full flex items-center justify-center gap-2 text-xs font-semibold py-2.5 rounded-xl cursor-pointer transition-all"
              style={{ background: accentBg, border: `1px solid ${accentBorder}`, color: accentColor }}
            >
              <ExternalLink size={12} />
              Abrir {isAmz ? 'Amazon' : 'Mercado Livre'} → copiar link de afiliado
            </button>
          </div>

          {/* Textos IA */}
          <div className="flex-1">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: '#666' }}>
                Texto para o WhatsApp
              </p>
              <div className="flex items-center gap-1.5">
                {!aiLoading && versions.length > 0 && (
                  <button
                    onClick={() => { if (product) generateTexts(product); }}
                    className="flex items-center gap-1 text-xs cursor-pointer px-2.5 py-1 rounded-full transition-all"
                    style={{ color: '#555', border: '1px solid rgba(255,255,255,0.07)' }}
                  >
                    <RefreshCw size={10} />
                    Gerar novos
                  </button>
                )}
              </div>
            </div>

            {/* Tabs de versão */}
            {!aiLoading && versions.length > 0 && (
              <div className="flex gap-1 mb-3">
                {versions.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setSelectedIdx(i)}
                    className="text-xs px-3 py-1.5 rounded-full cursor-pointer transition-all font-medium"
                    style={
                      selectedIdx === i
                        ? { background: accentBg, color: accentColor, border: `1px solid ${accentBorder}` }
                        : { background: 'transparent', color: '#555', border: '1px solid rgba(255,255,255,0.06)' }
                    }
                  >
                    Versão {i + 1}
                  </button>
                ))}
              </div>
            )}

            {/* Loading */}
            {aiLoading && (
              <div className="flex flex-col items-center py-10 gap-3">
                <Loader2 size={22} className="animate-spin" style={{ color: accentColor }} />
                <p className="text-xs" style={{ color: '#555' }}>Gerando textos com IA...</p>
              </div>
            )}

            {/* Erro */}
            {aiError && !aiLoading && (
              <div className="flex items-start gap-2 p-3 rounded-2xl" style={{ background: 'rgba(255,80,80,0.08)', border: '1px solid rgba(255,80,80,0.2)' }}>
                <AlertCircle size={14} style={{ color: '#ff6060', flexShrink: 0, marginTop: 1 }} />
                <div>
                  <p className="text-xs" style={{ color: '#ff8080' }}>{aiError}</p>
                  <button onClick={() => product && generateTexts(product)} className="text-xs mt-1 cursor-pointer" style={{ color: accentColor }}>
                    Tentar novamente
                  </button>
                </div>
              </div>
            )}

            {/* Textarea editável */}
            {!aiLoading && editedTexts.length > 0 && (
              <div className="relative rounded-2xl overflow-hidden" style={{ background: '#111', border: '1px solid rgba(255,255,255,0.08)' }}>
                {/* Badge editar */}
                <div className="absolute top-3 left-3 flex items-center gap-1 text-[10px] rounded-full px-2 py-0.5 pointer-events-none" style={{ background: 'rgba(255,255,255,0.06)', color: '#555' }}>
                  <Pencil size={9} />
                  editável
                </div>

                <textarea
                  ref={textareaRef}
                  value={currentText}
                  onChange={(e) => setCurrentText(e.target.value)}
                  className="w-full bg-transparent text-sm text-white leading-relaxed outline-none resize-none px-4 pb-4"
                  style={{
                    fontFamily: 'inherit',
                    paddingTop: '2.5rem',
                    minHeight: 140,
                    scrollbarWidth: 'none',
                  }}
                  spellCheck={false}
                />

                {/* Preview do link */}
                {affiliateLink.trim() && (
                  <div className="px-4 pb-4">
                    <span className="text-sm" style={{ color: accentColor }}>
                      {'\n👉 ' + affiliateLink.trim()}
                    </span>
                  </div>
                )}

                {/* Botão copiar */}
                <div className="flex justify-end px-3 pb-3">
                  <button
                    onClick={handleCopy}
                    className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full cursor-pointer transition-all"
                    style={{ background: 'rgba(255,255,255,0.06)', color: copyDone ? '#00FF88' : '#888' }}
                  >
                    {copyDone ? <Check size={11} /> : <Copy size={11} />}
                    {copyDone ? 'Copiado!' : 'Copiar texto'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── Footer ── */}
        <div className="px-5 py-4 shrink-0" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          <button
            onClick={handleConfirm}
            disabled={saving || saved || editedTexts.length === 0}
            className="w-full flex items-center justify-center gap-2 text-sm font-bold py-3.5 rounded-2xl cursor-pointer transition-all disabled:cursor-default"
            style={
              saved
                ? { background: 'rgba(37,211,102,0.15)', color: '#25D366', border: '1px solid rgba(37,211,102,0.4)' }
                : saving
                ? { background: '#111', color: '#555', border: '1px solid rgba(255,255,255,0.06)' }
                : editedTexts.length === 0
                ? { background: '#111', color: '#444', border: '1px solid rgba(255,255,255,0.06)' }
                : { background: '#25D366', color: '#000' }
            }
          >
            {saving && <Loader2 size={15} className="animate-spin" />}
            {saved && <Check size={15} />}
            {!saving && !saved && <MessageSquare size={15} />}
            {saving ? 'Salvando...' : saved ? 'Adicionado ao Bot! ✓' : 'Adicionar ao Bot'}
          </button>
          {editedTexts.length === 0 && !aiLoading && (
            <p className="text-xs text-center mt-2" style={{ color: '#444' }}>Aguardando geração do texto...</p>
          )}
        </div>
      </div>
    </div>
  );
}
