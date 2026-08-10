'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Search, RefreshCw, Zap, TrendingDown, Filter, MessageSquare, ArrowUpDown, Check } from 'lucide-react';
import { ProductCard } from '@/components/ProductCard';
import { SettingsPanel } from '@/components/SettingsPanel';
import { AddToBotModal } from '@/components/AddToBotModal';
import { useMessagesDb } from '@/hooks/use-messages-db';
import type { MLProduct } from '@/app/api/ml-deals/route';
import type { AmazonProduct } from '@/lib/promobit';
import type { ShopeeProduct } from '@/lib/promobit';

type AnyProduct = MLProduct | AmazonProduct | ShopeeProduct;
type Source = 'ml' | 'amazon' | 'shopee';
type SortKey = 'discount' | 'price_asc' | 'price_desc' | 'newest' | 'default';

function isAmazon(p: AnyProduct): p is AmazonProduct {
  return (p as AmazonProduct).source === 'amazon';
}

/** Extrai a parte numérica do ID para comparação temporal (MLB3712345678 → 3712345678) */
function idToNum(id: string): number {
  const match = id.match(/\d+/);
  return match ? parseInt(match[0], 10) : 0;
}

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'default',    label: '🔥 Relevância' },
  { key: 'newest',     label: '🆕 Mais recentes' },
  { key: 'discount',   label: '🏷️ Maior desconto' },
  { key: 'price_asc',  label: '💰 Menor preço' },
  { key: 'price_desc', label: '💎 Maior preço' },
];

function sortProducts(products: AnyProduct[], key: SortKey): AnyProduct[] {
  if (key === 'default') return products;
  return [...products].sort((a, b) => {
    if (key === 'newest')     return idToNum(b.id) - idToNum(a.id);
    if (key === 'discount')   return b.discount_percent - a.discount_percent;
    if (key === 'price_asc')  return a.price - b.price;
    if (key === 'price_desc') return b.price - a.price;
    return 0;
  });
}

// ── Persistência de produtos adicionados ──────────────────────────────────────
const ADDED_KEY = 'promo-added-ids';

function loadAddedIds(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = localStorage.getItem(ADDED_KEY);
    if (raw) return new Set(JSON.parse(raw) as string[]);
  } catch { /* ignore */ }
  return new Set();
}

function saveAddedId(id: string) {
  if (typeof window === 'undefined') return;
  try {
    const set = loadAddedIds();
    set.add(id);
    // Manter no máximo 500 IDs para não lotar o localStorage
    const arr = Array.from(set).slice(-500);
    localStorage.setItem(ADDED_KEY, JSON.stringify(arr));
  } catch { /* ignore */ }
}

const ML_CATEGORIES = [
  { id: '', label: '🔥 Todos' },
  { id: 'MLB1055', label: '📱 Celulares' },
  { id: 'MLB1648', label: '💻 Computação' },
  { id: 'MLB1051', label: '🎮 Games' },
  { id: 'MLB1430', label: '📺 TV & Vídeo' },
  { id: 'MLB1000', label: '🏠 Eletrodomésticos' },
  { id: 'MLB1246', label: '👗 Moda' },
  { id: 'MLB1499', label: '🧴 Beleza' },
  { id: 'MLB1144', label: '🏋️ Esportes' },
  { id: 'MLB1459', label: '🛠️ Ferramentas' },
  { id: 'MLB1574', label: '🐾 Pet Shop' },
  { id: 'MLB1132', label: '📚 Livros' },
];

const AMAZON_CATEGORIES = [
  { id: '', label: '🔥 Todos' },
  { id: 'electronics', label: '⚡ Eletrônicos' },
  { id: 'phones', label: '📱 Celulares' },
  { id: 'computers', label: '💻 Computação' },
  { id: 'games', label: '🎮 Games' },
  { id: 'kitchen', label: '🍳 Cozinha' },
  { id: 'home', label: '🏠 Casa' },
  { id: 'beauty', label: '🧴 Beleza' },
  { id: 'sports', label: '🏋️ Esportes' },
  { id: 'books', label: '📚 Livros' },
  { id: 'toys', label: '🧸 Brinquedos' },
];

const SHOPEE_CATEGORIES = [
  { id: '', label: '🔥 Todos' },
  { id: 'phones', label: '📱 Celulares' },
  { id: 'electronics', label: '⚡ Eletrônicos' },
  { id: 'computers', label: '💻 Computação' },
  { id: 'fashion', label: '👗 Moda' },
  { id: 'beauty', label: '🧴 Beleza' },
  { id: 'home', label: '🏠 Casa' },
  { id: 'kitchen', label: '🍳 Cozinha' },
  { id: 'sports', label: '🏋️ Esportes' },
  { id: 'toys', label: '🧸 Brinquedos' },
  { id: 'books', label: '📚 Livros' },
];

const DISCOUNT_OPTIONS = [
  { value: 10, label: '≥10%' },
  { value: 20, label: '≥20%' },
  { value: 30, label: '≥30%' },
  { value: 50, label: '≥50%' },
  { value: 70, label: '≥70%' },
];

