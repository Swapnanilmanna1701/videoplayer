import { createContext } from 'react';

/**
 * Shared AuthContext – imported by both AuthProvider and useAuth.
 */
export const AuthContext = createContext(null);
