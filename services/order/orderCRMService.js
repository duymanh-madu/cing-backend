const {
  syncMemberToIPOS,
} = require(
  "../iposMemberService"
);

async function syncOrderCRM({

  player,

}) {

  try {

    if (
      !player
    ) {

      return;

    }

    return await syncMemberToIPOS({

      player,

    });

  } catch (error) {

    console.error(

      "syncOrderCRM error:",

      error.message

    );

  }

}

module.exports = {

  syncOrderCRM,

};