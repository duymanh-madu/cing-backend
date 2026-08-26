begin;

/*
 * ==========================================================
 * CING WALLET — READ AUTHORITY V1
 * ==========================================================
 *
 * Read-path support only.
 *
 * Authority remains:
 * - browser/client roles cannot read Wallet tables directly
 * - service_role is backend read transport only
 * - authenticated application identity is resolved by backend
 * - no caller-controlled user_id participates in Wallet reads
 *
 * Stable customer statement pagination uses:
 *   user_id ASC,
 *   created_at DESC,
 *   id DESC
 *
 * id is the deterministic tie-breaker when multiple ledger
 * entries share the same created_at timestamp.
 */

create index if not exists
  cing_wallet_transactions_user_created_id_idx
on public.cing_wallet_transactions (
  user_id,
  created_at desc,
  id desc
);


/*
 * Assert client roles still have no table-level SELECT.
 */
do $migration$
begin
  if has_table_privilege(
    'anon',
    'public.cing_wallet_accounts',
    'select'
  ) then
    raise exception
      'CING_WALLET_ANON_ACCOUNT_READ_SIDE_DOOR';
  end if;

  if has_table_privilege(
    'authenticated',
    'public.cing_wallet_accounts',
    'select'
  ) then
    raise exception
      'CING_WALLET_AUTHENTICATED_ACCOUNT_READ_SIDE_DOOR';
  end if;

  if has_table_privilege(
    'anon',
    'public.cing_wallet_transactions',
    'select'
  ) then
    raise exception
      'CING_WALLET_ANON_LEDGER_READ_SIDE_DOOR';
  end if;

  if has_table_privilege(
    'authenticated',
    'public.cing_wallet_transactions',
    'select'
  ) then
    raise exception
      'CING_WALLET_AUTHENTICATED_LEDGER_READ_SIDE_DOOR';
  end if;

  if not has_table_privilege(
    'service_role',
    'public.cing_wallet_accounts',
    'select'
  ) then
    raise exception
      'CING_WALLET_BACKEND_ACCOUNT_READ_MISSING';
  end if;

  if not has_table_privilege(
    'service_role',
    'public.cing_wallet_transactions',
    'select'
  ) then
    raise exception
      'CING_WALLET_BACKEND_LEDGER_READ_MISSING';
  end if;

  if not exists (
    select 1
    from pg_indexes
    where schemaname = 'public'
      and tablename =
        'cing_wallet_transactions'
      and indexname =
        'cing_wallet_transactions_user_created_id_idx'
  ) then
    raise exception
      'CING_WALLET_READ_PAGINATION_INDEX_MISSING';
  end if;
end;
$migration$;

commit;
