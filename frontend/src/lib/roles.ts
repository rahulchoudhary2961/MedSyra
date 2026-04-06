export const isAdministratorRole = (role?: string | null) => role === "admin";

export const isManagementRole = (role?: string | null) => role === "management";

export const isFullAccessRole = (role?: string | null) => isAdministratorRole(role) || isManagementRole(role);

export const isReceptionistRole = (role?: string | null) => role === "receptionist";

export const isFrontDeskRole = (role?: string | null) => role === "nurse";

export const isBillingRole = (role?: string | null) => role === "billing";

export const isReceptionRole = (role?: string | null) => isReceptionistRole(role) || isFrontDeskRole(role);

export const canManageAppointments = (role?: string | null) =>
  isFullAccessRole(role) || isReceptionRole(role);

export const canDeleteAppointments = (role?: string | null) => isFullAccessRole(role);

export const canAccessAssistant = (role?: string | null) =>
  isFullAccessRole(role) || isReceptionRole(role) || role === "doctor";

export const canAccessPatients = (role?: string | null) =>
  isFullAccessRole(role) || isReceptionRole(role) || role === "doctor";

export const canDeletePatients = (role?: string | null) => isFullAccessRole(role);

export const canAccessBilling = (role?: string | null) =>
  isFullAccessRole(role) || isBillingRole(role);

export const canDeleteInvoices = (role?: string | null) => isFullAccessRole(role);

export const canAccessReports = (role?: string | null) => isFullAccessRole(role);

export const canAccessSettings = (role?: string | null) => isFullAccessRole(role);

export const canAccessBranches = (role?: string | null) => isFullAccessRole(role);

export const canAccessDoctors = (role?: string | null) =>
  isFullAccessRole(role) || isReceptionRole(role) || role === "doctor";

export const canManageDoctors = (role?: string | null) => isFullAccessRole(role);

export const canAccessMedicalRecords = (role?: string | null) =>
  isFullAccessRole(role) || isReceptionRole(role) || role === "doctor";

export const canDeleteMedicalRecords = (role?: string | null) => isFullAccessRole(role);

export const canAccessCrm = (role?: string | null) =>
  isFullAccessRole(role) || isReceptionRole(role) || role === "doctor";

export const canAccessLab = (role?: string | null) =>
  isFullAccessRole(role) || isReceptionRole(role) || role === "doctor";

export const canManageLabCatalog = (role?: string | null) => isFullAccessRole(role);

export const canAccessPharmacy = (role?: string | null) =>
  isFullAccessRole(role) || isReceptionRole(role) || isBillingRole(role) || role === "doctor";

export const canManagePharmacyCatalog = (role?: string | null) => isFullAccessRole(role);

export const canAccessInventory = (role?: string | null) =>
  isFullAccessRole(role) || isReceptionRole(role) || isBillingRole(role);

export const canManageInventory = (role?: string | null) => isFullAccessRole(role);

export const canAccessInsurance = (role?: string | null) =>
  isFullAccessRole(role) || isBillingRole(role);

export const canManageInsuranceCatalog = (role?: string | null) =>
  isFullAccessRole(role) || isBillingRole(role);
