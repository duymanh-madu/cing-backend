begin;

/*
 * Cing Block Puzzle session table is backend-owned authority.
 *
 * Supabase default privileges may grant service_role broader
 * table capabilities than this subsystem requires.
 *
 * Explicitly reduce service_role to the minimum durable
 * repository contract required by the application.
 */
revoke all
on table public.cing_block_puzzle_sessions
from service_role;

grant select, insert, update
on table public.cing_block_puzzle_sessions
to service_role;

/*
 * Client roles must never receive direct durable session access.
 */
revoke all
on table public.cing_block_puzzle_sessions
from public;

revoke all
on table public.cing_block_puzzle_sessions
from anon;

revoke all
on table public.cing_block_puzzle_sessions
from authenticated;

commit;
