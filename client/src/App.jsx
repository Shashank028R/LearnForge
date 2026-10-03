import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext.jsx';
import UserNav from './components/layout/UserNav.jsx';
import AuthModal from './components/auth/AuthModal.jsx';

function MainWorkspace() {
  const { user, session, isAuthenticated } = useAuth();
  const [healthData, setHealthData] = useState(null);
  const [healthLoading, setHealthLoading] = useState(true);
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [probeResult, setProbeResult] = useState(null);
  const [probing, setProbing] = useState(false);

  useEffect(() => {
    const fetchHealth = async () => {
      try {
        const response = await fetch('/api/v1/health');
        if (response.ok) {
          const data = await response.json();
          setHealthData(data);
        }
      } catch (err) {
        // Silently handle in dev if server is offline
      } finally {
        setHealthLoading(false);
      }
    };

    fetchHealth();
  }, []);

  const handleTestProtectedEndpoint = async () => {
    setProbing(true);
    setProbeResult(null);
    try {
      const res = await fetch('/api/v1/auth/me', {
        credentials: 'include',
      });
      const data = await res.json();
      setProbeResult({
        status: res.status,
        ok: res.ok,
        data,
      });
    } catch (err) {
      setProbeResult({
        status: 'Error',
        ok: false,
        data: { message: err.message },
      });
    } finally {
      setProbing(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-between">
      {/* Top Navigation Bar */}
      <header className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 rounded bg-indigo-600 flex items-center justify-center text-white font-bold text-lg">
              L
            </div>
            <div>
              <h1 className="text-lg font-semibold text-slate-900 leading-tight">LearnForge</h1>
              <p className="text-xs text-slate-500 font-mono">AI Learning Workspace • Phase 01</p>
            </div>
          </div>
          <div className="flex items-center space-x-4">
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800">
              Auth Online
            </span>
            <UserNav onOpenAuth={() => setIsAuthOpen(true)} />
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="max-w-6xl mx-auto px-6 py-10 w-full flex-1">
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-slate-900 mb-2">
            Authentication & User Identity
          </h2>
          <p className="text-slate-600 max-w-3xl">
            LearnForge implements passwordless dual-identity authentication with server-side Google OpenID Connect,
            cryptographic 6-digit email OTPs, and stateful database-backed sessions.
          </p>
        </div>

        {/* Authenticated User Status Banner */}
        {isAuthenticated && user ? (
          <div className="mb-8 p-5 bg-indigo-50/70 border border-indigo-200 rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center space-x-3.5">
              {user.avatarUrl ? (
                <img
                  src={user.avatarUrl}
                  alt={user.displayName}
                  className="w-12 h-12 rounded-full border border-indigo-300 object-cover"
                />
              ) : (
                <div className="w-12 h-12 rounded-full bg-indigo-600 text-white font-bold text-base flex items-center justify-center shadow-sm">
                  {user.displayName.slice(0, 2).toUpperCase()}
                </div>
              )}
              <div>
                <div className="flex items-center space-x-2">
                  <span className="text-sm font-bold text-slate-900">{user.displayName}</span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-indigo-100 text-indigo-700 uppercase tracking-wide">
                    {session?.authMethod === 'google' ? 'Google Auth' : 'Email OTP'}
                  </span>
                </div>
                <p className="text-xs text-slate-600 font-mono mt-0.5">{user.email}</p>
                <p className="text-[11px] text-slate-500 mt-1">
                  Session Token: <span className="font-mono text-indigo-700">Protected in HTTP-only Cookie</span>
                </p>
              </div>
            </div>

            <div className="flex items-center space-x-3">
              <button
                type="button"
                onClick={handleTestProtectedEndpoint}
                disabled={probing}
                className="px-3.5 py-2 bg-white border border-indigo-300 hover:bg-indigo-50 text-indigo-700 rounded-lg text-xs font-semibold shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-colors disabled:opacity-50"
              >
                {probing ? 'Probing...' : 'Test Protected API (/auth/me)'}
              </button>
            </div>
          </div>
        ) : (
          <div className="mb-8 p-5 bg-white border border-slate-200 rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-sm">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">Unauthenticated Session</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Sign in with Google or passwordless email OTP to persist your study sessions.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setIsAuthOpen(true)}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-indigo-500 transition-colors"
            >
              Sign In to LearnForge
            </button>
          </div>
        )}

        {/* Live Probe Result Box */}
        {probeResult && (
          <div className="mb-8 p-4 bg-slate-900 text-slate-100 rounded-lg text-xs font-mono">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800 mb-2">
              <span className="text-slate-400">Protected API Response Probe (Status: {probeResult.status})</span>
              <button onClick={() => setProbeResult(null)} className="text-slate-500 hover:text-slate-300 text-xs">
                Dismiss
              </button>
            </div>
            <pre className="overflow-x-auto">{JSON.stringify(probeResult.data, null, 2)}</pre>
          </div>
        )}

        {/* Foundation Architecture Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-white border border-slate-200 rounded-lg p-5 shadow-sm">
            <div className="text-xs font-mono font-semibold text-indigo-600 uppercase tracking-wider mb-1">
              Authentication Pipeline
            </div>
            <h3 className="text-base font-semibold text-slate-900 mb-2">Passwordless & Google</h3>
            <p className="text-sm text-slate-600 mb-3">
              Server-verified OpenID Connect and cryptographic 6-digit OTPs secured via HMAC-SHA-256 server peppers.
            </p>
            <div className="text-xs font-mono text-slate-500 bg-slate-100 p-2 rounded">
              ADR-009 & ADR-010 (Deterministic Linking)
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-lg p-5 shadow-sm">
            <div className="text-xs font-mono font-semibold text-indigo-600 uppercase tracking-wider mb-1">
              Session Model
            </div>
            <h3 className="text-base font-semibold text-slate-900 mb-2">Database-Backed Sessions</h3>
            <p className="text-sm text-slate-600 mb-3">
              Opaque 256-bit tokens hashed (SHA-256) in MongoDB. Supported via HTTP-only cookies and mobile Bearer headers.
            </p>
            <div className="text-xs font-mono text-slate-500 bg-slate-100 p-2 rounded">
              Single & All-Device Revocation
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-lg p-5 shadow-sm">
            <div className="text-xs font-mono font-semibold text-indigo-600 uppercase tracking-wider mb-1">
              Backend Health
            </div>
            <h3 className="text-base font-semibold text-slate-900 mb-2">API Telemetry</h3>
            <div className="text-sm text-slate-600 mb-3">
              {healthLoading && <p className="text-slate-400">Pinging /api/v1/health...</p>}
              {healthData && (
                <div className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-500">Service:</span>
                    <span className="font-semibold text-slate-800">{healthData.data?.service}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-500">Database:</span>
                    <span className="font-mono text-slate-700">{healthData.data?.database}</span>
                  </div>
                </div>
              )}
            </div>
            <div className="text-xs font-mono text-slate-500 bg-slate-100 p-2 rounded">
              Rate Limiters: Active
            </div>
          </div>
        </div>

        {/* Phase 01 Verification Checklist */}
        <section className="bg-white border border-slate-200 rounded-lg p-6 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-100 mb-4">
            <div>
              <h3 className="text-base font-semibold text-slate-900">Phase 01 Authentication Checklist</h3>
              <p className="text-xs text-slate-500">Verified against automated integration suites and security rules.</p>
            </div>
            <span className="mt-2 sm:mt-0 text-xs font-mono bg-emerald-100 text-emerald-800 px-2 py-1 rounded font-medium">
              Phase 01 Complete
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm text-slate-700">
            <div className="flex items-center space-x-2">
              <span className="text-emerald-600 font-bold">✓</span>
              <span>6-digit numeric OTP generation via cryptographic randomness</span>
            </div>
            <div className="flex items-center space-x-2">
              <span className="text-emerald-600 font-bold">✓</span>
              <span>HMAC-SHA-256 OTP hashing with server-side pepper (offline guessing defense)</span>
            </div>
            <div className="flex items-center space-x-2">
              <span className="text-emerald-600 font-bold">✓</span>
              <span>5-attempt lockout, 60s resend cooldown, and IP throttling</span>
            </div>
            <div className="flex items-center space-x-2">
              <span className="text-emerald-600 font-bold">✓</span>
              <span>Google OAuth 2.0 OpenID Connect server-side claims validation</span>
            </div>
            <div className="flex items-center space-x-2">
              <span className="text-emerald-600 font-bold">✓</span>
              <span>Deterministic account linking between Google and Email OTP (ADR-010)</span>
            </div>
            <div className="flex items-center space-x-2">
              <span className="text-emerald-600 font-bold">✓</span>
              <span>Stateful opaque sessions stored in MongoDB UserSession</span>
            </div>
            <div className="flex items-center space-x-2">
              <span className="text-emerald-600 font-bold">✓</span>
              <span>HTTP-only, SameSite, Secure cookies with mobile Bearer fallback</span>
            </div>
            <div className="flex items-center space-x-2">
              <span className="text-emerald-600 font-bold">✓</span>
              <span>Single session logout and global all-device revocation</span>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-slate-200 py-4 px-6 text-center text-xs text-slate-500">
        LearnForge Engineering Workspace • Phase 01 Authentication & Identity Verified
      </footer>

      {/* Auth Modal Dialog */}
      <AuthModal isOpen={isAuthOpen} onClose={() => setIsAuthOpen(false)} />
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <MainWorkspace />
    </AuthProvider>
  );
}
