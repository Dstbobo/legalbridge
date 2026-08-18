// "We're sorry — LegalBridge is back" broadcast.
// Apologises for the recent AI outage and invites every user to ask their
// legal questions again now that the assistant is fully restored.
//
// Admin-only: caller must present a verified user JWT whose server-managed
// app_metadata grants the LegalBridge admin role. Run with ?dryRun=1 first to
// get the recipient count without sending. Each user is
// marked (user_metadata.announced_backup) after a successful send so re-runs
// never double-email anyone. Sends are throttled for Resend rate limits.
import { createClient } from 'jsr:@supabase/supabase-js@2';
import {
  requireAdminPrincipal,
  requireMethod,
  securityErrorResponse,
} from '../_shared/security.ts';

const RESEND_KEY = Deno.env.get('RESEND_API_KEY') ?? '';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const FROM = 'LegalBridge <hello@legalbridge.ng>';
const FLAG = 'announced_backup';

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

function apologyHtml(name: string): string {
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
          <p style="font-size:18px;font-weight:700;color:#0d1b3e;margin:0 0 14px;">We're sorry for the inconvenience, ${name} 🙏</p>
          <p style="font-size:15px;line-height:23px;color:#3a4256;margin:0 0 18px;">
            Over the last little while, some of you may have had trouble getting answers from LegalBridge.
            We sincerely apologise for the inconvenience — that's not the experience we want for you.
          </p>
          <p style="font-size:15px;line-height:23px;color:#3a4256;margin:0 0 18px;">
            <strong>The good news:</strong> everything is fully back up and working. Our AI assistant is
            live again and ready to help you 24/7.
          </p>
          <p style="font-size:15px;line-height:23px;color:#3a4256;margin:0 0 22px;">
            👉 <strong>Open LegalBridge and ask any legal question</strong> — your rights, tenancy,
            employment, business, court process, and more. You can even ask in Hausa, Nigerian Pidgin,
            Yorùbá, or Igbo. We're here for you.
          </p>
          <p style="font-size:14px;line-height:22px;color:#6b7280;margin:0 0 4px;">
            Thank you for your patience and for trusting us.<br/>
            Reply to this email anytime — it reaches us directly.<br/>— The LegalBridge Team
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

  try {
    requireMethod(req, 'POST');
    await requireAdminPrincipal(req, { supabaseUrl: SUPABASE_URL, anonKey: ANON_KEY });
  } catch (error) {
    return securityErrorResponse(error, CORS);
  }
  const admin = createClient(SUPABASE_URL, SERVICE_KEY);

  const dryRun = new URL(req.url).searchParams.get('dryRun') === '1';

  type Target = { id: string; email: string; name: string; meta: Record<string, unknown> };
  const targets: Target[] = [];
  let alreadySent = 0;
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) {
      return new Response(JSON.stringify({ error: 'list_users_failed' }), {
        status: 502, headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }
    const users = data?.users ?? [];
    if (users.length === 0) break;
    for (const u of users) {
      if (!u.email || !u.email.includes('@')) continue;
      if (u.user_metadata?.[FLAG]) { alreadySent++; continue; }
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
          subject: "We're sorry — LegalBridge is back, ask us anything 🇳🇬",
          html: apologyHtml(t.name),
          reply_to: 'hello@legalbridge.ng',
        }),
      });
      if (res.ok) {
        sent++;
        await admin.auth.admin.updateUserById(t.id, {
          user_metadata: { ...t.meta, [FLAG]: true },
        });
      } else {
        failed.push(t.email);
      }
    } catch {
      failed.push(t.email);
    }
    await sleep(600);
  }

  return new Response(JSON.stringify({ sent, failedCount: failed.length, alreadySent }), {
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
});
