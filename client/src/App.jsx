import React, { useState, useEffect } from 'react';

export default function App() {
  const [healthData, setHealthData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchHealth = async () => {
      try {
        const response = await fetch('/api/v1/health');
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        setHealthData(data);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchHealth();
  }, []);

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
              <p className="text-xs text-slate-500 font-mono">v0.1.0 • Foundation Phase 00</p>
            </div>
          </div>
          <div className="flex items-center space-x-4">
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800">
              Phase 00 Verified
            </span>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="max-w-6xl mx-auto px-6 py-10 w-full flex-1">
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-slate-900 mb-2">
            AI-Powered Knowledge & Learning Workspace
          </h2>
          <p className="text-slate-600 max-w-3xl">
            Chat is the interaction layer. Knowledge is the product. LearnForge automatically converts study
            conversations into structured notes, adaptive study loops, concept tracking, and quizzes.
          </p>
        </div>

        {/* Foundation Architecture Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-white border border-slate-200 rounded-lg p-5 shadow-sm">
            <div className="text-xs font-mono font-semibold text-indigo-600 uppercase tracking-wider mb-1">
              Architecture Status
            </div>
            <h3 className="text-base font-semibold text-slate-900 mb-2">Decoupled Monorepo</h3>
            <p className="text-sm text-slate-600 mb-3">
              Independent client and server boundaries configured for API-first consumption and future mobile readiness.
            </p>
            <div className="text-xs font-mono text-slate-500 bg-slate-100 p-2 rounded">
              /client (React + Vite) • /server (Express)
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-lg p-5 shadow-sm">
            <div className="text-xs font-mono font-semibold text-indigo-600 uppercase tracking-wider mb-1">
              Backend Health
            </div>
            <h3 className="text-base font-semibold text-slate-900 mb-2">API Gateway Baseline</h3>
            <div className="text-sm text-slate-600 mb-3">
              {loading && <p className="text-slate-400">Pinging /api/v1/health...</p>}
              {error && (
                <p className="text-amber-600 text-xs">
                  Server offline (run <code className="bg-amber-50 px-1 py-0.5 rounded">npm run dev</code> to boot API)
                </p>
              )}
              {healthData && (
                <div className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-500">Service:</span>
                    <span className="font-semibold text-slate-800">{healthData.data?.service}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-500">Status:</span>
                    <span className="font-semibold text-emerald-600">{healthData.data?.status}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-500">Database:</span>
                    <span className="font-mono text-slate-700">{healthData.data?.database}</span>
                  </div>
                </div>
              )}
            </div>
            <div className="text-xs font-mono text-slate-500 bg-slate-100 p-2 rounded">
              Endpoint: /api/v1/health
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-lg p-5 shadow-sm">
            <div className="text-xs font-mono font-semibold text-indigo-600 uppercase tracking-wider mb-1">
              Engineering Rigor
            </div>
            <h3 className="text-base font-semibold text-slate-900 mb-2">Documentation Pipeline</h3>
            <p className="text-sm text-slate-600 mb-3">
              18 structured implementation phases, 8 ADRs, full database schema designs, and continuous interview guide.
            </p>
            <div className="text-xs font-mono text-slate-500 bg-slate-100 p-2 rounded">
              docs/architecture/ARCHITECTURE_REVIEW.md
            </div>
          </div>
        </div>

        {/* Phase Roadmap Progress Banner */}
        <section className="bg-white border border-slate-200 rounded-lg p-6 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-100 mb-4">
            <div>
              <h3 className="text-base font-semibold text-slate-900">Phase 00 Foundation Checklist</h3>
              <p className="text-xs text-slate-500">Current milestone validation complete. Feature gates locked for Phase 01.</p>
            </div>
            <span className="mt-2 sm:mt-0 text-xs font-mono bg-slate-100 text-slate-700 px-2 py-1 rounded">
              Target: Phase 01 (Authentication)
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm text-slate-700">
            <div className="flex items-center space-x-2">
              <span className="text-emerald-600 font-bold">✓</span>
              <span>Monorepo workspace initialized with clean client/server separation</span>
            </div>
            <div className="flex items-center space-x-2">
              <span className="text-emerald-600 font-bold">✓</span>
              <span>Architecture review completed and contradictions resolved</span>
            </div>
            <div className="flex items-center space-x-2">
              <span className="text-emerald-600 font-bold">✓</span>
              <span>Centralized error envelopes and correlation IDs (X-Request-ID)</span>
            </div>
            <div className="flex items-center space-x-2">
              <span className="text-emerald-600 font-bold">✓</span>
              <span>Safe database connection abstraction with status reporting</span>
            </div>
            <div className="flex items-center space-x-2">
              <span className="text-emerald-600 font-bold">✓</span>
              <span>Environment configuration templates and secret exclusion (.gitignore)</span>
            </div>
            <div className="flex items-center space-x-2">
              <span className="text-emerald-600 font-bold">✓</span>
              <span>Automated Vitest and Supertest testing suites established</span>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-slate-200 py-4 px-6 text-center text-xs text-slate-500">
        LearnForge Engineering Workspace • Built with React, Express, MongoDB & Tailwind CSS
      </footer>
    </div>
  );
}
