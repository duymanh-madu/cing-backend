const customers =
  new Map();

/**
 * =====================================================
 * UPSERT CUSTOMER
 * =====================================================
 */

async function upsertCustomer({
  zaloUser,
}) {

  const id =
    zaloUser.id ||
    `guest_${Date.now()}`;

  const customer = {

    id,

    name:
      zaloUser.name ||
      "Guest",

    avatar:
      zaloUser.avatar ||
      null,

    memberLevel:
      "standard",

    points:
      0,

    createdAt:
      Date.now(),

  };

  customers.set(
    id,
    customer
  );

  return customer;

}

/**
 * =====================================================
 * FIND CUSTOMER
 * =====================================================
 */

async function findById(
  customerId
) {

  return (
    customers.get(
      customerId
    ) || null
  );

}

module.exports = {

  upsertCustomer,
  findById,

};