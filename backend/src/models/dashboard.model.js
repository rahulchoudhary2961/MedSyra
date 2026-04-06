const pool = require("../config/db");
const { getCurrentDateKey } = require("../utils/date");

const branchFilterSql = (alias, paramIndex = 3) =>
  `AND ($${paramIndex}::uuid IS NULL OR ${alias}.branch_id = $${paramIndex}::uuid)`;

const branchExistsSql = (organizationAlias, patientAlias, paramIndex = 3) => `
  AND (
    $${paramIndex}::uuid IS NULL
    OR EXISTS (
      SELECT 1
      FROM appointments scoped_a
      WHERE scoped_a.organization_id = ${organizationAlias}
        AND scoped_a.patient_id = ${patientAlias}
        AND scoped_a.branch_id = $${paramIndex}::uuid
    )
  )
`;

const getSummary = async (organizationId, branchId = null) => {
  const currentDateKey = getCurrentDateKey();
  const [metrics, activities, followUpQueue, recallQueue] = await Promise.all([
    pool.query(
      `
      WITH most_common_issue AS (
        SELECT
          MIN(TRIM(diagnosis)) AS issue_label,
          COUNT(*)::int AS issue_count,
          MAX(record_date) AS latest_record_date
        FROM medical_records
        WHERE organization_id = $1
          ${branchFilterSql("medical_records")}
          AND diagnosis IS NOT NULL
          AND BTRIM(diagnosis) <> ''
        GROUP BY LOWER(TRIM(diagnosis))
        ORDER BY issue_count DESC, latest_record_date DESC
        LIMIT 1
      )
      SELECT
        (SELECT COUNT(*)::int
         FROM appointments
         WHERE organization_id = $1
           AND appointment_date = $2::date
           ${branchFilterSql("appointments")}) AS today_appointments,
        (SELECT COALESCE(SUM(p.amount), 0)::numeric(12,2)
         FROM payments p
         WHERE p.organization_id = $1
           AND p.status = 'completed'
           AND p.paid_at::date = $2::date
           ${branchFilterSql("p")}) AS today_revenue,
        (SELECT COUNT(*)::int
         FROM invoices
         WHERE organization_id = $1
           ${branchFilterSql("invoices")}
           AND balance_amount > 0
           AND status IN ('issued', 'partially_paid', 'overdue')) AS pending_payments,
        (SELECT COUNT(*)::int
         FROM appointments
         WHERE organization_id = $1
           AND appointment_date = $2::date
           ${branchFilterSql("appointments")}
           AND status = 'no-show') AS no_shows,
        (SELECT COUNT(*)::int
         FROM patients
         WHERE organization_id = $1
           AND is_active = true
           AND last_visit_at IS NOT NULL
           AND last_visit_at < $2::date - INTERVAL '30 days'
           ${branchExistsSql("patients.organization_id", "patients.id")}) AS patients_did_not_return,
        COALESCE((SELECT issue_label FROM most_common_issue), NULL) AS most_common_issue,
        COALESCE((SELECT issue_count FROM most_common_issue), 0)::int AS most_common_issue_count,
        (SELECT COALESCE(SUM(p.amount), 0)::numeric(12,2)
         FROM payments p
         WHERE p.organization_id = $1
           AND p.status = 'completed'
           AND p.paid_at >= DATE_TRUNC('week', $2::date::timestamp)
           AND p.paid_at < DATE_TRUNC('week', $2::date::timestamp) + INTERVAL '7 days'
           ${branchFilterSql("p")}) AS weekly_revenue,
        (SELECT COALESCE(SUM(p.amount), 0)::numeric(12,2)
         FROM payments p
         WHERE p.organization_id = $1
           AND p.status = 'completed'
           AND p.paid_at >= DATE_TRUNC('month', $2::date::timestamp)
           AND p.paid_at < DATE_TRUNC('month', $2::date::timestamp) + INTERVAL '1 month'
           ${branchFilterSql("p")}) AS monthly_revenue,
        (SELECT COUNT(*)::int
         FROM medical_records
         WHERE organization_id = $1
           AND follow_up_date = $2::date
           ${branchFilterSql("medical_records")}) AS follow_ups_due_today
      `,
      [organizationId, currentDateKey, branchId]
    ),
    pool.query(
      `SELECT id, event_type, title, entity_name, event_time
       FROM activity_logs
       WHERE organization_id = $1
         ${branchFilterSql("activity_logs", 2)}
       ORDER BY event_time DESC
       LIMIT 10`,
      [organizationId, branchId]
    ),
    pool.query(
      `
      WITH ranked_follow_ups AS (
        SELECT DISTINCT ON (mr.patient_id)
          mr.id AS record_id,
          mr.patient_id,
          p.patient_code,
          p.full_name AS patient_name,
          p.phone,
          d.full_name AS doctor_name,
          mr.record_type,
          mr.follow_up_date,
          COALESCE(mr.follow_up_reminder_status, 'pending') AS follow_up_reminder_status,
          p.last_visit_at
        FROM medical_records mr
        JOIN patients p
          ON p.id = mr.patient_id
         AND p.organization_id = mr.organization_id
         AND p.is_active = true
        LEFT JOIN doctors d
          ON d.id = mr.doctor_id
         AND d.organization_id = mr.organization_id
        WHERE mr.organization_id = $1
          ${branchFilterSql("mr")}
          AND mr.follow_up_date IS NOT NULL
          AND mr.follow_up_date <= $2::date
          AND COALESCE(mr.follow_up_reminder_status, 'pending') <> 'disabled'
        ORDER BY mr.patient_id, mr.follow_up_date ASC, mr.created_at DESC
      )
      SELECT
        record_id,
        patient_id,
        patient_code,
        patient_name,
        phone,
        doctor_name,
        record_type,
        follow_up_date::text AS follow_up_date,
        follow_up_reminder_status,
        last_visit_at::text AS last_visit_at,
        GREATEST(($2::date - follow_up_date), 0)::int AS days_overdue
      FROM ranked_follow_ups
      ORDER BY follow_up_date ASC, patient_name ASC
      LIMIT 6
      `,
      [organizationId, currentDateKey, branchId]
    ),
    pool.query(
      `
      SELECT
        p.id AS patient_id,
        p.patient_code,
        p.full_name AS patient_name,
        p.phone,
        p.last_visit_at::text AS last_visit_at,
        last_doctor.doctor_name AS last_doctor_name,
        GREATEST(($2::date - p.last_visit_at::date), 0)::int AS days_since_last_visit
      FROM patients p
      LEFT JOIN LATERAL (
        SELECT d.full_name AS doctor_name
        FROM appointments a
        LEFT JOIN doctors d
          ON d.id = a.doctor_id
         AND d.organization_id = a.organization_id
        WHERE a.organization_id = p.organization_id
          AND a.patient_id = p.id
        ORDER BY a.appointment_date DESC, a.appointment_time DESC
        LIMIT 1
      ) AS last_doctor ON true
      WHERE p.organization_id = $1
        AND p.is_active = true
        AND p.last_visit_at IS NOT NULL
        AND p.last_visit_at::date < $2::date - 30
        ${branchExistsSql("p.organization_id", "p.id")}
      ORDER BY p.last_visit_at ASC, p.full_name ASC
      LIMIT 6
      `,
      [organizationId, currentDateKey, branchId]
    )
  ]);

  return {
    stats: {
      todayAppointments: Number(metrics.rows[0].today_appointments || 0),
      todayRevenue: Number(metrics.rows[0].today_revenue || 0),
      pendingPayments: Number(metrics.rows[0].pending_payments || 0),
      noShows: Number(metrics.rows[0].no_shows || 0)
    },
    insights: {
      patientsDidNotReturn: Number(metrics.rows[0].patients_did_not_return || 0),
      mostCommonIssue: {
        label: metrics.rows[0].most_common_issue || "-",
        count: Number(metrics.rows[0].most_common_issue_count || 0)
      },
      weeklyRevenue: Number(metrics.rows[0].weekly_revenue || 0),
      monthlyRevenue: Number(metrics.rows[0].monthly_revenue || 0),
      followUpsDueToday: Number(metrics.rows[0].follow_ups_due_today || 0)
    },
    crm: {
      followUpQueue: followUpQueue.rows.map((row) => ({
        recordId: row.record_id,
        patientId: row.patient_id,
        patientCode: row.patient_code || null,
        patientName: row.patient_name,
        phone: row.phone || null,
        doctorName: row.doctor_name || null,
        recordType: row.record_type || null,
        followUpDate: row.follow_up_date,
        followUpReminderStatus: row.follow_up_reminder_status || "pending",
        lastVisitAt: row.last_visit_at || null,
        daysOverdue: Number(row.days_overdue || 0)
      })),
      recallQueue: recallQueue.rows.map((row) => ({
        patientId: row.patient_id,
        patientCode: row.patient_code || null,
        patientName: row.patient_name,
        phone: row.phone || null,
        lastVisitAt: row.last_visit_at || null,
        lastDoctorName: row.last_doctor_name || null,
        daysSinceLastVisit: Number(row.days_since_last_visit || 0)
      }))
    },
    recentActivity: activities.rows
  };
};

