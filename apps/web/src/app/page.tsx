"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Loader2, Lock, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MeridianLogo } from "@/components/meridian-logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { api, setToken } from "@/lib/api";
import { usePageTitle } from "@/hooks/use-page-title";

export default function LoginPage() {
  usePageTitle("Sign In");
  const router = useRouter();
  const [email, setEmail] = useState("admin@demo.com");
  const [password, setPassword] = useState("demo1234");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const { token } = await api.login(email, password);
      setToken(token);
      router.push("/dashboard");
    } catch (err) {
      setError((err as Error).message || "Sign in failed. Check your email and password, then try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-gradient-bg relative flex min-h-screen flex-col items-center justify-center overflow-hidden p-4">
      <div className="absolute right-4 top-4 md:right-8 md:top-8">
        <ThemeToggle className="touch-manipulation" />
      </div>

      <Card className="glass-card z-10 w-full max-w-[420px] rounded-2xl shadow-layered">
        <CardHeader className="pb-2 text-center">
          <div className="mx-auto mb-6">
            <MeridianLogo size="lg" />
          </div>
          <CardTitle className="text-balance text-2xl font-bold tracking-tight">Welcome to Meridian</CardTitle>
          <p className="mt-2 text-sm font-medium text-muted-foreground">AI-native ERP for modern businesses</p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-5" noValidate>
            <div className="space-y-2">
              <Label htmlFor="email" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Email Address
              </Label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                <Input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  inputMode="email"
                  spellCheck={false}
                  className="pl-10"
                  placeholder="name@company.com…"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="password" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Password
              </Label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                <Input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  className="pl-10"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
            </div>
            {error && (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            )}
            <Button type="submit" className="w-full touch-manipulation shadow-lg shadow-primary/20" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  Signing in…
                </>
              ) : (
                <>
                  Sign In to Dashboard
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </>
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
