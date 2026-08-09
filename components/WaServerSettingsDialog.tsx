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
import { Loader2, CheckCircle2, AlertCircle, Wifi, Monitor, ExternalLink } from 'lucide-react';

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
    fetch('/api/wa-server-url')
      .then((r) => r.json())
      .then((data: { url?: string }) => setUrl(data.url ?? ''))
      .catch(() => setError('Não foi possível carregar a configuração atual.'))
      .finally(() => setLoading(false));
  }, [open]);

  async function testConnection(testUrl: string) {
    if (!testUrl) return;
    setConnState('checking');
    try {
      const r = await fetch(`/api/wa-server-url/test?url=${encodeURIComponent(testUrl)}`, {
        signal: AbortSignal.timeout(10000),
      });
      const data = await r.json() as { ok?: boolean };
      setConnState(data.ok ? 'online' : 'offline');
    } catch {
      setConnState('offline');
    }
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch('/api/wa-server-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      const data = await res.json() as { error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Falha ao salvar');
      setSaved(true);
      testConnection(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Monitor size={18} />
            wa-server no seu PC
          </DialogTitle>
          <DialogDescription>
            O WhatsApp Bot roda no seu computador via{' '}
            <code className="px-1 py-0.5 rounded bg-muted text-xs">wa-server.js</code>.
            Para este painel na nuvem controlar o bot, você precisa de um{' '}
            <strong>túnel público</strong> apontando para{' '}
            <code className="px-1 py-0.5 rounded bg-muted text-xs">http://localhost:3001</code>.
          </DialogDescription>
        </DialogHeader>

        {/* Instruções rápidas */}
        <div className="rounded-md border bg-muted/40 p-3 text-sm space-y-2">
          <p className="font-semibold text-foreground flex items-center gap-1.5">
            <span className="text-primary">①</span> No seu PowerShell (dentro da pasta do projeto):
          </p>
          <pre className="bg-background rounded p-2 text-xs overflow-x-auto border">
{`# Instala dependências (só na primeira vez)
npm install

# Sobe o wa-server na porta 3001
node wa-server.js`}
          </pre>

          <p className="font-semibold text-foreground flex items-center gap-1.5">
            <span className="text-primary">②</span> Em outro PowerShell, abra um túnel Cloudflare (gratuito, sem conta):
          </p>
          <pre className="bg-background rounded p-2 text-xs overflow-x-auto border">
{`# Instala cloudflared (só uma vez)
winget install Cloudflare.cloudflared

# Cria túnel temporário para a porta 3001
cloudflared tunnel --url http://localhost:3001`}
          </pre>
          <p className="text-xs text-muted-foreground">
            O cloudflared vai exibir uma URL como{' '}
            <code className="text-xs">https://xxxx.trycloudflare.com</code> — cole-a abaixo.
          </p>
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            <ExternalLink size={11} />
            Alternativa: instale em{' '}
            <a href="https://developers.cloudflare.com/cloudflared/install-and-update/" target="_blank" rel="noreferrer" className="underline">
              developers.cloudflare.com
            </a>
          </p>
        </div>

        {/* Input de URL */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium">URL do túnel (wa-server)</label>
          <Input
            placeholder="https://xxxx.trycloudflare.com"
            value={url}
            onChange={(e) => {
              setUrl(e.target.value);
              setSaved(false);
              setConnState('idle');
            }}
            disabled={loading}
          />
          <p className="text-xs text-muted-foreground">
            Em dev local (PC + painel no mesmo PC), deixe em branco — o app usa{' '}
            <code className="text-xs">http://localhost:3001</code> automaticamente.
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
            <span>URL salva! Vale imediatamente, sem redeploy.</span>
          </div>
        )}

        {connState !== 'idle' && (
          <div className="flex items-center gap-2 text-sm rounded-md p-2 bg-muted">
            {connState === 'checking' && <Loader2 size={16} className="animate-spin shrink-0" />}
            {connState === 'online'   && <Wifi size={16} className="shrink-0 text-green-600" />}
            {connState === 'offline'  && <AlertCircle size={16} className="shrink-0 text-amber-600" />}
            <span>
              {connState === 'checking' && 'Testando conexão com o wa-server...'}
              {connState === 'online'   && 'wa-server respondeu! Tudo certo.'}
              {connState === 'offline'  && 'Sem resposta. Verifique se o wa-server e o túnel estão ativos no seu PC.'}
            </span>
          </div>
        )}

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
