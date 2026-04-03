const pool = require("../config/db");

const run = async () => {
  const [totalOrganizations, organizationsWithUsers, activeOrganizations30d] = await Promise.all([
    pool.query("SELECT COUNT(*)::int AS count FROM organizations"),
    pool.query("SELECT COUNT(DISTINCT organization_id)::int AS count FROM users"),
    pool.query(`
      SELECT COUNT(DISTINCT organization_id)::int AS count
      FROM users
      WHERE last_login_at >= NOW() - INTERVAL '30 days'
    `)
  ]);

  console.log("Organization Stats");
  console.log(`Total organizations: ${totalOrganizations.rows[0].count}`);
  console.log(`Organizations with users: ${organizationsWithUsers.rows[0].count}`);
  console.log(`Active organizations (30d): ${activeOrganizations30d.rows[0].count}`);
};

run()
  .catch((error) => {
    console.error("Organization stats failed", error.message || error);
    process.exit(1);
  })
  .finally(async () => {
    await pool.end();
  });
