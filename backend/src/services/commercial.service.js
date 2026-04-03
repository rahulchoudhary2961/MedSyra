const ApiError = require("../utils/api-error");
const commercialModel = require("../models/commercial.model");

const DEFAULT_LOW_BALANCE_THRESHOLD = 20;
const CREDIT_TRANSACTION_LIMIT = 12;
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const PLAN_DEFAULTS = {
  starter: {
    planTier: "starter",
    basePlanPrice: 799,
    monthlyIncludedCredits: 100,
    topupPrice: 199,
    topupCreditAmount: 200,
    aiCreditsPerQuery: 1,
    messageCreditsPerUnit: 1,
    defaultAiCostPerQuery: 1,
    defaultMessageCostPerUnit: 1
  },
  growth: {
    planTier: "growth",
    basePlanPrice: 1499,
    monthlyIncludedCredits: 400,
    topupPrice: 199,
    topupCreditAmount: 200,
    aiCreditsPerQuery: 1,
    messageCreditsPerUnit: 1,
    defaultAiCostPerQuery: 1,
    defaultMessageCostPerUnit: 1
  },
  enterprise: {
    planTier: "enterprise",
    basePlanPrice: 2999,
    monthlyIncludedCredits: 1000,
    topupPrice: 499,
    topupCreditAmount: 500,
    aiCreditsPerQuery: 1,
    messageCreditsPerUnit: 1,
    defaultAiCostPerQuery: 1,
    defaultMessageCostPerUnit: 1
  }
};

const getUsageMonthStart = (date = new Date()) => `${date.toISOString().slice(0, 7)}-01`;
const getMonthKey = (value) => String(value || "").slice(0, 7);

const isSameUsageMonth = (left, right) =>
  Boolean(left) && Boolean(right) && getMonthKey(left) === getMonthKey(right);

const normalizeMoney = (value, fallback = 0) => Number(value ?? fallback);
const normalizeInteger = (value, fallback = 0) => Number.parseInt(value ?? fallback, 10) || fallback;
const normalizeReferenceId = (value) => (UUID_REGEX.test(String(value || "")) ? String(value) : null);

const mapPricing = (row) => ({
  planTier: row.plan_tier,
  basePlanPrice: normalizeMoney(row.base_plan_price),
  monthlyIncludedCredits: normalizeInteger(row.monthly_included_credits),
  topupPrice: normalizeMoney(row.topup_price),
  topupCreditAmount: normalizeInteger(row.topup_credit_amount),
  aiCreditsPerQuery: normalizeInteger(row.ai_credits_per_query),
  messageCreditsPerUnit: normalizeInteger(row.message_credits_per_unit),
  defaultAiCostPerQuery: normalizeMoney(row.default_ai_cost_per_query),
  defaultMessageCostPerUnit: normalizeMoney(row.default_message_cost_per_unit)
});

const mapWallet = (row) => ({
  currentBalance: normalizeInteger(row.current_balance),
  monthlyIncludedCredits: normalizeInteger(row.monthly_included_credits),
  lowBalanceThreshold: normalizeInteger(row.low_balance_threshold),
  lastResetAt: row.last_reset_at || null
});

const mapUsage = (row) => ({
  usageMonth: row.usage_month,
  aiQueriesUsed: normalizeInteger(row.ai_queries_used),
  aiCostPerQuery: normalizeMoney(row.ai_cost_per_query),
  aiCostTotal: normalizeMoney(row.ai_cost_total),
  messagesUsed: normalizeInteger(row.messages_used),
  messageCostPerUnit: normalizeMoney(row.message_cost_per_unit),
  messageCostTotal: normalizeMoney(row.message_cost_total),
  creditsConsumed: normalizeInteger(row.credits_consumed),
  includedCreditsGranted: normalizeInteger(row.included_credits_granted),
  topupCreditsPurchased: normalizeInteger(row.topup_credits_purchased),
  topupRevenue: normalizeMoney(row.topup_revenue),
  infraCostShare: normalizeMoney(row.infra_cost_share),
  basePlanRevenue: normalizeMoney(row.base_plan_revenue),
  totalRevenue: normalizeMoney(row.total_revenue),
  totalCost: normalizeMoney(row.total_cost),
  profitAmount: normalizeMoney(row.profit_amount)
});

const mapPlatformInfra = (row) => ({
  usageMonth: row.usage_month,
  totalInfraCost: normalizeMoney(row.total_infra_cost),
  activeClinics: normalizeInteger(row.active_clinics),
  infraCostPerClinic: normalizeMoney(row.infra_cost_per_clinic),
  notes: row.notes || ""
});

