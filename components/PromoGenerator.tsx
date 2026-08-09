'use client';

import { useRef, useState, useLayoutEffect } from 'react';
import { useBotStore } from '@/store/botStore';
import { useMessagesDb } from '@/hooks/use-messages-db';
import {
  Sparkles, Upload, X, Link as LinkIcon, Loader2,
  CheckCircle, AlertCircle, Plus, Zap, Crop, RotateCcw,
  ChevronLeft, ChevronRight, Image as ImageIcon, ArrowRight,
} from 'lucide-react';

// ── helpers ───────────────────────────────────────────────────────────────────

function readAsDataURL(file: File): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result as string);
    r.onerror = rej;
    r.readAsDataURL(file);
  });
}

function dataURLtoBase64(dataUrl: string) {
  const [header, b64] = dataUrl.split(',');
  const mimeType = header.replace('data:', '').replace(';base64', '');
  return { b64: b64.replace(/\s/g, ''), mimeType };
}

/** Redimensiona e comprime um dataUrl para no máximo ~700 KB de base64 antes de enviar à API */
function compressForApi(srcDataUrl: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    img.onerror = reject;
    img.onload = () => {
      const MAX_B64 = 700 * 1024; // 700 KB
      const MAX_DIM = 1400;
      let { naturalWidth: w, naturalHeight: h } = img;
      if (w > MAX_DIM || h > MAX_DIM) {
        const ratio = Math.min(MAX_DIM / w, MAX_DIM / h);
        w = Math.round(w * ratio);
        h = Math.round(h * ratio);
      }
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d')!.drawImage(img, 0, 0, w, h);
      let q = 0.85;
      let out = canvas.toDataURL('image/jpeg', q);
      while (out.length > MAX_B64 && q > 0.3) { q -= 0.1; out = canvas.toDataURL('image/jpeg', q); }
      resolve(out);
    };
    img.src = srcDataUrl;
  });
}

function cropImageDataUrl(
  srcDataUrl: string,
  xRel: number, yRel: number, wRel: number, hRel: number,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    img.onload = () => {
      const iw = img.naturalWidth;
      const ih = img.naturalHeight;
      const sx = Math.round(xRel * iw);
      const sy = Math.round(yRel * ih);
      const sw = Math.round(wRel * iw);
      const sh = Math.round(hRel * ih);
      const maxW = 900;
      const ratio = Math.min(1, maxW / sw);
      const canvas = document.createElement('canvas');
      canvas.width  = Math.round(sw * ratio);
      canvas.height = Math.round(sh * ratio);
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/jpeg', 0.93));
    };
    img.onerror = reject;
    img.src = srcDataUrl;
  });
}

// ── shared types ─────────────────────────────────────────────────────────────

interface Box { x: number; y: number; w: number; h: number }
type DragModeH = 'draw' | 'move' | 'nw'|'ne'|'sw'|'se'|'n'|'s'|'w'|'e';
interface HandleDef { id: DragModeH; style: React.CSSProperties; cursor: string }

// ── CropOverlay ──────────────────────────────────────────────────────────────
// Renders the dimming + selection rect anchored to the rendered image element,
// not to the outer wrapper div (which may be wider/taller due to letterboxing).

