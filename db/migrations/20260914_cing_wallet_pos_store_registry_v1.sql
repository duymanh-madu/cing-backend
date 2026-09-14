begin;

/*
 * ==========================================================
 * CING WALLET POS STORE REGISTRY V1
 * ==========================================================
 *
 * Chain-wide Wallet:
 *
 * - Wallet balance belongs to customer, not store.
 * - Each store has canonical POS identity.
 * - Counter/cashier never supplies POS identity.
 * - Backend resolves authenticated admin -> store -> POS.
 *
 * Adding another store is DATA ONLY.
 */

create table if not exists
public.cing_wallet_pos_stores (
  id uuid primary key
    default gen_random_uuid(),

  store_code text not null,

  display_name text not null,

  pos_parent text not null,

  pos_id text not null,

  active boolean not null
    default true,

  metadata jsonb not null
    default '{}'::jsonb,

  created_at timestamptz not null
    default now(),

  updated_at timestamptz not null
    default now(),

  constraint
    cing_wallet_pos_stores_store_code_ck
    check (
      btrim(store_code) <> ''
    ),

  constraint
    cing_wallet_pos_stores_display_name_ck
    check (
      btrim(display_name) <> ''
    ),

  constraint
    cing_wallet_pos_stores_pos_parent_ck
    check (
      btrim(pos_parent) <> ''
    ),

  constraint
    cing_wallet_pos_stores_pos_id_ck
    check (
      btrim(pos_id) <> ''
    )
);


create unique index if not exists
cing_wallet_pos_stores_store_code_uq
on public.cing_wallet_pos_stores (
  store_code
);


create unique index if not exists
cing_wallet_pos_stores_pos_identity_uq
on public.cing_wallet_pos_stores (
  pos_parent,
  pos_id
);


/*
 * Initial chain store.
 *
 * Future stores such as 109665 / 109666 are added with INSERT,
 * not source-code changes.
 */
insert into
public.cing_wallet_pos_stores (
  store_code,
  display_name,
  pos_parent,
  pos_id,
  active,
  metadata
)
values (
  'kinh-bac-109664',
  'Cing Hu Tang Kinh Bắc',
  'BRAND-DQIR',
  '109664',
  true,
  jsonb_build_object(
    'initial_store',
      true
  )
)
on conflict (
  pos_parent,
  pos_id
)
do nothing;


/*
 * The canonical Admin Panel authentication table owns
 * Counter -> Store assignment.
 *
 * Nullable because non-Counter admins do not necessarily
 * belong to one operational store.
 */
alter table public.admins
add column if not exists
store_id uuid;


do $constraint$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname =
      'admins_cing_wallet_pos_store_fk'
  )
  then
    alter table public.admins
    add constraint
      admins_cing_wallet_pos_store_fk
    foreign key (
      store_id
    )
    references
      public.cing_wallet_pos_stores(id)
    on update restrict
    on delete restrict;
  end if;
end;
$constraint$;


create index if not exists
admins_cing_wallet_pos_store_idx
on public.admins (
  store_id
)
where store_id is not null;


/*
 * ----------------------------------------------------------
 * Resolve canonical active Counter store from authenticated
 * Admin Panel actor identity.
 * ----------------------------------------------------------
 */
