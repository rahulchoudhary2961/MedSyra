const pool = require("../config/db");

const defaultPreferences = {
  appointment_whatsapp_enabled: true,
  appointment_sms_enabled: false,
  follow_up_whatsapp_enabled: true,
  follow_up_sms_enabled: false,
  staff_schedule_email_enabled: true,
  staff_schedule_sms_enabled: false,
  smart_timing_enabled: true,
  appointment_lead_minutes: 120,
  follow_up_send_hour: 9,
  condition_based_follow_up_enabled: true,
  campaign_whatsapp_enabled: true,
  campaign_sms_enabled: false
};

const defaultTemplates = [
  {
    name: "Same-Day Appointment Reminder",
    notification_type: "appointment_reminder",
    channel: "whatsapp",
    template_key: "appointment_same_day",
    condition_tag: null,
    body:
      "Hello {{firstName}}, this is a reminder from {{clinicName}} for your appointment today at {{appointmentTime}} with {{doctorName}}. Please arrive 10 minutes early.",
    is_default: true
  },
  {
    name: "General Follow-up Reminder",
    notification_type: "follow_up_reminder",
    channel: "whatsapp",
    template_key: "follow_up_general",
    condition_tag: null,
    body:
      "Hello {{firstName}}, {{clinicName}} is checking in on your follow-up due {{followUpDate}}. Please plan your review visit with {{doctorName}}.",
    is_default: true
  },
  {
    name: "Diabetes Follow-up Reminder",
    notification_type: "follow_up_reminder",
    channel: "whatsapp",
    template_key: "follow_up_diabetes",
    condition_tag: "diabetes",
    body:
      "Hello {{firstName}}, your diabetes review at {{clinicName}} is due {{followUpDate}}. Please bring your recent sugar readings when you visit {{doctorName}}.",
    is_default: false
  },
  {
    name: "Dental Follow-up Reminder",
    notification_type: "follow_up_reminder",
    channel: "whatsapp",
    template_key: "follow_up_dental",
    condition_tag: "dental",
    body:
      "Hello {{firstName}}, your dental follow-up at {{clinicName}} is due {{followUpDate}}. Please visit {{doctorName}} to complete the treatment plan.",
    is_default: false
  },
  {
    name: "Free Checkup Camp",
    notification_type: "marketing_campaign",
    channel: "whatsapp",
    template_key: "free_checkup_camp",
    condition_tag: null,
    body:
      "Hello {{firstName}}, {{clinicName}} is running {{campaignName}}. Reply or call us to reserve your slot. {{campaignNote}}",
    is_default: true
  }
];

const slugifyTemplateKey = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60);

const resolveDefaultBranchId = async (organizationId) => {
  const { rows } = await pool.query(
    `
      SELECT id
      FROM branches
      WHERE organization_id = $1
        AND is_active = true
      ORDER BY is_default DESC, created_at ASC
      LIMIT 1
    `,
    [organizationId]
  );

  return rows[0]?.id || null;
};

