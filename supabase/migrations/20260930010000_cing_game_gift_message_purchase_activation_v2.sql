begin;

/*
 * ==========================================================
 * CING GAME CENTER V2
 * GIFT MESSAGE + PURCHASE ACTIVATION V2
 * ==========================================================
 *
 * Goals:
 * - durable optional sender_message, max 200 chars
 * - preserve V1 financial atomicity
 * - bind sender_message to request_id replay identity
 * - update the same durable Gift notification transactionally
 * - activate ONLY V2 Wallet/Points wrappers for service_role
 * - keep private cores and all client roles non-executable
 * - keep all V1 customer purchase RPCs dormant
 */

alter table public.cing_game_gift_purchases
  add column if not exists sender_message text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname =
      'cing_game_gift_sender_message_ck'
      and conrelid =
        'public.cing_game_gift_purchases'::regclass
  ) then
    alter table public.cing_game_gift_purchases
      add constraint
        cing_game_gift_sender_message_ck
      check (
        sender_message is null
        or (
          sender_message = btrim(sender_message)
          and sender_message <> ''
          and char_length(sender_message) <= 200
        )
      );
  end if;
end
$$;


/*
 * Private V2 adapter.
 *
 * The established V1 private core remains the only financial
 * mutation authority. V2 wraps it inside the SAME PostgreSQL
 * transaction, then binds the message to the immutable receipt
 * and notification before returning success.
 */
