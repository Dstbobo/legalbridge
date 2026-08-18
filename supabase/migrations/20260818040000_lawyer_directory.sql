-- Public lawyer directory projection.
--
-- Profiles remain private under RLS. This function exposes only the fields a
-- signed-in client needs to browse and contact a lawyer inside LegalBridge.
-- Verification status is explicit so an account is never presented as SCN
-- verified until an administrator has approved its lawyer_verifications row.
create or replace function public.list_lawyer_directory()
returns table (
  id uuid,
  user_id uuid,
  full_name text,
  scn_number text,
  year_of_call int,
  experience_label text,
  state text,
  firm text,
  whatsapp text,
  specializations text[],
  bio text,
  status text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    p.id,
    p.id as user_id,
    coalesce(nullif(trim(p.full_name), ''), 'LegalBridge lawyer') as full_name,
    case when lv.status = 'verified' then lv.scn_number else null end,
    lv.year_of_call,
    p.experience as experience_label,
    coalesce(lv.state, p.state) as state,
    lv.firm,
    case when lv.status = 'verified' then lv.whatsapp else null end,
    coalesce(lv.specializations, p.specializations, '{}'::text[]) as specializations,
    coalesce(lv.bio, p.bio) as bio,
    coalesce(lv.status, nullif(p.verification_status, ''), 'unverified') as status,
    p.created_at
  from public.profiles p
  left join public.lawyer_verifications lv on lv.user_id = p.id
  where p.user_type = 'lawyer'
  order by
    case coalesce(lv.status, p.verification_status, 'unverified')
      when 'verified' then 0
      when 'pending' then 1
      else 2
    end,
    p.created_at asc;
$$;

revoke all on function public.list_lawyer_directory() from public;
grant execute on function public.list_lawyer_directory() to authenticated;
