"use strict";

const assert =
  require("node:assert/strict");

const fs =
  require("node:fs");

const test =
  require("node:test");


const storeMigration =
  fs.readFileSync(
    "db/migrations/20260914_cing_wallet_pos_store_registry_v1.sql",
    "utf8"
  );

const storeMirror =
  fs.readFileSync(
    "supabase/migrations/20260914041000_cing_wallet_pos_store_registry_v1.sql",
    "utf8"
  );

const sessionMigration =
  fs.readFileSync(
    "db/migrations/20260914_cing_wallet_pos_manual_session_authority_v2.sql",
    "utf8"
  );

const event11Migration =
  fs.readFileSync(
    "db/migrations/20260914_cing_wallet_pos_event11_manual_reconciliation_v2.sql",
    "utf8"
  );

const walletCore =
  fs.readFileSync(
    "db/migrations/20260826_cing_wallet_core_authority_v1.sql",
    "utf8"
  );

const service =
  fs.readFileSync(
    "services/wallet/cingWalletPosSessionService.js",
    "utf8"
  );

const route =
  fs.readFileSync(
    "routes/adminWalletPosRoutes.js",
    "utf8"
  );

const roles =
  fs.readFileSync(
    "services/adminRoleService.js",
    "utf8"
  );


test(
  "store registry mirrors remain byte-identical",
  () => {
    assert.equal(
      storeMigration,
      storeMirror
    );
  }
);


test(
  "canonical store registry is unique by store code and POS identity",
  () => {
    assert.match(
      storeMigration,
      /cing_wallet_pos_stores_store_code_uq/
    );

    assert.match(
      storeMigration,
      /cing_wallet_pos_stores_pos_identity_uq[\s\S]*pos_parent[\s\S]*pos_id/
    );
  }
);


test(
  "initial 109664 store exists as registry data",
  () => {
    assert.match(
      storeMigration,
      /'BRAND-DQIR'/
    );

    assert.match(
      storeMigration,
      /'109664'/
    );

    assert.match(
      storeMigration,
      /'Cing Hu Tang Kinh Bắc'/
    );
  }
);


test(
  "adding future stores is registry data, not payment-engine branching",
  () => {
    const serviceWithoutComments =
      service
        .replace(
          /\/\*[\s\S]*?\*\//g,
          ""
        )
        .replace(
          /\/\/.*$/gm,
          ""
        );

    assert.doesNotMatch(
      serviceWithoutComments,
      /109665|109666/
    );

    assert.doesNotMatch(
      route,
      /109665|109666/
    );

    assert.doesNotMatch(
      event11Migration,
      /109665|109666/
    );
  }
);


test(
  "canonical Admin Panel account owns one backend store binding",
  () => {
    assert.match(
      storeMigration,
      /alter table public\.admins[\s\S]*store_id uuid/
    );

    assert.match(
      storeMigration,
      /admins_cing_wallet_pos_store_fk/
    );

    assert.match(
      storeMigration,
      /references[\s\S]*public\.cing_wallet_pos_stores\(id\)/
    );
  }
);


test(
  "store resolver accepts only authenticated backend actor identity",
  () => {
    assert.match(
      storeMigration,
      /cing_wallet_resolve_counter_store_v1/
    );

    assert.match(
      storeMigration,
      /a\.id::text[\s\S]*v_actor_id/
    );

    assert.match(
      storeMigration,
      /a\.active[\s\S]*true/
    );

    assert.match(
      storeMigration,
      /s\.active[\s\S]*true/
    );

    assert.match(
      storeMigration,
      /a\.store_id/
    );
  }
);


