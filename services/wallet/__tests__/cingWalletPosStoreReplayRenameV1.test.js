const assert =
  require("node:assert/strict");

const crypto =
  require("node:crypto");

const fs =
  require("node:fs");

const test =
  require("node:test");


const DB =
  "db/migrations/20260914_cing_wallet_pos_store_registry_v1.sql";

const SB =
  "supabase/migrations/20260914041000_cing_wallet_pos_store_registry_v1.sql";


const source =
  fs.readFileSync(
    DB,
    "utf8"
  );


function hash(path) {
  return crypto
    .createHash(
      "sha256"
    )
    .update(
      fs.readFileSync(
        path
      )
    )
    .digest(
      "hex"
    );
}


function v3Body() {
  const start =
    source.indexOf(
      "public.cing_wallet_prepare_manual_pos_payment_v3("
    );

  assert.ok(
    start >= 0
  );

  const end =
    source.indexOf(
      "\n$$;",
      start
    );

  assert.ok(
    end > start
  );

  return source.slice(
    start,
    end + 4
  );
}


test(
  "store registry migration mirrors remain byte identical",
  () => {
    assert.equal(
      hash(DB),
      hash(SB)
    );
  }
);


test(
  "first create snapshots current store attribution",
  () => {
    const body =
      v3Body();

    assert.match(
      body,
      /'store_id'[\s\S]*v_store\.store_id/
    );

    assert.match(
      body,
      /'store_code'[\s\S]*v_store\.store_code/
    );

    assert.match(
      body,
      /'store_display_name'[\s\S]*v_store\.display_name/
    );
  }
);


test(
  "replay validates stable store id and POS authority",
  () => {
    const body =
      v3Body();

    assert.match(
      body,
      /metadata->>'store_id'\s*=[\s\S]*v_store\.store_id::text/
    );

    assert.match(
      body,
      /pos_parent\s*=[\s\S]*v_store\.pos_parent/
    );

    assert.match(
      body,
      /pos_id\s*=[\s\S]*v_store\.pos_id/
    );
  }
);


test(
  "replay ignores later mutable store label changes",
  () => {
    const body =
      v3Body();

    assert.doesNotMatch(
      body,
      /metadata->>'store_code'\s*=\s*v_store\.store_code/
    );

    assert.doesNotMatch(
      body,
      /metadata->>'store_display_name'\s*=\s*v_store\.display_name/
    );
  }
);


test(
  "existing immutable snapshot is preserved",
  () => {
    const body =
      v3Body()
        .replace(
          /\s+/g,
          " "
        );

    assert.match(
      body,
      /case when metadata->>'store_id' is null and metadata->>'store_code' is null and metadata->>'store_display_name' is null then[\s\S]*else metadata end/
    );
  }
);


test(
  "replay response returns historical snapshot",
  () => {
    const body =
      v3Body();

    assert.match(
      body,
      /\(\s*v_store_snapshot->>'store_id'\s*\)::uuid/
    );

    assert.match(
      body,
      /v_store_snapshot->>'store_code'/
    );

    assert.match(
      body,
      /v_store_snapshot->>'store_display_name'/
    );
  }
);


test(
  "partial historical snapshots fail closed",
  () => {
    const body =
      v3Body();

    assert.match(
      body,
      /nullif\([\s\S]*metadata->>'store_code'[\s\S]*is not null/
    );

    assert.match(
      body,
      /nullif\([\s\S]*metadata->>'store_display_name'[\s\S]*is not null/
    );

    assert.match(
      body,
      /CING_WALLET_POS_STORE_SNAPSHOT_CONFLICT/
    );
  }
);
