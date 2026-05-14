function getRetryPolicy({

  type =
    "default",

}) {

  const policies = {

    default: {

      retries: 3,

      base_delay: 1000,

    },

    payment: {

      retries: 5,

      base_delay: 2000,

    },

    crm: {

      retries: 7,

      base_delay: 3000,

    },

  };

  return (

    policies[type] ||

    policies.default

  );

}

module.exports = {

  getRetryPolicy,

};