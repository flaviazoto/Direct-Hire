// src/lib/stores/onboarding.store.ts
// Zustand store — manages onboarding wizard state and syncs with backend

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { onboardingApi, uploadApi } from "@/lib/api-client";

export interface UploadEntry {
  id?:         string;
  fileType:    string;
  fileName?:   string;
  fileUrl?:    string;
  sizeBytes?:  number;
  status:      "idle" | "uploading" | "done" | "error";
  progress:    number;
  errorMsg?:   string;
}

interface OnboardingState {
  // Progress from server
  currentStep:      number;
  completedSteps:   number[];
  totalSteps:       number;
  onboardingStatus: string;
  completionPct:    number;
  lastSavedAt:      string | null;
  isSubmitted:      boolean;

  // Form data keyed by step
  stepData:         Record<number, Record<string, unknown>>;

  // Uploads
  uploads:          Record<string, UploadEntry>;

  // UI state
  isSaving:         boolean;
  isSubmitting:     boolean;
  saveError:        string | null;
  submitError:      string | null;
  loadError:        string | null;
  isLoaded:         boolean;

  // Actions
  loadProgress:     () => Promise<void>;
  saveStep:         (step: number, data: Record<string, unknown>) => Promise<boolean>;
  submitOnboarding: () => Promise<boolean>;
  setSubmitError:   (msg: string | null) => void;
  setStepData:      (step: number, data: Record<string, unknown>) => void;
  uploadFile:       (fileType: string, file: File) => Promise<boolean>;
  removeUpload:     (fileType: string) => Promise<void>;
  reset:            () => void;
}

export const useOnboardingStore = create<OnboardingState>()(
  persist(
    (set, get) => ({
      currentStep:      0,
      completedSteps:   [],
      totalSteps:       7,
      onboardingStatus: "DRAFT",
      completionPct:    0,
      lastSavedAt:      null,
      isSubmitted:      false,
      stepData:         {},
      uploads:          {},
      isSaving:         false,
      isSubmitting:     false,
      saveError:        null,
      submitError:      null,
      loadError:        null,
      isLoaded:         false,

      loadProgress: async () => {
        set({ loadError: null });
        const res = await onboardingApi.getProgress();
        if (!res.success) {
          set({ loadError: res.error ?? "Could not load your onboarding progress." });
          return;
        }
        const d = res.data as Record<string, unknown>;
        set({
          currentStep:      d.currentStep as number,
          completedSteps:   d.completedSteps as number[],
          totalSteps:       d.totalSteps as number,
          onboardingStatus: d.onboardingStatus as string,
          completionPct:    d.completionPct as number,
          lastSavedAt:      d.lastSavedAt as string,
          isSubmitted:      d.isSubmitted as boolean,
          isLoaded:         true,
        });

        // Load existing uploads
        const serverUploads = (d.uploads as Array<{
          fileType: string; id: string; fileName: string;
          fileUrl: string; sizeBytes: number;
        }>) ?? [];

        const uploadsMap: Record<string, UploadEntry> = {};
        for (const u of serverUploads) {
          uploadsMap[u.fileType] = {
            id:       u.id,
            fileType: u.fileType,
            fileName: u.fileName,
            fileUrl:  u.fileUrl,
            sizeBytes: u.sizeBytes,
            status:   "done",
            progress: 100,
          };
        }
        set({ uploads: uploadsMap });

        // Restore draft step data
        const draft = (d.draftData as Record<string, unknown>) ?? {};
        const stepData: Record<number, Record<string, unknown>> = {};
        for (const key of Object.keys(draft)) {
          const match = key.match(/^step_(\d+)$/);
          if (match) stepData[parseInt(match[1])] = draft[key] as Record<string, unknown>;
        }
        set({ stepData });
      },

      saveStep: async (step, data) => {
        set({ isSaving: true, saveError: null });
        get().setStepData(step, data);

        const res = await onboardingApi.saveStep(step, data);
        if (res.success) {
          const d = res.data as Record<string, unknown>;
          set({
            currentStep:    d.currentStep as number,
            completedSteps: d.completedSteps as number[],
            completionPct:  d.completionPct as number,
            lastSavedAt:    d.lastSavedAt as string,
            isSaving:       false,
          });
          return true;
        } else {
          set({ isSaving: false, saveError: res.error });
          return false;
        }
      },

      submitOnboarding: async () => {
        set({ isSubmitting: true, submitError: null });
        const res = await onboardingApi.submit();
        if (res.success) {
          set({ isSubmitting: false, isSubmitted: true, onboardingStatus: "SUBMITTED" });
          return true;
        } else {
          set({ isSubmitting: false, submitError: res.error });
          return false;
        }
      },

      setSubmitError: (msg) => set({ submitError: msg }),

      setStepData: (step, data) => {
        set((s) => ({ stepData: { ...s.stepData, [step]: { ...s.stepData[step], ...data } } }));
      },

      uploadFile: async (fileType, file) => {
        set((s) => ({
          uploads: {
            ...s.uploads,
            [fileType]: { fileType, status: "uploading", progress: 0, fileName: file.name },
          },
        }));

        const res = await uploadApi.upload(fileType, file, (pct) => {
          set((s) => ({
            uploads: {
              ...s.uploads,
              [fileType]: { ...s.uploads[fileType], progress: pct },
            },
          }));
        });

        if (res.success) {
          const d = res.data as { id: string; fileUrl: string; sizeBytes: number };
          set((s) => ({
            uploads: {
              ...s.uploads,
              [fileType]: {
                ...s.uploads[fileType],
                id:        d.id,
                fileUrl:   d.fileUrl,
                sizeBytes: d.sizeBytes,
                status:    "done",
                progress:  100,
              },
            },
          }));
          return true;
        } else {
          set((s) => ({
            uploads: {
              ...s.uploads,
              [fileType]: { ...s.uploads[fileType], status: "error", errorMsg: res.error },
            },
          }));
          return false;
        }
      },

      removeUpload: async (fileType) => {
        const entry = get().uploads[fileType];
        if (entry?.id) {
          await uploadApi.delete(entry.id);
        }
        set((s) => {
          const next = { ...s.uploads };
          delete next[fileType];
          return { uploads: next };
        });
      },

      reset: () => {
        set({
          currentStep: 0, completedSteps: [], completionPct: 0,
          stepData: {}, uploads: {}, isSubmitted: false,
          onboardingStatus: "DRAFT", isSaving: false, isSubmitting: false,
          saveError: null, submitError: null, loadError: null, isLoaded: false,
        });
      },
    }),
    {
      name:    "dh-onboarding",
      partialize: (s) => ({ stepData: s.stepData, currentStep: s.currentStep }),
    }
  )
);
