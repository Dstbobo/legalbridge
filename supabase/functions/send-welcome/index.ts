// Sends the one-time "Welcome to LegalBridge" email via Resend.
//
// Called by the app right after a user finishes onboarding (see
// mobile/services/auth.service.ts → sendWelcomeEmail). Authenticated with the
// user's own JWT, so it can only ever email the signed-in user's own address.
// A `welcomed` flag on the user's metadata guarantees the email fires only once,
// no matter how many times the app calls it.
import { createClient } from 'jsr:@supabase/supabase-js@2';

const RESEND_KEY = Deno.env.get('RESEND_API_KEY') ?? '';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const FROM = 'LegalBridge <hello@legalbridge.ng>';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function firstName(name: string, email: string): string {
  const n = (name || '').trim().split(' ')[0];
  if (n) return n;
  const e = (email || '').split('@')[0];
  return e ? e.charAt(0).toUpperCase() + e.slice(1) : 'there';
}

/** The branded HTML email. Kept inline (no external assets) so it renders
 *  identically across Gmail, Outlook and mobile clients. */
function welcomeHtml(name: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1.0"/></head>
<body style="margin:0;padding:0;background:#f4f5f7;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f7;padding:24px 0;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 2px 12px rgba(13,27,62,0.08);">
        <!-- Header -->
        <tr><td style="background:#0d1b3e;padding:32px 32px 28px;text-align:center;">
          <div style="color:#ffffff;font-size:22px;font-weight:800;letter-spacing:0.3px;">LegalBridge</div>
          <div style="color:#9fb0d6;font-size:13px;margin-top:6px;">AI Legal Assistant for Nigeria</div>
        </td></tr>
        <!-- Body -->
        <tr><td style="padding:32px;">
          <p style="font-size:18px;font-weight:700;color:#0d1b3e;margin:0 0 14px;">Welcome, ${name} 👋</p>
          <p style="font-size:15px;line-height:23px;color:#3a4256;margin:0 0 18px;">
            Thanks for joining LegalBridge. You now have a legal assistant in your pocket — trained on
            Nigerian law and ready whenever you need it.
          </p>
          <p style="font-size:15px;line-height:23px;color:#3a4256;margin:0 0 10px;font-weight:600;">Here's what you can do right away:</p>
          <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 22px;">
            <tr><td style="padding:6px 0;font-size:15px;color:#3a4256;">⚖️&nbsp;&nbsp;Ask any legal question in plain English</td></tr>
            <tr><td style="padding:6px 0;font-size:15px;color:#3a4256;">📄&nbsp;&nbsp;Draft agreements, letters and legal documents</td></tr>
            <tr><td style="padding:6px 0;font-size:15px;color:#3a4256;">👩🏾‍⚖️&nbsp;&nbsp;Find and message verified Nigerian lawyers</td></tr>
            <tr><td style="padding:6px 0;font-size:15px;color:#3a4256;">📰&nbsp;&nbsp;Follow legal news, grants and opportunities</td></tr>
          </table>
          <p style="font-size:14px;line-height:22px;color:#6b7280;margin:0 0 4px;">
            Have a question or feedback? Just reply to this email — it reaches us directly.
          </p>
        </td></tr>
        <!-- Disclaimer / footer -->
        <tr><td style="padding:20px 32px 28px;border-top:1px solid #eef0f4;">
          <p style="font-size:12px;line-height:18px;color:#9aa1b0;margin:0;">
            LegalBridge is an independent app — not affiliated with or representing any government entity.
            It provides general legal information, not legal advice. For advice on your specific situation,
            consult a qualified lawyer.
          </p>
        </td></tr>
      </table>
      <div style="max-width:520px;font-size:11px;color:#b4bac6;text-align:center;margin-top:16px;">
        © ${new Date().getFullYear()} LegalBridge · Nigeria
      </div>
    </td></tr>
  </table>
</body>
</html>`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  const authHeader = req.headers.get('Authorization') ?? '';
  if (!authHeader) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), {
      status: 401, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }

  // Identify the caller from their own JWT — we only ever email this user.
  const asUser = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error: userErr } = await asUser.auth.getUser();
  if (userErr || !user?.email) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), {
      status: 401, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }

  // Fire once per user — if we've already welcomed them, do nothing.
  if (user.user_metadata?.welcomed) {
    return new Response(JSON.stringify({ sent: false, reason: 'already welcomed' }), {
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }

  if (!RESEND_KEY) {
    return new Response(JSON.stringify({ error: 'email not configured' }), {
      status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }

  const who = firstName(
    (user.user_metadata?.full_name ?? user.user_metadata?.name ?? '') as string,
    user.email,
  );

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: FROM,
      to: [user.email],
      subject: 'Welcome to LegalBridge',
      html: welcomeHtml(who),
      reply_to: 'hello@legalbridge.ng',
    }),
  });

  if (!res.ok) {
    const detail = await res.text();
    return new Response(JSON.stringify({ error: 'send failed', detail }), {
      status: 502, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }

  // Mark as welcomed so we never send twice (needs service role to write metadata).
  const admin = createClient(SUPABASE_URL, SERVICE_KEY);
  await admin.auth.admin.updateUserById(user.id, {
    user_metadata: { ...user.user_metadata, welcomed: true },
  });

  return new Response(JSON.stringify({ sent: true }), {
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
});
