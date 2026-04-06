const pool = require("../config/db");

const resetDb = async () => {
  await pool.query(`
    TRUNCATE TABLE
      inventory_movements,
      inventory_items,
      pharmacy_dispense_items,
      pharmacy_dispenses,
      medicine_batches,
      medicines,
      lab_order_items,
      lab_orders,
      lab_tests,
      crm_tasks,
      invoice_payment_links,
      notification_logs,
      notification_preferences,
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
