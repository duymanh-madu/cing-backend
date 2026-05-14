module.exports = async (
  payload
) => {

  console.log(

    "ORDER_CREATED event:",

    payload?.order_id

  );

};