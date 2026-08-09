'use client';

import { useState } from 'react';
import { MessageList } from './MessageList';
import { SchedulerPanel } from './SchedulerPanel';
import { HistoryPanel } from './HistoryPanel';
import { WaServerSettingsDialog } from './WaServerSettingsDialog';
import { useBotStore } from '@/store/botStore';
import { MessageSquare, History, Settings, MoreVertical, Download, Loader2, Wifi } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';

type Tab = 'messages' | 'scheduler' | 'history';

function HeaderMenu({ onOpenWaSettings }: { onOpenWaSettings: () => void }) {
  const [downloading, setDownloading] = useState(false);

  const handleDownload = () => {
    setDownloading(true);
    try {
      // Navega direto para a rota da API: o header `Content-Disposition:
      // attachment` já diz ao navegador para baixar com o nome correto.
      // Navegação na mesma aba nunca é bloqueada por bloqueador de popup
      // (diferente de window.open), e funciona mesmo dentro do iframe do
      // preview embutido do editor.
      window.location.href = '/api/download-project';
    } catch (err) {
      console.error(err);
    } finally {
      window.setTimeout(() => setDownloading(false), 800);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="w-9 h-9 flex items-center justify-center rounded-full transition-colors hover:bg-white/10 focus:outline-none"
          aria-label="Mais opções"
        >
          <MoreVertical size={20} color="white" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>Opções do projeto</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={onOpenWaSettings} className="cursor-pointer gap-2">
          <Wifi size={16} className="shrink-0" />
          Conexão com wa-server
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={handleDownload}
          disabled={downloading}
          className="cursor-pointer gap-2"
        >
          {downloading ? (
            <Loader2 size={16} className="animate-spin shrink-0" />
          ) : (
            <Download size={16} className="shrink-0" />
          )}
          {downloading ? 'Gerando ZIP...' : 'Baixar projeto (.zip)'}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default function BotDashboard() {
  const [activeTab, setActiveTab] = useState<Tab>('messages');
  const [waSettingsOpen, setWaSettingsOpen] = useState(false);
  const { isRunning, messages } = useBotStore();

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'messages', label: 'Mensagens', icon: <MessageSquare size={18} /> },
    { id: 'scheduler', label: 'Agendador', icon: <Settings size={18} /> },
    { id: 'history', label: 'Histórico', icon: <History size={18} /> },
  ];

  return (
    <div className="bot-dark min-h-screen flex flex-col" style={{ background: '#050505' }}>
      {/* Header */}
      <header style={{ background: '#075E54' }} className="sticky top-0 z-10 shadow-lg">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center shadow shrink-0"
            style={{ background: '#25D366' }}
          >
            <MessageSquare size={20} color="white" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-white font-semibold text-base leading-tight">
              WhatsApp Bot
            </h1>
            <p className="text-xs" style={{ color: 'rgba(255,255,255,0.7)' }}>
              {messages.length} {messages.length === 1 ? 'mensagem' : 'mensagens'} cadastradas
              {isRunning && (
                <span className="ml-2 inline-flex items-center gap-1">
                  <span
                    className="w-1.5 h-1.5 rounded-full animate-pulse"
                    style={{ background: '#25D366' }}
                  />
                  Rodando
                </span>
              )}
            </p>
          </div>
          {/* 3-dot menu */}
          <HeaderMenu onOpenWaSettings={() => setWaSettingsOpen(true)} />
        </div>

        {/* Tab bar */}
        <div
          className="flex border-t max-w-2xl mx-auto"
          style={{ borderColor: 'rgba(255,255,255,0.15)' }}
        >
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-medium transition-colors relative cursor-pointer"
              style={{
                color: activeTab === tab.id ? 'white' : 'rgba(255,255,255,0.6)',
              }}
            >
              {tab.icon}
              <span className="hidden sm:inline">{tab.label}</span>
              {activeTab === tab.id && (
                <span
                  className="absolute bottom-0 left-0 right-0 h-0.5"
                  style={{ background: '#25D366' }}
                />
              )}
            </button>
          ))}
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 max-w-2xl mx-auto w-full px-4 py-6">
        {activeTab === 'messages' && <MessageList />}
        {activeTab === 'scheduler' && <SchedulerPanel />}
        {activeTab === 'history' && <HistoryPanel />}
      </main>

      <WaServerSettingsDialog open={waSettingsOpen} onOpenChange={setWaSettingsOpen} />
    </div>
  );
}