test(
  "manual V3 resolves actor store then delegates existing V2 authority",
  () => {
    const start =
      storeMigration.indexOf(
        "public.cing_wallet_prepare_manual_pos_payment_v3("
      );

    const end =
      storeMigration.indexOf(
        "revoke all on function",
        start
      );

    const body =
      storeMigration.slice(
        start,
        end
      );

    assert.match(
      body,
      /cing_wallet_resolve_counter_store_v1/
    );

    assert.match(
      body,
      /cing_wallet_prepare_manual_pos_payment_v2/
    );

    assert.match(
      body,
      /v_store\.pos_parent/
    );

    assert.match(
      body,
      /v_store\.pos_id/
    );
  }
);


test(
  "manual Counter create remains one orchestration RPC",
  () => {
    const start =
      service.indexOf(
        "async function prepareManualPosPaymentQr"
      );

    const end =
      service.indexOf(
        "\nasync function freezeAmountAndCreateQr",
        start
      );

    const body =
      service.slice(
        start,
        end
      );

    const calls =
      [
        ...body.matchAll(
          /\.rpc\(\s*["']([^"']+)["']/g
        ),
      ];

    assert.equal(
      calls.length,
      1
    );

    assert.equal(
      calls[0][1],
      "cing_wallet_prepare_manual_pos_payment_v3"
    );

    assert.doesNotMatch(
      body,
      /\.from\s*\(/
    );
  }
);


test(
  "client cannot choose store or POS identity",
  () => {
    const start =
      route.indexOf(
        '"/manual-payment"'
      );

    const block =
      route.slice(
        start,
        start + 6500
      );

    const allowedStart =
      block.indexOf(
        "const allowedKeys"
      );

    const allowedEnd =
      block.indexOf(
        "const body",
        allowedStart
      );

    assert.ok(
      allowedStart >= 0 &&
      allowedEnd > allowedStart
    );

    const allowed =
      block.slice(
        allowedStart,
        allowedEnd
      );

    assert.match(
      allowed,
      /"amount"/
    );

    assert.match(
      allowed,
      /"request_id"/
    );

    for (
      const forbidden of [
        "store_id",
        "store_code",
        "store_name",
        "store_display_name",
        "pos_parent",
        "pos_id",
      ]
    ) {
      assert.equal(
        allowed.includes(
          forbidden
        ),
        false,
        forbidden
      );
    }
  }
);


test(
  "current session read is strictly actor-store POS scoped",
  () => {
    const serviceStart =
      service.indexOf(
        "async function getCurrentManualPosSession"
      );

    const serviceEnd =
      service.indexOf(
        "\nasync function prepareManualPosPaymentQr",
        serviceStart
      );

    assert.ok(
      serviceStart >= 0 &&
      serviceEnd > serviceStart
    );

    const serviceBody =
      service.slice(
        serviceStart,
        serviceEnd
      );

    assert.match(
      serviceBody,
      /cing_wallet_get_current_manual_pos_session_v1/
    );

    assert.match(
      serviceBody,
      /p_actor_admin_id/
    );

    assert.doesNotMatch(
      serviceBody,
      /resolveCounterStore\(/
    );

    assert.doesNotMatch(
      serviceBody,
      /\.from\s*\(/
    );

    const storeRegistryMigration =
      fs.readFileSync(
        "db/migrations/20260914_cing_wallet_pos_store_registry_v1.sql",
        "utf8"
      );

    const rpcStart =
      storeRegistryMigration.indexOf(
        "public.cing_wallet_get_current_manual_pos_session_v1("
      );

    const rpcEnd =
      storeRegistryMigration.indexOf(
        "\n$$;",
        rpcStart
      );

    assert.ok(
      rpcStart >= 0 &&
      rpcEnd > rpcStart
    );

    const rpcBody =
      storeRegistryMigration.slice(
        rpcStart,
        rpcEnd + 4
      );

    assert.match(
      rpcBody,
      /cing_wallet_resolve_counter_store_v1/
    );

    assert.match(
      rpcBody,
      /p_actor_admin_id/
    );

    assert.match(
      rpcBody,
      /ps\.pos_parent[\s\S]*v_store\.pos_parent/
    );

    assert.match(
      rpcBody,
      /ps\.pos_id[\s\S]*v_store\.pos_id/
    );

    assert.doesNotMatch(
      rpcBody,
      /p_store_id|p_pos_parent|p_pos_id/
    );
  }
);


test(
  "one active manual payment slot is scoped per POS not chain-wide",
  () => {
    const start =
      sessionMigration.indexOf(
        "cing_wallet_pos_sessions_active_payment_pos_uq"
      );

    assert.ok(
      start >= 0
    );

    const body =
      sessionMigration.slice(
        start,
        start + 1400
      );

    assert.match(
      body,
      /pos_parent/
    );

    assert.match(
      body,
      /pos_id/
    );

    assert.match(
      body,
      /cashier_manual/
    );

    assert.match(
      body,
      /reconciliation_pending/
    );
  }
);


test(
  "different POS identities can independently own active payment slots",
  () => {
    const start =
      sessionMigration.indexOf(
        "cing_wallet_pos_sessions_active_payment_pos_uq"
      );

    const body =
      sessionMigration.slice(
        start,
        start + 900
      );

    assert.match(
      body,
      /on public\.cing_wallet_pos_sessions \(\s*pos_parent,\s*pos_id\s*\)/
    );

    assert.doesNotMatch(
      body,
      /store_id/
    );
  }
);


test(
  "Event11 reconciliation remains exact same-POS",
  () => {
    assert.match(
      event11Migration,
      /s\.pos_parent\s*=[\s\S]*v_pos_parent/
    );

    assert.match(
      event11Migration,
      /s\.pos_id\s*=[\s\S]*v_pos_id/
    );

    assert.match(
      event11Migration,
      /s\.sale_tran_id\s*=[\s\S]*v_sale_tran_id/
    );

    assert.match(
      event11Migration,
      /CING_WALLET/
    );
  }
);


test(
  "Wallet account remains customer-wide and has no store balance key",
  () => {
    const createStart =
      walletCore.indexOf(
        "create table public.cing_wallet_accounts"
      );

    const createEnd =
      walletCore.indexOf(
        ");",
        createStart
      );

    assert.ok(
      createStart >= 0 &&
      createEnd > createStart
    );

    const table =
      walletCore.slice(
        createStart,
        createEnd + 2
      );

    assert.match(
      table,
      /user_id/
    );

    assert.match(
      table,
      /balance/
    );

    assert.doesNotMatch(
      table,
      /store_id|pos_id|pos_parent/
    );
  }
);


test(
  "multi-store patch does not create per-store Wallet balances",
  () => {
    for (
      const forbidden of [
        "wallet_balance_by_store",
        "store_balance",
        "balance_store",
        "cing_wallet_accounts_store",
      ]
    ) {
      assert.equal(
        storeMigration.includes(
          forbidden
        ),
        false,
        forbidden
      );
    }
  }
);


test(
  "cashier has dedicated Wallet POS operation permission",
  () => {
    const start =
      roles.indexOf(
        "cashier:"
      );

    const end =
      roles.indexOf(
        "kitchen:",
        start
      );

    const block =
      roles.slice(
        start,
        end
      );

    const count =
      (
        block.match(
          /"wallet\.pos\.operate"/g
        ) || []
      ).length;

    assert.equal(
      count,
      1
    );
  }
);


test(
  "store authority functions remain backend service-role only",
  () => {
    assert.match(
      storeMigration,
      /revoke all on function[\s\S]*cing_wallet_resolve_counter_store_v1[\s\S]*from public, anon, authenticated/
    );

    assert.match(
      storeMigration,
      /grant execute on function[\s\S]*cing_wallet_resolve_counter_store_v1[\s\S]*to service_role/
    );

    assert.match(
      storeMigration,
      /revoke all on function[\s\S]*cing_wallet_prepare_manual_pos_payment_v3[\s\S]*from public, anon, authenticated/
    );
  }
);
