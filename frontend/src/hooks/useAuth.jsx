import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import api from '../api/client';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function init() {
      const token = localStorage.getItem('token');
      if (token) {
        api.setToken(token);
        try {
          setUser(await api.getMe());
        } catch {
          // Access token expired — try refresh
          const refreshed = await api.tryRefresh();
          if (refreshed) {
            try {
              setUser(await api.getMe());
            } catch {
              api.setToken(null);
              setUser(null);
            }
          } else {
            api.setToken(null);
            setUser(null);
          }
        }
      } else {
        // No token in storage — try refresh cookie (e.g. after page reload with expired access token)
        const refreshed = await api.tryRefresh();
        if (refreshed) {
          try {
            setUser(await api.getMe());
          } catch {
            api.setToken(null);
          }
        }
      }
      setLoading(false);
    }
    init();
  }, []);

  const login = useCallback(async (username, password) => {
    const data = await api.login(username, password);
    api.setToken(data.access_token);
    setUser(data.user);
    return data.user;
  }, []);

  const register = useCallback(async (username, email, password, displayName, inviteCode) => {
    const data = await api.register(username, email, password, displayName, inviteCode);
    api.setToken(data.access_token);
    setUser(data.user);
    return data.user;
  }, []);

  const logout = useCallback(async () => {
    await api.logout();
    setUser(null);
  }, []);

  const refreshUser = useCallback(async () => {
    const u = await api.getMe();
    setUser(u);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
