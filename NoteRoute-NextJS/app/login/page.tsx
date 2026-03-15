'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { isSignInWithEmailLink } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { useAuthStore } from '@/store/authStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function LoginPage() {
  const [mode, setMode] = useState<'signin' | 'signup' | 'magic' | 'reset'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [magicSent, setMagicSent] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [pendingMagicUrl, setPendingMagicUrl] = useState<string | null>(null);
  const { signIn, signUp, sendMagicLink, sendPasswordReset, confirmMagicLink, loading, error } = useAuthStore();

  // Complete magic link sign-in if URL contains the link
  useEffect(() => {
    const url = window.location.href;
    if (!isSignInWithEmailLink(auth, url)) return;
    const savedEmail = localStorage.getItem('noteroute_magic_email');
    if (savedEmail) {
      confirmMagicLink(url);
    } else {
      // Opened on a different device — ask for email
      setPendingMagicUrl(url);
    }
  }, []);

  const validatePassword = (pw: string): string | null => {
    if (pw.length < 8) return 'Password must be at least 8 characters.';
    if (!/[0-9]/.test(pw)) return 'Password must contain at least one number.';
    if (!/[^a-zA-Z0-9]/.test(pw)) return 'Password must contain at least one special character.';
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === 'magic') {
      await sendMagicLink(email);
      if (!useAuthStore.getState().error) setMagicSent(true);
      return;
    }
    if (mode === 'reset') {
      await sendPasswordReset(email);
      if (!useAuthStore.getState().error) setResetSent(true);
      return;
    }
    if (mode === 'signup') {
      const validationError = validatePassword(password);
      if (validationError) {
        useAuthStore.setState({ error: validationError });
        return;
      }
    }
    if (mode === 'signin') {
      await signIn(email, password);
    } else {
      await signUp(email, password);
    }
  };

  if (pendingMagicUrl) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="w-full max-w-sm space-y-6">
          <div className="text-center space-y-2">
            <div className="flex justify-center">
              <Image src="/logo.svg" alt="NoteRoute" width={48} height={48} className="rounded-2xl" />
            </div>
            <h1 className="text-xl font-bold text-foreground">Confirm your email</h1>
            <p className="text-sm text-muted-foreground">
              Enter the email address you used to request this sign-in link.
            </p>
          </div>
          {error && <p className="text-sm text-destructive text-center">{error}</p>}
          <div className="space-y-2">
            <Label htmlFor="confirm-email">Email</Label>
            <Input
              id="confirm-email"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
            />
          </div>
          <Button
            className="w-full"
            disabled={loading || !email}
            onClick={async () => {
              localStorage.setItem('noteroute_magic_email', email);
              await confirmMagicLink(pendingMagicUrl);
            }}
          >
            {loading ? (
              <span className="flex items-center gap-2">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                Signing in…
              </span>
            ) : 'Sign In'}
          </Button>
        </div>
      </div>
    );
  }

  if (resetSent) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="w-full max-w-sm space-y-4 text-center">
          <div className="flex justify-center">
            <Image src="/logo.svg" alt="NoteRoute" width={48} height={48} className="rounded-2xl" />
          </div>
          <h1 className="text-xl font-bold text-foreground">Check your email</h1>
          <p className="text-sm text-muted-foreground">
            We sent a password reset link to <span className="text-foreground font-medium">{email}</span>.
          </p>
          <button
            type="button"
            className="text-sm text-muted-foreground underline-offset-4 hover:underline"
            onClick={() => { setResetSent(false); setMode('signin'); useAuthStore.setState({ error: '' }); }}
          >
            Back to sign in
          </button>
        </div>
      </div>
    );
  }

  if (magicSent) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="w-full max-w-sm space-y-4 text-center">
          <div className="flex justify-center">
            <Image src="/logo.svg" alt="NoteRoute" width={48} height={48} className="rounded-2xl" />
          </div>
          <h1 className="text-xl font-bold text-foreground">Check your email</h1>
          <p className="text-sm text-muted-foreground">
            We sent a sign-in link to <span className="text-foreground font-medium">{email}</span>. Click it to sign in.
          </p>
          <button
            type="button"
            className="text-sm text-muted-foreground underline-offset-4 hover:underline"
            onClick={() => { setMagicSent(false); setMode('signin'); useAuthStore.setState({ error: '' }); }}
          >
            Back to sign in
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm space-y-8">
        {/* Logo */}
        <div className="text-center">
          <div className="mb-3 flex justify-center">
            <Image src="/logo.svg" alt="NoteRoute" width={48} height={48} className="rounded-2xl" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">NoteRoute</h1>
          <p className="mt-1 text-sm text-muted-foreground">Route your notes to the right place</p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </div>

          {mode !== 'magic' && mode !== 'reset' && (
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
              />
            </div>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? (
              <span className="flex items-center gap-2">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                {mode === 'magic' ? 'Sending link…' : mode === 'reset' ? 'Sending reset…' : mode === 'signin' ? 'Signing in…' : 'Creating account…'}
              </span>
            ) : (
              mode === 'magic' ? 'Send Sign-In Link' : mode === 'reset' ? 'Send Reset Link' : mode === 'signin' ? 'Sign In' : 'Create Account'
            )}
          </Button>
        </form>

        {/* Toggle sign in / sign up */}
        {mode !== 'magic' && mode !== 'reset' && (
          <p className="text-center text-sm text-muted-foreground">
            {mode === 'signin' ? "Don't have an account?" : 'Already have an account?'}{' '}
            <button
              type="button"
              className="font-medium text-foreground underline-offset-4 hover:underline"
              onClick={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); useAuthStore.setState({ error: '' }); }}
            >
              {mode === 'signin' ? 'Sign up' : 'Sign in'}
            </button>
          </p>
        )}

        {/* Forgot password — only on sign in */}
        {mode === 'signin' && (
          <p className="text-center text-sm text-muted-foreground">
            <button
              type="button"
              className="underline-offset-4 hover:underline"
              onClick={() => { setMode('reset'); useAuthStore.setState({ error: '' }); }}
            >
              Forgot password?
            </button>
          </p>
        )}

        {/* Back to sign in — on reset mode */}
        {mode === 'reset' && (
          <p className="text-center text-sm text-muted-foreground">
            <button
              type="button"
              className="underline-offset-4 hover:underline"
              onClick={() => { setMode('signin'); useAuthStore.setState({ error: '' }); }}
            >
              Back to sign in
            </button>
          </p>
        )}

        {/* Divider */}
        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t border-border" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-background px-2 text-muted-foreground">or</span>
          </div>
        </div>

        {/* Magic link toggle */}
        <p className="text-center text-sm">
          <button
            type="button"
            className="font-medium text-foreground underline-offset-4 hover:underline"
            onClick={() => { setMode((m) => m === 'magic' ? 'signin' : 'magic'); useAuthStore.setState({ error: '' }); }}
          >
            {mode === 'magic' ? 'Use password instead' : 'Email me a sign-in link'}
          </button>
        </p>
      </div>
    </div>
  );
}
