module.exports = async (
  payload
) => {

  console.log(

    "PAYMENT_SUCCESS event:",

    payload?.transaction_id

  );

};