const ML_DEFAULT_QUERIES = [
  // Eletrônicos
  'smartphone', 'notebook', 'tv led', 'fone bluetooth', 'tablet', 'smartwatch', 'monitor', 'câmera',
  // Casa e cozinha
  'air fryer', 'aspirador', 'liquidificador', 'cafeteira', 'micro-ondas', 'panela elétrica', 'ventilador', 'geladeira',
  // Moda e vestuário
  'camiseta masculina', 'vestido feminino', 'tênis masculino', 'tênis feminino', 'calça jeans', 'jaqueta', 'moletom', 'sandália',
  // Beleza e cuidados
  'shampoo', 'perfume feminino', 'perfume masculino', 'maquiagem', 'protetor solar', 'creme hidratante',
  // Esportes
  'bicicleta', 'suplemento whey', 'tênis corrida', 'mochila', 'bermuda academia', 'halteres',
  // Bebês e infantil
  'carrinho de bebê', 'fraldas', 'brinquedo infantil', 'kit bebê',
  // Livros e papelaria
  'livro', 'caderno', 'caneta',
  // Ferramentas
  'furadeira', 'parafusadeira', 'kit ferramentas',
  // Automotivo
  'suporte celular carro', 'capinha celular', 'carregador veicular',
  // Games
  'controle gamer', 'headset gamer', 'cadeira gamer',
  // Animais
  'ração cachorro', 'ração gato', 'cama pet',
  // Alimentos
  'café', 'chocolate', 'whey protein',
];
const AMZ_DEFAULT_QUERIES = ['smartphone', 'fone bluetooth', 'smart tv', 'notebook', 'air fryer'];
const SPE_DEFAULT_QUERIES = ['fone bluetooth', 'smartphone', 'notebook', 'smartwatch', 'air fryer'];

interface AppSettings {
  mattWord: string;
  mattTool: string;
  webhookUrl: string;
  autoSend: boolean;
  evolutionUrl: string;
  evolutionApiKey: string;
  evolutionInstance: string;
}

const EMPTY_SETTINGS: AppSettings = {
  mattWord: '', mattTool: '', webhookUrl: '', autoSend: false,
  evolutionUrl: '', evolutionApiKey: '', evolutionInstance: 'whatsapp-bot',
};

function loadSettings(): AppSettings {
  if (typeof window === 'undefined') return EMPTY_SETTINGS;
  try {
    const stored = localStorage.getItem('promo-settings');
    if (stored) {
      const s = JSON.parse(stored) as Record<string, unknown>;
      return {
        mattWord: (s.mattWord ?? s.trackingId ?? '') as string,
        mattTool: (s.mattTool ?? '') as string,
        webhookUrl: (s.webhookUrl ?? '') as string,
        autoSend: (s.autoSend ?? false) as boolean,
        evolutionUrl: (s.evolutionUrl ?? '') as string,
        evolutionApiKey: (s.evolutionApiKey ?? '') as string,
        evolutionInstance: (s.evolutionInstance ?? 'whatsapp-bot') as string,
      };
    }
  } catch { /* ignore */ }
  return EMPTY_SETTINGS;
}

