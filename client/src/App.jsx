import React, { useState } from 'react';
import { ThemeProvider } from './context/ThemeContext';
import { AuthProvider } from './context/AuthContext';
import { AppRoutes } from './routes/AppRoutes';
import AuthModal from './components/auth/AuthModal';

/**
 * LearnForge Application Root.
 * Provides Theme and Auth contexts, mounts routing shell,
 * and manages global authentication modal state.
 */
export function App() {
  const [isAuthOpen, setIsAuthOpen] = useState(false);

  return (
    <ThemeProvider>
      <AuthProvider>
        <AppRoutes onOpenAuth={() => setIsAuthOpen(true)} />
        <AuthModal
          isOpen={isAuthOpen}
          onClose={() => setIsAuthOpen(false)}
        />
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
