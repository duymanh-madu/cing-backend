"use strict";

const test =
  require("node:test");

const assert =
  require("node:assert/strict");

const fs =
  require("node:fs");

const path =
  require("node:path");

const ROOT =
  path.resolve(
    __dirname,
    "../../../.."
  );

function read(
  relative
) {
  return fs.readFileSync(
    path.join(
      ROOT,
      relative
    ),
    "utf8"
  );
}

test(
  "result stream repository uses only canonical authorized RPCs",
  () => {
    const source =
      read(
        "services/games/cingArtillery/repositories/cingArtilleryResultStreamRepository.js"
      );

    assert.match(
      source,
      /cing_artillery_read_result_stream_authorized_v1/u
    );

    assert.match(
      source,
      /cing_artillery_read_result_stream_head_authorized_v1/u
    );

    assert.doesNotMatch(
      source,
      /\.from\s*\(\s*["']cing_artillery_result_stream/u
    );
  }
);

test(
  "socket result reads re-authenticate and derive durable authority",
  () => {
    const source =
      read(
        "socket/realtime/cingArtilleryRealtimeConnectionHandler.js"
      );

    for (const event of [
      "cing-artillery:match:result-stream-read",
      "cing-artillery:match:result-stream-head",
    ]) {
      const start =
        source.indexOf(
          `"${event}"`
        );

      assert.notEqual(
        start,
        -1
      );

      const window =
        source.slice(
          start,
          start + 3200
        );

      assert.match(
        window,
        /authenticateSocket/u
      );

      assert.match(
        window,
        /authorizeMatchJoin/u
      );
    }
  }
);

test(
  "shot command remains ACK-only and does not broadcast client command",
  () => {
    const source =
      read(
        "socket/realtime/cingArtilleryRealtimeConnectionHandler.js"
      );

    const start =
      source.indexOf(
        '"cing-artillery:match:shot-command"'
      );

    const end =
      source.indexOf(
        '"cing-artillery:match:result-stream-read"',
        start
      );

    assert.ok(
      start >= 0 &&
      end > start
    );

    const window =
      source.slice(
        start,
        end
      );

    assert.doesNotMatch(
      window,
      /io\.to\s*\(/u
    );

    assert.match(
      window,
      /acceptRealtimeShotCommand/u
    );
  }
);

test(
  "result stream service preserves cursor as canonical text",
  () => {
    const source =
      read(
        "services/games/cingArtillery/services/cingArtilleryResultStreamService.js"
      );

    assert.match(
      source,
      /CANONICAL_CURSOR_RE/u
    );

    assert.match(
      source,
      /BigInt\s*\(/u
    );

    assert.doesNotMatch(
      source,
      /parseInt\s*\(/u
    );
  }
);

test(
  "realtime result read does not create polling or in-memory gameplay authority",
  () => {
    const files = [
      "services/games/cingArtillery/repositories/cingArtilleryResultStreamRepository.js",
      "services/games/cingArtillery/services/cingArtilleryResultStreamService.js",
      "socket/realtime/cingArtilleryRealtimeConnectionHandler.js",
    ];

    const source =
      files
        .map(read)
        .join("\n");

    assert.doesNotMatch(
      source,
      /setInterval\s*\(/u
    );

    assert.doesNotMatch(
      source,
      /EventEmitter/u
    );

    assert.doesNotMatch(
      source,
      /pg_notify|LISTEN\s|NOTIFY\s/iu
    );
  }
);
