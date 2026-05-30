/**
 * LegalBridge Chat API
 * Single file that handles all communication between
 * chat.html and the chat-router Edge Function.
 * 
 * Usage in chat.html:
 * <script src="chat-api.js"></script>
 * ChatAPI.send({ message, onChunk, onDone, onError })
 */

const ChatAPI = (() => {

  // ── CONFIG ──
  const SUPABASE_URL = 'https://qcutjnsxiawnejiqwwix.supabase.co';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFjdXRqbnN4aWF3bmVqaXF3d2l4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDY3MzQzMDIsImV4cCI6MjA2MjMxMDMwMn0.pdpGBbgbPYPZdF1DxaGaIMIwLFwTZ8zHnPUJUyKNtpM';
  const ROUTER_URL = `${SUPABASE_URL}/functions/v1/chat-router`;

  // ── STATE ──
  let currentSession = null;
  let userProfile = null;
  let isReady = false;

  // ── LOADING MESSAGES BY USER TYPE AND INTENT ──
  const LOADING_MESSAGES = {
    conversational: {
      lawyer: 'Connecting with your legal colleague...',
      student: 'Ready to help with your studies...',
      business: 'Preparing your business advisory...',
      journalist: 'Connecting with your press law advisor...',
      other: 'LegalBridge is thinking...'
    },
    legal: {
      lawyer: 'Retrieving NWLR and LPELR authorities...',
      student: 'Researching applicable law and precedents...',
      business: 'Analysing regulatory framework...',
      journalist: 'Checking FOI Act and press law provisions...',
      other: 'Looking up your rights under Nigerian law...'
    },
    documents: {
      lawyer: 'Drafting your legal document...',
      student: 'Preparing your document...',
      business: 'Drafting your business document...',
      journalist: 'Preparing your document...',
      other: 'Drafting your document...'
    },
    search: {
      lawyer: 'Searching latest Nigerian legal developments...',
      student: 'Searching for recent legal updates...',
      business: 'Searching latest regulatory updates...',
      journalist: 'Searching Nigerian legal news...',
      other: 'Searching for the latest Nigerian legal news...'
    },
    vision: {
      lawyer: 'Scanning and analysing your document...',
      student: 'Extracting and analysing document text...',
      business: 'Scanning your business document...',
      journalist: 'Analysing your document...',
      other: 'Reading and analysing your document...'
    },
    evidence: {
      lawyer: 'Analysing evidence under Evidence Act 2011...',
      student: 'Conducting evidence law analysis...',
      business: 'Analysing your evidence...',
      journalist: 'Analysing your exhibit...',
      other: 'Analysing your evidence...'
    }
  };

  // ── INITIALISE — load session and profile ──
  async function init(supabaseClient) {
    try {
      const { data: { session } } = await supabaseClient.auth.getSession();
      if (!session) return false;

      currentSession = session;

      // Load user profile
      const { data: profiles } = await supabaseClient
        .from('profiles')
        .select('*')
        .eq('id', session.user.id)
        .single();

      userProfile = profiles || {};
      isReady = true;
      return true;
    } catch (e) {
      console.error('ChatAPI init error:', e);
      return false;
    }
  }

  // ── GET LOADING MESSAGE ──
  function getLoadingMessage(message, images) {
    const userType = userProfile?.user_type || 'other';

    // Detect intent for loading message
    if (images && images.length > 0) {
      const isEvidence = /\b(evidence|exhibit|admissib|court|chain of custody|forgery|forensic)\b/i.test(message);
      const intent = isEvidence ? 'evidence' : 'vision';
      return LOADING_MESSAGES[intent][userType] || LOADING_MESSAGES[intent]['other'];
    }

    if (/\b(latest|recent|current|today|new law|amendment|breaking|news|update|gazette)\b/i.test(message)) {
      return LOADING_MESSAGES['search'][userType] || LOADING_MESSAGES['search']['other'];
    }

    if (/\b(evidence|admissib|hearsay|confessional|chain of custody|exhibit|forensic|forgery)\b/i.test(message)) {
      return LOADING_MESSAGES['evidence'][userType] || LOADING_MESSAGES['evidence']['other'];
    }

    if (/\b(draft|prepare|write|generate)\b.{0,30}\b(affidavit|agreement|contract|deed|petition|motion|writ|notice|memo|letter)\b/i.test(message)) {
      return LOADING_MESSAGES['documents'][userType] || LOADING_MESSAGES['documents']['other'];
    }

    if (/\b(advise|analyse|legal opinion|section \d+|case law|sue|file a case|is it legal|bail|landlord|divorce|employment|land|company)\b/i.test(message)) {
      return LOADING_MESSAGES['legal'][userType] || LOADING_MESSAGES['legal']['other'];
    }

    return LOADING_MESSAGES['conversational'][userType] || LOADING_MESSAGES['conversational']['other'];
  }

  // ── SEND MESSAGE ──
  async function send({
    message = '',
    images = [],
    chatId = null,
    onChunk,        // called with each text chunk
    onDone,         // called when stream completes with full text
    onError,        // called on error
    onLoadingMsg,   // called immediately with loading message
  }) {
    if (!currentSession) {
      onError && onError('Not authenticated');
      return;
    }

    // Show contextual loading message immediately
    const loadingMsg = getLoadingMessage(message, images);
    onLoadingMsg && onLoadingMsg(loadingMsg);

    try {
      const res = await fetch(ROUTER_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${currentSession.access_token}`
        },
        body: JSON.stringify({
          message,
          images,
          chatId
        })
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({ error: 'Request failed' }));
        throw new Error(errData.error || `Error ${res.status}`);
      }

      const isStream = res.headers.get('X-Stream') === '1';
      const intent = res.headers.get('X-Intent') || 'conversational';

      if (!isStream || !res.body) {
        // Non-streaming fallback
        const data = await res.json();
        if (!data.success) throw new Error(data.error || 'Request failed');
        onChunk && onChunk(data.response);
        onDone && onDone(data.response);
        return;
      }

      // ── READ SSE STREAM ──
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let fullText = '';
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // keep incomplete line in buffer

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6).trim();
          if (data === '[DONE]') {
            onDone && onDone(fullText);
            return;
          }
          try {
            const parsed = JSON.parse(data);
            if (parsed.text) {
              fullText += parsed.text;
              onChunk && onChunk(parsed.text, fullText);
            }
          } catch { /* skip malformed chunks */ }
        }
      }

      // Stream ended without [DONE]
      onDone && onDone(fullText);

    } catch (err) {
      console.error('ChatAPI error:', err);
      onError && onError(err.message || 'Something went wrong. Please try again.');
    }
  }

  // ── UPLOAD IMAGE — convert to base64 ──
  async function imageToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const base64 = reader.result.split(',')[1];
        resolve({
          mimeType: file.type || 'image/jpeg',
          data: base64,
          name: file.name
        });
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  // ── PROCESS MULTIPLE FILES ──
  async function processFiles(files) {
    const processed = [];
    for (const file of files) {
      if (file.type.startsWith('image/')) {
        const img = await imageToBase64(file);
        processed.push(img);
      }
    }
    return processed;
  }

  // ── GET USER TYPE ──
  function getUserType() {
    return userProfile?.user_type || 'other';
  }

  // ── GET USER PROFILE ──
  function getProfile() {
    return userProfile || {};
  }

  // ── CHECK IF READY ──
  function ready() {
    return isReady;
  }

  // ── PUBLIC API ──
  return {
    init,
    send,
    processFiles,
    getLoadingMessage,
    getUserType,
    getProfile,
    ready
  };

})();
