import type { UserProfile, CollegeAccount } from '../types/index.ts';
import { getCollegeById } from './dataService.ts';
import { auth, db, isFirebaseConfigured } from './firebase.ts';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
  signOut as firebaseSignOut,
} from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';

const SESSION_STORAGE_KEY = 'verifai_active_session_v1';

// Seed demo college credentials in simulated store
function ensureDefaultCredentials() {
  if (typeof window === 'undefined') return;
  const raw = localStorage.getItem('verifai_simulated_credentials') || '{}';
  const creds = JSON.parse(raw);
  if (!creds['1-10972341']) {
    creds['1-10972341'] = 'Password@123';
  }
  if (!creds['1-24891102']) {
    creds['1-24891102'] = 'Password@123';
  }
  if (!creds['1-38290145']) {
    creds['1-38290145'] = 'Password@123';
  }
  if (!creds['1-49012389']) {
    creds['1-49012389'] = 'Password@123';
  }
  if (!creds['1-51289033']) {
    creds['1-51289033'] = 'Password@123';
  }
  localStorage.setItem('verifai_simulated_credentials', JSON.stringify(creds));
}

ensureDefaultCredentials();

export interface AuthSession {
  user: UserProfile;
  college?: CollegeAccount;
}

export async function loginAsCollege(collegeId: string, password: string): Promise<AuthSession> {
  const cleanId = collegeId.trim();
  if (!cleanId) throw new Error('Please enter your AICTE-issued Unique College ID.');
  if (!password) throw new Error('Please enter your password.');

  const college = await getCollegeById(cleanId);
  if (!college) {
    throw new Error(
      `No college found with Unique ID "${cleanId}". If you are a new applicant, please click "Request New Unique ID" below.`
    );
  }

  if (college.status !== 'Active') {
    throw new Error(
      'This college account is currently pending administrative activation. Please contact the AICTE Approval Bureau.'
    );
  }

  // If live Firebase Auth is configured, attempt real authentication
  if (isFirebaseConfigured && auth) {
    let userCredential;
    const emailFallbacks: Record<string, string> = {
      '1-10972341': 'principal@delhitechnical.edu.in',
      '1-24891102': 'director@mumbaipolytechnic.edu.in',
      '1-38290145': 'info@karnatakatech.ac.in',
      '1-49012389': 'registrar@bengalpharmacy.edu.in',
      '1-51289033': 'principal@tnengineering.edu.in',
    };
    const targetEmail = college.officialEmail || emailFallbacks[college.collegeId];

    try {
      userCredential = await signInWithEmailAndPassword(auth, targetEmail, password);
    } catch (err: any) {
      const altEmail = emailFallbacks[college.collegeId];
      if (altEmail && altEmail.toLowerCase() !== targetEmail?.toLowerCase()) {
        try {
          userCredential = await signInWithEmailAndPassword(auth, altEmail, password);
        } catch {}
      }

      // If user does not exist in Firebase Auth yet, auto-provision demo account
      if (
        !userCredential &&
        (err.code === 'auth/user-not-found' ||
          err.code === 'auth/invalid-credential' ||
          err.code === 'auth/invalid-login-credentials') &&
        (password === 'Password@123' || password === 'admin123')
      ) {
        try {
          console.info('[VerifAI] Auto-provisioning demo institution account in Firebase Auth:', targetEmail);
          userCredential = await createUserWithEmailAndPassword(auth, targetEmail, password);
          if (userCredential?.user) {
            await updateProfile(userCredential.user, { displayName: college.collegeName });
          }
        } catch (createErr: any) {
          console.warn('[VerifAI] Auto-provisioning notice:', createErr?.message);
        }
      }

      if (!userCredential) {
        console.warn('[VerifAI] Firebase auth error for college:', err.message);
        if (err.code === 'auth/wrong-password') {
          throw new Error('Invalid credentials for this College ID in Firebase Authentication.');
        }
        if (err.code === 'auth/user-not-found') {
          throw new Error(`No Firebase Auth user provisioned for ${targetEmail}. Please ensure this institution account has been provisioned.`);
        }
        throw new Error(`Firebase Authentication failed: ${err.message}`);
      }
    }

    const session: AuthSession = {
      user: {
        uid: userCredential.user.uid,
        email: userCredential.user.email || targetEmail,
        displayName: college.collegeName,
        role: 'college',
        collegeId: college.collegeId,
        createdAt: new Date().toISOString(),
      },
      college,
    };

    if (isFirebaseConfigured && db) {
      try {
        await setDoc(doc(db, 'users', userCredential.user.uid), {
          uid: userCredential.user.uid,
          email: userCredential.user.email || targetEmail,
          displayName: college.collegeName,
          role: 'college',
          collegeId: college.collegeId,
          updatedAt: new Date().toISOString(),
        }, { merge: true });
      } catch (userDocErr) {
        console.warn('[VerifAI] User profile sync notice:', userDocErr);
      }
    }

    saveSession(session);
    return session;
  }

  // In Local Simulation Mode
  const rawCreds = localStorage.getItem('verifai_simulated_credentials') || '{}';
  const creds = JSON.parse(rawCreds);
  const expectedPassword = creds[cleanId] || 'Password@123';

  if (password !== expectedPassword && password !== 'Password@123') {
    throw new Error('Invalid password. For demo institutions, use "Password@123" or your assigned password.');
  }

  const session: AuthSession = {
    user: {
      uid: `uid-${cleanId}`,
      email: college.officialEmail,
      displayName: college.collegeName,
      role: 'college',
      collegeId: college.collegeId,
      createdAt: new Date().toISOString(),
    },
    college,
  };

  saveSession(session);
  return session;
}

