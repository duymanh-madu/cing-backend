begin;

create table if not exists
public.cing_block_puzzle_submit_effects (
  session_id uuid primary key
    references public.cing_block_puzzle_sessions(id)
    on delete cascade,

  effect_type text not null
    default 'top1_check',

  status text not null
    default 'pending',

  attempt_count integer not null
    default 0,

  next_attempt_at timestamptz not null
    default now(),

  locked_until timestamptz,

  last_error text,

  created_at timestamptz not null
    default now(),

  updated_at timestamptz not null
    default now(),

  delivered_at timestamptz,

  constraint
    cing_block_puzzle_submit_effects_type_ck
    check (
      effect_type = 'top1_check'
    ),

  constraint
    cing_block_puzzle_submit_effects_status_ck
    check (
      status in (
        'pending',
        'processing',
        'delivered',
        'failed'
      )
    ),

  constraint
    cing_block_puzzle_submit_effects_attempt_count_ck
    check (
      attempt_count >= 0
    )
);

create index if not exists
cing_block_puzzle_submit_effects_queue_idx
on public.cing_block_puzzle_submit_effects (
  status,
  next_attempt_at,
  created_at
);

alter table
public.cing_block_puzzle_submit_effects
enable row level security;

revoke all
on table
public.cing_block_puzzle_submit_effects
from public, anon, authenticated;

grant
select,
insert,
update,
delete
on table
public.cing_block_puzzle_submit_effects
to service_role;


do $migration$
declare
  v_oid oid;
  v_definition text;
  v_before text;
  v_pattern text;
  v_count integer;
begin
  v_oid :=
    to_regprocedure(
      'public.cing_block_puzzle_submit_session_atomic_v2('
      || 'uuid,text,integer,text,integer,integer,integer,integer)'
    );

  if v_oid is null then
    raise exception
      'BLOCK_PUZZLE_SUBMIT_EFFECT_RPC_NOT_FOUND';
  end if;

  v_definition :=
    pg_get_functiondef(
      v_oid
    );

  if position(
    'cing_block_puzzle_submit_session_atomic('
    in v_definition
  ) = 0
  or position(
    'continue_count'
    in v_definition
  ) = 0
  or position(
    'for update'
    in lower(v_definition)
  ) = 0
  or position(
    'return'
    in lower(v_definition)
  ) = 0 then
    raise exception
      'BLOCK_PUZZLE_SUBMIT_EFFECT_EXPECTED_AUTHORITY_MISSING';
  end if;

  if position(
    'cing_block_puzzle_submit_effects'
    in v_definition
  ) > 0 then
    raise exception
      'BLOCK_PUZZLE_SUBMIT_EFFECT_ALREADY_PRESENT';
  end if;

  v_pattern :=
    'return[[:space:]]+'
    || 'v_result[[:space:]]*'
    || '\|\|[[:space:]]*'
    || 'jsonb_build_object';

  select count(*)
  into v_count
  from regexp_matches(
    v_definition,
    v_pattern,
    'gi'
  );

  if v_count <> 1 then
    raise exception
      'BLOCK_PUZZLE_SUBMIT_EFFECT_RETURN_OCCURRENCE_INVALID';
  end if;

  v_before :=
    v_definition;

  v_definition :=
    regexp_replace(
      v_definition,
      v_pattern,
      $replacement$
insert into
    public.cing_block_puzzle_submit_effects (
      session_id,
      effect_type,
      status,
      attempt_count,
      next_attempt_at,
      created_at,
      updated_at
    )
  values (
    p_session_id,
    'top1_check',
    'pending',
    0,
    now(),
    now(),
    now()
  )
  on conflict (
    session_id
  )
  do nothing;

  return
    v_result ||
    jsonb_build_object
$replacement$,
      'i'
    );

  if v_definition =
    v_before then
    raise exception
      'BLOCK_PUZZLE_SUBMIT_EFFECT_TRANSFORM_FAILED';
  end if;

  execute
    v_definition;
end;
$migration$;


revoke all
on function
public.cing_block_puzzle_submit_session_atomic_v2(
  uuid,
  text,
  integer,
  text,
  integer,
  integer,
  integer,
  integer
)
from public, anon, authenticated;

grant execute
on function
public.cing_block_puzzle_submit_session_atomic_v2(
  uuid,
  text,
  integer,
  text,
  integer,
  integer,
  integer,
  integer
)
to service_role;


do $migration$
declare
  v_definition text;
  v_count integer;
begin
  v_definition :=
    pg_get_functiondef(
      to_regprocedure(
        'public.cing_block_puzzle_submit_session_atomic_v2('
        || 'uuid,text,integer,text,integer,integer,integer,integer)'
      )
    );

  select count(*)
  into v_count
  from regexp_matches(
    v_definition,
    'insert into[[:space:]]+public\.cing_block_puzzle_submit_effects',
    'gi'
  );

  if v_count <> 1 then
    raise exception
      'BLOCK_PUZZLE_SUBMIT_EFFECT_POSTCHECK_FAILED';
  end if;

  if position(
    'on conflict'
    in lower(v_definition)
  ) = 0
  or position(
    'do nothing'
    in lower(v_definition)
  ) = 0
  or position(
    'cing_block_puzzle_submit_session_atomic('
    in v_definition
  ) = 0
  or position(
    'for update'
    in lower(v_definition)
  ) = 0 then
    raise exception
      'BLOCK_PUZZLE_SUBMIT_EFFECT_AUTHORITY_PRESERVATION_FAILED';
  end if;
end;
$migration$;

commit;
