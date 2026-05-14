const eventBus =
  require(
    "../eventBus"
  );

const {
  addExp,
  updateSpending,
} = require(
  "../../../services/levelService"
);

eventBus.register(

  "order.paid",

  async ({
    user_id,
    subtotal,
  }) => {

    if (!user_id) {

      return;

    }

    const expEarned =

      Math.floor(
        subtotal / 1000
      );

    await addExp(
      user_id,
      expEarned
    );

    await updateSpending(
      user_id,
      subtotal
    );

  }

);