const pool = require("../config/db");
const parsePagination = require("../utils/pagination");
const { getCurrentDateKey } = require("../utils/date");

const mapTask = (row) => {
  if (!row) {
    return null;
  }

  return {
    ...row,
    days_until_due: Number(row.days_until_due || 0)
  };
};

const syncAutoTasks = async (organizationId, db = pool) => {
  const currentDateKey = getCurrentDateKey();

  await db.query(
    `
    INSERT INTO crm_tasks (
      organization_id,
      patient_id,
      source_record_id,
      source_appointment_id,
      task_type,
      title,
      priority,
      due_date
    )
    SELECT
      mr.organization_id,
      mr.patient_id,
      mr.id,
      mr.appointment_id,
      'follow_up',
      CONCAT('Follow up with ', p.full_name),
      CASE
        WHEN mr.follow_up_date < $2::date THEN 'high'
        WHEN mr.follow_up_date = $2::date THEN 'medium'
        ELSE 'low'
      END,
      mr.follow_up_date
    FROM medical_records mr
    JOIN patients p
      ON p.id = mr.patient_id
     AND p.organization_id = mr.organization_id
     AND p.is_active = true
    WHERE mr.organization_id = $1
      AND mr.follow_up_date IS NOT NULL
      AND COALESCE(mr.follow_up_reminder_status, 'pending') <> 'disabled'
    ON CONFLICT (organization_id, task_type, source_record_id)
      WHERE source_record_id IS NOT NULL
    DO UPDATE
      SET title = EXCLUDED.title,
          priority = EXCLUDED.priority,
          due_date = EXCLUDED.due_date,
          updated_at = NOW()
    `,
    [organizationId, currentDateKey]
  );

  await db.query(
    `
    INSERT INTO crm_tasks (
      organization_id,
      patient_id,
      task_type,
      title,
      priority,
      due_date
    )
    SELECT
      p.organization_id,
      p.id,
      'recall',
      CONCAT('Recall ', p.full_name),
      CASE
        WHEN p.last_visit_at::date < $2::date - 45 THEN 'high'
        ELSE 'medium'
      END,
      (p.last_visit_at::date + INTERVAL '30 days')::date
    FROM patients p
    WHERE p.organization_id = $1
      AND p.is_active = true
      AND p.last_visit_at IS NOT NULL
      AND p.last_visit_at::date < $2::date - 30
      AND NOT EXISTS (
        SELECT 1
        FROM appointments a
        WHERE a.organization_id = p.organization_id
          AND a.patient_id = p.id
          AND a.status IN ('pending', 'confirmed', 'checked-in')
          AND a.appointment_date >= $2::date
      )
      AND NOT EXISTS (
        SELECT 1
        FROM crm_tasks ct
        WHERE ct.organization_id = p.organization_id
          AND ct.patient_id = p.id
          AND ct.task_type = 'recall'
          AND ct.status IN ('open', 'contacted', 'scheduled', 'not_reachable')
      )
    `,
    [organizationId, currentDateKey]
  );

  await db.query(
    `
    UPDATE crm_tasks ct
    SET status = 'scheduled',
        completed_at = COALESCE(ct.completed_at, NOW()),
        updated_at = NOW()
    WHERE ct.organization_id = $1
      AND ct.status IN ('open', 'contacted', 'not_reachable')
      AND EXISTS (
        SELECT 1
        FROM appointments a
        WHERE a.organization_id = ct.organization_id
          AND a.patient_id = ct.patient_id
          AND a.status IN ('pending', 'confirmed', 'checked-in')
          AND a.appointment_date >= $2::date
      )
    `,
    [organizationId, currentDateKey]
  );

  await db.query(
    `
    UPDATE crm_tasks ct
    SET status = 'closed',
        completed_at = COALESCE(ct.completed_at, NOW()),
        updated_at = NOW()
    WHERE ct.organization_id = $1
      AND ct.task_type = 'follow_up'
      AND ct.status IN ('open', 'contacted', 'not_reachable')
      AND EXISTS (
        SELECT 1
        FROM appointments a
        WHERE a.organization_id = ct.organization_id
          AND a.patient_id = ct.patient_id
          AND a.status = 'completed'
          AND a.appointment_date >= ct.due_date
      )
    `,
    [organizationId]
  );
};

