const medicalRecordsService = require("../services/medical-records.service");
const pool = require("../config/db");

const run = async () => {
  const results = await medicalRecordsService.processDueFollowUpReminders();
  const sentCount = results.filter((item) => item.status === "sent").length;
  const failedCount = results.filter((item) => item.status === "failed").length;

  console.log(`Processed ${results.length} follow-up reminder(s). Sent: ${sentCount}. Failed: ${failedCount}.`);
};

run()
  .catch((error) => {
    console.error("Follow-up reminder run failed", error);
    process.exit(1);
  })
  .finally(async () => {
    await pool.end();
  });
