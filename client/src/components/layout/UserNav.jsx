import React from 'react';
import { useAuth } from '../../context/AuthContext.jsx';
import { Avatar, Button, Dropdown, Icon, Badge } from '../ui';
import { useNavigate } from 'react-router-dom';

/**
 * User navigation and account menu in the TopBar.
 * Adheres strictly to the LearnForge design system tokens.
 */
export function UserNav({ onOpenAuth }) {
  const { user, session, isAuthenticated, logout, logoutAll } = useAuth();
  const navigate = useNavigate();

  if (!isAuthenticated || !user) {
    return (
      <Button size="sm" variant="primary" onClick={onOpenAuth} icon={<Icon name="user" size={14} />}>
        Sign In
      </Button>
    );
  }

  const dropdownItems = [
    {
      type: 'header',
      label: 'Account',
    },
    {
      label: 'View Profile',
      icon: <Icon name="user" size={15} />,
      onClick: () => navigate('/profile'),
    },
    {
      label: 'Settings',
      icon: <Icon name="settings" size={15} />,
      onClick: () => navigate('/settings'),
    },
    {
      type: 'divider',
    },
    {
      label: 'Sign Out',
      icon: <Icon name="logout" size={15} />,
      onClick: logout,
    },
    {
      label: 'Sign Out All Devices',
      icon: <Icon name="shield" size={15} />,
      danger: true,
      onClick: logoutAll,
    },
  ];

  const trigger = (
    <div className="flex items-center gap-2.5 p-1 rounded-md hover:bg-app-surface-hover transition-colors">
      <Avatar
        src={user.avatarUrl}
        name={user.displayName || user.email}
        size="sm"
      />
      <div className="hidden sm:block text-left">
        <div className="text-xs font-semibold text-app-text-primary leading-tight truncate max-w-[130px]">
          {user.displayName || user.email?.split('@')[0]}
        </div>
        <div className="text-[10px] text-app-text-muted flex items-center gap-1">
          <span>{session?.authMethod === 'google' ? 'Google' : 'Email OTP'}</span>
        </div>
      </div>
      <Icon name="chevron-down" size={13} className="text-app-text-muted" />
    </div>
  );

  return (
    <Dropdown
      trigger={trigger}
      items={dropdownItems}
      align="right"
      menuWidth="w-56"
    />
  );
}

export default UserNav;
