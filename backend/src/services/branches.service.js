const ApiError = require("../utils/api-error");
const { USER_ROLES } = require("../constants/roles");
const branchesModel = require("../models/branches.model");

const FULL_ACCESS_ROLES = new Set([USER_ROLES.ADMIN, USER_ROLES.MANAGEMENT]);

const isFullAccessRole = (role) => FULL_ACCESS_ROLES.has(role);

const ensureBranchInOrganization = async (organizationId, branchId) => {
  const branch = await branchesModel.getBranchById(organizationId, branchId);
  if (!branch) {
    throw new ApiError(404, "Branch not found");
  }

  return branch;
};

const listBranches = async (organizationId, query = {}) => {
  const items = await branchesModel.listBranches(organizationId, query);

  return {
    items,
    summary: {
      total: items.length,
      active: items.filter((item) => item.is_active === true).length,
      inactive: items.filter((item) => item.is_active !== true).length
    }
  };
};

const createBranch = async (organizationId, payload) => {
  const existing = await branchesModel.listBranches(organizationId);
  const shouldBecomeDefault = payload.isDefault === true || existing.length === 0;

  return branchesModel.createBranch(organizationId, {
    ...payload,
    isDefault: shouldBecomeDefault
  });
};

const updateBranch = async (organizationId, branchId, payload) => {
  const current = await ensureBranchInOrganization(organizationId, branchId);

  if (current.is_default === true && payload.isActive === false) {
    throw new ApiError(400, "Default branch cannot be deactivated");
  }

  if (current.is_default === true && payload.isDefault === false) {
    throw new ApiError(400, "Default branch can only change after another branch is marked as default");
  }

  const updated = await branchesModel.updateBranch(organizationId, branchId, payload);
  if (!updated) {
    throw new ApiError(404, "Branch not found");
  }

  return updated;
};

const resolveBranchContext = async ({ organizationId, actor, selectedBranchId = null }) => {
  const defaultBranch = await branchesModel.getDefaultBranch(organizationId);
  if (!defaultBranch) {
    throw new ApiError(500, "Default branch is not configured for this organization");
  }

  const actorBranchId = actor?.branchId || actor?.branch_id || defaultBranch.id;
  const actorBranchName = actor?.branchName || actor?.branch_name || defaultBranch.name;
  const canAccessAllBranches = isFullAccessRole(actor?.role);

  if (!canAccessAllBranches) {
    const assignedBranch = await ensureBranchInOrganization(organizationId, actorBranchId);

    if (selectedBranchId && selectedBranchId !== assignedBranch.id) {
      throw new ApiError(403, "You can only access your assigned branch");
    }

    return {
      readBranchId: assignedBranch.id,
      writeBranchId: assignedBranch.id,
      assignedBranchId: assignedBranch.id,
      assignedBranchName: assignedBranch.name,
      selectedBranchId: assignedBranch.id,
      selectedBranchName: assignedBranch.name,
      canAccessAllBranches: false
    };
  }

  let selectedBranch = null;
  if (selectedBranchId) {
    selectedBranch = await ensureBranchInOrganization(organizationId, selectedBranchId);
    if (selectedBranch.is_active !== true) {
      throw new ApiError(400, "Selected branch is inactive");
    }
  }

  return {
    readBranchId: selectedBranch?.id || null,
    writeBranchId: selectedBranch?.id || actorBranchId || defaultBranch.id,
    assignedBranchId: actorBranchId || defaultBranch.id,
    assignedBranchName: actorBranchName || defaultBranch.name,
    selectedBranchId: selectedBranch?.id || null,
    selectedBranchName: selectedBranch?.name || null,
    canAccessAllBranches: true
  };
};

module.exports = {
  createBranch,
  isFullAccessRole,
  listBranches,
  resolveBranchContext,
  updateBranch
};
