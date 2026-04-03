const pool = require("../config/db");
const { sendDailyScheduleNotifications } = require("../services/staff-notification.service");

const parseDateArg = () => {
  const dateArg = process.argv.find((arg) => arg.startsWith("--date="));
  if (dateArg) {
    return dateArg.slice("--date=".length);
  }

  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
};

const run = async () => {
  const date = parseDateArg();
  const results = await sendDailyScheduleNotifications({ date });
  const sentCount = results.filter((item) => item.status === "sent" || item.status === "fallback").length;
  const failedCount = results.filter((item) => item.status === "failed").length;

  console.log(`Processed ${results.length} staff notification(s) for ${date}. Delivered: ${sentCount}. Failed: ${failedCount}.`);
};

run()
  .catch((error) => {
    console.error("Daily staff schedule run failed", error);
    process.exit(1);
  })
  .finally(async () => {
    await pool.end();
  });
