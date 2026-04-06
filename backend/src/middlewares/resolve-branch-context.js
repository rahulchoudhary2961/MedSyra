const authModel = require("../models/auth.model");
const branchesService = require("../services/branches.service");

const resolveBranchContext = async (req, _res, next) => {
  try {
    const selectedHeader = String(req.headers["x-branch-id"] || "").trim();
    const selectedBranchId = selectedHeader && selectedHeader.toLowerCase() !== "all" ? selectedHeader : null;
    const persistedUser =
      req.user?.branchId && req.user?.branchName
        ? null
        : await authModel.findUserById(req.user.sub);

    const actor = {
      ...req.user,
      branchId: req.user?.branchId || persistedUser?.branch_id || null,
      branchName: req.user?.branchName || persistedUser?.branch_name || null
    };

    const branchContext = await branchesService.resolveBranchContext({
      organizationId: req.user.organizationId,
      actor,
      selectedBranchId
    });

    req.user.branchId = branchContext.assignedBranchId;
    req.user.branchName = branchContext.assignedBranchName;
    req.branchContext = branchContext;

    return next();
  } catch (error) {
    return next(error);
  }
};

module.exports = resolveBranchContext;
