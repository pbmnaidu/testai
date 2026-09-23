import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  auth,
  signInWithGoogle,
  signInWithCredentials,
  registerUserProfile,
  signOutCurrentUser,
  updateUserRole,
  getStoredUserProfile,
  DESIGNATED_OFFICER_EMAIL,
  OFFICIAL_DEMO_ACCOUNTS,
} from '../services/firebase';
import { UserProfile, UserRole, RegistrationRequest } from '../types';
import {
  fetchRegistrationRequests,
  approveRegistrationRequest,
  rejectRegistrationRequest,
} from '../services/firebase';
import { onAuthStateChanged } from 'firebase/auth';

interface AuthContextType {
  user: UserProfile | null;
  role: UserRole;
  isLoading: boolean;
  loginWithGoogle: (targetRole?: UserRole) => Promise<UserProfile>;
  loginWithCredentials: (email: string, password?: string, role?: UserRole) => Promise<UserProfile>;
  loginAsDemo: (role: UserRole) => Promise<UserProfile>;
  register: (data: {
    email: string;
    displayName: string;
    role: UserRole;
    password?: string;
    organization?: string;
    phone?: string;
    state?: string;
    constituency?: string;
  }) => Promise<UserProfile>;
  logout: () => Promise<void>;
  switchRole: (role: UserRole) => Promise<void>;
  isOfficer: boolean;
  isCitizen: boolean;
  isContractor: boolean;
  isMaterialContractor: boolean;
  isSystemAdmin: boolean;
  designatedOfficerEmail: string;
  getPendingApprovals: () => Promise<RegistrationRequest[]>;
  approveContractorVendor: (requestId: string, notes?: string) => Promise<RegistrationRequest>;
  rejectContractorVendor: (requestId: string, reason?: string) => Promise<RegistrationRequest>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserProfile | null>(() => getStoredUserProfile());
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    // Failsafe timeout: never hang on splash screen for more than 1200ms
    const timer = setTimeout(() => {
      setIsLoading(false);
    }, 1200);

    // Listen for Firebase Auth state transitions
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      clearTimeout(timer);
      if (firebaseUser) {
        const stored = getStoredUserProfile();
        if (stored && stored.uid === firebaseUser.uid) {
          setUser(stored);
        } else {
          const isDesignated = (firebaseUser.email || '').toLowerCase() === DESIGNATED_OFFICER_EMAIL.toLowerCase();
          const resolvedRole: UserRole = isDesignated ? 'officer' : (stored?.role || 'citizen');
          const profile: UserProfile = {
            uid: firebaseUser.uid,
            email: firebaseUser.email,
            displayName: firebaseUser.displayName || (firebaseUser.email?.split('@')[0] ?? 'Authorized User'),
            photoURL: firebaseUser.photoURL,
            role: resolvedRole,
            designation: isDesignated
              ? 'Senior Implementing & Inspection Officer / Nodal Admin'
              : stored?.designation || (resolvedRole === 'citizen' ? 'Verified Citizen Auditor' : 'Authorized User'),
            organization: isDesignated ? 'Ministry of Statistics & Programme Implementation (MPLADS)' : stored?.organization || '',
            createdAt: stored?.createdAt || new Date().toISOString(),
            lastLoginAt: new Date().toISOString(),
            isSystemAdmin: isDesignated,
          };
          setUser(profile);
          try {
            localStorage.setItem('mplads_auth_profile', JSON.stringify(profile));
          } catch {}
        }
      } else {
        // Keep stored profile if anonymous/offline/credentials session
        const stored = getStoredUserProfile();
        setUser(stored);
      }
      setIsLoading(false);
    });

    return () => {
      clearTimeout(timer);
      unsubscribe();
    };
  }, []);

  const handleLoginWithGoogle = async (targetRole?: UserRole): Promise<UserProfile> => {
    setIsLoading(true);
    try {
      const profile = await signInWithGoogle(targetRole);
      setUser(profile);
      return profile;
    } finally {
      setIsLoading(false);
    }
  };

  const handleLoginWithCredentials = async (
    email: string,
    password = '',
    role?: UserRole
  ): Promise<UserProfile> => {
    setIsLoading(true);
    try {
      const profile = await signInWithCredentials(email, password, role);
      setUser(profile);
      return profile;
    } finally {
      setIsLoading(false);
    }
  };

  const handleLoginAsDemo = async (targetRole: UserRole): Promise<UserProfile> => {
    setIsLoading(true);
    try {
      const demo = OFFICIAL_DEMO_ACCOUNTS[targetRole];
      const profile = await signInWithCredentials(demo.email || '', '', targetRole);
      setUser(profile);
      return profile;
    } finally {
      setIsLoading(false);
    }
  };

  const handleRegister = async (data: {
    email: string;
    displayName: string;
    role: UserRole;
    password?: string;
    organization?: string;
    phone?: string;
    state?: string;
    constituency?: string;
  }): Promise<UserProfile> => {
    setIsLoading(true);
    try {
      const profile = await registerUserProfile(data);
      // Only establish active login session if APPROVED (Citizen or designated Officer)
      if (profile.approvalStatus === 'APPROVED') {
        setUser(profile);
      }
      return profile;
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = async (): Promise<void> => {
    setIsLoading(true);
    try {
      await signOutCurrentUser();
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSwitchRole = async (newRole: UserRole): Promise<void> => {
    if (!user) return;
    if (newRole === 'officer' && (user.email || '').toLowerCase() !== DESIGNATED_OFFICER_EMAIL.toLowerCase()) {
      throw new Error(
        `Implementing Officer access is strictly restricted to designated administrative email: ${DESIGNATED_OFFICER_EMAIL}`
      );
    }
    const updated = await updateUserRole(user.uid, newRole);
    if (updated) {
      setUser(updated);
    }
  };

  const currentRole: UserRole = user?.role || 'citizen';
  const isOfficer = (user?.email || '').toLowerCase() === DESIGNATED_OFFICER_EMAIL.toLowerCase() && currentRole === 'officer';
  const isCitizen = currentRole === 'citizen';
  const isContractor = currentRole === 'contractor';
  const isMaterialContractor = currentRole === 'material_contractor';
  const isSystemAdmin = Boolean(user?.isSystemAdmin || (user?.email || '').toLowerCase() === DESIGNATED_OFFICER_EMAIL.toLowerCase());

  return (
    <AuthContext.Provider
      value={{
        user,
        role: currentRole,
        isLoading,
        loginWithGoogle: handleLoginWithGoogle,
        loginWithCredentials: handleLoginWithCredentials,
        loginAsDemo: handleLoginAsDemo,
        register: handleRegister,
        logout: handleLogout,
        switchRole: handleSwitchRole,
        isOfficer,
        isCitizen,
        isContractor,
        isMaterialContractor,
        isSystemAdmin,
        designatedOfficerEmail: DESIGNATED_OFFICER_EMAIL,
        getPendingApprovals: fetchRegistrationRequests,
        approveContractorVendor: approveRegistrationRequest,
        rejectContractorVendor: rejectRegistrationRequest,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
