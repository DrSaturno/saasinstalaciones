begin;

create extension if not exists pgtap with schema extensions;
select plan(8);

select has_table('public', 'feature_flags', 'feature flag catalog exists');
select has_table('public', 'company_feature_flags', 'tenant flag overrides exist');
select has_table('public', 'feature_flag_events', 'flag audit events exist');
select has_function(
  'public', 'feature_enabled', array['text', 'uuid'],
  'tenant-safe feature flag resolver exists'
);
select is(
  (select count(*)::integer from public.feature_flags),
  9,
  'all SDD rollout flags are seeded idempotently'
);
select is(
  public.feature_enabled('roles_v2', null),
  null,
  'anonymous callers cannot probe a tenant flag'
);

select policies_are(
  'public', 'company_feature_flags',
  array['company_feature_flags_member_read'],
  'tenant overrides expose only the member read policy'
);
select policies_are(
  'public', 'feature_flag_events',
  array['feature_flag_events_manager_read'],
  'flag audit is manager-readable only'
);

select * from finish();
rollback;