const mapTransaction = (row) => ({
  id: row.id,
  transactionType: row.transaction_type,
  creditsDelta: normalizeInteger(row.credits_delta),
  rupeeAmount: normalizeMoney(row.rupee_amount),
  sourceFeature: row.source_feature || null,
  referenceId: row.reference_id || null,
  note: row.note || null,
  actorName: row.actor_name || null,
  createdAt: row.created_at
});

const getPlanDefaults = (planTier) => PLAN_DEFAULTS[planTier] || PLAN_DEFAULTS.starter;

const buildPricingConfig = (currentPricing, payload = {}) => {
  const currentPlanTier = currentPricing?.plan_tier || PLAN_DEFAULTS.starter.planTier;
  const nextPlanTier = payload.planTier || currentPlanTier;
  const defaults = getPlanDefaults(nextPlanTier);

  return {
    planTier: nextPlanTier,
    basePlanPrice:
      payload.basePlanPrice ?? (payload.planTier ? defaults.basePlanPrice : normalizeMoney(currentPricing?.base_plan_price, defaults.basePlanPrice)),
    monthlyIncludedCredits:
      payload.monthlyIncludedCredits ??
      (payload.planTier
        ? defaults.monthlyIncludedCredits
        : normalizeInteger(currentPricing?.monthly_included_credits, defaults.monthlyIncludedCredits)),
    topupPrice:
      payload.topupPrice ?? (payload.planTier ? defaults.topupPrice : normalizeMoney(currentPricing?.topup_price, defaults.topupPrice)),
    topupCreditAmount:
      payload.topupCreditAmount ??
      (payload.planTier
        ? defaults.topupCreditAmount
        : normalizeInteger(currentPricing?.topup_credit_amount, defaults.topupCreditAmount)),
    aiCreditsPerQuery:
      payload.aiCreditsPerQuery ??
      (payload.planTier
        ? defaults.aiCreditsPerQuery
        : normalizeInteger(currentPricing?.ai_credits_per_query, defaults.aiCreditsPerQuery)),
    messageCreditsPerUnit:
      payload.messageCreditsPerUnit ??
      (payload.planTier
        ? defaults.messageCreditsPerUnit
        : normalizeInteger(currentPricing?.message_credits_per_unit, defaults.messageCreditsPerUnit)),
    defaultAiCostPerQuery:
      payload.defaultAiCostPerQuery ??
      (payload.planTier
        ? defaults.defaultAiCostPerQuery
        : normalizeMoney(currentPricing?.default_ai_cost_per_query, defaults.defaultAiCostPerQuery)),
    defaultMessageCostPerUnit:
      payload.defaultMessageCostPerUnit ??
      (payload.planTier
        ? defaults.defaultMessageCostPerUnit
        : normalizeMoney(currentPricing?.default_message_cost_per_unit, defaults.defaultMessageCostPerUnit))
  };
};

const getUsageMetrics = (pricing, payload = {}) => {
  const aiQueriesUsed = normalizeInteger(payload.aiQueriesUsed, 0);
  const messagesUsed = normalizeInteger(payload.messagesUsed, 0);
  const aiCreditsPerQuery = normalizeInteger(pricing.ai_credits_per_query, 0);
  const messageCreditsPerUnit = normalizeInteger(pricing.message_credits_per_unit, 0);
  const aiCostPerQuery = normalizeMoney(pricing.default_ai_cost_per_query, 0);
  const messageCostPerUnit = normalizeMoney(pricing.default_message_cost_per_unit, 0);

  return {
    aiQueriesUsed,
    messagesUsed,
    aiCostPerQuery,
    messageCostPerUnit,
    aiCostTotal: Number((aiQueriesUsed * aiCostPerQuery).toFixed(2)),
    messageCostTotal: Number((messagesUsed * messageCostPerUnit).toFixed(2)),
    creditsConsumed: aiQueriesUsed * aiCreditsPerQuery + messagesUsed * messageCreditsPerUnit
  };
};

const ensureCommercialRowsInTransaction = async (executor, organizationId) => {
  let pricing = await commercialModel.getPricingConfig(executor, organizationId);

  if (!pricing) {
    pricing = await commercialModel.createPricingConfig(executor, organizationId, PLAN_DEFAULTS.starter);
  }

  let wallet = await commercialModel.getWallet(executor, organizationId, { forUpdate: true });

  if (!wallet) {
    wallet = await commercialModel.createWallet(executor, organizationId, {
      currentBalance: 0,
      monthlyIncludedCredits: normalizeInteger(pricing.monthly_included_credits, PLAN_DEFAULTS.starter.monthlyIncludedCredits),
      lowBalanceThreshold: DEFAULT_LOW_BALANCE_THRESHOLD,
      lastResetAt: null
    });
  }

  if (normalizeInteger(wallet.monthly_included_credits) !== normalizeInteger(pricing.monthly_included_credits)) {
    wallet = await commercialModel.updateWallet(executor, organizationId, {
      monthlyIncludedCredits: normalizeInteger(pricing.monthly_included_credits)
    });
  }

  return { pricing, wallet };
};

