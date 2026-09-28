"use strict";

const test = require("node:test");

const assert = require("node:assert/strict");

const fs = require("node:fs");

const path = require("node:path");

const ROOT = path.resolve(
  __dirname,
  "../../../.."
);

const ORIGINAL = fs.readFileSync(
  path.join(
    ROOT,
    "db/migrations/20260911_commerce_point_redemption_durable_ipos_delivery_v1.sql"
  ),
  "utf8"
);

const PRIMARY = fs.readFileSync(
  path.join(
    ROOT,
    "db/migrations/20260926_cing_points_revive_credit_snapshot_protection_v1.sql"
  ),
  "utf8"
);

const MIRROR = fs.readFileSync(
  path.join(
    ROOT,
    "supabase/migrations/20260926011000_cing_points_revive_credit_snapshot_protection_v1.sql"
  ),
  "utf8"
);

function extract(source) {
  const pattern =
    /create\s+or\s+replace\s+function\s+public\.cing_loyalty_apply_external_point_snapshot_guarded\s*\(/gi;

  const matches = [
    ...source.matchAll(pattern),
  ];

  assert.equal(
    matches.length,
    1
  );

  const tail = source.slice(
    matches[0].index
  );

  const end = tail.match(
    /\$function\$\s*;/i
  );

  assert.ok(end);

  return tail.slice(
    0,
    end.index + end[0].length
  );
}

const oldFunction = extract(ORIGINAL);

const newFunction = extract(PRIMARY);

const extension = `
  /*
   * CING GAME CENTER V2
   * Points -> Revive Credit durable MINUS fence.
   *
   * A successful PostgreSQL point debit and credit grant
   * creates a durable purchase receipt in the same transaction.
   *
   * Until the exact iPOS membership_log MINUS is proven,
   * an older CRM balance must never restore spent points.
   *
   * This extends the existing V4 + Commerce protection.
   * It does not modify their predicates or status lifecycle.
   */

  if not v_protected then

    select exists (

      select 1

      from public.cing_points_revive_credit_purchases r

      where r.user_id = p_user_id

        and r.ipos_sync_status in (

          'pending',

          'processing',

          'failed'

        )

    )

    into v_protected;

  end if;


`;

test(
  "Supabase migration mirror is exact",
  () => {
    assert.equal(
      PRIMARY,
      MIRROR
    );
  }
);

test(
  "existing V4 and Commerce authority is preserved exactly",
  () => {
    assert.equal(
      newFunction.replace(
        extension,
        ""
      ),
      oldFunction
    );
  }
);

test(
  "new pending/processing/failed purchase blocks stale snapshots",
  () => {
    assert.match(
      extension,
      /cing_points_revive_credit_purchases r/
    );

    for (
      const status of [
        "pending",
        "processing",
        "failed",
      ]
    ) {
      assert.ok(
        extension.includes(
          "'" + status + "'"
        )
      );
    }
  }
);

test(
  "existing player serialization remains authoritative",
  () => {
    assert.match(
      newFunction,
      /from public\.players[\s\S]*for update/i
    );

    const lock = newFunction.indexOf(
      "for update;"
    );

    const protection = newFunction.indexOf(
      "from public.cing_points_revive_credit_purchases"
    );

    const mutation = newFunction.indexOf(
      "update public.players"
    );

    assert.ok(
      lock >= 0
    );

    assert.ok(
      protection > lock
    );

    assert.ok(
      mutation > protection
    );
  }
);

test(
  "purchase protection has partial index",
  () => {
    assert.match(
      PRIMARY,
      /create index if not exists\s+cing_points_revive_purchase_protection_idx/i
    );
  }
);

test(
  "migration never activates financial RPC",
  () => {
    const executable = PRIMARY
      .replace(
        /\/\*[\s\S]*?\*\//g,
        ""
      )
      .replace(
        /--[^\n]*/g,
        ""
      );

    assert.doesNotMatch(
      executable,
      /\bgrant execute\b/i
    );

    assert.doesNotMatch(
      executable,
      /cing_points_purchase_revive_credits_v1\s*\(/i
    );
  }
);

test(
  "migration does not directly mutate points or credits",
  () => {
    const executable = PRIMARY
      .replace(
        /\/\*[\s\S]*?\*\//g,
        ""
      )
      .replace(
        /--[^\n]*/g,
        ""
      );

    assert.doesNotMatch(
      executable,
      /update\s+public\.cing_revive_credit_balances/i
    );

    assert.doesNotMatch(
      executable,
      /insert into\s+public\.point_transactions/i
    );
  }
);
