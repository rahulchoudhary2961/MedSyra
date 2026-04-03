const assert = require("node:assert/strict");
const Module = require("node:module");
const path = require("node:path");

const loadWithMocks = (modulePath, mocks) => {
  const resolvedPath = require.resolve(modulePath);
  const originalLoad = Module._load;

  Module._load = function mockedLoad(request, parent, isMain) {
    const resolvedRequest = Module._resolveFilename(request, parent);
    if (Object.prototype.hasOwnProperty.call(mocks, resolvedRequest)) {
      return mocks[resolvedRequest];
    }
    return originalLoad(request, parent, isMain);
  };

  delete require.cache[resolvedPath];
  try {
    return require(resolvedPath);
  } finally {
    Module._load = originalLoad;
  }
};

const servicePath = path.resolve(__dirname, "./commercial.service.js");
const apiErrorPath = require.resolve(path.resolve(__dirname, "../utils/api-error.js"));
const commercialModelPath = require.resolve(path.resolve(__dirname, "../models/commercial.model.js"));

const currentUsageMonth = `${new Date().toISOString().slice(0, 7)}-01`;

const pricingRow = {
  plan_tier: "starter",
  base_plan_price: 799,
  monthly_included_credits: 100,
  topup_price: 199,
  topup_credit_amount: 200,
  ai_credits_per_query: 1,
  message_credits_per_unit: 1,
  default_ai_cost_per_query: 1,
  default_message_cost_per_unit: 1
};

const usageRow = {
  usage_month: currentUsageMonth,
  ai_queries_used: 0,
  ai_cost_per_query: 0,
  ai_cost_total: 0,
  messages_used: 0,
  message_cost_per_unit: 0,
  message_cost_total: 0,
  credits_consumed: 0,
  included_credits_granted: 0,
  topup_credits_purchased: 0,
  topup_revenue: 0,
  infra_cost_share: 0,
  base_plan_revenue: 799,
  total_revenue: 799,
  total_cost: 0,
  profit_amount: 799
};

const run = async () => {
  const ApiError = require(apiErrorPath);

  {
    const service = loadWithMocks(servicePath, {
      [commercialModelPath]: {
        runInTransaction: async (callback) => callback({}),
        getPricingConfig: async () => pricingRow,
        createPricingConfig: async () => pricingRow,
        getWallet: async () => ({
          current_balance: 0,
          monthly_included_credits: 100,
          low_balance_threshold: 20,
          last_reset_at: currentUsageMonth
        }),
        createWallet: async () => null,
        updateWallet: async () => null,
        ensureUsageMonthly: async () => usageRow,
        incrementUsageMonthly: async () => usageRow,
        recalculateUsageMonthly: async () => usageRow,
        insertCreditTransaction: async () => null,
        listCreditTransactions: async () => [],
        getPlatformInfraMonthly: async () => null,
        countOrganizations: async () => 1,
        adjustWalletBalance: async () => null,
        upsertPlatformInfraMonthly: async () => null
      }
    });

    await assert.rejects(
      service.ensureUsageAllowed("org-1", { aiQueriesUsed: 1 }),
      (error) =>
        error instanceof ApiError &&
        error.statusCode === 402 &&
        error.details.requiredCredits === 1
    );
  }

  {
    let walletCallCount = 0;
    let topUpAdjustment = null;
    let topUpTransaction = null;

    const service = loadWithMocks(servicePath, {
      [commercialModelPath]: {
        runInTransaction: async (callback) => callback({}),
        getPricingConfig: async () => pricingRow,
        createPricingConfig: async () => pricingRow,
        getWallet: async () => {
          walletCallCount += 1;
          if (walletCallCount === 1) {
            return {
              current_balance: 50,
              monthly_included_credits: 100,
              low_balance_threshold: 20,
              last_reset_at: currentUsageMonth
            };
          }

          return {
            current_balance: 450,
            monthly_included_credits: 100,
            low_balance_threshold: 20,
            last_reset_at: currentUsageMonth
          };
        },
        createWallet: async () => null,
        updateWallet: async () => null,
        ensureUsageMonthly: async () => usageRow,
        incrementUsageMonthly: async () => usageRow,
        recalculateUsageMonthly: async () => usageRow,
        insertCreditTransaction: async (_executor, payload) => {
          topUpTransaction = payload;
          return { id: "tx-1" };
        },
        listCreditTransactions: async () => [],
        getPlatformInfraMonthly: async () => null,
        countOrganizations: async () => 1,
        adjustWalletBalance: async (_executor, _organizationId, payload) => {
          topUpAdjustment = payload;
          return {
            current_balance: 450,
            monthly_included_credits: 100,
            low_balance_threshold: 20,
            last_reset_at: currentUsageMonth
          };
        },
        upsertPlatformInfraMonthly: async () => null
      }
    });

    const overview = await service.createTopUp("org-1", { packs: 2 }, { sub: "user-1" });

    assert.equal(topUpAdjustment.balanceDelta, 400);
    assert.equal(topUpTransaction.creditsDelta, 400);
    assert.equal(topUpTransaction.rupeeAmount, 398);
    assert.equal(overview.wallet.currentBalance, 450);
  }
};

module.exports = run;
