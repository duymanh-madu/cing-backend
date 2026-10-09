BEGIN;
CREATE TABLE IF NOT EXISTS public.cing_plaza_character_profiles_v7 (
 member_id text PRIMARY KEY, character text NOT NULL CHECK(character IN ('boy','girl')),
 revision integer NOT NULL DEFAULT 1 CHECK(revision>0), created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.cing_plaza_character_audit_v7 (
 command_id uuid PRIMARY KEY,admin_id text NOT NULL,member_id text NOT NULL,old_character text NOT NULL,new_character text NOT NULL,
 expected_revision integer NOT NULL,new_revision integer NOT NULL,reason text NOT NULL,created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.cing_plaza_character_profiles_v7 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cing_plaza_character_audit_v7 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.cing_plaza_character_profiles_v7,public.cing_plaza_character_audit_v7 FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.cing_plaza_character_read_v7(p_member_id text) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT jsonb_build_object('character',character,'revision',revision) FROM public.cing_plaza_character_profiles_v7 WHERE member_id=p_member_id;
$$;
CREATE OR REPLACE FUNCTION public.cing_plaza_character_choose_v7(p_member_id text,p_character text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 IF p_member_id IS NULL OR length(p_member_id)=0 OR length(p_member_id)>128 OR p_character IS NULL OR p_character NOT IN ('boy','girl') THEN RAISE EXCEPTION 'PLAZA_INVALID_CHARACTER';END IF;
 INSERT INTO public.cing_plaza_character_profiles_v7(member_id,character) VALUES(p_member_id,p_character) ON CONFLICT(member_id) DO NOTHING;
 RETURN public.cing_plaza_character_read_v7(p_member_id);
END;$$;
CREATE OR REPLACE FUNCTION public.cing_plaza_character_admin_set_v7(p_admin_id text,p_member_id text,p_character text,p_expected_revision integer,p_reason text,p_command_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE old public.cing_plaza_character_profiles_v7; receipt public.cing_plaza_character_audit_v7;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.admins WHERE id::text=p_admin_id AND role='super_admin' AND active=true) THEN RAISE EXCEPTION 'PLAZA_SUPER_ADMIN_REQUIRED';END IF;
 IF p_command_id IS NULL OR p_character IS NULL OR p_character NOT IN ('boy','girl') OR p_reason IS NULL OR length(trim(p_reason))<5 OR length(p_reason)>500 OR p_expected_revision IS NULL OR p_expected_revision<1 THEN RAISE EXCEPTION 'PLAZA_INVALID_REQUEST';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_command_id::text,0));
 SELECT * INTO receipt FROM public.cing_plaza_character_audit_v7 WHERE command_id=p_command_id;
 IF FOUND THEN
  IF receipt.admin_id<>p_admin_id OR receipt.member_id<>p_member_id OR receipt.new_character<>p_character OR receipt.expected_revision<>p_expected_revision OR receipt.reason<>p_reason THEN RAISE EXCEPTION 'PLAZA_COMMAND_CONFLICT';END IF;
  RETURN jsonb_build_object('character',receipt.new_character,'revision',receipt.new_revision);
 END IF;
 SELECT * INTO old FROM public.cing_plaza_character_profiles_v7 WHERE member_id=p_member_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'PLAZA_CHARACTER_REQUIRED';END IF;
 IF old.revision<>p_expected_revision THEN RAISE EXCEPTION 'PLAZA_PROFILE_CONFLICT';END IF;
 UPDATE public.cing_plaza_character_profiles_v7 SET character=p_character,revision=revision+1,updated_at=now() WHERE member_id=p_member_id;
 INSERT INTO public.cing_plaza_character_audit_v7 VALUES(p_command_id,p_admin_id,p_member_id,old.character,p_character,p_expected_revision,old.revision+1,p_reason,now());
 RETURN public.cing_plaza_character_read_v7(p_member_id);
END;$$;
REVOKE ALL ON FUNCTION public.cing_plaza_character_read_v7(text),public.cing_plaza_character_choose_v7(text,text),public.cing_plaza_character_admin_set_v7(text,text,text,integer,text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.cing_plaza_character_read_v7(text),public.cing_plaza_character_choose_v7(text,text),public.cing_plaza_character_admin_set_v7(text,text,text,integer,text,uuid) TO service_role;
COMMIT;
