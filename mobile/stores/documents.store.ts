import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { create } from 'zustand';

import { supabase } from '@/services/auth.service';
import { splitSecurePayload } from '@/utils/secureChunks';

const LEGACY_STORAGE_KEY = 'lb_saved_documents';
const MAX_DOCUMENTS = 20;
const SECURE_OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

export interface SavedDocument {
  id: string;
  title: string;
  content: string;
  createdAt: number;
}

interface StoredDocumentIndex {
  id: string;
  chunks: number;
}

interface DocumentsState {
  documents: SavedDocument[];
  loaded: boolean;
  ownerId: string | null;
  load: () => Promise<void>;
  saveDocument: (title: string, content: string) => Promise<SavedDocument>;
  removeDocument: (id: string) => Promise<void>;
}

function secureKey(userId: string, suffix: string): string {
  return `lb.saved_documents.${userId}.${suffix}`;
}

async function currentUserId(): Promise<string> {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user?.id) throw new Error('Sign in before saving a document.');
  return data.user.id;
}

async function readIndex(userId: string): Promise<StoredDocumentIndex[]> {
  const raw = await SecureStore.getItemAsync(secureKey(userId, 'index'), SECURE_OPTIONS);
  if (!raw) return [];
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) return [];
  return parsed.filter((entry): entry is StoredDocumentIndex =>
    typeof entry?.id === 'string' && Number.isInteger(entry?.chunks) && entry.chunks > 0);
}

async function readDocument(userId: string, entry: StoredDocumentIndex): Promise<SavedDocument | null> {
  const chunks: string[] = [];
  for (let index = 0; index < entry.chunks; index += 1) {
    const value = await SecureStore.getItemAsync(
      secureKey(userId, `doc.${entry.id}.${index}`),
      SECURE_OPTIONS,
    );
    if (value === null) return null;
    chunks.push(value);
  }
  try {
    return JSON.parse(chunks.join('')) as SavedDocument;
  } catch {
    return null;
  }
}

async function writeDocument(userId: string, document: SavedDocument): Promise<StoredDocumentIndex> {
  const chunks = splitSecurePayload(JSON.stringify(document));
  for (let index = 0; index < chunks.length; index += 1) {
    await SecureStore.setItemAsync(
      secureKey(userId, `doc.${document.id}.${index}`),
      chunks[index],
      SECURE_OPTIONS,
    );
  }
  return { id: document.id, chunks: chunks.length };
}

async function deleteDocumentChunks(userId: string, entry: StoredDocumentIndex): Promise<void> {
  await Promise.all(
    Array.from({ length: entry.chunks }, (_, index) =>
      SecureStore.deleteItemAsync(secureKey(userId, `doc.${entry.id}.${index}`), SECURE_OPTIONS)),
  );
}

async function loadForUser(userId: string): Promise<{
  documents: SavedDocument[];
  index: StoredDocumentIndex[];
}> {
  const index = await readIndex(userId);
  const loaded = await Promise.all(index.map((entry) => readDocument(userId, entry)));
  return {
    documents: loaded.filter((document): document is SavedDocument => document !== null)
      .sort((a, b) => b.createdAt - a.createdAt),
    index,
  };
}

export const useDocumentsStore = create<DocumentsState>((set, get) => ({
  documents: [],
  loaded: false,
  ownerId: null,

  load: async () => {
    try {
      const userId = await currentUserId();
      // Legacy plaintext data was not account-scoped, so it cannot be safely
      // attributed during migration. Remove it instead of exposing one user's
      // legal document to the next account using the device.
      await AsyncStorage.removeItem(LEGACY_STORAGE_KEY).catch(() => {});
      const { documents } = await loadForUser(userId);
      set({ documents, loaded: true, ownerId: userId });
    } catch {
      set({ documents: [], loaded: true, ownerId: null });
    }
  },

  saveDocument: async (title, content) => {
    const userId = await currentUserId();
    let documents = get().ownerId === userId ? get().documents : [];
    if (get().ownerId !== userId) {
      ({ documents } = await loadForUser(userId));
    }

    const document: SavedDocument = {
      id: `doc_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      title: title.trim() || 'Untitled document',
      content: (content ?? '').trim(),
      createdAt: Date.now(),
    };
    const entry = await writeDocument(userId, document);
    const previousIndex = await readIndex(userId);
    const nextDocuments = [document, ...documents].slice(0, MAX_DOCUMENTS);
    const retainedIds = new Set(nextDocuments.map((item) => item.id));
    const evicted = previousIndex.filter((item) => !retainedIds.has(item.id));
    const nextIndex = [entry, ...previousIndex.filter((item) => retainedIds.has(item.id))];

    await SecureStore.setItemAsync(
      secureKey(userId, 'index'),
      JSON.stringify(nextIndex),
      SECURE_OPTIONS,
    );
    await Promise.all(evicted.map((item) => deleteDocumentChunks(userId, item)));
    set({ documents: nextDocuments, loaded: true, ownerId: userId });
    return document;
  },

  removeDocument: async (id) => {
    const userId = await currentUserId();
    const index = await readIndex(userId);
    const removed = index.find((entry) => entry.id === id);
    const nextIndex = index.filter((entry) => entry.id !== id);
    await SecureStore.setItemAsync(
      secureKey(userId, 'index'),
      JSON.stringify(nextIndex),
      SECURE_OPTIONS,
    );
    if (removed) await deleteDocumentChunks(userId, removed);
    const documents = get().ownerId === userId
      ? get().documents.filter((document) => document.id !== id)
      : [];
    set({ documents, loaded: true, ownerId: userId });
  },
}));

/** Derive a short title from the document body (first heading or first line). */
export function deriveDocTitle(content: string): string {
  const lines = content.split('\n').map((line) => line.trim()).filter(Boolean);
  for (const line of lines) {
    const clean = line.replace(/^#+\s*/, '').replace(/[*_`]/g, '').trim();
    if (clean.length >= 3) return clean.slice(0, 60);
  }
  return 'Legal document';
}