const applyMonthlyGrantIfNeeded = async (executor, organizationId, pricing, wallet, usageMonth) => {
  if (isSameUsageMonth(wallet.last_reset_at, usageMonth)) {
    return wallet;
  }

  const monthlyIncludedCredits = normalizeInteger(pricing.monthly_included_credits);
  const nextWallet = await commercialModel.adjustWalletBalance(executor, organizationId, {
    balanceDelta: monthlyIncludedCredits,
    monthlyIncludedCredits,
    lastResetAt: usageMonth
  });

  if (monthlyIncludedCredits > 0) {
    await commercialModel.insertCreditTransaction(executor, {
      organizationId,
      transactionType: "monthly_grant",
      creditsDelta: monthlyIncludedCredits,
      rupeeAmount: 0,
      sourceFeature: "monthly_subscription",
      note: `Monthly included credits granted for ${usageMonth}`
    });

    await commercialModel.incrementUsageMonthly(executor, organizationId, usageMonth, {
      includedCreditsGranted: monthlyIncludedCredits
    });
  } else {
    await commercialModel.ensureUsageMonthly(executor, organizationId, usageMonth);
  }

  return nextWallet;
};

const getPlatformInfraSnapshot = async (executor, usageMonth) => {
  const platformInfra = await commercialModel.getPlatformInfraMonthly(executor, usageMonth);

  if (platformInfra) {
    return platformInfra;
  }

  const activeClinics = await commercialModel.countOrganizations(executor);

  return {
    usage_month: usageMonth,
    total_infra_cost: 0,
    active_clinics: activeClinics,
    infra_cost_per_clinic: 0,
    notes: ""
  };
};

const ensureCommercialStateInTransaction = async (executor, organizationId, usageMonth = getUsageMonthStart()) => {
  const { pricing, wallet } = await ensureCommercialRowsInTransaction(executor, organizationId);
  await commercialModel.ensureUsageMonthly(executor, organizationId, usageMonth);
  const grantedWallet = await applyMonthlyGrantIfNeeded(executor, organizationId, pricing, wallet, usageMonth);
  const usage = await commercialModel.recalculateUsageMonthly(executor, usageMonth, organizationId);
  const platformInfra = await getPlatformInfraSnapshot(executor, usageMonth);

  return {
    pricing,
    wallet: grantedWallet,
    usage,
    platformInfra
  };
};

const ensureCommercialState = async (organizationId, usageMonth = getUsageMonthStart()) =>
  commercialModel.runInTransaction((executor) => ensureCommercialStateInTransaction(executor, organizationId, usageMonth));

const buildOverview = async (organizationId, usageMonth = getUsageMonthStart()) => {
  const state = await ensureCommercialState(organizationId, usageMonth);
  const transactions = await commercialModel.listCreditTransactions(organizationId, CREDIT_TRANSACTION_LIMIT);
  const wallet = mapWallet(state.wallet);

  return {
    pricing: mapPricing(state.pricing),
    wallet: {
      ...wallet,
      isLowBalance: wallet.currentBalance <= wallet.lowBalanceThreshold
    },
    usage: mapUsage(state.usage),
    platformInfra: mapPlatformInfra(state.platformInfra),
    transactions: transactions.map(mapTransaction)
  };
};

const getCommercialOverview = async (organizationId) => buildOverview(organizationId);

const ensureUsageAllowed = async (organizationId, payload = {}) => {
  const state = await ensureCommercialState(organizationId);
  const wallet = mapWallet(state.wallet);
  const usage = getUsageMetrics(state.pricing, payload);

  if (usage.creditsConsumed > wallet.currentBalance) {
    throw new ApiError(402, "Not enough credits for this action", {
      currentBalance: wallet.currentBalance,
      requiredCredits: usage.creditsConsumed,
      lowBalanceThreshold: wallet.lowBalanceThreshold
    });
  }

  return {
    currentBalance: wallet.currentBalance,
    requiredCredits: usage.creditsConsumed,
    remainingBalance: wallet.currentBalance - usage.creditsConsumed
  };
};