export default function PromoApp() {
  const [source, setSource] = useState<Source>('ml');

  // ML state
  const [mlProducts, setMlProducts] = useState<MLProduct[]>([]);
  const [mlLoading, setMlLoading] = useState(false);
  const [mlLoadingMore, setMlLoadingMore] = useState(false);
  const [mlError, setMlError] = useState<string | null>(null);
  const [mlHasMore, setMlHasMore] = useState(false);
  const [mlPage, setMlPage] = useState(1);

  // Amazon state
  const [amzProducts, setAmzProducts] = useState<AmazonProduct[]>([]);
  const [amzLoading, setAmzLoading] = useState(false);
  const [amzLoadingMore, setAmzLoadingMore] = useState(false);
  const [amzError, setAmzError] = useState<string | null>(null);
  const [amzHasMore, setAmzHasMore] = useState(false);
  const [amzPage, setAmzPage] = useState(1);
  const [amzSource, setAmzSource] = useState<'promobit' | null>(null);

  // Shopee state
  const [speProducts, setSpeProducts] = useState<ShopeeProduct[]>([]);
  const [speLoading, setSpeLoading] = useState(false);
  const [speLoadingMore, setSpeLoadingMore] = useState(false);
  const [speError, setSpeError] = useState<string | null>(null);
  const [speHasMore, setSpeHasMore] = useState(false);
  const [spePage, setSpePage] = useState(1);
  const [speSource, setSpeSource] = useState<'promobit' | null>(null);

  // Shared filters
  const [query, setQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState('');
  const [minDiscount, setMinDiscount] = useState(10);
  const [sortKey, setSortKey] = useState<SortKey>('default');
  const [showSortMenu, setShowSortMenu] = useState(false);
  const sortMenuRef = useRef<HTMLDivElement>(null);

  // Settings & UI
  const [settings, setSettings] = useState<AppSettings>(EMPTY_SETTINGS);
  const [botAddedCount, setBotAddedCount] = useState(0);
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // IDs de produtos já adicionados ao bot (persiste em localStorage)
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set());

  // Modal state
  const [modalProduct, setModalProduct] = useState<AnyProduct | null>(null);
  const [modalSaveStatus, setModalSaveStatus] = useState<'idle' | 'saving' | 'done' | 'error'>('idle');

  // Hook de mensagens — garante que o store Zustand é atualizado ao salvar
  const { addMessage } = useMessagesDb();

  useEffect(() => {
    setSettings(loadSettings());
    setAddedIds(loadAddedIds());
  }, []);

  // Fecha menu de sort ao clicar fora
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (sortMenuRef.current && !sortMenuRef.current.contains(e.target as Node)) {
        setShowSortMenu(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const saveSettings = (newSettings: AppSettings) => {
    setSettings(newSettings);
    localStorage.setItem('promo-settings', JSON.stringify(newSettings));
    // Persiste config da Evolution API no servidor (necessário para Cloudflare Workers)
    fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        evolutionUrl: newSettings.evolutionUrl,
        evolutionApiKey: newSettings.evolutionApiKey,
        evolutionInstance: newSettings.evolutionInstance,
      }),
    }).catch(() => { /* ignora falha silenciosa */ });
  };

  // ── ML fetching ──────────────────────────────────────────────────────────────
  const fetchML = useCallback(async (q: string, category: string, discount: number, sort?: string) => {
    setMlLoading(true);
    setMlProducts([]);
    setMlError(null);
    setMlHasMore(false);
    setMlPage(1);
    try {
      if (q.trim()) {
        // Busca específica: usa a query do usuário normalmente
        const params = new URLSearchParams({
          q: q.trim(), category, minDiscount: discount.toString(),
          mattWord: settings.mattWord, mattTool: settings.mattTool, limit: '50', page: '1',
          sort: sort ?? 'default',
        });
        const res = await fetch(`/api/ml-deals?${params}`);
        const data = await res.json() as { products: MLProduct[]; error?: string; hasMore?: boolean; warning?: string };
        if (!res.ok || data.error) {
          setMlError(data.error || 'Erro ao buscar promoções.');
        } else {
          setMlProducts(data.products || []);
          setMlHasMore(data.hasMore ?? false);
          if ((data.products || []).length === 0) setMlError('Nenhuma promoção encontrada. Tente outra busca ou reduza o desconto mínimo.');
        }
      } else {
        // Sem query: busca todas as categorias, página 1, em paralelo — rápido
        const shuffled = [...ML_DEFAULT_QUERIES].sort(() => Math.random() - 0.5);
        const fetchPage = (qItem: string, pg: number) =>
          fetch(`/api/ml-deals?${new URLSearchParams({
            q: qItem, category, minDiscount: discount.toString(),
            mattWord: settings.mattWord, mattTool: settings.mattTool, limit: '50', page: pg.toString(),
            sort: sort ?? 'default',
          })}`).then(r => r.json() as Promise<{ products: MLProduct[] }>).catch(() => ({ products: [] }));

        const settled = await Promise.allSettled(shuffled.map(qItem => fetchPage(qItem, 1)));

        const seen = new Set<string>();
        const merged: MLProduct[] = [];
        const batches = settled
          .filter((r): r is PromiseFulfilledResult<{ products: MLProduct[] }> => r.status === 'fulfilled')
          .map(r => r.value.products ?? []);
        // Intercala para variar categorias
        const maxLen = Math.max(...batches.map(b => b.length), 0);
        for (let i = 0; i < maxLen; i++) {
          for (const batch of batches) {
            if (i < batch.length) {
              const p = batch[i];
              if (!seen.has(p.id)) { seen.add(p.id); merged.push(p); }
            }
          }
        }
        if (merged.length === 0) {
          setMlError('Nenhuma promoção encontrada. Tente reduzir o desconto mínimo.');
        } else {
          setMlProducts(merged);
          setMlHasMore(true);
          setMlPage(1);
        }
      }
    } catch {
      setMlError('Falha de conexão. Verifique sua internet e tente novamente.');
    } finally {
      setMlLoading(false);
    }
  }, [settings.mattWord, settings.mattTool]);

  const loadMoreML = useCallback(async () => {
    if (mlLoadingMore) return;
    setMlLoadingMore(true);
    const nextPage = mlPage + 1;
    try {
      if (query.trim()) {
        // Busca específica: pagina normalmente
        const params = new URLSearchParams({
          q: query.trim(), category: activeCategory, minDiscount: minDiscount.toString(),
          mattWord: settings.mattWord, mattTool: settings.mattTool, limit: '50', page: nextPage.toString(),
          sort: sortKey,
        });
        const res = await fetch(`/api/ml-deals?${params}`);
        const data = await res.json() as { products: MLProduct[]; hasMore?: boolean };
        if (res.ok && data.products?.length) {
          setMlProducts((prev) => {
            const ids = new Set(prev.map((p) => p.id));
            return [...prev, ...data.products.filter((p) => !ids.has(p.id))];
          });
          setMlPage(nextPage);
          setMlHasMore(data.hasMore ?? false);
        } else {
          setMlHasMore(false);
        }
      } else {
        // Sem query: próxima página de todas as categorias em paralelo
        const shuffled = [...ML_DEFAULT_QUERIES].sort(() => Math.random() - 0.5);
        const fetchPg = (qItem: string, pg: number) =>
          fetch(`/api/ml-deals?${new URLSearchParams({
            q: qItem, category: activeCategory, minDiscount: minDiscount.toString(),
            mattWord: settings.mattWord, mattTool: settings.mattTool, limit: '50', page: pg.toString(),
            sort: sortKey,
          })}`).then(r => r.json() as Promise<{ products: MLProduct[] }>).catch(() => ({ products: [] }));

        const settled = await Promise.allSettled(shuffled.map(qItem => fetchPg(qItem, nextPage)));

        let addedCount = 0;
        setMlProducts((prev) => {
          const ids = new Set(prev.map((p) => p.id));
          const batches = settled
            .filter((r): r is PromiseFulfilledResult<{ products: MLProduct[] }> => r.status === 'fulfilled')
            .map(r => r.value.products ?? []);
          const newProducts: MLProduct[] = [];
          const maxLen = Math.max(...batches.map(b => b.length), 0);
          for (let i = 0; i < maxLen; i++) {
            for (const batch of batches) {
              if (i < batch.length && !ids.has(batch[i].id)) {
                ids.add(batch[i].id);
                newProducts.push(batch[i]);
              }
            }
          }
          addedCount = newProducts.length;
          return [...prev, ...newProducts];
        });
        setMlPage(nextPage);
        setMlHasMore(addedCount > 0);
      }
    } catch {
      setMlHasMore(false);
    } finally {
      setMlLoadingMore(false);
    }
  }, [mlLoadingMore, mlPage, query, activeCategory, minDiscount, sortKey, settings.mattWord, settings.mattTool]);

  // ── Amazon fetching ────────────────────────────────────────────────────────
  const fetchAmazon = useCallback(async (q: string, category: string, discount: number) => {
    setAmzLoading(true);
    setAmzProducts([]);
    setAmzError(null);
    setAmzHasMore(false);
    setAmzPage(1);
    setAmzSource(null);
    try {
      const searchQuery = q.trim() || AMZ_DEFAULT_QUERIES[Math.floor(Math.random() * AMZ_DEFAULT_QUERIES.length)];
      const params = new URLSearchParams({ q: searchQuery, category, minDiscount: discount.toString(), page: '1' });
      const res = await fetch(`/api/amazon-deals?${params}`);
      const data = await res.json() as { products: AmazonProduct[]; error?: string; hasMore?: boolean; source?: string };
      if (data.error && !data.products?.length) {
        setAmzError(data.error);
      } else {
        setAmzProducts(data.products || []);
        setAmzHasMore(data.hasMore ?? false);
        setAmzSource(data.source === 'promobit' ? 'promobit' : null);
        if (!(data.products || []).length) setAmzError('Nenhuma promoção Amazon encontrada. Tente outro termo ou reduza o desconto mínimo.');
      }
    } catch {
      setAmzError('Falha de conexão. Verifique sua internet e tente novamente.');
    } finally {
      setAmzLoading(false);
    }
  }, []);

  const loadMoreAmazon = useCallback(async () => {
    if (amzLoadingMore) return;
    setAmzLoadingMore(true);
    const nextPage = amzPage + 1;
    try {
      const searchQuery = query.trim() || AMZ_DEFAULT_QUERIES[0];
      const params = new URLSearchParams({ q: searchQuery, category: activeCategory, minDiscount: minDiscount.toString(), page: nextPage.toString() });
      const res = await fetch(`/api/amazon-deals?${params}`);
      const data = await res.json() as { products: AmazonProduct[]; hasMore?: boolean };
      if (res.ok && data.products?.length) {
        setAmzProducts((prev) => {
          const ids = new Set(prev.map((p) => p.id));
          return [...prev, ...data.products.filter((p) => !ids.has(p.id))];
        });
        setAmzPage(nextPage);
        setAmzHasMore(data.hasMore ?? false);
      } else {
        setAmzHasMore(false);
      }
    } catch {
      setAmzHasMore(false);
    } finally {
      setAmzLoadingMore(false);
    }
  }, [amzLoadingMore, amzPage, query, activeCategory, minDiscount]);

  // ── Shopee fetching ─────────────────────────────────────────────────────────
  const fetchShopee = useCallback(async (q: string, category: string, discount: number) => {
    setSpeLoading(true);
    setSpeProducts([]);
    setSpeError(null);
    setSpeHasMore(false);
    setSpePage(1);
    setSpeSource(null);
    try {
      const searchQuery = q.trim() || SPE_DEFAULT_QUERIES[Math.floor(Math.random() * SPE_DEFAULT_QUERIES.length)];
      const params = new URLSearchParams({ q: searchQuery, category, minDiscount: discount.toString(), page: '1' });
      const res = await fetch(`/api/shopee-deals?${params}`);
      const data = await res.json() as { products: ShopeeProduct[]; error?: string; hasMore?: boolean; source?: string };
      if (data.error && !data.products?.length) {
        setSpeError(data.error);
      } else {
        setSpeProducts(data.products || []);
        setSpeHasMore(data.hasMore ?? false);
        setSpeSource(data.source === 'promobit' ? 'promobit' : null);
        if (!(data.products || []).length) setSpeError('Nenhuma promoção Shopee encontrada. Tente outro termo ou reduza o desconto mínimo.');
      }
    } catch {
      setSpeError('Falha de conexão. Tente novamente.');
    } finally {
      setSpeLoading(false);
    }
  }, []);

  const loadMoreShopee = useCallback(async () => {
    if (speLoadingMore) return;
    setSpeLoadingMore(true);
    const nextPage = spePage + 1;
    try {
      const searchQuery = query.trim() || SPE_DEFAULT_QUERIES[0];
      const params = new URLSearchParams({ q: searchQuery, category: activeCategory, minDiscount: minDiscount.toString(), page: nextPage.toString() });
      const res = await fetch(`/api/shopee-deals?${params}`);
      const data = await res.json() as { products: ShopeeProduct[]; hasMore?: boolean };
      if (res.ok && data.products?.length) {
        setSpeProducts((prev) => {
          const ids = new Set(prev.map((p) => p.id));
          return [...prev, ...data.products.filter((p) => !ids.has(p.id))];
        });
        setSpePage(nextPage);
        setSpeHasMore(data.hasMore ?? false);
      } else {
        setSpeHasMore(false);
      }
    } catch {
      setSpeHasMore(false);
    } finally {
      setSpeLoadingMore(false);
    }
  }, [speLoadingMore, spePage, query, activeCategory, minDiscount]);

  // ── Init: só carrega ML na abertura ─────────────────────────────────────────
  useEffect(() => {
    fetchML('', '', 10, 'default');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Quando troca de aba, carrega se ainda não tem dados
  useEffect(() => {
    if (source === 'amazon' && amzProducts.length === 0 && !amzLoading) {
      fetchAmazon(query, activeCategory, minDiscount);
    }
    if (source === 'shopee' && speProducts.length === 0 && !speLoading) {
      fetchShopee(query, activeCategory, minDiscount);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source]);

  // ── Handlers ─────────────────────────────────────────────────────────────────
  const fetchCurrent = useCallback((q: string, cat: string, disc: number) => {
    if (source === 'ml') fetchML(q, cat, disc);
    else if (source === 'amazon') fetchAmazon(q, cat, disc);
    else fetchShopee(q, cat, disc);
  }, [source, fetchML, fetchAmazon, fetchShopee]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    fetchCurrent(query, activeCategory, minDiscount);
  };

  const handleQueryChange = (value: string) => {
    setQuery(value);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => {
      fetchCurrent(value, activeCategory, minDiscount);
    }, 600);
  };

  const handleCategoryChange = (catId: string) => {
    setActiveCategory(catId);
    fetchCurrent(query, catId, minDiscount);
  };

  const handleDiscountChange = (discount: number) => {
    setMinDiscount(discount);
    fetchCurrent(query, activeCategory, discount);
  };

  const handleSourceChange = (s: Source) => {
    setSource(s);
    setActiveCategory('');
    setQuery('');
    setSortKey('default');
    // Força reload dos produtos ao trocar de aba
    if (s === 'amazon') {
      setAmzProducts([]);
      setAmzError(null);
    } else if (s === 'shopee') {
      setSpeProducts([]);
      setSpeError(null);
    } else {
      setMlProducts([]);
      setMlError(null);
      setMlPage(1);
      setMlHasMore(true);
    }
  };

  // ── Modal: salvar promoção no bot ─────────────────────────────────────────
  const handleOpenModal = useCallback((product: AnyProduct) => {
    setModalProduct(product);
    setModalSaveStatus('idle');
  }, []);

  const handleModalConfirm = useCallback(async (product: AnyProduct, text: string, _affiliateLink: string) => {
    // Busca imagem como base64 para o bot
    let mediaDataUrl: string | undefined;
    let mediaName: string | undefined;
    let mediaType: string | undefined;
    try {
      const proxyRes = await fetch(`/api/image-proxy?url=${encodeURIComponent(product.thumbnail)}`);
      if (proxyRes.ok) {
        const { dataUrl, contentType } = await proxyRes.json() as { dataUrl: string; contentType: string };
        mediaDataUrl = dataUrl;
        mediaType = contentType;
        mediaName = `promo-${product.id}.jpg`;
      }
    } catch { /* sem imagem */ }

    // Usa addMessage do hook — atualiza o store Zustand E persiste no banco
    await addMessage({ text, mediaDataUrl, mediaName, mediaType, sendOnce: true });

    // Registra o produto como adicionado
    saveAddedId(product.id);
    setAddedIds((prev) => new Set([...prev, product.id]));
    setBotAddedCount((c) => c + 1);
  }, [addMessage]);

  // ── Derived values ───────────────────────────────────────────────────────────
  const categories = source === 'ml' ? ML_CATEGORIES : source === 'amazon' ? AMAZON_CATEGORIES : SHOPEE_CATEGORIES;
  const rawProducts: AnyProduct[] = source === 'ml' ? mlProducts : source === 'amazon' ? amzProducts : speProducts;
  const loading     = source === 'ml' ? mlLoading     : source === 'amazon' ? amzLoading     : speLoading;
  const loadingMore = source === 'ml' ? mlLoadingMore : source === 'amazon' ? amzLoadingMore : speLoadingMore;
  const error       = source === 'ml' ? mlError       : source === 'amazon' ? amzError       : speError;
  const hasMore     = source === 'ml' ? mlHasMore     : source === 'amazon' ? amzHasMore     : speHasMore;
  const refresh = source === 'ml'
    ? () => fetchML(query, activeCategory, minDiscount)
    : source === 'amazon'
      ? () => fetchAmazon(query, activeCategory, minDiscount)
      : () => fetchShopee(query, activeCategory, minDiscount);
  const loadMore = source === 'ml' ? loadMoreML : source === 'amazon' ? loadMoreAmazon : loadMoreShopee;
  const activeSortLabel = SORT_OPTIONS.find(o => o.key === sortKey)?.label ?? '🔥 Relevância';

  const dataSource = source === 'amazon' ? amzSource : source === 'shopee' ? speSource : null;

  // When data comes from Promobit (curated feed, not a search engine),
  // apply query + minDiscount filtering client-side so the user's filters still work.
  // Also enforce source guard so ML products never leak into Amazon/Shopee tabs.
  const products = useMemo(() => {
    let list = sortProducts(rawProducts, sortKey);
    // Safety filter: garante que só produtos da fonte correta aparecem na aba
    if (source === 'amazon') list = list.filter(p => (p as AmazonProduct).source === 'amazon');
    if (source === 'shopee') list = list.filter(p => (p as ShopeeProduct).source === 'shopee');
    if (dataSource === 'promobit') {
      if (query.trim()) list = list.filter(p => p.title.toLowerCase().includes(query.toLowerCase()));
      list = list.filter(p => p.discount_percent >= minDiscount);
    }
    return list;
  }, [rawProducts, sortKey, dataSource, query, minDiscount, source]);

  const accentColor = source === 'ml' ? '#00D4FF' : source === 'amazon' ? '#FF9900' : '#EE4D2D';
  const accentGrad  = source === 'ml'
    ? 'linear-gradient(135deg, #00D4FF 0%, #00FF88 100%)'
    : source === 'amazon'
      ? 'linear-gradient(135deg, #FF9900 0%, #FF6B00 100%)'
      : 'linear-gradient(135deg, #EE4D2D 0%, #FF8C00 100%)';

  const accentRgb   = source === 'ml' ? '0,212,255' : source === 'amazon' ? '255,153,0' : '238,77,45';

  return (
    <div className="min-h-screen" style={{ background: '#050505', color: '#fff' }}>
      {/* Sub-header */}
      <div className="w-full" style={{ background: 'rgba(5,5,5,0.7)', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
        <div className="max-w-7xl mx-auto px-3 sm:px-6 py-2 flex flex-col gap-2">
          {/* Linha 1: Logo + Settings (+ contador) */}
          <div className="flex items-center gap-2">
            {/* Logo */}
            <div className="flex items-center gap-2 shrink-0">
              <div className="w-6 h-6 rounded-md flex items-center justify-center" style={{ background: accentGrad }}>
                <Zap size={12} fill="black" color="black" />
              </div>
              <span className="font-bold text-white text-sm" style={{ letterSpacing: '-0.03em' }}>
                Promo<span style={{ background: accentGrad, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Radar</span>
              </span>
            </div>

            <div className="flex-1" />

            {/* Bot counter */}
            {botAddedCount > 0 && (
              <span className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full shrink-0" style={{ background: 'rgba(37,211,102,0.12)', color: '#25D366', border: '1px solid rgba(37,211,102,0.25)' }}>
                <MessageSquare size={11} />
                {botAddedCount}
              </span>
            )}
            <div className="shrink-0">
              <SettingsPanel settings={settings} onSave={saveSettings} />
            </div>
          </div>

          {/* Linha 2: Source tabs (scroll horizontal no mobile) */}
          <div className="flex items-center gap-1 rounded-full p-1 overflow-x-auto" style={{ background: '#0d0d0d', border: '1px solid rgba(255,255,255,0.08)', scrollbarWidth: 'none' }}>
            <button
              onClick={() => handleSourceChange('ml')}
              className="text-xs font-semibold px-3 py-1 rounded-full cursor-pointer transition-all whitespace-nowrap flex-1"
              style={source === 'ml' ? { background: 'linear-gradient(135deg, #00D4FF 0%, #00FF88 100%)', color: '#000' } : { color: '#666' }}
            >
              🛍️ Mercado Livre
            </button>
            <button
              onClick={() => handleSourceChange('amazon')}
              className="text-xs font-semibold px-3 py-1 rounded-full cursor-pointer transition-all whitespace-nowrap flex-1"
              style={source === 'amazon' ? { background: 'linear-gradient(135deg, #FF9900 0%, #FF6B00 100%)', color: '#000' } : { color: '#666' }}
            >
              🛒 Amazon
            </button>
            <button
              onClick={() => handleSourceChange('shopee')}
              className="text-xs font-semibold px-3 py-1 rounded-full cursor-pointer transition-all whitespace-nowrap flex-1"
              style={source === 'shopee' ? { background: 'linear-gradient(135deg, #EE4D2D 0%, #FF8C00 100%)', color: '#fff' } : { color: '#666' }}
            >
              🧡 Shopee
            </button>
          </div>

          {/* Linha 2: Search */}
          <form onSubmit={handleSearch}>
            <div className="flex items-center gap-2 px-3 py-2 rounded-full" style={{ background: '#0a0a0a', border: '1px solid rgba(255,255,255,0.1)' }}>
              <Search size={14} style={{ color: '#666' }} />
              <input
                type="text"
                value={query}
                onChange={(e) => handleQueryChange(e.target.value)}
                placeholder={source === 'ml' ? 'Buscar no Mercado Livre...' : source === 'amazon' ? 'Buscar na Amazon...' : 'Buscar na Shopee...'}
                className="flex-1 bg-transparent text-sm text-white outline-none placeholder:text-[#444]"
              />
              {loading && <RefreshCw size={13} className="animate-spin" style={{ color: accentColor }} />}
            </div>
          </form>
        </div>
      </div>

      {/* Main */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 flex flex-col gap-6">
        {/* Filters */}
        <div className="flex flex-col gap-3">
          <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
            {categories.map((cat) => (
              <button
                key={cat.id}
                onClick={() => handleCategoryChange(cat.id)}
                className="shrink-0 text-xs font-medium px-3.5 py-2 rounded-full transition-all duration-150 cursor-pointer whitespace-nowrap"
                style={
                  activeCategory === cat.id
                    ? { background: accentGrad, color: '#000' }
                    : { background: '#0d0d0d', border: '1px solid rgba(255,255,255,0.08)', color: '#A0A0A0' }
                }
              >
                {cat.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <Filter size={12} style={{ color: '#666' }} />
            <span className="text-xs" style={{ color: '#666' }}>Desconto mínimo:</span>
            {DISCOUNT_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => handleDiscountChange(opt.value)}
                className="text-xs font-medium px-2.5 py-1 rounded-full transition-all duration-150 cursor-pointer"
                style={
                  minDiscount === opt.value
                    ? { background: `rgba(${accentRgb},0.15)`, color: accentColor, border: `1px solid rgba(${accentRgb},0.4)` }
                    : { background: 'transparent', color: '#666', border: '1px solid rgba(255,255,255,0.06)' }
                }
              >
                {opt.label}
              </button>
            ))}

            {/* Ordenação */}
            <div ref={sortMenuRef} className="relative ml-auto">
              <button
                onClick={() => setShowSortMenu(v => !v)}
                className="flex items-center gap-1.5 text-xs font-medium px-3 py-1 rounded-full cursor-pointer transition-all"
                style={{ background: sortKey !== 'default' ? `rgba(${accentRgb},0.12)` : '#0d0d0d', border: `1px solid rgba(${accentRgb},${sortKey !== 'default' ? '0.4' : '0.1'})`, color: sortKey !== 'default' ? accentColor : '#888' }}
              >
                <ArrowUpDown size={11} />
                {activeSortLabel}
              </button>
              {showSortMenu && (
                <div
                  className="absolute right-0 top-full mt-1 z-30 rounded-2xl overflow-hidden py-1"
                  style={{ background: '#111', border: '1px solid rgba(255,255,255,0.1)', minWidth: 170, boxShadow: '0 8px 32px rgba(0,0,0,0.6)' }}
                >
                  {SORT_OPTIONS.map((opt) => (
                    <button
                      key={opt.key}
                      onClick={() => {
                        setSortKey(opt.key);
                        setShowSortMenu(false);
                        // Para ML, re-busca da API com o sort correto (dados reais)
                        if (source === 'ml') fetchML(query, activeCategory, minDiscount, opt.key);
                      }}
                      className="w-full flex items-center justify-between gap-2 px-4 py-2.5 text-xs cursor-pointer transition-all text-left"
                      style={{ color: sortKey === opt.key ? accentColor : '#A0A0A0', background: sortKey === opt.key ? `rgba(${accentRgb},0.08)` : 'transparent' }}
                    >
                      {opt.label}
                      {sortKey === opt.key && <Check size={11} />}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Stats bar */}
        {!loading && products.length > 0 && (
          <div className="flex items-center gap-2 text-xs" style={{ color: '#666' }}>
            <TrendingDown size={13} style={{ color: '#00FF88' }} />
            <span>
              <span style={{ color: '#A0A0A0', fontWeight: 600 }}>{products.length}</span> promoções encontradas
              {products[0] && (
                <> · maior desconto: <span style={{ color: '#00FF88', fontWeight: 600 }}>-{products[0].discount_percent}%</span></>
              )}
            </span>
            <button
              onClick={refresh}
              className="ml-auto flex items-center gap-1.5 px-2.5 py-1 rounded-full cursor-pointer"
              style={{ border: '1px solid rgba(255,255,255,0.08)', color: '#666' }}
            >
              <RefreshCw size={11} />
              Atualizar
            </button>
          </div>
        )}

        {/* Banner: fonte Promobit */}
        {dataSource === 'promobit' && !loading && products.length > 0 && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs" style={{ background: 'rgba(0,200,100,0.07)', border: '1px solid rgba(0,200,100,0.2)', color: '#00C864' }}>
            <span>🟢</span>
            <span>
              Dados em tempo real via <strong>Promobit</strong> · <strong>{products.length}</strong> promoções ativas · atualiza a cada 5 min
            </span>
          </div>
        )}

        {/* Loading skeleton */}
        {loading && (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-4">
            {Array.from({ length: 10 }).map((_, i) => (
              <div key={i} className="rounded-[20px] overflow-hidden animate-pulse" style={{ background: '#0d0d0d', border: '1px solid rgba(255,255,255,0.05)', height: 320 }}>
                <div className="h-48" style={{ background: '#111' }} />
                <div className="p-4 flex flex-col gap-3">
                  <div className="h-4 rounded-full" style={{ background: '#1a1a1a', width: '85%' }} />
                  <div className="h-4 rounded-full" style={{ background: '#1a1a1a', width: '60%' }} />
                  <div className="h-6 rounded-full" style={{ background: '#1a1a1a', width: '40%' }} />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Error state */}
        {!loading && error && (
          <div className="flex flex-col items-center justify-center py-24 gap-4">
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center" style={{ background: '#1a0a0a', border: '1px solid rgba(255,80,80,0.2)' }}>
              <Search size={28} style={{ color: '#ff5050' }} />
            </div>
            <p className="text-sm text-center max-w-sm" style={{ color: '#ff8080' }}>{error}</p>
            {(source === 'amazon' || source === 'shopee') && (
              <p className="text-xs text-center max-w-xs" style={{ color: '#555' }}>
                Tente novamente em alguns instantes.
              </p>
            )}
            <button
              onClick={() => {
                if (source === 'ml') setMlError(null);
                else if (source === 'amazon') setAmzError(null);
                else setSpeError(null);
                refresh();
              }}
              className="text-xs px-4 py-2 rounded-full cursor-pointer"
              style={{ border: `1px solid rgba(${accentRgb},0.3)`, color: accentColor }}
            >
              Tentar novamente
            </button>
            <button
              onClick={() => {
                setQuery(''); setActiveCategory(''); setMinDiscount(10);
                if (source === 'ml') { setMlError(null); fetchML('', '', 10); }
                else if (source === 'amazon') { setAmzError(null); fetchAmazon('', '', 10); }
                else { setSpeError(null); fetchShopee('', '', 10); }
              }}
              className="text-xs px-3 py-1.5 rounded-full cursor-pointer"
              style={{ color: '#666' }}
            >
              Limpar filtros
            </button>
          </div>
        )}

        {/* Empty state */}
        {!loading && !error && products.length === 0 && (
          <div className="flex flex-col items-center justify-center py-24 gap-4">
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center" style={{ background: '#0d0d0d', border: '1px solid rgba(255,255,255,0.08)' }}>
              <Search size={28} style={{ color: '#333' }} />
            </div>
            <p className="text-sm" style={{ color: '#666' }}>Nenhuma promoção encontrada com esse filtro.</p>
          </div>
        )}

        {/* Products grid */}
        {!loading && products.length > 0 && (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-4">
              {products.map((product) => (
                <ProductCard
                  key={product.id}
                  product={product}
                  accentColor={accentColor}
                  accentGrad={accentGrad}
                  alreadyAdded={addedIds.has(product.id)}
                  onAddToBot={handleOpenModal}
                />
              ))}
            </div>

            {/* Load more */}
            <div className="flex justify-center pt-2 pb-8">
              {hasMore ? (
                <button
                  onClick={loadMore}
                  disabled={loadingMore}
                  className="flex items-center gap-2 px-6 py-2.5 rounded-full text-sm font-medium cursor-pointer transition-all"
                  style={{ background: '#0d0d0d', border: '1px solid rgba(255,255,255,0.1)', color: '#A0A0A0' }}
                >
                  {loadingMore ? (
                    <><RefreshCw size={14} className="animate-spin" style={{ color: accentColor }} /> Carregando...</>
                  ) : (
                    <><TrendingDown size={14} /> Carregar mais promoções</>
                  )}
                </button>
              ) : (
                <span className="text-xs" style={{ color: '#444' }}>{products.length} promoções carregadas</span>
              )}
            </div>
          </>
        )}
      </main>

      {/* Modal AddToBot */}
      {modalProduct && (
        <AddToBotModal
          product={modalProduct}
          onClose={() => setModalProduct(null)}
          onConfirm={handleModalConfirm}
        />
      )}
    </div>
  );
}