function CropOverlay({ box, imgRef, onHandleDown, handles, label }: {
  box: Box | null;
  imgRef: React.RefObject<HTMLImageElement | null>;
  onHandleDown: (e: React.PointerEvent, mode: DragModeH) => void;
  handles: HandleDef[];
  label: string;
}) {
  // Track rendered image position so we can anchor overlays to it
  const [imgRect, setImgRect] = useState<{ left: number; top: number; width: number; height: number } | null>(null);

  useLayoutEffect(() => {
    const img = imgRef.current;
    if (!img) return;

    const update = () => {
      const r = img.getBoundingClientRect();
      const p = img.parentElement!.getBoundingClientRect();
      setImgRect({
        left:   r.left - p.left,
        top:    r.top  - p.top,
        width:  r.width,
        height: r.height,
      });
    };

    update();
    // Re-measure on image load (natural size may differ from initial render)
    img.addEventListener('load', update);
    const ro = new ResizeObserver(update);
    if (img.parentElement) ro.observe(img.parentElement);
    return () => { img.removeEventListener('load', update); ro.disconnect(); };
  }, [imgRef]);

  if (!imgRect) return null;

  const { left, top, width, height } = imgRect;

  // Convert box (0–1 relative to rendered image) to absolute px within the parent
  const toAbs = (b: Box) => ({
    l: left + b.x * width,
    t: top  + b.y * height,
    w: b.w  * width,
    h: b.h  * height,
  });

  return (
    <>
      {box && (() => {
        const { l, t, w, h } = toAbs(box);
        return (
          <>
            {/* dim overlay — 4 rects around selection, each anchored to the img area */}
            {/* top */}
            <div className="absolute pointer-events-none" style={{ background:'rgba(0,0,0,0.5)', left, top, width, height: t - top }} />
            {/* bottom */}
            <div className="absolute pointer-events-none" style={{ background:'rgba(0,0,0,0.5)', left, top: t + h, width, height: top + height - (t + h) }} />
            {/* left */}
            <div className="absolute pointer-events-none" style={{ background:'rgba(0,0,0,0.5)', left, top: t, width: l - left, height: h }} />
            {/* right */}
            <div className="absolute pointer-events-none" style={{ background:'rgba(0,0,0,0.5)', left: l + w, top: t, width: left + width - (l + w), height: h }} />

            {/* selection box */}
            <div
              className="absolute border-2 border-white"
              style={{ left: l, top: t, width: w, height: h, cursor:'move', boxShadow:'0 0 0 1px rgba(0,0,0,0.5)', touchAction:'none' }}
              onPointerDown={(e) => onHandleDown(e, 'move')}
            >
              <div className="absolute inset-0 pointer-events-none opacity-30">
                {['33.33%','66.66%'].map(p => (
                  <div key={p}>
                    <div className="absolute w-px h-full bg-white" style={{ left: p }} />
                    <div className="absolute w-full h-px bg-white" style={{ top: p }} />
                  </div>
                ))}
              </div>
              {handles.map(hh => (
                <div
                  key={String(hh.id)}
                  className="absolute w-4 h-4 bg-white rounded-sm shadow-md border border-gray-200"
                  style={{ ...hh.style, cursor: hh.cursor, touchAction:'none' }}
                  onPointerDown={(e) => onHandleDown(e, hh.id)}
                />
              ))}
            </div>
          </>
        );
      })()}

      {!box && (
        <div
          className="absolute flex items-end justify-center pb-3 pointer-events-none"
          style={{ left, top, width, height }}
        >
          <span className="text-xs bg-black/60 text-white px-3 py-1.5 rounded-full font-medium">
            ✂️ {label}
          </span>
        </div>
      )}
    </>
  );
}

// ── CropBox ──────────────────────────────────────────────────────────────────

