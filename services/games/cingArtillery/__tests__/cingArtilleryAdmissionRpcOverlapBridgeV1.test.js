"use strict";

const assert =
  require("node:assert/strict");

const fs =
  require("node:fs");

const path =
  require("node:path");

const test =
  require("node:test");

const root =
  path.resolve(
    __dirname,
    "../../../.."
  );

const bridgePath =
  path.join(
    root,
    "db/migrations/20260825_cing_artillery_admission_rpc_overlap_bridge_v1.sql"
  );

const m64Path =
  path.join(
    root,
    "db/migrations/20260824_cing_artillery_admission_side_door_authority_v1.sql"
  );

const bridge =
  fs.readFileSync(
    bridgePath,
    "utf8"
  );

const m64 =
  fs.readFileSync(
    m64Path,
    "utf8"
  );

function extractRpcSurface(
  source,
  name,
  argType
) {
  const escapedName =
    name.replace(
      /[.*+?^${}()|[\]\\]/gu,
      "\\$&"
    );

  const escapedArg =
    argType.replace(
      /[.*+?^${}()|[\]\\]/gu,
      "\\$&"
    );

  const create =
    new RegExp(
      "CREATE\\s+OR\\s+REPLACE\\s+FUNCTION\\s+"
      + "public\\."
      + escapedName
      + "\\s*\\(",
      "isu"
    );

  const createMatch =
    create.exec(
      source
    );

  assert.ok(
    createMatch,
    `missing function ${name}`
  );

  const tail =
    source.slice(
      createMatch.index
    );

  const grant =
    new RegExp(
      "GRANT\\s+EXECUTE\\s+ON\\s+FUNCTION\\s+"
      + "public\\."
      + escapedName
      + "\\s*\\(\\s*"
      + escapedArg
      + "\\s*\\)\\s+TO\\s+service_role\\s*;",
      "isu"
    );

  const grantMatch =
    grant.exec(
      tail
    );

  assert.ok(
    grantMatch,
    `missing service_role grant ${name}`
  );

  return tail
    .slice(
      0,
      grantMatch.index
        + grantMatch[0].length
    )
    .trim();
}

const rpcContracts = [
  [
    "cing_artillery_get_or_create_account_authorized_v1",
    "text",
  ],
  [
    "cing_artillery_get_or_create_gameplay_session_authorized_v1",
    "uuid",
  ],
];

test(
  "bridge contains exactly two authorized admission function rewrites",
  () => {
    const matches =
      bridge.match(
        /CREATE\s+OR\s+REPLACE\s+FUNCTION/giu
      ) || [];

    assert.equal(
      matches.length,
      2
    );

    for (
      const [
        name,
      ]
      of rpcContracts
    ) {
      assert.match(
        bridge,
        new RegExp(
          `public\\.${name}\\s*\\(`,
          "u"
        )
      );
    }
  }
);

test(
  "bridge RPC surfaces remain byte-semantic copies of locked migration64",
  () => {
    for (
      const [
        name,
        argType,
      ]
      of rpcContracts
    ) {
      assert.equal(
        extractRpcSurface(
          bridge,
          name,
          argType
        ),
        extractRpcSurface(
          m64,
          name,
          argType
        )
      );
    }
  }
);

test(
  "bridge preserves migration63 effective-access dependency",
  () => {
    assert.match(
      bridge,
      /cing_artillery_has_effective_gameplay_access_v1/u
    );

    assert.match(
      bridge,
      /cing_artillery_account_has_effective_gameplay_access_private_v1/u
    );
  }
);

test(
  "bridge grants only authorized RPC execution to service_role",
  () => {
    const grants =
      bridge.match(
        /GRANT\s+EXECUTE\s+ON\s+FUNCTION/giu
      ) || [];

    assert.equal(
      grants.length,
      2
    );

    assert.match(
      bridge,
      /cing_artillery_get_or_create_account_authorized_v1[\s\S]*?TO\s+service_role\s*;/u
    );

    assert.match(
      bridge,
      /cing_artillery_get_or_create_gameplay_session_authorized_v1[\s\S]*?TO\s+service_role\s*;/u
    );
  }
);

test(
  "bridge owns no admission table ACL cutover",
  () => {
    assert.doesNotMatch(
      bridge,
      /ALTER\s+TABLE/iu
    );

    assert.doesNotMatch(
      bridge,
      /ENABLE\s+ROW\s+LEVEL\s+SECURITY/iu
    );

    assert.doesNotMatch(
      bridge,
      /REVOKE\s+ALL\s+ON\s+TABLE/iu
    );

    assert.doesNotMatch(
      bridge,
      /GRANT\s+SELECT\s+ON\s+TABLE/iu
    );

    assert.doesNotMatch(
      bridge,
      /GRANT\s+(?:INSERT|UPDATE|DELETE)\b/iu
    );
  }
);

test(
  "bridge owns no global gameplay or private-beta mutation",
  () => {
    assert.doesNotMatch(
      bridge,
      /cing_artillery_set_gameplay_enabled/u
    );

    assert.doesNotMatch(
      bridge,
      /cing_artillery_set_execution_worker_enabled/u
    );

    assert.doesNotMatch(
      bridge,
      /INSERT\s+INTO\s+public\.cing_artillery_private_beta_access/iu
    );

    assert.doesNotMatch(
      bridge,
      /UPDATE\s+public\.cing_artillery_private_beta_access/iu
    );

    assert.doesNotMatch(
      bridge,
      /DELETE\s+FROM\s+public\.cing_artillery_private_beta_access/iu
    );
  }
);

test(
  "bridge is one explicit transaction",
  () => {
    const begins =
      bridge.match(
        /\bBEGIN\s*;/giu
      ) || [];

    const commits =
      bridge.match(
        /\bCOMMIT\s*;/giu
      ) || [];

    assert.equal(
      begins.length,
      1
    );

    assert.equal(
      commits.length,
      1
    );

    assert.ok(
      bridge.indexOf(
        "BEGIN;"
      ) <
      bridge.lastIndexOf(
        "COMMIT;"
      )
    );
  }
);
