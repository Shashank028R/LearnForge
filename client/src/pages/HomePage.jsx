import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Button, Icon, EmptyState } from '../components/ui';

export function HomePage({ onOpenAuth }) {
  const { user, isAuthenticated } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="space-y-8 animate-in fade-in duration-150">
      {/* Welcome Hero / Greeting */}
      <section className="border border-app-border rounded-lg p-6 bg-app-surface shadow-subtle">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-semibold uppercase tracking-wider text-brand-600 dark:text-brand-400">
                Workspace
              </span>
            </div>
            <h1 className="text-xl sm:text-2xl font-bold text-app-text-primary tracking-tight">
              {isAuthenticated && user?.displayName
                ? `Welcome back, ${user.displayName}`
                : 'Welcome to LearnForge'}
            </h1>
            <p className="text-xs sm:text-sm text-app-text-secondary mt-1 max-w-xl leading-relaxed">
              Your structured learning environment. Organize your curriculum, explore concepts with AI guidance, and retain knowledge through active recall.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <Button
              variant="primary"
              size="md"
              icon={<Icon name="plus" size={15} />}
              onClick={() => navigate('/subjects')}
            >
              Create Subject
            </Button>
            <Button
              variant="secondary"
              size="md"
              icon={<Icon name="chat" size={15} />}
              onClick={() => navigate('/chats')}
            >
              Start Conversation
            </Button>
          </div>
        </div>
      </section>

      {/* Quick Launch Cards / Workspace Overview */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-5 border border-app-border rounded-lg bg-app-surface hover:border-brand-300 dark:hover:border-brand-700 transition-colors">
          <div className="w-8 h-8 rounded bg-brand-50 dark:bg-brand-950/50 text-brand-600 dark:text-brand-400 flex items-center justify-center mb-3">
            <Icon name="book" size={18} />
          </div>
          <h2 className="text-sm font-semibold text-app-text-primary">Curriculum & Subjects</h2>
          <p className="text-xs text-app-text-secondary mt-1 leading-relaxed">
            Structure your subjects, organize modules, and define key topic taxonomies.
          </p>
          <div className="mt-4 pt-3 border-t border-app-border flex items-center justify-between text-xs">
            <span className="text-app-text-muted">0 subjects active</span>
            <button
              onClick={() => navigate('/subjects')}
              className="text-brand-600 dark:text-brand-400 font-medium hover:underline inline-flex items-center gap-1"
            >
              View <Icon name="chevron-right" size={12} />
            </button>
          </div>
        </div>

        <div className="p-5 border border-app-border rounded-lg bg-app-surface hover:border-brand-300 dark:hover:border-brand-700 transition-colors">
          <div className="w-8 h-8 rounded bg-brand-50 dark:bg-brand-950/50 text-brand-600 dark:text-brand-400 flex items-center justify-center mb-3">
            <Icon name="chat" size={18} />
          </div>
          <h2 className="text-sm font-semibold text-app-text-primary">Socratic Study Chats</h2>
          <p className="text-xs text-app-text-secondary mt-1 leading-relaxed">
            Engage in guided pedagogical dialogues that lead you to answers rather than solving for you.
          </p>
          <div className="mt-4 pt-3 border-t border-app-border flex items-center justify-between text-xs">
            <span className="text-app-text-muted">0 sessions active</span>
            <button
              onClick={() => navigate('/chats')}
              className="text-brand-600 dark:text-brand-400 font-medium hover:underline inline-flex items-center gap-1"
            >
              Start <Icon name="chevron-right" size={12} />
            </button>
          </div>
        </div>

        <div className="p-5 border border-app-border rounded-lg bg-app-surface hover:border-brand-300 dark:hover:border-brand-700 transition-colors">
          <div className="w-8 h-8 rounded bg-brand-50 dark:bg-brand-950/50 text-brand-600 dark:text-brand-400 flex items-center justify-center mb-3">
            <Icon name="study" size={18} />
          </div>
          <h2 className="text-sm font-semibold text-app-text-primary">Spaced Repetition & Quizzes</h2>
          <p className="text-xs text-app-text-secondary mt-1 leading-relaxed">
            Test retention with synthesized quizzes generated directly from your studied concepts.
          </p>
          <div className="mt-4 pt-3 border-t border-app-border flex items-center justify-between text-xs">
            <span className="text-app-text-muted">No pending reviews</span>
            <button
              onClick={() => navigate('/study')}
              className="text-brand-600 dark:text-brand-400 font-medium hover:underline inline-flex items-center gap-1"
            >
              Open <Icon name="chevron-right" size={12} />
            </button>
          </div>
        </div>
      </section>

      {/* Getting Started Guidance */}
      <section className="border border-app-border rounded-lg p-6 bg-app-surface space-y-4">
        <div className="border-b border-app-border pb-3">
          <h2 className="text-sm font-semibold text-app-text-primary">
            Getting Started with LearnForge
          </h2>
          <p className="text-xs text-app-text-secondary mt-0.5">
            Follow these sequential steps to set up your knowledge workspace.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-1">
          <div className="p-4 border border-app-border rounded-md bg-app-surface-muted/30">
            <div className="text-xs font-mono font-semibold text-brand-600 dark:text-brand-400 mb-1">
              Step 01
            </div>
            <h3 className="text-xs font-semibold text-app-text-primary">Create a Subject</h3>
            <p className="text-[11px] text-app-text-secondary mt-1 leading-normal">
              Define the broad area you are studying (e.g. Distributed Systems, Biochemistry).
            </p>
          </div>

          <div className="p-4 border border-app-border rounded-md bg-app-surface-muted/30">
            <div className="text-xs font-mono font-semibold text-brand-600 dark:text-brand-400 mb-1">
              Step 02
            </div>
            <h3 className="text-xs font-semibold text-app-text-primary">Import or Chat</h3>
            <p className="text-[11px] text-app-text-secondary mt-1 leading-normal">
              Bring existing course material or start conversational learning sessions.
            </p>
          </div>

          <div className="p-4 border border-app-border rounded-md bg-app-surface-muted/30">
            <div className="text-xs font-mono font-semibold text-brand-600 dark:text-brand-400 mb-1">
              Step 03
            </div>
            <h3 className="text-xs font-semibold text-app-text-primary">Practice & Quiz</h3>
            <p className="text-[11px] text-app-text-secondary mt-1 leading-normal">
              Reinforce long-term memory through flashcards and structured recall assessments.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}

export default HomePage;
