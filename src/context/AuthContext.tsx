import React, { createContext, useContext, useState, useEffect } from 'react';
import { UserProfile, CollegeAccount } from '../types';
import {
  AuthSession,
  getCurrentSession,
  loginAsAdmin,
  loginAsCollege,
  logout as authLogout,
} from '../services/authService';
import { isFirebaseConfigured } from '../services/firebase';

export type ActiveView = 'landing' | 'college' | 'admin';

interface AuthContextType {
  user: UserProfile | null;
  college: CollegeAccount | null;
  isAuthenticated: boolean;
  isFirebaseLive: boolean;
  activeView: ActiveView;
  setActiveView: (view: ActiveView) => void;
  selectedCategory: 'EOA' | 'NEW_APPROVAL' | null;
  setSelectedCategory: (cat: 'EOA' | 'NEW_APPROVAL' | null) => void;
  pendingCategory: 'EOA' | 'NEW_APPROVAL' | null;
  setPendingCategory: (cat: 'EOA' | 'NEW_APPROVAL' | null) => void;
  loginCollege: (collegeId: string, pass: string) => Promise<void>;
  loginAdmin: (email: string, pass: string) => Promise<void>;
  logout: () => Promise<void>;
  toastMessage: string | null;
  toastType: 'success' | 'error' | 'info';
  showToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [college, setCollege] = useState<CollegeAccount | null>(null);
  const [activeView, setActiveView] = useState<ActiveView>('landing');
  const [selectedCategory, setSelectedCategory] = useState<'EOA' | 'NEW_APPROVAL' | null>(null);
  const [pendingCategory, setPendingCategory] = useState<'EOA' | 'NEW_APPROVAL' | null>(null);

  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [toastType, setToastType] = useState<'success' | 'error' | 'info'>('info');

  const showToast = (msg: string, type: 'success' | 'error' | 'info' = 'info') => {
    setToastMessage(msg);
    setToastType(type);
    setTimeout(() => {
      setToastMessage(null);
    }, 4500);
  };

  useEffect(() => {
    const session = getCurrentSession();
    if (session) {
      setUser(session.user);
      if (session.college) setCollege(session.college);
      if (session.user.role === 'admin') {
        setActiveView('admin');
      } else if (session.user.role === 'college') {
        setActiveView('college');
      }
    }
  }, []);

  const handleLoginCollege = async (collegeId: string, pass: string) => {
    const session = await loginAsCollege(collegeId, pass);
    setUser(session.user);
    setCollege(session.college || null);
    setActiveView('college');
    if (pendingCategory) {
      setSelectedCategory(pendingCategory);
      setPendingCategory(null);
    }
    showToast(`Welcome, ${session.college?.collegeName || 'College Administrator'}!`, 'success');
  };

  const handleLoginAdmin = async (email: string, pass: string) => {
    const session = await loginAsAdmin(email, pass);
    setUser(session.user);
    setCollege(null);
    setActiveView('admin');
    showToast('AICTE Admin Portal authenticated successfully.', 'success');
  };

  const handleLogout = async () => {
    await authLogout();
    setUser(null);
    setCollege(null);
    setActiveView('landing');
    setSelectedCategory(null);
    setPendingCategory(null);
    showToast('You have been signed out safely.', 'info');
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        college,
        isAuthenticated: !!user,
        isFirebaseLive: isFirebaseConfigured,
        activeView,
        setActiveView,
        selectedCategory,
        setSelectedCategory,
        pendingCategory,
        setPendingCategory,
        loginCollege: handleLoginCollege,
        loginAdmin: handleLoginAdmin,
        logout: handleLogout,
        toastMessage,
        toastType,
        showToast,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
