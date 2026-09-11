"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root =
  path.resolve(
    __dirname,
    "../../.."
  );

function read(file) {
  return fs.readFileSync(
    path.join(root, file),
    "utf8"
  );
}

test(
  "multiplayer legal authority defaults false",
  () => {
    const sql = read(
      "db/migrations/20260911223000_customer_multiplayer_legal_gate_v1.sql"
    );

    assert.match(
      sql,
      /customer_multiplayer_enabled boolean/i
    );

    assert.match(
      sql,
      /customer_multiplayer_enabled = false/i
    );
  }
);

test(
  "generic config cannot mutate legal gate",
  () => {
    const source =
      read(
        "services/appConfigService.js"
      );

    assert.match(
      source,
      /customer_multiplayer_enabled:\s*_protectedCustomerMultiplayerEnabled/
    );

    assert.match(
      source,
      /\.\.\.mutablePayload/
    );
  }
);

test(
  "exact two multiplayer HTTP surfaces are gated",
  () => {
    const source =
      read("routes/index.js");

    assert.match(
      source,
      /"\/game\/cing-piu-piu",\s*customerMultiplayerGate,/s
    );

    assert.match(
      source,
      /router\.use\("\/game\/chess",\s*customerMultiplayerGate,/s
    );
  }
);

test(
  "Block Puzzle is outside multiplayer gate",
  () => {
    const source =
      read("routes/index.js");

    assert.doesNotMatch(
      source,
      /"\/game\/cing-block-puzzle",\s*customerMultiplayerGate/s
    );
  }
);
