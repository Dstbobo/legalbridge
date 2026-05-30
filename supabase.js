// ============================================
// LEGALBRIDGE — SUPABASE CLIENT
// Central connection file for all pages
// Import this file in every HTML page
// ============================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ── CONFIG ────────────────────────────────────
const SUPABASE_URL = "https://qcutjnsxiawnejiqwwix.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFjdXRqbnN4aWF3bmVqaXF3d2l4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk1MzQzMzEsImV4cCI6MjA5NTExMDMzMX0.DNo2BtvdBzUgdLQaBytHcYHaHtyjh-ftERDqPBCT3RQ";
const EDGE_FUNCTION_URL = `${SUPABASE_URL}/functions/v1`;

// ── SUPABASE CLIENT ───────────────────────────
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
  },
});

// ============================================
// AUTH MODULE
// ============================================
export const Auth = {

  // Sign up with email and password
  async signUp(email, password, fullName) {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName },
      },
    });
    return { data, error };
  },

  // Sign in with email and password
  async signIn(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    return { data, error };
  },

  // Sign in with Google
  async signInWithGoogle() {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/chat.html`,
      },
    });
    return { data, error };
  },

  // Sign out
  async signOut() {
    const { error } = await supabase.auth.signOut();
    if (!error) window.location.href = "/login.html";
    return { error };
  },

  // Get current session
  async getSession() {
    const { data: { session } } = await supabase.auth.getSession();
    return session;
  },

  // Get current user
  async getUser() {
    const { data: { user } } = await supabase.auth.getUser();
    return user;
  },

  // Reset password
  async resetPassword(email) {
    const { data, error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password.html`,
    });
    return { data, error };
  },

  // Protect a page — redirect to login if not authenticated
  async requireAuth() {
    const session = await this.getSession();
    if (!session) {
      window.location.href = "/login.html";
      return null;
    }
    return session;
  },

  // Listen for auth state changes
  onAuthChange(callback) {
    return supabase.auth.onAuthStateChange((event, session) => {
      callback(event, session);
    });
  },
};

// ============================================
// CHATS MODULE
// ============================================
export const Chats = {

  // Create a new chat
  async create(userId, title = "New Case") {
    const { data, error } = await supabase
      .from("chats")
      .insert({ user_id: userId, title })
      .select()
      .single();
    return { data, error };
  },

  // Get all chats for a user
  async getAll(userId) {
    const { data, error } = await supabase
      .from("chats")
      .select("*")
      .eq("user_id", userId)
      .order("updated_at", { ascending: false });
    return { data, error };
  },

  // Rename a chat
  async rename(chatId, title) {
    const { data, error } = await supabase
      .from("chats")
      .update({ title })
      .eq("id", chatId)
      .select()
      .single();
    return { data, error };
  },

  // Delete a chat
  async delete(chatId) {
    const { error } = await supabase
      .from("chats")
      .delete()
      .eq("id", chatId);
    return { error };
  },

  // Archive a chat
  async archive(chatId) {
    const { data, error } = await supabase
      .from("chats")
      .update({ is_archived: true })
      .eq("id", chatId);
    return { data, error };
  },
};

// ============================================
// MESSAGES MODULE
// ============================================
export const Messages = {

  // Save a message
  async save(chatId, role, content, agentUsed = "openai", tokensUsed = 0) {
    const { data, error } = await supabase
      .from("messages")
      .insert({
        chat_id: chatId,
        role,
        content,
        agent_used: agentUsed,
        tokens_used: tokensUsed,
      })
      .select()
      .single();
    return { data, error };
  },

  // Get all messages for a chat
  async getAll(chatId) {
    const { data, error } = await supabase
      .from("messages")
      .select("*")
      .eq("chat_id", chatId)
      .order("created_at", { ascending: true });
    return { data, error };
  },

  // Delete all messages in a chat
  async deleteAll(chatId) {
    const { error } = await supabase
      .from("messages")
      .delete()
      .eq("chat_id", chatId);
    return { error };
  },
};