create or replace function
public.cing_game_gift_purchase_private_v2(
  p_sender_user_id text,
  p_recipient_user_id text,
  p_gift_id text,
  p_request_id uuid,
  p_funding_source text,
  p_sender_message text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_message text;
  v_result jsonb;
  v_existing_message text;
  v_applied boolean;
  v_notification_count integer;
begin
  v_message :=
    nullif(
      btrim(
        coalesce(
          p_sender_message,
          ''
        )
      ),
      ''
    );

  if v_message is not null
     and char_length(v_message) > 200
  then
    raise exception
      'GAME_GIFT_MESSAGE_INVALID'
      using errcode = '22023';
  end if;

  v_result :=
    public.cing_game_gift_purchase_private_v1(
      p_sender_user_id,
      p_recipient_user_id,
      p_gift_id,
      p_request_id,
      p_funding_source
    );

  select
    g.sender_message
  into
    v_existing_message
  from public.cing_game_gift_purchases g
  where g.id = p_request_id
  for update;

  if not found then
    raise exception
      'GAME_GIFT_RECEIPT_MISSING'
      using errcode = '55000';
  end if;

  v_applied :=
    coalesce(
      (v_result ->> 'applied')::boolean,
      false
    );

  if v_applied then
    update public.cing_game_gift_purchases
    set
      sender_message = v_message,
      updated_at = clock_timestamp()
    where id = p_request_id;

    update public.notifications
    set
      message =
        case
          when v_message is null
            then message
          else
            message
            || E'\nLời nhắn: '
            || v_message
        end,
      metadata =
        metadata
        || jsonb_build_object(
          'senderMessage',
          v_message
        )
    where user_id =
            btrim(p_recipient_user_id)
      and type =
            'gift_received'
      and metadata ->> 'source' =
            'cing_game_gift_purchase_v1'
      and metadata ->> 'gift_purchase_id' =
            p_request_id::text;

    get diagnostics
      v_notification_count = row_count;

    if v_notification_count <> 1 then
      raise exception
        'GAME_GIFT_NOTIFICATION_BINDING_FAILED'
        using errcode = '55000';
    end if;

  else
    /*
     * Replay MUST carry the same message as the immutable
     * request identity. A caller cannot reuse request_id
     * and silently change the recipient message.
     */
    if v_existing_message
         is distinct from
       v_message
    then
      raise exception
        'GAME_GIFT_REQUEST_CONFLICT'
        using errcode = '23505';
    end if;
  end if;

  return
    v_result
    || jsonb_build_object(
      'sender_message',
      v_message
    );
end;
$function$;


/*
 * Public backend-facing funding wrappers.
 * Client never supplies funding_source.
 */
create or replace function
public.cing_game_gift_purchase_wallet_v2(
  p_sender_user_id text,
  p_recipient_user_id text,
  p_gift_id text,
  p_request_id uuid,
  p_sender_message text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
begin
  return
    public.cing_game_gift_purchase_private_v2(
      p_sender_user_id,
      p_recipient_user_id,
      p_gift_id,
      p_request_id,
      'wallet',
      p_sender_message
    );
end;
$function$;


create or replace function
public.cing_game_gift_purchase_points_v2(
  p_sender_user_id text,
  p_recipient_user_id text,
  p_gift_id text,
  p_request_id uuid,
  p_sender_message text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
begin
  return
    public.cing_game_gift_purchase_private_v2(
      p_sender_user_id,
      p_recipient_user_id,
      p_gift_id,
      p_request_id,
      'points',
      p_sender_message
    );
end;
$function$;


/*
 * Preserve V1 dormant boundary explicitly.
 */
revoke all
on function
public.cing_game_gift_purchase_private_v1(
  text,
  text,
  text,
  uuid,
  text
)
from public, anon, authenticated, service_role;

revoke all
on function
public.cing_game_gift_purchase_wallet_v1(
  text,
  text,
  text,
  uuid
)
from public, anon, authenticated, service_role;

revoke all
on function
public.cing_game_gift_purchase_points_v1(
  text,
  text,
  text,
  uuid
)
from public, anon, authenticated, service_role;


/*
 * V2 private core is never directly executable by backend
 * or client roles.
 */
revoke all
on function
public.cing_game_gift_purchase_private_v2(
  text,
  text,
  text,
  uuid,
  text,
  text
)
from public, anon, authenticated, service_role;


/*
 * V2 funding wrappers are backend-only.
 */
revoke all
on function
public.cing_game_gift_purchase_wallet_v2(
  text,
  text,
  text,
  uuid,
  text
)
from public, anon, authenticated, service_role;

revoke all
on function
public.cing_game_gift_purchase_points_v2(
  text,
  text,
  text,
  uuid,
  text
)
from public, anon, authenticated, service_role;

grant execute
on function
public.cing_game_gift_purchase_wallet_v2(
  text,
  text,
  text,
  uuid,
  text
)
to service_role;

grant execute
on function
public.cing_game_gift_purchase_points_v2(
  text,
  text,
  text,
  uuid,
  text
)
to service_role;


/*
 * Release postconditions.
 */
do $$
begin
  if has_function_privilege(
    'service_role',
    'public.cing_game_gift_purchase_private_v2(text,text,text,uuid,text,text)',
    'EXECUTE'
  ) then
    raise exception
      'CING_GAME_GIFT_PRIVATE_V2_EXECUTE_FORBIDDEN';
  end if;

  if not has_function_privilege(
    'service_role',
    'public.cing_game_gift_purchase_wallet_v2(text,text,text,uuid,text)',
    'EXECUTE'
  ) then
    raise exception
      'CING_GAME_GIFT_WALLET_V2_EXECUTE_MISSING';
  end if;

  if not has_function_privilege(
    'service_role',
    'public.cing_game_gift_purchase_points_v2(text,text,text,uuid,text)',
    'EXECUTE'
  ) then
    raise exception
      'CING_GAME_GIFT_POINTS_V2_EXECUTE_MISSING';
  end if;

  if has_function_privilege(
       'anon',
       'public.cing_game_gift_purchase_wallet_v2(text,text,text,uuid,text)',
       'EXECUTE'
     )
     or has_function_privilege(
       'authenticated',
       'public.cing_game_gift_purchase_wallet_v2(text,text,text,uuid,text)',
       'EXECUTE'
     )
     or has_function_privilege(
       'anon',
       'public.cing_game_gift_purchase_points_v2(text,text,text,uuid,text)',
       'EXECUTE'
     )
     or has_function_privilege(
       'authenticated',
       'public.cing_game_gift_purchase_points_v2(text,text,text,uuid,text)',
       'EXECUTE'
     )
  then
    raise exception
      'CING_GAME_GIFT_CLIENT_V2_EXECUTE_FORBIDDEN';
  end if;

  if has_function_privilege(
       'service_role',
       'public.cing_game_gift_purchase_wallet_v1(text,text,text,uuid)',
       'EXECUTE'
     )
     or has_function_privilege(
       'service_role',
       'public.cing_game_gift_purchase_points_v1(text,text,text,uuid)',
       'EXECUTE'
     )
  then
    raise exception
      'CING_GAME_GIFT_V1_MUST_REMAIN_DORMANT';
  end if;
end
$$;

commit;