const getOrganizationNotificationContext = async (organizationId) => {
  const { rows } = await pool.query(
    `
      SELECT o.name AS clinic_name, b.id AS default_branch_id
      FROM organizations o
      LEFT JOIN LATERAL (
        SELECT id
        FROM branches
        WHERE organization_id = o.id
          AND is_active = true
        ORDER BY is_default DESC, created_at ASC
        LIMIT 1
      ) b ON true
      WHERE o.id = $1
    `,
    [organizationId]
  );

  return rows[0] || { clinic_name: null, default_branch_id: null };
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
      smart_timing_enabled,
      appointment_lead_minutes,
      follow_up_send_hour,
      condition_based_follow_up_enabled,
      campaign_whatsapp_enabled,
      campaign_sms_enabled,
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
      staff_schedule_sms_enabled,
      smart_timing_enabled,
      appointment_lead_minutes,
      follow_up_send_hour,
      condition_based_follow_up_enabled,
      campaign_whatsapp_enabled,
      campaign_sms_enabled
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
    RETURNING
      organization_id,
      appointment_whatsapp_enabled,
      appointment_sms_enabled,
      follow_up_whatsapp_enabled,
      follow_up_sms_enabled,
      staff_schedule_email_enabled,
      staff_schedule_sms_enabled,
      smart_timing_enabled,
      appointment_lead_minutes,
      follow_up_send_hour,
      condition_based_follow_up_enabled,
      campaign_whatsapp_enabled,
      campaign_sms_enabled,
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
    defaultPreferences.staff_schedule_sms_enabled,
    defaultPreferences.smart_timing_enabled,
    defaultPreferences.appointment_lead_minutes,
    defaultPreferences.follow_up_send_hour,
    defaultPreferences.condition_based_follow_up_enabled,
    defaultPreferences.campaign_whatsapp_enabled,
    defaultPreferences.campaign_sms_enabled
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
    staff_schedule_sms_enabled: payload.staffScheduleSmsEnabled ?? current.staff_schedule_sms_enabled,
    smart_timing_enabled: payload.smartTimingEnabled ?? current.smart_timing_enabled,
    appointment_lead_minutes: payload.appointmentLeadMinutes ?? current.appointment_lead_minutes,
    follow_up_send_hour: payload.followUpSendHour ?? current.follow_up_send_hour,
    condition_based_follow_up_enabled:
      payload.conditionBasedFollowUpEnabled ?? current.condition_based_follow_up_enabled,
    campaign_whatsapp_enabled: payload.campaignWhatsappEnabled ?? current.campaign_whatsapp_enabled,
    campaign_sms_enabled: payload.campaignSmsEnabled ?? current.campaign_sms_enabled
  };

  const query = `
    UPDATE notification_preferences
    SET appointment_whatsapp_enabled = $2,
        appointment_sms_enabled = $3,
        follow_up_whatsapp_enabled = $4,
        follow_up_sms_enabled = $5,
        staff_schedule_email_enabled = $6,
        staff_schedule_sms_enabled = $7,
        smart_timing_enabled = $8,
        appointment_lead_minutes = $9,
        follow_up_send_hour = $10,
        condition_based_follow_up_enabled = $11,
        campaign_whatsapp_enabled = $12,
        campaign_sms_enabled = $13,
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
      smart_timing_enabled,
      appointment_lead_minutes,
      follow_up_send_hour,
      condition_based_follow_up_enabled,
      campaign_whatsapp_enabled,
      campaign_sms_enabled,
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
    next.staff_schedule_sms_enabled,
    next.smart_timing_enabled,
    next.appointment_lead_minutes,
    next.follow_up_send_hour,
    next.condition_based_follow_up_enabled,
    next.campaign_whatsapp_enabled,
    next.campaign_sms_enabled
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
      branch_id,
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
  branchId = null,
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
  const resolvedBranchId = branchId || (await resolveDefaultBranchId(organizationId));

  const query = `
    INSERT INTO notification_logs (
      organization_id,
      branch_id,
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
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb)
    RETURNING
      id,
      organization_id,
      branch_id,
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
    resolvedBranchId,
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

const ensureDefaultTemplates = async (organizationId) => {
  const countRes = await pool.query(
    "SELECT COUNT(*)::int AS total FROM notification_templates WHERE organization_id = $1",
    [organizationId]
  );

  if (Number(countRes.rows[0]?.total || 0) > 0) {
    return;
  }

  const values = [];
  const placeholders = [];

  defaultTemplates.forEach((template, index) => {
    const baseIndex = index * 8;
    values.push(
      organizationId,
      template.name,
      template.notification_type,
      template.channel,
      template.template_key,
      template.condition_tag,
      template.body,
      template.is_default
    );
    placeholders.push(
      `($${baseIndex + 1}, $${baseIndex + 2}, $${baseIndex + 3}, $${baseIndex + 4}, $${baseIndex + 5}, $${baseIndex + 6}, $${baseIndex + 7}, $${baseIndex + 8}, true)`
    );
  });

  await pool.query(
    `
      INSERT INTO notification_templates (
        organization_id,
        name,
        notification_type,
        channel,
        template_key,
        condition_tag,
        body,
        is_default,
        is_active
      )
      VALUES ${placeholders.join(", ")}
      ON CONFLICT (organization_id, notification_type, channel, template_key) DO NOTHING
    `,
    values
  );
};

