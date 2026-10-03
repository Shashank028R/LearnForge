import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchCurrentUser = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/v1/auth/me', {
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      });

      if (res.ok) {
        const json = await res.json();
        setUser(json.data.user);
        setSession(json.data.session);
        setError(null);
      } else {
        setUser(null);
        setSession(null);
      }
    } catch (err) {
      setUser(null);
      setSession(null);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCurrentUser();
  }, [fetchCurrentUser]);

  const requestOtp = async (email) => {
    const res = await fetch('/api/v1/auth/otp/request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
      credentials: 'include',
    });

    const data = await res.json();
    if (!res.ok) {
      const err = new Error(data.error?.message || 'Failed to request verification code.');
      err.code = data.error?.code || 'OTP_REQUEST_FAILED';
      err.details = data.error?.details || [];
      throw err;
    }
    return data.data;
  };

  const verifyOtp = async (email, code) => {
    const res = await fetch('/api/v1/auth/otp/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, code }),
      credentials: 'include',
    });

    const data = await res.json();
    if (!res.ok) {
      const err = new Error(data.error?.message || 'Verification failed.');
      err.code = data.error?.code || 'OTP_VERIFY_FAILED';
      err.details = data.error?.details || [];
      throw err;
    }

    setUser(data.data.user);
    // If running in mobile or non-cookie client, store sessionToken in secure storage
    if (data.data.sessionToken) {
      localStorage.setItem('learnforge_bearer_fallback', data.data.sessionToken);
    }
    return data.data;
  };

  const authenticateGoogle = async (idToken) => {
    const res = await fetch('/api/v1/auth/google', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken }),
      credentials: 'include',
    });

    const data = await res.json();
    if (!res.ok) {
      const err = new Error(data.error?.message || 'Google authentication failed.');
      err.code = data.error?.code || 'GOOGLE_AUTH_FAILED';
      err.details = data.error?.details || [];
      throw err;
    }

    setUser(data.data.user);
    if (data.data.sessionToken) {
      localStorage.setItem('learnforge_bearer_fallback', data.data.sessionToken);
    }
    return data.data;
  };

  const logout = async () => {
    try {
      await fetch('/api/v1/auth/logout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      });
    } finally {
      setUser(null);
      setSession(null);
      localStorage.removeItem('learnforge_bearer_fallback');
    }
  };

  const logoutAll = async () => {
    try {
      await fetch('/api/v1/auth/logout-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      });
    } finally {
      setUser(null);
      setSession(null);
      localStorage.removeItem('learnforge_bearer_fallback');
    }
  };

  const value = {
    user,
    session,
    loading,
    error,
    isAuthenticated: Boolean(user),
    requestOtp,
    verifyOtp,
    authenticateGoogle,
    logout,
    logoutAll,
    refreshUser: fetchCurrentUser,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