create or replace function
public.cing_wallet_resolve_counter_store_v1(
  p_actor_admin_id text
)
returns table (
  store_id uuid,
  store_code text,
  display_name text,
  pos_parent text,
  pos_id text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id text;

begin
  v_actor_id :=
    nullif(
      btrim(
        coalesce(
          p_actor_admin_id,
          ''
        )
      ),
      ''
    );

  if v_actor_id is null then
    raise exception
      'CING_WALLET_POS_COUNTER_ACTOR_REQUIRED'
      using errcode = '22023';
  end if;

  return query
  select
    s.id,
    s.store_code,
    s.display_name,
    s.pos_parent,
    s.pos_id
  from public.admins a
  join public.cing_wallet_pos_stores s
    on s.id =
      a.store_id
  where a.id::text =
      v_actor_id
    and a.active =
      true
    and s.active =
      true
  limit 1;

  if not found then
    raise exception
      'CING_WALLET_POS_COUNTER_STORE_NOT_CONFIGURED'
      using errcode = '55000';
  end if;
end;
$$;


revoke all on function
public.cing_wallet_resolve_counter_store_v1(text)
from public, anon, authenticated;

grant execute on function
public.cing_wallet_resolve_counter_store_v1(text)
to service_role;


/*
 * ----------------------------------------------------------
 * One-round-trip manual payment preparation.
 *
 * Actor identity is backend-derived from authenticated Admin
 * Panel state. PostgreSQL resolves the store. Client has no
 * authority to select a store or POS.
 * ----------------------------------------------------------
 */
create or replace function
public.cing_wallet_prepare_manual_pos_payment_v3(
  p_actor_admin_id text,
  p_amount bigint,
  p_request_id uuid,
  p_expires_at timestamptz
)
returns table (
  session_id uuid,
  store_id uuid,
  store_code text,
  store_display_name text,
  pos_parent text,
  pos_id text,
  sale_tran_id text,
  payment_intent_id uuid,
  provider_request_key text,
  payment_token_id uuid,
  amount bigint,
  amount_source text,
  expires_at timestamptz,
  session_status text,
  payment_status text,
  created_session boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_store record;
  v_prepared record;
  v_store_snapshot jsonb;

begin
  select *
  into v_store
  from public.cing_wallet_resolve_counter_store_v1(
    p_actor_admin_id
  );

  select *
  into v_prepared
  from public.cing_wallet_prepare_manual_pos_payment_v2(
    v_store.pos_parent,
    v_store.pos_id,
    p_amount,
    p_actor_admin_id,
    p_request_id,
    p_expires_at,
    'cashier_manual'
  );

  if v_prepared.session_id is null
     or v_prepared.payment_intent_id is null
     or v_prepared.payment_token_id is null
  then
    raise exception
      'CING_WALLET_POS_MANUAL_PAYMENT_V3_INVALID'
      using errcode = '55000';
  end if;

  /*
   * Snapshot store identity in payment intent metadata.
   *
   * A7.2B will project this immutable snapshot into Wallet
   * ledger/customer history.
   */
  update
    public.cing_wallet_pos_payment_intents
  set
    metadata =
      case
        when
          metadata->>'store_id'
            is null
          and
          metadata->>'store_code'
            is null
          and
          metadata->>'store_display_name'
            is null
        then
          coalesce(
            metadata,
            '{}'::jsonb
          )
          ||
          jsonb_build_object(
            'store_id',
              v_store.store_id,
            'store_code',
              v_store.store_code,
            'store_display_name',
              v_store.display_name
          )
        else
          metadata
      end
  where id =
    v_prepared.payment_intent_id
    and pos_parent =
      v_store.pos_parent
    and pos_id =
      v_store.pos_id
    and (
      (
        metadata->>'store_id'
          is null
        and
        metadata->>'store_code'
          is null
        and
        metadata->>'store_display_name'
          is null
      )
      or (
        metadata->>'store_id' =
          v_store.store_id::text
        and
        nullif(
          btrim(
            metadata->>'store_code'
          ),
          ''
        ) is not null
        and
        nullif(
          btrim(
            metadata->>'store_display_name'
          ),
          ''
        ) is not null
      )
    )
  returning
    metadata
  into
    v_store_snapshot;

  if not found
     or v_store_snapshot is null
  then
    raise exception
      'CING_WALLET_POS_STORE_SNAPSHOT_CONFLICT'
      using errcode = '55000';
  end if;

  return query
  select
    v_prepared.session_id,
    (
      v_store_snapshot->>'store_id'
    )::uuid,
    v_store_snapshot->>'store_code',
    v_store_snapshot->>'store_display_name',
    v_prepared.pos_parent,
    v_prepared.pos_id,
    v_prepared.sale_tran_id,
    v_prepared.payment_intent_id,
    v_prepared.provider_request_key,
    v_prepared.payment_token_id,
    v_prepared.amount,
    v_prepared.amount_source,
    v_prepared.expires_at,
    v_prepared.session_status,
    v_prepared.payment_status,
    v_prepared.created_session;
end;
$$;


revoke all on function
public.cing_wallet_prepare_manual_pos_payment_v3(
  text,
  bigint,
  uuid,
  timestamptz
)
from public, anon, authenticated;

grant execute on function
public.cing_wallet_prepare_manual_pos_payment_v3(
  text,
  bigint,
  uuid,
  timestamptz
)
to service_role;


/*
 * ----------------------------------------------------------
 * Actor-bound current manual/API POS session read.
 *
 * Counter polling performance authority:
 * - one backend -> PostgreSQL RPC round trip
 * - actor identity only from authenticated backend context
 * - canonical actor -> store resolver remains authority
 * - browser cannot submit store/POS identity
 * - Event 2 discovery sessions are excluded
 * - strictly read-only
 * ----------------------------------------------------------
 */
create or replace function
public.cing_wallet_get_current_manual_pos_session_v1(
  p_actor_admin_id text
)
returns table (
  id uuid,
  store_id uuid,
  store_code text,
  store_display_name text,
  pos_parent text,
  pos_id text,
  sale_tran_id text,
  amount bigint,
  amount_source text,
  session_origin text,
  status text,
  payment_intent_id uuid,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id text;
  v_store record;
begin
  v_actor_id :=
    nullif(
      btrim(
        coalesce(
          p_actor_admin_id,
          ''
        )
      ),
      ''
    );

  if v_actor_id is null then
    raise exception
      'CING_WALLET_POS_COUNTER_ACTOR_REQUIRED'
      using errcode = '22023';
  end if;

  select *
  into v_store
  from public.cing_wallet_resolve_counter_store_v1(
    v_actor_id
  );

  return query
  select
    ps.id,
    v_store.store_id,
    v_store.store_code,
    v_store.display_name,
    ps.pos_parent,
    ps.pos_id,
    ps.sale_tran_id,
    ps.amount,
    ps.amount_source,
    ps.session_origin,
    ps.status,
    ps.payment_intent_id,
    ps.created_at,
    ps.updated_at
  from public.cing_wallet_pos_sessions ps
  where ps.pos_parent =
      v_store.pos_parent
    and ps.pos_id =
      v_store.pos_id
    and ps.session_origin in (
      'cashier_manual',
      'ipos_api'
    )
    and ps.status in (
      'amount_frozen',
      'qr_ready',
      'paid',
      'reconciliation_pending'
    )
  order by
    ps.created_at desc
  limit 1;
end;
$$;

revoke all on function
public.cing_wallet_get_current_manual_pos_session_v1(
  text
)
from public, anon, authenticated;

grant execute on function
public.cing_wallet_get_current_manual_pos_session_v1(
  text
)
to service_role;


/*
 * Structural assertion for actor-bound current-session read.
 */
do $current_session_rpc$
begin
  if to_regprocedure(
    'public.cing_wallet_get_current_manual_pos_session_v1(text)'
  ) is null
  then
    raise exception
      'CING_WALLET_POS_CURRENT_MANUAL_SESSION_RPC_MISSING';
  end if;

  if has_function_privilege(
    'authenticated',
    'public.cing_wallet_get_current_manual_pos_session_v1(text)',
    'EXECUTE'
  )
  then
    raise exception
      'CING_WALLET_POS_CURRENT_MANUAL_SESSION_CLIENT_EXECUTE_FORBIDDEN';
  end if;
end;
$current_session_rpc$;


/*
 * No direct table access from customer/authenticated roles.
 */
revoke all on table
public.cing_wallet_pos_stores
from anon, authenticated;


/*
 * Structural assertions.
 */
do $migration$
begin
  if to_regclass(
    'public.cing_wallet_pos_stores'
  ) is null
  then
    raise exception
      'CING_WALLET_POS_STORE_REGISTRY_MISSING';
  end if;

  if to_regprocedure(
    'public.cing_wallet_resolve_counter_store_v1(text)'
  ) is null
  then
    raise exception
      'CING_WALLET_POS_COUNTER_STORE_RESOLVER_MISSING';
  end if;

  if to_regprocedure(
    'public.cing_wallet_prepare_manual_pos_payment_v3(text,bigint,uuid,timestamp with time zone)'
  ) is null
  then
    raise exception
      'CING_WALLET_POS_MANUAL_PAYMENT_V3_MISSING';
  end if;

  if has_function_privilege(
    'authenticated',
    'public.cing_wallet_resolve_counter_store_v1(text)',
    'EXECUTE'
  )
  then
    raise exception
      'CING_WALLET_POS_STORE_RESOLVER_CLIENT_EXECUTE_FORBIDDEN';
  end if;

  if has_function_privilege(
    'authenticated',
    'public.cing_wallet_prepare_manual_pos_payment_v3(text,bigint,uuid,timestamp with time zone)',
    'EXECUTE'
  )
  then
    raise exception
      'CING_WALLET_POS_MANUAL_PAYMENT_V3_CLIENT_EXECUTE_FORBIDDEN';
  end if;
end;
$migration$;

commit;
