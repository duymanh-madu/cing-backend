async function verifyPhonePermission({

  phone_number,

}) {

  if (!phone_number) {

    return {

      success: false,

      message:
        "Missing phone number",

    };

  }

  return {

    success: true,

    verified: true,

  };

}

module.exports = {

  verifyPhonePermission,

};