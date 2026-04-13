const pool = require("../config/db");
const parsePagination = require("../utils/pagination");
const ApiError = require("../utils/api-error");

const OUTGOING_MOVEMENT_TYPES = new Set(["usage", "wastage", "adjustment_out"]);
const INCOMING_MOVEMENT_TYPES = new Set(["stock_in", "adjustment_in"]);

const mapInventoryItem = (row) => {
  if (!row) {
    return null;
  }

  return {
    ...row,
    reorder_level: Number(row.reorder_level || 0),
    current_stock: Number(row.current_stock || 0),
    total_movements: Number(row.total_movements || 0),
    latest_unit_cost: Number(row.latest_unit_cost || 0),
    wastage_quantity: Number(row.wastage_quantity || 0),
    wastage_value: Number(row.wastage_value || 0)
  };
};

const mapInventoryMovement = (row) => {
  if (!row) {
    return null;
  }

  return {
    ...row,
    quantity: Number(row.quantity || 0),
    unit_cost: Number(row.unit_cost || 0),
    total_cost: Number(row.total_cost || 0)
  };
};

const getItemAggregateJoin = `
  LEFT JOIN LATERAL (
    SELECT
      COALESCE(SUM(
        CASE
          WHEN im.movement_type IN ('stock_in', 'adjustment_in') THEN im.quantity
          ELSE -im.quantity
        END
      ), 0)::numeric(12,2) AS current_stock,
      COUNT(*)::int AS total_movements,
      MAX(im.movement_date)::date AS last_movement_date,
      COALESCE(SUM(im.quantity) FILTER (WHERE im.movement_type = 'wastage'), 0)::numeric(12,2) AS wastage_quantity,
      COALESCE(SUM(im.total_cost) FILTER (WHERE im.movement_type = 'wastage'), 0)::numeric(12,2) AS wastage_value
    FROM inventory_movements im
    WHERE im.organization_id = ii.organization_id
      AND im.item_id = ii.id
  ) item_summary ON true
  LEFT JOIN LATERAL (
    SELECT
      im.unit_cost AS latest_unit_cost
    FROM inventory_movements im
    WHERE im.organization_id = ii.organization_id
      AND im.item_id = ii.id
    ORDER BY im.movement_date DESC, im.created_at DESC
    LIMIT 1
  ) latest_cost ON true
`;

const getInventoryItemByIdWithDb = async (db, organizationId, id, { forUpdate = false } = {}) => {
  const { rows } = await db.query(
    `
      SELECT
        ii.id,
        ii.organization_id,
        ii.code,
        ii.name,
        ii.category,
        ii.unit,
        ii.reorder_level,
        ii.is_active,
        ii.created_at,
        ii.updated_at,
        COALESCE(item_summary.current_stock, 0)::numeric(12,2) AS current_stock,
        COALESCE(item_summary.total_movements, 0)::int AS total_movements,
        item_summary.last_movement_date::text AS last_movement_date,
        COALESCE(item_summary.wastage_quantity, 0)::numeric(12,2) AS wastage_quantity,
        COALESCE(item_summary.wastage_value, 0)::numeric(12,2) AS wastage_value,
        COALESCE(latest_cost.latest_unit_cost, 0)::numeric(12,2) AS latest_unit_cost
      FROM inventory_items ii
      ${getItemAggregateJoin}
      WHERE ii.organization_id = $1
        AND ii.id = $2
      ${forUpdate ? "FOR UPDATE OF ii" : ""}
      LIMIT 1
    `,
    [organizationId, id]
  );

  return mapInventoryItem(rows[0] || null);
};

const getInventoryItemById = async (organizationId, id) => getInventoryItemByIdWithDb(pool, organizationId, id);

const listInventoryItems = async (organizationId, query = {}) => {
  const { page, limit, offset } = parsePagination(query);
  const values = [organizationId];
  const conditions = ["ii.organization_id = $1"];

  if (query.q) {
    values.push(`%${query.q}%`);
    const idx = values.length;
    conditions.push(`(ii.name ILIKE $${idx} OR ii.category ILIKE $${idx} OR ii.code ILIKE $${idx})`);
  }

  if (query.active !== undefined) {
    values.push(query.active === "true");
    conditions.push(`ii.is_active = $${values.length}`);
  }

  values.push(limit, offset);
  const whereClause = conditions.join(" AND ");

  const querySql = `
    SELECT
      ii.id,
      ii.organization_id,
      ii.code,
      ii.name,
      ii.category,
      ii.unit,
      ii.reorder_level,
      ii.is_active,
      ii.created_at,
      ii.updated_at,
      COALESCE(item_summary.current_stock, 0)::numeric(12,2) AS current_stock,
      COALESCE(item_summary.total_movements, 0)::int AS total_movements,
      item_summary.last_movement_date::text AS last_movement_date,
      COALESCE(item_summary.wastage_quantity, 0)::numeric(12,2) AS wastage_quantity,
      COALESCE(item_summary.wastage_value, 0)::numeric(12,2) AS wastage_value,
      COALESCE(latest_cost.latest_unit_cost, 0)::numeric(12,2) AS latest_unit_cost
    FROM inventory_items ii
    ${getItemAggregateJoin}
    WHERE ${whereClause}
    ORDER BY ii.is_active DESC, ii.name ASC
    LIMIT $${values.length - 1} OFFSET $${values.length}
  `;

  const countSql = `
    SELECT COUNT(*)::int AS total
    FROM inventory_items ii
    WHERE ${whereClause}
  `;

  const [rowsRes, countRes] = await Promise.all([
    pool.query(querySql, values),
    pool.query(countSql, values.slice(0, values.length - 2))
  ]);

  return {
    items: rowsRes.rows.map(mapInventoryItem),
    pagination: {
      page,
      limit,
      total: countRes.rows[0]?.total || 0,
      totalPages: Math.ceil((countRes.rows[0]?.total || 0) / limit) || 1
    }
  };
};

