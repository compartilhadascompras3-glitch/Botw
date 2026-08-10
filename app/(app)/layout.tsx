import { Analytics } from '@vercel/analytics/next';
import { AgentationGuard } from '@/components/AgentationGuard';
import { HappySeedsWatermark } from '@/components/HappySeedsWatermark';
import { WhatsAppProvider } from '@/contexts/WhatsAppContext';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <WhatsAppProvider>
      {children}
      <HappySeedsWatermark />
      <AgentationGuard />
      <Analytics />
    </WhatsAppProvider>
  );
}
