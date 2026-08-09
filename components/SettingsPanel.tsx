'use client';

import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Settings, X, CheckCircle, ExternalLink } from 'lucide-react';

interface AppSettings {
  mattWord: string;
  mattTool: string;
  webhookUrl: string;
  autoSend: boolean;
  evolutionUrl: string;
  evolutionApiKey: string;
  evolutionInstance: string;
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
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setMounted(true); }, []);
  useEffect(() => { setLocal(settings); }, [settings]);

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
        className="flex items-center gap-2 text-sm font-medium px-4 py-2.5 rounded-full transition-all duration-150 cursor-pointer"
        style={{ border: '1px solid rgba(255,255,255,0.12)', color: '#A0A0A0' }}
      >
        <Settings size={15} />
        Configurações
      </button>

      {open && mounted && createPortal(modal, document.body)}
    </>
  );
}