// ============================================
// AI MODULE — calls Edge Functions
// ============================================
export const AI = {

  // Send message to chat-handler Edge Function
  async chat(messages, fileType = null) {
    const session = await Auth.getSession();
    const headers = {
      "Content-Type": "application/json",
      "apikey": SUPABASE_ANON_KEY,
    };

    // Add auth token if logged in
    if (session) {
      headers["Authorization"] = `Bearer ${session.access_token}`;
    }

    const response = await fetch(`${EDGE_FUNCTION_URL}/chat-handler`, {
      method: "POST",
      headers,
      body: JSON.stringify({ messages, fileType }),
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "AI request failed");
    return data;
  },

  // Generate a legal document
  async generateDocument(templateId, formData, chatContext = []) {
    const session = await Auth.getSession();
    const headers = {
      "Content-Type": "application/json",
      "apikey": SUPABASE_ANON_KEY,
    };
    if (session) {
      headers["Authorization"] = `Bearer ${session.access_token}`;
    }

    const response = await fetch(`${EDGE_FUNCTION_URL}/doc-generator`, {
      method: "POST",
      headers,
      body: JSON.stringify({ templateId, formData, chatContext }),
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Document generation failed");
    return data;
  },
};

// ============================================
// DOCUMENTS MODULE
// ============================================
export const Documents = {

  // Upload a file to Supabase Storage
  async upload(file, userId) {
    const fileExt = file.name.split(".").pop();
    const filePath = `${userId}/${Date.now()}.${fileExt}`;

    const { data, error } = await supabase.storage
      .from("documents")
      .upload(filePath, file);

    if (error) return { data: null, error };

    // Get public URL
    const { data: urlData } = supabase.storage
      .from("documents")
      .getPublicUrl(filePath);

    return { data: { path: filePath, url: urlData.publicUrl }, error: null };
  },

  // Save document record to database
  async save(userId, chatId, filename, fileType, fileUrl, extractedText = "") {
    const { data, error } = await supabase
      .from("documents")
      .insert({
        user_id: userId,
        chat_id: chatId,
        filename,
        file_type: fileType,
        file_url: fileUrl,
        extracted_text: extractedText,
        status: "ready",
      })
      .select()
      .single();
    return { data, error };
  },

  // Get all documents for a user
  async getAll(userId) {
    const { data, error } = await supabase
      .from("documents")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    return { data, error };
  },

  // Delete a document
  async delete(documentId, filePath) {
    // Delete from storage
    await supabase.storage.from("documents").remove([filePath]);

    // Delete from database
    const { error } = await supabase
      .from("documents")
      .delete()
      .eq("id", documentId);
    return { error };
  },
};

// ============================================
// TEMPLATES MODULE
// ============================================
export const Templates = {

  // Get all templates
  async getAll() {
    const { data, error } = await supabase
      .from("templates")
      .select("*")
      .eq("is_active", true)
      .order("category", { ascending: true });
    return { data, error };
  },

  // Get templates by category
  async getByCategory(category) {
    const { data, error } = await supabase
      .from("templates")
      .select("*")
      .eq("category", category)
      .eq("is_active", true);
    return { data, error };
  },

  // Search templates
  async search(query) {
    const { data, error } = await supabase
      .from("templates")
      .select("*")
      .eq("is_active", true)
      .ilike("title", `%${query}%`);
    return { data, error };
  },

  // Get a single template
  async getOne(templateId) {
    const { data, error } = await supabase
      .from("templates")
      .select("*")
      .eq("id", templateId)
      .single();
    return { data, error };
  },
};

// ============================================
// GENERATED DOCUMENTS MODULE
// ============================================
export const GeneratedDocs = {

  // Save a generated document
  async save(userId, chatId, title, content, templateId = null) {
    const { data, error } = await supabase
      .from("generated_documents")
      .insert({
        user_id: userId,
        chat_id: chatId,
        title,
        content,
        template_id: templateId,
      })
      .select()
      .single();
    return { data, error };
  },

  // Get all generated documents for a user
  async getAll(userId) {
    const { data, error } = await supabase
      .from("generated_documents")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    return { data, error };
  },

  // Delete a generated document
  async delete(docId) {
    const { error } = await supabase
      .from("generated_documents")
      .delete()
      .eq("id", docId);
    return { error };
  },
};

// ============================================
// USER MODULE
// ============================================
export const User = {

  // Get user profile
  async getProfile(userId) {
    const { data, error } = await supabase
      .from("users")
      .select("*")
      .eq("id", userId)
      .single();
    return { data, error };
  },

  // Update user profile
  async updateProfile(userId, updates) {
    const { data, error } = await supabase
      .from("users")
      .update(updates)
      .eq("id", userId)
      .select()
      .single();
    return { data, error };
  },

  // Get user plan
  async getPlan(userId) {
    const { data, error } = await supabase
      .from("users")
      .select("plan")
      .eq("id", userId)
      .single();
    return data?.plan || "free";
  },
};

// ============================================
// AI USAGE MODULE
// ============================================
export const Usage = {

  // Log AI usage
  async log(userId, model, tokensUsed, requestType, costUsd = 0) {
    const { data, error } = await supabase
      .from("ai_usage")
      .insert({
        user_id: userId,
        model,
        tokens_used: tokensUsed,
        request_type: requestType,
        cost_usd: costUsd,
      });
    return { data, error };
  },

  // Get usage stats for a user
  async getStats(userId) {
    const { data, error } = await supabase
      .from("ai_usage")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    return { data, error };
  },
};

// ============================================
// NOTIFICATIONS MODULE
// ============================================
export const Notifications = {

  // Get all notifications for a user
  async getAll(userId) {
    const { data, error } = await supabase
      .from("notifications")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    return { data, error };
  },

  // Mark notification as read
  async markRead(notificationId) {
    const { error } = await supabase
      .from("notifications")
      .update({ is_read: true })
      .eq("id", notificationId);
    return { error };
  },

  // Mark all as read
  async markAllRead(userId) {
    const { error } = await supabase
      .from("notifications")
      .update({ is_read: true })
      .eq("user_id", userId);
    return { error };
  },
};

// ============================================
// HOW TO USE IN ANY HTML FILE:
// ============================================
//
// <script type="module">
//   import { Auth, AI, Chats, Messages } from "./supabase.js";
//
//   // Check if user is logged in
//   const session = await Auth.requireAuth();
//
//   // Send a message to AI
//   const result = await AI.chat([
//     { role: "user", content: "What is the Land Use Act in Nigeria?" }
//   ]);
//   console.log(result.response); // AI response
//   console.log(result.model);    // which AI was used
//
//   // Save message to database
//   await Messages.save(chatId, "user", "What is the Land Use Act?");
//   await Messages.save(chatId, "assistant", result.response, result.model);
// </script>
//
// ============================================
