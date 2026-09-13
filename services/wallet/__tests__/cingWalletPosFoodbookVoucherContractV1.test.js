"use strict";

const test =
  require("node:test");

const assert =
  require("node:assert/strict");

const fs =
  require("node:fs");


const service =
  fs.readFileSync(
    "services/wallet/cingWalletPosSessionService.js",
    "utf8"
  );

const migration =
  fs.readFileSync(
    "db/migrations/20260913_cing_wallet_pos_session_authority_v1.sql",
    "utf8"
  );


test(

  "Foodbook routing authority uses an explicit two-character partner prefix",

  () => {

    assert.match(
      service,
      /CING_WALLET_POS_VOUCHER_PREFIX/
    );

    assert.match(
      service,
      /\^\[A-Z0-9\]\{2\}\$/
    );

  }

);


test(

  "full Cing Wallet trigger must belong to Foodbook prefix namespace",

  () => {

    assert.match(
      service,
      /\^\[A-Z0-9\]\{10,64\}\$/
    );

    assert.match(
      service,
      /triggerCode\.startsWith\(\s*voucherPrefix\s*\)/
    );

  }

);


test(

  "Event 2 admission remains exact full Coupon_Code match",

  () => {

    assert.match(
      service,
      /requestCode\s*===\s*authority\.triggerCode/
    );

    assert.doesNotMatch(
      service,
      /return\s*\(\s*requestCode\.startsWith/
    );

    assert.doesNotMatch(
      service,
      /return\s+requestCode\.startsWith/
    );

  }

);


test(

  "Coupon comparison is canonicalized without weakening exact admission",

  () => {

    assert.match(
      service,
      /getConfiguredTriggerCode[\s\S]*\.toUpperCase\(\)/
    );

    assert.match(
      service,
      /Coupon_Code[\s\S]*\.trim\(\)[\s\S]*\.toUpperCase\(\)/
    );

  }

);


test(

  "Wallet Event 2 response is valid zero-discount reusable transport",

  () => {

    assert.match(
      service,
      /Code:\s*4/
    );

    assert.match(
      service,
      /Is_Many_Times:\s*0/
    );

    assert.match(
      service,
      /Discount_Amount:\s*0/
    );

    assert.match(
      service,
      /Is_Coupon:\s*0/
    );

    assert.match(
      service,
      /Only_Coupon:\s*0/
    );

  }

);


test(

  "Coupon_Code is not the database uniqueness authority",

  () => {

    assert.doesNotMatch(
      migration,
      /create\s+unique\s+index[\s\S]{0,300}coupon_code/i
    );

    assert.match(
      migration,
      /cing_wallet_pos_sessions_bill_identity_uq/i
    );

    assert.match(
      migration,
      /pos_parent[\s\S]*pos_id[\s\S]*sale_tran_id/i
    );

  }

);


test(

  "Event 2 line items remain discovery-only and never become amount authority",

  () => {

    assert.doesNotMatch(
      service,
      /reduce\s*\([\s\S]{0,300}Voucher_Order_Line/
    );

    assert.doesNotMatch(
      service,
      /Voucher_Order_Line[\s\S]{0,300}normalizeAmount/
    );

  }

);
