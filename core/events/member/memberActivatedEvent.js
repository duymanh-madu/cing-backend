const eventBus =
  require(
    "../eventBus"
  );

const {
  syncMemberToIPOS,
} = require(
  "../../../services/iposMemberService"
);

eventBus.register(

  "member.activated",

  async ({
    player,
  }) => {

    await syncMemberToIPOS({

      player,

    });

  }

);