// LegalBridge news ingestion: pulls enabled RSS sources, dedupes, stores
// headline + summary + link ONLY (never full article bodies — copyright).
// Invoke manually or on a schedule (pg_cron / external cron hitting this URL).
import { createClient } from 'jsr:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const db = createClient(SUPABASE_URL, SERVICE_KEY);

function pick(xml: string, tag: string): string {
  const m = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i'));
  if (!m) return '';
  let s = m[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');
  // Decode entities FIRST (feeds escape their HTML), then strip the real tags.
  s = s
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&nbsp;/g, ' ');
  s = s.replace(/<[^>]+>/g, ' ');
  return s.replace(/\s+/g, ' ').trim();
}

/** A summary is junk if it's leftover markup or just repeats the headline. */
function cleanSummary(summary: string, title: string): string | null {
  const s = summary.trim();
  if (!s || s.length < 30) return null;
  if (/https?:\/\/|href=|news\.google\.com/i.test(s)) return null;
  const a = s.toLowerCase().slice(0, 80);
  const b = title.toLowerCase().slice(0, 80);
  if (a.startsWith(b) || b.startsWith(a)) return null;
  return s.slice(0, 400);
}

/** Reject icons, avatars, tracking pixels and other non-photo junk. */
function isRealImage(url: string | null | undefined): url is string {
  if (!url || !/^https?:\/\//i.test(url)) return false;
  if (/gravatar|emoji|avatar|favicon|logo|icon|pixel|badge|feedburner|1x1|spacer|blank\.|\.svg/i.test(url)) return false;
  return true;
}

function pickImage(itemXml: string): string | null {
  const candidates = [
    itemXml.match(/<media:content[^>]+url="([^"]+)"/i)?.[1],
    itemXml.match(/<media:thumbnail[^>]+url="([^"]+)"/i)?.[1],
    itemXml.match(/<enclosure[^>]+url="([^"]+\.(?:jpg|jpeg|png|webp)[^"]*)"/i)?.[1],
    itemXml.match(/<img[^>]+src="([^"]+)"/i)?.[1],
  ];
  for (const c of candidates) if (isRealImage(c)) return c!;
  return null;
}

/**
 * Fetch the article page and pull its official share image (og:image) —
 * the same preview WhatsApp/Twitter show. Also resolves Google News redirect
 * wrappers to the real publisher URL when possible.
 */
async function resolveArticle(url: string): Promise<{ image: string | null; finalUrl: string | null }> {
  try {
    const res = await fetch(url, {
      headers: { 'user-agent': 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36' },
      signal: AbortSignal.timeout(8000),
      redirect: 'follow',
    });
    if (!res.ok) return { image: null, finalUrl: null };
    const finalUrl = res.url && !res.url.includes('news.google.com') ? res.url : null;
    const html = (await res.text()).slice(0, 300_000);

    let img =
      html.match(/<meta[^>]+property="og:image"[^>]+content="([^"]+)"/i)?.[1] ??
      html.match(/<meta[^>]+content="([^"]+)"[^>]+property="og:image"/i)?.[1] ??
      html.match(/<meta[^>]+name="twitter:image"[^>]+content="([^"]+)"/i)?.[1] ??
      null;

    // Google News wrapper page: dig out the real publisher link and try once more.
    if (!img && res.url.includes('news.google.com')) {
      const target = html.match(/href="(https?:\/\/(?!news\.google|accounts\.google|www\.google)[^"]+)"/i)?.[1];
      if (target) return await resolveArticle(target);
    }
    return { image: isRealImage(img) ? img : null, finalUrl };
  } catch {
    return { image: null, finalUrl: null };
  }
}