const createInventoryItem = async (organizationId, payload) => {
  const { rows } = await pool.query(
    `
      INSERT INTO inventory_items (
        organization_id,
        code,
        name,
        category,
        unit,
        reorder_level,
        is_active
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7)
      RETURNING id
    `,
    [
      organizationId,
      payload.code || null,
      payload.name,
      payload.category || null,
      payload.unit || "unit",
      payload.reorderLevel ?? 0,
      payload.isActive ?? true
    ]
  );

  return getInventoryItemById(organizationId, rows[0].id);
};

const updateInventoryItem = async (organizationId, id, payload) => {
  const columnMap = {
    code: "code",
    name: "name",
    category: "category",
    unit: "unit",
    reorderLevel: "reorder_level",
    isActive: "is_active"
  };

  const mappedEntries = Object.entries(payload)
    .filter(([key, value]) => columnMap[key] && value !== undefined)
    .map(([key, value]) => [columnMap[key], value]);

  if (mappedEntries.length === 0) {
    return getInventoryItemById(organizationId, id);
  }

  const setClauses = [];
  const values = [organizationId, id];

  mappedEntries.forEach(([column, value], index) => {
    setClauses.push(`${column} = $${index + 3}`);
    values.push(value);
  });

  const { rows } = await pool.query(
    `
      UPDATE inventory_items
      SET ${setClauses.join(", ")}, updated_at = NOW()
      WHERE organization_id = $1 AND id = $2
      RETURNING id
    `,
    values
  );

  if (!rows[0]) {
    return null;
  }

  return getInventoryItemById(organizationId, id);
};

const deleteInventoryItem = async (organizationId, id) => {
  const { rows } = await pool.query(
    `
      UPDATE inventory_items
      SET is_active = false, updated_at = NOW()
      WHERE organization_id = $1 AND id = $2
      RETURNING id
    `,
    [organizationId, id]
  );

  if (!rows[0]) {
    return null;
  }

  return getInventoryItemById(organizationId, id);
};

const getCurrentStockWithDb = async (db, organizationId, itemId) => {
  const { rows } = await db.query(
    `
      SELECT
        COALESCE(SUM(
          CASE
            WHEN movement_type IN ('stock_in', 'adjustment_in') THEN quantity
            ELSE -quantity
          END
        ), 0)::numeric(12,2) AS current_stock
      FROM inventory_movements
      WHERE organization_id = $1
        AND item_id = $2
    `,
    [organizationId, itemId]
  );

  return Number(rows[0]?.current_stock || 0);
};

const getInventoryMovementByIdWithDb = async (db, organizationId, id) => {
  const { rows } = await db.query(
    `
      SELECT
        im.id,
        im.organization_id,
        im.item_id,
        ii.code AS item_code,
        ii.name AS item_name,
        ii.category AS item_category,
        ii.unit AS item_unit,
        im.movement_type,
        im.quantity,
        im.unit_cost,
        im.total_cost,
        im.notes,
        im.movement_date::text AS movement_date,
        im.performed_by_user_id,
        performed_by.full_name AS performed_by_name,
        im.created_at,
        im.updated_at
      FROM inventory_movements im
      JOIN inventory_items ii
        ON ii.id = im.item_id
       AND ii.organization_id = im.organization_id
      LEFT JOIN users performed_by
        ON performed_by.id = im.performed_by_user_id
       AND performed_by.organization_id = im.organization_id
      WHERE im.organization_id = $1
        AND im.id = $2
      LIMIT 1
    `,
    [organizationId, id]
  );

  return mapInventoryMovement(rows[0] || null);
};

