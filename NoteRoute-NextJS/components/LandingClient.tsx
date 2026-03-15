"use client";

import Link from "next/link";
import Image from "next/image";
import { useAuthStore } from "@/store/authStore";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Mic,
  Zap,
  ArrowRight,
  Layers,
  CheckCircle,
  Bot,
  FileText,
  Hash,
  Camera,
  LayoutGrid,
} from "lucide-react";

/* ── NavBar ──────────────────────────────────────────────────────────────── */
function NavBar({
  user,
  onSignOut,
}: {
  user: { email?: string | null } | null;
  onSignOut: () => void;
}) {
  return (
    <header className="fixed top-0 left-0 right-0 z-50 border-b border-white/[0.06] bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <div className="flex items-center gap-2.5">
          <Image
            src="/logo.svg"
            alt="NoteRoute"
            width={32}
            height={32}
            className="rounded-lg"
          />
          <span className="font-semibold text-foreground text-base">
            NoteRoute
          </span>
        </div>
        {user ? (
          <div className="flex items-center gap-2">
            <Link href="/record">
              <Button
                size="sm"
                variant="ghost"
                className="text-muted-foreground hover:text-foreground">
                Open app
              </Button>
            </Link>
            <Button
              size="sm"
              variant="outline"
              className="border-white/20 hover:border-white/40 bg-transparent"
              onClick={onSignOut}>
              Sign out
            </Button>
          </div>
        ) : (
          <Link href="/login">
            <Button
              size="sm"
              variant="outline"
              className="border-white/20 hover:border-white/40 bg-transparent">
              Login
            </Button>
          </Link>
        )}
      </div>
    </header>
  );
}

/* ── HeroSection ─────────────────────────────────────────────────────────── */
function HeroSection() {
  return (
    <section className="relative flex min-h-screen flex-col items-center justify-center px-6 pt-20 pb-16 text-center overflow-hidden">
      {/* Dot-grid texture */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            "radial-gradient(circle, oklch(1 0 0 / 0.06) 1px, transparent 1px)",
          backgroundSize: "28px 28px",
        }}
      />

      {/* Glow orb 1 — blue-violet, top-center */}
      <div
        className="pointer-events-none absolute animate-glow-pulse"
        style={{
          top: "-10%",
          left: "50%",
          width: "700px",
          height: "500px",
          background:
            "radial-gradient(ellipse at center, oklch(0.488 0.243 264.376 / 0.28) 0%, transparent 70%)",
        }}
      />

      {/* Glow orb 2 — violet, offset right */}
      <div
        className="pointer-events-none absolute animate-glow-pulse-delayed"
        style={{
          top: "20%",
          right: "-15%",
          width: "500px",
          height: "500px",
          background:
            "radial-gradient(ellipse at center, oklch(0.627 0.265 303.9 / 0.18) 0%, transparent 65%)",
        }}
      />

      {/* Badge */}
      <div className="animate-fade-in-up mb-6">
        <Badge
          variant="outline"
          className="gap-1.5 border-white/20 text-muted-foreground px-3 py-1 text-xs">
          <Zap className="size-3 text-yellow-400" />
          AI-powered voice &amp; image routing
        </Badge>
      </div>

      {/* Headline */}
      <h1
        className="animate-fade-in-up relative max-w-4xl text-5xl font-bold tracking-tight text-foreground sm:text-6xl md:text-7xl leading-[1.08]"
        style={{ animationDelay: "100ms" }}>
        Your thoguhts.{" "}
        <span
          className="bg-clip-text text-transparent"
          style={{
            backgroundImage:
              "linear-gradient(135deg, oklch(0.929 0.013 255.508) 0%, oklch(0.7 0.18 264) 40%, oklch(0.627 0.265 303.9) 100%)",
          }}>
          Routed perfectly.
        </span>
      </h1>

      {/* Subtext */}
      <p
        className="animate-fade-in-up mt-6 max-w-xl text-lg text-muted-foreground leading-relaxed"
        style={{ animationDelay: "200ms" }}>
        Speak, type a note or snap a photo. NoteRoute&apos;s AI sends it exactly
        where it belongs — Notion, Google Docs, Slack, Trello, or Todoist. Zero
        effort, zero friction.
      </p>

      {/* CTA Buttons */}
      <div
        className="animate-fade-in-up mt-10 flex flex-col sm:flex-row items-center gap-3"
        style={{ animationDelay: "300ms" }}>
        <Link href="/login">
          <Button
            size="lg"
            className="gap-2 px-8 text-base font-semibold border-0"
            style={{
              background:
                "linear-gradient(135deg, oklch(0.488 0.243 264.376) 0%, oklch(0.627 0.265 303.9) 100%)",
              color: "oklch(0.984 0.003 247.858)",
              boxShadow: "0 0 24px oklch(0.488 0.243 264.376 / 0.4)",
            }}>
            Get Started <ArrowRight className="size-4" />
          </Button>
        </Link>
        <Link href="/login">
          <Button
            size="lg"
            variant="outline"
            className="gap-2 px-8 text-base border-white/20 bg-transparent hover:bg-white/5">
            Login
          </Button>
        </Link>
      </div>

      {/* Social proof */}
      <p
        className="animate-fade-in-up mt-8 text-xs text-muted-foreground/60"
        style={{ animationDelay: "400ms" }}>
        Voice &amp; image input · Notion · Google Docs · Slack · Trello ·
        Todoist
      </p>
    </section>
  );
}

