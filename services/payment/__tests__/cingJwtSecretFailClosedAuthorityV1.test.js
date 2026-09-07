"use strict";

const test =
  require("node:test");

const assert =
  require("node:assert/strict");

const fs =
  require("node:fs");

const path =
  require("node:path");

const {
  spawnSync,
} =
  require("node:child_process");


const ROOT =
  process.cwd();


const protectedFiles = [
  "routes/adminSystemRoutes.js",
  "routes/adminAnalyticsRoutes.js",
  "routes/adminStatsRoutes.js",
  "routes/adminCdpRoutes.js",
  "routes/adminOrderRoutes.js",
  "routes/shipperPortalRoutes.js",
  "routes/adminMissionRoutes.js",
  "routes/adminLogRoutes.js",
  "routes/adminPlayerRoutes.js",
  "routes/adminRoutes.js",
  "routes/voucherAdminRoutes.js",
  "routes/adminLeaderboardRoutes.js",
  "routes/adminMonitorRoutes.js",
  "routes/adminDeliveryRoutes.js",
  "routes/adminAuthRoutes.js",
  "routes/adminPaymentDashboardRoutes.js",
  "middlewares/adminPanelPermissionMiddleware.js",
];


function read(file) {
  return fs.readFileSync(
    path.join(
      ROOT,
      file
    ),
    "utf8"
  );
}


test(
  "predictable legacy JWT fallback is absent",
  () => {
    for (
      const rootName
      of [
        "routes",
        "middlewares",
        "services",
        "utils",
      ]
    ) {
      const root =
        path.join(
          ROOT,
          rootName
        );

      if (
        !fs.existsSync(root)
      ) {
        continue;
      }

      const stack = [root];

      while (
        stack.length
      ) {
        const current =
          stack.pop();

        for (
          const entry
          of fs.readdirSync(
            current,
            {
              withFileTypes:
                true,
            }
          )
        ) {
          const target =
            path.join(
              current,
              entry.name
            );

          if (
            entry.isDirectory()
          ) {
            /*
             * Production security sweep intentionally excludes
             * regression fixtures. Test files may contain the
             * forbidden literal or regex as test data and are not
             * runtime authentication authority.
             */
            if (
              entry.name ===
              "__tests__"
            ) {
              continue;
            }

            stack.push(
              target
            );

            continue;
          }

          if (
            !entry.isFile() ||
            !entry.name.endsWith(
              ".js"
            )
          ) {
            continue;
          }

          const source =
            fs.readFileSync(
              target,
              "utf8"
            );

          assert.doesNotMatch(
            source,
            /cing-admin-secret-2026/
          );

          assert.doesNotMatch(
            source,
            /process\.env\.[A-Z0-9_]*JWT[A-Z0-9_]*\s*\|\|\s*["'][^"']+["']/
          );
        }
      }
    }
  }
);


test(
  "JWT authority fails closed without configured secret",
  () => {
    const env = {
      ...process.env,
    };

    delete env.JWT_SECRET;

    const result =
      spawnSync(
        process.execPath,
        [
          "-e",
          [
            'try {',
            '  require("./utils/jwtSecretAuthority");',
            '  process.exit(0);',
            '} catch (error) {',
            '  if (error?.code === "JWT_SECRET_REQUIRED") process.exit(23);',
            '  process.exit(24);',
            '}',
          ].join("\n"),
        ],
        {
          cwd:
            ROOT,
          env,
          encoding:
            "utf8",
        }
      );

    assert.equal(
      result.status,
      23
    );
  }
);


test(
  "JWT authority exposes exactly configured JWT_SECRET",
  () => {
    const env = {
      ...process.env,
      JWT_SECRET:
        "test-only-non-production-secret",
    };

    const result =
      spawnSync(
        process.execPath,
        [
          "-e",
          [
            'const a = require("./utils/jwtSecretAuthority");',
            'if (a.JWT_SECRET !== process.env.JWT_SECRET) process.exit(31);',
            'if (a.requireJwtSecret() !== process.env.JWT_SECRET) process.exit(32);',
          ].join("\n"),
        ],
        {
          cwd:
            ROOT,
          env,
          encoding:
            "utf8",
        }
      );

    assert.equal(
      result.status,
      0
    );
  }
);


test(
  "all known admin and shipper JWT surfaces use shared authority",
  () => {
    for (
      const file
      of protectedFiles
    ) {
      const source =
        read(file);

      assert.match(
        source,
        /jwtSecretAuthority/
      );

      assert.match(
        source,
        /\bJWT_SECRET\b/
      );
    }
  }
);


test(
  "admin issuer and verifier share configured JWT authority",
  () => {
    const source =
      read(
        "routes/adminAuthRoutes.js"
      );

    assert.match(
      source,
      /jwt\.sign\([\s\S]*JWT_SECRET/
    );

    assert.match(
      source,
      /jwt\.verify\([\s\S]*JWT_SECRET/
    );
  }
);


test(
  "shipper issuer and verifier share configured JWT authority",
  () => {
    const issuer =
      read(
        "routes/adminDeliveryRoutes.js"
      );

    const verifier =
      read(
        "routes/shipperPortalRoutes.js"
      );

    assert.match(
      issuer,
      /jwt\.sign\([\s\S]*JWT_SECRET/
    );

    assert.match(
      verifier,
      /jwt\.verify\([\s\S]*JWT_SECRET/
    );
  }
);


test(
  "permission middleware uses shared authority without local fallback",
  () => {
    const source =
      read(
        "middlewares/adminPanelPermissionMiddleware.js"
      );

    assert.match(
      source,
      /const secret = JWT_SECRET;/
    );

    assert.doesNotMatch(
      source,
      /process\.env\.JWT_SECRET/
    );
  }
);


test(
  "customer auth remains explicit JWT_SECRET authority",
  () => {
    const source =
      read(
        "middlewares/authMiddleware.js"
      );

    assert.match(
      source,
      /jwt\.verify\([\s\S]*process\.env\.JWT_SECRET/
    );

    assert.doesNotMatch(
      source,
      /cing-admin-secret-2026/
    );
  }
);
