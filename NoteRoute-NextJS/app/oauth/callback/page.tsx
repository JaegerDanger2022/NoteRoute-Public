'use client';

import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useSourceStore } from '@/store/sourceStore';
import { useAuthStore } from '@/store/authStore';

export default function OAuthCallbackPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { fetchSources } = useSourceStore();
  const { user, loading } = useAuthStore();
  const [message, setMessage] = useState('Completing connection…');
  const [isError, setIsError] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace('/login');
      return;
    }

    const provider = searchParams.get('provider');
    const status = searchParams.get('status');
    const scopeUpgrade = searchParams.get('scope_upgrade') === 'true';

    const handleCallback = async () => {
      if (status === 'error') {
        const message = searchParams.get('message') ?? 'Connection failed.';
        setMessage(message);
        setIsError(true);
        setTimeout(() => router.replace('/sources'), 4000);
        return;
      }
      if (status === 'success' || status === 'connected') {
        setMessage('Connection successful! Loading your sources…');
        await fetchSources();
        if (scopeUpgrade) {
          setMessage('Google Docs write access granted. Returning to Record…');
          setTimeout(() => router.replace('/record'), 1200);
        } else {
          setMessage(`${provider ? provider.charAt(0).toUpperCase() + provider.slice(1) : 'Source'} connected! Redirecting…`);
          setTimeout(() => router.replace('/sources'), 1200);
        }
      } else {
        setMessage('Connection failed or was cancelled.');
        setIsError(true);
        setTimeout(() => router.replace('/sources'), 2000);
      }
    };

    handleCallback();
  }, [loading, user]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="text-center space-y-4 max-w-sm px-6">
        {isError ? (
          <div className="h-8 w-8 rounded-full border-2 border-destructive flex items-center justify-center mx-auto text-destructive">
            <X className="h-4 w-4" />
          </div>
        ) : (
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent mx-auto" />
        )}
        <p className={`text-sm ${isError ? 'text-destructive' : 'text-muted-foreground'}`}>{message}</p>
        {isError && <p className="text-xs text-muted-foreground">Redirecting back to sources…</p>}
      </div>
    </div>
  );
}
