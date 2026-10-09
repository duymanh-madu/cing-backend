-- Plaza-only unranked cutover. Keeps legacy ranked Chess, existing statistics and historic results unchanged.
BEGIN;
DO $$BEGIN
 IF to_regprocedure('public.cing_plaza_chess_apply_v3(uuid,bigint,jsonb)') IS NULL THEN RAISE EXCEPTION 'PLAZA_V5_BASE_REQUIRED';END IF;
END;$$;
CREATE OR REPLACE FUNCTION public.cing_plaza_chess_apply_v3(
 p_match_id uuid,p_expected_revision bigint,p_state jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE
 m public.cing_plaza_chess_matches_v3%ROWTYPE;
 s public.chess_stats%ROWTYPE;
 typed public.chess_stats%ROWTYPE;
 p jsonb; phone text; won boolean; is_draw boolean;
 today text:=to_char(now() AT TIME ZONE 'Asia/Ho_Chi_Minh','YYYY-MM-DD');
 next_state jsonb:=jsonb_set(p_state,'{ranked}','false'::jsonb); terminal boolean:=p_state->>'phase'='finished';
BEGIN
 IF p_match_id IS NULL OR p_expected_revision IS NULL OR p_expected_revision<0
 OR jsonb_typeof(p_state) IS DISTINCT FROM 'object'
 OR jsonb_typeof(p_state->'players') IS DISTINCT FROM 'array'
 OR p_state->>'phase' IS NULL
 OR p_state->>'roomId' IS NULL OR p_state->>'tableId' IS NULL
 OR p_state->>'matchId' IS DISTINCT FROM p_match_id::text
 OR p_state->>'gameId' IS DISTINCT FROM 'chess'
 OR (p_state->>'revision')::bigint IS DISTINCT FROM p_expected_revision+1
 OR jsonb_array_length(p_state->'players')<>2
 OR p_state->>'phase' NOT IN ('preparing','active','finished')
 OR length(coalesce(p_state#>>'{command,id}','')) NOT BETWEEN 1 AND 160
 THEN RAISE EXCEPTION 'PLAZA_INVALID_MATCH_STATE';END IF;
 IF (p_state#>>'{players,0,memberId}')=(p_state#>>'{players,1,memberId}')
 OR (p_state#>>'{players,0,playerId}')=(p_state#>>'{players,1,playerId}')
 THEN RAISE EXCEPTION 'PLAZA_DISTINCT_PLAYERS_REQUIRED';END IF;
 FOR p IN SELECT value FROM jsonb_array_elements(p_state->'players') LOOP
  IF p->>'memberId' IS NULL THEN RAISE EXCEPTION 'PLAZA_INVALID_PLAYER_BINDING';END IF;
  PERFORM (p->>'memberId')::uuid;
  IF coalesce(p->>'playerId','') !~ '^0[0-9]{9,10}$' THEN RAISE EXCEPTION 'PLAZA_INVALID_PLAYER_BINDING';END IF;
 END LOOP;
 -- Serialize creation and transitions of this UUID, including concurrent first retries.
 PERFORM pg_advisory_xact_lock(hashtextextended(p_match_id::text,0));
 SELECT * INTO m FROM public.cing_plaza_chess_matches_v3 WHERE id=p_match_id FOR UPDATE;
 IF FOUND THEN
  IF m.state#>>'{command,id}'=p_state#>>'{command,id}' THEN
   IF m.state->'command' IS DISTINCT FROM p_state->'command' THEN RAISE EXCEPTION 'PLAZA_COMMAND_CONFLICT';END IF;
   RETURN jsonb_build_object('applied',false,'state',m.state);
  END IF;
  IF m.revision<>p_expected_revision OR m.result_applied
   OR m.state->'players' IS DISTINCT FROM p_state->'players'
   OR m.state->>'roomId' IS DISTINCT FROM p_state->>'roomId'
   OR m.state->>'tableId' IS DISTINCT FROM p_state->>'tableId'
   OR (m.state->>'phase'='active' AND p_state->>'phase'='preparing')
  THEN RAISE EXCEPTION 'PLAZA_MATCH_REVISION_CONFLICT';END IF;
 ELSE
  IF p_expected_revision<>0 OR p_state->>'phase'<>'preparing' THEN RAISE EXCEPTION 'PLAZA_MATCH_NOT_FOUND';END IF;
  INSERT INTO public.cing_plaza_chess_matches_v3(id,revision,state) VALUES(p_match_id,1,p_state);
 END IF;
 IF terminal THEN
  IF p_state->'result' IS NULL OR p_state->'result'='null'::jsonb THEN RAISE EXCEPTION 'PLAZA_RESULT_REQUIRED';END IF;
  IF p_state#>>'{result,reason}' IS NULL OR p_state#>>'{result,reason}' NOT IN ('checkmate','resign','timeout','draw','cancelled') OR jsonb_typeof(p_state#>'{result,endedAt}') IS DISTINCT FROM 'number' THEN RAISE EXCEPTION 'PLAZA_INVALID_RESULT';END IF;
  is_draw:=coalesce(p_state#>>'{result,winnerId}','')='';
  IF NOT is_draw AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(p_state->'players') q WHERE q->>'memberId'=p_state#>>'{result,winnerId}') THEN RAISE EXCEPTION 'PLAZA_INVALID_WINNER';END IF;
  IF p_state#>>'{result,reason}'='cancelled' THEN
   IF m.state->>'phase' IS DISTINCT FROM 'preparing' OR NOT is_draw
   THEN RAISE EXCEPTION 'PLAZA_INVALID_CANCELLATION';END IF;
   next_state:=jsonb_set(p_state,'{ranked}','false'::jsonb);
  ELSE
   IF m.state->>'phase' IS DISTINCT FROM 'active' THEN RAISE EXCEPTION 'PLAZA_MATCH_NOT_STARTED';END IF;
   -- Persist the outcome only. No global stats, result receipt or reward writer.
   next_state:=jsonb_set(p_state,'{ranked}','false'::jsonb);
  END IF;
 END IF;
 UPDATE public.cing_plaza_chess_matches_v3 SET revision=(p_state->>'revision')::bigint,state=next_state,result_applied=terminal,updated_at=now() WHERE id=p_match_id;
 RETURN jsonb_build_object('applied',true,'state',next_state);
END;
$$;
REVOKE ALL ON FUNCTION public.cing_plaza_chess_read_v3(uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.cing_plaza_chess_apply_v3(uuid,bigint,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.cing_plaza_chess_read_v3(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.cing_plaza_chess_apply_v3(uuid,bigint,jsonb) TO service_role;

COMMIT;
