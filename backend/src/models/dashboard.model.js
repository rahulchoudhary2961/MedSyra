const pool = require("../config/db");
const { getCurrentDateKey } = require("../utils/date");

const getSummary = async (organizationId) => {
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
           AND appointment_date = $2::date) AS today_appointments,
        (SELECT COALESCE(SUM(p.amount), 0)::numeric(12,2)
         FROM payments p
         WHERE p.organization_id = $1
           AND p.status = 'completed'
           AND p.paid_at::date = $2::date) AS today_revenue,
        (SELECT COUNT(*)::int
         FROM invoices
         WHERE organization_id = $1
           AND balance_amount > 0
           AND status IN ('issued', 'partially_paid', 'overdue')) AS pending_payments,
        (SELECT COUNT(*)::int
         FROM appointments
         WHERE organization_id = $1
           AND appointment_date = $2::date
           AND status = 'no-show') AS no_shows,
        (SELECT COUNT(*)::int
         FROM patients
         WHERE organization_id = $1
           AND is_active = true
           AND last_visit_at IS NOT NULL
           AND last_visit_at < $2::date - INTERVAL '30 days') AS patients_did_not_return,
        COALESCE((SELECT issue_label FROM most_common_issue), NULL) AS most_common_issue,
        COALESCE((SELECT issue_count FROM most_common_issue), 0)::int AS most_common_issue_count,
        (SELECT COALESCE(SUM(p.amount), 0)::numeric(12,2)
         FROM payments p
         WHERE p.organization_id = $1
           AND p.status = 'completed'
           AND p.paid_at >= DATE_TRUNC('week', $2::date::timestamp)
           AND p.paid_at < DATE_TRUNC('week', $2::date::timestamp) + INTERVAL '7 days') AS weekly_revenue,
        (SELECT COALESCE(SUM(p.amount), 0)::numeric(12,2)
         FROM payments p
         WHERE p.organization_id = $1
           AND p.status = 'completed'
           AND p.paid_at >= DATE_TRUNC('month', $2::date::timestamp)
           AND p.paid_at < DATE_TRUNC('month', $2::date::timestamp) + INTERVAL '1 month') AS monthly_revenue,
        (SELECT COUNT(*)::int
         FROM medical_records
         WHERE organization_id = $1
           AND follow_up_date = $2::date) AS follow_ups_due_today
      `,
      [organizationId, currentDateKey]
    ),
    pool.query(
      `SELECT id, event_type, title, entity_name, event_time
       FROM activity_logs
       WHERE organization_id = $1
       ORDER BY event_time DESC
       LIMIT 10`,
      [organizationId]
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
      [organizationId, currentDateKey]
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
      ORDER BY p.last_visit_at ASC, p.full_name ASC
      LIMIT 6
      `,
      [organizationId, currentDateKey]
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

  const [overview, trend, statusBreakdown, paymentMethods, topDoctors, outstandingInvoices, departmentDistribution, recordTypes] =
    await Promise.all([
      pool.query(
        `
        WITH current_window AS (
          SELECT COUNT(*)::int AS total
          FROM patients
          WHERE organization_id = $1
            AND is_active = true
            AND created_at >= NOW() - INTERVAL '${period.interval}'
        ),
        previous_window AS (
          SELECT COUNT(*)::int AS total
          FROM patients
          WHERE organization_id = $1
            AND is_active = true
            AND created_at >= NOW() - INTERVAL '${period.previousInterval}'
            AND created_at < NOW() - INTERVAL '${period.previousStart}'
        )
        SELECT
          (SELECT COUNT(*)::int
           FROM patients
           WHERE organization_id = $1
             AND is_active = true) AS total_patients,
          (SELECT COUNT(*)::int
           FROM medical_records
           WHERE organization_id = $1
             AND record_date >= CURRENT_DATE - INTERVAL '${period.interval}') AS total_medical_records,
          (SELECT COUNT(*)::int
           FROM appointments
           WHERE organization_id = $1
             AND appointment_date >= CURRENT_DATE - INTERVAL '${period.interval}') AS total_appointments,
          (SELECT COUNT(*)::int
           FROM appointments
           WHERE organization_id = $1
             AND appointment_date >= CURRENT_DATE - INTERVAL '${period.interval}'
             AND status = 'completed') AS completed_appointments,
          (SELECT COUNT(*)::int
           FROM appointments
           WHERE organization_id = $1
             AND appointment_date >= CURRENT_DATE - INTERVAL '${period.interval}'
             AND status = 'no-show') AS no_shows,
          (SELECT COALESCE(SUM(p.amount), 0)::numeric(12,2)
           FROM payments p
           WHERE p.organization_id = $1
             AND p.status = 'completed'
             AND p.paid_at >= NOW() - INTERVAL '${period.interval}') AS revenue,
          (SELECT COALESCE(SUM(i.balance_amount), 0)::numeric(12,2)
           FROM invoices i
           WHERE i.organization_id = $1
             AND i.status IN ('issued', 'partially_paid', 'overdue')) AS pending_amount,
          (SELECT COUNT(*)::int
           FROM invoices i
           WHERE i.organization_id = $1
             AND i.status IN ('issued', 'partially_paid', 'overdue')) AS pending_invoices,
          (SELECT COALESCE(SUM(i.total_amount), 0)::numeric(12,2)
           FROM invoices i
           WHERE i.organization_id = $1
             AND i.issue_date >= CURRENT_DATE - INTERVAL '${period.interval}'
             AND i.status IN ('issued', 'partially_paid', 'paid')) AS invoiced_amount,
          (SELECT total FROM current_window) AS current_patients_window,
          (SELECT total FROM previous_window) AS previous_patients_window
        `,
        [organizationId]
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
            AND appointment_date >= CURRENT_DATE - INTERVAL '${period.interval}'
          GROUP BY DATE_TRUNC('${period.bucket}', appointment_date::timestamp)
        ) appt ON appt.bucket_start = b.bucket_start
        LEFT JOIN (
          SELECT DATE_TRUNC('${period.bucket}', paid_at) AS bucket_start,
                 SUM(amount) AS revenue
          FROM payments
          WHERE organization_id = $1
            AND status = 'completed'
            AND paid_at >= NOW() - INTERVAL '${period.interval}'
          GROUP BY DATE_TRUNC('${period.bucket}', paid_at)
        ) pay ON pay.bucket_start = b.bucket_start
        LEFT JOIN (
          SELECT DATE_TRUNC('${period.bucket}', record_date::timestamp) AS bucket_start,
                 COUNT(*) AS records
          FROM medical_records
          WHERE organization_id = $1
            AND record_date >= CURRENT_DATE - INTERVAL '${period.interval}'
          GROUP BY DATE_TRUNC('${period.bucket}', record_date::timestamp)
        ) mr ON mr.bucket_start = b.bucket_start
        ORDER BY b.bucket_start ASC
        `,
        [organizationId]
      ),
      pool.query(
        `
        SELECT INITCAP(status) AS name, COUNT(*)::int AS value
        FROM appointments
        WHERE organization_id = $1
          AND appointment_date >= CURRENT_DATE - INTERVAL '${period.interval}'
        GROUP BY INITCAP(status)
        ORDER BY value DESC
        `,
        [organizationId]
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
          AND status = 'completed'
          AND paid_at >= NOW() - INTERVAL '${period.interval}'
        GROUP BY method
        ORDER BY total DESC
        `,
        [organizationId]
      ),
      pool.query(
        `
        SELECT
          d.id,
          d.full_name AS name,
          COALESCE(NULLIF(d.specialty, ''), 'General') AS specialty,
          COUNT(a.id)::int AS appointments,
          COUNT(a.id) FILTER (WHERE a.status = 'completed')::int AS completed,
          COUNT(a.id) FILTER (WHERE a.status = 'no-show')::int AS no_shows,
          COALESCE(SUM(p.amount), 0)::numeric(12,2) AS revenue
        FROM doctors d
        LEFT JOIN appointments a
          ON a.doctor_id = d.id
         AND a.organization_id = d.organization_id
         AND a.appointment_date >= CURRENT_DATE - INTERVAL '${period.interval}'
        LEFT JOIN invoices i
          ON i.doctor_id = d.id
         AND i.organization_id = d.organization_id
         AND i.issue_date >= CURRENT_DATE - INTERVAL '${period.interval}'
        LEFT JOIN payments p
          ON p.invoice_id = i.id
         AND p.organization_id = i.organization_id
         AND p.status = 'completed'
        WHERE d.organization_id = $1
        GROUP BY d.id, d.full_name, d.specialty
        HAVING COUNT(a.id) > 0 OR COALESCE(SUM(p.amount), 0) > 0
        ORDER BY appointments DESC, revenue DESC
        LIMIT 6
        `,
        [organizationId]
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
          AND i.balance_amount > 0
          AND i.status IN ('issued', 'partially_paid', 'overdue')
        ORDER BY i.balance_amount DESC, i.issue_date ASC
        LIMIT 8
        `,
        [organizationId]
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
          AND mr.record_date >= CURRENT_DATE - INTERVAL '${period.interval}'
        GROUP BY COALESCE(NULLIF(d.specialty, ''), 'General')
        ORDER BY value DESC
        LIMIT 8
        `,
        [organizationId]
      ),
      pool.query(
        `
        SELECT
          INITCAP(record_type) AS type,
          COUNT(*)::int AS count
        FROM medical_records
        WHERE organization_id = $1
          AND record_date >= CURRENT_DATE - INTERVAL '${period.interval}'
        GROUP BY INITCAP(record_type)
        ORDER BY count DESC
        `,
        [organizationId]
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
    topDoctors: topDoctors.rows.map((row) => ({
      id: row.id,
      name: row.name,
      specialty: row.specialty,
      appointments: Number(row.appointments || 0),
      completed: Number(row.completed || 0),
      noShows: Number(row.no_shows || 0),
      revenue: Number(row.revenue || 0)
    })),
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
    }))
  };
};

module.exports = { getSummary, getReports };
