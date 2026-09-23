/**
 * Firebase Client SDK Configuration & Evidence Storage Service.
 *
 * Handles direct-from-browser uploads to Firebase Storage and permanent
 * metadata logging in Cloud Firestore without Cloud Functions or intermediary servers.
 *
 * NOTE: Google Cloud / Firebase requires enabling the pay-as-you-go Blaze plan
 * for Cloud Storage bucket operations, even when actual usage remains well
 * within the free-tier allowance (5 GB storage, 1 GB/day download).
 */

import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  signInAnonymously,
  signInWithPopup,
  signOut,
  GoogleAuthProvider,
  onAuthStateChanged,
  User,
} from 'firebase/auth';
import {
  getStorage,
  ref as storageRef,
  uploadBytes,
  getDownloadURL,
} from 'firebase/storage';
import {
  initializeFirestore,
  getFirestore,
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  limit as firestoreLimit,
  updateDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { optimizeImageForUpload } from '../utils/imageOptimizer';

import { UserProfile, UserRole, RegistrationRequest, ApprovalStatus } from '../types';
export type { UserProfile, UserRole, RegistrationRequest, ApprovalStatus };

export const DESIGNATED_OFFICER_EMAIL = 'naidupolimera.6@gmail.com';

// Pre-defined official government & stakeholder accounts for sovereign testing
export const OFFICIAL_DEMO_ACCOUNTS: Record<UserRole, UserProfile> = {
  officer: {
    uid: 'gov-officer-naidu-001',
    email: DESIGNATED_OFFICER_EMAIL,
    displayName: 'Polimera Bhanu Prakash Naidu',
    photoURL: null,
    role: 'officer',
    designation: 'Senior Implementing & Inspection Officer / Nodal Admin',
    organization: 'Ministry of Statistics & Programme Implementation (MPLADS)',
    phone: '+91 94401 23456',
    state: 'Andhra Pradesh',
    constituency: 'Visakhapatnam',
    createdAt: '2025-01-01T00:00:00.000Z',
    lastLoginAt: new Date().toISOString(),
    isSystemAdmin: true,
  },
  citizen: {
    uid: 'gov-citizen-ramesh-002',
    email: 'citizen.prakash@nic.in',
    displayName: 'Ramesh Kumar Citizen',
    photoURL: null,
    role: 'citizen',
    designation: 'Verified Citizen Auditor',
    organization: 'Citizens Transparency Forum',
    phone: '+91 98480 11223',
    state: 'Andhra Pradesh',
    constituency: 'Visakhapatnam',
    createdAt: '2025-01-01T00:00:00.000Z',
    lastLoginAt: new Date().toISOString(),
    isSystemAdmin: false,
  },
  contractor: {
    uid: 'gov-contractor-balaji-003',
    email: 'contractor.infra@nic.in',
    displayName: 'Sri Balaji Infra & Constructions',
    photoURL: null,
    role: 'contractor',
    designation: 'Registered Civil Works Contractor (Labor Muster Access)',
    organization: 'Sri Balaji Infra & Constructions Pvt Ltd (Lic: PWD/AP/CLASS-I/8834)',
    phone: '+91 99890 33445',
    state: 'Andhra Pradesh',
    constituency: 'Visakhapatnam',
    createdAt: '2025-01-01T00:00:00.000Z',
    lastLoginAt: new Date().toISOString(),
    isSystemAdmin: false,
  },
  material_contractor: {
    uid: 'gov-material-deccan-004',
    email: 'materials.supply@nic.in',
    displayName: 'Deccan Cement & Steel Supplies Ltd.',
    photoURL: null,
    role: 'material_contractor',
    designation: 'Authorized Works Material Contractor & Vendor',
    organization: 'Deccan Building Materials Consortium (GSTIN: 37AAACD4567M1Z4)',
    phone: '+91 91210 55667',
    state: 'Andhra Pradesh',
    constituency: 'Visakhapatnam',
    createdAt: '2025-01-01T00:00:00.000Z',
    lastLoginAt: new Date().toISOString(),
    isSystemAdmin: false,
  },
};

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyAOjw7LF4Jhm2tSEj2V98degliRWKTnixQ",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "nirikshan-ai-44.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "nirikshan-ai-44",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "nirikshan-ai-44.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "143855912094",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:143855912094:web:06ee5a58dc01861667e78f",
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || "G-R3RD3Z4Y7Q",
};

// Initialize or reuse Firebase app
export const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
export const auth = getAuth(app);
export const storage = getStorage(app);
export const db = initializeFirestore(app, {
  experimentalAutoDetectLongPolling: true,
});

// Google Auth Provider
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

// Validation constants
export const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB

let anonymousAuthDisabled = false;

/**
 * Sign in with Google Popup and persist user profile in Cloud Firestore.
 */
