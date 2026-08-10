'use client';

import { useEffect, useState, useRef } from 'react';
import Image from 'next/image';

interface GroupConfig {
  groupLink?: string;
  groupName?: string;
  groupDescription?: string;
  memberCount?: number;
}

const TICKER_ITEMS = [
  '🔥 XIAOMI REDMI NOTE 14 — 47% OFF',
  '⚡ AIRPODS PRO — R$189 (era R$359)',
  '💸 CUPOM AMAZON: PROMO20 — 20% EXTRA',
  '🛒 TÊNIS NIKE AIR MAX — R$249',
  '🎮 JOYSTICK PS5 — R$289 (era R$499)',
  '📱 SAMSUNG A55 — R$1.299 (era R$2.199)',
  '🖥️ MONITOR 27" 144Hz — R$899',
  '🎧 FONE JBL TUNE — R$99 (era R$249)',
  '💻 NOTEBOOK LENOVO — R$2.499',
  '⌚ SMARTWATCH AMAZFIT — R$189',
  '👟 TÊNIS ADIDAS — R$159 (era R$349)',
  '🏠 AIR FRYER 5L — R$149 (era R$299)',
];

const TESTIMONIALS = [
  { name: 'Ana Paula', text: 'Economizei mais de R$800 no mês passado só com as promos do grupo!', time: '2h atrás' },
  { name: 'Carlos R.', text: 'Comprei meu notebook com 40% de desconto graças ao aviso do grupo', time: '5h atrás' },
  { name: 'Mariana S.', text: 'Melhor grupo de promos que já entrei. As ofertas chegam super rápido!', time: '1d atrás' },
  { name: 'João V.', text: 'Me avisaram de um cupom que durou só 2h e eu ainda consegui usar 🙌', time: '1d atrás' },
  { name: 'Fernanda L.', text: 'Já indiquei pra toda minha família, vale muito!', time: '2d atrás' },
];

// Cores da marca: azul escuro + laranja
const BRAND = {
  navy:    '#0E1A3D',
  navyMid: '#162050',
  orange:  '#FF7A00',
  orangeHover: '#FF9A30',
  white:   '#FFFFFF',
  offWhite:'#E8ECF5',
  muted:   '#8899BB',
  quiet:   '#3A4D7A',
};

function PulseDot({ color = BRAND.orange }: { color?: string }) {
  return (
    <span style={{
      display: 'inline-block', width: 8, height: 8, borderRadius: '50%',
      background: color, boxShadow: `0 0 8px ${color}cc`,
      animation: 'pulse 1.2s ease infinite', flexShrink: 0,
    }} />
  );
}

function WhatsAppIcon({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
      <path d="M12 0C5.373 0 0 5.373 0 12c0 2.123.553 4.107 1.523 5.831L0 24l6.338-1.499C8.024 23.459 9.976 24 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-1.846 0-3.569-.493-5.052-1.35l-.362-.213-3.763.89.942-3.669-.235-.378C2.523 15.623 2 13.876 2 12 2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z"/>
    </svg>
  );
}

