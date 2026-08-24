"use strict";

const path =
  require(
    "node:path"
  );

const {
  createRequire,
} = require(
  "node:module"
);

const testRequire =
  createRequire(
    path.join(
      __dirname,
      "..",
      "__cing_artillery_test_loader__.js"
    )
  );

function resolveTestModule(
  request
) {
  return testRequire.resolve(
    request
  );
}

function loadFreshWithMocks({
  target,
  mocks,
}) {
  const targetPath =
    resolveTestModule(
      target
    );

  const restoredDependencies =
    [];

  try {
    for (
      const [
        request,
        replacement,
      ]
      of Object.entries(
        mocks || {}
      )
    ) {
      const dependencyPath =
        resolveTestModule(
          request
        );

      /*
       * Ensure the real dependency has a canonical cache entry.
       */
      testRequire(
        dependencyPath
      );

      const cacheEntry =
        require.cache[
          dependencyPath
        ];

      if (!cacheEntry) {
        throw new Error(
          `Missing CommonJS cache entry for ${dependencyPath}`
        );
      }

      const originalExports =
        cacheEntry.exports;

      /*
       * Critical test-isolation rule:
       *
       * Never mutate originalExports in place.
       *
       * The target service stores the object returned by require().
       * Therefore we give the target a dedicated snapshot object that
       * contains mocked functions.
       *
       * After target loading completes the cache can safely return to
       * originalExports; the target retains its private snapshot.
       */
      const mockedExports = {
        ...originalExports,
        ...replacement,
      };

      cacheEntry.exports =
        mockedExports;

      restoredDependencies.push({
        cacheEntry,
        originalExports,
      });
    }

    delete require.cache[
      targetPath
    ];

    return testRequire(
      targetPath
    );
  } finally {
    for (
      const {
        cacheEntry,
        originalExports,
      }
      of restoredDependencies.reverse()
    ) {
      cacheEntry.exports =
        originalExports;
    }
  }
}

module.exports = {
  loadFreshWithMocks,
};