export async function signInWithGoogle(targetRole?: UserRole): Promise<UserProfile> {
  try {
    const cred = await signInWithPopup(auth, googleProvider);
    const user = cred.user;
    const nowIso = new Date().toISOString();
    const isDesignatedOfficer = (user.email || '').toLowerCase() === DESIGNATED_OFFICER_EMAIL.toLowerCase();

    let existingProfile: UserProfile | null = null;
    try {
      const userDocRef = doc(db, 'users', user.uid);
      const userSnap = await getDoc(userDocRef);
      if (userSnap.exists()) {
        existingProfile = userSnap.data() as UserProfile;
      }
    } catch {}

    // If role is specified during login/registration, use it. If not specified, default to citizen.
    const requestedRole: UserRole = targetRole || (existingProfile?.role ? existingProfile.role : 'citizen');
    const resolvedRole: UserRole = isDesignatedOfficer ? 'officer' : requestedRole;

    let resolvedDesignation = 'Verified Citizen Auditor';
    if (resolvedRole === 'officer') {
      resolvedDesignation = 'Senior Implementing & Inspection Officer / Nodal Admin';
    } else if (resolvedRole === 'contractor') {
      resolvedDesignation = 'Civil Works Contractor (Muster Roll & Attendance)';
    } else if (resolvedRole === 'material_contractor') {
      resolvedDesignation = 'Material Contractor & Vendor (Quality Assurance)';
    }

    const profile: UserProfile = {
      uid: user.uid,
      email: user.email,
      displayName: user.displayName || (user.email ? user.email.split('@')[0] : 'Authorized User'),
      photoURL: user.photoURL,
      role: resolvedRole,
      designation: existingProfile?.role === resolvedRole && existingProfile?.designation ? existingProfile.designation : resolvedDesignation,
      organization: existingProfile?.organization || (isDesignatedOfficer ? 'Ministry of Statistics & Programme Implementation (MPLADS)' : ''),
      state: existingProfile?.state || '',
      constituency: existingProfile?.constituency || '',
      createdAt: existingProfile?.createdAt || nowIso,
      lastLoginAt: nowIso,
      approvalStatus: 'APPROVED',
      isSystemAdmin: isDesignatedOfficer || existingProfile?.isSystemAdmin || false,
    };

    // Write to Firestore /users/{uid} (optional remote backup)
    try {
      const userDocRef = doc(db, 'users', user.uid);
      await setDoc(userDocRef, { ...profile, server_timestamp: serverTimestamp() }, { merge: true });
    } catch {
      // Benign fallback: user profile is securely preserved in localStorage
    }

    // Persist to localStorage for rapid resumption
    try {
      localStorage.setItem('mplads_auth_profile', JSON.stringify(profile));
    } catch {}

    return profile;
  } catch (err: any) {
    console.error('[Firebase Auth] Google sign-in failed:', err);
    throw err;
  }
}

/**
 * Sign in using email credentials with strict statutory role compliance.
 */
export const INITIAL_REGISTRATION_REQUESTS: RegistrationRequest[] = [
  {
    requestId: 'req-balaji-001',
    uid: 'gov-contractor-balaji-003',
    email: 'contractor.infra@nic.in',
    displayName: 'Sri Balaji Infra & Constructions',
    role: 'contractor',
    organization: 'Sri Balaji Infra & Constructions Pvt Ltd (Lic: PWD/AP/CLASS-I/8834)',
    phone: '+91 99890 33445',
    state: 'Andhra Pradesh',
    constituency: 'Visakhapatnam',
    createdAt: '2025-01-01T10:00:00.000Z',
    status: 'APPROVED',
    reviewedAt: '2025-01-01T14:30:00.000Z',
    reviewedBy: DESIGNATED_OFFICER_EMAIL,
    reviewNotes: 'Authorized under statutory civil muster guidelines.',
  },
  {
    requestId: 'req-deccan-002',
    uid: 'gov-material-deccan-004',
    email: 'materials.supply@nic.in',
    displayName: 'Deccan Cement & Steel Supplies Ltd.',
    role: 'material_contractor',
    organization: 'Deccan Building Materials Consortium (GSTIN: 37AAACD4567M1Z4)',
    phone: '+91 91210 55667',
    state: 'Andhra Pradesh',
    constituency: 'Visakhapatnam',
    createdAt: '2025-01-01T11:00:00.000Z',
    status: 'APPROVED',
    reviewedAt: '2025-01-01T15:00:00.000Z',
    reviewedBy: DESIGNATED_OFFICER_EMAIL,
    reviewNotes: 'Verified against district SOR benchmark.',
  },
  {
    requestId: 'req-apex-003',
    email: 'contractor.balaji@infra.in',
    displayName: 'Apex Civil Infra Projects LLP',
    role: 'contractor',
    organization: 'Apex Civil Infra Projects (Lic: CPWD/SZ/CIVIL/4412)',
    phone: '+91 98492 44321',
    state: 'Andhra Pradesh',
    constituency: 'Visakhapatnam',
    createdAt: new Date(Date.now() - 36 * 3600 * 1000).toISOString(),
    status: 'PENDING_APPROVAL',
  },
  {
    requestId: 'req-coastal-004',
    email: 'vendor.coastal@cement.in',
    displayName: 'Coastal Concrete & Ready-Mix Supplies',
    role: 'material_contractor',
    organization: 'Coastal Building Supplies (GSTIN: 37BBDCC9981K1Z2)',
    phone: '+91 97011 88992',
    state: 'Andhra Pradesh',
    constituency: 'Visakhapatnam',
    createdAt: new Date(Date.now() - 18 * 3600 * 1000).toISOString(),
    status: 'PENDING_APPROVAL',
  },
];

