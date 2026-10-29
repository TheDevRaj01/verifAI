import type {
  CollegeAccount,
  CollegeApplication,
  UniqueIdRequest,
  ApplicationType,
  ChecklistRequirement,
  RequiredDocument,
  ApplicationAuditLog,
  ApplicationStatus,
  DocumentOcrResult,
  DocumentValidationResult,
  DuplicateDetectionResult,
  DocumentVersionSnapshot,
  DeclaredInfrastructure,
  InfrastructureEvidenceItem,
  OfficerInspectionDecision,
  RegulatoryComplianceAssessment,
  AuthorityVerificationRecord,
  AuthorityVerificationResult,
  AuthorityFieldComparison,
  AuthorityVerificationStatus,
  PdfDocumentMetadata,
} from '../types/index.ts';
import { getSampleDocumentPdfDataUrl } from './sampleDocumentGenerator.ts';
import { extractPdfMetadataSync } from './documentValidationService.ts';
import {
  calculateFileHash,
  detectDocumentDuplicates,
} from './duplicateDetectionService.ts';
import {
  assessRegulatoryAndInfrastructureCompliance,
  analyzeMediaEvidence,
} from './regulatoryComplianceService.ts';
import {
  executeAuthorityVerification,
  findAuthorityProfile,
  type VerificationExecutionOptions,
} from './issuingAuthorityVerificationService.ts';
import {
  INITIAL_DEMO_COLLEGES,
  INITIAL_DEMO_APPLICATIONS,
  INITIAL_DEMO_ID_REQUESTS,
  INITIAL_CHECKLIST_REQUIREMENTS,
} from '../data/demoData.ts';
import { db, storage, auth, isFirebaseConfigured } from './firebase.ts';
import { ensureFirebaseAuthSession } from './authService.ts';
import {
  collection,
  getDocs,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  addDoc,
} from 'firebase/firestore';
import {
  ref as storageRef,
  uploadString,
  getDownloadURL,
  deleteObject,
} from 'firebase/storage';

const STORAGE_KEYS = {
  COLLEGES: 'verifai_colleges_v1',
  APPLICATIONS: 'verifai_applications_v1',
  ID_REQUESTS: 'verifai_id_requests_v1',
  CHECKLISTS: 'verifai_checklists_v1',
};

function getStorage(): Storage | null {
  if (typeof window !== 'undefined' && window.localStorage) return window.localStorage;
  if (typeof globalThis !== 'undefined' && (globalThis as any).localStorage) return (globalThis as any).localStorage;
  return null;
}

// Retrieve active session for service-level authorization enforcement
export function getActiveSession(): { user?: { role: string; email?: string; displayName?: string; collegeId?: string } } | null {
  const storage = getStorage();
  if (!storage) return null;
  const raw = storage.getItem('verifai_active_session_v1');
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

// Initialize localStorage simulation seed if empty
export function initializeLocalStorage() {
  const storage = getStorage();
  if (!storage) return;

  if (!storage.getItem(STORAGE_KEYS.COLLEGES)) {
    storage.setItem(STORAGE_KEYS.COLLEGES, JSON.stringify(INITIAL_DEMO_COLLEGES));
  }
  if (!storage.getItem(STORAGE_KEYS.APPLICATIONS)) {
    storage.setItem(STORAGE_KEYS.APPLICATIONS, JSON.stringify(INITIAL_DEMO_APPLICATIONS));
  } else {
    // Migration: ensure existing cached demo documents have requirementId linked
    try {
      const existingRaw = storage.getItem(STORAGE_KEYS.APPLICATIONS);
      if (existingRaw) {
        const apps: CollegeApplication[] = JSON.parse(existingRaw);
        let modified = false;
        for (const a of apps) {
          if (a.id === 'APP-EOA-2026-001' && a.documents) {
            for (const d of a.documents) {
              if (!d.requirementId) {
                if (d.id === 'doc-1') { d.requirementId = 'REQ-EOA-006'; modified = true; }
                else if (d.id === 'doc-2') { d.requirementId = 'REQ-EOA-004'; modified = true; }
                else if (d.id === 'doc-3') { d.requirementId = 'REQ-EOA-001'; modified = true; }
                else if (d.id === 'doc-4') { d.requirementId = 'REQ-EOA-002'; modified = true; }
              }
            }
          }

          // Populate declared infrastructure and evidence for demo applications if missing
          const demoMatch = INITIAL_DEMO_APPLICATIONS.find(init => init.id === a.id);
          if (demoMatch) {
            if (!a.declaredInfrastructure && demoMatch.declaredInfrastructure) {
              a.declaredInfrastructure = demoMatch.declaredInfrastructure;
              modified = true;
            }
            if ((!a.infrastructureEvidence || a.infrastructureEvidence.length === 0) && demoMatch.infrastructureEvidence) {
              a.infrastructureEvidence = demoMatch.infrastructureEvidence;
              modified = true;
            }
            if (a.documents && demoMatch.documents) {
              for (const d of a.documents) {
                if (!d.fileDataUrl && !d.fileUrl && !d.fileBlobId) {
                  const matchDoc = demoMatch.documents.find(md => md.id === d.id || md.requirementId === d.requirementId);
                  if (matchDoc?.fileDataUrl) {
                    d.fileDataUrl = matchDoc.fileDataUrl;
                    modified = true;
                  } else {
                    d.fileDataUrl = getSampleDocumentPdfDataUrl(d.requirementId || d.id, d.name, a.collegeName, a.academicYear);
                    modified = true;
                  }
                }
              }
            }
          }
        }
        if (modified) {
          storage.setItem(STORAGE_KEYS.APPLICATIONS, JSON.stringify(apps));
        }
      }
    } catch {}
  }
  if (!storage.getItem(STORAGE_KEYS.ID_REQUESTS)) {
    storage.setItem(STORAGE_KEYS.ID_REQUESTS, JSON.stringify(INITIAL_DEMO_ID_REQUESTS));
  }
  if (!storage.getItem(STORAGE_KEYS.CHECKLISTS)) {
    storage.setItem(STORAGE_KEYS.CHECKLISTS, JSON.stringify(INITIAL_CHECKLIST_REQUIREMENTS));
  }
}

initializeLocalStorage();

// ==========================================
// Firebase Spark Free Plan: Firestore Subcollection Binary Storage
// ==========================================

export const MAX_SPARK_FILE_BYTES = 512000; // 500 KiB safe limit for single Firestore document

/**
 * Calculates raw byte size from a Base64 data URL.
 */
export function getDataUrlByteSize(dataUrl: string): number {
  if (!dataUrl) return 0;
  const commaIdx = dataUrl.indexOf(',');
  const base64Str = commaIdx !== -1 ? dataUrl.slice(commaIdx + 1) : dataUrl;
  const padding = base64Str.endsWith('==') ? 2 : base64Str.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.round((base64Str.length * 3) / 4) - padding);
}

/**
 * Automatically compresses images (JPEG, PNG, WebP) client-side before upload.
 * Reduces 5-10 MB smartphone photos down to crisp 180-380 KB JPEGs.
 */
export async function compressImageForUpload(
  dataUrl: string,
  maxDimension: number = 1600,
  quality: number = 0.78
): Promise<string> {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return dataUrl;
  }
  if (!dataUrl || !dataUrl.startsWith('data:image/')) {
    return dataUrl;
  }

  return new Promise((resolve) => {
    try {
      const img = new Image();
      img.onload = () => {
        let width = img.width;
        let height = img.height;

        if (width <= maxDimension && height <= maxDimension && dataUrl.length < 400000) {
          resolve(dataUrl);
          return;
        }

        if (width > height) {
          if (width > maxDimension) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          }
        } else {
          if (height > maxDimension) {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(dataUrl);
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);
        const compressed = canvas.toDataURL('image/jpeg', quality);
        resolve(compressed);
      };

      img.onerror = () => {
        resolve(dataUrl);
      };

      img.src = dataUrl;
    } catch {
      resolve(dataUrl);
    }
  });
}

/**
 * Uploads file binary data to a dedicated Firestore subcollection document:
 * /applications/{appId}/fileBlobs/{fileId}
 */
export async function uploadFileBlobToFirestore(
  appId: string,
  fileId: string,
  dataUrl: string,
  metadata: {
    fileName: string;
    fileType: string;
    requirementId?: string;
    version?: number;
    sha256?: string;
    collegeId?: string;
  }
): Promise<{ fileBlobId: string }> {
  if (!isFirebaseConfigured || !db) {
    return { fileBlobId: fileId };
  }

  try {
    if (auth && !auth.currentUser) {
      try {
        await ensureFirebaseAuthSession();
      } catch {}
    }

    const blobRef = doc(db, 'applications', appId, 'fileBlobs', fileId);
    const payload = {
      fileId,
      applicationId: appId,
      collegeId: metadata.collegeId || null,
      fileName: metadata.fileName,
      fileType: metadata.fileType,
      requirementId: metadata.requirementId || null,
      version: metadata.version || 1,
      dataUrl,
      uploadedAt: new Date().toISOString(),
      sha256: metadata.sha256 || null,
    };

    await setDoc(blobRef, payload);
    return { fileBlobId: fileId };
  } catch (blobErr: any) {
    console.warn(`[VerifAI] Cloud fileBlob upload notice (${blobErr.message || 'Permission denied'}). Preserving payload in local cache.`);
    return { fileBlobId: fileId };
  }
}

/**
 * Safely deletes a file blob from the Firestore subcollection.
 */
export async function deleteFileBlobFromFirestore(
  appId: string,
  fileId?: string
): Promise<void> {
  if (!fileId || !isFirebaseConfigured || !db) return;
  try {
    const blobRef = doc(db, 'applications', appId, 'fileBlobs', fileId);
    await deleteDoc(blobRef);
  } catch (err) {
    console.warn('[VerifAI] Firestore fileBlob delete warning:', err);
  }
}

/**
 * Retrieves file binary content from Firestore subcollection or local simulation.
 */
export async function getApplicationFileBlob(
  appId: string,
  fileBlobId: string
): Promise<string | null> {
  if (isFirebaseConfigured && db) {
    try {
      const blobRef = doc(db, 'applications', appId, 'fileBlobs', fileBlobId);
      const snapshot = await getDoc(blobRef);
      if (snapshot.exists()) {
        const data = snapshot.data();
        if (data?.dataUrl) return data.dataUrl;
      }
    } catch (err: any) {
      console.warn('[VerifAI] Cloud getApplicationFileBlob notice:', err?.message);
    }
  }

  const app = await getApplicationById(appId, true);
  if (!app) return null;
  const docMatch = app.documents?.find(
    (d) => d.fileBlobId === fileBlobId || d.id === fileBlobId || d.requirementId === fileBlobId
  );
  if (docMatch) {
    if (docMatch.fileDataUrl) return docMatch.fileDataUrl;
    if (docMatch.fileUrl) return docMatch.fileUrl;
    return getSampleDocumentPdfDataUrl(
      docMatch.requirementId || docMatch.id,
      docMatch.name,
      app.collegeName,
      app.academicYear
    );
  }
  const evidMatch = app.infrastructureEvidence?.find(
    (e) => e.fileBlobId === fileBlobId || e.id === fileBlobId
  );
  if (evidMatch && evidMatch.fileDataUrl) return evidMatch.fileDataUrl;
  return null;
}

/**
 * Recursively removes all undefined fields from an object so Firestore setDoc/updateDoc never rejects it.
 */
export function removeUndefinedFields<T>(obj: T): T {
  if (obj === null || obj === undefined) {
    return null as any;
  }
  if (Array.isArray(obj)) {
    return obj
      .filter((item) => item !== undefined)
      .map((item) => removeUndefinedFields(item)) as any;
  }
  if (typeof obj === 'object') {
    const cleaned: Record<string, any> = {};
    for (const [key, val] of Object.entries(obj)) {
      if (val !== undefined) {
        cleaned[key] = removeUndefinedFields(val);
      }
    }
    return cleaned as T;
  }
  return obj;
}

