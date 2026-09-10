begin;

create or replace function public.cing_wallet_admin_transactions_v1(
  p_limit integer default 50,
  p_before_created_at timestamptz default null,
  p_before_id uuid default null,
  p_transaction_type text default null
)
returns table (
  id uuid,
  user_id text,
  transaction_type text,
  amount bigint,
  balance_before bigint,
  balance_after bigint,
  reference_type text,
  reference_id text,
  reason text,
  note text,
  actor_type text,
  actor_id text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_limit integer;
begin
  v_limit :=
    least(
      greatest(
        coalesce(
          p_limit,
          50
        ),
        1
      ),
      100
    );

  if (
    (p_before_created_at is null) <>
    (p_before_id is null)
  ) then
    raise exception
      'CING_WALLET_ADMIN_LEDGER_CURSOR_INVALID'
      using errcode = '22023';
  end if;

  if (
    p_transaction_type is not null
    and p_transaction_type not in (
      'topup',
      'topup_promotion',
      'payment',
      'refund',
      'reversal',
      'admin_adjustment'
    )
  ) then
    raise exception
      'CING_WALLET_ADMIN_LEDGER_TYPE_INVALID'
      using errcode = '22023';
  end if;

  return query
  select
    wt.id,
    wt.user_id,
    wt.transaction_type,
    wt.amount,
    wt.balance_before,
    wt.balance_after,
    wt.reference_type,
    wt.reference_id,
    wt.reason,
    wt.note,
    wt.actor_type,
    wt.actor_id,
    wt.created_at
  from
    public.cing_wallet_transactions wt
  where
    (
      p_transaction_type is null
      or
      wt.transaction_type =
        p_transaction_type
    )
    and
    (
      p_before_created_at is null
      or
      (
        wt.created_at <
          p_before_created_at
        or
        (
          wt.created_at =
            p_before_created_at
          and
          wt.id <
            p_before_id
        )
      )
    )
  order by
    wt.created_at desc,
    wt.id desc
  limit
    v_limit + 1;
end;
$$;

revoke all
on function
  public.cing_wallet_admin_transactions_v1(
    integer,
    timestamptz,
    uuid,
    text
  )
from public;

revoke all
on function
  public.cing_wallet_admin_transactions_v1(
    integer,
    timestamptz,
    uuid,
    text
  )
from anon;

revoke all
on function
  public.cing_wallet_admin_transactions_v1(
    integer,
    timestamptz,
    uuid,
    text
  )
from authenticated;

grant execute
on function
  public.cing_wallet_admin_transactions_v1(
    integer,
    timestamptz,
    uuid,
    text
  )
to service_role;

commit;
