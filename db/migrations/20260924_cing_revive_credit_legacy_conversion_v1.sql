begin;

/*
 * CING GAME CENTER V2
 * HISTORICAL GAME PLAYS -> REVIVE CREDIT V1
 *
 * DORMANT AUTHORITY.
 *
 * This migration only installs the conversion contract.
 * It does NOT execute conversion for any player.
 *
 * Required cutover preconditions, enforced operationally
 * before a privileged caller may execute this function:
 *
 * - legacy game-play purchase/award/consume writers fenced;
 * - pending paid purchases and reward effects reconciled;
 * - new award paths routed to Revive Credit;
 * - canonical player identity verified;
 * - balance and ledger totals verified before release.
 *
 * One historical game play = one Revive Credit.
 *
 * No Wallet debit, loyalty-point debit, iPOS call,
 * legacy game_plays reset or historical ledger deletion.
 */

create table
  public.cing_revive_credit_legacy_conversions (

    user_id text primary key,

    legacy_game_plays integer
      not null,

    revive_transaction_id bigint
      references
        public.cing_revive_credit_transactions(id)
      on update restrict
      on delete restrict,

    revive_balance_after integer
      not null,

    converted_at timestamptz
      not null
      default clock_timestamp(),

    constraint
      cing_revive_legacy_conversion_user_ck
    check (
      btrim(user_id) <> ''
    ),

    constraint
      cing_revive_legacy_conversion_plays_ck
    check (
      legacy_game_plays >= 0
    ),

    constraint
      cing_revive_legacy_conversion_balance_ck
    check (
      revive_balance_after >= 0
    ),

    constraint
      cing_revive_legacy_conversion_tx_ck
    check (
      (
        legacy_game_plays = 0
        and revive_transaction_id is null
      )
      or
      (
        legacy_game_plays > 0
        and revive_transaction_id is not null
      )
    )
  );

/*
 * Conversion receipts are immutable through this
 * authority. Do not infer current balance from the
 * historical revive_balance_after snapshot.
 */

revoke all
on table
  public.cing_revive_credit_legacy_conversions
from public, anon, authenticated, service_role;

grant select
on table
  public.cing_revive_credit_legacy_conversions
to service_role;

/*
 * Privileged one-player conversion primitive.
 *
 * Idempotency:
 * - one receipt per canonical user;
 * - one Revive Credit ledger reference per user;
 * - retry returns the original receipt;
 * - later unrelated Revive Credit changes are not
 *   confused with this historical conversion.
 *
 * Lock order:
 * players row -> Revive Credit balance row.
 *
 * The private mutation owns the balance and credit
 * ledger transaction. Any downstream exception
 * rolls back the complete conversion.
 */

create function
public.cing_revive_credit_convert_legacy_player_v1(
  p_user_id text
)

returns table (
  applied boolean,
  legacy_game_plays integer,
  revive_transaction_id bigint,
  revive_balance_after integer
)

language plpgsql

security definer

set search_path = public

as $function$

declare

  v_user_id text;

  v_player
    public.players%rowtype;

  v_existing
    public.cing_revive_credit_legacy_conversions%rowtype;

  v_legacy_plays integer;

  v_applied boolean;

  v_transaction_id bigint;

  v_balance_after integer;

  v_reference_type text :=
    'legacy_game_plays_conversion_v1';

begin

  v_user_id :=
    nullif(
      btrim(
        coalesce(p_user_id, '')
      ),
      ''
    );

  if v_user_id is null then

    raise exception
      'REVIVE_LEGACY_USER_REQUIRED'
      using errcode = '22023';

  end if;

  /*
   * Serialize with PostgreSQL legacy writers that
   * acquire the canonical player's row lock.
   */

  select p.*
  into v_player

  from public.players p

  where p.user_id = v_user_id

  for update;

  if not found then

    raise exception
      'REVIVE_LEGACY_PLAYER_NOT_FOUND'
      using errcode = 'P0002';

  end if;

  /*
   * Recheck after the player lock.
   * A concurrent converter may have completed while
   * this request was waiting.
   */

  select c.*
  into v_existing

  from public.cing_revive_credit_legacy_conversions c

  where c.user_id = v_user_id;

  if found then

    return query

    select
      false,
      v_existing.legacy_game_plays,
      v_existing.revive_transaction_id,
      v_existing.revive_balance_after;

    return;

  end if;

  v_legacy_plays :=
    coalesce(
      v_player.game_plays,
      0
    );

  if v_legacy_plays < 0 then

    raise exception
      'REVIVE_LEGACY_BALANCE_INVALID'
      using errcode = '55000';

  end if;

  /*
   * Zero balance still receives an immutable
   * conversion receipt.
   *
   * The revive ledger forbids amount = 0.
   */

  if v_legacy_plays = 0 then

    select coalesce(b.balance, 0)
    into v_balance_after

    from public.cing_revive_credit_balances b

    where b.user_id = v_user_id;

    v_balance_after :=
      coalesce(
        v_balance_after,
        0
      );

    v_transaction_id := null;

  else

    /*
     * Stable reference makes the 1:1 grant
     * idempotent inside the existing private
     * Revive Credit mutation authority.
     */

    select
      r.applied,
      r.transaction_id,
      r.balance_after

    into
      v_applied,
      v_transaction_id,
      v_balance_after

    from public.cing_revive_credit_apply_private_v1(
      v_user_id,
      v_legacy_plays,
      'Chuyển đổi lượt chơi lịch sử sang Revive Credit',
      v_reference_type,
      v_user_id,
      null::text,
      null::uuid,
      jsonb_build_object(
        'source',
        'legacy_game_plays_conversion',
        'conversion_version',
        1,
        'conversion_ratio',
        '1:1',
        'legacy_game_plays',
        v_legacy_plays
      )
    ) r;

    if v_transaction_id is null
      or v_balance_after is null
    then

      raise exception
        'REVIVE_LEGACY_GRANT_RESULT_INVALID'
        using errcode = '55000';

    end if;

    if v_applied is distinct from true then

      raise exception
        'REVIVE_LEGACY_GRANT_ALREADY_EXISTS_WITHOUT_RECEIPT'
        using errcode = '55000';

    end if;

  end if;

  insert into
    public.cing_revive_credit_legacy_conversions (

      user_id,
      legacy_game_plays,
      revive_transaction_id,
      revive_balance_after

    )

  values (

    v_user_id,
    v_legacy_plays,
    v_transaction_id,
    v_balance_after

  );

  return query

  select
    true,
    v_legacy_plays,
    v_transaction_id,
    v_balance_after;

end;

$function$;

/*
 * No API caller is authorized to run conversion
 * merely because this migration has been installed.
 *
 * No service_role EXECUTE until the complete
 * cutover and reconciliation have passed.
 */

revoke all

on function
public.cing_revive_credit_convert_legacy_player_v1(
  text
)

from public, anon, authenticated, service_role;

commit;
