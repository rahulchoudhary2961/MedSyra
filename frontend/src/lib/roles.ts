export const isFullAccessRole = (role?: string | null) => role === "admin" || role === "management";

export const isReceptionRole = (role?: string | null) =>
  role === "receptionist" || role === "billing" || role === "nurse";

export const canAccessBilling = (role?: string | null) => isFullAccessRole(role) || isReceptionRole(role);

export const canDeleteMedicalRecords = (role?: string | null) => isFullAccessRole(role);

export const canManageAppointments = (role?: string | null) =>
  isFullAccessRole(role) || isReceptionRole(role);
