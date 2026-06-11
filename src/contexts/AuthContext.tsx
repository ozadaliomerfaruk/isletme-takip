import { createContext, useContext, useLayoutEffect, ReactNode } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { useAuth } from '@/hooks/useAuth';
import { Isletme } from '@/types/database';
import type { Permissions, UserRole } from '@/types/multiUser';
import { setEventContext } from '@/lib/appEvents';

interface AuthContextType {
  session: Session | null;
  user: User | null;
  isletme: Isletme | null;
  loading: boolean;
  initialized: boolean;
  isletmeLoading: boolean;
  needsPasswordReset: boolean;
  // Multi-user fields
  ownIsletme: Isletme | null;
  isOwner: boolean;
  isSharedMode: boolean;
  currentPermissions: Permissions | null;
  currentUserRole: UserRole | 'owner' | null;
  // Auth methods
  signIn: (email: string, password: string) => Promise<{ user: User; session: Session }>;
  signUp: (email: string, password: string, isletmeName: string) => Promise<{ user: User; isletme: Isletme }>;
  signOut: () => Promise<void>;
  deleteAccount: () => Promise<void>;
  cancelAccountDeletion: () => Promise<void>;
  refreshIsletme: () => Promise<void>;
  signInWithApple: () => Promise<any>;
  signInWithGoogle: (idToken: string) => Promise<any>;
  isAppleSignInAvailable: boolean;
  clearPasswordReset: () => void;
  triggerPasswordReset: () => void;
  changePassword: (newPassword: string) => Promise<void>;
  // Multi-user methods
  switchToSharedIsletme: (isletme: Isletme, permissions: Permissions, role: UserRole) => Promise<void>;
  switchToOwnIsletme: () => void;
  refreshPermissions: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const auth = useAuth();

  // Olay izleme bağlamını güncel tut (logEvent her yerden bunu kullanır).
  // useLayoutEffect ŞART: passive effect'ler çocuktan üst bileşene koşar; useEffect
  // kullanılırsa _layout'taki screen_view effect'i bağlam set edilmeden önce çalışır
  // ve oturumun ilk screen_view olayı sessizce düşer (iOS soğuk açılışta deterministik).
  useLayoutEffect(() => {
    setEventContext(auth.user?.id ?? null, auth.isletme?.id ?? null);
  }, [auth.user?.id, auth.isletme?.id]);

  return <AuthContext.Provider value={auth}>{children}</AuthContext.Provider>;
}

export function useAuthContext() {
  const context = useContext(AuthContext);

  if (context === undefined) {
    throw new Error('useAuthContext must be used within an AuthProvider');
  }

  return context;
}
