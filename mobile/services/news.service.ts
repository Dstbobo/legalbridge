import { supabase } from './auth.service';

export interface NewsArticle {
  id: string;
  title: string;
  summary: string | null;
  image_url: string | null;
  source: string;
  category: string;
  article_url: string;
  published_at: string | null;
}

export interface Opportunity {
  id: string;
  kind: 'grant' | 'job' | 'scholarship' | 'tender';
  title: string;
  organization: string;
  summary: string | null;
  amount: string | null;
  deadline: string | null;
  eligibility: string | null;
  apply_url: string;
}

export const PAGE_SIZE = 20;

/** Role-weighted "For You" feed: priority categories first, then the rest. */
export async function fetchForYou(role: string | null | undefined, page: number): Promise<NewsArticle[]> {
  const priority: string[] =
    role === 'lawyer' ? ['legal', 'government']
    : role === 'law_student' ? ['legal', 'government']
    : ['business', 'economy', 'government'];

  const half = Math.floor(PAGE_SIZE / 2);
  const base = supabase
    .from('news_articles')
    .select('id,title,summary,image_url,source,category,article_url,published_at')
    .not('image_url', 'is', null)
    .order('published_at', { ascending: false });

  const [prio, rest] = await Promise.all([
    base.in('category', priority).range(page * half, page * half + half - 1),
    supabase
      .from('news_articles')
      .select('id,title,summary,image_url,source,category,article_url,published_at')
      .not('image_url', 'is', null)
      .not('category', 'in', `(${priority.join(',')})`)
      .order('published_at', { ascending: false })
      .range(page * half, page * half + half - 1),
  ]);
  if (prio.error) throw new Error(prio.error.message);
  if (rest.error) throw new Error(rest.error.message);

  // Interleave 2 priority : 1 other so the feed feels personal but not narrow.
  const a = prio.data ?? [], b = rest.data ?? [];
  const merged: NewsArticle[] = [];
  let i = 0, j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length) merged.push(a[i++]);
    if (i < a.length) merged.push(a[i++]);
    if (j < b.length) merged.push(b[j++]);
  }
  return merged;
}

/** Paged news feed; category 'all' returns everything. */
export async function fetchNews(category: string, page: number): Promise<NewsArticle[]> {
  let q = supabase
    .from('news_articles')
    .select('id,title,summary,image_url,source,category,article_url,published_at')
    .not('image_url', 'is', null) // every headline comes with its picture
    .order('published_at', { ascending: false })
    .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
  if (category !== 'all') q = q.eq('category', category);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return data ?? [];
}

/** Curated opportunities (grants/jobs/scholarships/tenders). */
export async function fetchOpportunities(kind?: string): Promise<Opportunity[]> {
  let q = supabase
    .from('opportunities')
    .select('id,kind,title,organization,summary,amount,deadline,eligibility,apply_url')
    .order('deadline', { ascending: true, nullsFirst: false });
  if (kind && kind !== 'all') q = q.eq('kind', kind);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as Opportunity[];
}

export async function fetchBookmarkIds(): Promise<Set<string>> {
  const { data } = await supabase.from('news_bookmarks').select('article_id');
  return new Set((data ?? []).map((r: any) => r.article_id));
}

export async function toggleBookmark(articleId: string, bookmarked: boolean): Promise<void> {
  const { data: u } = await supabase.auth.getUser();
  const userId = u?.user?.id;
  if (!userId) return;
  if (bookmarked) {
    await supabase.from('news_bookmarks').delete().eq('article_id', articleId).eq('user_id', userId);
  } else {
    await supabase.from('news_bookmarks').insert({ article_id: articleId, user_id: userId });
  }
}

/** AI report for an article (generated on first read, cached after). */
export async function fetchAiSummary(articleId: string): Promise<string> {
  const { data, error } = await supabase.functions.invoke('news-summarize', {
    body: { articleId },
  });
  if (error) throw new Error(error.message);
  if (data?.error) throw new Error(data.error);
  return data?.summary ?? '';
}

export async function fetchBookmarkedArticles(): Promise<NewsArticle[]> {
  const ids = await fetchBookmarkIds();
  if (!ids.size) return [];
  const { data, error } = await supabase
    .from('news_articles')
    .select('id,title,summary,image_url,source,category,article_url,published_at')
    .in('id', Array.from(ids))
    .order('published_at', { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}
