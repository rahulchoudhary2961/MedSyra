const leadsService = require("../services/leads.service");
const pool = require("../config/db");

const run = async () => {
  const results = await leadsService.processDueLeadFollowUps();
  const sentCount = results.filter((item) => item.status === "sent").length;
  const failedCount = results.filter((item) => item.status === "failed").length;

  console.log(`Processed ${results.length} lead follow-up reminder(s). Sent: ${sentCount}. Failed: ${failedCount}.`);
};

run()
  .catch((error) => {
    console.error("Lead follow-up run failed", error);
    process.exit(1);
  })
  .finally(async () => {
    await pool.end();
  });