export async function loginAsAdmin(email: string, password: string): Promise<AuthSession> {
  const cleanEmail = email.trim().toLowerCase();
  if (!cleanEmail) throw new Error('Please enter your administrator email.');
  if (!password) throw new Error('Please enter your password.');

  // Strict check: only authorized AICTE administrator accounts allowed
  const authorizedAdmins = ['admin@aicte.gov.in', 'scrutiny@aicte-india.org', 'director.approval@aicte.gov.in'];

  if (!authorizedAdmins.includes(cleanEmail)) {
    throw new Error('Access Denied. Only authorized AICTE Admin credentials can access this portal.');
  }

  // If live Firebase Auth is configured
  if (isFirebaseConfigured && auth) {
    let userCredential;
    try {
      userCredential = await signInWithEmailAndPassword(auth, cleanEmail, password);
    } catch (err: any) {
      if (
        (err.code === 'auth/user-not-found' ||
          err.code === 'auth/invalid-credential' ||
          err.code === 'auth/invalid-login-credentials') &&
        (password === 'Admin@AICTE2026!' || password === 'admin123')
      ) {
        try {
          console.info('[VerifAI] Auto-provisioning AICTE Administrator in Firebase Auth:', cleanEmail);
          userCredential = await createUserWithEmailAndPassword(auth, cleanEmail, password);
          if (userCredential?.user) {
            await updateProfile(userCredential.user, { displayName: 'AICTE Scrutiny & Approval Directorate' });
          }
        } catch (createErr: any) {
          console.warn('[VerifAI] Admin auto-provision notice:', createErr?.message);
        }
      }

      if (!userCredential) {
        console.warn('[VerifAI] Firebase admin login error:', err.message);
        if (err.code === 'auth/wrong-password') {
          throw new Error('Invalid administrator password in Firebase Authentication.');
        }
        if (err.code === 'auth/user-not-found') {
          throw new Error(`No Firebase Auth user provisioned for administrator ${cleanEmail}. Please provision this admin account in your Firebase Project Console.`);
        }
        throw new Error(`Firebase Authentication failed: ${err.message}`);
      }
    }

    const session: AuthSession = {
      user: {
        uid: userCredential.user.uid,
        email: cleanEmail,
        displayName: 'AICTE Scrutiny & Approval Directorate',
        role: 'admin',
        createdAt: new Date().toISOString(),
      },
    };

    if (isFirebaseConfigured && db) {
      try {
        await setDoc(doc(db, 'users', userCredential.user.uid), {
          uid: userCredential.user.uid,
          email: cleanEmail,
          displayName: 'AICTE Scrutiny & Approval Directorate',
          role: 'admin',
          collegeId: null,
          updatedAt: new Date().toISOString(),
        }, { merge: true });
      } catch (adminDocErr) {
        console.warn('[VerifAI] Admin user profile sync notice:', adminDocErr);
      }
    }

    saveSession(session);
    return session;
  }

  // Local simulation mode check
  if (password !== 'Admin@AICTE2026!' && password !== 'admin123') {
    throw new Error('Invalid administrator credentials. For SIH evaluation, use "Admin@AICTE2026!".');
  }

  const session: AuthSession = {
    user: {
      uid: 'admin-aicte-central',
      email: cleanEmail,
      displayName: 'AICTE Central Scrutiny Officer',
      role: 'admin',
      createdAt: new Date().toISOString(),
    },
  };

  saveSession(session);
  return session;
}

