async function safeAsync(

  callback,

  fallback = null

) {

  try {

    return await callback();

  } catch (error) {

    console.error(

      "safeAsync error:",

      error.message

    );

    return fallback;

  }

}

module.exports = {

  safeAsync,

};