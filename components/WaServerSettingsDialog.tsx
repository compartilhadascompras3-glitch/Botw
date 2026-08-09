'use client';

import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Loader2, CheckCircle2, AlertCircle, Wifi } from 'lucide-react';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type ConnState = 'idle' | 'checking' | 'online' | 'offline';

export function WaServerSettingsDialog({ open, onOpenChange }: Props) {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [connState, setConnState] = useState<ConnState>('idle');

  useEffect(() => {
    if (!open) return;
    setSaved(false);
    setError(null);
    setLoading(true);
    fetch('/api/settings')
      .then((r) => r.json())
      .then((data: { waServerUrl?: string }) => setUrl(data.waServerUrl ?? ''))
      .catch(() => setError('Não foi possível carregar a configuração atual.'))
      .finally(() => setLoading(false));
  }, [open]);

  async function testConnection(testUrl: string) {
    setConnState('checking');
    try {
      const res = await fetch(`${testUrl.replace(/\/$/, '')}/status`, { signal: AbortSignal.timeout(6000) });
      setConnState(res.ok ? 'online' : 'offline');
    } catch {
      setConnState('offline');
    }
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ waServerUrl: url }),
      });
      const data = await res.json() as { error?: string; waServerUrl?: string };
      if (!res.ok) throw new Error(data.error ?? 'Falha ao salvar');
      setUrl(data.waServerUrl ?? url);
      setSaved(true);
      testConnection(data.waServerUrl ?? url);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Conexão com o WhatsApp (wa-server)</DialogTitle>
          <DialogDescription>
            Cole aqui o link do túnel (ex: Cloudflare) que aponta para o
            <code className="mx-1 px-1 py-0.5 rounded bg-muted text-xs">wa-server.js</code>
            rodando no seu computador. Isso permite que este painel, mesmo hospedado
            na nuvem, controle o WhatsApp conectado no seu PC.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">URL do wa-server</label>
            <Input
              placeholder="https://exemplo.trycloudflare.com"
              value={url}
              onChange={(e) => {
                setUrl(e.target.value);
                setSaved(false);
                setConnState('idle');
              }}
              disabled={loading}
            />
            <p className="text-xs text-muted-foreground">
              No seu PC (PowerShell): <code>node wa-server.js</code> e depois um túnel
              apontando para <code>http://localhost:3001</code>. Em dev local, deixe em
              branco para usar <code>http://localhost:3001</code> automaticamente.
            </p>
          </div>

          {error && (
            <div className="flex items-start gap-2 text-sm text-destructive bg-destructive/10 rounded-md p-2">
              <AlertCircle size={16} className="shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {saved && !error && (
            <div className="flex items-center gap-2 text-sm text-green-600 bg-green-50 rounded-md p-2 dark:bg-green-950/40">
              <CheckCircle2 size={16} className="shrink-0" />
              <span>Salvo! A conexão passa a valer imediatamente, sem precisar redeploy.</span>
            </div>
          )}

          {connState !== 'idle' && (
            <div className="flex items-center gap-2 text-sm rounded-md p-2 bg-muted">
              {connState === 'checking' && <Loader2 size={16} className="animate-spin shrink-0" />}
              {connState === 'online' && <Wifi size={16} className="shrink-0 text-green-600" />}
              {connState === 'offline' && <AlertCircle size={16} className="shrink-0 text-amber-600" />}
              <span>
                {connState === 'checking' && 'Testando conexão com o wa-server...'}
                {connState === 'online' && 'wa-server respondeu! Conexão OK.'}
                {connState === 'offline' && 'Não consegui conectar. Verifique se o wa-server e o túnel estão rodando no seu PC.'}
              </span>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={!url || connState === 'checking'}
            onClick={() => testConnection(url)}
          >
            Testar conexão
          </Button>
          <Button type="button" onClick={handleSave} disabled={saving || loading}>
            {saving ? <Loader2 size={16} className="animate-spin mr-2" /> : null}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
