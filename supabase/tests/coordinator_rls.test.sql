begin;
select plan(8);

select has_column('public', 'projects', 'coordinator_id', 'projects has coordinator');
select has_column('public', 'projects', 'client_id', 'projects has client');
select has_column('public', 'sites', 'is_placeholder', 'sites identify placeholders');
select has_column('public', 'invitations', 'role', 'invitations carry a role');
select has_table('public', 'clients', 'clients table exists');
select has_table('public', 'chat_threads', 'chat threads table exists');
select has_table('public', 'chat_messages', 'chat messages table exists');
select policies_are(
  'public',
  'projects',
  array['projects_company_all', 'projects_coordinator_all'],
  'project access is limited to managers and assigned coordinators'
);

select * from finish();
rollback;
