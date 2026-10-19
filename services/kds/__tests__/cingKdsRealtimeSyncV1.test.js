"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  createKdsRealtimeSync
} = require("../cingKdsRealtimeSyncV1");

const BRANCH = {
  pos_parent: "CING",
  pos_id: 101
};

function snapshot(data = []) {
  return {
    success: true,
    branch: {
      pos_parent: "CING",
      pos_id: "101"
    },
    data
  };
}

function deferred() {
  let resolve;
  const promise = new Promise(r => {
    resolve = r;
  });
  return { promise, resolve };
}

test("Initial refresh loads API snapshot", async () => {
  const received = [];

  const sync = createKdsRealtimeSync({
    branch: BRANCH,
    fetchSnapshot: async () => snapshot(["A"]),
    onSnapshot: x => received.push(x)
  });

  await sync.refresh();

  assert.equal(received.length, 1);
  assert.deepEqual(received[0].data, ["A"]);
  sync.close();
});

test("Matching event triggers API refetch", async () => {
  let calls = 0;

  const sync = createKdsRealtimeSync({
    branch: BRANCH,
    fetchSnapshot: async () => {
      calls++;
      return snapshot();
    },
    onSnapshot: () => {}
  });

  await sync.notifyChanged({
    branch: BRANCH,
    revision: 5
  });

  assert.equal(calls, 1);
  sync.close();
});

test("Different branch event is ignored", async () => {
  let calls = 0;

  const sync = createKdsRealtimeSync({
    branch: BRANCH,
    fetchSnapshot: async () => {
      calls++;
      return snapshot();
    },
    onSnapshot: () => {}
  });

  const accepted = await sync.notifyChanged({
    branch: {
      pos_parent: "OTHER",
      pos_id: 101
    }
  });

  assert.equal(accepted, false);
  assert.equal(calls, 0);
  sync.close();
});

test("Same parent different POS is ignored", async () => {
  let calls = 0;

  const sync = createKdsRealtimeSync({
    branch: BRANCH,
    fetchSnapshot: async () => {
      calls++;
      return snapshot();
    },
    onSnapshot: () => {}
  });

  await sync.notifyChanged({
    branch: {
      pos_parent: "CING",
      pos_id: 102
    }
  });

  assert.equal(calls, 0);
  sync.close();
});

test("Wrong-branch API snapshot is rejected", async () => {
  const errors = [];
  const received = [];

  const sync = createKdsRealtimeSync({
    branch: BRANCH,
    fetchSnapshot: async () => ({
      success: true,
      branch: {
        pos_parent: "OTHER",
        pos_id: 101
      },
      data: ["SECRET"]
    }),
    onSnapshot: x => received.push(x),
    onError: e => errors.push(e.message)
  });

  await sync.refresh();

  assert.equal(received.length, 0);
  assert.deepEqual(
    errors,
    ["KDS_SYNC_INVALID_SNAPSHOT"]
  );
  sync.close();
});

test("Invalidated in-flight snapshot is discarded", async () => {
  const first = deferred();
  const second = deferred();
  let calls = 0;
  const received = [];

  const sync = createKdsRealtimeSync({
    branch: BRANCH,
    fetchSnapshot: () => {
      calls++;
      return calls === 1
        ? first.promise
        : second.promise;
    },
    onSnapshot: x => received.push(x)
  });

  const pending = sync.refresh();

  await sync.notifyChanged({
    branch: {
      pos_parent: "OTHER",
      pos_id: 101
    }
  });

  const another = sync.refresh();

  first.resolve(snapshot(["STALE"]));

  // Let the pending fetch continue to the next read.
  for (let i = 0; i < 5; i++) {
    await Promise.resolve();
  }

  assert.equal(calls, 2);

  second.resolve(snapshot(["LATEST"]));

  await Promise.all([pending, another]);

  assert.equal(received.length, 1);
  assert.deepEqual(
    received[0].data,
    ["LATEST"]
  );
  sync.close();
});

test("Reconnect always requests fresh snapshot", async () => {
  let calls = 0;

  const sync = createKdsRealtimeSync({
    branch: BRANCH,
    fetchSnapshot: async () => {
      calls++;
      return snapshot();
    },
    onSnapshot: () => {}
  });

  await sync.refresh();
  await sync.reconnect();

  assert.equal(calls, 2);
  sync.close();
});

test("Closing rejects late API response", async () => {
  const pendingFetch = deferred();
  const received = [];

  const sync = createKdsRealtimeSync({
    branch: BRANCH,
    fetchSnapshot: () => pendingFetch.promise,
    onSnapshot: x => received.push(x)
  });

  const pending = sync.refresh();

  sync.close();
  pendingFetch.resolve(snapshot(["LATE"]));

  await pending;

  assert.equal(received.length, 0);
  assert.equal(sync.getSnapshot(), null);
});

test("Closed coordinator ignores further events", async () => {
  let calls = 0;

  const sync = createKdsRealtimeSync({
    branch: BRANCH,
    fetchSnapshot: async () => {
      calls++;
      return snapshot();
    },
    onSnapshot: () => {}
  });

  sync.close();

  const accepted = await sync.notifyChanged({
    branch: BRANCH
  });

  assert.equal(accepted, false);
  assert.equal(calls, 0);
});

test("Missing API adapter is rejected", () => {
  assert.throws(
    () => createKdsRealtimeSync({
      branch: BRANCH,
      onSnapshot: () => {}
    }),
    /KDS_SYNC_ADAPTER_REQUIRED/
  );
});

test("API failure is reported without stale publish", async () => {
  const errors = [];
  const received = [];

  const sync = createKdsRealtimeSync({
    branch: BRANCH,
    fetchSnapshot: async () => {
      throw new Error("NETWORK_UNAVAILABLE");
    },
    onSnapshot: x => received.push(x),
    onError: e => errors.push(e.message)
  });

  await sync.refresh();

  assert.deepEqual(errors, ["NETWORK_UNAVAILABLE"]);
  assert.equal(received.length, 0);
  sync.close();
});
