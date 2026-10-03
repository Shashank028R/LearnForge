import React from 'react';
import { useAuth } from '../context/AuthContext';
import { Avatar, Badge, Button, Icon } from '../components/ui';

export function ProfilePage({ onOpenAuth }) {
  const { user, session, isAuthenticated, logout, logoutAll } = useAuth();

  if (!isAuthenticated || !user) {
    return (
      <div className="space-y-6">
        <h1 className="text-xl font-bold text-app-text-primary tracking-tight">
          User Profile
        </h1>
        <div className="border border-app-border rounded-lg p-8 bg-app-surface text-center max-w-md mx-auto">
          <div className="w-12 h-12 rounded-full bg-app-surface-muted text-app-text-muted flex items-center justify-center mx-auto mb-3">
            <Icon name="user" size={24} />
          </div>
          <h2 className="text-base font-semibold text-app-text-primary">Not Signed In</h2>
          <p className="text-xs text-app-text-secondary mt-1 mb-5">
            Sign in to view your user identity, active sessions, and account credentials.
          </p>
          <Button variant="primary" size="md" onClick={onOpenAuth}>
            Sign In
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-xl font-bold text-app-text-primary tracking-tight">
          User Profile & Security
        </h1>
        <p className="text-xs text-app-text-secondary mt-0.5">
          Manage your identity, authentication credentials, and active device sessions.
        </p>
      </div>

      {/* Profile Card */}
      <div className="border border-app-border rounded-lg p-6 bg-app-surface space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          <Avatar
            src={user.avatarUrl}
            name={user.displayName || user.email}
            size="lg"
          />
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-app-text-primary">
                {user.displayName || 'LearnForge Student'}
              </h2>
              <Badge variant="success">Active Session</Badge>
            </div>
            <p className="text-xs text-app-text-secondary font-mono">{user.email}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4 border-t border-app-border text-xs">
          <div>
            <span className="text-app-text-muted block text-[11px] uppercase tracking-wider font-semibold">
              Authentication Method
            </span>
            <span className="text-app-text-primary font-medium mt-1 inline-flex items-center gap-1.5">
              <Icon name="shield" size={14} className="text-brand-500" />
              {session?.authMethod === 'google' ? 'Google Identity (OpenID Connect)' : 'Email One-Time Password (OTP)'}
            </span>
          </div>

          <div>
            <span className="text-app-text-muted block text-[11px] uppercase tracking-wider font-semibold">
              Security Posture
            </span>
            <span className="text-app-text-primary font-medium mt-1 inline-flex items-center gap-1.5">
              <Icon name="check" size={14} className="text-status-success" />
              HttpOnly Secure Cookie Sessions
            </span>
          </div>
        </div>
      </div>

      {/* Session Management */}
      <div className="border border-app-border rounded-lg p-6 bg-app-surface space-y-4">
        <div>
          <h2 className="text-sm font-semibold text-app-text-primary">Session Management</h2>
          <p className="text-xs text-app-text-secondary mt-0.5">
            Revoke tokens or disconnect from this or all active devices.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 pt-2">
          <Button
            variant="secondary"
            size="sm"
            icon={<Icon name="logout" size={14} />}
            onClick={logout}
          >
            Sign Out
          </Button>

          <Button
            variant="danger"
            size="sm"
            icon={<Icon name="shield" size={14} />}
            onClick={logoutAll}
          >
            Sign Out All Devices
          </Button>
        </div>
      </div>
    </div>
  );
}

export default ProfilePage;
