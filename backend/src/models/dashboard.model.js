const pool = require("../config/db");

const getSummary = async (organizationId) => {
  const [patients, appointmentsToday, availableDoctors, monthlyRevenue, activities] = await Promise.all([
    pool.query(
      "SELECT COUNT(*)::int AS total FROM patients WHERE organization_id = $1 AND is_active = true",
      [organizationId]
    ),
    pool.query(
      `SELECT COUNT(*)::int AS total
       FROM appointments
       WHERE organization_id = $1 AND appointment_date = CURRENT_DATE`,
      [organizationId]
    ),
    pool.query(
      "SELECT COUNT(*)::int AS total FROM doctors WHERE organization_id = $1 AND status = 'available'",
      [organizationId]
    ),
    pool.query(
      `SELECT COALESCE(SUM(fee_amount), 0)::numeric(12,2) AS total
       FROM appointments
       WHERE organization_id = $1
         AND status = 'completed'
         AND DATE_TRUNC('month', appointment_date) = DATE_TRUNC('month', CURRENT_DATE)`,
      [organizationId]
    ),
    pool.query(
      `SELECT id, event_type, title, entity_name, event_time
       FROM activity_logs
       WHERE organization_id = $1
       ORDER BY event_time DESC
       LIMIT 10`,
      [organizationId]
    )
  ]);

  return {
    stats: {
      totalPatients: patients.rows[0].total,
      todaysAppointments: appointmentsToday.rows[0].total,
      availableDoctors: availableDoctors.rows[0].total,
      monthlyRevenue: Number(monthlyRevenue.rows[0].total)
    },
    recentActivity: activities.rows
  };
};

const getReports = async (organizationId) => {
  const [overview, monthlyTrend, departmentDistribution, appointmentTypes] = await Promise.all([
    pool.query(
      `
      WITH current_window AS (
        SELECT COUNT(*)::int AS total
        FROM patients
        WHERE organization_id = $1
          AND is_active = true
          AND created_at >= NOW() - INTERVAL '30 days'
      ),
      previous_window AS (
        SELECT COUNT(*)::int AS total
        FROM patients
        WHERE organization_id = $1
          AND is_active = true
          AND created_at >= NOW() - INTERVAL '60 days'
          AND created_at < NOW() - INTERVAL '30 days'
      )
      SELECT
        (SELECT COUNT(*)::int
         FROM patients
         WHERE organization_id = $1
           AND is_active = true) AS total_patients,
        (SELECT COUNT(*)::int
         FROM appointments
         WHERE organization_id = $1
           AND appointment_date >= CURRENT_DATE - INTERVAL '90 days') AS total_appointments_3m,
        (SELECT COALESCE(SUM(fee_amount), 0)::numeric(12,2)
         FROM appointments
         WHERE organization_id = $1
           AND status = 'completed'
           AND appointment_date >= CURRENT_DATE - INTERVAL '90 days') AS revenue_3m,
        (SELECT total FROM current_window) AS current_patients_30d,
        (SELECT total FROM previous_window) AS previous_patients_30d
      `,
      [organizationId]
    ),
    pool.query(
      `
      WITH month_series AS (
        SELECT DATE_TRUNC('month', CURRENT_DATE) - (INTERVAL '1 month' * gs.i) AS month_start
        FROM generate_series(5, 0, -1) AS gs(i)
      )
      SELECT
        TO_CHAR(ms.month_start, 'Mon') AS month,
        COALESCE(p.new_patients, 0)::int AS patients,
        COALESCE(r.revenue, 0)::numeric(12,2) AS revenue,
        COALESCE(a.total_appointments, 0)::int AS appointments
      FROM month_series ms
      LEFT JOIN (
        SELECT DATE_TRUNC('month', created_at) AS month_start, COUNT(*) AS new_patients
        FROM patients
        WHERE organization_id = $1
          AND is_active = true
        GROUP BY DATE_TRUNC('month', created_at)
      ) p ON p.month_start = ms.month_start
      LEFT JOIN (
        SELECT DATE_TRUNC('month', appointment_date) AS month_start, COUNT(*) AS total_appointments
        FROM appointments
        WHERE organization_id = $1
        GROUP BY DATE_TRUNC('month', appointment_date)
      ) a ON a.month_start = ms.month_start
      LEFT JOIN (
        SELECT DATE_TRUNC('month', appointment_date) AS month_start, SUM(fee_amount) AS revenue
        FROM appointments
        WHERE organization_id = $1
          AND status = 'completed'
        GROUP BY DATE_TRUNC('month', appointment_date)
      ) r ON r.month_start = ms.month_start
      ORDER BY ms.month_start ASC
      `,
      [organizationId]
    ),
    pool.query(
      `
      SELECT
        COALESCE(NULLIF(d.specialty, ''), 'General') AS name,
        COUNT(*)::int AS value
      FROM appointments a
      INNER JOIN doctors d
        ON d.id = a.doctor_id
       AND d.organization_id = a.organization_id
      WHERE a.organization_id = $1
      GROUP BY COALESCE(NULLIF(d.specialty, ''), 'General')
      ORDER BY value DESC
      LIMIT 8
      `,
      [organizationId]
    ),
    pool.query(
      `
      SELECT
        INITCAP(a.appointment_type) AS type,
        COUNT(*)::int AS count
      FROM appointments a
      WHERE a.organization_id = $1
      GROUP BY INITCAP(a.appointment_type)
      ORDER BY count DESC
      `,
      [organizationId]
    )
  ]);

  const metrics = overview.rows[0];
  const currentPatients = Number(metrics.current_patients_30d || 0);
  const previousPatients = Number(metrics.previous_patients_30d || 0);
  const growthRate =
    previousPatients <= 0 ? (currentPatients > 0 ? 100 : 0) : ((currentPatients - previousPatients) / previousPatients) * 100;

  return {
    stats: {
      totalPatients: Number(metrics.total_patients || 0),
      totalAppointments: Number(metrics.total_appointments_3m || 0),
      revenue3m: Number(metrics.revenue_3m || 0),
      growthRate: Number(growthRate.toFixed(1))
    },
    monthlyData: monthlyTrend.rows.map((row) => ({
      month: row.month,
      patients: Number(row.patients || 0),
      revenue: Number(row.revenue || 0),
      appointments: Number(row.appointments || 0)
    })),
    departmentData: departmentDistribution.rows.map((row) => ({
      name: row.name,
      value: Number(row.value || 0)
    })),
    appointmentTypes: appointmentTypes.rows.map((row) => ({
      type: row.type,
      count: Number(row.count || 0)
    }))
  };
};

module.exports = { getSummary, getReports };
