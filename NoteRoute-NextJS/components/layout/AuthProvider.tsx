'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import { SettingsModal } from '@/components/layout/SettingsModal';
import { getAuth } from 'firebase/auth';

const PUBLIC_PATHS = ['/', '/login', '/oauth/callback', '/privacy', '/terms', '/reset-password'];

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { initialize, user, loading } = useAuthStore();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const unsubscribe = initialize();
    // When browser restores page from bfcache, JS state is stale.
    // Wait for Firebase to rehydrate, then redirect if signed out.
    const handlePageShow = (e: PageTransitionEvent) => {
      if (!e.persisted) return;
      const auth = getAuth();
      if (auth.currentUser) return; // still logged in, nothing to do
      // Firebase may need a tick to rehydrate from IndexedDB persistence.
      // Use onAuthStateChanged with { once } pattern to get the definitive answer.
      const unsub = auth.onAuthStateChanged((u) => {
        unsub();
        if (!u) window.location.replace('/login');
      });
    };
    window.addEventListener('pageshow', handlePageShow);
    return () => {
      unsubscribe();
      window.removeEventListener('pageshow', handlePageShow);
    };
  }, [initialize]);

  useEffect(() => {
    if (loading) return;

    const isPublic = PUBLIC_PATHS.some((p) => pathname.startsWith(p));

    if (!user && !isPublic) {
      router.replace('/login');
    } else if (user && pathname === '/login') {
      router.replace('/record');
    }
  }, [user, loading, pathname, router]);

  // Show nothing while checking auth to avoid flicker
  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <>
      {children}
      <SettingsModal />
    </>
  );
}
