const pool = require("../config/db");

const TABLES = [
  "appointments",
  "medical_records",
  "patients",
  "invoices",
  "payments",
  "lab_orders",
  "pharmacy_dispenses",
  "pharmacy_dispense_items",
  "inventory_movements",
  "crm_tasks",
  "audit_logs",
  "notification_logs"
];

const run = async () => {
  console.log("Starting PostgreSQL maintenance: VACUUM (ANALYZE)");

  for (const tableName of TABLES) {
    console.log(`Vacuuming ${tableName}...`);
    await pool.query(`VACUUM (ANALYZE) ${tableName}`);
  }

  console.log("PostgreSQL maintenance complete");
};

run()
  .catch((error) => {
    console.error("PostgreSQL maintenance failed", error.message || error);
    process.exit(1);
  })
  .finally(async () => {
    await pool.end();
  });
