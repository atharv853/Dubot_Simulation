'use client';

import React, { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Lock, User, ShieldCheck, Laptop, Smartphone, ArrowRight, Loader2, AlertCircle } from 'lucide-react';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTarget = searchParams?.get('redirect');

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async (e?: React.FormEvent, customUser?: string, customPass?: string) => {
    if (e) e.preventDefault();
    setError(null);
    setLoading(true);

    const userToSubmit = customUser || username;
    const passToSubmit = customPass || password;

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: userToSubmit, password: passToSubmit }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        setError(data.error || 'Authentication failed. Please verify credentials.');
        setLoading(false);
        return;
      }

      // Store token in localStorage for Socket.IO authentication
      if (data.token) {
        localStorage.setItem('dobot_auth_token', data.token);
      }
      if (data.user) {
        localStorage.setItem('dobot_user', JSON.stringify(data.user));
      }

      // Role-based redirect
      if (redirectTarget) {
        router.push(redirectTarget);
      } else if (data.user.role === 'controller') {
        router.push('/controller');
      } else {
        router.push('/');
      }
    } catch (err: any) {
      setError(err?.message || 'Network error occurred during login.');
      setLoading(false);
    }
  };

  const fillAndSubmit = (u: string, p: string) => {
    setUsername(u);
    setPassword(p);
    handleLogin(undefined, u, p);
  };

  return (
    <div className="w-full max-w-md bg-dobot-panel border border-dobot-border rounded-2xl shadow-2xl p-6 sm:p-8 space-y-6">
      {/* Header with Logo */}
      <div className="text-center space-y-2">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-dobot-accent text-white shadow-lg shadow-dobot-accent/30 font-black text-2xl tracking-tighter">
          D
        </div>
        <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight text-white flex items-center justify-center gap-2">
          DOBOT <span className="text-dobot-accent">Magician</span>
        </h1>
        <p className="text-xs text-dobot-muted">
          Real-Time Multi-Device Remote Control & Teleoperation
        </p>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-dobot-danger/15 border border-dobot-danger/40 text-dobot-danger text-xs animate-shake">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Form */}
      <form onSubmit={(e) => handleLogin(e)} className="space-y-4">
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-dobot-muted flex items-center gap-1.5">
            <User className="w-3.5 h-3.5 text-dobot-accent" />
            <span>Username</span>
          </label>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="e.g. atharv or test"
            required
            className="w-full px-3.5 py-2.5 rounded-lg bg-dobot-inputBg text-dobot-text text-sm font-medium border border-dobot-border hover:border-dobot-accent/60 focus:border-dobot-accent focus:outline-none transition-colors"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-dobot-muted flex items-center gap-1.5">
            <Lock className="w-3.5 h-3.5 text-dobot-accent" />
            <span>Password</span>
          </label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            required
            className="w-full px-3.5 py-2.5 rounded-lg bg-dobot-inputBg text-dobot-text text-sm font-medium border border-dobot-border hover:border-dobot-accent/60 focus:border-dobot-accent focus:outline-none transition-colors"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-dobot-accent hover:bg-dobot-accentHover disabled:opacity-50 text-white font-bold text-sm shadow-md shadow-dobot-accent/25 transition-all active:scale-[0.98]"
        >
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Authenticating...</span>
            </>
          ) : (
            <>
              <span>Sign In to Session</span>
              <ArrowRight className="w-4 h-4" />
            </>
          )}
        </button>
      </form>

      {/* Quick Testing Accounts Section */}
      <div className="pt-2 border-t border-dobot-border/60 space-y-2.5">
        <div className="flex items-center justify-between text-[11px] font-semibold text-dobot-muted uppercase tracking-wider">
          <span>Quick Test Presets</span>
          <span className="flex items-center gap-1 text-emerald-400 font-mono normal-case">
            <ShieldCheck className="w-3.5 h-3.5" />
            PBKDF2 Salted
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
          {/* User 1 Preset Button */}
          <button
            type="button"
            onClick={() => fillAndSubmit('atharv', 'atharv123')}
            className="flex flex-col items-start p-2.5 rounded-xl bg-dobot-surface hover:bg-dobot-border/70 border border-dobot-border text-left transition-all group"
          >
            <div className="flex items-center justify-between w-full mb-1">
              <span className="font-bold text-white flex items-center gap-1">
                <Laptop className="w-3.5 h-3.5 text-dobot-accent" />
                atharv
              </span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-dobot-accent/20 text-dobot-accent font-semibold">
                HOST
              </span>
            </div>
            <span className="text-[11px] text-dobot-muted">Desktop / 3D Simulator</span>
            <span className="text-[10px] font-mono text-dobot-muted/60 mt-0.5">pass: atharv123</span>
          </button>

          {/* User 2 Preset Button */}
          <button
            type="button"
            onClick={() => fillAndSubmit('test', 'test123')}
            className="flex flex-col items-start p-2.5 rounded-xl bg-dobot-surface hover:bg-dobot-border/70 border border-dobot-border text-left transition-all group"
          >
            <div className="flex items-center justify-between w-full mb-1">
              <span className="font-bold text-white flex items-center gap-1">
                <Smartphone className="w-3.5 h-3.5 text-emerald-400" />
                test
              </span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 font-semibold">
                CONTROLLER
              </span>
            </div>
            <span className="text-[11px] text-dobot-muted">Mobile Control Only</span>
            <span className="text-[10px] font-mono text-dobot-muted/60 mt-0.5">pass: test123</span>
          </button>
        </div>
      </div>

      {/* Security / Architecture note */}
      <p className="text-[11px] text-center text-dobot-muted/60">
        Session ID: <code className="font-mono text-dobot-text">dobot-main</code> • Both roles share one synchronized robot.
      </p>
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center p-4 bg-dobot-bg text-dobot-text select-none">
      <Suspense
        fallback={
          <div className="w-full max-w-md bg-dobot-panel border border-dobot-border rounded-2xl p-8 flex flex-col items-center justify-center space-y-3">
            <Loader2 className="w-8 h-8 animate-spin text-dobot-accent" />
            <span className="text-xs font-mono text-dobot-muted">Loading Login Interface...</span>
          </div>
        }
      >
        <LoginForm />
      </Suspense>
    </div>
  );
}
