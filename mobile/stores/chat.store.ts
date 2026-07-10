import { create } from 'zustand';

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  isStreaming?: boolean;
  isDocument?: boolean;  // true when this message is a generated legal document
  kind?: 'chat' | 'draft' | 'vision';  // what the AI is doing — drives the thinking status
}

interface ChatState {
  messages: Message[];
  sessionId: string | null;
  isLoading: boolean;
  streamingContent: string;
  mode: 'chat' | 'document';  // chat = general AI, document = document drafting
  addUserMessage: (content: string) => string;
  startStreaming: (id: string, isDocument?: boolean, kind?: Message['kind']) => void;
  appendStream: (chunk: string) => void;
  finaliseStream: (id: string) => void;
  setSession: (sessionId: string) => void;
  setLoading: (loading: boolean) => void;
  setMode: (mode: 'chat' | 'document') => void;
  setMessages: (messages: Message[]) => void;
  clearChat: () => void;
}

const genId = () => Math.random().toString(36).slice(2);

export const useChatStore = create<ChatState>((set) => ({
  messages: [],
  sessionId: null,
  isLoading: false,
  streamingContent: '',
  mode: 'chat',

  addUserMessage: (content) => {
    const id = genId();
    set((s) => ({
      messages: [...s.messages, { id, role: 'user', content, timestamp: new Date() }],
    }));
    return id;
  },

  startStreaming: (id, isDocument = false, kind = isDocument ? 'draft' : 'chat') => {
    set((s) => ({
      streamingContent: '',
      messages: [...s.messages, {
        id, role: 'assistant', content: '', timestamp: new Date(), isStreaming: true, isDocument, kind,
      }],
    }));
  },

  appendStream: (chunk) => {
    set((s) => {
      const messages = s.messages.map((m) =>
        m.isStreaming ? { ...m, content: m.content + chunk } : m,
      );
      return { messages, streamingContent: s.streamingContent + chunk };
    });
  },

  finaliseStream: (id) => {
    set((s) => ({
      messages: s.messages.map((m) =>
        m.id === id ? { ...m, isStreaming: false } : m,
      ),
      isLoading: false,
      streamingContent: '',
    }));
  },

  setSession: (sessionId) => set({ sessionId }),
  setLoading: (isLoading) => set({ isLoading }),
  setMode: (mode) => set({ mode }),
  setMessages: (messages) => set({ messages, streamingContent: '', isLoading: false }),
  clearChat: () => set({ messages: [], sessionId: null, streamingContent: '', isLoading: false }),
}));