/* ── FeaturesSection ─────────────────────────────────────────────────────── */
const FEATURES = [
  {
    Icon: Mic,
    title: "Voice Input",
    description:
      "Tap to record. Your voice is transcribed instantly, capturing exactly what you said.",
    color: "oklch(0.488 0.243 264.376)",
    bgColor: "oklch(0.488 0.243 264.376 / 0.12)",
    shadowColor: "oklch(0.488 0.243 264.376 / 0.25)",
  },
  {
    Icon: Camera,
    title: "Image Input",
    description:
      "Snap a photo or upload an image. AI extracts the text and routes it just like a voice note.",
    color: "oklch(0.75 0.18 200)",
    bgColor: "oklch(0.75 0.18 200 / 0.12)",
    shadowColor: "oklch(0.75 0.18 200 / 0.25)",
  },
  {
    Icon: Bot,
    title: "Smart AI Routing",
    description:
      "Semantic AI matches your note to the most relevant destination — automatically.",
    color: "oklch(0.627 0.265 303.9)",
    bgColor: "oklch(0.627 0.265 303.9 / 0.12)",
    shadowColor: "oklch(0.627 0.265 303.9 / 0.25)",
  },
  {
    Icon: Layers,
    title: "Deep Integrations",
    description:
      "Native connectors for Notion, Google Docs, Slack, Trello, and Todoist — all live.",
    color: "oklch(0.696 0.17 162.48)",
    bgColor: "oklch(0.696 0.17 162.48 / 0.12)",
    shadowColor: "oklch(0.696 0.17 162.48 / 0.25)",
  },
  {
    Icon: CheckCircle,
    title: "Instant Delivery",
    description:
      "Notes land in the right place within seconds. No copy-paste, no manual filing.",
    color: "oklch(0.6 0.2 145)",
    bgColor: "oklch(0.6 0.2 145 / 0.12)",
    shadowColor: "oklch(0.6 0.2 145 / 0.25)",
  },
];

