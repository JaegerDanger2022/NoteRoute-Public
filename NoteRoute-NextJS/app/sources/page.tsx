'use client';

import { useEffect, useState } from 'react';
import { useAuthStore } from '@/store/authStore';
import { useSourceStore, Source } from '@/store/sourceStore';
import { api } from '@/lib/api';
import { AppShell } from '@/components/layout/AppShell';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from 'sonner';

const PROVIDER_LABEL: Record<string, string> = {
  notion: 'Notion',
  google: 'Google Docs',
  slack: 'Slack',
  todoist: 'Todoist',
  trello: 'Trello',
};

const PROVIDER_BADGE: Record<string, string> = {
  notion: 'N',
  google: 'G',
  slack: 'S',
  todoist: 'T',
  trello: 'Tr',
};

const PROVIDERS = ['notion', 'google', 'slack', 'todoist', 'trello'] as const;

export default function SourcesPage() {
  const { sources, fetchSources, loading } = useSourceStore();
  const { user, loading: authLoading } = useAuthStore();
  const [usage, setUsage] = useState<{ sources_count: number; max_sources: number; is_admin: boolean } | null>(null);
  const [connecting, setConnecting] = useState<string | null>(null);
  const [disconnecting, setDisconnecting] = useState<string | null>(null);
  const [confirmSource, setConfirmSource] = useState<Source | null>(null);

  useEffect(() => {
    if (authLoading || !user) return;
    fetchSources();
    loadUsage();
  }, [authLoading, user]);

  const loadUsage = async () => {
    try {
      const res = await api.get('/api/v1/users/me');
      setUsage({
        sources_count: res.data.usage.sources_count,
        max_sources: res.data.limits.max_sources,
        is_admin: res.data.is_admin ?? false,
      });
    } catch {}
  };

  const connectSource = async (provider: string, reauthorize = false) => {
    setConnecting(provider);
    try {
      const params = new URLSearchParams({ platform: 'web' });
      if (reauthorize) params.set('reauthorize', 'true');
      const res = await api.get(`/api/v1/integrations/${provider}/connect?${params}`);
      if (res.data.status === 'connected') {
        await fetchSources();
        await loadUsage();
        toast.success(`${PROVIDER_LABEL[provider]} connected!`);
        setConnecting(null);
      } else if (res.data.status === 'redirect' && res.data.url) {
        window.location.href = res.data.url;
      }
    } catch (e: any) {
      toast.error('Connection failed: ' + (e?.response?.data?.detail ?? e?.message ?? 'Unknown error'));
      setConnecting(null);
    }
  };

  const confirmDisconnect = async () => {
    if (!confirmSource) return;
    const source = confirmSource;
    setConfirmSource(null);
    setDisconnecting(source.id);
    try {
      await api.delete(`/api/v1/sources/${source.id}`);
      await fetchSources();
      await loadUsage();
      toast.success('Source disconnected.');
    } catch {
      toast.error('Could not disconnect source.');
    } finally {
      setDisconnecting(null);
    }
  };

  return (
    <AppShell>
      <div className="max-w-2xl mx-auto px-6 py-8 pt-16 md:pt-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-foreground">Sources</h1>
          {usage && (
            <p className={`text-sm mt-1 ${usage.is_admin ? 'text-red-500' : 'text-muted-foreground'}`}>
              {usage.sources_count} / {usage.is_admin ? '∞' : usage.max_sources} sources connected
            </p>
          )}
        </div>

        {loading && sources.length === 0 ? (
          <div className="flex justify-center py-12">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        ) : (
          <div className="space-y-2">
            {PROVIDERS.map((provider) => {
              const source = sources.find((s) => s.provider === provider);
              const isConnected = !!source;
              const isConnecting = connecting === provider;
              const isDisconnecting = disconnecting === source?.id;
              const atLimit = !isConnected && !!usage && !usage.is_admin && usage.sources_count >= usage.max_sources;
              return (
                <div
                  key={provider}
                  className="flex items-center justify-between rounded-xl border border-border bg-card p-4"
                >
                  <div className="flex items-center gap-3">
                    <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-sm font-bold text-foreground ${isConnected ? 'bg-green-900/30' : 'bg-muted'}`}>
                      {PROVIDER_BADGE[provider]}
                    </div>
                    <div>
                      <p className="font-medium text-foreground">{PROVIDER_LABEL[provider]}</p>
                      {source?.connected_account_email && (
                        <p className="text-xs text-muted-foreground">{source.connected_account_email}</p>
                      )}
                    </div>
                  </div>
                  <div className="shrink-0 flex items-center gap-1">
                    {isConnecting || isDisconnecting ? (
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                    ) : isConnected ? (
                      <>
                        {provider === 'notion' && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-muted-foreground hover:text-foreground"
                            onClick={() => connectSource(provider, true)}
                          >
                            Add pages
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:text-destructive"
                          onClick={() => setConfirmSource(source)}
                        >
                          Remove
                        </Button>
                      </>
                    ) : atLimit ? (
                      <span className="text-xs text-muted-foreground">Upgrade to connect</span>
                    ) : (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-green-400 hover:text-green-300"
                        onClick={() => connectSource(provider)}
                      >
                        Connect
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Remove confirmation dialog */}
      <Dialog open={!!confirmSource} onOpenChange={(open) => { if (!open) setConfirmSource(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Remove source</DialogTitle>
            <DialogDescription>
              Remove <span className="font-medium text-foreground">{confirmSource ? PROVIDER_LABEL[confirmSource.provider] : ''}</span>? All its slots will also be deactivated. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setConfirmSource(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirmDisconnect}>
              Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