const recordUsage = async (organizationId, payload = {}) =>
  commercialModel.runInTransaction(async (executor) => {
    const usageMonth = getUsageMonthStart();
    const state = await ensureCommercialStateInTransaction(executor, organizationId, usageMonth);
    const usage = getUsageMetrics(state.pricing, payload);
    const currentBalance = normalizeInteger(state.wallet.current_balance);

    if (usage.creditsConsumed > currentBalance) {
      throw new ApiError(402, "Not enough credits for this action", {
        currentBalance,
        requiredCredits: usage.creditsConsumed,
        lowBalanceThreshold: normalizeInteger(state.wallet.low_balance_threshold)
      });
    }

    let wallet = state.wallet;

    if (usage.creditsConsumed > 0) {
      wallet = await commercialModel.adjustWalletBalance(executor, organizationId, {
        balanceDelta: -usage.creditsConsumed
      });

      await commercialModel.insertCreditTransaction(executor, {
        organizationId,
        actorUserId: payload.actorUserId || null,
        transactionType: "usage_debit",
        creditsDelta: -usage.creditsConsumed,
        rupeeAmount: 0,
        sourceFeature: payload.sourceFeature || null,
        referenceId: normalizeReferenceId(payload.referenceId),
        note: payload.note || null
      });

      await commercialModel.incrementUsageMonthly(executor, organizationId, usageMonth, usage);
    }

    const usageRow = await commercialModel.recalculateUsageMonthly(executor, usageMonth, organizationId);
    const mappedWallet = mapWallet(wallet);

    return {
      wallet: {
        ...mappedWallet,
        isLowBalance: mappedWallet.currentBalance <= mappedWallet.lowBalanceThreshold
      },
      usage: mapUsage(usageRow),
      chargedCredits: usage.creditsConsumed
    };
  });

const updatePricingConfig = async (organizationId, payload = {}) =>
  commercialModel.runInTransaction(async (executor) => {
    const { pricing, wallet } = await ensureCommercialRowsInTransaction(executor, organizationId);
    const nextPricing = buildPricingConfig(pricing, payload);
    const nextLowBalanceThreshold =
      payload.lowBalanceThreshold ??
      normalizeInteger(wallet.low_balance_threshold, DEFAULT_LOW_BALANCE_THRESHOLD);

    await commercialModel.updatePricingConfig(executor, organizationId, nextPricing);
    await commercialModel.updateWallet(executor, organizationId, {
      monthlyIncludedCredits: nextPricing.monthlyIncludedCredits,
      lowBalanceThreshold: nextLowBalanceThreshold
    });
    await commercialModel.ensureUsageMonthly(executor, organizationId, getUsageMonthStart());
    await commercialModel.recalculateUsageMonthly(executor, getUsageMonthStart(), organizationId);
  }).then(() => buildOverview(organizationId));

const createTopUp = async (organizationId, payload = {}, actor = null) =>
  commercialModel.runInTransaction(async (executor) => {
    const usageMonth = getUsageMonthStart();
    const state = await ensureCommercialStateInTransaction(executor, organizationId, usageMonth);
    const packs = Math.max(1, normalizeInteger(payload.packs, 1));
    const pricing = mapPricing(state.pricing);
    const creditsToAdd =
      payload.credits !== undefined
        ? normalizeInteger(payload.credits)
        : pricing.topupCreditAmount * packs;
    const rupeeAmount =
      payload.rupeeAmount !== undefined
        ? normalizeMoney(payload.rupeeAmount)
        : Number((pricing.topupPrice * packs).toFixed(2));

    await commercialModel.adjustWalletBalance(executor, organizationId, {
      balanceDelta: creditsToAdd
    });

    await commercialModel.insertCreditTransaction(executor, {
      organizationId,
      actorUserId: actor?.sub || null,
      transactionType: "top_up",
      creditsDelta: creditsToAdd,
      rupeeAmount,
      sourceFeature: "manual_top_up",
      note: payload.note || `Top-up (${packs} pack${packs === 1 ? "" : "s"})`
    });

    await commercialModel.incrementUsageMonthly(executor, organizationId, usageMonth, {
      topupCreditsPurchased: creditsToAdd,
      topupRevenue: rupeeAmount
    });

    await commercialModel.recalculateUsageMonthly(executor, usageMonth, organizationId);
  }).then(() => buildOverview(organizationId));

const updatePlatformInfra = async (payload = {}) =>
  commercialModel.runInTransaction(async (executor) => {
    const usageMonth = payload.usageMonth || getUsageMonthStart();
    const activeClinics =
      payload.activeClinics !== undefined
        ? normalizeInteger(payload.activeClinics)
        : await commercialModel.countOrganizations(executor);
    const totalInfraCost = normalizeMoney(payload.totalInfraCost);
    const infraCostPerClinic =
      activeClinics > 0 ? Number((totalInfraCost / activeClinics).toFixed(2)) : 0;

    const platformInfra = await commercialModel.upsertPlatformInfraMonthly(executor, {
      usageMonth,
      totalInfraCost,
      activeClinics,
      infraCostPerClinic,
      notes: payload.notes || ""
    });

    await commercialModel.recalculateUsageMonthly(executor, usageMonth);
    return platformInfra;
  }).then(mapPlatformInfra);

module.exports = {
  getCommercialOverview,
  ensureUsageAllowed,
  recordUsage,
  updatePricingConfig,
  createTopUp,
  updatePlatformInfra
};