const REPORT_PERIODS = {
  "7d": { label: "Last 7 days", interval: "7 days", previousInterval: "14 days", previousStart: "7 days", bucket: "day", buckets: 7 },
  "30d": { label: "Last 30 days", interval: "30 days", previousInterval: "60 days", previousStart: "30 days", bucket: "day", buckets: 30 },
  "90d": { label: "Last 90 days", interval: "90 days", previousInterval: "180 days", previousStart: "90 days", bucket: "week", buckets: 13 },
  "12m": { label: "Last 12 months", interval: "12 months", previousInterval: "24 months", previousStart: "12 months", bucket: "month", buckets: 12 }
};

const getReports = async (organizationId, query = {}) => {
  const periodKey = query.period || "90d";
  const period = REPORT_PERIODS[periodKey] || REPORT_PERIODS["90d"];
  const branchId = query.branchId || null;

  const bucketSql =
    period.bucket === "month"
      ? {
          series: `SELECT DATE_TRUNC('month', CURRENT_DATE) - (INTERVAL '1 month' * gs.i) AS bucket_start
                   FROM generate_series(${period.buckets - 1}, 0, -1) AS gs(i)`,
          label: "Mon YYYY"
        }
      : period.bucket === "week"
        ? {
            series: `SELECT DATE_TRUNC('week', CURRENT_DATE) - (INTERVAL '1 week' * gs.i) AS bucket_start
                     FROM generate_series(${period.buckets - 1}, 0, -1) AS gs(i)`,
            label: "DD Mon"
          }
        : {
            series: `SELECT CURRENT_DATE - gs.i AS bucket_start
                     FROM generate_series(${period.buckets - 1}, 0, -1) AS gs(i)`,
            label: "DD Mon"
          };

  const [
    overview,
    trend,
    statusBreakdown,
    paymentMethods,
    topDoctors,
    outstandingInvoices,
    departmentDistribution,
    recordTypes,
    monthlyTrends,
    diseasePatterns,
    revenueAnalysis,
    revenueStreams
  ] =
    await Promise.all([
      pool.query(
        `
        WITH current_window AS (
          SELECT COUNT(*)::int AS total
          FROM patients
          WHERE organization_id = $1
            AND is_active = true
            AND created_at >= NOW() - INTERVAL '${period.interval}'
            ${branchExistsSql("patients.organization_id", "patients.id", 2)}
        ),
        previous_window AS (
          SELECT COUNT(*)::int AS total
          FROM patients
          WHERE organization_id = $1
            AND is_active = true
            AND created_at >= NOW() - INTERVAL '${period.previousInterval}'
            AND created_at < NOW() - INTERVAL '${period.previousStart}'
            ${branchExistsSql("patients.organization_id", "patients.id", 2)}
        ),
        invoice_window AS (
          SELECT total_amount
          FROM invoices
          WHERE organization_id = $1
            ${branchFilterSql("invoices", 2)}
            AND issue_date >= CURRENT_DATE - INTERVAL '${period.interval}'
            AND status IN ('issued', 'partially_paid', 'paid', 'overdue')
        ),
        payment_window AS (
          SELECT amount
          FROM payments
          WHERE organization_id = $1
            ${branchFilterSql("payments", 2)}
            AND status = 'completed'
            AND paid_at >= NOW() - INTERVAL '${period.interval}'
        )
        SELECT
          (SELECT COUNT(*)::int
           FROM patients
           WHERE organization_id = $1
             AND is_active = true
             ${branchExistsSql("patients.organization_id", "patients.id", 2)}) AS total_patients,
          (SELECT COUNT(*)::int
           FROM medical_records
           WHERE organization_id = $1
             ${branchFilterSql("medical_records", 2)}
             AND record_date >= CURRENT_DATE - INTERVAL '${period.interval}') AS total_medical_records,
          (SELECT COUNT(*)::int
           FROM appointments
           WHERE organization_id = $1
             ${branchFilterSql("appointments", 2)}
             AND appointment_date >= CURRENT_DATE - INTERVAL '${period.interval}') AS total_appointments,
          (SELECT COUNT(*)::int
           FROM appointments
           WHERE organization_id = $1
             ${branchFilterSql("appointments", 2)}
             AND appointment_date >= CURRENT_DATE - INTERVAL '${period.interval}'
             AND status = 'completed') AS completed_appointments,
          (SELECT COUNT(*)::int
           FROM appointments
           WHERE organization_id = $1
             ${branchFilterSql("appointments", 2)}
             AND appointment_date >= CURRENT_DATE - INTERVAL '${period.interval}'
             AND status = 'no-show') AS no_shows,
          (SELECT COALESCE(SUM(p.amount), 0)::numeric(12,2)
           FROM payments p
           WHERE p.organization_id = $1
             ${branchFilterSql("p", 2)}
             AND p.status = 'completed'
             AND p.paid_at >= NOW() - INTERVAL '${period.interval}') AS revenue,
          (SELECT COALESCE(SUM(i.balance_amount), 0)::numeric(12,2)
           FROM invoices i
           WHERE i.organization_id = $1
             ${branchFilterSql("i", 2)}
             AND i.status IN ('issued', 'partially_paid', 'overdue')) AS pending_amount,
          (SELECT COUNT(*)::int
           FROM invoices i
           WHERE i.organization_id = $1
             ${branchFilterSql("i", 2)}
             AND i.status IN ('issued', 'partially_paid', 'overdue')) AS pending_invoices,
          (SELECT COALESCE(SUM(i.total_amount), 0)::numeric(12,2)
           FROM invoices i
           WHERE i.organization_id = $1
             ${branchFilterSql("i", 2)}
             AND i.issue_date >= CURRENT_DATE - INTERVAL '${period.interval}'
            AND i.status IN ('issued', 'partially_paid', 'paid')) AS invoiced_amount,
          (SELECT COALESCE(AVG(total_amount), 0)::numeric(12,2)
           FROM invoice_window) AS average_invoice_value,
          (SELECT COALESCE(AVG(amount), 0)::numeric(12,2)
           FROM payment_window) AS average_payment_value,
          (SELECT COALESCE(SUM(p.amount), 0)::numeric(12,2)
           FROM payments p
           WHERE p.organization_id = $1
             ${branchFilterSql("p", 2)}
             AND p.status = 'refunded'
             AND p.paid_at >= NOW() - INTERVAL '${period.interval}') AS refunded_amount,
          (SELECT COUNT(*)::int
           FROM medical_records
           WHERE organization_id = $1
             ${branchFilterSql("medical_records", 2)}
             AND diagnosis IS NOT NULL
             AND BTRIM(diagnosis) <> ''
             AND record_date >= CURRENT_DATE - INTERVAL '12 months') AS diagnosed_records,
          (SELECT COUNT(DISTINCT LOWER(TRIM(diagnosis)))::int
           FROM medical_records
           WHERE organization_id = $1
             ${branchFilterSql("medical_records", 2)}
             AND diagnosis IS NOT NULL
             AND BTRIM(diagnosis) <> ''
             AND record_date >= CURRENT_DATE - INTERVAL '12 months') AS unique_diagnoses,
          (SELECT total FROM current_window) AS current_patients_window,
          (SELECT total FROM previous_window) AS previous_patients_window
        `,
        [organizationId, branchId]
      ),
      pool.query(
        `
        WITH buckets AS (
          ${bucketSql.series}
        )
        SELECT
          TO_CHAR(b.bucket_start, '${bucketSql.label}') AS label,
          COALESCE(appt.total_appointments, 0)::int AS appointments,
          COALESCE(appt.no_shows, 0)::int AS no_shows,
          COALESCE(pay.revenue, 0)::numeric(12,2) AS revenue,
          COALESCE(mr.records, 0)::int AS records
        FROM buckets b
        LEFT JOIN (
          SELECT DATE_TRUNC('${period.bucket}', appointment_date::timestamp) AS bucket_start,
                 COUNT(*) AS total_appointments,
                 COUNT(*) FILTER (WHERE status = 'no-show') AS no_shows
          FROM appointments
          WHERE organization_id = $1
            ${branchFilterSql("appointments", 2)}
            AND appointment_date >= CURRENT_DATE - INTERVAL '${period.interval}'
          GROUP BY DATE_TRUNC('${period.bucket}', appointment_date::timestamp)
        ) appt ON appt.bucket_start = b.bucket_start
        LEFT JOIN (
          SELECT DATE_TRUNC('${period.bucket}', paid_at) AS bucket_start,
                 SUM(amount) AS revenue
          FROM payments
          WHERE organization_id = $1
            ${branchFilterSql("payments", 2)}
            AND status = 'completed'
            AND paid_at >= NOW() - INTERVAL '${period.interval}'
          GROUP BY DATE_TRUNC('${period.bucket}', paid_at)
        ) pay ON pay.bucket_start = b.bucket_start
        LEFT JOIN (
          SELECT DATE_TRUNC('${period.bucket}', record_date::timestamp) AS bucket_start,
                 COUNT(*) AS records
          FROM medical_records
          WHERE organization_id = $1
            ${branchFilterSql("medical_records", 2)}
            AND record_date >= CURRENT_DATE - INTERVAL '${period.interval}'
          GROUP BY DATE_TRUNC('${period.bucket}', record_date::timestamp)
        ) mr ON mr.bucket_start = b.bucket_start
        ORDER BY b.bucket_start ASC
        `,
        [organizationId, branchId]
      ),
      pool.query(
        `
        SELECT INITCAP(status) AS name, COUNT(*)::int AS value
        FROM appointments
        WHERE organization_id = $1
          ${branchFilterSql("appointments", 2)}
          AND appointment_date >= CURRENT_DATE - INTERVAL '${period.interval}'
        GROUP BY INITCAP(status)
        ORDER BY value DESC
        `,
        [organizationId, branchId]
      ),
      pool.query(
        `
        SELECT
          CASE method
            WHEN 'upi' THEN 'UPI'
            WHEN 'bank_transfer' THEN 'Bank Transfer'
            ELSE INITCAP(REPLACE(method, '_', ' '))
          END AS method,
          COALESCE(SUM(amount), 0)::numeric(12,2) AS total
        FROM payments
        WHERE organization_id = $1
          ${branchFilterSql("payments", 2)}
          AND status = 'completed'
          AND paid_at >= NOW() - INTERVAL '${period.interval}'
        GROUP BY method
        ORDER BY total DESC
        `,
        [organizationId, branchId]
      ),
      pool.query(
        `
        WITH appointment_stats AS (
          SELECT
            doctor_id,
            COUNT(*)::int AS appointments,
            COUNT(*) FILTER (WHERE status = 'completed')::int AS completed,
            COUNT(*) FILTER (WHERE status = 'no-show')::int AS no_shows,
            COUNT(DISTINCT patient_id)::int AS unique_patients
          FROM appointments
          WHERE organization_id = $1
            ${branchFilterSql("appointments", 2)}
            AND appointment_date >= CURRENT_DATE - INTERVAL '${period.interval}'
            AND doctor_id IS NOT NULL
          GROUP BY doctor_id
        ),
        revenue_stats AS (
          SELECT
            i.doctor_id,
            COALESCE(SUM(p.amount), 0)::numeric(12,2) AS revenue,
            COUNT(DISTINCT i.id)::int AS invoice_count,
            COALESCE(AVG(i.total_amount), 0)::numeric(12,2) AS avg_invoice_value
          FROM invoices i
          LEFT JOIN payments p
            ON p.invoice_id = i.id
           AND p.organization_id = i.organization_id
           AND p.status = 'completed'
          WHERE i.organization_id = $1
            ${branchFilterSql("i", 2)}
            AND i.issue_date >= CURRENT_DATE - INTERVAL '${period.interval}'
            AND i.doctor_id IS NOT NULL
          GROUP BY i.doctor_id
        )
        SELECT
          d.id,
          d.full_name AS name,
          COALESCE(NULLIF(d.specialty, ''), 'General') AS specialty,
          COALESCE(a.appointments, 0)::int AS appointments,
          COALESCE(a.completed, 0)::int AS completed,
          COALESCE(a.no_shows, 0)::int AS no_shows,
          COALESCE(a.unique_patients, 0)::int AS unique_patients,
          COALESCE(r.revenue, 0)::numeric(12,2) AS revenue,
          COALESCE(r.invoice_count, 0)::int AS invoice_count,
          COALESCE(r.avg_invoice_value, 0)::numeric(12,2) AS avg_invoice_value,
          CASE
            WHEN COALESCE(a.appointments, 0) = 0 THEN 0
            ELSE ROUND((COALESCE(a.completed, 0)::numeric / NULLIF(a.appointments, 0)) * 100, 1)
          END AS completion_rate,
          CASE
            WHEN COALESCE(a.appointments, 0) = 0 THEN 0
            ELSE ROUND((COALESCE(a.no_shows, 0)::numeric / NULLIF(a.appointments, 0)) * 100, 1)
          END AS no_show_rate,
          CASE
            WHEN COALESCE(a.completed, 0) = 0 THEN 0
            ELSE ROUND(COALESCE(r.revenue, 0)::numeric / NULLIF(a.completed, 0), 2)
          END AS avg_revenue_per_completed
        FROM doctors d
        LEFT JOIN appointment_stats a
          ON a.doctor_id = d.id
        LEFT JOIN revenue_stats r
          ON r.doctor_id = d.id
        WHERE d.organization_id = $1
          AND (COALESCE(a.appointments, 0) > 0 OR COALESCE(r.revenue, 0) > 0)
        ORDER BY COALESCE(r.revenue, 0) DESC, COALESCE(a.appointments, 0) DESC
        LIMIT 8
        `,
        [organizationId, branchId]
      ),
      pool.query(
        `
        SELECT
          i.id,
          i.invoice_number,
          p.full_name AS patient_name,
          COALESCE(d.full_name, 'Unassigned') AS doctor_name,
          i.issue_date,
          i.balance_amount::numeric(12,2) AS balance_amount,
          i.status
        FROM invoices i
        JOIN patients p
          ON p.id = i.patient_id
         AND p.organization_id = i.organization_id
        LEFT JOIN doctors d
          ON d.id = i.doctor_id
         AND d.organization_id = i.organization_id
        WHERE i.organization_id = $1
          ${branchFilterSql("i", 2)}
          AND i.balance_amount > 0
          AND i.status IN ('issued', 'partially_paid', 'overdue')
        ORDER BY i.balance_amount DESC, i.issue_date ASC
        LIMIT 8
        `,
        [organizationId, branchId]
      ),
      pool.query(
        `
        SELECT
          COALESCE(NULLIF(d.specialty, ''), 'General') AS name,
          COUNT(*)::int AS value
        FROM medical_records mr
        LEFT JOIN doctors d
          ON d.id = mr.doctor_id
         AND d.organization_id = mr.organization_id
        WHERE mr.organization_id = $1
          ${branchFilterSql("mr", 2)}
          AND mr.record_date >= CURRENT_DATE - INTERVAL '${period.interval}'
        GROUP BY COALESCE(NULLIF(d.specialty, ''), 'General')
        ORDER BY value DESC
        LIMIT 8
        `,
        [organizationId, branchId]
      ),
      pool.query(
        `
        SELECT
          INITCAP(record_type) AS type,
          COUNT(*)::int AS count
        FROM medical_records
        WHERE organization_id = $1
          ${branchFilterSql("medical_records", 2)}
          AND record_date >= CURRENT_DATE - INTERVAL '${period.interval}'
        GROUP BY INITCAP(record_type)
        ORDER BY count DESC
        `,
        [organizationId, branchId]
      ),
      pool.query(
        `
        WITH months AS (
          SELECT DATE_TRUNC('month', CURRENT_DATE) - (INTERVAL '1 month' * gs.i) AS month_start
          FROM generate_series(11, 0, -1) AS gs(i)
        )
        SELECT
          TO_CHAR(months.month_start, 'Mon YYYY') AS label,
          COALESCE(inv.invoiced_amount, 0)::numeric(12,2) AS invoiced_amount,
          COALESCE(pay.collected_amount, 0)::numeric(12,2) AS collected_amount,
          COALESCE(appt.appointments, 0)::int AS appointments,
          COALESCE(patient_counts.new_patients, 0)::int AS new_patients
        FROM months
        LEFT JOIN (
          SELECT
            DATE_TRUNC('month', issue_date::timestamp) AS month_start,
            SUM(total_amount) AS invoiced_amount
          FROM invoices
          WHERE organization_id = $1
            ${branchFilterSql("invoices", 2)}
            AND issue_date >= DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '11 months'
            AND status IN ('issued', 'partially_paid', 'paid', 'overdue')
          GROUP BY DATE_TRUNC('month', issue_date::timestamp)
        ) inv ON inv.month_start = months.month_start
        LEFT JOIN (
          SELECT
            DATE_TRUNC('month', paid_at) AS month_start,
            SUM(amount) AS collected_amount
          FROM payments
          WHERE organization_id = $1
            ${branchFilterSql("payments", 2)}
            AND status = 'completed'
            AND paid_at >= DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '11 months'
          GROUP BY DATE_TRUNC('month', paid_at)
        ) pay ON pay.month_start = months.month_start
        LEFT JOIN (
          SELECT
            DATE_TRUNC('month', appointment_date::timestamp) AS month_start,
            COUNT(*) AS appointments
          FROM appointments
          WHERE organization_id = $1
            ${branchFilterSql("appointments", 2)}
            AND appointment_date >= DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '11 months'
          GROUP BY DATE_TRUNC('month', appointment_date::timestamp)
        ) appt ON appt.month_start = months.month_start
        LEFT JOIN (
          SELECT
            DATE_TRUNC('month', created_at) AS month_start,
            COUNT(*) AS new_patients
          FROM patients
          WHERE organization_id = $1
            AND is_active = true
            AND created_at >= DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '11 months'
            ${branchExistsSql("patients.organization_id", "patients.id", 2)}
          GROUP BY DATE_TRUNC('month', created_at)
        ) patient_counts ON patient_counts.month_start = months.month_start
        ORDER BY months.month_start ASC
        `,
        [organizationId, branchId]
      ),
      pool.query(
        `
        WITH diagnosis_pool AS (
          SELECT
            LOWER(TRIM(diagnosis)) AS diagnosis_key,
            MIN(TRIM(diagnosis)) AS diagnosis,
            COUNT(*)::int AS case_count,
            COUNT(DISTINCT patient_id)::int AS patient_count,
            MAX(record_date)::date AS last_seen_at
          FROM medical_records
          WHERE organization_id = $1
            ${branchFilterSql("medical_records", 2)}
            AND diagnosis IS NOT NULL
            AND BTRIM(diagnosis) <> ''
            AND record_date >= CURRENT_DATE - INTERVAL '12 months'
          GROUP BY LOWER(TRIM(diagnosis))
        )
        SELECT
          diagnosis,
          case_count,
          patient_count,
          last_seen_at::text AS last_seen_at,
          ROUND((case_count::numeric / NULLIF(SUM(case_count) OVER (), 0)) * 100, 1) AS share_percent
        FROM diagnosis_pool
        ORDER BY case_count DESC, last_seen_at DESC
        LIMIT 8
        `,
        [organizationId, branchId]
      ),
      pool.query(
        `
        SELECT
          (SELECT COALESCE(SUM(i.total_amount), 0)::numeric(12,2)
           FROM invoices i
           WHERE i.organization_id = $1
             ${branchFilterSql("i", 2)}
             AND i.issue_date >= CURRENT_DATE - INTERVAL '${period.interval}'
             AND i.status IN ('issued', 'partially_paid', 'paid', 'overdue')) AS invoiced_amount,
          (SELECT COALESCE(SUM(p.amount), 0)::numeric(12,2)
           FROM payments p
           WHERE p.organization_id = $1
             ${branchFilterSql("p", 2)}
             AND p.status = 'completed'
             AND p.paid_at >= NOW() - INTERVAL '${period.interval}') AS collected_amount,
          (SELECT COALESCE(SUM(i.balance_amount), 0)::numeric(12,2)
           FROM invoices i
           WHERE i.organization_id = $1
             ${branchFilterSql("i", 2)}
             AND i.status IN ('issued', 'partially_paid', 'overdue')) AS outstanding_amount,
          (SELECT COALESCE(SUM(p.amount), 0)::numeric(12,2)
           FROM payments p
           WHERE p.organization_id = $1
             ${branchFilterSql("p", 2)}
             AND p.status = 'refunded'
             AND p.paid_at >= NOW() - INTERVAL '${period.interval}') AS refunded_amount,
          (SELECT COALESCE(AVG(i.total_amount), 0)::numeric(12,2)
           FROM invoices i
           WHERE i.organization_id = $1
             ${branchFilterSql("i", 2)}
             AND i.issue_date >= CURRENT_DATE - INTERVAL '${period.interval}'
             AND i.status IN ('issued', 'partially_paid', 'paid', 'overdue')) AS average_invoice_value,
          (SELECT COALESCE(AVG(p.amount), 0)::numeric(12,2)
           FROM payments p
           WHERE p.organization_id = $1
             ${branchFilterSql("p", 2)}
             AND p.status = 'completed'
             AND p.paid_at >= NOW() - INTERVAL '${period.interval}') AS average_payment_value,
          (SELECT COALESCE(SUM(p.amount), 0)::numeric(12,2)
           FROM payments p
           WHERE p.organization_id = $1
             ${branchFilterSql("p", 2)}
             AND p.status = 'completed'
             AND p.paid_at >= NOW() - INTERVAL '30 days') AS current_30_revenue,
          (SELECT COALESCE(SUM(p.amount), 0)::numeric(12,2)
           FROM payments p
           WHERE p.organization_id = $1
             ${branchFilterSql("p", 2)}
             AND p.status = 'completed'
             AND p.paid_at >= NOW() - INTERVAL '60 days'
             AND p.paid_at < NOW() - INTERVAL '30 days') AS previous_30_revenue
        `,
        [organizationId, branchId]
      ),
      pool.query(
        `
        SELECT
          stream,
          COALESCE(SUM(total_amount), 0)::numeric(12,2) AS total
        FROM (
          SELECT
            CASE
              WHEN LOWER(ii.description) LIKE '%consult%' THEN 'Consultation'
              WHEN LOWER(ii.description) LIKE '%procedure%' OR LOWER(ii.description) LIKE '%treatment%' THEN 'Procedure'
              WHEN LOWER(ii.description) LIKE '%medicine%' OR LOWER(ii.description) LIKE '%tablet%' OR LOWER(ii.description) LIKE '%drug%' THEN 'Medicine'
              WHEN LOWER(ii.description) LIKE '%lab%' OR LOWER(ii.description) LIKE '%test%' OR LOWER(ii.description) LIKE '%diagnostic%' THEN 'Diagnostics'
              ELSE 'Other'
            END AS stream,
            ii.total_amount
          FROM invoice_items ii
          JOIN invoices i
            ON i.id = ii.invoice_id
          WHERE i.organization_id = $1
            ${branchFilterSql("i", 2)}
            AND i.issue_date >= CURRENT_DATE - INTERVAL '${period.interval}'
            AND i.status IN ('issued', 'partially_paid', 'paid', 'overdue')
        ) AS categorized
        GROUP BY stream
        ORDER BY total DESC, stream ASC
        `,
        [organizationId, branchId]
      )
    ]);

  const metrics = overview.rows[0];
  const currentPatients = Number(metrics.current_patients_window || 0);
  const previousPatients = Number(metrics.previous_patients_window || 0);
  const growthRate =
    previousPatients <= 0 ? (currentPatients > 0 ? 100 : 0) : ((currentPatients - previousPatients) / previousPatients) * 100;

  const totalAppointments = Number(metrics.total_appointments || 0);
  const completedAppointments = Number(metrics.completed_appointments || 0);
  const noShows = Number(metrics.no_shows || 0);
  const cancelledCount = statusBreakdown.rows.reduce(
    (sum, row) => sum + (String(row.name).toLowerCase() === "cancelled" ? Number(row.value || 0) : 0),
    0
  );
  const invoicedAmount = Number(metrics.invoiced_amount || 0);
  const collectedAmount = Number(metrics.revenue || 0);
  const collectionRate = invoicedAmount <= 0 ? 0 : (collectedAmount / invoicedAmount) * 100;
  const revenueCurrent30 = Number(revenueAnalysis.rows[0]?.current_30_revenue || 0);
  const revenuePrevious30 = Number(revenueAnalysis.rows[0]?.previous_30_revenue || 0);
  const revenueGrowth =
    revenuePrevious30 <= 0 ? (revenueCurrent30 > 0 ? 100 : 0) : ((revenueCurrent30 - revenuePrevious30) / revenuePrevious30) * 100;
  const doctorRows = topDoctors.rows.map((row) => ({
    id: row.id,
    name: row.name,
    specialty: row.specialty,
    appointments: Number(row.appointments || 0),
    completed: Number(row.completed || 0),
    noShows: Number(row.no_shows || 0),
    uniquePatients: Number(row.unique_patients || 0),
    invoiceCount: Number(row.invoice_count || 0),
    avgInvoiceValue: Number(row.avg_invoice_value || 0),
    completionRate: Number(row.completion_rate || 0),
    noShowRate: Number(row.no_show_rate || 0),
    avgRevenuePerCompleted: Number(row.avg_revenue_per_completed || 0),
    revenue: Number(row.revenue || 0)
  }));
  const highestRevenueDoctor = doctorRows.reduce(
    (best, doctor) => (doctor.revenue > (best?.revenue || 0) ? doctor : best),
    null
  );
  const busiestDoctor = doctorRows.reduce(
    (best, doctor) => (doctor.appointments > (best?.appointments || 0) ? doctor : best),
    null
  );
  const bestCompletionDoctor = doctorRows.reduce((best, doctor) => {
    if (doctor.appointments <= 0) {
      return best;
    }

    if (!best || doctor.completionRate > best.completionRate) {
      return doctor;
    }

    return best;
  }, null);

  return {
    meta: {
      period: periodKey,
      label: period.label
    },
    stats: {
      totalPatients: Number(metrics.total_patients || 0),
      totalMedicalRecords: Number(metrics.total_medical_records || 0),
      revenue: collectedAmount,
      growthRate: Number(growthRate.toFixed(1)),
      totalAppointments,
      completedAppointments,
      noShows,
      pendingInvoices: Number(metrics.pending_invoices || 0),
      pendingAmount: Number(metrics.pending_amount || 0),
      averageInvoiceValue: Number(metrics.average_invoice_value || 0),
      averagePaymentValue: Number(metrics.average_payment_value || 0),
      refundedAmount: Number(metrics.refunded_amount || 0),
      completionRate: totalAppointments <= 0 ? 0 : Number(((completedAppointments / totalAppointments) * 100).toFixed(1)),
      cancellationRate: totalAppointments <= 0 ? 0 : Number(((cancelledCount / totalAppointments) * 100).toFixed(1)),
      collectionRate: Number(collectionRate.toFixed(1))
    },
    trendData: trend.rows.map((row) => ({
      label: row.label,
      appointments: Number(row.appointments || 0),
      revenue: Number(row.revenue || 0),
      noShows: Number(row.no_shows || 0),
      records: Number(row.records || 0)
    })),
    appointmentStatus: statusBreakdown.rows.map((row) => ({
      name: row.name,
      value: Number(row.value || 0)
    })),
    paymentMethods: paymentMethods.rows.map((row) => ({
      method: row.method,
      total: Number(row.total || 0)
    })),
    topDoctors: doctorRows,
    outstandingInvoices: outstandingInvoices.rows.map((row) => ({
      id: row.id,
      invoiceNumber: row.invoice_number,
      patientName: row.patient_name,
      doctorName: row.doctor_name,
      issueDate: row.issue_date,
      balanceAmount: Number(row.balance_amount || 0),
      status: row.status
    })),
    departmentData: departmentDistribution.rows.map((row) => ({
      name: row.name,
      value: Number(row.value || 0)
    })),
    recordTypes: recordTypes.rows.map((row) => ({
      type: row.type,
      count: Number(row.count || 0)
    })),
    monthlyTrends: monthlyTrends.rows.map((row) => ({
      label: row.label,
      invoicedAmount: Number(row.invoiced_amount || 0),
      collectedAmount: Number(row.collected_amount || 0),
      appointments: Number(row.appointments || 0),
      newPatients: Number(row.new_patients || 0)
    })),
    diseasePatterns: {
      diagnosedRecords: Number(metrics.diagnosed_records || 0),
      uniqueDiagnoses: Number(metrics.unique_diagnoses || 0),
      items: diseasePatterns.rows.map((row) => ({
        diagnosis: row.diagnosis,
        caseCount: Number(row.case_count || 0),
        patientCount: Number(row.patient_count || 0),
        lastSeenAt: row.last_seen_at,
        sharePercent: Number(row.share_percent || 0)
      }))
    },
    doctorHighlights: {
      highestRevenueDoctor,
      busiestDoctor,
      bestCompletionDoctor
    },
    revenueAnalysis: {
      invoicedAmount: Number(revenueAnalysis.rows[0]?.invoiced_amount || 0),
      collectedAmount: Number(revenueAnalysis.rows[0]?.collected_amount || 0),
      outstandingAmount: Number(revenueAnalysis.rows[0]?.outstanding_amount || 0),
      refundedAmount: Number(revenueAnalysis.rows[0]?.refunded_amount || 0),
      averageInvoiceValue: Number(revenueAnalysis.rows[0]?.average_invoice_value || 0),
      averagePaymentValue: Number(revenueAnalysis.rows[0]?.average_payment_value || 0),
      monthOverMonthGrowth: Number(revenueGrowth.toFixed(1))
    },
    revenueStreams: revenueStreams.rows.map((row) => ({
      stream: row.stream,
      total: Number(row.total || 0)
    }))
  };
};

module.exports = { getSummary, getReports };
