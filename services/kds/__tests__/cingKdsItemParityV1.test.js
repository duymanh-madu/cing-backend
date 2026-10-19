const test = require("node:test");
const assert = require("node:assert/strict");

const {
  compareKdsItemParity
} = require("../cingKdsItemParityV1");

function event(items) {
  return {
    event_id: 11,
    event: "sale_manager",
    sale_manager: {
      pos_parent: "LOCAL_TEST",
      pos_id: 101,
      tran_id: "TEST-ITEMS-001",
      items
    }
  };
}

const SOURCE = event([
  {
    item_id: "MILK",
    item_name: "Trà sữa",
    quantity: 3
  },
  {
    item_id: "PEACH",
    item_name: "Trà đào",
    quantity: 2
  }
]);

function correctCups() {
  return [
    ["0:0", "MILK", "Trà sữa"],
    ["0:1", "MILK", "Trà sữa"],
    ["0:2", "MILK", "Trà sữa"],
    ["1:0", "PEACH", "Trà đào"],
    ["1:1", "PEACH", "Trà đào"]
  ].map(([unit_key, item_id, item_name]) => ({
    unit_key,
    item_id,
    item_name,
    status: "pending"
  }));
}

test("Exact five-cup invoice passes", () => {
  const result = compareKdsItemParity(
    SOURCE, correctCups()
  );

  assert.equal(result.verdict, "pass");
  assert.equal(result.expected_cups, 5);
  assert.equal(result.persisted_cups, 5);
});

test("Missing one cup fails", () => {
  const result = compareKdsItemParity(
    SOURCE, correctCups().slice(0, 4)
  );

  assert.equal(result.verdict, "fail");
  assert.deepEqual(
    result.missing_unit_keys, ["1:1"]
  );
});

test("Extra cup fails", () => {
  const cups = correctCups();

  cups.push({
    unit_key: "9:0",
    item_id: "EXTRA",
    item_name: "Món thừa",
    status: "pending"
  });

  const result = compareKdsItemParity(SOURCE, cups);

  assert.equal(result.verdict, "fail");
  assert.deepEqual(
    result.extra_unit_keys, ["9:0"]
  );
});

test("Same total but wrong item distribution fails", () => {
  const cups = correctCups();

  cups[2].item_id = "PEACH";
  cups[2].item_name = "Trà đào";

  const result = compareKdsItemParity(SOURCE, cups);

  assert.equal(result.expected_cups, 5);
  assert.equal(result.persisted_cups, 5);
  assert.equal(result.verdict, "fail");
  assert.deepEqual(
    result.mismatched_unit_keys, ["0:2"]
  );
});

test("Correct item ID but wrong name fails", () => {
  const cups = correctCups();
  cups[0].item_name = "Trà khác";

  const result = compareKdsItemParity(SOURCE, cups);

  assert.equal(result.verdict, "fail");
  assert.deepEqual(
    result.mismatched_unit_keys, ["0:0"]
  );
});

test("Duplicate unit key fails", () => {
  const cups = correctCups();
  cups[1].unit_key = "0:0";

  const result = compareKdsItemParity(SOURCE, cups);

  assert.equal(result.verdict, "fail");
  assert.deepEqual(
    result.duplicate_unit_keys, ["0:0"]
  );
});

test("Invalid persisted status fails", () => {
  const cups = correctCups();
  cups[0].status = "unknown";

  const result = compareKdsItemParity(SOURCE, cups);

  assert.equal(result.verdict, "fail");
  assert.deepEqual(
    result.invalid_status_unit_keys, ["0:0"]
  );
});

test("Invalid source quantity fails closed", () => {
  const invalid = event([
    {
      item_id: "MILK",
      item_name: "Trà sữa",
      quantity: 0
    }
  ]);

  assert.throws(
    () => compareKdsItemParity(invalid, []),
    /KDS_INVALID_ITEM_QUANTITY/
  );
});

test("Missing persisted rows cannot pass", () => {
  assert.throws(
    () => compareKdsItemParity(SOURCE, null),
    /KDS_PARITY_CUPS_REQUIRED/
  );
});

test("Invalid persisted cup cannot pass", () => {
  const cups = correctCups();
  cups[0] = null;

  assert.throws(
    () => compareKdsItemParity(SOURCE, cups),
    /KDS_PARITY_CUP_INVALID/
  );
});

test("Item parity does not claim modifier verification", () => {
  const result = compareKdsItemParity(
    SOURCE, correctCups()
  );

  assert.equal(result.modifiers_verified, false);
  assert.equal(result.source_completeness_verified, false);
});

test("Different item line order is detected", () => {
  const altered = event([
    {
      item_id: "PEACH",
      item_name: "Trà đào",
      quantity: 2
    },
    {
      item_id: "MILK",
      item_name: "Trà sữa",
      quantity: 3
    }
  ]);

  const result = compareKdsItemParity(
    altered, correctCups()
  );

  assert.equal(result.verdict, "fail");
  assert.ok(result.mismatched_unit_keys.length > 0);
});
