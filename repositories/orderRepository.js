const supabase =
  require("../supabase");

async function createOrderRecord(
  payload
) {

  const {

    data,

    error,

  } = await supabase

    .from("orders")

    .insert(payload)

    .select()

    .maybeSingle();

  if (error) {

    throw error;

  }

  return data;

}

async function updateOrderRecord({

  order_id,

  payload,

}) {

  const {

    data,

    error,

  } = await supabase

    .from("orders")

    .update(payload)

    .eq(
      "id",
      order_id
    )

    .select()

    .maybeSingle();

  if (error) {

    throw error;

  }

  return data;

}

async function findOrderById(
  order_id
) {

  const {

    data,

    error,

  } = await supabase

    .from("orders")

    .select("*")

    .eq(
      "id",
      order_id
    )

    .maybeSingle();

  if (error) {

    throw error;

  }

  return data;

}

module.exports = {

  createOrderRecord,

  updateOrderRecord,

  findOrderById,

};