const listInventoryMovements = async (organizationId, query = {}) => {
  const { page, limit, offset } = parsePagination(query);
  const values = [organizationId];
  const conditions = ["im.organization_id = $1"];

  if (query.itemId) {
    values.push(query.itemId);
    conditions.push(`im.item_id = $${values.length}`);
  }

  if (query.movementType) {
    values.push(query.movementType);
    conditions.push(`im.movement_type = $${values.length}`);
  }

  if (query.q) {
    values.push(`%${query.q}%`);
    const idx = values.length;
    conditions.push(`(ii.name ILIKE $${idx} OR ii.code ILIKE $${idx} OR ii.category ILIKE $${idx} OR im.notes ILIKE $${idx})`);
  }

  values.push(limit, offset);
  const whereClause = conditions.join(" AND ");

  const baseFromSql = `
    FROM inventory_movements im
    JOIN inventory_items ii
      ON ii.id = im.item_id
     AND ii.organization_id = im.organization_id
    LEFT JOIN users performed_by
      ON performed_by.id = im.performed_by_user_id
     AND performed_by.organization_id = im.organization_id
    WHERE ${whereClause}
  `;

  const querySql = `
    SELECT
      im.id,
      im.organization_id,
      im.item_id,
      ii.code AS item_code,
      ii.name AS item_name,
      ii.category AS item_category,
      ii.unit AS item_unit,
      im.movement_type,
      im.quantity,
      im.unit_cost,
      im.total_cost,
      im.notes,
      im.movement_date::text AS movement_date,
      im.performed_by_user_id,
      performed_by.full_name AS performed_by_name,
      im.created_at,
      im.updated_at
    ${baseFromSql}
    ORDER BY im.movement_date DESC, im.created_at DESC
    LIMIT $${values.length - 1} OFFSET $${values.length}
  `;

  const countSql = `
    SELECT COUNT(*)::int AS total
    ${baseFromSql}
  `;

  const statsSql = `
    SELECT
      COALESCE(SUM(im.quantity) FILTER (WHERE im.movement_type IN ('stock_in', 'adjustment_in')), 0)::numeric(12,2) AS total_in_quantity,
      COALESCE(SUM(im.quantity) FILTER (WHERE im.movement_type IN ('usage', 'adjustment_out')), 0)::numeric(12,2) AS total_out_quantity,
      COALESCE(SUM(im.quantity) FILTER (WHERE im.movement_type = 'wastage'), 0)::numeric(12,2) AS wastage_quantity,
      COALESCE(SUM(im.total_cost) FILTER (WHERE im.movement_type = 'wastage'), 0)::numeric(12,2) AS wastage_value
    ${baseFromSql}
  `;

  const [rowsRes, countRes, statsRes] = await Promise.all([
    pool.query(querySql, values),
    pool.query(countSql, values.slice(0, values.length - 2)),
    pool.query(statsSql, values.slice(0, values.length - 2))
  ]);

  return {
    items: rowsRes.rows.map(mapInventoryMovement),
    stats: {
      totalInQuantity: Number(statsRes.rows[0]?.total_in_quantity || 0),
      totalOutQuantity: Number(statsRes.rows[0]?.total_out_quantity || 0),
      wastageQuantity: Number(statsRes.rows[0]?.wastage_quantity || 0),
      wastageValue: Number(statsRes.rows[0]?.wastage_value || 0)
    },
    pagination: {
      page,
      limit,
      total: countRes.rows[0]?.total || 0,
      totalPages: Math.ceil((countRes.rows[0]?.total || 0) / limit) || 1
    }
  };
};

const createInventoryMovement = async (organizationId, payload, actor = null) => {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const item = await getInventoryItemByIdWithDb(client, organizationId, payload.itemId, { forUpdate: true });
    if (!item) {
      throw new ApiError(404, "Inventory item not found");
    }

    const currentStock = await getCurrentStockWithDb(client, organizationId, payload.itemId);
    const quantity = Number(payload.quantity);
    if (OUTGOING_MOVEMENT_TYPES.has(payload.movementType) && currentStock < quantity) {
      throw new ApiError(400, `Insufficient stock for ${item.name}`);
    }

    const unitCost =
      payload.unitCost !== undefined && payload.unitCost !== null
        ? Number(payload.unitCost)
        : Number(item.latest_unit_cost || 0);
    const totalCost = Number((unitCost * quantity).toFixed(2));

    const { rows } = await client.query(
      `
        INSERT INTO inventory_movements (
          organization_id,
          branch_id,
          item_id,
          movement_type,
          quantity,
          unit_cost,
          total_cost,
          notes,
          movement_date,
          performed_by_user_id
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
        RETURNING id
      `,
      [
        organizationId,
        payload.branchId,
        payload.itemId,
        payload.movementType,
        quantity,
        unitCost,
        totalCost,
        payload.notes || null,
        payload.movementDate,
        actor?.sub || null
      ]
    );

    await client.query("COMMIT");
    return getInventoryMovementByIdWithDb(client, organizationId, rows[0].id);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

module.exports = {
  INCOMING_MOVEMENT_TYPES,
  OUTGOING_MOVEMENT_TYPES,
  listInventoryItems,
  getInventoryItemById,
  createInventoryItem,
  updateInventoryItem,
  deleteInventoryItem,
  listInventoryMovements,
  createInventoryMovement
};