const listTasks = async (organizationId, query) => {
  const { offset, limit, page } = parsePagination(query);
  const currentDateKey = getCurrentDateKey();
  const queryValues = [organizationId, currentDateKey];
  const summaryValues = [organizationId, currentDateKey];
  const countValues = [organizationId];
  const queryConditions = ["ct.organization_id = $1"];
  const summaryConditions = ["ct.organization_id = $1"];
  const countConditions = ["ct.organization_id = $1"];

  if (query.status) {
    queryValues.push(query.status);
    summaryValues.push(query.status);
    countValues.push(query.status);
    queryConditions.push(`ct.status = $${queryValues.length}`);
    summaryConditions.push(`ct.status = $${summaryValues.length}`);
    countConditions.push(`ct.status = $${countValues.length}`);
  }

  if (query.taskType) {
    queryValues.push(query.taskType);
    summaryValues.push(query.taskType);
    countValues.push(query.taskType);
    queryConditions.push(`ct.task_type = $${queryValues.length}`);
    summaryConditions.push(`ct.task_type = $${summaryValues.length}`);
    countConditions.push(`ct.task_type = $${countValues.length}`);
  }

  if (query.patientId) {
    queryValues.push(query.patientId);
    summaryValues.push(query.patientId);
    countValues.push(query.patientId);
    queryConditions.push(`ct.patient_id = $${queryValues.length}`);
    summaryConditions.push(`ct.patient_id = $${summaryValues.length}`);
    countConditions.push(`ct.patient_id = $${countValues.length}`);
  }

  if (query.assignedUserId) {
    queryValues.push(query.assignedUserId);
    summaryValues.push(query.assignedUserId);
    countValues.push(query.assignedUserId);
    queryConditions.push(`ct.assigned_user_id = $${queryValues.length}`);
    summaryConditions.push(`ct.assigned_user_id = $${summaryValues.length}`);
    countConditions.push(`ct.assigned_user_id = $${countValues.length}`);
  }

  if (query.q) {
    const searchValue = `%${query.q}%`;
    queryValues.push(searchValue);
    summaryValues.push(searchValue);
    countValues.push(searchValue);
    queryConditions.push(
      `(p.full_name ILIKE $${queryValues.length} OR p.patient_code ILIKE $${queryValues.length} OR ct.title ILIKE $${queryValues.length})`
    );
    summaryConditions.push(
      `(p.full_name ILIKE $${summaryValues.length} OR p.patient_code ILIKE $${summaryValues.length} OR ct.title ILIKE $${summaryValues.length})`
    );
    countConditions.push(
      `(p.full_name ILIKE $${countValues.length} OR p.patient_code ILIKE $${countValues.length} OR ct.title ILIKE $${countValues.length})`
    );
  }

  queryValues.push(limit, offset);
  const queryWhereClause = queryConditions.join(" AND ");
  const summaryWhereClause = summaryConditions.join(" AND ");
  const countWhereClause = countConditions.join(" AND ");

  const querySql = `
    SELECT
      ct.id,
      ct.patient_id,
      p.patient_code,
      p.full_name AS patient_name,
      p.phone,
      ct.source_record_id,
      ct.source_appointment_id,
      ct.task_type,
      ct.title,
      ct.priority,
      ct.status,
      ct.due_date::text AS due_date,
      (ct.due_date - $2::date)::int AS days_until_due,
      ct.assigned_user_id,
      assignee.full_name AS assigned_user_name,
      ct.last_contacted_at,
      ct.next_action_at,
      ct.outcome_notes,
      ct.completed_at,
      ct.created_at,
      ct.updated_at,
      mr.record_type,
      next_appt.id AS next_appointment_id,
      next_appt.appointment_date,
      next_appt.appointment_time,
      next_appt.status AS next_appointment_status
    FROM crm_tasks ct
    JOIN patients p
      ON p.id = ct.patient_id
     AND p.organization_id = ct.organization_id
    LEFT JOIN users assignee
      ON assignee.id = ct.assigned_user_id
     AND assignee.organization_id = ct.organization_id
    LEFT JOIN medical_records mr
      ON mr.id = ct.source_record_id
     AND mr.organization_id = ct.organization_id
    LEFT JOIN LATERAL (
      SELECT
        a.id,
        a.appointment_date::text AS appointment_date,
        a.appointment_time,
        a.status
      FROM appointments a
      WHERE a.organization_id = ct.organization_id
        AND a.patient_id = ct.patient_id
        AND a.status IN ('pending', 'confirmed', 'checked-in')
        AND a.appointment_date >= $2::date
      ORDER BY a.appointment_date ASC, a.appointment_time ASC
      LIMIT 1
    ) AS next_appt ON true
    WHERE ${queryWhereClause}
    ORDER BY
      CASE ct.priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END,
      ct.due_date ASC,
      ct.created_at DESC
    LIMIT $${queryValues.length - 1} OFFSET $${queryValues.length}
  `;

  const countSql = `
    SELECT COUNT(*)::int AS total
    FROM crm_tasks ct
    JOIN patients p
      ON p.id = ct.patient_id
     AND p.organization_id = ct.organization_id
    WHERE ${countWhereClause}
  `;

  const summarySql = `
    SELECT
      COUNT(*)::int AS total_tasks,
      COUNT(*) FILTER (WHERE ct.status = 'open')::int AS open_tasks,
      COUNT(*) FILTER (WHERE ct.status = 'contacted')::int AS contacted_tasks,
      COUNT(*) FILTER (WHERE ct.status = 'scheduled')::int AS scheduled_tasks,
      COUNT(*) FILTER (WHERE ct.status = 'closed')::int AS closed_tasks,
      COUNT(*) FILTER (
        WHERE ct.due_date < $2::date
          AND ct.status IN ('open', 'contacted', 'not_reachable')
      )::int AS overdue_tasks,
      COUNT(*) FILTER (
        WHERE ct.due_date = $2::date
          AND ct.status IN ('open', 'contacted', 'not_reachable')
      )::int AS due_today_tasks
    FROM crm_tasks ct
    JOIN patients p
      ON p.id = ct.patient_id
     AND p.organization_id = ct.organization_id
    WHERE ${summaryWhereClause}
  `;

  const [rowsRes, countRes, summaryRes] = await Promise.all([
    pool.query(querySql, queryValues),
    pool.query(countSql, countValues),
    pool.query(summarySql, summaryValues)
  ]);

  return {
    items: rowsRes.rows.map(mapTask),
    summary: {
      totalTasks: Number(summaryRes.rows[0]?.total_tasks || 0),
      openTasks: Number(summaryRes.rows[0]?.open_tasks || 0),
      contactedTasks: Number(summaryRes.rows[0]?.contacted_tasks || 0),
      scheduledTasks: Number(summaryRes.rows[0]?.scheduled_tasks || 0),
      closedTasks: Number(summaryRes.rows[0]?.closed_tasks || 0),
      overdueTasks: Number(summaryRes.rows[0]?.overdue_tasks || 0),
      dueTodayTasks: Number(summaryRes.rows[0]?.due_today_tasks || 0)
    },
    pagination: {
      page,
      limit,
      total: countRes.rows[0]?.total || 0,
      totalPages: Math.ceil((countRes.rows[0]?.total || 0) / limit) || 1
    }
  };
};