function CropBox({ imageDataUrl, onCropChange, label = 'Arraste para recortar o produto' }: {
  imageDataUrl: string;
  onCropChange: (box: Box | null) => void;
  label?: string;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const imgRef  = useRef<HTMLImageElement>(null);
  const [box, setBox]         = useState<Box | null>(null);
  const dragRef = useRef<{
    mode: 'draw' | 'move' | 'nw'|'ne'|'sw'|'se'|'n'|'s'|'w'|'e';
    startX: number; startY: number;
    origBox: Box;
  } | null>(null);

  // Returns coordinates relative to the RENDERED image pixels (not the wrapper div).
  // With object-contain the rendered image may have letterbox gaps; we must offset those out.
  const rel = (clientX: number, clientY: number): { rx: number; ry: number } => {
    const img = imgRef.current;
    if (!img) {
      const r = wrapRef.current!.getBoundingClientRect();
      return {
        rx: Math.max(0, Math.min(1, (clientX - r.left) / r.width)),
        ry: Math.max(0, Math.min(1, (clientY - r.top)  / r.height)),
      };
    }
    const ir = img.getBoundingClientRect();
    return {
      rx: Math.max(0, Math.min(1, (clientX - ir.left) / ir.width)),
      ry: Math.max(0, Math.min(1, (clientY - ir.top)  / ir.height)),
    };
  };

  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

  const onWrapDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const { rx, ry } = rel(e.clientX, e.clientY);
    dragRef.current = {
      mode: 'draw',
      startX: rx, startY: ry,
      origBox: { x: rx, y: ry, w: 0, h: 0 },
    };
    setBox({ x: rx, y: ry, w: 0, h: 0 });
  };

  const onHandleDown = (e: React.PointerEvent, mode: DragModeH) => {
    e.stopPropagation();
    if (!box) return;
    wrapRef.current!.setPointerCapture(e.pointerId);
    const { rx, ry } = rel(e.clientX, e.clientY);
    dragRef.current = { mode, startX: rx, startY: ry, origBox: { ...box } };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragRef.current) return;
    const { rx, ry } = rel(e.clientX, e.clientY);
    const d = dragRef.current;
    const { mode, startX, startY, origBox: ob } = d;

    if (mode === 'draw') {
      const nx = Math.min(startX, rx);
      const ny = Math.min(startY, ry);
      const nw = Math.abs(rx - startX);
      const nh = Math.abs(ry - startY);
      setBox({ x: clamp(nx,0,1-nw), y: clamp(ny,0,1-nh), w: clamp(nw,0,1), h: clamp(nh,0,1) });
      return;
    }

    const dx = rx - startX;
    const dy = ry - startY;
    let { x, y, w, h } = ob;
    const MIN = 0.04;

    if (mode === 'move') {
      x = clamp(x + dx, 0, 1 - w);
      y = clamp(y + dy, 0, 1 - h);
    } else {
      if (mode === 'e'  || mode === 'ne' || mode === 'se') w = clamp(w + dx, MIN, 1 - x);
      if (mode === 'w'  || mode === 'nw' || mode === 'sw') { const nx = clamp(x + dx, 0, x+w-MIN); w += x-nx; x = nx; }
      if (mode === 's'  || mode === 'se' || mode === 'sw') h = clamp(h + dy, MIN, 1 - y);
      if (mode === 'n'  || mode === 'ne' || mode === 'nw') { const ny = clamp(y + dy, 0, y+h-MIN); h += y-ny; y = ny; }
    }
    setBox({ x, y, w, h });
  };

  const onPointerUp = (e: React.PointerEvent) => {
    if (!dragRef.current) return;
    dragRef.current = null;
    setBox(b => {
      if (b && b.w > 0.02 && b.h > 0.02) { onCropChange(b); return b; }
      onCropChange(null); return null;
    });
  };

  const handles: HandleDef[] = [
    { id:'nw', cursor:'nw-resize', style:{ top:-5,  left:-5  } },
    { id:'ne', cursor:'ne-resize', style:{ top:-5,  right:-5 } },
    { id:'sw', cursor:'sw-resize', style:{ bottom:-5, left:-5  } },
    { id:'se', cursor:'se-resize', style:{ bottom:-5, right:-5 } },
    { id:'n',  cursor:'n-resize',  style:{ top:-5,  left:'50%', transform:'translateX(-50%)' } },
    { id:'s',  cursor:'s-resize',  style:{ bottom:-5, left:'50%', transform:'translateX(-50%)' } },
    { id:'w',  cursor:'w-resize',  style:{ top:'50%', left:-5,   transform:'translateY(-50%)' } },
    { id:'e',  cursor:'e-resize',  style:{ top:'50%', right:-5,  transform:'translateY(-50%)' } },
  ];

  // We need the rendered image rect to position the crop overlay correctly.
  // The outer div is bg-gray-50 and clips; the img is object-contain with max-h-72.
  // We overlay elements on top of the img using absolute positioning relative to the img element.
  // To do that we wrap img+overlays together in an inner div that matches the img size.
  // We use a flex container to center the image, and place overlays as absolute children of the wrapper.

  return (
    <div
      ref={wrapRef}
      className="relative select-none rounded-xl overflow-hidden bg-gray-50 touch-none flex items-center justify-center"
      style={{ cursor: 'crosshair', maxHeight: '18rem' }}
      onPointerDown={onWrapDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        ref={imgRef}
        src={imageDataUrl}
        alt="Imagem"
        draggable={false}
        className="block pointer-events-none"
        style={{
          userSelect: 'none',
          maxWidth: '100%',
          maxHeight: '18rem',
          width: 'auto',
          height: 'auto',
          display: 'block',
        }}
      />

      {/* Overlays — positioned relative to the rendered image via inset using JS-computed values.
          We use a transparent absolute div exactly covering the img to anchor % coordinates. */}
      <CropOverlay
        box={box}
        imgRef={imgRef}
        onHandleDown={onHandleDown}
        handles={handles}
        label={label}
      />
    </div>
  );
}