/**
 * Strips heavy binary dataUrls from main application document before saving to Firestore,
 * ensuring the main document stays < 30 KB, and removes undefined fields to satisfy Firestore setDoc constraints.
 */
export function stripBinaryPayloadsForFirestore(app: CollegeApplication): CollegeApplication {
  const sanitizedDocs = (app.documents || []).map((d) => {
    const cleanDoc = { ...d };
    if (cleanDoc.fileBlobId || cleanDoc.storagePath) {
      delete cleanDoc.fileDataUrl;
    }
    if (cleanDoc.previousVersions) {
      cleanDoc.previousVersions = cleanDoc.previousVersions.map((v) => {
        const cleanV = { ...v };
        if (cleanV.fileBlobId || cleanV.storagePath) {
          delete cleanV.fileDataUrl;
        }
        return cleanV;
      });
    }
    return cleanDoc;
  });

  const sanitizedEvidence = (app.infrastructureEvidence || []).map((ev) => {
    const cleanEv = { ...ev };
    if (cleanEv.fileBlobId || cleanEv.storagePath) {
      delete cleanEv.fileDataUrl;
    }
    return cleanEv;
  });

  const raw = {
    ...app,
    documents: sanitizedDocs,
    infrastructureEvidence: sanitizedEvidence,
  };

  return removeUndefinedFields(raw);
}

// ==========================================
// Cloud Storage Helper APIs & Data Migration (Backward Compatibility)
// ==========================================

/**
 * Uploads a document payload to Firebase Cloud Storage.
 * Structured path: applications/{applicationId}/documents/{requirementId}/v{version}/{sanitizedFileName}
 */
export async function uploadDocumentToCloudStorage(
  appId: string,
  reqId: string,
  version: number,
  fileName: string,
  dataUrl: string
): Promise<{ storagePath: string; downloadUrl: string }> {
  if (!isFirebaseConfigured || !storage) {
    throw new Error('Firebase Cloud Storage is not configured. Operation aborted.');
  }
  const sanitized = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
  const path = `applications/${appId}/documents/${reqId}/v${version}/${sanitized}`;
  const fileRef = storageRef(storage, path);
  await uploadString(fileRef, dataUrl, 'data_url');
  const downloadUrl = await getDownloadURL(fileRef);
  return { storagePath: path, downloadUrl };
}

/**
 * Uploads infrastructure evidence media to Firebase Cloud Storage.
 * Structured path: applications/{applicationId}/evidence/{evidenceId}/{sanitizedFileName}
 */
export async function uploadEvidenceToCloudStorage(
  appId: string,
  evidenceId: string,
  fileName: string,
  dataUrl: string
): Promise<{ storagePath: string; downloadUrl: string }> {
  if (!isFirebaseConfigured || !storage) {
    throw new Error('Firebase Cloud Storage is not configured. Operation aborted.');
  }
  const sanitized = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
  const path = `applications/${appId}/evidence/${evidenceId}/${sanitized}`;
  const fileRef = storageRef(storage, path);
  await uploadString(fileRef, dataUrl, 'data_url');
  const downloadUrl = await getDownloadURL(fileRef);
  return { storagePath: path, downloadUrl };
}

/**
 * Safely deletes a file from Firebase Cloud Storage without breaking references.
 */
export async function deleteFromCloudStorage(storagePathString?: string): Promise<void> {
  if (!storagePathString || !isFirebaseConfigured || !storage) return;
  try {
    const fileRef = storageRef(storage, storagePathString);
    await deleteObject(fileRef);
  } catch (err) {
    console.warn('[VerifAI] Cloud Storage delete warning:', err);
  }
}

export interface MigrationProgress {
  total: number;
  processed: number;
  migrated: number;
  skipped: number;
  failed: number;
  errors: string[];
}

/**
 * Explicit, idempotent migration of legacy Base64 documents to Firebase Cloud Storage.
 * Only processes documents that contain inline Base64 data and do not yet have a storagePath.
 * Preserves legacy records safely if upload fails.
 */
export async function migrateApplicationDocumentsToCloudStorage(
  appId: string,
  onProgress?: (p: MigrationProgress) => void
): Promise<{ application: CollegeApplication; progress: MigrationProgress }> {
  if (!isFirebaseConfigured || !storage) {
    throw new Error('Cloud Storage is not configured. Migration requires an active Firebase connection.');
  }

  const session = getActiveSession();
  const app = await getApplicationById(appId, true);
  if (!app) throw new Error('Application dossier not found.');

  if (session?.user?.role === 'college' && app.collegeId !== session.user.collegeId) {
    throw new Error('Access Denied: You can only migrate your own institution documents.');
  }

  const progress: MigrationProgress = {
    total: app.documents.length + (app.infrastructureEvidence?.length || 0),
    processed: 0,
    migrated: 0,
    skipped: 0,
    failed: 0,
    errors: [],
  };

  const updatedDocuments = [...app.documents];
  let docsChanged = false;

  for (let i = 0; i < updatedDocuments.length; i++) {
    const docItem = updatedDocuments[i];
    progress.processed++;
    onProgress?.({ ...progress });

    if (docItem.fileDataUrl && docItem.fileDataUrl.startsWith('data:') && !docItem.storagePath) {
      try {
        const version = docItem.version || 1;
        const fileName = docItem.fileName || `${docItem.name || 'document'}.pdf`;
        const cloudResult = await uploadDocumentToCloudStorage(
          app.id,
          docItem.requirementId || docItem.id,
          version,
          fileName,
          docItem.fileDataUrl
        );

        updatedDocuments[i] = {
          ...docItem,
          storagePath: cloudResult.storagePath,
          fileUrl: cloudResult.downloadUrl,
          fileDataUrl: cloudResult.downloadUrl,
        };
        docsChanged = true;
        progress.migrated++;
      } catch (err: any) {
        progress.failed++;
        progress.errors.push(`Doc "${docItem.name}": ${err.message}`);
      }
    } else {
      progress.skipped++;
    }
    onProgress?.({ ...progress });
  }

  const updatedEvidence = [...(app.infrastructureEvidence || [])];
  let evidenceChanged = false;

  for (let j = 0; j < updatedEvidence.length; j++) {
    const evItem = updatedEvidence[j];
    progress.processed++;
    onProgress?.({ ...progress });

    if (evItem.fileDataUrl && evItem.fileDataUrl.startsWith('data:') && !evItem.storagePath) {
      try {
        const cloudResult = await uploadEvidenceToCloudStorage(
          app.id,
          evItem.id,
          evItem.fileName,
          evItem.fileDataUrl
        );
        updatedEvidence[j] = {
          ...evItem,
          storagePath: cloudResult.storagePath,
          fileUrl: cloudResult.downloadUrl,
          fileDataUrl: cloudResult.downloadUrl,
        };
        evidenceChanged = true;
        progress.migrated++;
      } catch (err: any) {
        progress.failed++;
        progress.errors.push(`Evidence "${evItem.title}": ${err.message}`);
      }
    } else {
      progress.skipped++;
    }
    onProgress?.({ ...progress });
  }

  if (docsChanged || evidenceChanged) {
    const now = new Date().toISOString().split('T')[0];
    const auditLogs = app.auditLogs || [];
    auditLogs.unshift({
      id: `LOG-${Date.now().toString().slice(-6)}`,
      timestamp: new Date().toISOString(),
      action: 'STORAGE_MIGRATION',
      actor: session?.user?.displayName || session?.user?.email || 'System Migration',
      actorRole: (session?.user?.role as any) || 'admin',
      details: `Migrated ${progress.migrated} legacy document(s)/evidence item(s) to Firebase Cloud Storage.`,
    });

    const updatedApp: CollegeApplication = {
      ...app,
      documents: updatedDocuments,
      infrastructureEvidence: updatedEvidence,
      auditLogs,
      lastUpdated: now,
    };

    const saved = await createOrUpdateApplication(updatedApp);
    return { application: saved, progress };
  }

  return { application: app, progress };
}

// ==========================================
// Applications Data API
// ==========================================

function getLocalApplications(filter?: {
  type?: ApplicationType;
  collegeId?: string;
}): CollegeApplication[] {
  const localStore = getStorage();
  const raw = localStore ? localStore.getItem(STORAGE_KEYS.APPLICATIONS) : null;
  let list: CollegeApplication[] = raw ? JSON.parse(raw) : [...INITIAL_DEMO_APPLICATIONS];
  if (filter?.type) {
    list = list.filter((app) => app.type === filter.type);
  }
  if (filter?.collegeId) {
    list = list.filter((app) => app.collegeId === filter.collegeId);
  }
  return list;
}

function mergeApplicationWithLocal(cloud: CollegeApplication, local: CollegeApplication): CollegeApplication {
  const mergedDocs = [...(cloud.documents || [])];
  for (const localDoc of local.documents || []) {
    const idx = mergedDocs.findIndex(
      (d) =>
        d.id === localDoc.id ||
        d.requirementId === localDoc.requirementId ||
        (d.name && localDoc.name && d.name.trim().toLowerCase() === localDoc.name.trim().toLowerCase())
    );
    if (idx >= 0) {
      if (
        (localDoc.fileName && (!mergedDocs[idx].fileName || mergedDocs[idx].status === 'NOT_UPLOADED')) ||
        (localDoc.version && mergedDocs[idx].version && localDoc.version > mergedDocs[idx].version!) ||
        localDoc.fileDataUrl
      ) {
        mergedDocs[idx] = {
          ...mergedDocs[idx],
          ...localDoc,
          fileDataUrl: localDoc.fileDataUrl || mergedDocs[idx].fileDataUrl,
        };
      }
    } else {
      mergedDocs.push(localDoc);
    }
  }

  return {
    ...cloud,
    ...local,
    documents: mergedDocs,
    auditLogs:
      local.auditLogs && local.auditLogs.length > (cloud.auditLogs?.length || 0)
        ? local.auditLogs
        : cloud.auditLogs || local.auditLogs || [],
    lastUpdated: local.lastUpdated || cloud.lastUpdated,
  };
}

export async function getApplications(filter?: {
  type?: ApplicationType;
  collegeId?: string;
}): Promise<CollegeApplication[]> {
  const session = getActiveSession();
  let effectiveFilter = filter;

  // Enforce data-level boundary: college users can only query their own college applications
  if (session?.user?.role === 'college' && session.user.collegeId) {
    effectiveFilter = { ...filter, collegeId: session.user.collegeId };
  }

  const localApps = getLocalApplications(effectiveFilter);

  if (isFirebaseConfigured && db) {
    try {
      const colRef = collection(db, 'applications');
      let q = query(colRef);
      if (effectiveFilter?.type) {
        q = query(colRef, where('type', '==', effectiveFilter.type));
      }
      if (effectiveFilter?.collegeId) {
        q = query(colRef, where('collegeId', '==', effectiveFilter.collegeId));
      }

      const snapshot = await getDocs(q);
      const cloudApps = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() } as CollegeApplication));

      // Hybrid merge: merge cloudApps with localApps
      const mergedMap = new Map<string, CollegeApplication>();

      for (const cloudApp of cloudApps) {
        const matchingLocal = localApps.find((l) => l.id === cloudApp.id);
        if (matchingLocal) {
          mergedMap.set(cloudApp.id, mergeApplicationWithLocal(cloudApp, matchingLocal));
        } else {
          mergedMap.set(cloudApp.id, cloudApp);
        }
      }

      // Add any local applications not present in cloud
      for (const localApp of localApps) {
        if (!mergedMap.has(localApp.id)) {
          mergedMap.set(localApp.id, localApp);
        }
      }

      const mergedList = Array.from(mergedMap.values());
      if (mergedList.length > 0) return mergedList;

      return localApps;
    } catch (err: any) {
      console.warn(`[VerifAI] Firestore getApplications notice (${err.message || 'Permission denied'}). Serving from local storage.`);
      return localApps;
    }
  }

  return localApps;
}

