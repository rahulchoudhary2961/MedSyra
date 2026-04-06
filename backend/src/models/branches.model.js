const pool = require("../config/db");

const mapBranch = (row) => {
  if (!row) {
    return null;
  }

  return {
    ...row,
    staff_count: Number(row.staff_count || 0),
    today_appointments: Number(row.today_appointments || 0),
    active_patients: Number(row.active_patients || 0),
    recent_revenue: Number(row.recent_revenue || 0)
  };
};

const getNextBranchCode = async (db, organizationId) => {
  const result = await db.query(
    `
      SELECT COUNT(*)::int AS total
      FROM branches
      WHERE organization_id = $1
    `,
    [organizationId]
  );

  const nextNumber = Number(result.rows[0]?.total || 0) + 1;
  return `BR-${String(nextNumber).padStart(3, "0")}`;
};

const getBranchSelectSql = `
  SELECT
    b.id,
    b.organization_id,
    b.branch_code,
    b.name,
    b.address,
    b.phone,
    b.email,
    b.timezone,
    b.is_active,
    b.is_default,
    b.created_at,
    b.updated_at,
    COUNT(DISTINCT u.id)::int AS staff_count,
    COUNT(DISTINCT a.id) FILTER (WHERE a.appointment_date = CURRENT_DATE)::int AS today_appointments,
    COUNT(DISTINCT p.id) FILTER (WHERE p.is_active = true)::int AS active_patients,
    COALESCE(
      SUM(i.total_amount) FILTER (WHERE i.issue_date >= CURRENT_DATE - INTERVAL '30 days'),
      0
    )::numeric(12,2) AS recent_revenue
  FROM branches b
  LEFT JOIN users u
    ON u.branch_id = b.id
   AND u.organization_id = b.organization_id
  LEFT JOIN appointments a
    ON a.branch_id = b.id
   AND a.organization_id = b.organization_id
  LEFT JOIN invoices i
    ON i.branch_id = b.id
   AND i.organization_id = b.organization_id
  LEFT JOIN patients p
    ON p.organization_id = b.organization_id
   AND EXISTS (
     SELECT 1
     FROM appointments ap
     WHERE ap.organization_id = b.organization_id
       AND ap.branch_id = b.id
       AND ap.patient_id = p.id
   )
`;

const listBranches = async (organizationId, query = {}) => {
  const values = [organizationId];
  const conditions = ["b.organization_id = $1"];

  if (query.activeOnly === true || query.activeOnly === "true") {
    conditions.push("b.is_active = true");
  }

  const { rows } = await pool.query(
    `
      ${getBranchSelectSql}
      WHERE ${conditions.join(" AND ")}
      GROUP BY b.id
      ORDER BY b.is_default DESC, b.name ASC
    `,
    values
  );

  return rows.map(mapBranch);
};

const getBranchById = async (organizationId, branchId, db = pool) => {
  const { rows } = await db.query(
    `
      ${getBranchSelectSql}
      WHERE b.organization_id = $1
        AND b.id = $2
      GROUP BY b.id
      LIMIT 1
    `,
    [organizationId, branchId]
  );

  return mapBranch(rows[0] || null);
};

const getDefaultBranch = async (organizationId, db = pool) => {
  const { rows } = await db.query(
    `
      SELECT id, organization_id, branch_code, name, address, phone, email, timezone, is_active, is_default, created_at, updated_at
      FROM branches
      WHERE organization_id = $1
        AND is_default = true
      LIMIT 1
    `,
    [organizationId]
  );

  return rows[0] || null;
};

const createBranch = async (organizationId, payload) => {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    if (payload.isDefault === true) {
      await client.query(
        `
          UPDATE branches
          SET is_default = false,
              updated_at = NOW()
          WHERE organization_id = $1
        `,
        [organizationId]
      );
    }

    const branchCode = payload.branchCode || (await getNextBranchCode(client, organizationId));
    const { rows } = await client.query(
      `
        INSERT INTO branches (
          organization_id,
          branch_code,
          name,
          address,
          phone,
          email,
          timezone,
          is_active,
          is_default
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
        RETURNING id
      `,
      [
        organizationId,
        branchCode,
        payload.name,
        payload.address || null,
        payload.phone || null,
        payload.email || null,
        payload.timezone || "Asia/Kolkata",
        payload.isActive !== false,
        payload.isDefault === true
      ]
    );

    const created = await getBranchById(organizationId, rows[0].id, client);
    await client.query("COMMIT");
    return created;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

const updateBranch = async (organizationId, branchId, payload) => {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    if (payload.isDefault === true) {
      await client.query(
        `
          UPDATE branches
          SET is_default = false,
              updated_at = NOW()
          WHERE organization_id = $1
        `,
        [organizationId]
      );
    }

    const columnMap = {
      branchCode: "branch_code",
      name: "name",
      address: "address",
      phone: "phone",
      email: "email",
      timezone: "timezone",
      isActive: "is_active",
      isDefault: "is_default"
    };

    const entries = Object.entries(payload)
      .filter(([key, value]) => columnMap[key] && value !== undefined)
      .map(([key, value]) => [columnMap[key], value]);

    if (entries.length === 0) {
      const current = await getBranchById(organizationId, branchId, client);
      await client.query("COMMIT");
      return current;
    }

    const values = [organizationId, branchId];
    const setClauses = entries.map(([column, value], index) => {
      values.push(value);
      return `${column} = $${index + 3}`;
    });

    const result = await client.query(
      `
        UPDATE branches
        SET ${setClauses.join(", ")},
            updated_at = NOW()
        WHERE organization_id = $1
          AND id = $2
        RETURNING id
      `,
      values
    );

    if (!result.rows[0]) {
      await client.query("ROLLBACK");
      return null;
    }

    const updated = await getBranchById(organizationId, branchId, client);
    await client.query("COMMIT");
    return updated;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

module.exports = {
  createBranch,
  getBranchById,
  getDefaultBranch,
  listBranches,
  updateBranch
};
