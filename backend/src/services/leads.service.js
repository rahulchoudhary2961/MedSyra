const { sendLeadEmail } = require("./lead-notification.service");

const submitLead = async (payload) => {
  const emailSent = await sendLeadEmail(payload);

  return {
    message: emailSent
      ? "Thanks. Your details have been sent and we will contact you shortly."
      : "Thanks. Your details have been recorded and we will contact you shortly."
  };
};

module.exports = {
  submitLead
};