export default function LandingPage() {
  const [config, setConfig] = useState<GroupConfig>({});
  const [memberCount, setMemberCount] = useState(2847);
  const [joined, setJoined] = useState(false);

  useEffect(() => {
    fetch('/api/group-config')
      .then(r => r.ok ? r.json() : {})
      .then((d: GroupConfig) => {
        setConfig(d);
        if (d.memberCount) setMemberCount(d.memberCount);
      })
      .catch(() => {});
  }, []);

  // Contador crescendo devagar
  useEffect(() => {
    const interval = setInterval(() => {
      if (Math.random() < 0.3) setMemberCount(n => n + 1);
    }, 9000);
    return () => clearInterval(interval);
  }, []);

  const groupName = config.groupName || 'Ofertas da Hora';
  const groupLink = config.groupLink || '#';

  const handleJoin = () => {
    setJoined(true);
    if (groupLink && groupLink !== '#') window.open(groupLink, '_blank');
  };

  return (
    <div style={{ background: BRAND.navy, minHeight: '100vh', fontFamily: "'Inter', 'Segoe UI', sans-serif", color: BRAND.offWhite, overflowX: 'hidden' }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');
        @keyframes pulse { 0%,100%{opacity:0.4} 50%{opacity:1} }
        @keyframes scroll-x { from{transform:translateX(0)} to{transform:translateX(-50%)} }
        @keyframes fadeInUp { from{opacity:0;transform:translateY(28px)} to{opacity:1;transform:translateY(0)} }
        @keyframes glow-breathe { 0%,100%{opacity:0.2} 50%{opacity:0.45} }
        @keyframes float { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-10px)} }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        .cta-btn { transition: all 0.18s ease !important; }
        .cta-btn:hover { transform: scale(1.04) !important; box-shadow: 0 0 40px rgba(255,122,0,0.65) !important; }
        .cta-btn:active { transform: scale(0.97) !important; }
        .benefit-card { transition: all 0.2s ease !important; }
        .benefit-card:hover { border-color: rgba(255,122,0,0.4) !important; transform: translateY(-3px); box-shadow: 0 8px 32px rgba(255,122,0,0.1) !important; }
        .testimonial-card { transition: all 0.2s ease !important; }
        .testimonial-card:hover { border-color: rgba(255,122,0,0.3) !important; }
      `}</style>

      {/* ── Nav ── */}
      <nav style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 50, height: 60, background: 'rgba(14,26,61,0.95)', borderBottom: `1px solid rgba(255,122,0,0.15)`, backdropFilter: 'blur(12px)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 20px', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Image src="/logo-ofertas.png" alt="Ofertas da Hora" width={36} height={36} style={{ borderRadius: '50%' }} />
          <span style={{ fontWeight: 700, fontSize: 15, color: BRAND.white }}>{groupName}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <PulseDot />
          <span style={{ fontFamily: 'monospace', fontSize: 11, color: BRAND.muted, letterSpacing: '0.08em' }}>{memberCount.toLocaleString('pt-BR')} membros</span>
        </div>
        <button onClick={handleJoin} className="cta-btn"
          style={{ background: BRAND.orange, color: '#fff', border: 'none', borderRadius: 9999, padding: '9px 18px', fontWeight: 700, fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap', boxShadow: '0 0 16px rgba(255,122,0,0.4)' }}>
          Entrar grátis
        </button>
      </nav>

      {/* ── Hero ── */}
      <section style={{ position: 'relative', minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '80px 24px 40px', textAlign: 'center', overflow: 'hidden' }}>
        {/* Glow de fundo */}
        <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse 80% 60% at 50% 40%, rgba(255,122,0,0.1), transparent 70%)', animation: 'glow-breathe 5s ease infinite', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '40%', background: `linear-gradient(to top, ${BRAND.navy}, transparent)`, pointerEvents: 'none' }} />

        <div style={{ position: 'relative', zIndex: 1, maxWidth: 660, animation: 'fadeInUp 0.6s ease forwards' }}>
          {/* Logo */}
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 28, animation: 'float 4s ease infinite' }}>
            <Image src="/logo-ofertas.png" alt="Ofertas da Hora" width={120} height={120} style={{ borderRadius: '50%', boxShadow: '0 0 48px rgba(255,122,0,0.35), 0 0 96px rgba(255,122,0,0.15)' }} />
          </div>

          {/* Live pill */}
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'rgba(255,122,0,0.12)', border: '1px solid rgba(255,122,0,0.35)', borderRadius: 9999, padding: '6px 16px', marginBottom: 24 }}>
            <PulseDot />
            <span style={{ fontFamily: 'monospace', fontSize: 11, color: BRAND.orange, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
              {memberCount.toLocaleString('pt-BR')} membros ativos agora
            </span>
          </div>

          <h1 style={{ fontSize: 'clamp(36px, 7vw, 72px)', fontWeight: 900, lineHeight: 1.05, letterSpacing: '-0.03em', marginBottom: 20, color: BRAND.white }}>
            Promoções reais,{' '}
            <span style={{ color: BRAND.orange, textShadow: '0 0 32px rgba(255,122,0,0.5)' }}>descontos de verdade!</span>
          </h1>

          <p style={{ fontSize: 18, color: BRAND.muted, lineHeight: 1.7, marginBottom: 40, maxWidth: 500, margin: '0 auto 40px' }}>
            As melhores ofertas do Brasil chegam direto no seu WhatsApp — antes de todo mundo e 100% grátis.
          </p>

          {/* CTA principal */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
            <button onClick={handleJoin} className="cta-btn"
              style={{ display: 'flex', alignItems: 'center', gap: 12, background: BRAND.orange, color: '#fff', border: 'none', borderRadius: 9999, padding: '18px 44px', fontWeight: 800, fontSize: 18, cursor: 'pointer', boxShadow: '0 0 32px rgba(255,122,0,0.5)', fontFamily: 'Inter, sans-serif' }}>
              <WhatsAppIcon size={24} />
              {joined ? 'Abrindo WhatsApp...' : 'Entrar no grupo GRÁTIS'}
            </button>
            <span style={{ fontFamily: 'monospace', fontSize: 11, color: BRAND.quiet, letterSpacing: '0.06em' }}>
              SEM SPAM · SAIR QUANDO QUISER · 100% GRATUITO
            </span>
          </div>
        </div>
      </section>

      {/* ── Ticker ── */}
      <div style={{ background: BRAND.navyMid, borderTop: `1px solid rgba(255,122,0,0.12)`, borderBottom: `1px solid rgba(255,122,0,0.12)`, padding: '12px 0', overflow: 'hidden' }}>
        <div style={{ display: 'flex', gap: 56, whiteSpace: 'nowrap', animation: 'scroll-x 35s linear infinite' }}>
          {[...TICKER_ITEMS, ...TICKER_ITEMS].map((item, i) => (
            <span key={i} style={{ fontFamily: 'monospace', fontSize: 12, color: BRAND.muted, letterSpacing: '0.03em' }}>
              {item}
            </span>
          ))}
        </div>
      </div>

      {/* ── Números ── */}
      <section style={{ padding: '72px 24px', maxWidth: 900, margin: '0 auto' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16 }}>
          {[
            { value: memberCount.toLocaleString('pt-BR'), label: 'Membros no grupo' },
            { value: '12+', label: 'Ofertas enviadas por dia' },
            { value: '40%+', label: 'Desconto médio' },
            { value: '4.9★', label: 'Avaliação dos membros' },
          ].map((stat, i) => (
            <div key={i} className="benefit-card" style={{ background: BRAND.navyMid, border: `1px solid rgba(255,122,0,0.12)`, borderRadius: 16, padding: '24px 20px', textAlign: 'center' }}>
              <div style={{ fontFamily: 'monospace', fontSize: 34, fontWeight: 800, color: BRAND.orange, letterSpacing: '-0.02em' }}>{stat.value}</div>
              <div style={{ fontSize: 13, color: BRAND.muted, marginTop: 6 }}>{stat.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Benefícios ── */}
      <section style={{ padding: '0 24px 72px', maxWidth: 900, margin: '0 auto' }}>
        <h2 style={{ fontSize: 'clamp(26px, 5vw, 44px)', fontWeight: 800, letterSpacing: '-0.02em', textAlign: 'center', marginBottom: 12, color: BRAND.white }}>
          Por que entrar?
        </h2>
        <p style={{ textAlign: 'center', color: BRAND.muted, marginBottom: 44, fontSize: 15 }}>Tudo que você precisa para economizar mais</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16 }}>
          {[
            { icon: '⚡', title: 'Ofertas em tempo real', desc: 'Receba promos minutos depois que aparecem — antes do estoque acabar.' },
            { icon: '🤖', title: 'Bot inteligente', desc: 'Nosso bot filtra só as melhores ofertas com desconto real, sem enganação.' },
            { icon: '🛒', title: 'Todas as lojas', desc: 'Mercado Livre, Amazon, Shopee e muito mais — tudo num só lugar.' },
            { icon: '🏷️', title: 'Cupons exclusivos', desc: 'Cupons e códigos garimpados especialmente para o grupo.' },
            { icon: '📊', title: 'Desconto verificado', desc: 'Só enviamos com desconto real comparado ao preço histórico.' },
            { icon: '🔕', title: 'Sem spam', desc: 'Poucos avisos por dia, todos relevantes. Seu WhatsApp não vai enlouquecer.' },
          ].map((b, i) => (
            <div key={i} className="benefit-card" style={{ background: BRAND.navyMid, border: `1px solid rgba(255,122,0,0.1)`, borderRadius: 16, padding: '24px' }}>
              <div style={{ fontSize: 30, marginBottom: 12 }}>{b.icon}</div>
              <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 8, color: BRAND.white }}>{b.title}</div>
              <div style={{ fontSize: 14, color: BRAND.muted, lineHeight: 1.6 }}>{b.desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Depoimentos ── */}
      <section style={{ padding: '0 24px 72px', maxWidth: 900, margin: '0 auto' }}>
        <h2 style={{ fontSize: 'clamp(26px, 5vw, 44px)', fontWeight: 800, letterSpacing: '-0.02em', textAlign: 'center', marginBottom: 44, color: BRAND.white }}>
          O que os membros dizem
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16 }}>
          {TESTIMONIALS.map((t, i) => (
            <div key={i} className="testimonial-card" style={{ background: BRAND.navyMid, border: `1px solid rgba(255,255,255,0.06)`, borderRadius: 16, padding: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                <div style={{ width: 38, height: 38, borderRadius: '50%', background: `linear-gradient(135deg, ${BRAND.orange}, #FF4500)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 15, color: '#fff', flexShrink: 0 }}>
                  {t.name[0]}
                </div>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 14, color: BRAND.white }}>{t.name}</div>
                  <div style={{ fontFamily: 'monospace', fontSize: 10, color: BRAND.quiet }}>{t.time}</div>
                </div>
              </div>
              <p style={{ fontSize: 14, color: BRAND.muted, lineHeight: 1.65 }}>&ldquo;{t.text}&rdquo;</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── CTA final ── */}
      <section style={{ padding: '72px 24px', textAlign: 'center', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse 70% 80% at 50% 50%, rgba(255,122,0,0.08), transparent 70%)', pointerEvents: 'none' }} />
        <div style={{ position: 'relative', zIndex: 1, maxWidth: 540, margin: '0 auto' }}>
          <Image src="/logo-ofertas.png" alt="Ofertas da Hora" width={80} height={80} style={{ borderRadius: '50%', margin: '0 auto 24px', display: 'block', boxShadow: '0 0 32px rgba(255,122,0,0.3)' }} />
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'rgba(255,122,0,0.12)', border: `1px solid rgba(255,122,0,0.3)`, borderRadius: 9999, padding: '6px 16px', marginBottom: 24 }}>
            <PulseDot />
            <span style={{ fontFamily: 'monospace', fontSize: 11, color: BRAND.orange, letterSpacing: '0.1em' }}>VAGAS LIMITADAS</span>
          </div>
          <h2 style={{ fontSize: 'clamp(30px, 6vw, 52px)', fontWeight: 900, letterSpacing: '-0.02em', marginBottom: 16, color: BRAND.white }}>
            Entra antes que <span style={{ color: BRAND.orange }}>acabe</span>
          </h2>
          <p style={{ fontSize: 16, color: BRAND.muted, marginBottom: 36, lineHeight: 1.6 }}>
            Grupos de WhatsApp têm limite de participantes. Garanta sua vaga agora enquanto ainda tem espaço.
          </p>
          <button onClick={handleJoin} className="cta-btn"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 12, background: BRAND.orange, color: '#fff', border: 'none', borderRadius: 9999, padding: '18px 44px', fontWeight: 800, fontSize: 18, cursor: 'pointer', boxShadow: '0 0 32px rgba(255,122,0,0.5)', fontFamily: 'Inter, sans-serif' }}>
            <WhatsAppIcon size={24} />
            Quero entrar agora
          </button>
          <div style={{ marginTop: 14, fontFamily: 'monospace', fontSize: 11, color: BRAND.quiet, letterSpacing: '0.06em' }}>
            GRÁTIS · CANCELE QUANDO QUISER
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer style={{ borderTop: `1px solid rgba(255,122,0,0.08)`, padding: '28px 24px', textAlign: 'center' }}>
        <p style={{ fontFamily: 'monospace', fontSize: 11, color: BRAND.quiet, letterSpacing: '0.06em' }}>
          © {new Date().getFullYear()} {groupName.toUpperCase()} · PROMOÇÕES REAIS, DESCONTOS DE VERDADE
        </p>
      </footer>
    </div>
  );
}
