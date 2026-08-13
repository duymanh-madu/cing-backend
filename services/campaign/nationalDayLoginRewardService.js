const supabase = require("../../supabase");
const {
  normalizePhone,
} = require("../../utils/phoneIdentity");

const logger =
  require("../loggerService");

const CAMPAIGN_SOURCE =
  "zalo-miniapp";

async function claimNationalDayLoginReward({
  phone,
  installationId = "",
  source = CAMPAIGN_SOURCE,
}) {
  const userId =
    normalizePhone(phone || "");

  if (
    !userId ||
    userId.length < 9
  ) {
    return {
      reward_granted: false,
      skipped: true,
      reason: "invalid_phone",
    };
  }

  const {
    data,
    error,
  } = await supabase.rpc(
    "claim_national_day_2026_login_reward",
    {
      p_user_id:
        userId,

      p_phone_normalized:
        userId,

      p_installation_id:
        String(
          installationId || ""
        ).trim() || null,

      p_source:
        String(
          source || CAMPAIGN_SOURCE
        ).trim() ||
        CAMPAIGN_SOURCE,
    }
  );

  if (error) {
    throw new Error(
      `claim_national_day_2026_login_reward: ${error.message}`
    );
  }

  const result =
    Array.isArray(data)
      ? data[0]
      : data;

  if (result?.reward_granted) {
    logger.info(
      "National Day login pending reward created",
      {
        userId,
        rewardCode:
          result.reward_code,

        rewardAmount:
          Number(
            result.reward_amount || 0
          ),

        claimId:
          result.claim_id,
      }
    );
  }

  return (
    result || {
      reward_granted: false,
      skipped: true,
    }
  );
}

module.exports = {
  claimNationalDayLoginReward,
};
