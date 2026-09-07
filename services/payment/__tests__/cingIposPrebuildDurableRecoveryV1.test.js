"use strict";

const test =
  require("node:test");

const assert =
  require("node:assert/strict");

const fs =
  require("node:fs");


const source =
  fs.readFileSync(
    "services/iposOrderService.js",
    "utf8"
  );

const worker =
  fs.readFileSync(
    "services/ipos/iposSyncRecoveryWorker.js",
    "utf8"
  );


function pushRegion() {

  const start =
    source.indexOf(
      "async function pushOrderToIPOS"
    );

  assert.ok(
    start >= 0
  );

  const end =
    source.indexOf(
      "module.exports",
      start
    );

  assert.ok(
    end > start
  );

  return source.slice(
    start,
    end
  );

}


test(
  "payload build executes inside recovery try boundary",
  () => {

    const region =
      pushRegion();

    const tryPos =
      region.indexOf(
        "try {"
      );

    const buildPos =
      region.indexOf(
        "const payload = buildPayload"
      );

    const catchPos =
      region.lastIndexOf(
        "} catch (error)"
      );

    assert.ok(
      tryPos >= 0
    );

    assert.ok(
      buildPos > tryPos
    );

    assert.ok(
      catchPos > buildPos
    );

  }
);


test(
  "points tender configuration failure is recoverable preflight",
  () => {

    assert.match(
      source,
      /function isIposRecoverablePreflightError/
    );

    assert.match(
      source,
      /IPOS_POINTS_PAYMENT_METHOD_REQUIRED/
    );

    assert.match(
      source,
      /missing_ipos_config/
    );

    assert.match(
      source,
      /temporaryRetry[\s\S]*isIposRecoverablePreflightError/
    );

  }
);


test(
  "push failure persists order state before recovery enqueue",
  () => {

    const region =
      pushRegion();

    const updatePos =
      region.indexOf(
        '.from("orders")'
      );

    const enqueuePos =
      region.indexOf(
        "enqueueIposRecovery"
      );

    assert.ok(
      updatePos >= 0
    );

    assert.ok(
      enqueuePos > updatePos
    );

    assert.match(
      region,
      /pos_sync_status:\s*temporaryRetry\s*\?\s*"pending"\s*:\s*"failed"/
    );

    assert.match(
      region,
      /ipos_sync_status:\s*temporaryRetry\s*\?\s*"pending"\s*:\s*"failed"/
    );

  }
);


test(
  "recovery enqueue is bound to durable numeric order identity",
  () => {

    const region =
      pushRegion();

    assert.match(
      region,
      /enqueueIposRecovery\(\{[\s\S]*order_id:\s*order\.id/
    );

    assert.match(
      region,
      /transaction_code:\s*order\.order_code\s*\|\|\s*transaction_code/
    );

  }
);


test(
  "worker reloads durable order before every retry",
  () => {

    assert.match(
      worker,
      /job\.order_numeric_id\s*\|\|\s*job\.order_id/
    );

    assert.match(
      worker,
      /\.from\("orders"\)[\s\S]*\.eq\("id",\s*lookupOrderId\)/
    );

    assert.match(
      worker,
      /pushOrderToIPOS\(\{[\s\S]*order/
    );

  }
);


test(
  "worker has stale recovery bounded retries and terminal alert",
  () => {

    assert.match(
      worker,
      /releaseStuckJobs/
    );

    assert.match(
      worker,
      /retryCount >= 6/
    );

    assert.match(
      worker,
      /sendAdminAlert/
    );

    assert.match(
      worker,
      /nextRetryIso\(retryCount\)/
    );

  }
);


test(
  "points-only still never masquerades as Wallet or MoMo",
  () => {

    const pointsStart =
      source.indexOf(
        'paymentMethod ===\n      "points"'
      );

    assert.ok(
      pointsStart >= 0
    );

    const unsupported =
      source.indexOf(
        "IPOS_PAYMENT_METHOD_UNSUPPORTED",
        pointsStart
      );

    assert.ok(
      unsupported > pointsStart
    );

    const region =
      source.slice(
        pointsStart,
        unsupported
      );

    assert.match(
      region,
      /IPOS_POINTS_PAYMENT_METHOD/
    );

    assert.match(
      region,
      /Payment_Info:[\s\S]*"LOYALTY_POINTS"/
    );

    assert.match(
      region,
      /Amount:[\s\S]*0/
    );

    assert.doesNotMatch(
      region,
      /MOMO_QR_AIO/
    );

    assert.doesNotMatch(
      region,
      /CING_WALLET/
    );

  }
);


test(
  "optional iPOS log handle spans both success and failure paths",
  () => {

    const region =
      pushRegion();

    assert.match(
      region,
      /let log = null;[\s\S]*try \{/
    );

    assert.match(
      region,
      /log = await createIposLog\(/
    );

    assert.doesNotMatch(
      region,
      /const log = await createIposLog\(/
    );

    assert.doesNotMatch(
      region,
      /log_id:\s*null/
    );


    const logIdUses =
      region.match(
        /log_id:\s*log\?\.id/g
      ) || [];

    assert.equal(
      logIdUses.length,
      2
    );

  }
);


test(
  "successful iPOS response marks durable log success",
  () => {

    const region =
      pushRegion();

    const responsePos =
      region.indexOf(
        "const responseData = response.data"
      );

    const catchPos =
      region.indexOf(
        "} catch (error)"
      );

    assert.ok(
      responsePos >= 0
    );

    assert.ok(
      catchPos > responsePos
    );

    const successRegion =
      region.slice(
        responsePos,
        catchPos
      );

    assert.match(
      successRegion,
      /updateIposLog\(\{[\s\S]*log_id:\s*log\?\.id[\s\S]*sync_status:\s*"success"/
    );

  }
);


test(
  "prebuild failure can enter catch with no iPOS log row",
  () => {

    const region =
      pushRegion();

    const logDeclaration =
      region.indexOf(
        "let log = null;"
      );

    const build =
      region.indexOf(
        "const payload = buildPayload"
      );

    const createLog =
      region.indexOf(
        "log = await createIposLog"
      );

    const catchPos =
      region.indexOf(
        "} catch (error)"
      );

    assert.ok(
      logDeclaration >= 0
    );

    assert.ok(
      build > logDeclaration
    );

    assert.ok(
      createLog > build
    );

    assert.ok(
      catchPos > createLog
    );


    const failureRegion =
      region.slice(
        catchPos
      );

    assert.match(
      failureRegion,
      /updateIposLog\(\{[\s\S]*log_id:\s*log\?\.id/
    );

    assert.match(
      failureRegion,
      /\.from\("orders"\)[\s\S]*enqueueIposRecovery/
    );

  }
);
