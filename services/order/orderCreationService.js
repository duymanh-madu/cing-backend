const {
  createOrderRecord,
} = require(
  "../../repositories/orderRepository"
);

async function createOrderEntity(
  payload
) {

  return await createOrderRecord(
    payload
  );

}

module.exports = {

  createOrderEntity,

};