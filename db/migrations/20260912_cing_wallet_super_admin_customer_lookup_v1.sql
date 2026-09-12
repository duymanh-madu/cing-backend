begin;

/*
 * ==========================================================
 * CING WALLET — SUPER ADMIN CUSTOMER LOOKUP V1
 * ==========================================================
 *
 * Read-only authority for financial administration.
 *
 * Rules:
 * - service_role only
 * - never creates Wallet accounts
 * - never mutates Wallet balances
 * - canonical balance comes from cing_wallet_accounts
 * - customers without Wallet account project balance = 0
 * - query is bounded and returns max 20 rows
 */

create or replace function
public.cing_wallet_admin_customer_lookup_v1(
  p_query text
)
returns table (
  user_id text,
  phone text,
  display_name text,
  avatar text,
  wallet_balance bigint,
  wallet_status text,
  wallet_account_exists boolean
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_query text;
  v_digits text;
  v_pattern text;
begin
  v_query :=
    nullif(
      btrim(p_query),
      ''
    );

  if v_query is null
     or length(v_query) < 2
     or length(v_query) > 120
  then
    raise exception
      'CING_WALLET_ADMIN_CUSTOMER_QUERY_INVALID'
      using errcode = '22023';
  end if;

  v_digits :=
    regexp_replace(
      v_query,
      '[^0-9]',
      '',
      'g'
    );

  /*
   * Escape SQL LIKE metacharacters from caller input.
   */
  v_pattern :=
    '%' ||
    replace(
      replace(
        replace(
          lower(v_query),
          '\',
          '\\'
        ),
        '%',
        '\%'
      ),
      '_',
      '\_'
    ) ||
    '%';

  return query
  select
    p.user_id,
    coalesce(
      nullif(
        btrim(p.phone),
        ''
      ),
      nullif(
        btrim(p.phone_number),
        ''
      ),
      p.user_id
    )::text as phone,
    coalesce(
      nullif(
        btrim(p.display_name),
        ''
      ),
      nullif(
        btrim(p.zalo_name),
        ''
      ),
      p.user_id
    )::text as display_name,
    coalesce(
      nullif(
        btrim(p.avatar),
        ''
      ),
      nullif(
        btrim(p.zalo_avatar),
        ''
      ),
      ''
    )::text as avatar,
    coalesce(
      wa.balance,
      0
    )::bigint as wallet_balance,
    coalesce(
      wa.status,
      'not_created'
    )::text as wallet_status,
    (wa.user_id is not null)
      as wallet_account_exists
  from
    public.players p
  left join
    public.cing_wallet_accounts wa
      on wa.user_id =
         p.user_id
  where
    (
      length(v_digits) >= 6
      and (
        p.user_id ilike
          '%' || v_digits || '%'
        or
        coalesce(
          p.phone,
          ''
        ) ilike
          '%' || v_digits || '%'
        or
        coalesce(
          p.phone_number,
          ''
        ) ilike
          '%' || v_digits || '%'
      )
    )
    or
    (
      length(v_digits) < 6
      and (
        lower(
          coalesce(
            p.display_name,
            ''
          )
        ) like v_pattern
          escape '\'
        or
        lower(
          coalesce(
            p.zalo_name,
            ''
          )
        ) like v_pattern
          escape '\'
        or
        lower(
          p.user_id
        ) like v_pattern
          escape '\'
      )
    )
  order by
    case
      when lower(p.user_id) =
           lower(v_query)
        then 0
      when lower(
        coalesce(
          p.phone,
          ''
        )
      ) =
        lower(v_query)
        then 0
      when lower(
        coalesce(
          p.phone_number,
          ''
        )
      ) =
        lower(v_query)
        then 0
      else 1
    end,
    p.user_id asc
  limit 20;
end;
$$;

revoke all
on function
  public.cing_wallet_admin_customer_lookup_v1(text)
from public;

revoke all
on function
  public.cing_wallet_admin_customer_lookup_v1(text)
from anon;

revoke all
on function
  public.cing_wallet_admin_customer_lookup_v1(text)
from authenticated;

grant execute
on function
  public.cing_wallet_admin_customer_lookup_v1(text)
to service_role;

commit;
