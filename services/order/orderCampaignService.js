const {
  updateCampaignSpending,
} = require(
  "../campaignService"
);

async function processCampaignOrder({

  campaign_key,

  user_id,

  customer_name,

  subtotal,

}) {

  try {

    if (

      !campaign_key ||

      !user_id

    ) {

      return;

    }

    await updateCampaignSpending({

      campaign_key,

      user_id,

      player_name:
        customer_name,

      total_amount:
        subtotal,

    });

  } catch (error) {

    console.error(

      "processCampaignOrder error:",

      error.message

    );

  }

}

module.exports = {

  processCampaignOrder,

};