'use client';

import { useEffect, useState, useRef } from 'react';
import { Trash2, Search, X } from 'lucide-react';
import { api } from '@/lib/api';
import { AppShell } from '@/components/layout/AppShell';

type Route = {
  id: string;
  transcript: string | null;
  slot_name: string;
  delivery_status: 'delivered' | 'failed' | 'rejected';
  created_at: string;
  delivery_url: string | null;
  retry_count: number;
};

const STATUS_CLASS: Record<string, string> = {
  delivered: 'bg-green-500/10 text-green-400 border-green-500/20',
  failed: 'bg-red-500/10 text-red-400 border-red-500/20',
  rejected: 'bg-red-500/10 text-red-400 border-red-500/20',
};

const STATUS_TABS = ['all', 'delivered', 'failed', 'rejected'] as const;
type StatusTab = typeof STATUS_TABS[number];

export default function HistoryPage() {
  const [routes, setRoutes] = useState<Route[]>([]);
  const [loading, setLoading] = useState(true);
  const [retrying, setRetrying] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [statusTab, setStatusTab] = useState<StatusTab>('all');
  const [query, setQuery] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchRoutes = (status: StatusTab, q: string) => {
    setLoading(true);
    const params: Record<string, string> = {};
    if (status !== 'all') params.status = status;
    if (q.trim()) params.q = q.trim();
    api
      .get('/api/v1/routes', { params })
      .then((r) => setRoutes(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchRoutes(statusTab, query);
  }, [statusTab]);

  const handleQueryChange = (val: string) => {
    setQuery(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchRoutes(statusTab, val), 350);
  };

  async function handleRetry(routeId: string) {
    setRetrying(routeId);
    try {
      await api.post(`/api/v1/routes/${routeId}/retry`);
      fetchRoutes(statusTab, query);
    } catch {
    } finally {
      setRetrying(null);
    }
  }

  async function handleDelete(routeId: string) {
    if (confirmDelete !== routeId) {
      setConfirmDelete(routeId);
      // Auto-cancel confirmation after 3 s
      setTimeout(() => setConfirmDelete((c) => (c === routeId ? null : c)), 3000);
      return;
    }
    setDeleting(routeId);
    setConfirmDelete(null);
    try {
      await api.delete(`/api/v1/routes/${routeId}`);
    } catch (err) {
      console.error('Delete failed:', err);
      setDeleting(null);
      return;
    }
    // Only remove from UI after confirmed success
    setRoutes((prev) => prev.filter((r) => r.id !== routeId));
    setDeleting(null);
  }

  return (
    <AppShell>
      <div className="max-w-2xl mx-auto px-6 py-8 pt-16 md:pt-8">
        <h1 className="text-2xl font-bold text-foreground mb-4">History</h1>

        {/* Search */}
        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => handleQueryChange(e.target.value)}
            placeholder="Search transcript or slot…"
            className="w-full rounded-lg border border-border bg-muted pl-9 pr-9 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
          {query && (
            <button onClick={() => handleQueryChange('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Status tabs */}
        <div className="flex gap-1 mb-4">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab}
              onClick={() => setStatusTab(tab)}
              className={`px-3 py-1 rounded-md text-xs font-semibold capitalize transition-colors ${
                statusTab === tab
                  ? 'bg-foreground text-background'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        ) : routes.length === 0 ? (
          <p className="text-muted-foreground text-center py-12">
            No routes yet. Record your first voice note!
          </p>
        ) : (
          <div className="space-y-3">
            {routes.map((route) => (
              <div
                key={route.id}
                className="rounded-xl border border-border bg-card p-4 space-y-2"
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-foreground">
                    {route.slot_name || 'Unknown slot'}
                  </span>
                  <span
                    className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-semibold ${
                      STATUS_CLASS[route.delivery_status] ?? ''
                    }`}
                  >
                    {route.delivery_status}
                  </span>
                </div>

                {route.transcript && (
                  <p className="text-sm text-muted-foreground line-clamp-2">
                    {route.transcript}
                  </p>
                )}

                <div className="flex items-center justify-between pt-1">
                  <p className="text-xs text-muted-foreground/60">
                    {new Date(route.created_at).toLocaleString()}
                    {route.retry_count > 0 && (
                      <span className="ml-2 text-muted-foreground/40">
                        · {route.retry_count} {route.retry_count === 1 ? 'retry' : 'retries'}
                      </span>
                    )}
                  </p>

                  <div className="flex items-center gap-2">
                    {route.delivery_url && (
                      <a
                        href={route.delivery_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-primary hover:underline"
                      >
                        Open →
                      </a>
                    )}
                    {route.delivery_status === 'failed' && (
                      <button
                        onClick={() => handleRetry(route.id)}
                        disabled={retrying === route.id}
                        className="text-xs px-2 py-0.5 rounded border border-border text-muted-foreground hover:text-foreground hover:border-foreground/40 disabled:opacity-50 transition-colors"
                      >
                        {retrying === route.id ? 'Retrying…' : 'Retry'}
                      </button>
                    )}
                    {confirmDelete === route.id ? (
                      <button
                        onClick={() => handleDelete(route.id)}
                        disabled={deleting === route.id}
                        className="text-xs px-2 py-0.5 rounded border border-red-500/40 text-red-400 hover:bg-red-500/10 disabled:opacity-50 transition-colors"
                      >
                        Confirm
                      </button>
                    ) : (
                      <button
                        onClick={() => handleDelete(route.id)}
                        disabled={deleting === route.id}
                        className="text-muted-foreground/40 hover:text-red-400 disabled:opacity-30 transition-colors"
                        aria-label="Delete"
                      >
                        {deleting === route.id ? (
                          <div className="h-3.5 w-3.5 animate-spin rounded-full border border-current border-t-transparent" />
                        ) : (
                          <Trash2 className="h-3.5 w-3.5" />
                        )}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
