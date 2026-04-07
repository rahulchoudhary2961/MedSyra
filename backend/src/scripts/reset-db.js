const pool = require("../config/db");

const resetDb = async () => {
  await pool.query(`
    TRUNCATE TABLE
      insurance_claim_events,
      insurance_claims,
      insurance_providers,
      inventory_movements,
      inventory_items,
      pharmacy_dispense_items,
      pharmacy_dispenses,
      medicine_batches,
      medicines,
      lab_order_items,
      lab_orders,
      lab_tests,
      favorite_medicines,
      prescription_templates,
      crm_tasks,
      billing_audit_logs,
      invoice_payment_links,
      invoice_items,
      payments,
      invoices,
      ai_prescription_suggestions,
      notification_campaigns,
      notification_templates,
      notification_logs,
      notification_preferences,
      audit_logs,
      activity_logs,
      medical_records,
      appointments,
      doctors,
      patients,
      users,
      branches,
      organization_pricing_config,
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
