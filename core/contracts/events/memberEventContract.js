const {
  buildEvent,
} = require(
  "./baseEventContract"
);

function buildMemberActivatedEvent(
  payload
) {

  return buildEvent({

    event_name:
      "member.activated",

    source:
      "member-domain",

    payload,

  });

}

module.exports = {

  buildMemberActivatedEvent,

};