function FeaturesSection() {
  return (
    <section className="relative px-6 py-24">
      <div className="mx-auto max-w-6xl">
        <p className="text-center text-xs font-bold uppercase tracking-widest text-muted-foreground/50 mb-3">
          Why NoteRoute
        </p>
        <h2 className="text-center text-3xl font-bold text-foreground mb-12 sm:text-4xl">
          Built for how you think
        </h2>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {FEATURES.map((f) => (
            <div
              key={f.title}
              className="rounded-2xl border border-white/[0.08] bg-card/50 p-6 backdrop-blur-sm transition-all duration-300 hover:border-white/20 hover:bg-card/80"
              style={{ boxShadow: "inset 0 1px 0 oklch(1 0 0 / 0.06)" }}>
              <div
                className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl"
                style={{
                  background: f.bgColor,
                  boxShadow: `0 0 16px ${f.shadowColor}`,
                }}>
                <f.Icon className="size-5" style={{ color: f.color }} />
              </div>
              <h3 className="mb-2 font-semibold text-foreground">{f.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {f.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ── HowItWorksSection ───────────────────────────────────────────────────── */
const STEPS = [
  {
    emoji: "🎙",
    step: "01",
    title: "Record or Snap",
    description:
      "Tap the mic to speak, or upload a photo. Both work in seconds.",
  },
  {
    emoji: "🤖",
    step: "02",
    title: "AI Routes",
    description:
      "Semantic AI reads your intent and finds the perfect destination slot.",
  },
  {
    emoji: "✅",
    step: "03",
    title: "Delivered",
    description: "Your note appears exactly where it should be. Done.",
  },
];

function HowItWorksSection() {
  return (
    <section className="relative px-6 py-24">
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 80% 50% at 50% 50%, oklch(0.488 0.243 264.376 / 0.06) 0%, transparent 100%)",
        }}
      />

      <div className="relative mx-auto max-w-5xl">
        <p className="text-center text-xs font-bold uppercase tracking-widest text-muted-foreground/50 mb-3">
          How it works
        </p>
        <h2 className="text-center text-3xl font-bold text-foreground mb-16 sm:text-4xl">
          Three steps to done
        </h2>

        <div className="relative flex flex-col gap-12 sm:flex-row sm:gap-0">
          <div
            className="pointer-events-none absolute top-8 hidden h-px sm:block"
            style={{
              left: "calc(16.67% + 32px)",
              right: "calc(16.67% + 32px)",
              background:
                "linear-gradient(90deg, transparent 0%, oklch(0.488 0.243 264.376 / 0.4) 30%, oklch(0.627 0.265 303.9 / 0.4) 70%, transparent 100%)",
            }}
          />

          {STEPS.map((s) => (
            <div
              key={s.step}
              className="flex flex-1 flex-col items-center text-center px-4">
              <div
                className="relative mb-6 flex h-16 w-16 items-center justify-center rounded-full border border-white/15 text-2xl"
                style={{
                  background: "oklch(0.13 0.035 265)",
                  boxShadow: "0 0 24px oklch(0.488 0.243 264.376 / 0.25)",
                }}>
                {s.emoji}
                <span
                  className="absolute -top-2 -right-2 flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold"
                  style={{
                    background: "oklch(0.488 0.243 264.376)",
                    color: "oklch(0.984 0.003 247.858)",
                  }}>
                  {s.step}
                </span>
              </div>
              <h3 className="mb-2 text-lg font-bold text-foreground">
                {s.title}
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed max-w-[200px]">
                {s.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ── IntegrationsSection ─────────────────────────────────────────────────── */
const INTEGRATIONS = [
  { Icon: FileText, name: "Notion", color: "oklch(0.929 0.013 255.508)" },
  { Icon: FileText, name: "Google Docs", color: "oklch(0.6 0.2 210)" },
  { Icon: Hash, name: "Slack", color: "oklch(0.7 0.18 25)" },
  { Icon: LayoutGrid, name: "Trello", color: "oklch(0.6 0.2 240)" },
  { Icon: CheckCircle, name: "Todoist", color: "oklch(0.65 0.22 27)" },
];

function IntegrationsSection() {
  return (
    <section className="px-6 py-24">
      <div className="mx-auto max-w-4xl text-center">
        <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground/50 mb-3">
          Integrations
        </p>
        <h2 className="text-3xl font-bold text-foreground mb-4 sm:text-4xl">
          Route anywhere
        </h2>
        <p className="text-muted-foreground mb-12 text-base">
          Connect your favorite apps. Your notes land where they belong.
        </p>

        <div className="flex flex-wrap items-center justify-center gap-4">
          {INTEGRATIONS.map(({ Icon, name, color }) => (
            <div
              key={name}
              className="flex items-center gap-3 rounded-2xl border border-white/[0.08] bg-card/60 px-6 py-4 backdrop-blur-sm transition-all duration-300 hover:border-white/20"
              style={{ boxShadow: "inset 0 1px 0 oklch(1 0 0 / 0.06)" }}>
              <Icon className="size-5 flex-shrink-0" style={{ color }} />
              <span className="font-semibold text-foreground text-sm">
                {name}
              </span>
            </div>
          ))}
        </div>

        <div className="mt-16">
          <p className="text-muted-foreground mb-6 text-lg">
            Ready to route smarter?
          </p>
          <Link href="/login">
            <Button
              size="lg"
              className="gap-2 px-8 text-base font-semibold border-0"
              style={{
                background:
                  "linear-gradient(135deg, oklch(0.488 0.243 264.376) 0%, oklch(0.627 0.265 303.9) 100%)",
                color: "oklch(0.984 0.003 247.858)",
                boxShadow: "0 0 24px oklch(0.488 0.243 264.376 / 0.35)",
              }}>
              Start for free <ArrowRight className="size-4" />
            </Button>
          </Link>
        </div>
      </div>
    </section>
  );
}

/* ── Footer ──────────────────────────────────────────────────────────────── */
function Footer() {
  return (
    <footer className="border-t border-white/[0.06] px-6 py-8">
      <div className="mx-auto flex max-w-6xl items-center justify-between text-xs text-muted-foreground/50">
        <span>NoteRoute</span>
        <div className="flex items-center gap-4">
          <a
            href="/privacy"
            className="hover:text-muted-foreground transition-colors">
            Privacy Policy
          </a>
          <a
            href="/terms"
            className="hover:text-muted-foreground transition-colors">
            Terms of Service
          </a>
          <span>© 2026</span>
        </div>
      </div>
    </footer>
  );
}

/* ── Landing (client root) ───────────────────────────────────────────────── */
export default function LandingClient() {
  const { user, loading, signOut } = useAuthStore();

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground overflow-x-hidden">
      <NavBar user={user} onSignOut={signOut} />
      <HeroSection />
      <FeaturesSection />
      <HowItWorksSection />
      <IntegrationsSection />
      <Footer />
    </div>
  );
}
