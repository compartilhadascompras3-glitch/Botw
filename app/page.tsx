'use client';

import { useState } from 'react';
import { Zap, MessageSquare } from 'lucide-react';
import PromoApp from '@/components/PromoApp';
import dynamic from 'next/dynamic';

// BotDashboard usa baileys/Node APIs no wa-server, mas o componente em si é client-side
const BotDashboard = dynamic(() => import('@/components/BotDashboard'), { ssr: false });

type Tab = 'promo' | 'bot';

export default function Home() {
  const [activeTab, setActiveTab] = useState<Tab>('promo');

  return (
    <div className="min-h-screen" style={{ background: '#050505' }}>
      {/* Top nav bar with two tabs */}
      <nav
        className="sticky top-0 z-50 w-full flex items-center"
        style={{
          background: 'rgba(5,5,5,0.92)',
          backdropFilter: 'blur(16px)',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          height: 52,
        }}
      >
        <div className="max-w-7xl mx-auto w-full px-4 flex items-center gap-1">
          {/* PromoRadar tab */}
          <button
            onClick={() => setActiveTab('promo')}
            className="flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold transition-all duration-150 cursor-pointer"
            style={
              activeTab === 'promo'
                ? { background: 'linear-gradient(135deg, #00D4FF 0%, #00FF88 100%)', color: '#000' }
                : { color: '#A0A0A0', background: 'transparent' }
            }
          >
            <Zap size={15} />
            PromoRadar
          </button>

          {/* WhatsApp Bot tab */}
          <button
            onClick={() => setActiveTab('bot')}
            className="flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold transition-all duration-150 cursor-pointer"
            style={
              activeTab === 'bot'
                ? { background: '#25D366', color: '#000' }
                : { color: '#A0A0A0', background: 'transparent' }
            }
          >
            <MessageSquare size={15} />
            WhatsApp Bot
          </button>
        </div>
      </nav>

      {/* Tab content */}
      <div style={{ display: activeTab === 'promo' ? 'block' : 'none' }}>
        <PromoApp />
      </div>
      <div style={{ display: activeTab === 'bot' ? 'block' : 'none' }}>
        <BotDashboard />
      </div>
    </div>
  );
}
