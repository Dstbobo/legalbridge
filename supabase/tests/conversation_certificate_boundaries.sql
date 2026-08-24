begin;
select plan(25);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'client@example.test', '', '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('20000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'lawyer@example.test', '', '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('30000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'outsider@example.test', '', '{}'::jsonb, '{}'::jsonb, now(), now());

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select lives_ok(
  $$insert into public.conversations (id, client_id, lawyer_id)
    values ('40000000-0000-0000-0000-000000000004',
            '10000000-0000-0000-0000-000000000001',
            '20000000-0000-0000-0000-000000000002')$$,
  'client can start a conversation with a different lawyer'
);
select is(
  (select user_a from public.conversations
    where id = '40000000-0000-0000-0000-000000000004'),
  '10000000-0000-0000-0000-000000000001'::uuid,
  'mobile participant insert also populates the legacy client field'
);
select is(
  (select user_b from public.conversations
    where id = '40000000-0000-0000-0000-000000000004'),
  '20000000-0000-0000-0000-000000000002'::uuid,
  'mobile participant insert also populates the legacy lawyer field'
);
select throws_ok(
  $$insert into public.conversations (client_id, lawyer_id)
    values ('10000000-0000-0000-0000-000000000001',
            '10000000-0000-0000-0000-000000000001')$$,
  '42501', null, 'a client cannot create a self-conversation'
);
select lives_ok(
  $$update public.conversations
       set last_message = 'hello',
           last_sender = '10000000-0000-0000-0000-000000000001'
     where id = '40000000-0000-0000-0000-000000000004'$$,
  'participant can update ordinary conversation state'
);
select throws_ok(
  $$update public.conversations
       set lawyer_id = '30000000-0000-0000-0000-000000000003'
     where id = '40000000-0000-0000-0000-000000000004'$$,
  '42501', 'conversation participants cannot be reassigned',
  'participant reassignment fails closed'
);
select throws_ok(
  $$update public.conversations
       set last_sender = '30000000-0000-0000-0000-000000000003'
     where id = '40000000-0000-0000-0000-000000000004'$$,
  '42501', 'last sender must be a conversation participant',
  'non-participant cannot be recorded as last sender'
);
select lives_ok(
  $$insert into public.chat_messages (conversation_id, sender_id, content)
    values ('40000000-0000-0000-0000-000000000004',
            '10000000-0000-0000-0000-000000000001', 'private message')$$,
  'participant can send a message as themselves'
);

select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000003', true);
select is((select count(*)::integer from public.conversations), 0,
  'cross-user conversation access is denied');
select is((select count(*)::integer from public.chat_messages), 0,
  'cross-user message access is denied');
select throws_ok(
  $$insert into public.chat_messages (conversation_id, sender_id, content)
    values ('40000000-0000-0000-0000-000000000004',
            '30000000-0000-0000-0000-000000000003', 'intrusion')$$,
  '42501', null, 'non-participant cannot send into a conversation'
);

reset role;
select is((select public from storage.buckets where id = 'verification-docs'), false,
  'certificate bucket is private');

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select lives_ok(
  $$insert into storage.objects (bucket_id, name, owner)
    values ('verification-docs',
            '10000000-0000-0000-0000-000000000001/certificate.jpg',
            '10000000-0000-0000-0000-000000000001')$$,
  'user can upload into their own certificate folder'
);
select throws_ok(
  $$insert into storage.objects (bucket_id, name, owner)
    values ('verification-docs',
            '30000000-0000-0000-0000-000000000003/certificate.jpg',
            '10000000-0000-0000-0000-000000000001')$$,
  '42501', null, 'user cannot upload into another certificate folder'
);
select is((select count(*)::integer from storage.objects where bucket_id = 'verification-docs'), 1,
  'user sees their own certificate object');

select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000003', true);
select is((select count(*)::integer from storage.objects where bucket_id = 'verification-docs'), 0,
  'another user cannot read the certificate object');

select set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000002', true);
select lives_ok(
  $$insert into public.lawyer_verifications
      (user_id, full_name, scn_number, cert_path, status)
    values ('20000000-0000-0000-0000-000000000002', 'Test Lawyer', 'SCN-TEST-2',
            '20000000-0000-0000-0000-000000000002/certificate.jpg', 'pending')$$,
  'lawyer can submit metadata for their own certificate path'
);

select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000003', true);
select is((select count(*)::integer from public.lawyer_verifications), 0,
  'another user cannot read verification rows or certificate paths');
select throws_ok(
  $$insert into public.lawyer_verifications
      (user_id, full_name, scn_number, cert_path, status)
    values ('30000000-0000-0000-0000-000000000003', 'Outsider', 'SCN-TEST-3',
            '20000000-0000-0000-0000-000000000002/certificate.jpg', 'pending')$$,
  '42501', null, 'lawyer cannot bind another users certificate path'
);

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select lives_ok(
  $$insert into public.profiles (id, full_name, user_type)
    values ('10000000-0000-0000-0000-000000000001', 'Test Client', 'individual')$$,
  'user can create a least-privileged profile'
);
select throws_ok(
  $$update public.profiles set plan = 'premium'
    where id = '10000000-0000-0000-0000-000000000001'$$,
  '42501', 'profile plan requires server authorization',
  'self-service plan escalation is rejected'
);
select throws_ok(
  $$update public.profiles set user_type = 'lawyer'
    where id = '10000000-0000-0000-0000-000000000001'$$,
  '42501', 'profile role cannot be reassigned',
  'self-service role reassignment is rejected'
);
select throws_ok(
  $$update public.profiles set verification_status = 'verified'
    where id = '10000000-0000-0000-0000-000000000001'$$,
  '42501', 'verification decision requires server authorization',
  'self-verification is rejected'
);
select lives_ok(
  $$insert into public.direct_messages (id, conversation_id, sender_id, body)
    values ('50000000-0000-0000-0000-000000000005',
            '40000000-0000-0000-0000-000000000004',
            '10000000-0000-0000-0000-000000000001', 'immutable message')$$,
  'participant can send a legacy direct message as themselves'
);
select throws_ok(
  $$update public.direct_messages set body = 'rewritten message'
    where id = '50000000-0000-0000-0000-000000000005'$$,
  '42501', 'message identity and content are immutable',
  'sent message content cannot be rewritten'
);

reset role;
select * from finish();
rollback;