const listNotificationTemplates = async (organizationId, query = {}) => {
  await ensureDefaultTemplates(organizationId);

  const values = [organizationId];
  const conditions = ["organization_id = $1"];

  if (query.notificationType) {
    values.push(query.notificationType);
    conditions.push(`notification_type = $${values.length}`);
  }

  if (query.channel) {
    values.push(query.channel);
    conditions.push(`channel = $${values.length}`);
  }

  const { rows } = await pool.query(
    `
      SELECT
        id,
        organization_id,
        name,
        notification_type,
        channel,
        template_key,
        condition_tag,
        body,
        is_default,
        is_active,
        created_at,
        updated_at
      FROM notification_templates
      WHERE ${conditions.join(" AND ")}
      ORDER BY notification_type ASC, channel ASC, is_default DESC, name ASC
    `,
    values
  );

  return rows;
};

const getNotificationTemplateById = async (organizationId, id) => {
  const { rows } = await pool.query(
    `
      SELECT
        id,
        organization_id,
        name,
        notification_type,
        channel,
        template_key,
        condition_tag,
        body,
        is_default,
        is_active,
        created_at,
        updated_at
      FROM notification_templates
      WHERE organization_id = $1
        AND id = $2
    `,
    [organizationId, id]
  );

  return rows[0] || null;
};

const createNotificationTemplate = async (organizationId, payload) => {
  const templateKey = slugifyTemplateKey(payload.templateKey || payload.name);

  const { rows } = await pool.query(
    `
      INSERT INTO notification_templates (
        organization_id,
        name,
        notification_type,
        channel,
        template_key,
        condition_tag,
        body,
        is_default,
        is_active
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, COALESCE($9, true))
      RETURNING
        id,
        organization_id,
        name,
        notification_type,
        channel,
        template_key,
        condition_tag,
        body,
        is_default,
        is_active,
        created_at,
        updated_at
    `,
    [
      organizationId,
      payload.name,
      payload.notificationType,
      payload.channel,
      templateKey,
      payload.conditionTag || null,
      payload.body,
      payload.isDefault === true,
      payload.isActive
    ]
  );

  return rows[0] || null;
};

const updateNotificationTemplate = async (organizationId, id, payload) => {
  const current = await getNotificationTemplateById(organizationId, id);
  if (!current) {
    return null;
  }

  const next = {
    name: payload.name ?? current.name,
    notification_type: payload.notificationType ?? current.notification_type,
    channel: payload.channel ?? current.channel,
    template_key: payload.templateKey ? slugifyTemplateKey(payload.templateKey) : current.template_key,
    condition_tag: payload.conditionTag !== undefined ? payload.conditionTag || null : current.condition_tag,
    body: payload.body ?? current.body,
    is_default: payload.isDefault ?? current.is_default,
    is_active: payload.isActive ?? current.is_active
  };

  const { rows } = await pool.query(
    `
      UPDATE notification_templates
      SET name = $3,
          notification_type = $4,
          channel = $5,
          template_key = $6,
          condition_tag = $7,
          body = $8,
          is_default = $9,
          is_active = $10,
          updated_at = NOW()
      WHERE organization_id = $1
        AND id = $2
      RETURNING
        id,
        organization_id,
        name,
        notification_type,
        channel,
        template_key,
        condition_tag,
        body,
        is_default,
        is_active,
        created_at,
        updated_at
    `,
    [
      organizationId,
      id,
      next.name,
      next.notification_type,
      next.channel,
      next.template_key,
      next.condition_tag,
      next.body,
      next.is_default,
      next.is_active
    ]
  );

  return rows[0] || null;
};

