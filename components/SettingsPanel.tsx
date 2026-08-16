'use client';

import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Settings, X, CheckCircle, ExternalLink, ShoppingBag } from 'lucide-react';

interface AppSettings {
  mattWord: string;
  mattTool: string;
  webhookUrl: string;
  autoSend: boolean;
  evolutionUrl: string;
  evolutionApiKey: string;
  evolutionInstance: string;
  mlLinkServerUrl: string;
}

interface SettingsPanelProps {
  settings: AppSettings;
  onSave: (settings: AppSettings) => void;
}

export function SettingsPanel({ settings, onSave }: SettingsPanelProps) {
  const [open, setOpen] = useState(false);
  const [local, setLocal] = useState<AppSettings>(settings);
  const [saved, setSaved] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [mlNickname, setMlNickname] = useState<string | null>(null);
  const [groupLink, setGroupLink] = useState('');
  const [groupName, setGroupName] = useState('');
  const [groupSaved, setGroupSaved] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setMounted(true); }, []);
  useEffect(() => { setLocal(settings); }, [settings]);

  // Carregar config do grupo e status ML ao abrir
  useEffect(() => {
    if (!open) return;
    fetch('/api/ml-auth/status')
      .then(r => r.ok ? r.json() : null)
      .then((d: { connected: boolean; nickname?: string } | null) => {
        setMlNickname(d?.connected ? (d.nickname ?? 'Conectado') : null);
      })
      .catch(() => setMlNickname(null));
    fetch('/api/group-config')
      .then(r => r.ok ? r.json() : {})
      .then((d: { groupLink?: string; groupName?: string }) => {
        setGroupLink(d.groupLink ?? '');
        setGroupName(d.groupName ?? '');
      })
      .catch(() => {});
  }, [open]);

  const handleSaveGroup = async () => {
    await fetch('/api/group-config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ groupLink, groupName }),
    });
    setGroupSaved(true);
    setTimeout(() => setGroupSaved(false), 2000);
  };

  const handleSave = () => {
    onSave(local);
    setSaved(true);
    setTimeout(() => { setSaved(false); setOpen(false); }, 1200);
  };

  const inputStyle: React.CSSProperties = { border: '1px solid rgba(255,255,255,0.1)', color: '#fff' };

  const modal = (
    <div
      ref={scrollRef}
      onClick={e => { if (e.target === e.currentTarget) setOpen(false); }}
      style={{
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
        zIndex: 9999,
        overflowY: 'auto',
        background: 'rgba(0,0,0,0.88)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        padding: '40px 16px 40px',
      }}
    >
      <div style={{ maxWidth: 520, margin: '0 auto' }}>
        <div style={{ background: '#0a0a0a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 24, padding: 24, display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#fff', letterSpacing: '-0.03em' }}>Configurações</h2>
            <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: '#666', cursor: 'pointer', padding: 4, display: 'flex' }}>
              <X size={20} />
            </button>
          </div>

          {/* ── Evolution API ── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: '#25D366', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                Evolution API (WhatsApp)
              </label>
              <a href="https://railway.app/template/evolution-api" target="_blank" rel="noopener noreferrer"
                style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#555', textDecoration: 'none' }}>
                <ExternalLink size={11} />
                Deploy gratuito no Railway
              </a>
            </div>
            <div style={{ background: 'rgba(37,211,102,0.06)', border: '1px solid rgba(37,211,102,0.15)', borderRadius: 12, padding: '10px 12px', fontSize: 12, color: '#666', lineHeight: 1.6 }}>
              <strong style={{ color: '#25D366' }}>Como usar:</strong> Faça deploy da Evolution API no Railway (gratuito), copie a URL e a API Key e cole abaixo.
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 12, color: '#666' }}>URL do servidor</span>
              <input type="text" value={local.evolutionUrl ?? ''}
                onChange={e => setLocal({ ...local, evolutionUrl: e.target.value.trim() })}
                placeholder="https://evolution.seudominio.com"
                style={{ ...inputStyle, background: 'transparent', outline: 'none', padding: '10px 12px', borderRadius: 12, fontSize: 14, width: '100%', boxSizing: 'border-box' }} />
            </div>
            <div style={{ display: 'flex', gap: 12 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1 }}>
                <span style={{ fontSize: 12, color: '#666' }}>API Key</span>
                <input type="password" value={local.evolutionApiKey ?? ''}
                  onChange={e => setLocal({ ...local, evolutionApiKey: e.target.value.trim() })}
                  placeholder="sua-api-key"
                  style={{ ...inputStyle, background: 'transparent', outline: 'none', padding: '10px 12px', borderRadius: 12, fontSize: 14, width: '100%', boxSizing: 'border-box' }} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1 }}>
                <span style={{ fontSize: 12, color: '#666' }}>Nome da instância</span>
                <input type="text" value={local.evolutionInstance ?? 'whatsapp-bot'}
                  onChange={e => setLocal({ ...local, evolutionInstance: e.target.value.trim() })}
                  placeholder="whatsapp-bot"
                  style={{ ...inputStyle, background: 'transparent', outline: 'none', padding: '10px 12px', borderRadius: 12, fontSize: 14, width: '100%', boxSizing: 'border-box' }} />
              </div>
            </div>
          </div>

          {/* ── Conta Mercado Livre ── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: '#A0A0A0', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              Conta Mercado Livre
            </label>
            {mlNickname ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(0,255,136,0.06)', border: '1px solid rgba(0,255,136,0.25)', borderRadius: 12, padding: '10px 14px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <ShoppingBag size={15} style={{ color: '#00FF88' }} />
                  <span style={{ fontSize: 13, color: '#00FF88', fontWeight: 600 }}>{mlNickname}</span>
                  <span style={{ fontSize: 11, color: '#555' }}>conectado</span>
                </div>
                <a href="/api/ml-auth" style={{ fontSize: 11, color: '#555', textDecoration: 'underline', cursor: 'pointer' }}>
                  Reconectar
                </a>
              </div>
            ) : (
              <a
                href="/api/ml-auth"
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '11px 0', borderRadius: 12, fontWeight: 600, fontSize: 13, cursor: 'pointer', textDecoration: 'none', background: 'rgba(255,230,0,0.08)', border: '1px solid rgba(255,230,0,0.25)', color: '#FFE600', transition: 'all 0.2s' }}
              >
                <ShoppingBag size={15} />
                Conectar conta Mercado Livre
                <ExternalLink size={12} style={{ opacity: 0.6 }} />
              </a>
            )}
            <p style={{ fontSize: 11, color: '#555', margin: 0 }}>
              Necessário para buscar promoções em tempo real e usar ordenação por mais recentes.
            </p>
          </div>

          {/* ── Afiliado ML ── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: '#A0A0A0', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              Parâmetros de afiliado (Mercado Livre)
            </label>
            <div style={{ display: 'flex', gap: 12 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1 }}>
                <span style={{ fontSize: 12, color: '#666' }}>matt_word</span>
                <input type="text" value={local.mattWord}
                  onChange={e => setLocal({ ...local, mattWord: e.target.value.trim() })}
                  placeholder="eclash62"
                  style={{ ...inputStyle, background: 'transparent', outline: 'none', padding: '10px 12px', borderRadius: 12, fontSize: 14, width: '100%', boxSizing: 'border-box' }} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1 }}>
                <span style={{ fontSize: 12, color: '#666' }}>matt_tool</span>
                <input type="text" value={local.mattTool}
                  onChange={e => setLocal({ ...local, mattTool: e.target.value.trim() })}
                  placeholder="51647683"
                  style={{ ...inputStyle, background: 'transparent', outline: 'none', padding: '10px 12px', borderRadius: 12, fontSize: 14, width: '100%', boxSizing: 'border-box' }} />
              </div>
            </div>
            {local.mattWord && (
              <div style={{ background: '#0d0d0d', border: '1px solid rgba(0,212,255,0.1)', borderRadius: 12, padding: '8px 12px', fontSize: 11, color: '#555', wordBreak: 'break-all' }}>
                {`mercadolivre.com.br/p/MLB...?matt_word=${local.mattWord}${local.mattTool ? `&matt_tool=${local.mattTool}` : ''}&forceInApp=true`}
              </div>
            )}

            {/* ── Link curto meli.la (ml-link-server) ── */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4, borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 14 }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: '#A0A0A0', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                Link curto meli.la (opcional)
              </label>
              <div style={{ background: 'rgba(255,165,0,0.05)', border: '1px solid rgba(255,165,0,0.15)', borderRadius: 12, padding: '8px 12px', fontSize: 11, color: '#888', lineHeight: 1.6 }}>
                URL do <strong style={{ color: '#FFA500' }}>ml-link-server.js</strong> rodando no seu PC (ex: via ngrok).<br />
                Quando configurado, os links do ML no bot saem como <strong style={{ color: '#FFA500' }}>meli.la/xxxxx</strong>.
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ fontSize: 12, color: '#666' }}>URL do ml-link-server (porta 3002)</span>
                <input
                  type="url"
                  value={local.mlLinkServerUrl ?? ''}
                  onChange={e => setLocal({ ...local, mlLinkServerUrl: e.target.value.trim() })}
                  placeholder="https://xxxx.ngrok-free.app"
                  style={{ ...inputStyle, background: 'transparent', outline: 'none', padding: '10px 12px', borderRadius: 12, fontSize: 14, width: '100%', boxSizing: 'border-box' }}
                />
              </div>
            </div>
          </div>

          {/* ── Landing page de captação ── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: '#A0A0A0', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                Landing page do grupo
              </label>
              <a href="/entrar" target="_blank" rel="noopener noreferrer"
                style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#00D4FF', textDecoration: 'none' }}>
                <ExternalLink size={11} />
                Ver página
              </a>
            </div>
            <div style={{ background: 'rgba(0,212,255,0.04)', border: '1px solid rgba(0,212,255,0.12)', borderRadius: 12, padding: '10px 12px', fontSize: 12, color: '#666', lineHeight: 1.6 }}>
              Use <strong style={{ color: '#00D4FF' }}>app-0701c13d2e.happyseeds.space/entrar</strong> nos seus anúncios. Configure abaixo o link e nome do grupo.
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 12, color: '#666' }}>Nome do grupo</span>
              <input type="text" value={groupName}
                onChange={e => setGroupName(e.target.value)}
                placeholder="Ex: Promoções da Hora 🔥"
                style={{ ...inputStyle, background: 'transparent', outline: 'none', padding: '10px 12px', borderRadius: 12, fontSize: 14, width: '100%', boxSizing: 'border-box' }} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 12, color: '#666' }}>Link de convite do grupo (WhatsApp)</span>
              <input type="text" value={groupLink}
                onChange={e => setGroupLink(e.target.value.trim())}
                placeholder="https://chat.whatsapp.com/..."
                style={{ ...inputStyle, background: 'transparent', outline: 'none', padding: '10px 12px', borderRadius: 12, fontSize: 14, width: '100%', boxSizing: 'border-box' }} />
            </div>
            <button
              onClick={handleSaveGroup}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, width: '100%', padding: '10px 0', borderRadius: 999, fontWeight: 600, fontSize: 13, cursor: 'pointer', border: groupSaved ? 'none' : '1px solid rgba(0,212,255,0.2)', background: groupSaved ? '#00FF88' : 'rgba(0,212,255,0.15)', color: groupSaved ? '#000' : '#00D4FF', transition: 'all 0.2s' }}
            >
              {groupSaved ? <><CheckCircle size={14} /> Salvo!</> : 'Salvar configurações da página'}
            </button>
          </div>

          <button
            onClick={handleSave}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, width: '100%', padding: '12px 0', borderRadius: 999, fontWeight: 600, fontSize: 14, cursor: 'pointer', border: 'none', background: saved ? '#00FF88' : 'linear-gradient(135deg, #00D4FF 0%, #00FF88 100%)', color: '#000', transition: 'all 0.2s' }}
          >
            {saved ? <><CheckCircle size={16} /> Salvo!</> : 'Salvar configurações'}
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 text-sm font-medium px-3 py-2 sm:px-4 sm:py-2.5 rounded-full transition-all duration-150 cursor-pointer"
        style={{ border: '1px solid rgba(255,255,255,0.12)', color: '#A0A0A0' }}
        title="Configurações"
      >
        <Settings size={15} />
        <span className="hidden sm:inline">Configurações</span>
      </button>

      {open && mounted && createPortal(modal, document.body)}
    </>
  );
}