export async function getApplicationById(id: string, bypassOwnershipCheck = false): Promise<CollegeApplication | null> {
  const session = getActiveSession();

  const localStore = getStorage();
  const raw = localStore ? localStore.getItem(STORAGE_KEYS.APPLICATIONS) : null;
  const list: CollegeApplication[] = raw ? JSON.parse(raw) : INITIAL_DEMO_APPLICATIONS;
  const localApp = list.find((a) => a.id === id) || null;

  if (isFirebaseConfigured && db) {
    try {
      const docRef = doc(db, 'applications', id);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        let appData = { id: docSnap.id, ...docSnap.data() } as CollegeApplication;
        if (!bypassOwnershipCheck && session?.user?.role === 'college' && appData.collegeId !== session.user.collegeId) {
          return null;
        }
        if (localApp) {
          appData = mergeApplicationWithLocal(appData, localApp);
        }
        return appData;
      }
    } catch (err: any) {
      console.warn(`[VerifAI] Firestore getApplicationById notice (${err.message || 'Permission denied'}). Serving from local storage.`);
    }
  }

  if (!bypassOwnershipCheck && session?.user?.role === 'college' && localApp && localApp.collegeId !== session.user.collegeId) {
    return null;
  }
  return localApp;
}

export async function createOrUpdateApplication(
  application: Partial<CollegeApplication> & { collegeId: string; type: ApplicationType }
): Promise<CollegeApplication> {
  const session = getActiveSession();
  if (session?.user?.role === 'college' && application.collegeId !== session.user.collegeId) {
    throw new Error('Access Denied: Colleges can only submit or update their own applications.');
  }

  const appId = application.id || `APP-${application.type}-${new Date().getFullYear()}-${Math.floor(100 + Math.random() * 900)}`;
  const now = new Date().toISOString().split('T')[0];

  const fullApp: CollegeApplication = {
    id: appId,
    collegeId: application.collegeId,
    collegeName: application.collegeName || 'Unknown College',
    type: application.type,
    academicYear: application.academicYear || '2026-2027',
    state: application.state || 'Delhi',
    district: application.district || 'New Delhi',
    discipline: application.discipline || 'Engineering & Technology',
    ...(application.intakeApprovedLastYear !== undefined ? { intakeApprovedLastYear: application.intakeApprovedLastYear } : {}),
    intakeProposed: application.intakeProposed || 300,
    status: application.status || 'Draft',
    submissionDate: application.submissionDate || now,
    lastUpdated: now,
    complianceScore: application.complianceScore || 85,
    flaggedIssuesCount: application.flaggedIssuesCount || 0,
    documents: application.documents || [],
    auditLogs: application.auditLogs || [],
    remarks: application.remarks || '',
    isDemo: true,
    ...(application.declaredInfrastructure ? { declaredInfrastructure: application.declaredInfrastructure } : {}),
    infrastructureEvidence: application.infrastructureEvidence || [],
    ...(application.regulatoryComplianceAssessment ? { regulatoryComplianceAssessment: application.regulatoryComplianceAssessment } : {}),
  };

  try {
    if (!fullApp.regulatoryComplianceAssessment) {
      fullApp.regulatoryComplianceAssessment = assessRegulatoryAndInfrastructureCompliance(fullApp);
    }
  } catch (err) {
    console.warn('[VerifAI] Auto-assessment on save error:', err);
  }

  // 1. ALWAYS persist to local storage FIRST as a dependable cache/fallback
  const localStore = getStorage();
  if (localStore) {
    try {
      const rawApps = localStore.getItem(STORAGE_KEYS.APPLICATIONS);
      const list: CollegeApplication[] = rawApps ? JSON.parse(rawApps) : [...INITIAL_DEMO_APPLICATIONS];
      const existingIdx = list.findIndex((a) => a.id === appId);
      if (existingIdx >= 0) {
        list[existingIdx] = fullApp;
      } else {
        list.unshift(fullApp);
      }
      localStore.setItem(STORAGE_KEYS.APPLICATIONS, JSON.stringify(list));
    } catch (localErr) {
      console.warn('[VerifAI] Local storage cache write notice:', localErr);
    }
  }

  // 2. If Cloud Firestore is configured, attempt cloud database write
  if (isFirebaseConfigured && db) {
    try {
      if (auth && !auth.currentUser) {
        try {
          await ensureFirebaseAuthSession();
        } catch {}
      }

      const sanitizedApp = stripBinaryPayloadsForFirestore(fullApp);
      await setDoc(doc(db, 'applications', appId), sanitizedApp);
      return fullApp;
    } catch (err: any) {
      console.warn(
        `[VerifAI] Cloud database synchronization failed (${err.message || 'Permission denied'}). Application preserved safely in local storage.`
      );
      // Return the locally preserved application without failing user workflow
      return fullApp;
    }
  }

  return fullApp;
}

// ==========================================
// Unique ID Requests API
// ==========================================

export async function getIdRequests(): Promise<UniqueIdRequest[]> {
  const session = getActiveSession();
  // Authorization boundary: Only AICTE administrators are permitted to retrieve ID requests
  if (!session || session.user?.role !== 'admin') {
    return [];
  }

  if (isFirebaseConfigured && db) {
    try {
      const colRef = collection(db, 'idRequests');
      const snapshot = await getDocs(colRef);
      const reqs = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() } as UniqueIdRequest));
      if (reqs.length > 0) return reqs;

      // Seed baseline demo requests if collection is empty
      const countSnap = await getDocs(colRef);
      if (countSnap.empty) {
        for (const demoReq of INITIAL_DEMO_ID_REQUESTS) {
          try {
            await setDoc(doc(db, 'idRequests', demoReq.id), demoReq);
          } catch {}
        }
        const freshSnap = await getDocs(colRef);
        return freshSnap.docs.map((d) => ({ id: d.id, ...d.data() } as UniqueIdRequest));
      }
      return [];
    } catch (err: any) {
      console.error('[VerifAI] Firestore getIdRequests error:', err);
      throw new Error(`Failed to load ID requests from cloud database: ${err.message}`);
    }
  }

  try {
    const raw = localStorage.getItem(STORAGE_KEYS.ID_REQUESTS);
    return raw ? JSON.parse(raw) : INITIAL_DEMO_ID_REQUESTS;
  } catch {
    return INITIAL_DEMO_ID_REQUESTS;
  }
}

