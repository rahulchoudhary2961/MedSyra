export const isAdministratorRole = (role?: string | null) => role === "admin";

export const isManagementRole = (role?: string | null) => role === "management";

export const isFullAccessRole = (role?: string | null) => isAdministratorRole(role) || isManagementRole(role);

export const isReceptionistRole = (role?: string | null) => role === "receptionist";

export const isFrontDeskRole = (role?: string | null) => role === "nurse";

export const isBillingRole = (role?: string | null) => role === "billing";

export const isReceptionRole = (role?: string | null) => isReceptionistRole(role) || isFrontDeskRole(role);

export const canManageAppointments = (role?: string | null) =>
  isFullAccessRole(role) || isReceptionRole(role);

export const canAccessAssistant = (role?: string | null) =>
  isFullAccessRole(role) || isReceptionRole(role) || role === "doctor";

export const canAccessPatients = (role?: string | null) =>
  isFullAccessRole(role) || isReceptionRole(role) || role === "doctor";

export const canAccessBilling = (role?: string | null) =>
  isFullAccessRole(role) || isBillingRole(role);

export const canAccessReports = (role?: string | null) => isFullAccessRole(role);

export const canAccessSettings = (role?: string | null) => isFullAccessRole(role);

export const canManageDoctors = (role?: string | null) => isFullAccessRole(role);

export const canAccessMedicalRecords = (role?: string | null) =>
  isFullAccessRole(role) || isReceptionRole(role) || role === "doctor";

export const canDeleteMedicalRecords = (role?: string | null) => isFullAccessRole(role);
