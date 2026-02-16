import { useState, useEffect, useCallback, useRef } from 'react';
import { authAPI } from '../services/api';
import { connectSocket, disconnectSocket } from '../services/socket';
import { AuthContext } from './authContextValue';

/**
 * Read persisted session from localStorage.
 * Returns { user, token } or nulls.
 */
function getStoredSession() {
  try {
    const token = localStorage.getItem('pulse_token');
    const storedUser = localStorage.getItem('pulse_user');
    if (token && storedUser) {
      return { user: JSON.parse(storedUser), token };
    }
  } catch {
    localStorage.removeItem('pulse_token');
    localStorage.removeItem('pulse_user');
  }
  return { user: null, token: null };
}

/**
 * AuthProvider manages user authentication state,
 * JWT token persistence, and Socket.io connection lifecycle.
 */
export function AuthProvider({ children }) {
  // Initialise from localStorage synchronously to avoid a flash
  const [user, setUser] = useState(() => getStoredSession().user);
  const loading = false; // Session restored synchronously from localStorage
  const socketInitialised = useRef(false);

  // Connect socket once on mount if user is already authenticated
  useEffect(() => {
    if (user && !socketInitialised.current) {
      connectSocket(user.id);
      socketInitialised.current = true;
    }
  }, [user]);

  const login = useCallback(async (email, password) => {
    const { data } = await authAPI.login({ email, password });
    localStorage.setItem('pulse_token', data.token);
    localStorage.setItem('pulse_user', JSON.stringify(data.user));
    setUser(data.user);
    connectSocket(data.user.id);
    return data.user;
  }, []);

  const register = useCallback(async (username, email, password, role) => {
    const { data } = await authAPI.register({ username, email, password, role });
    localStorage.setItem('pulse_token', data.token);
    localStorage.setItem('pulse_user', JSON.stringify(data.user));
    setUser(data.user);
    connectSocket(data.user.id);
    return data.user;
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('pulse_token');
    localStorage.removeItem('pulse_user');
    setUser(null);
    disconnectSocket();
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
