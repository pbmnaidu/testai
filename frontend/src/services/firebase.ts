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
import { getAuth, signInAnonymously, onAuthStateChanged, User } from 'firebase/auth';
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

// Validation constants
export const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB

let anonymousAuthDisabled = false;

/**
 * Ensures user is authenticated (anonymously or previously logged in)
 * to comply with the "Require authentication for writes" security rule.
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
      console.warn('[Firebase Auth] Anonymous sign-in is disabled in Firebase Console. Using client session fallback. To enable: Firebase Console -> Authentication -> Sign-in method -> Anonymous -> Enable.');
    } else {
      console.warn('[Firebase Auth] Anonymous sign-in failed, proceeding with fallback uploader ID:', err);
    }
    // Return a mock user structure if network/offline blocks auth handshake
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
 * and record permanent metadata in Cloud Firestore.
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

  const user = await ensureAuthenticatedUser();
  const cleanWorkId = String(fields.workId || 'unassigned').trim().replace(/[\/\\#\s]/g, '_');
  const timestamp = Date.now();
  const randomSuffix = Math.random().toString(36).substring(2, 8);
  const ext = file.name.split('.').pop()?.toLowerCase() || (file.type === 'image/png' ? 'png' : 'jpg');
  const folder = fields.folderPrefix || 'evidence';
  const path = `${folder}/${cleanWorkId}/${timestamp}_${randomSuffix}.${ext}`;
  const fileRef = storageRef(storage, path);

  let uploadSuccess = false;
  let lastError: any = null;

  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    try {
      await uploadBytes(fileRef, file, {
        contentType: file.type,
        customMetadata: {
          work_id: fields.workId,
          uploader_id: user.uid,
          uploaded_at: new Date().toISOString(),
        },
      });
      uploadSuccess = true;
      break;
    } catch (err) {
      lastError = err;
      console.warn(`[Firebase Storage] Upload attempt ${attempt} failed:`, err);
      if (attempt <= maxRetries) {
        await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
      }
    }
  }

  if (!uploadSuccess) {
    throw new Error(
      `Failed to upload image to Firebase Storage: ${lastError?.message || 'Storage network failure'}. Note: Firebase Storage requires Blaze plan activation on the Google Cloud project.`
    );
  }

  // Get permanent download URL
  const permanentUrl = await getDownloadURL(fileRef);

  const submissionId = `SUB-${timestamp}-${randomSuffix.toUpperCase()}`;
  const nowIso = new Date().toISOString();

  const record: UploadedEvidenceMetadata = {
    submission_id: submissionId,
    work_id: fields.workId,
    storage_path: path,
    download_url: permanentUrl,
    content_type: file.type,
    byte_size: file.size,
    uploaded_at: nowIso,
    review_status: 'PENDING_REVIEW',
    uploader_id: user.uid,
    category: fields.category || 'GENERAL_EVIDENCE',
    description: fields.description || '',
    evidence_type: fields.evidenceType || 'CITIZEN_PHOTO',
    staff_count: fields.staffCount ?? null,
    latitude: fields.latitude ?? null,
    longitude: fields.longitude ?? null,
    gps_accuracy: fields.gpsAccuracy ?? null,
    captured_at: fields.capturedAt ?? nowIso,
    live_capture: fields.liveCapture ?? true,
  };

  // Write permanent record to Firestore
  try {
    const docRef = doc(db, 'citizen_evidence', submissionId);
    await setDoc(docRef, {
      ...record,
      server_timestamp: serverTimestamp(),
    });
  } catch (err) {
    console.warn('[Firebase Firestore] Failed recording evidence metadata in Firestore:', err);
    // Even if Firestore write fails due to permissions, return the record so UI can display URL
  }

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

  const attendanceId = `ATT-${Date.now()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
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
    storage_path: uploaded.storage_path,
    download_url: uploaded.download_url,
    byte_size: uploaded.byte_size,
    content_type: uploaded.content_type,
    review_status: 'PENDING_REVIEW',
    uploaded_at: uploaded.uploaded_at,
    uploader_id: uploaded.uploader_id,
  };

  try {
    const docRef = doc(db, 'attendance_records', attendanceId);
    await setDoc(docRef, {
      ...attendanceRecord,
      server_timestamp: serverTimestamp(),
    });
  } catch (err) {
    console.warn('[Firebase Firestore] Failed logging attendance document in Firestore:', err);
  }

  return attendanceRecord;
}
