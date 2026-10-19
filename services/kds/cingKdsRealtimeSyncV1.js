"use strict";

const {
  branchIdentity
} = require("./cingKdsBranchAccessPolicyV1");

/*
 * Dormant realtime snapshot coordinator.
 *
 * Contract:
 * - fetchSnapshot is a trusted API client with real auth.
 * - onSnapshot receives only validated API snapshots.
 * - notifyChanged only schedules a refresh.
 * - No order/cup data from socket events is trusted.
 * - Reconnect always triggers fresh synchronization.
 * - No internal timer, socket or network dependency.
 */

function sameBranch(a, b) {
  const x = branchIdentity(a);
  const y = branchIdentity(b);

  return (
    x.pos_parent === y.pos_parent &&
    x.pos_id === y.pos_id
  );
}

function createKdsRealtimeSync({
  branch,
  fetchSnapshot,
  onSnapshot,
  onError = () => {}
}) {
  const authorizedBranch = branchIdentity(branch);

  if (
    typeof fetchSnapshot !== "function" ||
    typeof onSnapshot !== "function" ||
    typeof onError !== "function"
  ) {
    throw new Error("KDS_SYNC_ADAPTER_REQUIRED");
  }

  let active = true;
  let generation = 0;
  let dirty = false;
  let running = null;
  let lastSnapshot = null;

  async function drain() {
    const session = generation;

    while (active && session === generation && dirty) {
      dirty = false;

      try {
        const snapshot = await fetchSnapshot({
          ...authorizedBranch
        });

        if (!active || session !== generation) {
          return;
        }

        if (
          !snapshot ||
          typeof snapshot !== "object" ||
          Array.isArray(snapshot) ||
          !snapshot.branch ||
          !sameBranch(
            snapshot.branch,
            authorizedBranch
          ) ||
          snapshot.success !== true ||
          !Array.isArray(snapshot.data)
        ) {
          throw new Error(
            "KDS_SYNC_INVALID_SNAPSHOT"
          );
        }

        // A newer invalidation arrived during fetch:
        // never publish the potentially stale result.
        if (dirty) {
          continue;
        }

        lastSnapshot = snapshot;

        onSnapshot(snapshot);
      } catch (error) {
        if (!active || session !== generation) {
          return;
        }

        onError(error);

        // Do not spin infinitely on API failure.
        // Reconnect, another event or explicit refresh
        // will request the next attempt.
        return;
      }
    }
  }

  function refresh() {
    if (!active) {
      return Promise.resolve();
    }

    dirty = true;

    if (running) {
      return running;
    }

    const task = drain();
    running = task;

    // Guard against rejection from user callbacks.
    task.finally(() => {
      if (running === task) {
        running = null;
      }
    }).catch(() => {});

    return task;
  }

  function notifyChanged(event) {
    if (!active) {
      return Promise.resolve(false);
    }

    // A socket notification must contain no
    // order content or client-issued permissions.
    if (
      !event ||
      typeof event !== "object" ||
      !event.branch ||
      !sameBranch(event.branch, authorizedBranch)
    ) {
      return Promise.resolve(false);
    }

    // Accepted events only cause API refetch.
    return refresh().then(() => true);
  }

  function reconnect() {
    return refresh();
  }

  function close() {
    active = false;
    generation++;
    dirty = false;
    lastSnapshot = null;
  }

  return Object.freeze({
    refresh,
    notifyChanged,
    reconnect,
    close,
    getSnapshot: () => lastSnapshot,
    isActive: () => active
  });
}

module.exports = {
  createKdsRealtimeSync
};