const listNotificationCampaigns = async (organizationId, query = {}) => {
  const limit = Math.min(Number.parseInt(query.limit, 10) || 25, 100);
  const { rows } = await pool.query(
    `
      SELECT
        nc.id,
        nc.organization_id,
        nc.branch_id,
        nc.name,
        nc.audience_type,
        nc.template_id,
        nt.name AS template_name,
        nt.channel AS template_channel,
        nc.channel_config,
        nc.scheduled_for,
        nc.status,
        nc.total_recipients,
        nc.successful_recipients,
        nc.failed_recipients,
        nc.notes,
        nc.last_sent_at,
        nc.created_at,
        nc.updated_at
      FROM notification_campaigns nc
      LEFT JOIN notification_templates nt
        ON nt.id = nc.template_id
       AND nt.organization_id = nc.organization_id
      WHERE nc.organization_id = $1
      ORDER BY COALESCE(nc.last_sent_at, nc.created_at) DESC
      LIMIT $2
    `,
    [organizationId, limit]
  );

  return rows.map((row) => ({
    ...row,
    channel_config: row.channel_config || { whatsapp: true, sms: false }
  }));
};

const getNotificationCampaignById = async (organizationId, id) => {
  const { rows } = await pool.query(
    `
      SELECT
        nc.id,
        nc.organization_id,
        nc.branch_id,
        nc.created_by_user_id,
        nc.name,
        nc.audience_type,
        nc.template_id,
        nt.name AS template_name,
        nt.channel AS template_channel,
        nt.body AS template_body,
        nc.channel_config,
        nc.scheduled_for,
        nc.status,
        nc.total_recipients,
        nc.successful_recipients,
        nc.failed_recipients,
        nc.notes,
        nc.last_sent_at,
        nc.created_at,
        nc.updated_at
      FROM notification_campaigns nc
      LEFT JOIN notification_templates nt
        ON nt.id = nc.template_id
       AND nt.organization_id = nc.organization_id
      WHERE nc.organization_id = $1
        AND nc.id = $2
    `,
    [organizationId, id]
  );

  if (!rows[0]) {
    return null;
  }

  return {
    ...rows[0],
    channel_config: rows[0].channel_config || { whatsapp: true, sms: false }
  };
};

const createNotificationCampaign = async (organizationId, payload) => {
  const resolvedBranchId =
    payload.branchId === undefined ? null : payload.branchId || (await resolveDefaultBranchId(organizationId));

  const { rows } = await pool.query(
    `
      INSERT INTO notification_campaigns (
        organization_id,
        branch_id,
        created_by_user_id,
        name,
        audience_type,
        template_id,
        channel_config,
        scheduled_for,
        status,
        notes
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, COALESCE($9, 'draft'), $10)
      RETURNING
        id,
        organization_id,
        branch_id,
        created_by_user_id,
        name,
        audience_type,
        template_id,
        channel_config,
        scheduled_for,
        status,
        total_recipients,
        successful_recipients,
        failed_recipients,
        notes,
        last_sent_at,
        created_at,
        updated_at
    `,
    [
      organizationId,
      resolvedBranchId,
      payload.createdByUserId || null,
      payload.name,
      payload.audienceType,
      payload.templateId,
      JSON.stringify(payload.channelConfig || { whatsapp: true, sms: false }),
      payload.scheduledFor || null,
      payload.status || "draft",
      payload.notes || null
    ]
  );

  return rows[0] || null;
};

const updateNotificationCampaignResult = async (
  organizationId,
  id,
  { status, totalRecipients, successfulRecipients, failedRecipients, lastSentAt }
) => {
  const { rows } = await pool.query(
    `
      UPDATE notification_campaigns
      SET status = COALESCE($3, status),
          total_recipients = COALESCE($4, total_recipients),
          successful_recipients = COALESCE($5, successful_recipients),
          failed_recipients = COALESCE($6, failed_recipients),
          last_sent_at = COALESCE($7, last_sent_at),
          updated_at = NOW()
      WHERE organization_id = $1
        AND id = $2
      RETURNING
        id,
        organization_id,
        branch_id,
        name,
        audience_type,
        template_id,
        channel_config,
        scheduled_for,
        status,
        total_recipients,
        successful_recipients,
        failed_recipients,
        notes,
        last_sent_at,
        created_at,
        updated_at
    `,
    [organizationId, id, status, totalRecipients, successfulRecipients, failedRecipients, lastSentAt]
  );

  return rows[0] || null;
};

