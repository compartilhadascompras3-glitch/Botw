'use client';

import { useState } from 'react';
import { ExternalLink, Copy, Check, ShoppingCart, Star, MessageSquare, Loader2 } from 'lucide-react';
import type { MLProduct } from '@/app/api/ml-deals/route';
import type { AmazonProduct, ShopeeProduct } from '@/lib/promobit';

type AnyProduct = MLProduct | AmazonProduct | ShopeeProduct;

function isAmazon(p: AnyProduct): p is AmazonProduct {
  return (p as AmazonProduct).source === 'amazon';
}
function isShopee(p: AnyProduct): p is ShopeeProduct {
  return (p as ShopeeProduct).source === 'shopee';
}

interface ProductCardProps {
  product: AnyProduct;
  accentColor?: string;
  accentGrad?: string;
  alreadyAdded?: boolean;
  onAddToBot?: (product: AnyProduct) => void;
}

function formatBRL(value: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

async function resolveStoreUrl(product: AnyProduct): Promise<string> {
  const slug = (product as AmazonProduct | ShopeeProduct).slug;
  if (!slug) return product.permalink;
  try {
    const res = await fetch(`/api/store-link?slug=${encodeURIComponent(slug)}`);
    if (res.ok) {
      const data = await res.json() as { url?: string };
      if (data.url) return data.url;
    }
  } catch { /* fallback */ }
  return product.permalink;
}

export function ProductCard({ product, accentColor = '#00D4FF', accentGrad, alreadyAdded = false, onAddToBot }: ProductCardProps) {
  const [copied, setCopied] = useState(false);
  const [opening, setOpening] = useState(false);
  const grad = accentGrad ?? 'linear-gradient(135deg, #00D4FF 0%, #00FF88 100%)';
  const amz = isAmazon(product);
  const isMlPromobit = (product as MLProduct).source === 'ml_promobit';
  const isPromobit = amz || isShopee(product);

  const handleCopy = async () => {
    try {
      const text = `🔥 ${product.title}\n\n${product.original_price ? `De: ${formatBRL(product.original_price)} → Por: ${formatBRL(product.price)} (-${product.discount_percent}%)` : `${formatBRL(product.price)} (-${product.discount_percent}%)`}\n\n🛒 ${product.permalink}`;
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* ignore */ }
  };

  const handleOpenStore = async (e: React.MouseEvent) => {
    e.preventDefault();
    if (!isPromobit) { window.open(product.permalink, '_blank', 'noopener,noreferrer'); return; }
    setOpening(true);
    try {
      const url = await resolveStoreUrl(product);
      window.open(url, '_blank', 'noopener,noreferrer');
    } finally {
      setOpening(false);
    }
  };

  return (
    <div
      className="group relative flex flex-col rounded-[20px] overflow-hidden transition-all duration-300"
      style={{ background: '#0d0d0d', border: '1px solid rgba(255,255,255,0.08)' }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLElement).style.border = `1px solid ${accentColor}80`;
        (e.currentTarget as HTMLElement).style.boxShadow = `0 20px 60px ${accentColor}26`;
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.border = '1px solid rgba(255,255,255,0.08)';
        (e.currentTarget as HTMLElement).style.boxShadow = 'none';
      }}
    >
      {/* Discount badge */}
      <div className="absolute top-3 left-3 z-10">
        <span className="text-black text-xs font-bold px-2 py-1 rounded-full" style={{ background: grad }}>
          -{product.discount_percent}%
        </span>
      </div>

      {/* Already added badge */}
      {alreadyAdded && (
        <div className="absolute top-3 right-3 z-10 flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full"
          style={{ background: 'rgba(37,211,102,0.18)', color: '#25D366', border: '1px solid rgba(37,211,102,0.4)', backdropFilter: 'blur(4px)' }}>
          <Check size={9} strokeWidth={3} />
          No bot
        </div>
      )}

      {/* Source badge */}
      {amz && !alreadyAdded && (
        <div className="absolute top-3 right-3 z-10">
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: 'rgba(255,153,0,0.15)', color: '#FF9900', border: '1px solid rgba(255,153,0,0.3)' }}>
            AMZ
          </span>
        </div>
      )}

      {isMlPromobit && !alreadyAdded && (
        <div className="absolute top-3 right-3 z-10">
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: 'rgba(0,212,255,0.12)', color: '#00D4FF', border: '1px solid rgba(0,212,255,0.25)' }}>
            via Promobit
          </span>
        </div>
      )}

      {/* Image */}
      <div className="relative w-full bg-[#111] flex items-center justify-center" style={{ height: 200 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={product.thumbnail}
          alt={product.title}
          className="object-contain w-full h-full p-4 transition-transform duration-300 group-hover:scale-105"
          loading="lazy"
        />
      </div>

      {/* Content */}
      <div className="flex flex-col gap-3 p-4 flex-1">
        <p className="text-sm leading-snug text-white line-clamp-2" style={{ letterSpacing: '-0.02em' }}>
          {product.title}
        </p>

        {/* Seller / source info */}
        {!isPromobit && (product as MLProduct).seller_name && (
          <p className="text-xs" style={{ color: '#666' }}>
            Vendido por <span style={{ color: '#A0A0A0' }}>{(product as MLProduct).seller_name}</span>
          </p>
        )}
        {amz && (product as AmazonProduct).prime && (
          <p className="text-xs font-bold" style={{ color: '#00A8E8' }}>✓ Prime</p>
        )}

        {/* Prices */}
        <div className="flex flex-col gap-0.5">
          {product.original_price && (
            <span className="text-xs line-through" style={{ color: '#666' }}>
              {formatBRL(product.original_price)}
            </span>
          )}
          <span className="text-xl font-bold" style={{ color: '#00FF88', letterSpacing: '-0.03em' }}>
            {formatBRL(product.price)}
          </span>
        </div>

        {/* Cupom de desconto */}
        {(product as AmazonProduct | ShopeeProduct).coupon && (
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg w-fit"
            style={{ background: 'rgba(255,200,0,0.1)', border: '1px solid rgba(255,200,0,0.3)' }}>
            <span className="text-xs">🏷️</span>
            <span className="text-xs font-bold tracking-wider" style={{ color: '#FFD700' }}>
              {(product as AmazonProduct | ShopeeProduct).coupon}
            </span>
          </div>
        )}

        {/* Stats */}
        <div className="flex items-center gap-2 text-xs" style={{ color: '#666' }}>
          {!isPromobit && (product as MLProduct).sold_quantity > 0 && (
            <span className="flex items-center gap-1">
              <ShoppingCart size={10} />
              {(product as MLProduct).sold_quantity} vendidos
            </span>
          )}
          {amz && (product as AmazonProduct).stars && (
            <span className="flex items-center gap-1">
              <Star size={10} style={{ color: '#FF9900' }} />
              {(product as AmazonProduct).stars?.toFixed(1)}
              {(product as AmazonProduct).reviews ? ` (${(product as AmazonProduct).reviews!.toLocaleString('pt-BR')})` : ''}
            </span>
          )}
          {!isPromobit && (
            <span className="flex items-center gap-1">
              <Star size={10} />
              {(product as MLProduct).condition === 'new' ? 'Novo' : 'Usado'}
            </span>
          )}
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-2 mt-auto pt-2">
          <div className="flex gap-2">
            <button
              onClick={handleOpenStore}
              disabled={opening}
              className="flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-full transition-all duration-150 cursor-pointer"
              style={{ border: `1px solid ${accentColor}66`, color: accentColor, opacity: opening ? 0.7 : 1 }}
            >
              {opening ? <Loader2 size={12} className="animate-spin" /> : <ExternalLink size={12} />}
              {opening ? 'Abrindo…' : 'Ver oferta'}
            </button>

            <button
              onClick={handleCopy}
              className="flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-full transition-all duration-150 cursor-pointer"
              style={{ border: '1px solid rgba(255,255,255,0.12)', color: '#A0A0A0' }}
              title="Copiar texto para WhatsApp"
            >
              {copied ? <Check size={12} style={{ color: '#00FF88' }} /> : <Copy size={12} />}
              {copied ? 'Copiado!' : 'Copiar'}
            </button>
          </div>

          {/* Adicionar ao Bot */}
          {onAddToBot && (
            <button
              onClick={() => onAddToBot(product)}
              className="w-full flex items-center justify-center gap-2 text-xs font-semibold py-2.5 rounded-full transition-all duration-200 cursor-pointer"
              style={alreadyAdded
                ? { background: 'rgba(37,211,102,0.12)', color: '#25D366', border: '1px solid rgba(37,211,102,0.35)' }
                : { background: '#25D366', color: '#000' }
              }
            >
              {alreadyAdded ? <Check size={13} /> : <MessageSquare size={13} />}
              {alreadyAdded ? 'Adicionar novamente' : 'Adicionar ao Bot'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