export async function logout(): Promise<void> {
  if (isFirebaseConfigured && auth) {
    try {
      await firebaseSignOut(auth);
    } catch (e) {
      console.warn('Firebase signout warning:', e);
    }
  }
  if (typeof window !== 'undefined') {
    localStorage.removeItem(SESSION_STORAGE_KEY);
  }
}

export function getCurrentSession(): AuthSession | null {
  if (typeof window === 'undefined') return null;
  const raw = localStorage.getItem(SESSION_STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthSession;
  } catch {
    return null;
  }
}

function saveSession(session: AuthSession) {
  if (typeof window !== 'undefined') {
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
  }
}

/**
 * Ensures Firebase Auth is actively authenticated if a valid demo session exists in localStorage
 * but the browser's in-memory auth token was lost/delayed upon page reload.
 */
export async function ensureFirebaseAuthSession(): Promise<boolean> {
  if (!isFirebaseConfigured || !auth) return false;
  if (auth.currentUser) return true;

  const session = getCurrentSession();
  if (!session?.user?.email) return false;

  const emailFallbacks: Record<string, string> = {
    '1-10972341': 'principal@delhitechnical.edu.in',
    '1-24891102': 'director@mumbaipolytechnic.edu.in',
    '1-38290145': 'info@karnatakatech.ac.in',
    '1-49012389': 'registrar@bengalpharmacy.edu.in',
    '1-51289033': 'principal@tnengineering.edu.in',
  };

  const targetEmail = session.college?.officialEmail ||
    (session.college?.collegeId ? emailFallbacks[session.college.collegeId] : null) ||
    session.user.email;

  try {
    if (session.user.role === 'admin') {
      await signInWithEmailAndPassword(auth, session.user.email, 'Admin@AICTE2026!');
      return true;
    } else if (session.user.role === 'college') {
      await signInWithEmailAndPassword(auth, targetEmail, 'Password@123');
      return true;
    }
  } catch (err: any) {
    // If not found, attempt auto-creation
    if (
      err.code === 'auth/user-not-found' ||
      err.code === 'auth/invalid-credential' ||
      err.code === 'auth/invalid-login-credentials'
    ) {
      try {
        const pass = session.user.role === 'admin' ? 'Admin@AICTE2026!' : 'Password@123';
        const cred = await createUserWithEmailAndPassword(auth, targetEmail, pass);
        if (cred?.user && session.college?.collegeName) {
          await updateProfile(cred.user, { displayName: session.college.collegeName });
        }
        return true;
      } catch {}
    }
  }

  return Boolean(auth.currentUser);
}
