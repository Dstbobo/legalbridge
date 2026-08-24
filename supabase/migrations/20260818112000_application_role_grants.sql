-- PostgreSQL table privileges are a separate gate from RLS. Grant only the
-- operations that authenticated application users need, then let the existing
-- row policies enforce ownership and participant boundaries.

revoke all on table
  public.profiles,
  public.chats,
  public.messages,
  public.generated_documents,
  public.conversations,
  public.direct_messages,
  public.chat_messages,
  public.lawyer_verifications,
  public.lawyer_reviews
from public, anon;

grant select, insert, update on table public.profiles to authenticated;
grant select, insert, update, delete on table public.chats to authenticated;
grant select, insert, update, delete on table public.messages to authenticated;
grant select, insert, update, delete on table public.generated_documents to authenticated;
grant select, insert, update on table public.conversations to authenticated;
grant select, insert, update on table public.direct_messages to authenticated;
grant select, insert on table public.chat_messages to authenticated;
grant select, insert, update on table public.lawyer_verifications to authenticated;
grant select, insert, update on table public.lawyer_reviews to authenticated;