async function sha1(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Google News titles look like "Headline - Publisher"; recover the publisher. */
function splitTitle(rawTitle: string, fallbackSource: string) {
  const i = rawTitle.lastIndexOf(' - ');
  if (i > 20) return { title: rawTitle.slice(0, i).trim(), source: rawTitle.slice(i + 3).trim() };
  return { title: rawTitle, source: fallbackSource };
}

Deno.serve(async (req) => {
  if (req.method !== 'POST' && req.method !== 'GET') {
    return new Response('Method not allowed', { status: 405 });
  }

  const { data: sources, error: srcErr } = await db
    .from('news_sources').select('*').eq('enabled', true);
  if (srcErr) return Response.json({ error: srcErr.message }, { status: 500 });

  let inserted = 0, skipped = 0, failed = 0;

  for (const src of sources ?? []) {
    try {
      const res = await fetch(src.feed_url, {
        headers: { 'user-agent': 'LegalBridgeBot/1.0 (news aggregation; link-out only)' },
        signal: AbortSignal.timeout(20000),
      });
      if (!res.ok) { failed++; continue; }
      const xml = await res.text();
      const items = xml.match(/<item[\s\S]*?<\/item>/gi) ?? [];

      for (const item of items.slice(0, 25)) {
        const rawTitle = pick(item, 'title');
        const link = pick(item, 'link') || (item.match(/<link[^>]*>([^<]+)/i)?.[1] ?? '').trim();
        if (!rawTitle || !link) continue;

        const { title, source } = splitTitle(rawTitle, src.name);
        const hash = await sha1(`${link}|${title}`.toLowerCase());
        const summary = cleanSummary(pick(item, 'description'), title);
        const pub = pick(item, 'pubDate');

        // Skip resolution work for items we already have.
        const { data: existing } = await db
          .from('news_articles').select('id').eq('content_hash', hash).maybeSingle();
        if (existing) { skipped++; continue; }

        // Every headline gets its picture: feed image if real, else the
        // article page's official og:image (like WhatsApp link previews).
        let imageUrl = pickImage(item);
        let articleUrl = link;
        if (!imageUrl) {
          const r = await resolveArticle(link);
          imageUrl = r.image;
          if (r.finalUrl) articleUrl = r.finalUrl;
        }

        const { error } = await db.from('news_articles').insert({
          title: title.slice(0, 300),
          summary,
          image_url: imageUrl,
          source: source.slice(0, 120),
          category: src.category,
          article_url: articleUrl,
          content_hash: hash,
          published_at: pub ? new Date(pub).toISOString() : new Date().toISOString(),
        });
        if (error) {
          if (error.code === '23505') skipped++; // duplicate — already have it
          else failed++;
        } else inserted++;
      }
    } catch {
      failed++;
    }
  }

  // Backfill: give pictures to recent articles that still lack one.
  let backfilled = 0;
  const { data: bare } = await db
    .from('news_articles')
    .select('id,article_url')
    .is('image_url', null)
    .order('published_at', { ascending: false })
    .limit(25);
  for (const row of bare ?? []) {
    const r = await resolveArticle(row.article_url);
    if (r.image) {
      const patch: Record<string, string> = { image_url: r.image };
      if (r.finalUrl) patch.article_url = r.finalUrl;
      await db.from('news_articles').update(patch).eq('id', row.id);
      backfilled++;
    }
  }

  await db.rpc('news_prune').then(() => {}, () => {}); // retention, ignore if absent

  // Pre-generate AI reports for the newest visible articles so readers never
  // wait on "Preparing your report". Runs in the background after we respond.
  const { data: pending } = await db
    .from('news_articles')
    .select('id')
    .is('ai_summary', null)
    .not('image_url', 'is', null)
    .eq('is_published', true)
    .order('published_at', { ascending: false })
    .limit(10);

  let firstSummarizeError = '';
  if (pending?.length) {
    // Probe the first one inline so failures are visible in this response.
    try {
      const probe = await fetch(`${SUPABASE_URL}/functions/v1/news-summarize`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${SERVICE_KEY}`,
          apikey: SERVICE_KEY,
        },
        body: JSON.stringify({ articleId: pending[0].id }),
        signal: AbortSignal.timeout(90000),
      });
      if (!probe.ok) firstSummarizeError = `${probe.status}: ${(await probe.text()).slice(0, 300)}`;
    } catch (e) {
      firstSummarizeError = String((e as Error)?.message ?? e);
    }

    const work = (async () => {
      for (const row of pending.slice(1)) {
        try {
          await fetch(`${SUPABASE_URL}/functions/v1/news-summarize`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${SERVICE_KEY}`,
              apikey: SERVICE_KEY,
            },
            body: JSON.stringify({ articleId: row.id }),
            signal: AbortSignal.timeout(90000),
          });
        } catch { /* next run picks it up */ }
      }
    })();
    // Keep the function alive for the background work without delaying the response.
    try { (globalThis as any).EdgeRuntime?.waitUntil?.(work); } catch { await work; }
  }

  const { count: pendingTotal } = await db
    .from('news_articles')
    .select('id', { count: 'exact', head: true })
    .is('ai_summary', null)
    .not('image_url', 'is', null)
    .eq('is_published', true);

  return Response.json({
    ok: true, inserted, skipped, failed, backfilled,
    summarizing: pending?.length ?? 0,
    pendingTotal: pendingTotal ?? -1,
    firstSummarizeError: firstSummarizeError || undefined,
    sources: sources?.length ?? 0,
  });
});