const listCampaignAudiencePatients = async (organizationId, audienceType, branchId = null) => {
  const values = [organizationId];
  const branchFilter = branchId
    ? `AND EXISTS (
         SELECT 1
         FROM appointments scoped_a
         WHERE scoped_a.organization_id = p.organization_id
           AND scoped_a.patient_id = p.id
           AND scoped_a.branch_id = $2::uuid
       )`
    : "";

  if (branchId) {
    values.push(branchId);
  }

  let audienceCondition = "";

  if (audienceType === "dormant_30") {
    audienceCondition = "AND p.last_visit_at IS NOT NULL AND p.last_visit_at < CURRENT_DATE - INTERVAL '30 days'";
  } else if (audienceType === "dormant_60") {
    audienceCondition = "AND p.last_visit_at IS NOT NULL AND p.last_visit_at < CURRENT_DATE - INTERVAL '60 days'";
  } else if (audienceType === "follow_up_due") {
    audienceCondition = `
      AND EXISTS (
        SELECT 1
        FROM medical_records mr
        WHERE mr.organization_id = p.organization_id
          AND mr.patient_id = p.id
          ${branchId ? "AND mr.branch_id = $2::uuid" : ""}
          AND mr.follow_up_date IS NOT NULL
          AND mr.follow_up_date <= CURRENT_DATE
          AND COALESCE(mr.follow_up_reminder_status, 'pending') <> 'disabled'
      )
    `;
  } else if (audienceType === "chronic") {
    audienceCondition = `
      AND EXISTS (
        SELECT 1
        FROM medical_records mr
        WHERE mr.organization_id = p.organization_id
          AND mr.patient_id = p.id
          ${branchId ? "AND mr.branch_id = $2::uuid" : ""}
          AND mr.record_date >= CURRENT_DATE - INTERVAL '12 months'
          AND (
            LOWER(COALESCE(mr.diagnosis, '')) ~ '(diabet|hypertension|asthma|thyroid|arthritis|cardiac|kidney|copd)'
            OR LOWER(COALESCE(mr.record_type, '')) LIKE '%chronic%'
          )
      )
    `;
  }

  const { rows } = await pool.query(
    `
      SELECT
        p.id,
        p.patient_code,
        p.full_name,
        p.phone,
        p.last_visit_at::text AS last_visit_at,
        latest_record.diagnosis AS latest_diagnosis
      FROM patients p
      LEFT JOIN LATERAL (
        SELECT mr.diagnosis
        FROM medical_records mr
        WHERE mr.organization_id = p.organization_id
          AND mr.patient_id = p.id
          ${branchId ? "AND mr.branch_id = $2::uuid" : ""}
          AND mr.diagnosis IS NOT NULL
          AND BTRIM(mr.diagnosis) <> ''
        ORDER BY mr.record_date DESC, mr.created_at DESC
        LIMIT 1
      ) latest_record ON true
      WHERE p.organization_id = $1
        AND p.is_active = true
        AND p.phone IS NOT NULL
        AND BTRIM(p.phone) <> ''
        ${branchFilter}
        ${audienceCondition}
      ORDER BY COALESCE(p.last_visit_at, CURRENT_DATE) ASC, p.full_name ASC
      LIMIT 300
    `,
    values
  );

  return rows;
};

module.exports = {
  getNotificationPreferences,
  updateNotificationPreferences,
  listNotificationLogs,
  createNotificationLog,
  getOrganizationNotificationContext,
  listNotificationTemplates,
  getNotificationTemplateById,
  createNotificationTemplate,
  updateNotificationTemplate,
  listNotificationCampaigns,
  getNotificationCampaignById,
  createNotificationCampaign,
  updateNotificationCampaignResult,
  listCampaignAudiencePatients
};
