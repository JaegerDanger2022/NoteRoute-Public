'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import { useUIStore } from '@/store/uiStore';
import { cn } from '@/lib/utils';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Mic, Link2, FolderOpen, History, Settings } from 'lucide-react';

const NAV_ITEMS = [
  { href: '/record', label: 'Note', icon: Mic },
  { href: '/sources', label: 'Sources', icon: Link2 },
  { href: '/slots', label: 'Slots', icon: FolderOpen },
  { href: '/history', label: 'History', icon: History },
];

export function Sidebar() {
  const pathname = usePathname();
  const { user, signOut } = useAuthStore();
  const { openSettings, signOutOpen, openSignOut, closeSignOut } = useUIStore();

  const avatar = user?.email?.[0]?.toUpperCase() ?? 'U';

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden md:flex flex-col w-56 h-screen sticky top-0 border-r border-border bg-card shrink-0">
        <div className="p-5 border-b border-border">
          <div className="flex items-center gap-3">
            <Image src="/logo.svg" alt="NoteRoute" width={32} height={32} className="rounded-lg" />
            <span className="font-semibold text-foreground">NoteRoute</span>
          </div>
        </div>

        <nav className="flex-1 p-3 space-y-1">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                pathname === item.href || pathname.startsWith(item.href + '/')
                  ? 'bg-accent text-accent-foreground'
                  : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
              )}
            >
              <item.icon className="h-4 w-4 shrink-0" />
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="p-3 border-t border-border">
          <button
            onClick={openSettings}
            className="w-full flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-accent/50 hover:text-foreground transition-colors"
          >
            <div className="h-6 w-6 rounded-full bg-muted flex items-center justify-center text-xs font-medium text-foreground shrink-0">
              {avatar}
            </div>
            <span className="flex-1 truncate text-xs text-left">{user?.email}</span>
            <Settings className="h-3.5 w-3.5 opacity-40 shrink-0" />
          </button>
        </div>
      </aside>

      {/* Mobile top bar — settings gear fixed top-right */}
      <div className="md:hidden fixed top-0 right-0 z-50 p-3">
        <button
          onClick={openSettings}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-card border border-border text-muted-foreground hover:text-foreground transition-colors shadow-sm"
          aria-label="Settings"
        >
          <div className="h-5 w-5 flex items-center justify-center rounded-full bg-muted text-[10px] font-semibold text-foreground">
            {avatar}
          </div>
        </button>
      </div>

      {/* Mobile bottom nav */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-card flex">
        {NAV_ITEMS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              'flex flex-1 flex-col items-center gap-1 py-3 text-xs font-medium transition-colors',
              pathname === item.href
                ? 'text-foreground'
                : 'text-muted-foreground'
            )}
          >
            <item.icon className="h-5 w-5" />
            {item.label}
          </Link>
        ))}
      </nav>

      {/* Sign-out confirmation dialog (shared desktop + mobile) */}
      <Dialog open={signOutOpen} onOpenChange={(v) => v ? openSignOut() : closeSignOut()}>
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle>Sign out</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Are you sure you want to sign out of{' '}
            <span className="text-foreground font-medium">{user?.email}</span>?
          </p>
          <div className="flex gap-2 pt-2">
            <Button variant="outline" className="flex-1" onClick={closeSignOut}>
              Cancel
            </Button>
            <Button variant="destructive" className="flex-1" onClick={signOut}>
              Sign out
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
