begin;

/*
 * ==========================================================
 * CING GAME CENTER V2
 * REVIVE CREDIT WALLET PRICE POLICY V1
 * ==========================================================
 *
 * One configured VND price per Revive Credit.
 *
 * NULL means not configured / purchase disabled.
 *
 * This migration does NOT:
 * - configure a production price
 * - enable purchase routes
 * - debit Cing Wallet
 * - grant Revive Credit
 * - change legacy wallet_play_price
 * - alter loyalty points
 * - convert legacy game_plays
 */

alter table public.app_configs

  add column if not exists
    wallet_revive_credit_price bigint;

/*
 * An existing app_configs row remains unchanged.
 *
 * PostgreSQL CHECK constraints allow NULL.
 * Positive configured prices are required.
 */

do $migration$
begin

  if not exists (

    select 1

    from pg_constraint c

    where c.conrelid =
      'public.app_configs'::regclass

      and c.conname =
        'app_configs_wallet_revive_credit_price_positive_ck'

  ) then

    alter table public.app_configs

      add constraint
        app_configs_wallet_revive_credit_price_positive_ck

      check (

        wallet_revive_credit_price is null

        or wallet_revive_credit_price > 0

      )

      not valid;

  end if;

end;
$migration$;

commit;
