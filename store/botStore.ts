'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface BotMessage {
  id: string;
  text: string;
  mediaDataUrl?: string;
  mediaName?: string;
  mediaType?: string;
  sendOnce?: boolean;
  createdAt: number;
  /** true quando o banco tem media_data_url mas não foi carregada ainda (lazy load) */
  hasMedia?: boolean;
}

export interface Target {
  id: string;
  name: string;
}

export interface HistoryEntry {
  id: string;
  messageId: string;
  messageText: string;
  hasMedia: boolean;
  targets: Target[];
  sentAt: number;
}

interface BotState {
  messages: BotMessage[];
  history: HistoryEntry[];
  isRunning: boolean;
  intervalMinutes: number;
  jitterPercent: number;
  currentIndex: number;
  targets: Target[];
  nextFireAt: number | null;

  scheduleEnabled: boolean;
  scheduleStart: string;
  scheduleEnd: string;
  statusEnabled: boolean;
  groupsEnabled: boolean;

  addMessage: (msg: Omit<BotMessage, 'id' | 'createdAt'>) => void;
  updateMessage: (id: string, patch: Partial<Pick<BotMessage, 'text' | 'mediaDataUrl' | 'mediaName' | 'mediaType' | 'sendOnce'>>) => void;
  removeMessage: (id: string) => void;
  reorderMessages: (from: number, to: number) => void;
  setRunning: (running: boolean) => void;
  setInterval: (minutes: number) => void;
  setJitter: (percent: number) => void;
  setSchedule: (enabled: boolean, start: string, end: string) => void;
  setStatusEnabled: (enabled: boolean) => void;
  setGroupsEnabled: (enabled: boolean) => void;
  setTargets: (targets: Target[]) => void;
  addTarget: (t: Target) => void;
  removeTarget: (id: string) => void;
  addHistory: (entry: Omit<HistoryEntry, 'id'>) => void;
  clearHistory: () => void;
  advanceIndex: () => void;
  setCurrentIndex: (index: number) => void;
  setNextFireAt: (ts: number | null) => void;
}

export const useBotStore = create<BotState>()(
  persist(
    (set) => ({
      messages: [],
      history: [],
      isRunning: false,
      intervalMinutes: 30,
      jitterPercent: 20,
      currentIndex: 0,
      targets: [],
      nextFireAt: null,
      scheduleEnabled: false,
      scheduleStart: '08:00',
      scheduleEnd: '22:00',
      statusEnabled: false,
      groupsEnabled: true,

      addMessage: (msg) =>
        set((state) => ({
          messages: [...state.messages, { id: crypto.randomUUID(), createdAt: Date.now(), ...msg }],
        })),

      updateMessage: (id, patch) =>
        set((state) => ({
          messages: state.messages.map((m) => (m.id === id ? { ...m, ...patch } : m)),
        })),

      removeMessage: (id) =>
        set((state) => {
          const newMessages = state.messages.filter((m) => m.id !== id);
          const newIndex = Math.min(state.currentIndex, Math.max(0, newMessages.length - 1));
          return { messages: newMessages, currentIndex: newIndex };
        }),

      reorderMessages: (from, to) =>
        set((state) => {
          const msgs = [...state.messages];
          const [moved] = msgs.splice(from, 1);
          msgs.splice(to, 0, moved);
          return { messages: msgs };
        }),

      setRunning: (running) => set({ isRunning: running }),
      setInterval: (minutes) => set({ intervalMinutes: minutes }),
      setJitter: (percent) => set({ jitterPercent: percent }),
      setSchedule: (enabled, start, end) => set({ scheduleEnabled: enabled, scheduleStart: start, scheduleEnd: end }),
      setStatusEnabled: (enabled) => set({ statusEnabled: enabled }),
      setGroupsEnabled: (enabled) => set({ groupsEnabled: enabled }),
      setTargets: (targets) => set({ targets }),
      addTarget: (t) =>
        set((state) => ({
          targets: state.targets.some((x) => x.id === t.id)
            ? state.targets
            : [...state.targets, t],
        })),
      removeTarget: (id) =>
        set((state) => ({ targets: state.targets.filter((t) => t.id !== id) })),

      addHistory: (entry) =>
        set((state) => ({
          history: [{ ...entry, id: crypto.randomUUID() }, ...state.history].slice(0, 200),
        })),

      clearHistory: () => set({ history: [] }),

      advanceIndex: () =>
        set((state) => {
          if (state.messages.length === 0) return {};
          return { currentIndex: (state.currentIndex + 1) % state.messages.length };
        }),

      setCurrentIndex: (index) => set({ currentIndex: index }),
      setNextFireAt: (ts) => set({ nextFireAt: ts }),
    }),
    {
      name: 'whatsapp-bot-store',
      partialize: (state) => ({
        isRunning:       state.isRunning,
        intervalMinutes: state.intervalMinutes,
        jitterPercent:   state.jitterPercent,
        currentIndex:    state.currentIndex,
        targets:         state.targets,
        nextFireAt:      state.nextFireAt,
        scheduleEnabled: state.scheduleEnabled,
        scheduleStart:   state.scheduleStart,
        scheduleEnd:     state.scheduleEnd,
        statusEnabled:   state.statusEnabled,
        groupsEnabled:   state.groupsEnabled,
      }),
    }
  )
);
