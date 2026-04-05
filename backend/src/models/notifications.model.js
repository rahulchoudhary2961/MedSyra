const pool = require("../config/db");

const defaultPreferences = {
  appointment_whatsapp_enabled: true,
  appointment_sms_enabled: false,
  follow_up_whatsapp_enabled: true,
  follow_up_sms_enabled: false,
  staff_schedule_email_enabled: true,
  staff_schedule_sms_enabled: false
};

const getNotificationPreferences = async (organizationId) => {
  const query = `
    SELECT
      organization_id,
      appointment_whatsapp_enabled,
      appointment_sms_enabled,
      follow_up_whatsapp_enabled,
      follow_up_sms_enabled,
      staff_schedule_email_enabled,
      staff_schedule_sms_enabled,
      created_at,
      updated_at
    FROM notification_preferences
    WHERE organization_id = $1
  `;
  const { rows } = await pool.query(query, [organizationId]);
  if (rows[0]) {
    return rows[0];
  }

  const insertQuery = `
    INSERT INTO notification_preferences (
      organization_id,
      appointment_whatsapp_enabled,
      appointment_sms_enabled,
      follow_up_whatsapp_enabled,
      follow_up_sms_enabled,
      staff_schedule_email_enabled,
      staff_schedule_sms_enabled
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    RETURNING
      organization_id,
      appointment_whatsapp_enabled,
      appointment_sms_enabled,
      follow_up_whatsapp_enabled,
      follow_up_sms_enabled,
      staff_schedule_email_enabled,
      staff_schedule_sms_enabled,
      created_at,
      updated_at
  `;
  const inserted = await pool.query(insertQuery, [
    organizationId,
    defaultPreferences.appointment_whatsapp_enabled,
    defaultPreferences.appointment_sms_enabled,
    defaultPreferences.follow_up_whatsapp_enabled,
    defaultPreferences.follow_up_sms_enabled,
    defaultPreferences.staff_schedule_email_enabled,
    defaultPreferences.staff_schedule_sms_enabled
  ]);
  return inserted.rows[0];
};

const updateNotificationPreferences = async (organizationId, payload) => {
  const current = await getNotificationPreferences(organizationId);
  const next = {
    appointment_whatsapp_enabled: payload.appointmentWhatsappEnabled ?? current.appointment_whatsapp_enabled,
    appointment_sms_enabled: payload.appointmentSmsEnabled ?? current.appointment_sms_enabled,
    follow_up_whatsapp_enabled: payload.followUpWhatsappEnabled ?? current.follow_up_whatsapp_enabled,
    follow_up_sms_enabled: payload.followUpSmsEnabled ?? current.follow_up_sms_enabled,
    staff_schedule_email_enabled: payload.staffScheduleEmailEnabled ?? current.staff_schedule_email_enabled,
    staff_schedule_sms_enabled: payload.staffScheduleSmsEnabled ?? current.staff_schedule_sms_enabled
  };

  const query = `
    UPDATE notification_preferences
    SET appointment_whatsapp_enabled = $2,
        appointment_sms_enabled = $3,
        follow_up_whatsapp_enabled = $4,
        follow_up_sms_enabled = $5,
        staff_schedule_email_enabled = $6,
        staff_schedule_sms_enabled = $7,
        updated_at = NOW()
    WHERE organization_id = $1
    RETURNING
      organization_id,
      appointment_whatsapp_enabled,
      appointment_sms_enabled,
      follow_up_whatsapp_enabled,
      follow_up_sms_enabled,
      staff_schedule_email_enabled,
      staff_schedule_sms_enabled,
      created_at,
      updated_at
  `;
  const { rows } = await pool.query(query, [
    organizationId,
    next.appointment_whatsapp_enabled,
    next.appointment_sms_enabled,
    next.follow_up_whatsapp_enabled,
    next.follow_up_sms_enabled,
    next.staff_schedule_email_enabled,
    next.staff_schedule_sms_enabled
  ]);
  return rows[0] || null;
};

const listNotificationLogs = async (organizationId, query = {}) => {
  const values = [organizationId];
  const conditions = ["organization_id = $1"];

  if (query.notificationType) {
    values.push(query.notificationType);
    conditions.push(`notification_type = $${values.length}`);
  }

  if (query.status) {
    values.push(query.status);
    conditions.push(`status = $${values.length}`);
  }

  if (query.channel) {
    values.push(query.channel);
    conditions.push(`channel = $${values.length}`);
  }

  const limit = Math.min(Number.parseInt(query.limit, 10) || 50, 200);
  values.push(limit);

  const sql = `
    SELECT
      id,
      organization_id,
      actor_user_id,
      notification_type,
      channel,
      status,
      reference_id,
      recipient,
      message_preview,
      error_message,
      metadata,
      created_at
    FROM notification_logs
    WHERE ${conditions.join(" AND ")}
    ORDER BY created_at DESC
    LIMIT $${values.length}
  `;

  const { rows } = await pool.query(sql, values);
  return rows;
};

const createNotificationLog = async ({
  organizationId,
  actorUserId = null,
  notificationType,
  channel,
  status,
  referenceId = null,
  recipient = null,
  messagePreview = null,
  errorMessage = null,
  metadata = {}
}) => {
  const query = `
    INSERT INTO notification_logs (
      organization_id,
      actor_user_id,
      notification_type,
      channel,
      status,
      reference_id,
      recipient,
      message_preview,
      error_message,
      metadata
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb)
    RETURNING
      id,
      organization_id,
      actor_user_id,
      notification_type,
      channel,
      status,
      reference_id,
      recipient,
      message_preview,
      error_message,
      metadata,
      created_at
  `;

  const { rows } = await pool.query(query, [
    organizationId,
    actorUserId,
    notificationType,
    channel,
    status,
    referenceId,
    recipient,
    messagePreview,
    errorMessage,
    JSON.stringify(metadata || {})
  ]);
  return rows[0];
};

module.exports = {
  getNotificationPreferences,
  updateNotificationPreferences,
  listNotificationLogs,
  createNotificationLog
};
