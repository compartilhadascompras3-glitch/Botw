'use client';

import { useEffect, useRef } from 'react';
import { useBotStore } from '@/store/botStore';

let loaded = false;

/**
 * Persiste targets, isRunning e configurações do bot no banco (tabela settings).
 * Deve ser montado uma única vez no componente raiz do app.
 *
 * - No mount: carrega estado do banco e sobrescreve o Zustand
 * - Nas mudanças: salva debounced (500ms) para não sobrecarregar
 */
export function useBotStateDb() {
  const store = useBotStore();
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initialized = useRef(false);

  // Carrega do banco uma única vez por sessão de página
  useEffect(() => {
    if (loaded) return;
    loaded = true;

    fetch('/api/bot-state')
      .then((r) => r.json())
      .then((data: {
        targets?: { id: string; name: string }[];
        isRunning?: boolean;
        intervalMinutes?: number;
        jitterPercent?: number;
        scheduleEnabled?: boolean;
        scheduleStart?: string;
        scheduleEnd?: string;
        statusEnabled?: boolean;
        groupsEnabled?: boolean;
        currentIndex?: number;
      }) => {
        useBotStore.setState({
          targets:         data.targets         ?? [],
          // Não restaura isRunning=true — o scheduler precisa ser reiniciado manualmente
          isRunning:       false,
          intervalMinutes: data.intervalMinutes ?? 30,
          jitterPercent:   data.jitterPercent   ?? 20,
          scheduleEnabled: data.scheduleEnabled ?? false,
          scheduleStart:   data.scheduleStart   ?? '08:00',
          scheduleEnd:     data.scheduleEnd     ?? '22:00',
          statusEnabled:   data.statusEnabled   ?? false,
          groupsEnabled:   data.groupsEnabled   ?? true,
          currentIndex:    data.currentIndex    ?? 0,
        });
        initialized.current = true;
      })
      .catch((err) => {
        console.error('[useBotStateDb] load error:', err);
        initialized.current = true;
      });
  }, []);

  // Salva no banco quando targets ou configurações mudam (debounce 600ms)
  useEffect(() => {
    if (!initialized.current) return;

    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      fetch('/api/bot-state', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targets:         store.targets,
          isRunning:       store.isRunning,
          intervalMinutes: store.intervalMinutes,
          jitterPercent:   store.jitterPercent,
          scheduleEnabled: store.scheduleEnabled,
          scheduleStart:   store.scheduleStart,
          scheduleEnd:     store.scheduleEnd,
          statusEnabled:   store.statusEnabled,
          groupsEnabled:   store.groupsEnabled,
          currentIndex:    store.currentIndex,
        }),
      }).catch((err) => console.error('[useBotStateDb] save error:', err));
    }, 600);

    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [
    store.targets,
    store.isRunning,
    store.intervalMinutes,
    store.jitterPercent,
    store.scheduleEnabled,
    store.scheduleStart,
    store.scheduleEnd,
    store.statusEnabled,
    store.groupsEnabled,
    store.currentIndex,
  ]);
}