const getTaskById = async (organizationId, id) => {
  const currentDateKey = getCurrentDateKey();
  const query = `
    SELECT
      ct.id,
      ct.patient_id,
      p.patient_code,
      p.full_name AS patient_name,
      p.phone,
      ct.source_record_id,
      ct.source_appointment_id,
      ct.task_type,
      ct.title,
      ct.priority,
      ct.status,
      ct.due_date::text AS due_date,
      (ct.due_date - $3::date)::int AS days_until_due,
      ct.assigned_user_id,
      assignee.full_name AS assigned_user_name,
      ct.last_contacted_at,
      ct.next_action_at,
      ct.outcome_notes,
      ct.completed_at,
      ct.created_at,
      ct.updated_at,
      mr.record_type
    FROM crm_tasks ct
    JOIN patients p
      ON p.id = ct.patient_id
     AND p.organization_id = ct.organization_id
    LEFT JOIN users assignee
      ON assignee.id = ct.assigned_user_id
     AND assignee.organization_id = ct.organization_id
    LEFT JOIN medical_records mr
      ON mr.id = ct.source_record_id
     AND mr.organization_id = ct.organization_id
    WHERE ct.organization_id = $1 AND ct.id = $2
    LIMIT 1
  `;

  const { rows } = await pool.query(query, [organizationId, id, currentDateKey]);
  return mapTask(rows[0] || null);
};

const createTask = async (organizationId, payload) => {
  const query = `
    INSERT INTO crm_tasks (
      organization_id,
      patient_id,
      source_record_id,
      source_appointment_id,
      task_type,
      title,
      priority,
      status,
      due_date,
      assigned_user_id,
      created_by_user_id,
      next_action_at,
      outcome_notes,
      completed_at
    )
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
    RETURNING id
  `;

  const values = [
    organizationId,
    payload.patientId,
    payload.sourceRecordId || null,
    payload.sourceAppointmentId || null,
    payload.taskType,
    payload.title,
    payload.priority || "medium",
    payload.status || "open",
    payload.dueDate,
    payload.assignedUserId || null,
    payload.createdByUserId || null,
    payload.nextActionAt || null,
    payload.outcomeNotes || null,
    payload.completedAt || null
  ];

  const { rows } = await pool.query(query, values);
  return getTaskById(organizationId, rows[0].id);
};

const updateTask = async (organizationId, id, payload) => {
  const columnMap = {
    title: "title",
    priority: "priority",
    status: "status",
    dueDate: "due_date",
    assignedUserId: "assigned_user_id",
    lastContactedAt: "last_contacted_at",
    nextActionAt: "next_action_at",
    outcomeNotes: "outcome_notes",
    completedAt: "completed_at"
  };

  const mappedEntries = Object.entries(payload)
    .filter(([key, value]) => columnMap[key] && value !== undefined)
    .map(([key, value]) => [columnMap[key], value]);

  if (mappedEntries.length === 0) {
    return getTaskById(organizationId, id);
  }

  const setClauses = [];
  const values = [organizationId, id];
  mappedEntries.forEach(([column, value], index) => {
    setClauses.push(`${column} = $${index + 3}`);
    values.push(value);
  });

  const query = `
    UPDATE crm_tasks
    SET ${setClauses.join(", ")}, updated_at = NOW()
    WHERE organization_id = $1 AND id = $2
    RETURNING id
  `;

  const { rows } = await pool.query(query, values);
  if (!rows[0]) {
    return null;
  }

  return getTaskById(organizationId, id);
};

module.exports = {
  syncAutoTasks,
  listTasks,
  getTaskById,
  createTask,
  updateTask
};
