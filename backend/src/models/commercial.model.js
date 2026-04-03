const pool = require("../config/db");

const runQuery = (executor, text, values = []) => executor.query(text, values);

const runInTransaction = async (callback) => {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    const result = await callback(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

const getPricingConfig = async (executor, organizationId) => {
  const { rows } = await runQuery(
    executor,
    `
      SELECT
        id,
        organization_id,
        plan_tier,
        base_plan_price,
        monthly_included_credits,
        topup_price,
        topup_credit_amount,
        ai_credits_per_query,
        message_credits_per_unit,
        default_ai_cost_per_query,
        default_message_cost_per_unit,
        created_at,
        updated_at
      FROM organization_pricing_config
      WHERE organization_id = $1
      LIMIT 1
    `,
    [organizationId]
  );

  return rows[0] || null;
};

const createPricingConfig = async (executor, organizationId, payload) => {
  const { rows } = await runQuery(
    executor,
    `
      INSERT INTO organization_pricing_config (
        organization_id,
        plan_tier,
        base_plan_price,
        monthly_included_credits,
        topup_price,
        topup_credit_amount,
        ai_credits_per_query,
        message_credits_per_unit,
        default_ai_cost_per_query,
        default_message_cost_per_unit
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
      RETURNING
        id,
        organization_id,
        plan_tier,
        base_plan_price,
        monthly_included_credits,
        topup_price,
        topup_credit_amount,
        ai_credits_per_query,
        message_credits_per_unit,
        default_ai_cost_per_query,
        default_message_cost_per_unit,
        created_at,
        updated_at
    `,
    [
      organizationId,
      payload.planTier,
      payload.basePlanPrice,
      payload.monthlyIncludedCredits,
      payload.topupPrice,
      payload.topupCreditAmount,
      payload.aiCreditsPerQuery,
      payload.messageCreditsPerUnit,
      payload.defaultAiCostPerQuery,
      payload.defaultMessageCostPerUnit
    ]
  );

  return rows[0];
};

const updatePricingConfig = async (executor, organizationId, payload) => {
  const columnMap = {
    planTier: "plan_tier",
    basePlanPrice: "base_plan_price",
    monthlyIncludedCredits: "monthly_included_credits",
    topupPrice: "topup_price",
    topupCreditAmount: "topup_credit_amount",
    aiCreditsPerQuery: "ai_credits_per_query",
    messageCreditsPerUnit: "message_credits_per_unit",
    defaultAiCostPerQuery: "default_ai_cost_per_query",
    defaultMessageCostPerUnit: "default_message_cost_per_unit"
  };

  const entries = Object.entries(payload)
    .filter(([key, value]) => columnMap[key] && value !== undefined)
    .map(([key, value]) => [columnMap[key], value]);

  if (entries.length === 0) {
    return getPricingConfig(executor, organizationId);
  }

  const values = [organizationId];
  const setClauses = entries.map(([column, value], index) => {
    values.push(value);
    return `${column} = $${index + 2}`;
  });

  const { rows } = await runQuery(
    executor,
    `
      UPDATE organization_pricing_config
      SET ${setClauses.join(", ")}, updated_at = NOW()
      WHERE organization_id = $1
      RETURNING
        id,
        organization_id,
        plan_tier,
        base_plan_price,
        monthly_included_credits,
        topup_price,
        topup_credit_amount,
        ai_credits_per_query,
        message_credits_per_unit,
        default_ai_cost_per_query,
        default_message_cost_per_unit,
        created_at,
        updated_at
    `,
    values
  );

  return rows[0] || null;
};

const getWallet = async (executor, organizationId, options = {}) => {
  const { rows } = await runQuery(
    executor,
    `
      SELECT
        id,
        organization_id,
        current_balance,
        monthly_included_credits,
        low_balance_threshold,
        last_reset_at,
        created_at,
        updated_at
      FROM organization_credit_wallets
      WHERE organization_id = $1
      ${options.forUpdate ? "FOR UPDATE" : ""}
      LIMIT 1
    `,
    [organizationId]
  );

  return rows[0] || null;
};

const createWallet = async (executor, organizationId, payload) => {
  const { rows } = await runQuery(
    executor,
    `
      INSERT INTO organization_credit_wallets (
        organization_id,
        current_balance,
        monthly_included_credits,
        low_balance_threshold,
        last_reset_at
      )
      VALUES ($1,$2,$3,$4,$5)
      RETURNING
        id,
        organization_id,
        current_balance,
        monthly_included_credits,
        low_balance_threshold,
        last_reset_at,
        created_at,
        updated_at
    `,
    [
      organizationId,
      payload.currentBalance ?? 0,
      payload.monthlyIncludedCredits,
      payload.lowBalanceThreshold,
      payload.lastResetAt || null
    ]
  );

  return rows[0];
};

const updateWallet = async (executor, organizationId, payload) => {
  const columnMap = {
    currentBalance: "current_balance",
    monthlyIncludedCredits: "monthly_included_credits",
    lowBalanceThreshold: "low_balance_threshold",
    lastResetAt: "last_reset_at"
  };

  const entries = Object.entries(payload)
    .filter(([key, value]) => columnMap[key] && value !== undefined)
    .map(([key, value]) => [columnMap[key], value]);

  if (entries.length === 0) {
    return getWallet(executor, organizationId, { forUpdate: true });
  }

  const values = [organizationId];
  const setClauses = entries.map(([column, value], index) => {
    values.push(value);
    return `${column} = $${index + 2}`;
  });

  const { rows } = await runQuery(
    executor,
    `
      UPDATE organization_credit_wallets
      SET ${setClauses.join(", ")}, updated_at = NOW()
      WHERE organization_id = $1
      RETURNING
        id,
        organization_id,
        current_balance,
        monthly_included_credits,
        low_balance_threshold,
        last_reset_at,
        created_at,
        updated_at
    `,
    values
  );

  return rows[0] || null;
};

const adjustWalletBalance = async (
  executor,
  organizationId,
  { balanceDelta = 0, monthlyIncludedCredits, lowBalanceThreshold, lastResetAt }
) => {
  const values = [organizationId, balanceDelta];
  const clauses = ["current_balance = current_balance + $2"];

  if (monthlyIncludedCredits !== undefined) {
    values.push(monthlyIncludedCredits);
    clauses.push(`monthly_included_credits = $${values.length}`);
  }

  if (lowBalanceThreshold !== undefined) {
    values.push(lowBalanceThreshold);
    clauses.push(`low_balance_threshold = $${values.length}`);
  }

  if (lastResetAt !== undefined) {
    values.push(lastResetAt);
    clauses.push(`last_reset_at = $${values.length}`);
  }

  const { rows } = await runQuery(
    executor,
    `
      UPDATE organization_credit_wallets
      SET ${clauses.join(", ")}, updated_at = NOW()
      WHERE organization_id = $1
      RETURNING
        id,
        organization_id,
        current_balance,
        monthly_included_credits,
        low_balance_threshold,
        last_reset_at,
        created_at,
        updated_at
    `,
    values
  );

  return rows[0] || null;
};

const getUsageMonthly = async (executor, organizationId, usageMonth) => {
  const { rows } = await runQuery(
    executor,
    `
      SELECT
        id,
        organization_id,
        usage_month,
        ai_queries_used,
        ai_cost_per_query,
        ai_cost_total,
        messages_used,
        message_cost_per_unit,
        message_cost_total,
        credits_consumed,
        included_credits_granted,
        topup_credits_purchased,
        topup_revenue,
        infra_cost_share,
        base_plan_revenue,
        total_revenue,
        total_cost,
        profit_amount,
        created_at,
        updated_at
      FROM organization_usage_monthly
      WHERE organization_id = $1 AND usage_month = $2
      LIMIT 1
    `,
    [organizationId, usageMonth]
  );

  return rows[0] || null;
};

const ensureUsageMonthly = async (executor, organizationId, usageMonth) => {
  await runQuery(
    executor,
    `
      INSERT INTO organization_usage_monthly (organization_id, usage_month)
      VALUES ($1, $2)
      ON CONFLICT (organization_id, usage_month) DO NOTHING
    `,
    [organizationId, usageMonth]
  );

  return getUsageMonthly(executor, organizationId, usageMonth);
};

const incrementUsageMonthly = async (executor, organizationId, usageMonth, payload = {}) => {
  const delta = {
    aiQueriesUsed: payload.aiQueriesUsed || 0,
    aiCostPerQuery: payload.aiCostPerQuery || 0,
    aiCostTotal: payload.aiCostTotal || 0,
    messagesUsed: payload.messagesUsed || 0,
    messageCostPerUnit: payload.messageCostPerUnit || 0,
    messageCostTotal: payload.messageCostTotal || 0,
    creditsConsumed: payload.creditsConsumed || 0,
    includedCreditsGranted: payload.includedCreditsGranted || 0,
    topupCreditsPurchased: payload.topupCreditsPurchased || 0,
    topupRevenue: payload.topupRevenue || 0
  };

  const { rows } = await runQuery(
    executor,
    `
      INSERT INTO organization_usage_monthly (
        organization_id,
        usage_month,
        ai_queries_used,
        ai_cost_per_query,
        ai_cost_total,
        messages_used,
        message_cost_per_unit,
        message_cost_total,
        credits_consumed,
        included_credits_granted,
        topup_credits_purchased,
        topup_revenue
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
      ON CONFLICT (organization_id, usage_month)
      DO UPDATE SET
        ai_queries_used = organization_usage_monthly.ai_queries_used + EXCLUDED.ai_queries_used,
        ai_cost_per_query = CASE
          WHEN EXCLUDED.ai_cost_per_query > 0 THEN EXCLUDED.ai_cost_per_query
          ELSE organization_usage_monthly.ai_cost_per_query
        END,
        ai_cost_total = organization_usage_monthly.ai_cost_total + EXCLUDED.ai_cost_total,
        messages_used = organization_usage_monthly.messages_used + EXCLUDED.messages_used,
        message_cost_per_unit = CASE
          WHEN EXCLUDED.message_cost_per_unit > 0 THEN EXCLUDED.message_cost_per_unit
          ELSE organization_usage_monthly.message_cost_per_unit
        END,
        message_cost_total = organization_usage_monthly.message_cost_total + EXCLUDED.message_cost_total,
        credits_consumed = organization_usage_monthly.credits_consumed + EXCLUDED.credits_consumed,
        included_credits_granted = organization_usage_monthly.included_credits_granted + EXCLUDED.included_credits_granted,
        topup_credits_purchased = organization_usage_monthly.topup_credits_purchased + EXCLUDED.topup_credits_purchased,
        topup_revenue = organization_usage_monthly.topup_revenue + EXCLUDED.topup_revenue,
        updated_at = NOW()
      RETURNING
        id,
        organization_id,
        usage_month,
        ai_queries_used,
        ai_cost_per_query,
        ai_cost_total,
        messages_used,
        message_cost_per_unit,
        message_cost_total,
        credits_consumed,
        included_credits_granted,
        topup_credits_purchased,
        topup_revenue,
        infra_cost_share,
        base_plan_revenue,
        total_revenue,
        total_cost,
        profit_amount,
        created_at,
        updated_at
    `,
    [
      organizationId,
      usageMonth,
      delta.aiQueriesUsed,
      delta.aiCostPerQuery,
      delta.aiCostTotal,
      delta.messagesUsed,
      delta.messageCostPerUnit,
      delta.messageCostTotal,
      delta.creditsConsumed,
      delta.includedCreditsGranted,
      delta.topupCreditsPurchased,
      delta.topupRevenue
    ]
  );

  return rows[0];
};

const recalculateUsageMonthly = async (executor, usageMonth, organizationId = null) => {
  const values = [usageMonth];
  const organizationClause = organizationId ? "AND oum.organization_id = $2" : "";

  if (organizationId) {
    values.push(organizationId);
  }

  await runQuery(
    executor,
    `
      WITH org_counts AS (
        SELECT COUNT(*)::int AS total FROM organizations
      ),
      infra AS (
        SELECT
          COALESCE(pim.total_infra_cost, 0)::numeric(12,2) AS total_infra_cost,
          COALESCE(NULLIF(pim.active_clinics, 0), org_counts.total)::int AS active_clinics
        FROM org_counts
        LEFT JOIN platform_infra_monthly pim
          ON pim.usage_month = $1
      )
      UPDATE organization_usage_monthly oum
      SET
        infra_cost_share = CASE
          WHEN infra.active_clinics > 0 THEN ROUND(infra.total_infra_cost / infra.active_clinics, 2)
          ELSE 0
        END,
        base_plan_revenue = opc.base_plan_price,
        total_revenue = opc.base_plan_price + oum.topup_revenue,
        total_cost = oum.ai_cost_total + oum.message_cost_total + CASE
          WHEN infra.active_clinics > 0 THEN ROUND(infra.total_infra_cost / infra.active_clinics, 2)
          ELSE 0
        END,
        profit_amount = (opc.base_plan_price + oum.topup_revenue) - (
          oum.ai_cost_total + oum.message_cost_total + CASE
            WHEN infra.active_clinics > 0 THEN ROUND(infra.total_infra_cost / infra.active_clinics, 2)
            ELSE 0
          END
        ),
        updated_at = NOW()
      FROM organization_pricing_config opc
      CROSS JOIN infra
      WHERE oum.organization_id = opc.organization_id
        AND oum.usage_month = $1
        ${organizationClause}
    `,
    values
  );

  if (organizationId) {
    return getUsageMonthly(executor, organizationId, usageMonth);
  }

  return null;
};

const insertCreditTransaction = async (executor, payload) => {
  const { rows } = await runQuery(
    executor,
    `
      INSERT INTO credit_transactions (
        organization_id,
        actor_user_id,
        transaction_type,
        credits_delta,
        rupee_amount,
        source_feature,
        reference_id,
        note
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
      RETURNING
        id,
        organization_id,
        actor_user_id,
        transaction_type,
        credits_delta,
        rupee_amount,
        source_feature,
        reference_id,
        note,
        created_at
    `,
    [
      payload.organizationId,
      payload.actorUserId || null,
      payload.transactionType,
      payload.creditsDelta,
      payload.rupeeAmount || 0,
      payload.sourceFeature || null,
      payload.referenceId || null,
      payload.note || null
    ]
  );

  return rows[0];
};

const listCreditTransactions = async (organizationId, limit = 12) => {
  const { rows } = await pool.query(
    `
      SELECT
        ct.id,
        ct.transaction_type,
        ct.credits_delta,
        ct.rupee_amount,
        ct.source_feature,
        ct.reference_id,
        ct.note,
        ct.created_at,
        u.full_name AS actor_name
      FROM credit_transactions ct
      LEFT JOIN users u
        ON u.id = ct.actor_user_id
      WHERE ct.organization_id = $1
      ORDER BY ct.created_at DESC
      LIMIT $2
    `,
    [organizationId, limit]
  );

  return rows;
};

const getPlatformInfraMonthly = async (executor, usageMonth) => {
  const { rows } = await runQuery(
    executor,
    `
      SELECT
        id,
        usage_month,
        total_infra_cost,
        active_clinics,
        infra_cost_per_clinic,
        notes,
        created_at,
        updated_at
      FROM platform_infra_monthly
      WHERE usage_month = $1
      LIMIT 1
    `,
    [usageMonth]
  );

  return rows[0] || null;
};

const countOrganizations = async (executor) => {
  const { rows } = await runQuery(
    executor,
    `SELECT COUNT(*)::int AS total FROM organizations`
  );

  return Number(rows[0]?.total || 0);
};

const upsertPlatformInfraMonthly = async (executor, payload) => {
  const { rows } = await runQuery(
    executor,
    `
      INSERT INTO platform_infra_monthly (
        usage_month,
        total_infra_cost,
        active_clinics,
        infra_cost_per_clinic,
        notes
      )
      VALUES ($1,$2,$3,$4,$5)
      ON CONFLICT (usage_month)
      DO UPDATE SET
        total_infra_cost = EXCLUDED.total_infra_cost,
        active_clinics = EXCLUDED.active_clinics,
        infra_cost_per_clinic = EXCLUDED.infra_cost_per_clinic,
        notes = EXCLUDED.notes,
        updated_at = NOW()
      RETURNING
        id,
        usage_month,
        total_infra_cost,
        active_clinics,
        infra_cost_per_clinic,
        notes,
        created_at,
        updated_at
    `,
    [
      payload.usageMonth,
      payload.totalInfraCost,
      payload.activeClinics,
      payload.infraCostPerClinic,
      payload.notes || null
    ]
  );

  return rows[0];
};

module.exports = {
  runInTransaction,
  getPricingConfig,
  createPricingConfig,
  updatePricingConfig,
  getWallet,
  createWallet,
  updateWallet,
  adjustWalletBalance,
  getUsageMonthly,
  ensureUsageMonthly,
  incrementUsageMonthly,
  recalculateUsageMonthly,
  insertCreditTransaction,
  listCreditTransactions,
  getPlatformInfraMonthly,
  countOrganizations,
  upsertPlatformInfraMonthly
};
