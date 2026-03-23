const pool = require("../config/db");

const resetDb = async () => {
  await pool.query(`
    TRUNCATE TABLE
      activity_logs,
      medical_records,
      appointments,
      doctors,
      patients,
      users,
      organizations
    RESTART IDENTITY CASCADE
  `);

  console.log("Database reset complete");
};

resetDb()
  .catch((error) => {
    console.error("Database reset failed", error);
    process.exit(1);
  })
  .finally(async () => {
    await pool.end();
  });