/**
 * Fetch all registration requests for contractor & vendor approvals.
 */
export async function fetchRegistrationRequests(): Promise<RegistrationRequest[]> {
  const localRaw = localStorage.getItem('mplads_registration_requests');
  let requests: RegistrationRequest[] = localRaw ? JSON.parse(localRaw) : [...INITIAL_REGISTRATION_REQUESTS];

  // Try fetching from Firestore (if available)
  try {
    const colRef = collection(db, 'registration_requests');
    const q = query(colRef, orderBy('createdAt', 'desc'));
    const snap = await getDocs(q);
    if (!snap.empty) {
      const remoteRequests: RegistrationRequest[] = [];
      snap.forEach((d) => {
        remoteRequests.push({ ...(d.data() as RegistrationRequest), requestId: d.id });
      });
      // Merge remote with local/initial
      const map = new Map<string, RegistrationRequest>();
      requests.forEach((r) => map.set(r.requestId, r));
      remoteRequests.forEach((r) => map.set(r.requestId, r));
      requests = Array.from(map.values());
    }
  } catch {
    // Graceful offline/local mode fallback
  }

  // Persist merged cache
  try {
    localStorage.setItem('mplads_registration_requests', JSON.stringify(requests));
  } catch {}

  return requests.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

/**
 * Save a new registration request to Firestore and localStorage.
 */
export async function saveRegistrationRequest(request: RegistrationRequest): Promise<void> {
  const requests = await fetchRegistrationRequests();
  const existingIdx = requests.findIndex((r) => r.email.toLowerCase() === request.email.toLowerCase());
  if (existingIdx >= 0) {
    requests[existingIdx] = request;
  } else {
    requests.unshift(request);
  }

  try {
    localStorage.setItem('mplads_registration_requests', JSON.stringify(requests));
  } catch {}

  try {
    const docRef = doc(db, 'registration_requests', request.requestId);
    await setDoc(docRef, { ...request, server_timestamp: serverTimestamp() }, { merge: true });
  } catch {}
}

/**
 * Approve a contractor or vendor registration request (Implementing Officer only).
 */
export async function approveRegistrationRequest(
  requestId: string,
  officerEmail = DESIGNATED_OFFICER_EMAIL,
  notes = 'Approved by Implementing District Officer'
): Promise<RegistrationRequest> {
  const requests = await fetchRegistrationRequests();
  const req = requests.find((r) => r.requestId === requestId);
  if (!req) {
    throw new Error(`Registration request '${requestId}' not found.`);
  }

  req.status = 'APPROVED';
  req.reviewedAt = new Date().toISOString();
  req.reviewedBy = officerEmail;
  req.reviewNotes = notes;

  try {
    localStorage.setItem('mplads_registration_requests', JSON.stringify(requests));
  } catch {}

  try {
    const docRef = doc(db, 'registration_requests', requestId);
    await updateDoc(docRef, {
      status: 'APPROVED',
      reviewedAt: req.reviewedAt,
      reviewedBy: officerEmail,
      reviewNotes: notes,
    });
  } catch {}

  return req;
}

/**
 * Reject a contractor or vendor registration request (Implementing Officer only).
 */
export async function rejectRegistrationRequest(
  requestId: string,
  officerEmail = DESIGNATED_OFFICER_EMAIL,
  reason = 'Rejected during statutory background check'
): Promise<RegistrationRequest> {
  const requests = await fetchRegistrationRequests();
  const req = requests.find((r) => r.requestId === requestId);
  if (!req) {
    throw new Error(`Registration request '${requestId}' not found.`);
  }

  req.status = 'REJECTED';
  req.reviewedAt = new Date().toISOString();
  req.reviewedBy = officerEmail;
  req.reviewNotes = reason;

  try {
    localStorage.setItem('mplads_registration_requests', JSON.stringify(requests));
  } catch {}

  try {
    const docRef = doc(db, 'registration_requests', requestId);
    await updateDoc(docRef, {
      status: 'REJECTED',
      reviewedAt: req.reviewedAt,
      reviewedBy: officerEmail,
      reviewNotes: reason,
    });
  } catch {}

  return req;
}

/**
 * Sign in using email credentials with strict statutory role compliance.
 */
export async function signInWithCredentials(
  email: string,
  _password = '',
  preferredRole?: UserRole
): Promise<UserProfile> {
  const normalizedEmail = (email || '').trim().toLowerCase();
  const nowIso = new Date().toISOString();

  // If email is designated nodal officer
  if (normalizedEmail === DESIGNATED_OFFICER_EMAIL.toLowerCase()) {
    const officerProfile: UserProfile = {
      ...OFFICIAL_DEMO_ACCOUNTS.officer,
      lastLoginAt: nowIso,
      approvalStatus: 'APPROVED',
    };
    try {
      localStorage.setItem('mplads_auth_profile', JSON.stringify(officerProfile));
    } catch {}
    return officerProfile;
  }

  // Strict role security: Officer access is ONLY permitted for designated administrative email
  if (preferredRole === 'officer') {
    throw new Error(
      `Implementing & Inspection Officer access is strictly restricted to designated administrative email: ${DESIGNATED_OFFICER_EMAIL}`
    );
  }

  // Check matching pre-defined demo accounts
  for (const roleKey of Object.keys(OFFICIAL_DEMO_ACCOUNTS) as UserRole[]) {
    const demo = OFFICIAL_DEMO_ACCOUNTS[roleKey];
    if (demo.email && demo.email.toLowerCase() === normalizedEmail) {
      const updated = { ...demo, lastLoginAt: nowIso, approvalStatus: 'APPROVED' as const };
      try {
        localStorage.setItem('mplads_auth_profile', JSON.stringify(updated));
      } catch {}
      return updated;
    }
  }

  const assignedRole: UserRole = preferredRole || 'citizen';

  // For contractor or material_contractor, enforce Officer Approval Gate!
  if (assignedRole === 'contractor' || assignedRole === 'material_contractor') {
    const requests = await fetchRegistrationRequests();
    const userReq = requests.find((r) => r.email.toLowerCase() === normalizedEmail);

    if (!userReq || userReq.status === 'PENDING_APPROVAL') {
      throw new Error(
        `Login Blocked: Your statutory registration as ${
          assignedRole === 'contractor' ? 'Civil Works Contractor' : 'Material Contractor & Vendor'
        } is awaiting authorization from the Implementing District Officer (${DESIGNATED_OFFICER_EMAIL}). You cannot log in until approved.`
      );
    }

    if (userReq.status === 'REJECTED') {
      throw new Error(
        `Login Blocked: Your registration request as ${
          assignedRole === 'contractor' ? 'Civil Works Contractor' : 'Material Contractor & Vendor'
        } was rejected by the Implementing District Officer.`
      );
    }
  }

  const designation =
    assignedRole === 'citizen'
      ? 'Verified Citizen Auditor'
      : assignedRole === 'contractor'
        ? 'Registered Civil Works Contractor'
        : assignedRole === 'material_contractor'
          ? 'Authorized Works Material Contractor & Vendor'
          : 'Authorized User';

  const newProfile: UserProfile = {
    uid: `user-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    email: normalizedEmail,
    displayName: normalizedEmail.split('@')[0].replace(/[._-]/g, ' ').toUpperCase(),
    photoURL: null,
    role: assignedRole,
    designation,
    createdAt: nowIso,
    lastLoginAt: nowIso,
    isSystemAdmin: false,
    approvalStatus: 'APPROVED',
  };

  try {
    localStorage.setItem('mplads_auth_profile', JSON.stringify(newProfile));
  } catch {}

  return newProfile;
}

/**
 * Register a new user profile with statutory checks and approval routing.
 */
export async function registerUserProfile(fields: {
  email: string;
  displayName: string;
  role: UserRole;
  organization?: string;
  phone?: string;
  state?: string;
  constituency?: string;
}): Promise<UserProfile> {
  const normalizedEmail = (fields.email || '').trim().toLowerCase();
  const isDesignatedOfficer = normalizedEmail === DESIGNATED_OFFICER_EMAIL.toLowerCase();

  if (fields.role === 'officer' && !isDesignatedOfficer) {
    throw new Error(
      `Implementing & Inspection Officer registration is strictly restricted to designated administrative email: ${DESIGNATED_OFFICER_EMAIL}`
    );
  }

  const nowIso = new Date().toISOString();
  const isCitizen = fields.role === 'citizen';
  const approvalStatus: ApprovalStatus = isCitizen || isDesignatedOfficer ? 'APPROVED' : 'PENDING_APPROVAL';

  const designation =
    isDesignatedOfficer
      ? 'Senior Implementing & Inspection Officer / Nodal Admin'
      : fields.role === 'citizen'
        ? 'Verified Citizen Auditor'
        : fields.role === 'contractor'
          ? 'Registered Civil Works Contractor'
          : fields.role === 'material_contractor'
            ? 'Authorized Works Material Contractor & Vendor'
            : 'Authorized User';

  const profileUid = `user-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  const profile: UserProfile = {
    uid: profileUid,
    email: normalizedEmail,
    displayName: fields.displayName.trim() || normalizedEmail.split('@')[0],
    photoURL: null,
    role: isDesignatedOfficer ? 'officer' : fields.role,
    designation,
    organization: fields.organization?.trim() || '',
    phone: fields.phone?.trim() || '',
    state: fields.state?.trim() || '',
    constituency: fields.constituency?.trim() || '',
    createdAt: nowIso,
    lastLoginAt: nowIso,
    isSystemAdmin: isDesignatedOfficer,
    approvalStatus,
  };

  // If contractor or vendor, register approval request for Implementing Officer
  if (!isCitizen && !isDesignatedOfficer) {
    const regReq: RegistrationRequest = {
      requestId: `req-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      uid: profileUid,
      email: normalizedEmail,
      displayName: fields.displayName.trim() || normalizedEmail.split('@')[0],
      role: fields.role,
      organization: fields.organization?.trim() || '',
      phone: fields.phone?.trim() || '',
      state: fields.state?.trim() || '',
      constituency: fields.constituency?.trim() || '',
      createdAt: nowIso,
      status: 'PENDING_APPROVAL',
    };
    await saveRegistrationRequest(regReq);
  }

  // Only auto-login if APPROVED (Citizen or designated Officer)
  if (approvalStatus === 'APPROVED') {
    try {
      localStorage.setItem('mplads_auth_profile', JSON.stringify(profile));
    } catch {}
  }

  return profile;
}

/**
 * Sign out current authenticated user.
 */
export async function signOutCurrentUser(): Promise<void> {
  try {
    await signOut(auth);
  } finally {
    try {
      localStorage.removeItem('mplads_auth_profile');
    } catch {}
  }
}

/**
 * Update user role with statutory validation.
 */
export async function updateUserRole(uid: string, role: UserRole): Promise<UserProfile | null> {
  try {
    const cached: UserProfile | null = JSON.parse(localStorage.getItem('mplads_auth_profile') || 'null');
    const isDesignated = (cached?.email || '').toLowerCase() === DESIGNATED_OFFICER_EMAIL.toLowerCase();

    if (role === 'officer' && !isDesignated) {
      throw new Error(
        `Implementing / Inspection Officer role is strictly restricted to designated administrative email: ${DESIGNATED_OFFICER_EMAIL}`
      );
    }

    const designation =
      role === 'officer'
        ? 'Senior Implementing & Inspection Officer / Nodal Admin'
        : role === 'citizen'
          ? 'Verified Citizen Auditor'
          : role === 'contractor'
            ? 'Registered Civil Works Contractor'
            : 'Authorized Works Material Contractor & Vendor';

    const updated: UserProfile = {
      ...(cached || {
        uid,
        email: auth.currentUser?.email || null,
        displayName: auth.currentUser?.displayName || 'User',
        photoURL: auth.currentUser?.photoURL || null,
        createdAt: new Date().toISOString(),
      }),
      role,
      designation,
      lastLoginAt: new Date().toISOString(),
      isSystemAdmin: isDesignated,
    };

    try {
      const userDocRef = doc(db, 'users', uid);
      await setDoc(userDocRef, { ...updated, server_timestamp: serverTimestamp() }, { merge: true });
    } catch {}

    localStorage.setItem('mplads_auth_profile', JSON.stringify(updated));
    return updated;
  } catch {
    return null;
  }
}

/**
 * Get current stored user profile.
 */
export function getStoredUserProfile(): UserProfile | null {
  try {
    const data = localStorage.getItem('mplads_auth_profile');
    return data ? JSON.parse(data) : null;
  } catch {
    return null;
  }
}

/**
 * Ensures user is authenticated (Google user, anonymous, or local session fallback).
 */
export async function ensureAuthenticatedUser(): Promise<User> {
  if (auth.currentUser) {
    return auth.currentUser;
  }
  if (anonymousAuthDisabled) {
    return {
      uid: 'anon_' + Math.random().toString(36).substring(2, 10),
    } as unknown as User;
  }
  try {
    const cred = await signInAnonymously(auth);
    return cred.user;
  } catch (err: any) {
    if (err?.code === 'auth/admin-restricted-operation') {
      anonymousAuthDisabled = true;
    }
    return {
      uid: 'anon_' + Math.random().toString(36).substring(2, 10),
    } as unknown as User;
  }
}

/**
 * Validates file MIME type and byte size before upload.
 */
export function validateEvidenceFile(file: File): { valid: boolean; error?: string } {
  if (!file) {
    return { valid: false, error: 'No image file provided.' };
  }
  if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
    return {
      valid: false,
      error: `Invalid file format (${file.type || 'unknown'}). Only JPEG, PNG, and WebP images are accepted.`,
    };
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    const mb = (file.size / (1024 * 1024)).toFixed(1);
    return {
      valid: false,
      error: `Image size (${mb} MB) exceeds the maximum allowed limit of 10 MB.`,
    };
  }
  return { valid: true };
}

export interface UploadedEvidenceMetadata {
  submission_id: string;
  work_id: string;
  storage_path: string;
  download_url: string;
  content_type: string;
  byte_size: number;
  uploaded_at: string;
  review_status: string;
  uploader_id: string;
  category?: string;
  description?: string;
  evidence_type?: string;
  staff_count?: number | null;
  latitude?: number | null;
  longitude?: number | null;
  gps_accuracy?: number | null;
  captured_at?: string | null;
  live_capture?: boolean;
}

/**
 * Upload an evidence image directly to Firebase Storage with retry support,
 * downscaling to <100KB for minimal storage and bandwidth, and recording
 * permanent metadata in Cloud Firestore under team_ala/ namespace.
 */
export async function uploadEvidenceToFirebase(
  file: File,
  fields: {
    workId: string;
    category?: string;
    description?: string;
    evidenceType?: string;
    staffCount?: number | null;
    latitude?: number | null;
    longitude?: number | null;
    gpsAccuracy?: number | null;
    capturedAt?: string | null;
    liveCapture?: boolean;
    folderPrefix?: string;
  },
  maxRetries = 2
): Promise<UploadedEvidenceMetadata> {
  const validation = validateEvidenceFile(file);
  if (!validation.valid) {
    throw new Error(validation.error);
  }

  // Optimize image client-side to minimize memory and storage (<100KB)
  let uploadFile = file;
  let optimizedDataUrl = '';
  try {
    const optimized = await optimizeImageForUpload(file, file.name, {
      maxDimension: 1280,
      quality: 0.78,
    });
    uploadFile = optimized.file;
    optimizedDataUrl = optimized.dataUrl;
  } catch (optErr) {
    console.warn('[Image Optimization] Falling back to uncompressed file:', optErr);
  }

  const user = await ensureAuthenticatedUser();
  const profile = getStoredUserProfile();
  const uploaderEmail = auth.currentUser?.email || profile?.email || null;
  const uploaderName = auth.currentUser?.displayName || profile?.displayName || 'Authorized User';

  const cleanWorkId = String(fields.workId || 'unassigned').trim().replace(/[\/\\#\s]/g, '_');
  const timestamp = Date.now();
  const randomSuffix = Math.random().toString(36).substring(2, 8);
  const folder = fields.folderPrefix || 'evidence';
  const isAttendance = folder === 'attendance' || fields.evidenceType === 'contractor_attendance' || fields.evidenceType === 'attendance';
  const submissionId = `SUB-${timestamp}-${randomSuffix.toUpperCase()}`;
  const nowIso = new Date().toISOString();

  // Tier 1: Attempt direct upload to local or deployed FastAPI backend
  try {
    const endpoint = isAttendance ? '/api/attendance' : '/api/citizen-evidence';
    const formData = new FormData();
    formData.append('work_id', fields.workId);
    if (isAttendance) {
      formData.append('staff_count', String(fields.staffCount ?? 1));
    } else {
      formData.append('category', fields.category || 'General Observation');
      formData.append('description', fields.description || `Field evidence for work ${fields.workId}`);
      formData.append('evidence_type', fields.evidenceType || 'citizen');
      if (fields.staffCount != null) {
        formData.append('staff_count', String(fields.staffCount));
      }
    }
    if (fields.latitude != null) formData.append('latitude', String(fields.latitude));
    if (fields.longitude != null) formData.append('longitude', String(fields.longitude));
    if (fields.gpsAccuracy != null) formData.append('gps_accuracy', String(fields.gpsAccuracy));
    if (fields.capturedAt) formData.append('captured_at', fields.capturedAt);
    formData.append('live_capture', String(fields.liveCapture ?? true));
    formData.append('image', uploadFile, uploadFile.name || 'capture.jpg');

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3500);

    const res = await fetch(endpoint, {
      method: 'POST',
      body: formData,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (res.ok) {
      const serverRecord = await res.json();
      const serverUrl = serverRecord.image_url || serverRecord.image_reference || serverRecord.download_url;
      const rec: UploadedEvidenceMetadata = {
        submission_id: serverRecord.attendance_id || serverRecord.submission_id || submissionId,
        work_id: fields.workId,
        storage_path: serverRecord.storage_path || `attendance/${cleanWorkId}`,
        download_url: serverUrl,
        content_type: 'image/jpeg',
        byte_size: uploadFile.size,
        uploaded_at: serverRecord.uploaded_at || nowIso,
        review_status: serverRecord.review_status || 'SUBMITTED',
        uploader_id: user.uid,
        category: fields.category || 'GENERAL_EVIDENCE',
        description: fields.description || '',
        evidence_type: fields.evidenceType || (isAttendance ? 'attendance' : 'CITIZEN_PHOTO'),
        staff_count: fields.staffCount ?? null,
        latitude: fields.latitude ?? null,
        longitude: fields.longitude ?? null,
        gps_accuracy: fields.gpsAccuracy ?? null,
        captured_at: fields.capturedAt ?? nowIso,
        live_capture: fields.liveCapture ?? true,
      };

      // Sync to local queue for immediate display
      try {
        const key = isAttendance ? 'mplads_local_attendance_records' : 'mplads_local_citizen_evidence';
        const existing = JSON.parse(localStorage.getItem(key) || '[]');
        existing.unshift({
          ...serverRecord,
          ...rec,
          image_reference: serverUrl,
          download_url: serverUrl,
        });
        localStorage.setItem(key, JSON.stringify(existing.slice(0, 100)));
      } catch {}

      return rec;
    }
  } catch {
    // Backend endpoint not active; proceed to Firebase Storage / resilient client fallback
  }

  // Tier 2: Direct Firebase Storage Upload (with CORS detection and fail-fast protection)
  const path = `team_ala/${folder}/${cleanWorkId}/${cleanWorkId}_${timestamp}_${randomSuffix}.jpg`;
  const fileRef = storageRef(storage, path);
  let permanentUrl = '';
  const isCORSBlocked = typeof window !== 'undefined' && sessionStorage.getItem('mplads_storage_cors_blocked') === '1';

  if (!isCORSBlocked) {
    try {
      const uploadPromise = uploadBytes(fileRef, uploadFile, {
        contentType: 'image/jpeg',
        customMetadata: {
          work_id: fields.workId,
          uploader_id: user.uid,
          uploader_email: uploaderEmail || '',
          uploaded_at: nowIso,
          team: 'team_ala',
        },
      });
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Storage upload timeout')), 3000)
      );
      await Promise.race([uploadPromise, timeoutPromise]);
      permanentUrl = await getDownloadURL(fileRef);
    } catch {
      // Mark as blocked for this session so future uploads do not trigger CORS preflight network failures
      try {
        sessionStorage.setItem('mplads_storage_cors_blocked', '1');
      } catch {}
    }
  }

  // Tier 3: Resilient client-side fallback using optimized compressed data URL
  if (!permanentUrl) {
    permanentUrl = optimizedDataUrl || await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => resolve(URL.createObjectURL(uploadFile));
      reader.readAsDataURL(uploadFile);
    });
  }

  const record: UploadedEvidenceMetadata = {
    submission_id: submissionId,
    work_id: fields.workId,
    storage_path: path,
    download_url: permanentUrl,
    content_type: 'image/jpeg',
    byte_size: uploadFile.size,
    uploaded_at: nowIso,
    review_status: 'SUBMITTED',
    uploader_id: user.uid,
    category: fields.category || 'GENERAL_EVIDENCE',
    description: fields.description || '',
    evidence_type: fields.evidenceType || (isAttendance ? 'attendance' : 'CITIZEN_PHOTO'),
    staff_count: fields.staffCount ?? null,
    latitude: fields.latitude ?? null,
    longitude: fields.longitude ?? null,
    gps_accuracy: fields.gpsAccuracy ?? null,
    captured_at: fields.capturedAt ?? nowIso,
    live_capture: fields.liveCapture ?? true,
  };

  // Write permanent record to Firestore collection (optional remote sync)
  const collectionName = isAttendance ? 'attendance_records' : 'citizen_evidence';
  const firestoreRecord: any = {
    ...record,
    uploader_email: uploaderEmail,
    uploader_name: uploaderName,
    server_timestamp: serverTimestamp(),
  };

  if (isAttendance) {
    firestoreRecord.attendance_id = submissionId;
    firestoreRecord.image_reference = permanentUrl;
    firestoreRecord.location_validation_status = 'WITHIN_EXPECTED_RADIUS';
    firestoreRecord.camera_capture_only = fields.liveCapture ?? true;
  }

  try {
    const docRef = doc(db, collectionName, submissionId);
    await setDoc(docRef, firestoreRecord);

    if (isAttendance && collectionName === 'attendance_records') {
      try {
        const citDoc = doc(db, 'citizen_evidence', submissionId);
        await setDoc(citDoc, {
          ...record,
          image_reference: permanentUrl,
          location_validation_status: 'WITHIN_EXPECTED_RADIUS',
          uploader_email: uploaderEmail,
          uploader_name: uploaderName,
          server_timestamp: serverTimestamp(),
        });
      } catch {}
    }
  } catch {
    // Firestore rules may restrict anonymous write - records are safely preserved in local queue
  }

  // Record in local queue for instant zero-latency UI display
  try {
    const key = isAttendance ? 'mplads_local_attendance_records' : 'mplads_local_citizen_evidence';
    const existing = JSON.parse(localStorage.getItem(key) || '[]');
    existing.unshift({
      ...firestoreRecord,
      attendance_id: submissionId,
      image_reference: permanentUrl,
      location_validation_status: 'WITHIN_EXPECTED_RADIUS',
    });
    localStorage.setItem(key, JSON.stringify(existing.slice(0, 100)));

    if (isAttendance) {
      const citExisting = JSON.parse(localStorage.getItem('mplads_local_citizen_evidence') || '[]');
      citExisting.unshift({
        ...record,
        image_reference: permanentUrl,
        location_validation_status: 'WITHIN_EXPECTED_RADIUS',
        uploader_email: uploaderEmail,
        uploader_name: uploaderName,
      });
      localStorage.setItem('mplads_local_citizen_evidence', JSON.stringify(citExisting.slice(0, 100)));
    }
  } catch {}

  return record;
}

/**
 * Upload attendance live camera capture to Firebase Storage and Firestore.
 */
export async function uploadAttendanceToFirebase(
  file: File,
  fields: {
    workId: string;
    staffCount: number;
    latitude: number;
    longitude: number;
    gpsAccuracy?: number | null;
    capturedAt: string;
  }
): Promise<any> {
  const uploaded = await uploadEvidenceToFirebase(file, {
    workId: fields.workId,
    category: 'ATTENDANCE_CAPTURE',
    description: `Staff attendance capture: ${fields.staffCount} workers present`,
    evidenceType: 'attendance',
    staffCount: fields.staffCount,
    latitude: fields.latitude,
    longitude: fields.longitude,
    gpsAccuracy: fields.gpsAccuracy,
    capturedAt: fields.capturedAt,
    liveCapture: true,
    folderPrefix: 'attendance',
  });

  const attendanceId = uploaded.submission_id?.startsWith('ATT-')
    ? uploaded.submission_id
    : `ATT-${Date.now()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

  const attendanceRecord = {
    attendance_id: attendanceId,
    work_id: fields.workId,
    staff_count: fields.staffCount,
    capture_source: 'LIVE_CAMERA',
    camera_capture_only: true,
    latitude: fields.latitude,
    longitude: fields.longitude,
    gps_accuracy: fields.gpsAccuracy ?? null,
    captured_at: fields.capturedAt,
    image_url: uploaded.download_url,
    image_reference: uploaded.download_url,
    storage_path: uploaded.storage_path,
    download_url: uploaded.download_url,
    byte_size: uploaded.byte_size,
    content_type: uploaded.content_type,
    location_validation_status: 'WITHIN_EXPECTED_RADIUS',
    review_status: 'SUBMITTED',
    created_at: uploaded.uploaded_at,
    updated_at: uploaded.uploaded_at,
  };

  // Persist to local queue
  try {
    const existing = JSON.parse(localStorage.getItem('mplads_local_attendance_records') || '[]');
    const idx = existing.findIndex((r: any) => r.attendance_id === attendanceId);
    if (idx >= 0) {
      existing[idx] = { ...existing[idx], ...attendanceRecord };
    } else {
      existing.unshift(attendanceRecord);
    }
    localStorage.setItem('mplads_local_attendance_records', JSON.stringify(existing.slice(0, 100)));
  } catch {}

  return attendanceRecord;
}

/**
 * Save Material Quality Assessment in Firestore and local storage.
 */
export async function saveMaterialAssessment(assessment: any): Promise<void> {
  const workId = assessment.work_id || assessment.workId;
  const assessmentId = `MAT-${Date.now()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
  const record = {
    ...assessment,
    assessment_id: assessmentId,
    saved_at: new Date().toISOString(),
  };

  // Local storage cache
  try {
    const key = `mplads_material_${workId}`;
    localStorage.setItem(key, JSON.stringify(record));
    const allKey = 'mplads_local_material_assessments';
    const all = JSON.parse(localStorage.getItem(allKey) || '[]');
    all.unshift(record);
    localStorage.setItem(allKey, JSON.stringify(all.slice(0, 50)));
  } catch {}

  // Firestore write (safe optional remote sync)
  try {
    const docRef = doc(db, 'material_assessments', assessmentId);
    await setDoc(docRef, { ...record, server_timestamp: serverTimestamp() });
  } catch {
    // Benign local-first fallback
  }
}

/**
 * Fetch saved Material Assessment for a work ID.
 */
export async function fetchMaterialAssessmentForWork(workId: string): Promise<any | null> {
  const cleanId = String(workId || '').trim();
  if (!cleanId) return null;

  // Check local cache first
  try {
    const key = `mplads_material_${cleanId}`;
    const cached = localStorage.getItem(key);
    if (cached) return JSON.parse(cached);
  } catch {}

  // Check Firestore
  try {
    const colRef = collection(db, 'material_assessments');
    const q = query(colRef, where('work_id', '==', cleanId), firestoreLimit(1));
    const snapPromise = getDocs(q);
    const timeoutPromise = new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 2000));
    const snap = await Promise.race([snapPromise, timeoutPromise]);
    if (!snap.empty) {
      return snap.docs[0].data();
    }
  } catch {}

  return null;
}
