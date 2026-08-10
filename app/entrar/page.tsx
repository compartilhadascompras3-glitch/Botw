'use client';

import { useEffect, useState, useRef } from 'react';

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
];

const TESTIMONIALS = [
  { name: 'Ana Paula', text: 'Economizei mais de R$800 no mês passado só com as promos do grupo!', time: '2h atrás' },
  { name: 'Carlos R.', text: 'Comprei meu notebook com 40% de desconto graças ao aviso do grupo', time: '5h atrás' },
  { name: 'Mariana S.', text: 'Melhor grupo de promos que já entrei. As ofertas chegam super rápido!', time: '1d atrás' },
  { name: 'João V.', text: 'Me avisaram de um cupom que durou só 2h e eu ainda consegui usar 🙌', time: '1d atrás' },
  { name: 'Fernanda L.', text: 'Já indiquei pra toda minha família, vale muito!', time: '2d atrás' },
];

function PulseDot() {
  return (
    <span style={{
      display: 'inline-block', width: 8, height: 8, borderRadius: '50%',
      background: '#D6FF3A', boxShadow: '0 0 8px rgba(214,255,58,0.8)',
      animation: 'pulse 1.2s ease infinite',
    }} />
  );
}

export default function LandingPage() {
  const [config, setConfig] = useState<GroupConfig>({});
  const [memberCount, setMemberCount] = useState(2847);
  const [joined, setJoined] = useState(false);
  const tickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch('/api/group-config')
      .then(r => r.ok ? r.json() : {})
      .then((d: GroupConfig) => {
        setConfig(d);
        if (d.memberCount) setMemberCount(d.memberCount);
      })
      .catch(() => {});
  }, []);

  // Simula contador crescendo
  useEffect(() => {
    const interval = setInterval(() => {
      if (Math.random() < 0.3) setMemberCount(n => n + 1);
    }, 8000);
    return () => clearInterval(interval);
  }, []);

  const groupName = config.groupName || 'Promoções da Hora';
  const groupLink = config.groupLink || '#';
  const groupDesc = config.groupDescription || 'As melhores ofertas do Brasil direto no seu WhatsApp — antes de todo mundo';

  const handleJoin = () => {
    setJoined(true);
    if (groupLink && groupLink !== '#') {
      window.open(groupLink, '_blank');
    }
  };

  return (
    <div style={{ background: '#040505', minHeight: '100vh', fontFamily: "'Space Grotesk', 'Inter', sans-serif", color: '#F4F8F2', overflowX: 'hidden' }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&display=swap');
        @keyframes pulse { 0%,100%{opacity:0.4} 50%{opacity:1} }
        @keyframes scroll-x { from{transform:translateX(0)} to{transform:translateX(-50%)} }
        @keyframes fadeInUp { from{opacity:0;transform:translateY(24px)} to{opacity:1;transform:translateY(0)} }
        @keyframes glow-breathe { 0%,100%{opacity:0.3} 50%{opacity:0.6} }
        @keyframes counter-flash { 0%{color:#D6FF3A} 100%{color:#F4F8F2} }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { overflow-x: hidden; }
        .cta-btn:hover { transform: scale(1.03); box-shadow: 0 0 40px rgba(214,255,58,0.7) !important; }
        .cta-btn:active { transform: scale(0.97); }
        .benefit-card:hover { border-color: rgba(214,255,58,0.35) !important; box-shadow: 0 0 16px rgba(214,255,58,0.15); }
        .testimonial-card:hover { border-color: rgba(214,255,58,0.25) !important; }
      `}</style>

      {/* ── Nav ── */}
      <nav style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 50, height: 56, background: 'rgba(4,5,5,0.9)', borderBottom: '1px solid rgba(214,255,58,0.1)', backdropFilter: 'blur(12px)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <PulseDot />
          <span style={{ fontFamily: 'monospace', fontSize: 11, color: '#8FA08F', letterSpacing: '0.1em', textTransform: 'uppercase' }}>AO VIVO</span>
        </div>
        <span style={{ fontWeight: 700, fontSize: 15, letterSpacing: '-0.01em' }}>{groupName}</span>
        <button
          onClick={handleJoin}
          style={{ background: '#D6FF3A', color: '#040505', border: 'none', borderRadius: 9999, padding: '8px 18px', fontWeight: 700, fontSize: 12, cursor: 'pointer', transition: 'all 0.15s' }}
        >
          Entrar grátis
        </button>
      </nav>

      {/* ── Hero ── */}
      <section style={{ position: 'relative', minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '80px 24px 40px', textAlign: 'center', overflow: 'hidden' }}>
        {/* Background glow */}
        <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse 80% 60% at 50% 40%, rgba(214,255,58,0.12), transparent 70%)', animation: 'glow-breathe 4s ease infinite', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse 50% 40% at 50% 80%, rgba(55,240,194,0.06), transparent 60%)', pointerEvents: 'none' }} />

        <div style={{ position: 'relative', zIndex: 1, maxWidth: 680, animation: 'fadeInUp 0.6s ease forwards' }}>
          {/* Live pill */}
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'rgba(214,255,58,0.1)', border: '1px solid rgba(214,255,58,0.3)', borderRadius: 9999, padding: '6px 16px', marginBottom: 32 }}>
            <PulseDot />
            <span style={{ fontFamily: 'monospace', fontSize: 11, color: '#D6FF3A', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
              {memberCount.toLocaleString('pt-BR')} membros ativos
            </span>
          </div>

          <h1 style={{ fontSize: 'clamp(40px, 8vw, 80px)', fontWeight: 700, lineHeight: 1.05, letterSpacing: '-0.03em', marginBottom: 24 }}>
            Promoções que{' '}
            <span style={{ color: '#D6FF3A', textShadow: '0 0 30px rgba(214,255,58,0.5)' }}>economizam</span>
            {' '}de verdade
          </h1>

          <p style={{ fontSize: 18, color: '#8FA08F', lineHeight: 1.6, marginBottom: 40, maxWidth: 520, margin: '0 auto 40px' }}>
            {groupDesc}
          </p>

          {/* CTA */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
            <button
              className="cta-btn"
              onClick={handleJoin}
              style={{ display: 'flex', alignItems: 'center', gap: 12, background: '#D6FF3A', color: '#040505', border: 'none', borderRadius: 9999, padding: '18px 44px', fontWeight: 700, fontSize: 18, cursor: 'pointer', transition: 'all 0.15s', boxShadow: '0 0 28px rgba(214,255,58,0.5)', fontFamily: "'Space Grotesk', sans-serif" }}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
                <path d="M12 0C5.373 0 0 5.373 0 12c0 2.123.553 4.107 1.523 5.831L0 24l6.338-1.499C8.024 23.459 9.976 24 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-1.846 0-3.569-.493-5.052-1.35l-.362-.213-3.763.89.942-3.669-.235-.378C2.523 15.623 2 13.876 2 12 2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z"/>
              </svg>
              {joined ? 'Abrindo WhatsApp...' : 'Entrar no grupo grátis'}
            </button>
            <span style={{ fontFamily: 'monospace', fontSize: 11, color: '#5A6B5A', letterSpacing: '0.06em' }}>
              100% GRATUITO · SEM SPAM · SAIR QUANDO QUISER
            </span>
          </div>
        </div>
      </section>

      {/* ── Ticker ── */}
      <div style={{ background: '#0D1110', borderTop: '1px solid rgba(214,255,58,0.1)', borderBottom: '1px solid rgba(214,255,58,0.1)', padding: '12px 0', overflow: 'hidden' }}>
        <div ref={tickerRef} style={{ display: 'flex', gap: 48, whiteSpace: 'nowrap', animation: 'scroll-x 30s linear infinite' }}>
          {[...TICKER_ITEMS, ...TICKER_ITEMS].map((item, i) => (
            <span key={i} style={{ fontFamily: 'monospace', fontSize: 12, color: '#8FA08F', letterSpacing: '0.04em' }}>
              {item}
            </span>
          ))}
        </div>
      </div>

      {/* ── Números ── */}
      <section style={{ padding: '80px 24px', maxWidth: 900, margin: '0 auto' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16 }}>
          {[
            { value: memberCount.toLocaleString('pt-BR'), label: 'Membros no grupo', suffix: '' },
            { value: '12', label: 'Ofertas enviadas por dia', suffix: '+' },
            { value: '40', label: 'Desconto médio nas ofertas', suffix: '%' },
            { value: '4.8', label: 'Avaliação dos membros', suffix: '★' },
          ].map((stat, i) => (
            <div key={i} className="benefit-card" style={{ background: '#0D1110', border: '1px solid rgba(214,255,58,0.12)', borderRadius: 16, padding: '24px 20px', transition: 'all 0.15s' }}>
              <div style={{ fontFamily: 'monospace', fontSize: 36, fontWeight: 700, color: '#D6FF3A', letterSpacing: '-0.02em' }}>
                {stat.value}{stat.suffix}
              </div>
              <div style={{ fontSize: 13, color: '#5A6B5A', marginTop: 6, letterSpacing: '0.02em' }}>{stat.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Benefícios ── */}
      <section style={{ padding: '0 24px 80px', maxWidth: 900, margin: '0 auto' }}>
        <h2 style={{ fontSize: 'clamp(28px, 5vw, 48px)', fontWeight: 700, letterSpacing: '-0.02em', textAlign: 'center', marginBottom: 48 }}>
          Por que entrar?
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16 }}>
          {[
            { icon: '⚡', title: 'Ofertas em tempo real', desc: 'Receba as promos minutos depois que aparecem — antes de acabar o estoque.' },
            { icon: '🤖', title: 'Bot inteligente', desc: 'Nosso bot filtra só as melhores ofertas com desconto real, sem enganação.' },
            { icon: '🛒', title: 'Todas as lojas', desc: 'Mercado Livre, Amazon, Shopee e muito mais — tudo num só lugar.' },
            { icon: '🏷️', title: 'Cupons exclusivos', desc: 'Cupons e códigos que a gente garimpou especialmente para o grupo.' },
            { icon: '📊', title: 'Desconto verificado', desc: 'Só enviamos ofertas com desconto real comparado ao preço histórico.' },
            { icon: '🔕', title: 'Sem spam', desc: 'Poucos avisos por dia, todos relevantes. Seu WhatsApp não vai enlouquecer.' },
          ].map((b, i) => (
            <div key={i} className="benefit-card" style={{ background: '#0D1110', border: '1px solid rgba(214,255,58,0.1)', borderRadius: 16, padding: '24px', transition: 'all 0.2s', cursor: 'default' }}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>{b.icon}</div>
              <div style={{ fontWeight: 600, fontSize: 16, marginBottom: 8 }}>{b.title}</div>
              <div style={{ fontSize: 14, color: '#8FA08F', lineHeight: 1.6 }}>{b.desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Depoimentos ── */}
      <section style={{ padding: '0 24px 80px', maxWidth: 900, margin: '0 auto' }}>
        <h2 style={{ fontSize: 'clamp(28px, 5vw, 48px)', fontWeight: 700, letterSpacing: '-0.02em', textAlign: 'center', marginBottom: 12 }}>
          O que os membros dizem
        </h2>
        <p style={{ textAlign: 'center', color: '#5A6B5A', marginBottom: 48, fontFamily: 'monospace', fontSize: 12 }}>DEPOIMENTOS REAIS DO GRUPO</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16 }}>
          {TESTIMONIALS.map((t, i) => (
            <div key={i} className="testimonial-card" style={{ background: '#0A0C0B', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 16, padding: '20px', transition: 'all 0.2s' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'linear-gradient(135deg, #D6FF3A, #37F0C2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 14, color: '#040505' }}>
                  {t.name[0]}
                </div>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{t.name}</div>
                  <div style={{ fontFamily: 'monospace', fontSize: 10, color: '#5A6B5A' }}>{t.time}</div>
                </div>
              </div>
              <p style={{ fontSize: 14, color: '#8FA08F', lineHeight: 1.6 }}>&ldquo;{t.text}&rdquo;</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── CTA final ── */}
      <section style={{ padding: '80px 24px', textAlign: 'center', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse 70% 80% at 50% 50%, rgba(214,255,58,0.08), transparent 70%)', pointerEvents: 'none' }} />
        <div style={{ position: 'relative', zIndex: 1, maxWidth: 560, margin: '0 auto' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'rgba(214,255,58,0.1)', border: '1px solid rgba(214,255,58,0.3)', borderRadius: 9999, padding: '6px 16px', marginBottom: 28 }}>
            <PulseDot />
            <span style={{ fontFamily: 'monospace', fontSize: 11, color: '#D6FF3A', letterSpacing: '0.1em' }}>VAGAS LIMITADAS</span>
          </div>
          <h2 style={{ fontSize: 'clamp(32px, 6vw, 56px)', fontWeight: 700, letterSpacing: '-0.02em', marginBottom: 20 }}>
            Entra antes que <span style={{ color: '#D6FF3A' }}>acabe</span>
          </h2>
          <p style={{ fontSize: 16, color: '#8FA08F', marginBottom: 40, lineHeight: 1.6 }}>
            Grupos de WhatsApp têm limite de participantes. Garante sua vaga agora enquanto ainda tem espaço.
          </p>
          <button
            className="cta-btn"
            onClick={handleJoin}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 12, background: '#D6FF3A', color: '#040505', border: 'none', borderRadius: 9999, padding: '18px 44px', fontWeight: 700, fontSize: 18, cursor: 'pointer', transition: 'all 0.15s', boxShadow: '0 0 28px rgba(214,255,58,0.5)', fontFamily: "'Space Grotesk', sans-serif" }}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
              <path d="M12 0C5.373 0 0 5.373 0 12c0 2.123.553 4.107 1.523 5.831L0 24l6.338-1.499C8.024 23.459 9.976 24 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-1.846 0-3.569-.493-5.052-1.35l-.362-.213-3.763.89.942-3.669-.235-.378C2.523 15.623 2 13.876 2 12 2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z"/>
            </svg>
            Quero entrar agora
          </button>
          <div style={{ marginTop: 16, fontFamily: 'monospace', fontSize: 11, color: '#5A6B5A', letterSpacing: '0.06em' }}>
            GRÁTIS · CANCELE QUANDO QUISER
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer style={{ borderTop: '1px solid rgba(214,255,58,0.08)', padding: '32px 24px', textAlign: 'center' }}>
        <p style={{ fontFamily: 'monospace', fontSize: 11, color: '#5A6B5A', letterSpacing: '0.06em' }}>
          © {new Date().getFullYear()} {groupName.toUpperCase()} · PROMOÇÕES DO BRASIL
        </p>
      </footer>
    </div>
  );
}