export async function submitIdRequest(
  data: Omit<UniqueIdRequest, 'id' | 'requestDate' | 'status'>
): Promise<UniqueIdRequest> {
  const newId = `REQ-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;
  const now = new Date().toISOString().split('T')[0];

  const newRequest: UniqueIdRequest = {
    ...data,
    id: newId,
    requestDate: now,
    status: 'Pending',
  };

  if (isFirebaseConfigured && db) {
    try {
      await setDoc(doc(db, 'idRequests', newId), newRequest);
      return newRequest;
    } catch (err: any) {
      console.error('[VerifAI] Firestore submitIdRequest error:', err);
      throw new Error(`Failed to submit ID request to cloud database: ${err.message}`);
    }
  }

  const rawReqs = localStorage.getItem(STORAGE_KEYS.ID_REQUESTS);
  const list: UniqueIdRequest[] = rawReqs ? JSON.parse(rawReqs) : INITIAL_DEMO_ID_REQUESTS;
  list.unshift(newRequest);
  localStorage.setItem(STORAGE_KEYS.ID_REQUESTS, JSON.stringify(list));
  return newRequest;
}

export async function approveIdRequest(
  requestId: string,
  remarks: string = 'Approved by AICTE Scrutiny Officer'
): Promise<{ request: UniqueIdRequest; college: CollegeAccount; temporaryPassword: string }> {
  const session = getActiveSession();
  if (!session || session.user?.role !== 'admin') {
    throw new Error('Access Denied: Only authorized AICTE administrators can approve Unique College ID requests.');
  }

  // Generate an authentic AICTE Unique College ID format (e.g. 1-67891234)
  const generatedCollegeId = `1-${Math.floor(10000000 + Math.random() * 90000000)}`;
  const temporaryPassword = `Aicte@${Math.floor(1000 + Math.random() * 9000)}`;
  const now = new Date().toISOString().split('T')[0];

  let targetRequest: UniqueIdRequest | undefined;
  const rawReqs = localStorage.getItem(STORAGE_KEYS.ID_REQUESTS);
  const requests: UniqueIdRequest[] = rawReqs ? JSON.parse(rawReqs) : INITIAL_DEMO_ID_REQUESTS;
  const reqIdx = requests.findIndex((r) => r.id === requestId);

  if (reqIdx >= 0) {
    requests[reqIdx] = {
      ...requests[reqIdx],
      status: 'Approved',
      generatedCollegeId,
      reviewRemarks: remarks,
      reviewedAt: now,
    };
    targetRequest = requests[reqIdx];
  } else {
    throw new Error('Request not found');
  }

  const newCollege: CollegeAccount = {
    collegeId: generatedCollegeId,
    collegeName: targetRequest.collegeName,
    officialEmail: targetRequest.officialEmail,
    state: targetRequest.state,
    district: targetRequest.district,
    institutionType: targetRequest.institutionType,
    authorizedPerson: targetRequest.authorizedPersonName,
    status: 'Active',
    createdAt: now,
    currentApplicationsCount: 0,
    isDemo: true,
  };

  // Save to Firestore if configured
  if (isFirebaseConfigured && db) {
    try {
      await updateDoc(doc(db, 'idRequests', requestId), {
        status: 'Approved',
        generatedCollegeId,
        reviewRemarks: remarks,
        reviewedAt: now,
      });
      await setDoc(doc(db, 'colleges', generatedCollegeId), newCollege);
    } catch (err) {
      console.warn('[VerifAI] Firestore approveIdRequest error, saving locally:', err);
    }
  }

  // Update local storage
  localStorage.setItem(STORAGE_KEYS.ID_REQUESTS, JSON.stringify(requests));

  const colleges = await getColleges();
  colleges.unshift(newCollege);
  localStorage.setItem(STORAGE_KEYS.COLLEGES, JSON.stringify(colleges));

  // Store credentials for local simulation login
  const credentialStoreRaw = localStorage.getItem('verifai_simulated_credentials') || '{}';
  const credentials = JSON.parse(credentialStoreRaw);
  credentials[generatedCollegeId] = temporaryPassword;
  localStorage.setItem('verifai_simulated_credentials', JSON.stringify(credentials));

  return { request: targetRequest, college: newCollege, temporaryPassword };
}

export async function rejectIdRequest(requestId: string, remarks: string): Promise<UniqueIdRequest> {
  const session = getActiveSession();
  if (!session || session.user?.role !== 'admin') {
    throw new Error('Access Denied: Only authorized AICTE administrators can reject Unique College ID requests.');
  }

  const now = new Date().toISOString().split('T')[0];
  const rawReqs = localStorage.getItem(STORAGE_KEYS.ID_REQUESTS);
  const requests: UniqueIdRequest[] = rawReqs ? JSON.parse(rawReqs) : INITIAL_DEMO_ID_REQUESTS;
  const reqIdx = requests.findIndex((r) => r.id === requestId);

  if (reqIdx < 0) throw new Error('Request not found');

  requests[reqIdx] = {
    ...requests[reqIdx],
    status: 'Rejected',
    reviewRemarks: remarks || 'Does not fulfill preliminary AICTE requirements.',
    reviewedAt: now,
  };

  if (isFirebaseConfigured && db) {
    try {
      await updateDoc(doc(db, 'idRequests', requestId), {
        status: 'Rejected',
        reviewRemarks: remarks,
        reviewedAt: now,
      });
    } catch (err) {
      console.warn('[VerifAI] Firestore rejectIdRequest error:', err);
    }
  }

  localStorage.setItem(STORAGE_KEYS.ID_REQUESTS, JSON.stringify(requests));
  return requests[reqIdx];
}

// ==========================================
// Colleges API
// ==========================================

export async function getColleges(): Promise<CollegeAccount[]> {
  if (isFirebaseConfigured && db) {
    try {
      const colRef = collection(db, 'colleges');
      const snapshot = await getDocs(colRef);
      const list = snapshot.docs.map((docSnap) => ({ ...docSnap.data() } as CollegeAccount));
      if (list.length > 0) {
        // Merge with initial demo colleges to ensure baseline evaluation colleges are always available
        const existingIds = new Set(list.map((c) => c.collegeId.trim()));
        const combined = [...list];
        for (const demoCol of INITIAL_DEMO_COLLEGES) {
          if (!existingIds.has(demoCol.collegeId.trim())) {
            combined.push(demoCol);
          }
        }
        return combined;
      }
      return INITIAL_DEMO_COLLEGES;
    } catch (err: any) {
      console.warn('[VerifAI] Firestore getColleges fallback to demo colleges:', err.message);
      return INITIAL_DEMO_COLLEGES;
    }
  }

  try {
    const raw = localStorage.getItem(STORAGE_KEYS.COLLEGES);
    return raw ? JSON.parse(raw) : INITIAL_DEMO_COLLEGES;
  } catch {
    return INITIAL_DEMO_COLLEGES;
  }
}

export async function getCollegeById(collegeId: string): Promise<CollegeAccount | null> {
  const cleanId = collegeId.trim();
  const colleges = await getColleges();
  const found = colleges.find((c) => c.collegeId.trim() === cleanId);
  if (found) return found;

  // Direct fallback to INITIAL_DEMO_COLLEGES to guarantee standard institutions always resolve
  return INITIAL_DEMO_COLLEGES.find((c) => c.collegeId.trim() === cleanId) || null;
}

// ==========================================
// Document Checklist Management API (Admin & College)
// ==========================================

export async function getChecklistRequirements(
  type?: ApplicationType,
  onlyActive?: boolean
): Promise<ChecklistRequirement[]> {
  const session = getActiveSession();
  // Role-based boundary: College accounts are strictly limited to active requirements
  const enforceActive = session?.user?.role === 'college' ? true : (onlyActive ?? false);

  if (isFirebaseConfigured && db) {
    try {
      const colRef = collection(db, 'checklists');
      let constraints: any[] = [];
      if (type) {
        constraints.push(where('applicationType', '==', type));
      }
      if (enforceActive) {
        constraints.push(where('isActive', '==', true));
      }
      const q = constraints.length > 0 ? query(colRef, ...constraints) : query(colRef);
      const snapshot = await getDocs(q);
      let list = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() } as ChecklistRequirement));

      if (list.length > 0) {
        return list.sort((a, b) => a.displayOrder - b.displayOrder);
      }

      // If Firestore collection is empty, gracefully fall back to statutory baseline requirements
      let fallback = INITIAL_CHECKLIST_REQUIREMENTS;
      if (type) {
        fallback = fallback.filter((r) => r.applicationType === type);
      }
      if (enforceActive) {
        fallback = fallback.filter((r) => r.isActive);
      }
      return fallback.sort((a, b) => a.displayOrder - b.displayOrder);
    } catch (err: any) {
      console.warn('[VerifAI] Firestore getChecklistRequirements fallback to statutory checklist:', err.message);
      let fallback = INITIAL_CHECKLIST_REQUIREMENTS;
      if (type) {
        fallback = fallback.filter((r) => r.applicationType === type);
      }
      if (enforceActive) {
        fallback = fallback.filter((r) => r.isActive);
      }
      return fallback.sort((a, b) => a.displayOrder - b.displayOrder);
    }
  }

  try {
    const raw = localStorage.getItem(STORAGE_KEYS.CHECKLISTS);
    let list: ChecklistRequirement[] = raw ? JSON.parse(raw) : INITIAL_CHECKLIST_REQUIREMENTS;
    if (type) {
      list = list.filter((r) => r.applicationType === type);
    }
    if (enforceActive) {
      list = list.filter((r) => r.isActive);
    }
    return list.sort((a, b) => a.displayOrder - b.displayOrder);
  } catch {
    return INITIAL_CHECKLIST_REQUIREMENTS;
  }
}

export async function createChecklistRequirement(
  req: Omit<ChecklistRequirement, 'id'>
): Promise<ChecklistRequirement> {
  const session = getActiveSession();
  if (!session || session.user?.role !== 'admin') {
    throw new Error('Access Denied: Only authorized AICTE administrators can create checklist requirements.');
  }

  const newId = `REQ-${req.applicationType}-${Date.now().toString().slice(-6)}`;
  const now = new Date().toISOString().split('T')[0];

  const fullReq: ChecklistRequirement = {
    ...req,
    id: newId,
    lastModifiedBy: session.user.displayName || 'AICTE Admin',
    lastModifiedAt: now,
  };

  if (isFirebaseConfigured && db) {
    try {
      await setDoc(doc(db, 'checklists', newId), fullReq);
      return fullReq;
    } catch (err) {
      console.warn('[VerifAI] Firestore createChecklistRequirement error, saving locally:', err);
    }
  }

  const raw = localStorage.getItem(STORAGE_KEYS.CHECKLISTS);
  const list: ChecklistRequirement[] = raw ? JSON.parse(raw) : INITIAL_CHECKLIST_REQUIREMENTS;
  list.push(fullReq);
  localStorage.setItem(STORAGE_KEYS.CHECKLISTS, JSON.stringify(list));
  return fullReq;
}

export async function updateChecklistRequirement(
  id: string,
  updates: Partial<ChecklistRequirement>
): Promise<ChecklistRequirement> {
  const session = getActiveSession();
  if (!session || session.user?.role !== 'admin') {
    throw new Error('Access Denied: Only authorized AICTE administrators can edit checklist requirements.');
  }

  const now = new Date().toISOString().split('T')[0];
  const payload = {
    ...updates,
    lastModifiedBy: session.user.displayName || 'AICTE Admin',
    lastModifiedAt: now,
  };

  if (isFirebaseConfigured && db) {
    try {
      await updateDoc(doc(db, 'checklists', id), payload);
    } catch (err) {
      console.warn('[VerifAI] Firestore updateChecklistRequirement error, updating locally:', err);
    }
  }

  const raw = localStorage.getItem(STORAGE_KEYS.CHECKLISTS);
  const list: ChecklistRequirement[] = raw ? JSON.parse(raw) : INITIAL_CHECKLIST_REQUIREMENTS;
  const idx = list.findIndex((r) => r.id === id);
  if (idx < 0) throw new Error('Checklist requirement not found');

  list[idx] = { ...list[idx], ...payload };
  localStorage.setItem(STORAGE_KEYS.CHECKLISTS, JSON.stringify(list));
  return list[idx];
}

export async function deleteChecklistRequirement(id: string): Promise<boolean> {
  const session = getActiveSession();
  if (!session || session.user?.role !== 'admin') {
    throw new Error('Access Denied: Only authorized AICTE administrators can delete checklist requirements.');
  }

  if (isFirebaseConfigured && db) {
    try {
      await deleteDoc(doc(db, 'checklists', id));
    } catch (err) {
      console.warn('[VerifAI] Firestore deleteChecklistRequirement error, deleting locally:', err);
    }
  }

  const raw = localStorage.getItem(STORAGE_KEYS.CHECKLISTS);
  const list: ChecklistRequirement[] = raw ? JSON.parse(raw) : INITIAL_CHECKLIST_REQUIREMENTS;
  const filtered = list.filter((r) => r.id !== id);
  localStorage.setItem(STORAGE_KEYS.CHECKLISTS, JSON.stringify(filtered));
  return true;
}

export async function reorderChecklistRequirements(
  type: ApplicationType,
  orderedIds: string[]
): Promise<boolean> {
  const session = getActiveSession();
  if (!session || session.user?.role !== 'admin') {
    throw new Error('Access Denied: Only authorized AICTE administrators can reorder checklist requirements.');
  }

  const raw = localStorage.getItem(STORAGE_KEYS.CHECKLISTS);
  const list: ChecklistRequirement[] = raw ? JSON.parse(raw) : INITIAL_CHECKLIST_REQUIREMENTS;

  orderedIds.forEach((id, index) => {
    const item = list.find((r) => r.id === id && r.applicationType === type);
    if (item) {
      item.displayOrder = index + 1;
    }
  });

  localStorage.setItem(STORAGE_KEYS.CHECKLISTS, JSON.stringify(list));

  if (isFirebaseConfigured && db) {
    try {
      for (const id of orderedIds) {
        const item = list.find((r) => r.id === id);
        if (item) {
          await updateDoc(doc(db, 'checklists', id), { displayOrder: item.displayOrder });
        }
      }
    } catch (err) {
      console.warn('[VerifAI] Firestore reorderChecklistRequirements error:', err);
    }
  }

  return true;
}

// ==========================================
// College Document Upload & Management API
// ==========================================

export async function uploadApplicationDocument(
  appId: string,
  requirementId: string,
  fileData: { fileName: string; fileSize: string; fileType: string; dataUrl?: string }
): Promise<CollegeApplication> {
  const session = getActiveSession();
  const app = await getApplicationById(appId, true);
  if (!app) throw new Error('Application dossier not found.');

  if (session?.user?.role === 'college' && app.collegeId !== session.user.collegeId) {
    throw new Error('Access Denied: You can only upload documents to your own institution application.');
  }

  // Find requirement to validate against permitted parameters
  const requirements = await getChecklistRequirements(app.type);
  const req = requirements.find((r) => r.id === requirementId);
  if (!req) {
    throw new Error('Invalid checklist requirement reference.');
  }

  // Check file type
  const ext = '.' + fileData.fileName.split('.').pop()?.toLowerCase();
  const isTypeAllowed = req.allowedFileTypes.some(
    (allowed) => allowed.toLowerCase() === ext || allowed.toLowerCase() === fileData.fileType.toLowerCase()
  );
  if (!isTypeAllowed) {
    throw new Error(`Invalid file type (${ext}). Permitted file types: ${req.allowedFileTypes.join(', ')}`);
  }

  const now = new Date().toISOString().split('T')[0];
  const auditLogs = app.auditLogs || [];
  const documents = [...app.documents];
  const existingIdx = documents.findIndex(
    (d) =>
      d.id === requirementId ||
      d.requirementId === requirementId ||
      (d.name && req.title && d.name.trim().toLowerCase() === req.title.trim().toLowerCase())
  );

  let updatedDoc: RequiredDocument;
  let actionType: 'DOCUMENT_UPLOADED' | 'DOCUMENT_REPLACED' = 'DOCUMENT_UPLOADED';

  const nextVersion = existingIdx >= 0 ? (documents[existingIdx].version || 1) + 1 : 1;
  let fileBlobId: string | undefined;

  // Process dataUrl: compress image if needed, validate <= 500 KiB Spark limit
  let processedDataUrl = fileData.dataUrl;
  if (processedDataUrl) {
    if (processedDataUrl.startsWith('data:image/')) {
      processedDataUrl = await compressImageForUpload(processedDataUrl);
    }
    const rawBytes = getDataUrlByteSize(processedDataUrl);
    if (rawBytes > MAX_SPARK_FILE_BYTES) {
      throw new Error(
        `File "${fileData.fileName}" (${(rawBytes / 1024).toFixed(0)} KB) exceeds the Spark Free Tier limit of 500 KB per document. Please compress your PDF before uploading.`
      );
    }
  }

  let fileHash: string | undefined;
  if (processedDataUrl) {
    try {
      fileHash = await calculateFileHash(processedDataUrl);
    } catch {
      // ignore hash computation failure
    }
  }

  let pdfMetadata: PdfDocumentMetadata | undefined;
  if (processedDataUrl && (fileData.fileType?.toLowerCase().includes('pdf') || fileData.fileName?.toLowerCase().endsWith('.pdf'))) {
    try {
      pdfMetadata = extractPdfMetadataSync(processedDataUrl);
    } catch {
      // ignore metadata failure
    }
  }

  // Ensure the parent application exists in Cloud Firestore before subcollection blob write
  if (isFirebaseConfigured && db) {
    try {
      const sanitizedApp = stripBinaryPayloadsForFirestore(app);
      await setDoc(doc(db, 'applications', app.id), sanitizedApp, { merge: true });
    } catch (parentErr) {
      console.warn('[VerifAI] Parent application pre-sync notice:', parentErr);
    }
  }

  // Upload binary to Firestore subcollection if in Cloud Mode
  if (isFirebaseConfigured && db && processedDataUrl) {
    fileBlobId = `blob_${req.id}_v${nextVersion}_${Date.now().toString().slice(-4)}`;
    try {
      await uploadFileBlobToFirestore(app.id, fileBlobId, processedDataUrl, {
        fileName: fileData.fileName,
        fileType: fileData.fileType,
        requirementId: req.id,
        version: nextVersion,
        sha256: fileHash,
        collegeId: app.collegeId,
      });
    } catch (err: any) {
      console.warn(`[VerifAI] Cloud fileBlob write warning: ${err?.message || 'Permission denied'}. Preserving in local dossier.`);
    }
  } else if (!isFirebaseConfigured && processedDataUrl) {
    fileBlobId = `local_${req.id}_v${nextVersion}`;
  }

  const fileUrlToStore = processedDataUrl;

  if (existingIdx >= 0) {
    actionType = 'DOCUMENT_REPLACED';
    const oldDoc = documents[existingIdx];
    const snapshot: DocumentVersionSnapshot = {
      version: oldDoc.version || 1,
      fileName: oldDoc.fileName,
      fileSize: oldDoc.fileSize,
      fileType: oldDoc.fileType,
      uploadDate: oldDoc.uploadDate,
      fileDataUrl: oldDoc.fileDataUrl,
      fileUrl: oldDoc.fileUrl,
      storagePath: oldDoc.storagePath,
      fileBlobId: oldDoc.fileBlobId,
      fileHash: oldDoc.fileHash,
      extractedText: oldDoc.extractedText,
      ocrResult: oldDoc.ocrResult,
      validationResult: oldDoc.validationResult,
      extractedFields: oldDoc.validationResult?.extractedFields,
      pdfMetadata: oldDoc.pdfMetadata || oldDoc.validationResult?.pdfMetadata,
    };
    const prevVersions = [...(oldDoc.previousVersions || []), snapshot];

    updatedDoc = {
      ...oldDoc,
      requirementId: req.id,
      name: req.title,
      category: req.category,
      isMandatory: req.isMandatory,
      status: 'Uploaded',
      fileName: fileData.fileName,
      fileSize: fileData.fileSize,
      fileType: fileData.fileType,
      fileDataUrl: fileUrlToStore,
      fileUrl: undefined,
      storagePath: undefined,
      fileBlobId,
      fileHash,
      pdfMetadata,
      duplicateCheckResult: undefined, // Clear old duplicate findings on replacement
      uploadDate: now,
      adminRemarks: undefined, // Clear past rejection remark on replacement
      ocrResult: undefined, // Invalidate old OCR results upon replacement
      extractedText: undefined,
      ocrExtractedAt: undefined,
      ocrMethod: undefined,
      validationResult: undefined, // Invalidate old validation findings upon replacement
      version: nextVersion,
      previousVersions: prevVersions,
      authorityVerificationResult: undefined, // Invalidate old authority verification result on replacement
    };
    documents[existingIdx] = updatedDoc;
  } else {
    updatedDoc = {
      id: req.id,
      requirementId: req.id,
      name: req.title,
      category: req.category,
      isMandatory: req.isMandatory,
      status: 'Uploaded',
      fileName: fileData.fileName,
      fileSize: fileData.fileSize,
      fileType: fileData.fileType,
      fileDataUrl: fileUrlToStore,
      fileUrl: undefined,
      storagePath: undefined,
      fileBlobId,
      fileHash,
      pdfMetadata,
      duplicateCheckResult: undefined,
      uploadDate: now,
      version: 1,
      previousVersions: [],
      ocrResult: undefined,
      extractedText: undefined,
      ocrExtractedAt: undefined,
      ocrMethod: undefined,
      validationResult: undefined,
    };
    documents.push(updatedDoc);
  }

  // Run duplicate check against institution's applications
  try {
    const allCollegeApps = await getApplications({ collegeId: app.collegeId });
    const interimApp: CollegeApplication = { ...app, documents };
    const dupResult = await detectDocumentDuplicates(updatedDoc, interimApp, allCollegeApps);
    updatedDoc.duplicateCheckResult = dupResult;
    if (existingIdx >= 0) {
      documents[existingIdx] = updatedDoc;
    } else {
      documents[documents.length - 1] = updatedDoc;
    }
  } catch (err) {
    console.warn('[VerifAI] Duplicate detection during upload error:', err);
  }

  const auditLog: ApplicationAuditLog = {
    id: `LOG-${Date.now().toString().slice(-6)}`,
    timestamp: new Date().toISOString(),
    action: actionType,
    actor: session?.user?.displayName || session?.user?.email || app.collegeId,
    actorRole: 'college',
    details: `${actionType === 'DOCUMENT_UPLOADED' ? 'Uploaded' : 'Replaced'} document: "${req.title}" (${fileData.fileName}, ${fileData.fileSize}).`,
  };
  auditLogs.unshift(auditLog);

  // Recalculate compliance score based on uploaded mandatory documents
  const activeMandatory = requirements.filter((r) => r.isActive && r.isMandatory);
  const uploadedMandatory = activeMandatory.filter((m) =>
    documents.some((d) => (d.id === m.id || d.requirementId === m.id) && d.status !== 'NOT_UPLOADED' && d.fileName)
  );
  const complianceScore = activeMandatory.length > 0
    ? Math.round((uploadedMandatory.length / activeMandatory.length) * 100)
    : 100;

  const updatedApp: CollegeApplication = {
    ...app,
    documents,
    auditLogs,
    complianceScore,
    lastUpdated: now,
  };

  try {
    updatedApp.regulatoryComplianceAssessment = assessRegulatoryAndInfrastructureCompliance(updatedApp);
  } catch (err) {
    console.warn('[VerifAI] Regulatory compliance assessment error during upload:', err);
  }

  try {
    return await createOrUpdateApplication(updatedApp);
  } catch (persistErr: any) {
    if (fileBlobId && isFirebaseConfigured && db) {
      try {
        await deleteFileBlobFromFirestore(app.id, fileBlobId);
      } catch (cleanErr) {
        console.warn('[VerifAI] Orphaned blob cleanup warning:', cleanErr);
      }
    }
    throw new Error(`Document blob uploaded, but database synchronization failed: ${persistErr.message}. The change was not saved.`);
  }
}

export async function removeApplicationDocument(
  appId: string,
  requirementId: string
): Promise<CollegeApplication> {
  const session = getActiveSession();
  const app = await getApplicationById(appId, true);
  if (!app) throw new Error('Application not found.');

  if (session?.user?.role === 'college' && app.collegeId !== session.user.collegeId) {
    throw new Error('Access Denied: You can only modify your own institution documents.');
  }

  const documents = [...app.documents];
  const idx = documents.findIndex((d) => d.id === requirementId || d.requirementId === requirementId);
  if (idx < 0) return app;

  const oldDoc = documents[idx];
  if (oldDoc.fileBlobId && isFirebaseConfigured && db) {
    await deleteFileBlobFromFirestore(app.id, oldDoc.fileBlobId);
  }
  if (oldDoc.storagePath && isFirebaseConfigured && storage) {
    await deleteFromCloudStorage(oldDoc.storagePath);
  }

  const docName = oldDoc.name;
  documents[idx] = {
    ...documents[idx],
    status: 'NOT_UPLOADED',
    fileName: undefined,
    fileSize: undefined,
    fileDataUrl: undefined,
    fileUrl: undefined,
    storagePath: undefined,
    fileBlobId: undefined,
    uploadDate: undefined,
    ocrResult: undefined,
    extractedText: undefined,
    ocrExtractedAt: undefined,
    ocrMethod: undefined,
    validationResult: undefined,
    authorityVerificationResult: undefined,
  };

  const auditLogs = app.auditLogs || [];
  auditLogs.unshift({
    id: `LOG-${Date.now().toString().slice(-6)}`,
    timestamp: new Date().toISOString(),
    action: 'DOCUMENT_REMOVED',
    actor: session?.user?.displayName || session?.user?.email || app.collegeId,
    actorRole: 'college',
    details: `Removed uploaded file for document requirement: "${docName}".`,
  });

  const updatedApp: CollegeApplication = {
    ...app,
    documents,
    auditLogs,
    lastUpdated: new Date().toISOString().split('T')[0],
  };

  try {
    updatedApp.regulatoryComplianceAssessment = assessRegulatoryAndInfrastructureCompliance(updatedApp);
  } catch (err) {
    console.warn('[VerifAI] Regulatory compliance assessment error during removal:', err);
  }

  return await createOrUpdateApplication(updatedApp);
}

// ==========================================
// Application Submission API
// ==========================================

export async function submitCollegeApplication(appId: string): Promise<CollegeApplication> {
  const session = getActiveSession();
  const app = await getApplicationById(appId, true);
  if (!app) throw new Error('Application dossier not found.');

  if (session?.user?.role === 'college' && app.collegeId !== session.user.collegeId) {
    throw new Error('Access Denied: You cannot submit applications belonging to another college.');
  }

  // Verify that all active mandatory requirements have valid uploaded documents
  const requirements = await getChecklistRequirements(app.type);
  const activeMandatory = requirements.filter((r) => r.isActive && r.isMandatory);

  const missingRequirements: string[] = [];
  for (const req of activeMandatory) {
    const uploaded = app.documents.find(
      (d) =>
        (d.id === req.id ||
          d.requirementId === req.id ||
          (d.name && d.name.toLowerCase() === req.title.toLowerCase())) &&
        d.status !== 'NOT_UPLOADED' &&
        Boolean(d.fileName)
    );
    if (!uploaded) {
      missingRequirements.push(req.title);
    }
  }

  if (missingRequirements.length > 0) {
    throw new Error(
      `Cannot submit application. Missing mandatory compliance documents (${missingRequirements.length}):\n• ` +
      missingRequirements.join('\n• ')
    );
  }

  const replacementNeeded = app.documents.filter((d) => d.status === 'Replacement Required');
  if (replacementNeeded.length > 0) {
    throw new Error(
      `Cannot submit application. Documents currently flagged as 'Replacement Required' must be replaced prior to submission (${replacementNeeded.length}):\n• ` +
      replacementNeeded.map((d) => d.name).join('\n• ')
    );
  }

  const now = new Date().toISOString().split('T')[0];
  const auditLogs = app.auditLogs || [];
  auditLogs.unshift({
    id: `LOG-${Date.now().toString().slice(-6)}`,
    timestamp: new Date().toISOString(),
    action: 'SUBMITTED',
    actor: session?.user?.displayName || session?.user?.email || app.collegeId,
    actorRole: 'college',
    details: `Application dossier submitted for council scrutiny with ${activeMandatory.length} mandatory documents verified.`,
  });

  const submittedApp: CollegeApplication = {
    ...app,
    status: 'Submitted',
    submissionDate: now,
    lastUpdated: now,
    auditLogs,
  };

  return await createOrUpdateApplication(submittedApp);
}

// ==========================================
// Admin Document Scrutiny & Review API
// ==========================================

/**
 * Validates whether an application fulfills all statutory criteria to become "Documents Verified".
 *
 * Rules:
 * 1. Status must be "Submitted" or "Under Scrutiny".
 * 2. Active mandatory document requirements must be verified for the application's actual type.
 * 3. Every active mandatory requirement must have a corresponding uploaded document explicitly accepted by the admin.
 * 4. If any mandatory document is missing, uploaded but not accepted, or marked Replacement Required, it cannot become Documents Verified.
 * 5. Applications with zero uploaded documents must never become Documents Verified.
 * 6. Does not rely on documents.every(...) on uploaded documents alone.
 */
export async function canApplicationBeDocumentsVerified(
  app: CollegeApplication,
  candidateDocuments?: RequiredDocument[]
): Promise<{ canVerify: boolean; reason?: string }> {
  // Rule 1: Application must be in "Submitted" or "Under Scrutiny"
  const validPriorStatuses: ApplicationStatus[] = ['Submitted', 'Under Scrutiny', 'Documents Verified'];
  if (!validPriorStatuses.includes(app.status)) {
    return {
      canVerify: false,
      reason: `Application is currently in "${app.status}" status. An application must not become "Documents Verified" unless its status is "Submitted" or "Under Scrutiny".`,
    };
  }

  const docsToEvaluate = candidateDocuments || app.documents || [];

  // Rule 5: Zero uploaded documents must never become Documents Verified
  const uploadedDocs = docsToEvaluate.filter(
    (d) => d.status !== 'NOT_UPLOADED' && Boolean(d.fileName)
  );
  if (uploadedDocs.length === 0) {
    return {
      canVerify: false,
      reason: 'Application has zero uploaded documents and cannot be marked as Documents Verified.',
    };
  }

  // Rule 2: Check active mandatory requirements for this application's actual type
  const requirements = await getChecklistRequirements(app.type, false);
  const activeMandatory = requirements.filter((r) => r.isActive && r.isMandatory);

  if (activeMandatory.length === 0) {
    return {
      canVerify: false,
      reason: `No active mandatory compliance requirements are configured for application type ${app.type}.`,
    };
  }

  // Rule 3, 4 & 6: Every active mandatory requirement must have a corresponding uploaded document explicitly accepted by the admin
  for (const req of activeMandatory) {
    const matchingDoc = docsToEvaluate.find(
      (d) =>
        (d.id === req.id ||
          d.requirementId === req.id ||
          d.name.toLowerCase() === req.title.toLowerCase()) &&
        d.status !== 'NOT_UPLOADED' &&
        Boolean(d.fileName)
    );

    if (!matchingDoc) {
      return {
        canVerify: false,
        reason: `Mandatory document "${req.title}" has not been uploaded.`,
      };
    }

    if (matchingDoc.status === 'Replacement Required') {
      return {
        canVerify: false,
        reason: `Mandatory document "${req.title}" is flagged as "Replacement Required" and has not been accepted.`,
      };
    }

    if (matchingDoc.status !== 'Accepted') {
      return {
        canVerify: false,
        reason: `Mandatory document "${req.title}" is currently "${matchingDoc.status}" and has not been explicitly accepted by the reviewing officer.`,
      };
    }
  }

  // Rule 4: Dossier-wide check for any document marked Replacement Required
  if (docsToEvaluate.some((d) => d.status === 'Replacement Required')) {
    return {
      canVerify: false,
      reason: 'One or more documents in the application dossier are marked as "Replacement Required".',
    };
  }

  return { canVerify: true };
}

export async function reviewApplicationDocument(
  appId: string,
  requirementId: string,
  decision: { status: 'Accepted' | 'Replacement Required'; remarks?: string }
): Promise<CollegeApplication> {
  const session = getActiveSession();
  if (!session || session.user?.role !== 'admin') {
    throw new Error('Access Denied: Only authorized AICTE administrators can review scrutiny documents.');
  }

  if (decision.status === 'Replacement Required' && !decision.remarks?.trim()) {
    throw new Error('Mandatory Review Requirement: You must provide a specific remark/reason when requesting a replacement document.');
  }

  const app = await getApplicationById(appId);
  if (!app) throw new Error('Application dossier not found.');

  // Fix 2: Prevent admin review actions on Draft applications in business logic
  if (app.status === 'Draft') {
    throw new Error(
      'Action Prohibited: Cannot review documents for an application in "Draft" status. Official scrutiny actions (Accepting documents or Requesting Replacements) are permitted only after the institution has submitted the application.'
    );
  }

  const now = new Date().toISOString().split('T')[0];
  const documents = [...app.documents];
  const idx = documents.findIndex((d) => d.id === requirementId || d.requirementId === requirementId);

  if (idx < 0) {
    throw new Error('Target document was not found in the application dossier.');
  }

  const targetDoc = documents[idx];
  documents[idx] = {
    ...targetDoc,
    status: decision.status,
    adminRemarks: decision.remarks || (decision.status === 'Accepted' ? 'Verified & Approved by AICTE Scrutiny Officer' : ''),
    reviewedBy: session.user.displayName || 'AICTE Central Admin',
    reviewedAt: now,
  };

  const auditLogs = app.auditLogs || [];
  auditLogs.unshift({
    id: `LOG-${Date.now().toString().slice(-6)}`,
    timestamp: new Date().toISOString(),
    action: decision.status === 'Accepted' ? 'DOCUMENT_ACCEPTED' : 'REPLACEMENT_REQUESTED',
    actor: session.user.displayName || session.user.email || 'AICTE Admin',
    actorRole: 'admin',
    details: `Document "${targetDoc.name}" marked as ${decision.status}.${decision.remarks ? ` Reason: "${decision.remarks}".` : ''}`,
  });

  // Fix 1: Consistent status transition logic for Documents Verified
  let newAppStatus = app.status;
  if (decision.status === 'Replacement Required') {
    newAppStatus = 'Clarification Requested';
  } else if (decision.status === 'Accepted') {
    // Only transition to 'Documents Verified' if ALL active mandatory requirements are satisfied
    const verification = await canApplicationBeDocumentsVerified(app, documents);
    if (verification.canVerify) {
      newAppStatus = 'Documents Verified';
    }
  }

  const updatedApp: CollegeApplication = {
    ...app,
    status: newAppStatus,
    documents,
    auditLogs,
    lastUpdated: now,
  };

  try {
    updatedApp.regulatoryComplianceAssessment = assessRegulatoryAndInfrastructureCompliance(updatedApp);
  } catch (err) {
    console.warn('[VerifAI] Regulatory compliance assessment error during review:', err);
  }

  return await createOrUpdateApplication(updatedApp);
}

/**
 * Saves extracted OCR text and metadata for a document in an application dossier.
 * This is non-destructive and does NOT modify the application or document scrutiny status.
 */
export async function saveDocumentOcrResult(
  appId: string,
  requirementId: string,
  ocrResult: DocumentOcrResult
): Promise<CollegeApplication> {
  const app = await getApplicationById(appId, true);
  if (!app) throw new Error('Application dossier not found.');

  const documents = [...app.documents];
  const idx = documents.findIndex((d) => d.id === requirementId || d.requirementId === requirementId);

  if (idx < 0) {
    throw new Error('Target document was not found in the application dossier.');
  }

  const targetDoc = documents[idx];
  const updatedDoc: RequiredDocument = {
    ...targetDoc,
    ocrResult,
    extractedText: ocrResult.text,
    ocrExtractedAt: ocrResult.extractedAt,
    ocrMethod: ocrResult.method,
  };

  // Re-run duplicate detection now that OCR text is available
  try {
    const allCollegeApps = await getApplications({ collegeId: app.collegeId });
    const interimApp: CollegeApplication = {
      ...app,
      documents: documents.map((d, i) => (i === idx ? updatedDoc : d)),
    };
    const dupResult = await detectDocumentDuplicates(updatedDoc, interimApp, allCollegeApps);
    updatedDoc.duplicateCheckResult = dupResult;
  } catch (err) {
    console.warn('[VerifAI] Duplicate check error during OCR save:', err);
  }

  documents[idx] = updatedDoc;

  const updatedApp: CollegeApplication = {
    ...app,
    documents,
    lastUpdated: new Date().toISOString().split('T')[0],
  };

  return await createOrUpdateApplication(updatedApp);
}

/**
 * Saves automated document validation findings for a document in an application dossier.
 * This is strictly non-destructive and does NOT modify the document review status or application status.
 */
export async function saveDocumentValidationResult(
  appId: string,
  requirementId: string,
  validationResult: DocumentValidationResult
): Promise<CollegeApplication> {
  const app = await getApplicationById(appId, true);
  if (!app) throw new Error('Application dossier not found.');

  const documents = [...app.documents];
  const idx = documents.findIndex((d) => d.id === requirementId || d.requirementId === requirementId);

  if (idx < 0) {
    throw new Error('Target document was not found in the application dossier.');
  }

  const targetDoc = documents[idx];
  const updatedDoc: RequiredDocument = {
    ...targetDoc,
    validationResult,
    pdfMetadata: validationResult.pdfMetadata || targetDoc.pdfMetadata,
  };

  // Re-run duplicate detection now that validation fields are available
  try {
    const allCollegeApps = await getApplications({ collegeId: app.collegeId });
    const interimApp: CollegeApplication = {
      ...app,
      documents: documents.map((d, i) => (i === idx ? updatedDoc : d)),
    };
    const dupResult = await detectDocumentDuplicates(updatedDoc, interimApp, allCollegeApps);
    updatedDoc.duplicateCheckResult = dupResult;
  } catch (err) {
    console.warn('[VerifAI] Duplicate check error during validation save:', err);
  }

  documents[idx] = updatedDoc;

  const updatedApp: CollegeApplication = {
    ...app,
    documents,
    lastUpdated: new Date().toISOString().split('T')[0],
  };

  return await createOrUpdateApplication(updatedApp);
}

/**
 * Explicit helper to execute duplicate document detection for a specific document requirement.
 */
export async function checkDocumentDuplicates(
  appId: string,
  requirementId: string
): Promise<DuplicateDetectionResult | null> {
  const app = await getApplicationById(appId, true);
  if (!app) return null;

  const idx = app.documents.findIndex(
    (d) => d.id === requirementId || d.requirementId === requirementId
  );
  if (idx < 0) return null;

  const doc = app.documents[idx];
  const allCollegeApps = await getApplications({ collegeId: app.collegeId });
  const result = await detectDocumentDuplicates(doc, app, allCollegeApps);

  app.documents[idx].duplicateCheckResult = result;
  await createOrUpdateApplication(app);
  return result;
}

export async function updateApplicationStatus(
  appId: string,
  newStatus: ApplicationStatus,
  remarks?: string
): Promise<CollegeApplication> {
  const session = getActiveSession();
  if (!session || session.user?.role !== 'admin') {
    throw new Error('Access Denied: Only AICTE administrators can change overall application status.');
  }

  const app = await getApplicationById(appId);
  if (!app) throw new Error('Application dossier not found.');

  if (app.status === 'Draft' && newStatus !== 'Draft') {
    throw new Error(`Action Prohibited: Cannot transition a "Draft" application to "${newStatus}". The institution must submit the application first.`);
  }

  // Fix 1 Rule 7: Consistent validation for quick status transitions
  if (newStatus === 'Documents Verified') {
    const verification = await canApplicationBeDocumentsVerified(app, app.documents);
    if (!verification.canVerify) {
      throw new Error(
        `Cannot transition application to "Documents Verified": ${verification.reason}`
      );
    }
  }

  if (newStatus === 'Approved') {
    if (app.status === 'Draft') {
      throw new Error('Cannot approve application: Application is currently in "Draft" status.');
    }
    const hasReplacementRequired = app.documents.some((d) => d.status === 'Replacement Required');
    if (hasReplacementRequired) {
      throw new Error('Cannot approve application: One or more documents currently require replacement.');
    }
  }

  const now = new Date().toISOString().split('T')[0];
  const auditLogs = app.auditLogs || [];
  auditLogs.unshift({
    id: `LOG-${Date.now().toString().slice(-6)}`,
    timestamp: new Date().toISOString(),
    action: 'STATUS_CHANGED',
    actor: session.user.displayName || 'AICTE Central Admin',
    actorRole: 'admin',
    details: `Application status updated from "${app.status}" to "${newStatus}".${remarks ? ` Council Notes: ${remarks}` : ''}`,
  });

  const updatedApp: CollegeApplication = {
    ...app,
    status: newStatus,
    remarks: remarks || app.remarks,
    auditLogs,
    lastUpdated: now,
  };

  return await createOrUpdateApplication(updatedApp);
}

// ==========================================
// Regulatory & Infrastructure Compliance API
// ==========================================

export async function addInfrastructureEvidence(
  appId: string,
  evidenceData: {
    title: string;
    fileName: string;
    fileSize?: string;
    fileType: string;
    fileDataUrl?: string;
    evidenceCategory: InfrastructureEvidenceItem['evidenceCategory'];
    requirementId?: string;
    status?: InfrastructureEvidenceItem['status'];
    visualAnalysisSummary?: string;
  }
): Promise<CollegeApplication> {
  const session = getActiveSession();
  const app = await getApplicationById(appId, true);
  if (!app) throw new Error('Application dossier not found.');

  if (session?.user?.role === 'college' && app.collegeId !== session.user.collegeId) {
    throw new Error('Access Denied: You can only upload infrastructure evidence to your own institution application.');
  }

  // Prevent modification if already Approved
  if (app.status === 'Approved') {
    throw new Error('Action Prohibited: Cannot add evidence to an already Approved application.');
  }

  const now = new Date().toISOString().split('T')[0];
  const evidenceList = [...(app.infrastructureEvidence || [])];
  const randomSuffix = Math.random().toString(36).slice(2, 6);
  const evidenceId = `EVID-${Date.now().toString().slice(-6)}-${randomSuffix}`;

  let fileBlobId: string | undefined;

  // Process dataUrl: compress image if needed, validate <= 500 KiB Spark limit
  let processedDataUrl = evidenceData.fileDataUrl;
  if (processedDataUrl) {
    if (processedDataUrl.startsWith('data:image/')) {
      processedDataUrl = await compressImageForUpload(processedDataUrl);
    }
    const rawBytes = getDataUrlByteSize(processedDataUrl);
    if (rawBytes > MAX_SPARK_FILE_BYTES) {
      throw new Error(
        `Infrastructure evidence "${evidenceData.fileName}" (${(rawBytes / 1024).toFixed(0)} KB) exceeds the Spark Free Tier limit of 500 KB per document.`
      );
    }
  }

  // Upload to Firestore subcollection if in Cloud Mode
  if (isFirebaseConfigured && db && processedDataUrl) {
    fileBlobId = `blob_evid_${evidenceId}`;
    try {
      await uploadFileBlobToFirestore(app.id, fileBlobId, processedDataUrl, {
        fileName: evidenceData.fileName,
        fileType: evidenceData.fileType,
        requirementId: evidenceData.requirementId,
        version: 1,
      });
    } catch (err: any) {
      throw new Error(`Cloud Firestore evidence blob upload failed: ${err.message || 'Network failure'}`);
    }
  } else if (!isFirebaseConfigured && processedDataUrl) {
    fileBlobId = `local_evid_${evidenceId}`;
  }

  const fileUrlToStore = processedDataUrl;

  const rawItem: InfrastructureEvidenceItem = {
    id: evidenceId,
    applicationId: app.id,
    applicationTrack: app.type,
    title: evidenceData.title,
    fileName: evidenceData.fileName,
    fileSize: evidenceData.fileSize,
    fileType: evidenceData.fileType,
    fileDataUrl: fileUrlToStore,
    fileUrl: undefined,
    storagePath: undefined,
    fileBlobId,
    evidenceCategory: evidenceData.evidenceCategory,
    requirementId: evidenceData.requirementId,
    uploadDate: now,
    uploadedBy: session?.user?.displayName || session?.user?.email || app.collegeId,
    uploadedByRole: (session?.user?.role as any) || 'college',
    status: evidenceData.status || 'PENDING_REVIEW',
  };

  const analysis = analyzeMediaEvidence(rawItem);
  const newEvidence: InfrastructureEvidenceItem = {
    ...rawItem,
    visualAnalysisSummary: evidenceData.visualAnalysisSummary || analysis.summary,
    isUnsupportedMedia: analysis.isUnsupported,
    unsupportedMediaReason: analysis.unsupportedReason,
  };
  evidenceList.push(newEvidence);

  const auditLogs = app.auditLogs || [];
  auditLogs.unshift({
    id: `LOG-${Date.now().toString().slice(-6)}-${randomSuffix}`,
    timestamp: new Date().toISOString(),
    action: 'INFRASTRUCTURE_EVIDENCE_ADDED',
    actor: session?.user?.displayName || session?.user?.email || app.collegeId,
    actorRole: (session?.user?.role as any) || 'college',
    details: `Added infrastructure evidence: "${evidenceData.title}" (${evidenceData.evidenceCategory.replace(/_/g, ' ')}).`,
  });

  const updatedApp: CollegeApplication = {
    ...app,
    infrastructureEvidence: evidenceList,
    auditLogs,
    lastUpdated: now,
  };

  try {
    updatedApp.regulatoryComplianceAssessment = assessRegulatoryAndInfrastructureCompliance(updatedApp);
  } catch (err) {
    console.warn('[VerifAI] Regulatory compliance assessment error:', err);
  }

  try {
    return await createOrUpdateApplication(updatedApp);
  } catch (persistErr: any) {
    if (fileBlobId && isFirebaseConfigured && db) {
      try {
        await deleteFileBlobFromFirestore(app.id, fileBlobId);
      } catch (cleanErr) {
        console.warn('[VerifAI] Orphaned evidence blob cleanup warning:', cleanErr);
      }
    }
    throw new Error(`Infrastructure evidence blob uploaded, but database synchronization failed: ${persistErr.message}. The change was not saved.`);
  }
}

export async function removeInfrastructureEvidence(
  appId: string,
  evidenceId: string
): Promise<CollegeApplication> {
  const session = getActiveSession();
  const app = await getApplicationById(appId, true);
  if (!app) throw new Error('Application dossier not found.');

  if (session?.user?.role === 'college' && app.collegeId !== session.user.collegeId) {
    throw new Error('Access Denied: You can only modify your own institution infrastructure evidence.');
  }

  if (app.status === 'Approved') {
    throw new Error('Action Prohibited: Cannot remove evidence from an already Approved application.');
  }

  const evidenceList = [...(app.infrastructureEvidence || [])];
  const idx = evidenceList.findIndex((e) => e.id === evidenceId);
  if (idx < 0) return app;

  const removed = evidenceList[idx];
  if (removed.fileBlobId && isFirebaseConfigured && db) {
    await deleteFileBlobFromFirestore(app.id, removed.fileBlobId);
  }
  if (removed.storagePath && isFirebaseConfigured && storage) {
    await deleteFromCloudStorage(removed.storagePath);
  }
  evidenceList.splice(idx, 1);

  const auditLogs = app.auditLogs || [];
  auditLogs.unshift({
    id: `LOG-${Date.now().toString().slice(-6)}`,
    timestamp: new Date().toISOString(),
    action: 'INFRASTRUCTURE_EVIDENCE_REMOVED',
    actor: session?.user?.displayName || session?.user?.email || app.collegeId,
    actorRole: (session?.user?.role as any) || 'college',
    details: `Removed infrastructure evidence: "${removed.title}".`,
  });

  const updatedApp: CollegeApplication = {
    ...app,
    infrastructureEvidence: evidenceList,
    auditLogs,
    lastUpdated: new Date().toISOString().split('T')[0],
  };

  try {
    updatedApp.regulatoryComplianceAssessment = assessRegulatoryAndInfrastructureCompliance(updatedApp);
  } catch (err) {
    console.warn('[VerifAI] Regulatory compliance assessment error:', err);
  }

  return await createOrUpdateApplication(updatedApp);
}

export async function reviewInfrastructureEvidence(
  appId: string,
  evidenceId: string,
  review: {
    status: 'ACCEPTED' | 'FLAGGED';
    remarks?: string;
  }
): Promise<CollegeApplication> {
  const session = getActiveSession();
  if (session?.user?.role !== 'admin') {
    throw new Error('Access Denied: Only AICTE scrutiny officers can record evidence review decisions.');
  }

  const app = await getApplicationById(appId, true);
  if (!app) throw new Error('Application dossier not found.');

  const evidenceList = [...(app.infrastructureEvidence || [])];
  const item = evidenceList.find((e) => e.id === evidenceId);
  if (!item) throw new Error('Infrastructure evidence item not found in dossier.');

  const now = new Date().toISOString();
  item.status = review.status;
  item.reviewedBy = session.user.displayName || session.user.email || 'AICTE Officer';
  item.reviewedAt = now;
  item.reviewerRemarks = review.remarks;

  const auditLogs = app.auditLogs || [];
  auditLogs.unshift({
    id: `LOG-${Date.now().toString().slice(-6)}`,
    timestamp: now,
    action: 'INFRASTRUCTURE_EVIDENCE_REVIEWED',
    actor: session.user.displayName || session.user.email || 'AICTE Officer',
    actorRole: 'admin',
    details: `Scrutiny officer reviewed evidence "${item.title}": Status set to ${review.status}${review.remarks ? ` ("${review.remarks}")` : ''}.`,
  });

  const updatedApp: CollegeApplication = {
    ...app,
    infrastructureEvidence: evidenceList,
    auditLogs,
    lastUpdated: now.split('T')[0],
  };

  try {
    updatedApp.regulatoryComplianceAssessment = assessRegulatoryAndInfrastructureCompliance(updatedApp);
  } catch (err) {
    console.warn('[VerifAI] Dynamic reassessment on evidence review error:', err);
  }

  return await createOrUpdateApplication(updatedApp);
}

export async function recordOfficerInspectionDecision(
  appId: string,
  decisionData: {
    decision: OfficerInspectionDecision['decision'];
    remarks: string;
    followUpAction?: string;
  }
): Promise<CollegeApplication> {
  const session = getActiveSession();
  if (!session || session.user?.role !== 'admin') {
    throw new Error('Access Denied: Only authorized AICTE administrators can record physical inspection decisions.');
  }

  if (!decisionData.remarks?.trim()) {
    throw new Error('Mandatory: Scrutiny officer must provide remarks explaining the inspection decision.');
  }

  const app = await getApplicationById(appId);
  if (!app) throw new Error('Application dossier not found.');

  const nowIso = new Date().toISOString();
  const officerDecision: OfficerInspectionDecision = {
    decision: decisionData.decision,
    officerName: session.user.displayName || 'AICTE Central Admin',
    officerRole: 'admin',
    recordedAt: nowIso,
    remarks: decisionData.remarks.trim(),
    followUpAction: decisionData.followUpAction?.trim(),
  };

  const auditLogs = app.auditLogs || [];
  auditLogs.unshift({
    id: `LOG-${Date.now().toString().slice(-6)}`,
    timestamp: nowIso,
    action: 'INFRASTRUCTURE_ASSESSMENT_RECORDED',
    actor: session.user.displayName || 'AICTE Central Admin',
    actorRole: 'admin',
    details: `Recorded Scrutiny Inspection Decision: "${decisionData.decision.replace(/_/g, ' ')}". Remarks: ${decisionData.remarks.trim()}${decisionData.followUpAction ? ` | Action: ${decisionData.followUpAction.trim()}` : ''}`,
  });

  // Re-run assessment to ensure findings and recommendation are fresh, then attach officer decision
  const assessment = assessRegulatoryAndInfrastructureCompliance(app);
  assessment.officerDecision = officerDecision;

  const updatedApp: CollegeApplication = {
    ...app,
    regulatoryComplianceAssessment: assessment,
    auditLogs,
    lastUpdated: nowIso.split('T')[0],
  };

  return await createOrUpdateApplication(updatedApp);
}

export async function updateApplicationDeclaredInfrastructure(
  appId: string,
  declared: DeclaredInfrastructure
): Promise<CollegeApplication> {
  const session = getActiveSession();
  const app = await getApplicationById(appId, true);
  if (!app) throw new Error('Application dossier not found.');

  if (session?.user?.role === 'college' && app.collegeId !== session.user.collegeId) {
    throw new Error('Access Denied: You can only update your own institution application.');
  }

  const updatedApp: CollegeApplication = {
    ...app,
    declaredInfrastructure: declared,
    lastUpdated: new Date().toISOString().split('T')[0],
  };

  try {
    updatedApp.regulatoryComplianceAssessment = assessRegulatoryAndInfrastructureCompliance(updatedApp);
  } catch (err) {
    console.warn('[VerifAI] Regulatory compliance assessment error:', err);
  }

  return await createOrUpdateApplication(updatedApp);
}

export async function reassessApplicationRegulatoryCompliance(
  appId: string
): Promise<CollegeApplication> {
  const app = await getApplicationById(appId, true);
  if (!app) throw new Error('Application dossier not found.');

  const assessment = assessRegulatoryAndInfrastructureCompliance(app);
  const updatedApp: CollegeApplication = {
    ...app,
    regulatoryComplianceAssessment: assessment,
  };

  return await createOrUpdateApplication(updatedApp);
}

// ----------------------------------------------------------------------------
// Original Issuing Authority Verification Functions
// ----------------------------------------------------------------------------

export async function verifyDocumentWithIssuingAuthority(
  appId: string,
  docId: string,
  options?: VerificationExecutionOptions
): Promise<CollegeApplication> {
  const session = getActiveSession();
  const app = await getApplicationById(appId, true);
  if (!app) throw new Error('Application dossier not found.');

  // Find document
  const docIdx = app.documents.findIndex((d) => d.id === docId || d.requirementId === docId);
  if (docIdx < 0) throw new Error('Target document not found in application dossier.');
  const targetDoc = app.documents[docIdx];

  // Execute prioritized verification
  const verificationRecord = await executeAuthorityVerification(targetDoc, app, options);

  // Update history (append new record to history, preserving all earlier attempts)
  const history = [verificationRecord, ...(targetDoc.authorityVerificationHistory || [])];

  // Set active result bound to document
  const activeResult: AuthorityVerificationResult = {
    recordId: verificationRecord.id,
    status: verificationRecord.status,
    method: verificationRecord.method,
    authorityId: verificationRecord.authorityId,
    authorityName: verificationRecord.authorityName,
    officialSource: verificationRecord.officialSource,
    verifiedAt: verificationRecord.completedTimestamp || verificationRecord.attemptTimestamp,
    documentVersion: verificationRecord.documentVersion,
    isManualReview: verificationRecord.isManualReview,
    matchedFieldsCount: verificationRecord.matchedFields.length,
    mismatchedFieldsCount: verificationRecord.mismatchedFields.length,
    summary:
      verificationRecord.status === 'VERIFIED'
        ? `Verified by ${verificationRecord.authorityName} (${verificationRecord.method.replace(/_/g, ' ')})`
        : verificationRecord.status === 'DETAILS_MISMATCH'
        ? `Details mismatch detected against ${verificationRecord.authorityName} records`
        : verificationRecord.status === 'EXPIRED'
        ? `Official records confirm certificate expired`
        : verificationRecord.status === 'RECORD_NOT_FOUND'
        ? `No matching record found in ${verificationRecord.authorityName} registry`
        : `${verificationRecord.status.replace(/_/g, ' ')} (${verificationRecord.authorityName})`,
    details: [...verificationRecord.matchedFields, ...verificationRecord.mismatchedFields],
  };

  const updatedDocuments = [...app.documents];
  updatedDocuments[docIdx] = {
    ...targetDoc,
    authorityVerificationResult: activeResult,
    authorityVerificationHistory: history,
  };

  // Audit log action
  const auditLogs = app.auditLogs || [];
  const action: ApplicationAuditLog['action'] =
    verificationRecord.status === 'VERIFIED'
      ? 'AUTHORITY_VERIFICATION_COMPLETED'
      : verificationRecord.status === 'VERIFICATION_FAILED'
      ? 'AUTHORITY_VERIFICATION_FAILED'
      : 'AUTHORITY_VERIFICATION_COMPLETED';

  auditLogs.unshift({
    id: `LOG-${Date.now().toString().slice(-6)}-${Math.random().toString(36).slice(2, 6)}`,
    timestamp: new Date().toISOString(),
    action,
    actor: session?.user?.displayName || session?.user?.email || 'AICTE System',
    actorRole: (session?.user?.role as any) || 'admin',
    details: `Issuing authority verification executed for "${targetDoc.name}" (${verificationRecord.authorityName}): Status ${verificationRecord.status} via ${verificationRecord.method}.`,
  });

  const updatedApp: CollegeApplication = {
    ...app,
    documents: updatedDocuments,
    auditLogs,
    lastUpdated: new Date().toISOString().split('T')[0],
  };

  return await createOrUpdateApplication(updatedApp);
}

export async function recordManualAuthorityVerification(
  appId: string,
  docId: string,
  manualData: {
    decision: 'VERIFIED' | 'MISMATCH_FOUND' | 'UNABLE_TO_VERIFY';
    method?: 'Official Portal' | 'QR' | 'Other';
    officialSourceUsed: string;
    referenceNumberChecked?: string;
    remarks: string;
    mismatchedFields?: AuthorityFieldComparison[];
  }
): Promise<CollegeApplication> {
  const session = getActiveSession();
  if (session?.user?.role !== 'admin') {
    throw new Error('Access Denied: Only authorized AICTE Scrutiny Officers can record manual authority verification decisions.');
  }

  if (!manualData.remarks?.trim()) {
    throw new Error('Mandatory: Specific officer remarks must be provided when recording a manual verification decision.');
  }

  if (!manualData.officialSourceUsed?.trim()) {
    throw new Error('Mandatory: Official source or portal reference used must be specified.');
  }

  const app = await getApplicationById(appId, true);
  if (!app) throw new Error('Application dossier not found.');

  const docIdx = app.documents.findIndex((d) => d.id === docId || d.requirementId === docId);
  if (docIdx < 0) throw new Error('Target document not found in application dossier.');
  const targetDoc = app.documents[docIdx];

  const now = new Date().toISOString();
  const profile = findAuthorityProfile(targetDoc, targetDoc.requirementId);
  const status: AuthorityVerificationStatus =
    manualData.decision === 'VERIFIED'
      ? 'VERIFIED'
      : manualData.decision === 'MISMATCH_FOUND'
      ? 'DETAILS_MISMATCH'
      : 'MANUAL_REVIEW_REQUIRED';

  const verificationMethod = manualData.method || 'Official Portal';
  const refChecked = manualData.referenceNumberChecked?.trim() || undefined;
  const officerName = session.user.displayName || session.user.email || 'AICTE Scrutiny Officer';
  const officerEmail = session.user.email || undefined;
  const refSnippet = refChecked ? ` [Ref: ${refChecked}]` : '';

  const recordId = `VERIF-MANUAL-${Date.now().toString().slice(-6)}-${Math.random().toString(36).slice(2, 6)}`;
  const record: AuthorityVerificationRecord = {
    id: recordId,
    applicationId: app.id,
    applicationTrack: app.type,
    documentId: targetDoc.id,
    requirementId: targetDoc.requirementId,
    documentVersion: targetDoc.version || 1,
    fileHash: targetDoc.fileHash,
    authorityId: profile?.authorityId || 'MANUAL_OFFICER_REVIEW',
    authorityName: profile?.authorityName || 'AICTE Scrutiny Desk (Manual Verification)',
    method: 'MANUAL_ADMIN',
    officialSource: {
      name: manualData.officialSourceUsed.trim(),
      url: profile?.officialVerificationUrl,
      endpointType: 'MANUAL_DESK',
    },
    attemptTimestamp: now,
    completedTimestamp: now,
    status,
    matchedFields: manualData.decision === 'VERIFIED' ? [
      {
        field: 'manualDeskInspection',
        label: 'Officer Manual Scrutiny',
        submittedValue: targetDoc.name,
        officialValue: manualData.officialSourceUsed.trim(),
        match: true,
        reason: manualData.remarks.trim(),
      }
    ] : [],
    mismatchedFields: manualData.mismatchedFields || [],
    isManualReview: true,
    manualVerificationMethod: verificationMethod,
    referenceNumberChecked: refChecked,
    reviewer: {
      id: session.user.email || session.user.displayName || 'admin',
      name: officerName,
      email: officerEmail,
      role: 'admin',
      decision: manualData.decision,
      manualVerificationMethod: verificationMethod,
      referenceNumberChecked: refChecked,
      remarks: manualData.remarks.trim(),
      officialSourceUsed: manualData.officialSourceUsed.trim(),
      reviewedAt: now,
    },
  };

  const history = [record, ...(targetDoc.authorityVerificationHistory || [])];
  const activeResult: AuthorityVerificationResult = {
    recordId: record.id,
    status,
    method: 'MANUAL_ADMIN',
    authorityId: record.authorityId,
    authorityName: record.authorityName,
    officialSource: record.officialSource,
    verifiedAt: now,
    documentVersion: record.documentVersion,
    isManualReview: true,
    manualVerificationMethod: verificationMethod,
    referenceNumberChecked: refChecked,
    matchedFieldsCount: record.matchedFields.length,
    mismatchedFieldsCount: record.mismatchedFields.length,
    summary:
      manualData.decision === 'VERIFIED'
        ? `MANUALLY VERIFIED by Officer ${officerName} via ${verificationMethod} (${manualData.officialSourceUsed.trim()})${refSnippet}`
        : manualData.decision === 'MISMATCH_FOUND'
        ? `DISCREPANCY REPORTED by Officer ${officerName} via ${verificationMethod} (${manualData.officialSourceUsed.trim()})${refSnippet}`
        : `UNABLE TO VERIFY: Officer ${officerName} reported inconclusive via ${verificationMethod} (${manualData.officialSourceUsed.trim()})${refSnippet}`,
    reviewerDecision: manualData.decision,
    reviewerRemarks: manualData.remarks.trim(),
    reviewerName: officerName,
    reviewerEmail: officerEmail,
    details: [...record.matchedFields, ...record.mismatchedFields],
  };

  const updatedDocuments = [...app.documents];
  updatedDocuments[docIdx] = {
    ...targetDoc,
    authorityVerificationResult: activeResult,
    authorityVerificationHistory: history,
  };

  const auditLogs = app.auditLogs || [];
  auditLogs.unshift({
    id: `LOG-${Date.now().toString().slice(-6)}-${Math.random().toString(36).slice(2, 6)}`,
    timestamp: now,
    action: 'AUTHORITY_MANUAL_REVIEW_RECORDED',
    actor: officerName,
    actorRole: 'admin',
    details: `Manual authority verification recorded for "${targetDoc.name}": Decision "${manualData.decision}" via ${verificationMethod} (${manualData.officialSourceUsed.trim()})${refSnippet}. Remarks: "${manualData.remarks.trim()}".`,
  });

  const updatedApp: CollegeApplication = {
    ...app,
    documents: updatedDocuments,
    auditLogs,
    lastUpdated: now.split('T')[0],
  };

  return await createOrUpdateApplication(updatedApp);
}
