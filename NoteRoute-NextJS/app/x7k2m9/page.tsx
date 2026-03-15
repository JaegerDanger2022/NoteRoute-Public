'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import { api } from '@/lib/api';
import { AppShell } from '@/components/layout/AppShell';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';

type Config = { use_nova: boolean };
type Stats = { total_users: number; total_slots: number; total_sources: number };
type AdminUser = {
  id: string;
  email: string;
  tier: string;
  slots_count: number;
  sources_count: number;
  created_at: string;
};

export default function AdminPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuthStore();

  const [checking, setChecking] = useState(true);
  const [config, setConfig] = useState<Config | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [togglingNova, setTogglingNova] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.replace('/login');
      setChecking(false);
      return;
    }
    (async () => {
      try {
        const meRes = await api.get('/api/v1/admin/me');
        if (!meRes.data.is_admin) {
          router.replace('/record');
          setChecking(false);
          return;
        }
        const [cfgRes, statsRes, usersRes] = await Promise.all([
          api.get('/api/v1/admin/config'),
          api.get('/api/v1/admin/stats'),
          api.get('/api/v1/admin/users?page_size=100'),
        ]);
        setConfig(cfgRes.data);
        setStats(statsRes.data);
        setUsers(usersRes.data.users ?? []);
      } catch {
        router.replace('/record');
      } finally {
        setChecking(false);
      }
    })();
  }, [authLoading, user]);

  const toggleNova = async (value: boolean) => {
    if (!config) return;
    setTogglingNova(true);
    try {
      const res = await api.patch('/api/v1/admin/config', { use_nova: value });
      setConfig(res.data);
      toast.success(`Nova models ${value ? 'enabled' : 'disabled'}`);
    } catch {
      toast.error('Could not update config.');
    } finally {
      setTogglingNova(false);
    }
  };

  if (checking || authLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <AppShell>
      <div className="max-w-4xl mx-auto px-6 py-8 flex flex-col gap-8">
        <h1 className="text-2xl font-bold text-foreground">Admin</h1>

        {/* Feature Flags */}
        <section className="space-y-3">
          <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground/60">
            Feature Flags
          </p>
          <div className="rounded-xl border border-border bg-card p-4 flex items-center justify-between gap-4">
            <div>
              <p className="font-semibold text-foreground">Nova Models</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Use Amazon Nova Lite + Nova multimodal embeddings instead of Titan + Sonnet/Haiku
              </p>
            </div>
            <Switch
              checked={config?.use_nova ?? false}
              onCheckedChange={toggleNova}
              disabled={togglingNova}
            />
          </div>
        </section>

        {/* Stats */}
        {stats && (
          <section className="space-y-3">
            <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground/60">
              Stats
            </p>
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: 'Users', value: stats.total_users },
                { label: 'Sources', value: stats.total_sources },
                { label: 'Slots', value: stats.total_slots },
              ].map(({ label, value }) => (
                <div
                  key={label}
                  className="rounded-xl border border-border bg-card p-4 flex flex-col items-center gap-1"
                >
                  <p className="text-2xl font-bold text-foreground">{value}</p>
                  <p className="text-xs text-muted-foreground">{label}</p>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* User list */}
        {users.length > 0 && (
          <section className="space-y-3">
            <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground/60">
              Users ({users.length})
            </p>
            <div className="rounded-xl border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/50">
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">Email</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">Tier</th>
                    <th className="text-right px-4 py-2.5 text-xs font-semibold text-muted-foreground">Sources</th>
                    <th className="text-right px-4 py-2.5 text-xs font-semibold text-muted-foreground">Slots</th>
                    <th className="text-right px-4 py-2.5 text-xs font-semibold text-muted-foreground">Joined</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u, i) => (
                    <tr
                      key={u.id}
                      className={`border-b border-border last:border-0 ${i % 2 !== 0 ? 'bg-muted/20' : ''}`}
                    >
                      <td className="px-4 py-3 text-foreground truncate max-w-[200px]">{u.email}</td>
                      <td className="px-4 py-3">
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded ${
                          u.tier === 'pro'
                            ? 'bg-blue-900/50 text-blue-400'
                            : u.tier === 'team'
                            ? 'bg-purple-900/50 text-purple-400'
                            : 'bg-muted text-muted-foreground'
                        }`}>
                          {u.tier}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right text-muted-foreground">{u.sources_count}</td>
                      <td className="px-4 py-3 text-right text-muted-foreground">{u.slots_count}</td>
                      <td className="px-4 py-3 text-right text-muted-foreground text-xs">
                        {new Date(u.created_at).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </div>
    </AppShell>
  );
}
