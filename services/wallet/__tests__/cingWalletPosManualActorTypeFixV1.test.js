"use strict";

const test =
  require("node:test");

const assert =
  require("node:assert/strict");

const fs =
  require("node:fs");

const db =
  fs.readFileSync(
    "db/migrations/20260914_cing_wallet_pos_manual_actor_type_fix_v1.sql",
    "utf8"
  );

const sb =
  fs.readFileSync(
    "supabase/migrations/20260914070000_cing_wallet_pos_manual_actor_type_fix_v1.sql",
    "utf8"
  );

test(
  "actor type fix mirrors remain byte-identical",
  () => {
    assert.equal(
      db,
      sb
    );
  }
);

test(
  "manual session audit uses canonical cashier actor type",
  () => {
    assert.match(
      db,
      /'MANUAL_SESSION_CREATED'[\s\S]*'cashier'[\s\S]*v_actor_id/
    );

    assert.doesNotMatch(
      db,
      /'MANUAL_SESSION_CREATED'[\s\S]{0,120}'admin'/
    );
  }
);

test(
  "fix does not weaken canonical audit constraint",
  () => {
    assert.doesNotMatch(
      db,
      /drop constraint|alter constraint|disable trigger/i
    );
  }
);

test(
  "manual authority remains service-role only",
  () => {
    assert.match(
      db,
      /revoke all on function[\s\S]*from public,\s*anon,\s*authenticated/i
    );

    assert.match(
      db,
      /grant execute on function[\s\S]*to service_role/i
    );
  }
);
