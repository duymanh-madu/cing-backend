# App live data V3 — 23 October 2026

## Points-only rounding fix

Whole point requests now allow ceil(payable / configured point value) and cap
monetary discount at payable. For 15,000đ less 5%, 15 points redeem exactly
14,250đ and cash is zero; 16 points still fail. Balance checks and whole/unsafe
number validation remain. The checkout discloses the final whole-point rounding.
The frozen reservation, SQL internal settlement proof and iPOS zero-cash rail
are unchanged. Actual PostgreSQL settlement/replay was checked locally with
15 points / 14,250đ and an over-discount rejection. No production purchase ran.

## Live data transport

Successful HTTP mutations emit coalesced `app.data.changed` domain hints after
response finish. Hints contain no customer data, IDs, amounts or payload snapshots.
Rejected requests and auth/heartbeat traffic do not emit. Existing worker/socket
events remain in use. Direct database changes without an emitted event are covered
by the client's visible-app reconciliation interval (20 seconds), not claimed as
instant server push. No mutation or purchase is replayed by this mechanism.

Frontend reads use a central observer with domain subscriptions, query invalidation
for active queries, cleanup, reconnect and visibility recovery. Weekly/alltime/game,
spending and chess leaderboard reads use current filters and fence stale responses.
Owned balances remain authenticated and identity-bound. Customer read integrations
include active/history/success orders, vouchers, membership history, profiles,
missions, rewards/gift inbox, wallet, revive balance/price, Plaza overview and chat
badge/title projections. Existing chat/Plaza/KDS streams keep their own protocol;
financial command/session initialization effects are never re-run as refreshes.

The document interaction guard blocks left-edge touch defaults and page text
selection/copy/callouts. Editable fields retain editing and selection; explicit
copy buttons keep their app action. The guard applies to document/portals as well
as routed pages. Native host gestures outside WebView event control still require
physical-device verification; the implementation uses the same preventDefault
approach as the existing Plaza guard.