// ── StepIndicator ─────────────────────────────────────────────────────────────

const STEPS = ['Print', 'Textos', 'Imagem', 'Finalizar'];

function StepIndicator({ current }: { current: number }) {
  return (
    <div className="flex items-center gap-1 px-4 pb-3">
      {STEPS.map((label, i) => {
        const done    = i < current;
        const active  = i === current;
        return (
          <div key={i} className="flex items-center gap-1 flex-1 min-w-0">
            <div className="flex flex-col items-center gap-0.5 shrink-0">
              <div
                className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-all"
                style={{
                  background: done ? 'var(--wa-dark-green)' : active ? 'var(--wa-green)' : 'var(--border)',
                  color: done || active ? 'white' : 'var(--muted-foreground)',
                }}>
                {done ? '✓' : i + 1}
              </div>
              <span
                className="text-[9px] font-medium leading-none"
                style={{ color: active ? 'var(--wa-dark-green)' : done ? 'var(--wa-dark-green)' : 'var(--muted-foreground)' }}>
                {label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div className="flex-1 h-px mt-[-10px]"
                style={{ background: done ? 'var(--wa-dark-green)' : 'var(--border)' }} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── PromoGenerator ────────────────────────────────────────────────────────────

const VERSION_LABELS = ['🔥 Urgente', '😎 Casual', '📋 Direto'];

// step 0 = upload do print de análise
// step 1 = gerou textos (versões)
// step 2 = upload da imagem do produto
// step 3 = crop da imagem do produto + finalizar

export function PromoGenerator() {
  const { addMessage } = useMessagesDb();

  // print de análise (só para IA, NÃO vai na mensagem)
  const printInputRef  = useRef<HTMLInputElement>(null);
  const [printDataUrl, setPrintDataUrl] = useState<string | null>(null);
  const [dragOverPrint, setDragOverPrint] = useState(false);

  // textos gerados
  const [versions, setVersions] = useState<string[]>([]);
  const [edited,   setEdited]   = useState<string[]>([]);
  const [product,  setProduct]  = useState('');
  const [link,     setLink]     = useState('');
  const [activeV,  setActiveV]  = useState(0);

  // imagem do produto (vai na mensagem)
  const prodInputRef   = useRef<HTMLInputElement>(null);
  const [prodOriginal, setProdOriginal] = useState<string | null>(null);
  const [prodCropped,  setProdCropped]  = useState<string | null>(null);
  const [prodName,     setProdName]     = useState('');
  const [prodCropBox,  setProdCropBox]  = useState<Box | null>(null);
  const [dragOverProd, setDragOverProd] = useState(false);

  // estado geral
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState('');
  const [addedIdx, setAddedIdx] = useState<number | null>(null);
  const [sendOnce, setSendOnce] = useState(true);

  // step: 0=print, 1=versions, 2=product-upload, 3=product-crop+finalize
  const [step, setStep] = useState(0);

  // ── handlers ─────────────────────────────────────────────────────────────

  const handlePrintFile = async (file: File) => {
    if (!file.type.startsWith('image/')) { setError('Apenas imagens são aceitas.'); return; }
    if (file.size > 12 * 1024 * 1024)   { setError('Imagem muito grande (máx 12 MB).'); return; }
    setError('');
    const url = await readAsDataURL(file);
    setPrintDataUrl(url);
  };

  const handlePrintDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragOverPrint(false);
    const file = e.dataTransfer.files[0];
    if (file) handlePrintFile(file);
  };

  const handleGenerate = async () => {
    if (!printDataUrl) return;
    setLoading(true); setError(''); setVersions([]); setEdited([]); setAddedIdx(null);
    try {
      // Comprime antes de enviar — evita erro 413/HTML quando a imagem é muito grande
      const compressed = await compressForApi(printDataUrl);
      const { b64, mimeType } = dataURLtoBase64(compressed);
      const res = await fetch('/api/generate-promo', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ imageBase64: b64, mimeType, link: link.trim() || undefined }),
      });
      const data = await res.json() as { versions?: string[]; product?: string; error?: string };
      if (!res.ok || data.error) { setError(data.error ?? 'Erro ao gerar texto.'); }
      else {
        const v = data.versions ?? [];
        setVersions(v); setEdited([...v]);
        setProduct(data.product ?? ''); setActiveV(0);
        setStep(1);
      }
    } catch (e) { setError(`Erro de conexão: ${e instanceof Error ? e.message : 'Tente novamente.'}`); }
    finally { setLoading(false); }
  };

  const handleProdFile = async (file: File) => {
    if (!file.type.startsWith('image/')) { setError('Apenas imagens são aceitas.'); return; }
    if (file.size > 16 * 1024 * 1024)   { setError('Imagem muito grande (máx 16 MB).'); return; }
    setError('');
    const url = await readAsDataURL(file);
    setProdOriginal(url);
    setProdName(file.name);
    setProdCropBox(null);
    setProdCropped(null);
    setStep(3);
  };

  const handleProdDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragOverProd(false);
    const file = e.dataTransfer.files[0];
    if (file) handleProdFile(file);
  };

  const applyProdCrop = async () => {
    if (!prodOriginal) return;
    if (!prodCropBox) {
      setProdCropped(prodOriginal);
    } else {
      const cropped = await cropImageDataUrl(
        prodOriginal, prodCropBox.x, prodCropBox.y, prodCropBox.w, prodCropBox.h,
      );
      setProdCropped(cropped);
    }
    // go back to versions step with the image ready
    setStep(1);
  };

  const skipProdImage = () => {
    setProdOriginal(null); setProdCropped(null); setProdName('');
    setStep(1);
  };

  const handleAdd = (idx: number) => {
    const text = edited[idx];
    if (!text?.trim()) return;
    const media = prodCropped ?? prodOriginal ?? undefined;
    addMessage({
      text: text.trim(),
      mediaDataUrl: media,
      mediaName: prodName || (media ? 'produto.jpg' : undefined),
      mediaType: media ? (media.split(';')[0].replace('data:', '') || 'image/jpeg') : undefined,
      sendOnce,
    });
    setAddedIdx(idx);
    setTimeout(() => setAddedIdx(null), 2000);
  };

  const handleReset = () => {
    setPrintDataUrl(null);
    setProdOriginal(null); setProdCropped(null); setProdName(''); setProdCropBox(null);
    setVersions([]); setEdited([]); setProduct(''); setLink('');
    setError(''); setAddedIdx(null); setStep(0);
  };

  // ── render ────────────────────────────────────────────────────────────────

  return (
    <div className="rounded-2xl border-2 overflow-hidden"
      style={{ borderColor:'rgba(37,211,102,0.35)', background:'white' }}>

      {/* Header */}
      <div className="px-4 py-3 flex items-center gap-2"
        style={{ background:'linear-gradient(135deg, var(--wa-teal) 0%, var(--wa-dark-green) 100%)' }}>
        <Sparkles size={16} color="white" />
        <span className="text-white font-semibold text-sm">Gerador de Promoção com IA</span>
        {step > 0
          ? <button onClick={handleReset}
              className="ml-auto flex items-center gap-1 text-xs px-2 py-0.5 rounded-full"
              style={{ background:'rgba(255,255,255,0.2)', color:'white' }}>
              <RotateCcw size={11}/> Recomeçar
            </button>
          : <span className="ml-auto text-xs px-2 py-0.5 rounded-full font-medium"
              style={{ background:'rgba(255,255,255,0.2)', color:'white' }}>Claude AI</span>
        }
      </div>

      {/* Step indicator */}
      <div className="pt-3">
        <StepIndicator current={step} />
      </div>

      <div className="px-4 pb-4 space-y-4">

        {/* ── STEP 0: upload do print de análise ── */}
        {step === 0 && (
          <>
            <div className="flex items-start gap-2 rounded-xl px-3 py-2.5 text-xs"
              style={{ background:'rgba(37,211,102,0.08)', color:'var(--wa-dark-green)' }}>
              <span className="mt-0.5 shrink-0">📸</span>
              <span>
                Envie um <strong>print da oferta</strong> (ex: tela do app do Mercado Livre).
                A IA vai ler os preços e criar o texto — esse print <strong>não vai na mensagem</strong>.
              </span>
            </div>

            {/* Drop zone */}
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOverPrint(true); }}
              onDragLeave={() => setDragOverPrint(false)}
              onDrop={handlePrintDrop}
              onClick={() => !printDataUrl && printInputRef.current?.click()}
              className="w-full flex flex-col items-center justify-center gap-3 py-8 rounded-xl border-2 border-dashed cursor-pointer transition-all"
              style={{
                borderColor: dragOverPrint ? 'var(--wa-green)' : printDataUrl ? 'var(--wa-green)' : 'var(--border)',
                background:  dragOverPrint ? 'rgba(37,211,102,0.06)' : printDataUrl ? 'rgba(37,211,102,0.04)' : 'var(--secondary)',
              }}>
              {printDataUrl ? (
                <div className="w-full px-2 space-y-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={printDataUrl} alt="Print" className="w-full max-h-48 object-contain rounded-lg" />
                  <button
                    onClick={(e) => { e.stopPropagation(); setPrintDataUrl(null); printInputRef.current?.click(); }}
                    className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-medium"
                    style={{ background:'var(--secondary)', color:'var(--wa-dark-green)' }}>
                    <RotateCcw size={12}/> Trocar print
                  </button>
                </div>
              ) : (
                <>
                  <div className="w-12 h-12 rounded-full flex items-center justify-center"
                    style={{ background:'rgba(37,211,102,0.12)' }}>
                    <Upload size={22} style={{ color:'var(--wa-green)' }}/>
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-semibold">Solte o print aqui ou clique para escolher</p>
                    <p className="text-xs text-muted-foreground mt-1">JPG, PNG — até 12 MB</p>
                  </div>
                </>
              )}
              <input ref={printInputRef} type="file" accept="image/*" className="hidden"
                onChange={(e) => { if (e.target.files?.[0]) handlePrintFile(e.target.files[0]); e.target.value = ''; }}/>
            </div>

            {/* Link */}
            <div className="flex items-center gap-2 rounded-xl border px-3 py-2"
              style={{ borderColor:'var(--border)', background:'var(--secondary)' }}>
              <LinkIcon size={14} style={{ color:'var(--wa-green)', flexShrink:0 }}/>
              <input type="url" className="flex-1 text-sm bg-transparent focus:outline-none"
                style={{ color: 'var(--foreground)' }}
                placeholder="Link da oferta (ex: https://meli.la/…) — opcional"
                value={link} onChange={(e) => setLink(e.target.value)}/>
              {link && <button onClick={() => setLink('')}><X size={12}/></button>}
            </div>

            {/* Generate button */}
            <button onClick={handleGenerate} disabled={!printDataUrl || loading}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-sm disabled:opacity-50"
              style={{ background:'var(--wa-green)', color:'white' }}>
              {loading
                ? <><Loader2 size={16} className="animate-spin"/> Analisando print...</>
                : <><Sparkles size={16}/> Gerar textos com IA</>}
            </button>

            {error && (
              <div className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm"
                style={{ background:'#FEE2E2', color:'#991B1B' }}>
                <AlertCircle size={14}/> {error}
              </div>
            )}
          </>
        )}

        {/* ── STEP 1: versões geradas ── */}
        {step === 1 && versions.length > 0 && (
          <>
            {product && (
              <p className="text-xs font-medium text-muted-foreground">
                🛍️ Produto detectado: <span className="font-semibold text-foreground">{product}</span>
              </p>
            )}

            {/* Imagem do produto (se já escolhida) */}
            {(prodCropped ?? prodOriginal) ? (
              <div className="rounded-xl overflow-hidden border flex items-center gap-3 px-3 py-2"
                style={{ borderColor:'var(--wa-green)', background:'rgba(37,211,102,0.04)' }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={prodCropped ?? prodOriginal ?? ''} alt="Produto"
                  className="w-14 h-14 object-cover rounded-lg shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold" style={{ color:'var(--wa-dark-green)' }}>Imagem do produto pronta</p>
                  <p className="text-xs text-muted-foreground truncate">{prodName || 'produto.jpg'}</p>
                </div>
                <button
                  onClick={() => { setProdOriginal(null); setProdCropped(null); setProdName(''); }}
                  className="w-7 h-7 rounded-full flex items-center justify-center shrink-0"
                  style={{ background:'#FEE2E2', color:'#EF4444' }}>
                  <X size={13}/>
                </button>
              </div>
            ) : (
              /* CTA para adicionar imagem do produto */
              <div
                onDragOver={(e) => { e.preventDefault(); setDragOverProd(true); }}
                onDragLeave={() => setDragOverProd(false)}
                onDrop={handleProdDrop}
                onClick={() => prodInputRef.current?.click()}
                className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl border-2 border-dashed cursor-pointer transition-all"
                style={{
                  borderColor: dragOverProd ? 'var(--wa-green)' : 'rgba(37,211,102,0.4)',
                  background:  dragOverProd ? 'rgba(37,211,102,0.08)' : 'rgba(37,211,102,0.03)',
                }}>
                <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                  style={{ background:'rgba(37,211,102,0.12)' }}>
                  <ImageIcon size={18} style={{ color:'var(--wa-green)' }}/>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold" style={{ color:'var(--wa-dark-green)' }}>
                    Adicionar imagem do produto
                  </p>
                  <p className="text-xs text-muted-foreground">Vai junto com o texto na mensagem</p>
                </div>
                <ArrowRight size={16} style={{ color:'var(--wa-green)', flexShrink:0 }}/>
                <input ref={prodInputRef} type="file" accept="image/*" className="hidden"
                  onChange={(e) => { if (e.target.files?.[0]) handleProdFile(e.target.files[0]); e.target.value = ''; }}/>
              </div>
            )}

            {/* Tabs de versões */}
            <div className="flex gap-1 p-1 rounded-xl" style={{ background:'var(--secondary)' }}>
              {VERSION_LABELS.map((label, i) => (
                <button key={i} onClick={() => setActiveV(i)}
                  className="flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all"
                  style={{
                    background: activeV === i ? 'white' : 'transparent',
                    color: activeV === i ? 'var(--wa-dark-green)' : 'var(--muted-foreground)',
                    boxShadow: activeV === i ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                  }}>
                  {label}
                </button>
              ))}
            </div>

            {/* Editor */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold" style={{ color:'var(--wa-dark-green)' }}>
                  ✏️ Edite como quiser:
                </p>
                <div className="flex gap-1">
                  <button onClick={() => setActiveV(v => (v-1+versions.length)%versions.length)}
                    className="w-6 h-6 flex items-center justify-center rounded-full"
                    style={{ background:'var(--secondary)' }}>
                    <ChevronLeft size={13}/>
                  </button>
                  <button onClick={() => setActiveV(v => (v+1)%versions.length)}
                    className="w-6 h-6 flex items-center justify-center rounded-full"
                    style={{ background:'var(--secondary)' }}>
                    <ChevronRight size={13}/>
                  </button>
                </div>
              </div>
              <textarea
                key={activeV}
                className="w-full text-sm rounded-xl border px-3 py-2.5 resize-none focus:outline-none focus:ring-2"
                style={{ borderColor:'var(--wa-green)', minHeight:180, background: 'var(--secondary)', color: 'var(--foreground)' }}
                value={edited[activeV] ?? ''}
                onChange={(e) => {
                  const c = [...edited]; c[activeV] = e.target.value; setEdited(c);
                }}
              />
            </div>

            {/* Gerar novamente */}
            <button onClick={() => setStep(0)}
              className="w-full flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-medium"
              style={{ background:'var(--secondary)', color:'var(--wa-dark-green)' }}>
              <RotateCcw size={12}/> Gerar novas versões com outro print
            </button>

            {/* sendOnce */}
            <button type="button" onClick={() => setSendOnce(v => !v)}
              className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl border text-sm font-medium transition-all"
              style={{ borderColor: sendOnce?'#F59E0B':'var(--border)', background: sendOnce?'#FFFBEB':'var(--secondary)' }}>
              <span className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
                style={{ background: sendOnce?'#FDE68A':'var(--border)', color: sendOnce?'#92400E':'var(--muted-foreground)' }}>
                <Zap size={14} fill={sendOnce?'currentColor':'none'}/>
              </span>
              <div className="flex-1 text-left">
                <span className="block text-xs font-semibold" style={{ color: sendOnce?'#92400E':'var(--foreground)' }}>
                  Enviar 1x e apagar
                </span>
                <span className="block text-xs" style={{ color: sendOnce?'#B45309':'var(--muted-foreground)' }}>
                  {sendOnce ? 'Ativo — removida após o envio' : 'Inativo — fica na fila e repete'}
                </span>
              </div>
              <span className="w-9 h-5 rounded-full shrink-0 relative" style={{ background: sendOnce?'#F59E0B':'var(--border)' }}>
                <span className="absolute top-0.5 w-4 h-4 rounded-full shadow"
                  style={{ background:'white', left: sendOnce?'18px':'2px', transition:'left 0.15s' }}/>
              </span>
            </button>

            {/* Add active version */}
            {addedIdx === activeV
              ? <div className="flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold"
                  style={{ background:'var(--wa-light-green)', color:'var(--wa-dark-green)' }}>
                  <CheckCircle size={16}/> Adicionada à fila!
                </div>
              : <button onClick={() => handleAdd(activeV)}
                  disabled={!edited[activeV]?.trim()}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-sm disabled:opacity-40"
                  style={{ background:'var(--wa-dark-green)', color:'white' }}>
                  <Plus size={16}/> Adicionar esta versão à fila
                </button>
            }

            {/* Add all 3 */}
            {versions.length === 3 && (
              <button onClick={() => versions.forEach((_, i) => handleAdd(i))}
                className="w-full py-2.5 rounded-xl text-xs font-medium"
                style={{ background:'var(--secondary)', color:'var(--wa-dark-green)' }}>
                + Adicionar as 3 versões de uma vez
              </button>
            )}

            {error && (
              <div className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm"
                style={{ background:'#FEE2E2', color:'#991B1B' }}>
                <AlertCircle size={14}/> {error}
              </div>
            )}
          </>
        )}

        {/* ── STEP 3: crop da imagem do produto ── */}
        {step === 3 && prodOriginal && (
          <>
            <div className="flex items-start gap-2 rounded-xl px-3 py-2.5 text-xs"
              style={{ background:'rgba(37,211,102,0.08)', color:'var(--wa-dark-green)' }}>
              <span className="mt-0.5 shrink-0">🖼️</span>
              <span>
                Essa imagem vai <strong>junto com o texto</strong> na mensagem.
                Recorte para destacar o produto ou use a imagem completa.
              </span>
            </div>

            <CropBox
              imageDataUrl={prodOriginal}
              onCropChange={setProdCropBox}
              label="Arraste para recortar o produto"
            />

            <div className="flex gap-2">
              <button onClick={applyProdCrop}
                className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-sm"
                style={{
                  background: prodCropBox ? 'var(--wa-green)' : 'var(--secondary)',
                  color: prodCropBox ? 'white' : 'var(--wa-dark-green)',
                }}>
                {prodCropBox
                  ? <><Crop size={15}/> Recortar e usar esta imagem</>
                  : <><ChevronRight size={15}/> Usar imagem completa</>}
              </button>
              <button onClick={() => { setProdOriginal(null); setProdCropBox(null); setStep(1); }}
                className="px-4 py-3 rounded-xl text-sm font-medium"
                style={{ background:'#FEE2E2', color:'#EF4444' }}>
                <X size={15}/>
              </button>
            </div>

            <button onClick={skipProdImage}
              className="w-full py-2 rounded-xl text-xs font-medium"
              style={{ background:'var(--secondary)', color:'var(--muted-foreground)' }}>
              Pular — enviar só o texto sem imagem
            </button>
          </>
        )}

      </div>
    </div>
  );
}
