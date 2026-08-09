'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { useWhatsApp, WaState } from '@/hooks/use-whatsapp';
import { Loader2, Wifi, WifiOff, LogOut, CheckCircle, AlertCircle, RefreshCw } from 'lucide-react';

const QR_TTL = 60; // segundos que o QR é válido (WhatsApp expira em ~60s)

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
        Escaneie o QR
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

  // Countdown do QR — começa em QR_TTL e vai até 0
  const [qrSecondsLeft, setQrSecondsLeft] = useState(QR_TTL);
  const [qrExpired, setQrExpired] = useState(false);

  // Reinicia o countdown toda vez que um novo QR aparece
  useEffect(() => {
    if (state.status !== 'qr' || !state.qr) return;
    setQrSecondsLeft(QR_TTL);
    setQrExpired(false);

    const timer = setInterval(() => {
      setQrSecondsLeft((s) => {
        if (s <= 1) {
          clearInterval(timer);
          setQrExpired(true);
          return 0;
        }
        return s - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [state.qr, state.status]);

  const urgentColor = qrSecondsLeft <= 15 ? '#EF4444' : qrSecondsLeft <= 30 ? '#F59E0B' : '#25D366';

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

        {/* QR Code */}
        {state.status === 'qr' && state.qr && (
          <div className="flex flex-col items-center gap-3">
            {/* QR com overlay de expirado */}
            <div className="relative">
              <div className="p-3 rounded-xl" style={{
                background: 'white',
                border: `2px solid ${urgentColor}`,
                transition: 'border-color 0.5s',
                opacity: qrExpired ? 0.35 : 1,
              }}>
                <Image src={state.qr} alt="QR Code WhatsApp" width={220} height={220} className="rounded-lg" />
              </div>
              {qrExpired && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-xl"
                  style={{ background: 'rgba(0,0,0,0.6)' }}>
                  <AlertCircle size={28} style={{ color: '#EF4444' }} />
                  <p className="text-sm font-bold text-white">QR expirado</p>
                  <p className="text-xs" style={{ color: '#A0A0A0' }}>Gere um novo QR abaixo</p>
                </div>
              )}
            </div>

            {/* Countdown */}
            {!qrExpired && (
              <div className="flex items-center gap-2 text-sm font-semibold"
                style={{ color: urgentColor, transition: 'color 0.5s' }}>
                <span>Válido por</span>
                <span className="tabular-nums text-lg">{qrSecondsLeft}s</span>
              </div>
            )}

            {/* Instruções */}
            <div className="text-center text-xs rounded-xl px-4 py-3 space-y-1 w-full"
              style={{ background: 'rgba(37,211,102,0.08)', border: '1px solid rgba(37,211,102,0.15)' }}>
              <p className="font-semibold" style={{ color: '#25D366' }}>Como escanear:</p>
              <p style={{ color: '#A0A0A0' }}>
                WhatsApp → Configurações → Dispositivos vinculados → Vincular dispositivo
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
          <div className="flex flex-col items-center justify-center gap-2 py-4">
            <Loader2 size={28} className="animate-spin" style={{ color: '#25D366' }} />
            <p className="text-xs" style={{ color: '#A0A0A0' }}>
              {state.status === 'connecting' ? 'Aguardando QR Code...' : 'Iniciando servidor...'}
            </p>
          </div>
        )}

        {/* Buttons */}
        <div className="flex gap-2">
          {!waking && (state.status === 'disconnected' || state.status === 'auth_failure') && (
            <button
              onClick={connect}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold cursor-pointer transition-opacity hover:opacity-90"
              style={{ background: '#25D366', color: 'white' }}
            >
              <Wifi size={16} />
              Conectar WhatsApp
            </button>
          )}
          {!waking && state.status === 'qr' && (
            <button
              onClick={connect}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold cursor-pointer transition-opacity hover:opacity-90"
              style={{ background: qrExpired ? '#25D366' : 'rgba(255,255,255,0.08)', color: qrExpired ? 'white' : '#A0A0A0', border: qrExpired ? 'none' : '1px solid rgba(255,255,255,0.12)' }}
            >
              <RefreshCw size={16} />
              {qrExpired ? 'Gerar novo QR' : 'Atualizar QR'}
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
