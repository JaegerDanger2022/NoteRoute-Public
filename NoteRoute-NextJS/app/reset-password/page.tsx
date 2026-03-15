'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { confirmPasswordReset, verifyPasswordResetCode } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type PageState = 'verifying' | 'form' | 'success' | 'invalid';

export default function ResetPasswordPage() {
  const [pageState, setPageState] = useState<PageState>('verifying');
  const [oobCode, setOobCode] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('oobCode');
    if (!code) {
      setPageState('invalid');
      return;
    }
    verifyPasswordResetCode(auth, code)
      .then((email) => {
        setOobCode(code);
        setEmail(email);
        setPageState('form');
      })
      .catch(() => setPageState('invalid'));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      await confirmPasswordReset(auth, oobCode, password);
      setPageState('success');
    } catch (e: any) {
      setError(
        e.code === 'auth/expired-action-code'
          ? 'This link has expired. Please request a new one.'
          : e.code === 'auth/invalid-action-code'
          ? 'This link is invalid or has already been used.'
          : 'Something went wrong. Please try again.'
      );
    } finally {
      setLoading(false);
    }
  };

  const Logo = () => (
    <div className="flex justify-center">
      <Image src="/logo.svg" alt="NoteRoute" width={48} height={48} className="rounded-2xl" />
    </div>
  );

  if (pageState === 'verifying') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (pageState === 'invalid') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="w-full max-w-sm space-y-4 text-center">
          <Logo />
          <h1 className="text-xl font-bold text-foreground">Link invalid or expired</h1>
          <p className="text-sm text-muted-foreground">
            This password reset link is invalid or has already been used. Request a new one from the sign-in page.
          </p>
          <a
            href="/login"
            className="inline-block text-sm font-medium text-foreground underline-offset-4 hover:underline"
          >
            Back to sign in
          </a>
        </div>
      </div>
    );
  }

  if (pageState === 'success') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="w-full max-w-sm space-y-4 text-center">
          <Logo />
          <h1 className="text-xl font-bold text-foreground">Password updated</h1>
          <p className="text-sm text-muted-foreground">
            Your password has been changed. You can now sign in with your new password.
          </p>
          <a
            href="/login"
            className="inline-block text-sm font-medium text-foreground underline-offset-4 hover:underline"
          >
            Sign in
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm space-y-8">
        <div className="text-center space-y-2">
          <Logo />
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Set new password</h1>
          <p className="text-sm text-muted-foreground">
            Resetting password for <span className="text-foreground font-medium">{email}</span>
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="password">New password</Label>
            <Input
              id="password"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="new-password"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirm">Confirm password</Label>
            <Input
              id="confirm"
              type="password"
              placeholder="••••••••"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
              autoComplete="new-password"
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? (
              <span className="flex items-center gap-2">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                Updating…
              </span>
            ) : (
              'Update Password'
            )}
          </Button>
        </form>

        <p className="text-center text-sm text-muted-foreground">
          <a
            href="/login"
            className="underline-offset-4 hover:underline"
          >
            Back to sign in
          </a>
        </p>
      </div>
    </div>
  );
}
