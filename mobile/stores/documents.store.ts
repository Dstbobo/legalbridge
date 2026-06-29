import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'lb_saved_documents';

export interface SavedDocument {
  id: string;
  title: string;
  content: string;
  createdAt: number;
}

interface DocumentsState {
  documents: SavedDocument[];
  loaded: boolean;
  load: () => Promise<void>;
  saveDocument: (title: string, content: string) => Promise<SavedDocument>;
  removeDocument: (id: string) => Promise<void>;
}

async function persist(docs: SavedDocument[]) {
  try { await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(docs)); } catch {}
}

export const useDocumentsStore = create<DocumentsState>((set, get) => ({
  documents: [],
  loaded: false,

  load: async () => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      const docs: SavedDocument[] = raw ? JSON.parse(raw) : [];
      set({ documents: docs.sort((a, b) => b.createdAt - a.createdAt), loaded: true });
    } catch {
      set({ loaded: true });
    }
  },

  saveDocument: async (title, content) => {
    const doc: SavedDocument = {
      id: `doc_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      title: title.trim() || 'Untitled document',
      content: (content ?? '').trim(),
      createdAt: Date.now(),
    };
    const next = [doc, ...get().documents];
    set({ documents: next });
    await persist(next);
    return doc;
  },

  removeDocument: async (id) => {
    const next = get().documents.filter((d) => d.id !== id);
    set({ documents: next });
    await persist(next);
  },
}));

/** Derive a short title from the document body (first heading or first line). */
export function deriveDocTitle(content: string): string {
  const lines = content.split('\n').map((l) => l.trim()).filter(Boolean);
  for (const l of lines) {
    const clean = l.replace(/^#+\s*/, '').replace(/[*_`]/g, '').trim();
    if (clean.length >= 3) return clean.slice(0, 60);
  }
  return 'Legal document';
}
