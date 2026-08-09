'use client';

import Image from 'next/image';
import { useWhatsApp, WaState } from '@/hooks/use-whatsapp';
import { Loader2, Wifi, WifiOff, LogOut, CheckCircle, AlertCircle } from 'lucide-react';

function StatusBadge({ state }: { state: WaState }) {
  if (state.status === 'ready') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1 rounded-full"
        style={{ background: 'rgba(37,211,102,0.2)', color: '#25D366', border: '1px solid rgba(37,211,102,0.3)' }}>
        <CheckCircle size={12} />
        Conectado
      </span>
    );
  }
  if (state.status === 'qr') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1 rounded-full"
        style={{ background: 'rgba(245,158,11,0.2)', color: '#F59E0B', border: '1px solid rgba(245,158,11,0.3)' }}>
        <span className="w-2 h-2 rounded-full animate-pulse inline-block" style={{ background: '#F59E0B' }} />
        Aguardando QR
      </span>
    );
  }
  if (state.status === 'connecting') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1 rounded-full"
        style={{ background: 'rgba(99,102,241,0.2)', color: '#818CF8', border: '1px solid rgba(99,102,241,0.3)' }}>
        <Loader2 size={12} className="animate-spin" />
        Conectando...
      </span>
    );
  }
  if (state.status === 'auth_failure') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1 rounded-full"
        style={{ background: 'rgba(239,68,68,0.2)', color: '#F87171', border: '1px solid rgba(239,68,68,0.3)' }}>
        <AlertCircle size={12} />
        Falha de auth
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1 rounded-full"
      style={{ background: 'rgba(255,255,255,0.07)', color: '#A0A0A0', border: '1px solid rgba(255,255,255,0.1)' }}>
      <WifiOff size={12} />
      Desconectado
    </span>
  );
}

export function WhatsAppConnector() {
  const { state, waking, connect, disconnect } = useWhatsApp();

  return (
    <div className="rounded-2xl overflow-hidden"
      style={{ background: '#0d0d0d', border: '1px solid rgba(255,255,255,0.08)' }}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3"
        style={{ background: '#075E54' }}>
        <div className="flex items-center gap-2">
          <Wifi size={16} color="white" />
          <span className="text-white text-sm font-semibold">Conexão WhatsApp</span>
        </div>
        {waking
          ? <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1 rounded-full"
              style={{ background: 'rgba(99,102,241,0.2)', color: '#818CF8', border: '1px solid rgba(99,102,241,0.3)' }}>
              <Loader2 size={12} className="animate-spin" />
              Iniciando...
            </span>
          : <StatusBadge state={state} />
        }
      </div>

      <div className="p-4 space-y-4">
        {/* Status message */}
        <p className="text-sm" style={{ color: '#A0A0A0' }}>
          {waking ? 'Aguarde, iniciando o servidor WhatsApp...' : state.message}
        </p>

        {/* QR Code — fundo branco necessário para leitura pelo celular */}
        {state.status === 'qr' && state.qr && (
          <div className="flex flex-col items-center gap-3">
            <div className="p-3 rounded-xl" style={{ background: 'white', border: '2px solid #25D366' }}>
              <Image src={state.qr} alt="QR Code WhatsApp" width={220} height={220} className="rounded-lg" />
            </div>
            <div className="text-center text-xs rounded-xl px-4 py-3 space-y-1 w-full"
              style={{ background: 'rgba(37,211,102,0.08)', border: '1px solid rgba(37,211,102,0.15)' }}>
              <p className="font-semibold" style={{ color: '#25D366' }}>Como escanear:</p>
              <p style={{ color: '#A0A0A0' }}>
                Abra o WhatsApp → Configurações → Dispositivos conectados → Conectar dispositivo
              </p>
            </div>
          </div>
        )}

        {/* Ready state */}
        {state.status === 'ready' && (
          <div className="flex items-center gap-3 rounded-xl px-4 py-3"
            style={{ background: 'rgba(37,211,102,0.08)', border: '1px solid rgba(37,211,102,0.2)' }}>
            <CheckCircle size={20} style={{ color: '#25D366' }} />
            <div>
              <p className="text-sm font-semibold" style={{ color: '#25D366' }}>
                WhatsApp conectado!
              </p>
              <p className="text-xs" style={{ color: '#A0A0A0' }}>
                Pronto para enviar mensagens.
              </p>
            </div>
          </div>
        )}

        {/* Spinners */}
        {(state.status === 'connecting' || waking) && (
          <div className="flex items-center justify-center py-4">
            <Loader2 size={28} className="animate-spin" style={{ color: '#25D366' }} />
          </div>
        )}

        {/* Buttons */}
        <div className="flex gap-2">
          {!waking && (state.status === 'disconnected' || state.status === 'auth_failure' || state.status === 'qr') && (
            <button
              onClick={connect}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold cursor-pointer transition-opacity hover:opacity-90"
              style={{ background: '#25D366', color: 'white' }}
            >
              <Wifi size={16} />
              {state.status === 'qr' ? 'Gerar novo QR' : 'Conectar WhatsApp'}
            </button>
          )}
          {!waking && state.status === 'ready' && (
            <button
              onClick={disconnect}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium cursor-pointer transition-opacity hover:opacity-80"
              style={{ background: 'rgba(239,68,68,0.15)', color: '#F87171', border: '1px solid rgba(239,68,68,0.3)' }}
            >
              <LogOut size={16} />
              Desconectar
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
