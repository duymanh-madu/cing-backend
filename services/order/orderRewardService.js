const {
  addExp,
  updateSpending,
} = require(
  "../levelService"
);

async function processOrderReward({

  user_id,

  subtotal,

  payment_status,

}) {

  try {

    if (

      !user_id ||

      payment_status !==
        "paid"

    ) {

      return 0;

    }

    const exp_earned =

      Math.floor(
        subtotal / 1000
      );

    await addExp(
      user_id,
      exp_earned
    );

    await updateSpending(
      user_id,
      subtotal
    );

    return exp_earned;

  } catch (error) {

    console.error(

      "processOrderReward error:",

      error.message

    );

    return 0;

  }

}

module.exports = {

  processOrderReward,

};