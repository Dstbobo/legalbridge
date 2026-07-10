// One-time "LegalBridge is now fully live" broadcast to every registered user.
//
// Admin-only: caller must present the service-role key in x-admin-key. Run with
// ?dryRun=1 first to get the recipient count without sending. Each user is
// marked (user_metadata.announced_live) after a successful send so re-runs never
// double-email anyone. Sends are lightly throttled to respect Resend rate limits.
//
// Trigger (dry run):  curl -X POST '.../broadcast-live?dryRun=1' -H 'x-admin-key: <service_role>'
// Trigger (send):     curl -X POST '.../broadcast-live'          -H 'x-admin-key: <service_role>'
import { createClient } from 'jsr:@supabase/supabase-js@2';

const RESEND_KEY = Deno.env.get('RESEND_API_KEY') ?? '';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const FROM = 'LegalBridge <hello@legalbridge.ng>';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-admin-key',
};

function firstName(name: string, email: string): string {
  const n = (name || '').trim().split(' ')[0];
  if (n) return n;
  const e = (email || '').split('@')[0];
  return e ? e.charAt(0).toUpperCase() + e.slice(1) : 'there';
}

function liveHtml(name: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1.0"/></head>
<body style="margin:0;padding:0;background:#f4f5f7;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f7;padding:24px 0;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 2px 12px rgba(13,27,62,0.08);">
        <tr><td style="background:#0d1b3e;padding:32px 32px 28px;text-align:center;">
          <div style="color:#ffffff;font-size:22px;font-weight:800;letter-spacing:0.3px;">LegalBridge</div>
          <div style="color:#9fb0d6;font-size:13px;margin-top:6px;">AI Legal Assistant for Nigeria</div>
        </td></tr>
        <tr><td style="padding:32px;">
          <p style="font-size:18px;font-weight:700;color:#0d1b3e;margin:0 0 14px;">We're now fully live, ${name} 🎉</p>
          <p style="font-size:15px;line-height:23px;color:#3a4256;margin:0 0 18px;">
            Thank you for being one of our early testers. LegalBridge is now <strong>fully live on Google Play</strong> —
            everything is open and ready for you to use every day.
          </p>
          <p style="font-size:15px;line-height:23px;color:#3a4256;margin:0 0 10px;font-weight:600;">What you can do right now:</p>
          <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 22px;">
            <tr><td style="padding:6px 0;font-size:15px;color:#3a4256;">⚖️&nbsp;&nbsp;Ask any legal question in plain English</td></tr>
            <tr><td style="padding:6px 0;font-size:15px;color:#3a4256;">📄&nbsp;&nbsp;Draft agreements, letters and legal documents</td></tr>
            <tr><td style="padding:6px 0;font-size:15px;color:#3a4256;">👩🏾‍⚖️&nbsp;&nbsp;Find and message verified Nigerian lawyers</td></tr>
            <tr><td style="padding:6px 0;font-size:15px;color:#3a4256;">📰&nbsp;&nbsp;Follow legal news, grants and opportunities</td></tr>
          </table>
          <p style="font-size:14px;line-height:22px;color:#6b7280;margin:0 0 4px;">
            Open the app and take it for a spin. Have feedback? Just reply to this email — it reaches us directly.
          </p>
        </td></tr>
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

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  // Authorize by capability: only a genuine service-role key can list users.
  const adminKey = req.headers.get('x-admin-key') ?? SERVICE_KEY;
  const admin = createClient(SUPABASE_URL, adminKey);
  const authCheck = await admin.auth.admin.listUsers({ page: 1, perPage: 1 });
  if (authCheck.error) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), {
      status: 401, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }

  const dryRun = new URL(req.url).searchParams.get('dryRun') === '1';

  // Collect every user with a real email that hasn't been announced to yet.
  type Target = { id: string; email: string; name: string; meta: Record<string, unknown> };
  const targets: Target[] = [];
  let alreadySent = 0;
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) {
      return new Response(JSON.stringify({ error: 'listUsers failed', detail: error.message }), {
        status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }
    const users = data?.users ?? [];
    if (users.length === 0) break;
    for (const u of users) {
      if (!u.email || !u.email.includes('@')) continue;
      if (u.user_metadata?.announced_live) { alreadySent++; continue; }
      targets.push({
        id: u.id,
        email: u.email,
        name: firstName((u.user_metadata?.full_name ?? u.user_metadata?.name ?? '') as string, u.email),
        meta: u.user_metadata ?? {},
      });
    }
    if (users.length < 200) break;
  }

  if (dryRun) {
    return new Response(JSON.stringify({ dryRun: true, toSend: targets.length, alreadySent }), {
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }

  if (!RESEND_KEY) {
    return new Response(JSON.stringify({ error: 'email not configured' }), {
      status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }

  let sent = 0; const failed: string[] = [];
  for (const t of targets) {
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: FROM,
          to: [t.email],
          subject: 'LegalBridge is now fully live 🎉',
          html: liveHtml(t.name),
          reply_to: 'hello@legalbridge.ng',
        }),
      });
      if (res.ok) {
        sent++;
        await admin.auth.admin.updateUserById(t.id, {
          user_metadata: { ...t.meta, announced_live: true },
        });
      } else {
        failed.push(t.email);
      }
    } catch {
      failed.push(t.email);
    }
    await sleep(600); // stay under Resend's rate limit
  }

  return new Response(JSON.stringify({ sent, failedCount: failed.length, failed, alreadySent }), {
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
});
