'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { useSourceStore } from '@/store/sourceStore';

/**
 * Trello OAuth uses response_type=token which returns the token as a URL *fragment*
 * (#token=...&state=...). Fragments are never sent to the server, so the backend
 * /trello/callback redirects here. This page reads window.location.hash, extracts
 * the token and state, calls the backend /trello/token endpoint, then redirects.
 */
export default function TrelloCallbackPage() {
  const router = useRouter();
  const { fetchSources } = useSourceStore();
  const [message, setMessage] = useState('Connecting Trello…');

  useEffect(() => {
    const hash = window.location.hash.slice(1); // strip leading #
    const hashParams = new URLSearchParams(hash);
    const token = hashParams.get('token');
    // Trello puts the token in the fragment (#token=...) but state in the query string
    const queryParams = new URLSearchParams(window.location.search);
    const state = queryParams.get('state') ?? '';

    if (!token) {
      setMessage('Trello connection failed — no token received.');
      setTimeout(() => router.replace('/sources'), 2500);
      return;
    }

    const isWeb = state.includes('|web');
    const isMobile = !isWeb;

    const finish = async () => {
      try {
        await api.get(`/api/v1/integrations/trello/token`, { params: { token, state } });
        await fetchSources();
        setMessage('Trello connected!');

        if (isMobile) {
          // Redirect to deep link so the mobile app can detect success via AppState
          window.location.href = 'noteroute://oauth/success?provider=trello';
          // Fallback: go to sources after a delay in case deep link doesn't fire
          setTimeout(() => router.replace('/sources'), 1500);
        } else {
          setTimeout(() => router.replace('/sources'), 1000);
        }
      } catch (e: any) {
        const detail = e?.response?.data?.detail ?? 'Trello connection failed. Please try again.';
        setMessage(detail);
        setTimeout(() => router.replace('/sources'), 3000);
      }
    };

    finish();
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="text-center space-y-4">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent mx-auto" />
        <p className="text-sm text-muted-foreground">{message}</p>
      </div>
    </div>
  );
}
