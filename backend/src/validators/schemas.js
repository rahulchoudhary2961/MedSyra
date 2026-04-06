const {
  optional,
  stringRule,
  integerRule,
  numberRule,
  booleanRule,
  uuidRule,
  emailRule,
  phoneRule,
  dateRule,
  timeRule,
  passwordRule,
  urlRule,
  relativeUploadPathRule
} = require("./rules");
const { USER_ROLES } = require("../constants/roles");
const ApiError = require("../utils/api-error");

const roles = Object.values(USER_ROLES);
const staffRoles = [USER_ROLES.ADMIN, USER_ROLES.RECEPTIONIST, USER_ROLES.NURSE, USER_ROLES.BILLING, USER_ROLES.MANAGEMENT];
const medicalRecordStatuses = ["completed", "pending review", "in progress"];
const medicalRecordUploadContentTypes = ["image/jpeg", "image/png", "image/webp", "image/gif", "application/pdf"];
const medicalRecordFileUrlRule = (value, fieldName) => {
  try {
    return urlRule()(value, fieldName);
  } catch (_error) {
    return relativeUploadPathRule()(value, fieldName);
  }
};
const patientStatuses = ["active", "follow-up", "pending", "inactive"];
const doctorStatuses = ["available", "busy", "off duty", "off-duty"];
const bloodTypes = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];
const invoiceStatuses = ["draft", "issued", "partially_paid", "paid", "overdue", "void"];
const paymentMethods = ["cash", "card", "bank_transfer", "insurance", "upi", "other"];
const reportPeriods = ["7d", "30d", "90d", "12m"];
const notificationTypes = ["appointment_reminder", "follow_up_reminder", "staff_daily_schedule", "appointment_no_show"];
const notificationChannels = ["whatsapp", "sms", "email"];
const notificationLogStatuses = ["sent", "failed", "fallback", "opened", "skipped"];
const auditOutcomes = ["success", "denied", "failed"];
const crmTaskTypes = ["follow_up", "recall", "retention"];
const crmTaskPriorities = ["high", "medium", "low"];
const crmTaskStatuses = ["open", "contacted", "scheduled", "not_reachable", "closed", "dismissed"];
const labOrderStatuses = ["ordered", "sample_collected", "processing", "report_ready", "completed", "cancelled"];
const pharmacyDispenseStatuses = ["dispensed", "cancelled"];
const inventoryMovementTypes = ["stock_in", "usage", "wastage", "adjustment_in", "adjustment_out"];
const insuranceClaimStatuses = [
  "draft",
  "submitted",
  "under_review",
  "approved",
  "partially_approved",
  "rejected",
  "settled",
  "cancelled"
];
const invoiceItemsRule = (value, fieldName) => {
  if (!Array.isArray(value) || value.length === 0) {
    throw new ApiError(400, `${fieldName} must be a non-empty array`);
  }

  return value.map((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new ApiError(400, `${fieldName}[${index}] must be an object`);
    }

    const allowedKeys = new Set(["description", "quantity", "unitPrice"]);
    const unknownKeys = Object.keys(item).filter((key) => !allowedKeys.has(key));
    if (unknownKeys.length > 0) {
      throw new ApiError(400, `Unknown ${fieldName}[${index}] fields: ${unknownKeys.join(", ")}`);
    }

    return {
      description: stringRule({ minLength: 2, maxLength: 200 })(item.description, `${fieldName}[${index}].description`),
      quantity: numberRule({ min: 0.01, max: 100000 })(item.quantity, `${fieldName}[${index}].quantity`),
      unitPrice: numberRule({ min: 0.01, max: 10000000 })(item.unitPrice, `${fieldName}[${index}].unitPrice`)
    };
  });
};

const aiChatHistoryRule = (value, fieldName) => {
  if (!Array.isArray(value) || value.length === 0) {
    throw new ApiError(400, `${fieldName} must be a non-empty array`);
  }

  if (value.length > 12) {
    throw new ApiError(400, `${fieldName} must contain at most 12 messages`);
  }

  return value.map((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new ApiError(400, `${fieldName}[${index}] must be an object`);
    }

    const allowedKeys = new Set(["role", "content"]);
    const unknownKeys = Object.keys(item).filter((key) => !allowedKeys.has(key));
    if (unknownKeys.length > 0) {
      throw new ApiError(400, `Unknown ${fieldName}[${index}] fields: ${unknownKeys.join(", ")}`);
    }

    return {
      role: stringRule({ enumValues: ["user", "assistant"], maxLength: 20 })(item.role, `${fieldName}[${index}].role`),
      content: stringRule({ minLength: 1, maxLength: 2000, safe: false })(item.content, `${fieldName}[${index}].content`)
    };
  });
};

const labOrderItemsRule = (value, fieldName) => {
  if (!Array.isArray(value) || value.length === 0) {
    throw new ApiError(400, `${fieldName} must be a non-empty array`);
  }

  return value.map((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new ApiError(400, `${fieldName}[${index}] must be an object`);
    }

    const allowedKeys = new Set(["labTestId", "testName", "price", "resultSummary"]);
    const unknownKeys = Object.keys(item).filter((key) => !allowedKeys.has(key));
    if (unknownKeys.length > 0) {
      throw new ApiError(400, `Unknown ${fieldName}[${index}] fields: ${unknownKeys.join(", ")}`);
    }

    const normalized = {
      labTestId: item.labTestId ? uuidRule()(item.labTestId, `${fieldName}[${index}].labTestId`) : undefined,
      testName: item.testName
        ? stringRule({ minLength: 2, maxLength: 120 })(item.testName, `${fieldName}[${index}].testName`)
        : undefined,
      price: item.price !== undefined
        ? numberRule({ min: 0, max: 10000000 })(item.price, `${fieldName}[${index}].price`)
        : undefined,
      resultSummary: item.resultSummary
        ? stringRule({ maxLength: 2000 })(item.resultSummary, `${fieldName}[${index}].resultSummary`)
        : undefined
    };

    if (!normalized.labTestId && !normalized.testName) {
      throw new ApiError(400, `${fieldName}[${index}] requires labTestId or testName`);
    }

    return normalized;
  });
};

const pharmacyDispenseItemsRule = (value, fieldName) => {
  if (!Array.isArray(value) || value.length === 0) {
    throw new ApiError(400, `${fieldName} must be a non-empty array`);
  }

  return value.map((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new ApiError(400, `${fieldName}[${index}] must be an object`);
    }

    const allowedKeys = new Set(["medicineBatchId", "quantity", "unitPrice", "directions"]);
    const unknownKeys = Object.keys(item).filter((key) => !allowedKeys.has(key));
    if (unknownKeys.length > 0) {
      throw new ApiError(400, `Unknown ${fieldName}[${index}] fields: ${unknownKeys.join(", ")}`);
    }

    return {
      medicineBatchId: uuidRule()(item.medicineBatchId, `${fieldName}[${index}].medicineBatchId`),
      quantity: numberRule({ min: 0.01, max: 100000 })(item.quantity, `${fieldName}[${index}].quantity`),
      unitPrice:
        item.unitPrice !== undefined
          ? numberRule({ min: 0, max: 10000000 })(item.unitPrice, `${fieldName}[${index}].unitPrice`)
          : undefined,
      directions:
        item.directions !== undefined
          ? stringRule({ maxLength: 500 })(item.directions, `${fieldName}[${index}].directions`)
          : undefined
    };
  });
};

const idParamsSchema = {
  fields: {
    id: uuidRule()
  }
};

const authSchemas = {
  signupBody: {
    fields: {
      fullName: stringRule({ minLength: 2, maxLength: 100, pattern: /^[a-zA-Z\s.'-]+$/ }),
      email: emailRule(),
      phone: phoneRule(),
      role: stringRule({ enumValues: roles, maxLength: 50 }),
      hospitalName: stringRule({ minLength: 2, maxLength: 120 }),
      password: passwordRule()
    }
  },
  signinBody: {
    fields: {
      email: emailRule(),
      password: stringRule({ minLength: 8, maxLength: 128, safe: false })
    }
  },
  verifyEmailBody: {
    fields: {
      email: emailRule(),
      token: stringRule({ minLength: 64, maxLength: 64, pattern: /^[a-f0-9]+$/, safe: false, lowercase: true })
    }
  },
  resendVerificationBody: {
    fields: {
      email: emailRule()
    }
  },
  requestPasswordResetBody: {
    fields: {
      email: emailRule()
    }
  },
  listUsersQuery: {
    fields: {
      role: optional(stringRule({ enumValues: roles, maxLength: 50 }))
    }
  },
  createStaffBody: {
    fields: {
      fullName: stringRule({ minLength: 2, maxLength: 100, pattern: /^[a-zA-Z\s.'-]+$/ }),
      email: emailRule(),
      phone: phoneRule(),
      role: stringRule({ enumValues: staffRoles, maxLength: 50 }),
      branchId: optional(uuidRule()),
      notifyDailyScheduleSms: optional(booleanRule()),
      notifyDailyScheduleEmail: optional(booleanRule())
    }
  },
  updateStaffNotificationsBody: {
    fields: {
      notifyDailyScheduleSms: optional(booleanRule()),
      notifyDailyScheduleEmail: optional(booleanRule())
    }
  },
  resetPasswordBody: {
    fields: {
      email: emailRule(),
      token: stringRule({ minLength: 64, maxLength: 64, pattern: /^[a-f0-9]+$/, safe: false, lowercase: true }),
      newPassword: passwordRule()
    }
  },
  idParams: idParamsSchema
};

const paginationQuerySchema = {
  page: optional(integerRule({ min: 1, max: 100000, coerceString: true })),
  limit: optional(integerRule({ min: 1, max: 100, coerceString: true }))
};

const securitySchemas = {
  overviewQuery: {
    fields: {
      days: optional(integerRule({ min: 1, max: 90, coerceString: true }))
    }
  },
  logsQuery: {
    fields: {
      ...paginationQuerySchema,
      module: optional(stringRule({ minLength: 2, maxLength: 50 })),
      outcome: optional(stringRule({ enumValues: auditOutcomes, maxLength: 20 })),
      actorUserId: optional(uuidRule()),
      entityType: optional(stringRule({ minLength: 2, maxLength: 50 })),
      isDestructive: optional(stringRule({ enumValues: ["true", "false"], maxLength: 5, safe: false }))
    }
  }
};

const branchesSchemas = {
  listQuery: {
    fields: {
      activeOnly: optional(stringRule({ enumValues: ["true", "false"], maxLength: 5, safe: false }))
    }
  },
  createBody: {
    fields: {
      branchCode: optional(stringRule({ minLength: 2, maxLength: 20, safe: false })),
      name: stringRule({ minLength: 2, maxLength: 120 }),
      address: optional(stringRule({ maxLength: 300 })),
      phone: optional(phoneRule()),
      email: optional(emailRule()),
      timezone: optional(stringRule({ minLength: 2, maxLength: 80, safe: false })),
      isActive: optional(booleanRule()),
      isDefault: optional(booleanRule())
    }
  },
  updateBody: {
    fields: {
      branchCode: optional(stringRule({ minLength: 2, maxLength: 20, safe: false })),
      name: optional(stringRule({ minLength: 2, maxLength: 120 })),
      address: optional(stringRule({ maxLength: 300 })),
      phone: optional(phoneRule()),
      email: optional(emailRule()),
      timezone: optional(stringRule({ minLength: 2, maxLength: 80, safe: false })),
      isActive: optional(booleanRule()),
      isDefault: optional(booleanRule())
    },
    requireAtLeastOne: true
  },
  idParams: idParamsSchema
};

const patientsSchemas = {
  listQuery: {
    fields: {
      ...paginationQuerySchema,
      q: optional(stringRule({ minLength: 1, maxLength: 120 })),
      status: optional(stringRule({ enumValues: patientStatuses, maxLength: 20 }))
    }
  },
  createBody: {
    fields: {
      fullName: stringRule({ minLength: 2, maxLength: 100, pattern: /^[a-zA-Z\s.'-]+$/ }),
      age: optional(integerRule({ min: 1, max: 130 })),
      dateOfBirth: optional(dateRule()),
      gender: stringRule({ enumValues: ["male", "female", "other"] }),
      phone: phoneRule({ strictTenDigits: true }),
      email: optional(emailRule()),
      bloodType: optional(stringRule({ enumValues: bloodTypes, safe: false })),
      emergencyContact: optional(phoneRule({ strictTenDigits: true })),
      address: optional(stringRule({ minLength: 2, maxLength: 300 })),
      status: optional(stringRule({ enumValues: patientStatuses, maxLength: 20 })),
      lastVisitAt: optional(dateRule())
    }
  },
  updateBody: {
    fields: {
      fullName: optional(stringRule({ minLength: 2, maxLength: 100, pattern: /^[a-zA-Z\s.'-]+$/ })),
      age: optional(integerRule({ min: 1, max: 130 })),
      dateOfBirth: optional(dateRule()),
      gender: optional(stringRule({ enumValues: ["male", "female", "other"] })),
      phone: optional(phoneRule({ strictTenDigits: true })),
      email: optional(emailRule()),
      bloodType: optional(stringRule({ enumValues: bloodTypes, safe: false })),
      emergencyContact: optional(phoneRule({ strictTenDigits: true })),
      address: optional(stringRule({ minLength: 2, maxLength: 300 })),
      status: optional(stringRule({ enumValues: patientStatuses, maxLength: 20 })),
      lastVisitAt: optional(dateRule())
    },
    requireAtLeastOne: true
  },
  uploadBody: {
    fields: {
      fileName: stringRule({ minLength: 1, maxLength: 120, safe: false }),
      contentType: stringRule({ enumValues: medicalRecordUploadContentTypes, maxLength: 40, safe: false }),
      dataBase64: stringRule({ minLength: 20, maxLength: 8_000_000, safe: false })
    }
  },
  idParams: idParamsSchema
};

const doctorsSchemas = {
  listQuery: {
    fields: {
      ...paginationQuerySchema,
      q: optional(stringRule({ minLength: 1, maxLength: 120 })),
      status: optional(stringRule({ enumValues: doctorStatuses, maxLength: 30 }))
    }
  },
  createBody: {
    fields: {
      fullName: stringRule({ minLength: 2, maxLength: 100, pattern: /^[a-zA-Z\s.'-]+$/ }),
      specialty: stringRule({ minLength: 2, maxLength: 80 }),
      experienceYears: optional(integerRule({ min: 0, max: 80 })),
      availability: optional(stringRule({ minLength: 2, maxLength: 100 })),
      phone: optional(phoneRule()),
      email: optional(emailRule()),
      userId: optional(uuidRule()),
      workStartTime: optional(timeRule()),
      workEndTime: optional(timeRule()),
      breakStartTime: optional(timeRule()),
      breakEndTime: optional(timeRule()),
      weeklyOffDays: optional(stringRule({ maxLength: 200, safe: false })),
      holidayDates: optional(stringRule({ maxLength: 1000, safe: false })),
      consultationFee: optional(numberRule({ min: 0, max: 1000000 })),
      rating: optional(numberRule({ min: 0, max: 5 })),
      patientCount: optional(integerRule({ min: 0, max: 1000000 })),
      status: optional(stringRule({ enumValues: doctorStatuses, maxLength: 30 }))
    }
  },
  idParams: idParamsSchema
};

const appointmentCategories = ["consultation", "follow-up", "procedure", "checkup", "emergency", "review", "walk-in"];

const appointmentsSchemas = {
  listQuery: {
    fields: {
      ...paginationQuerySchema,
      limit: optional(integerRule({ min: 1, max: 500, coerceString: true })),
      year: optional(integerRule({ min: 2000, max: 2100, coerceString: true })),
      month: optional(integerRule({ min: 1, max: 12, coerceString: true })),
      day: optional(integerRule({ min: 1, max: 31, coerceString: true })),
      date: optional(dateRule()),
      patientId: optional(uuidRule()),
      doctorId: optional(uuidRule())
    }
  },
  createBody: {
    fields: {
      patientName: stringRule({ minLength: 2, maxLength: 120 }),
      patientId: optional(uuidRule()),
      mobileNumber: optional(phoneRule()),
      email: optional(emailRule()),
      doctorId: optional(uuidRule()),
      category: stringRule({ enumValues: appointmentCategories, maxLength: 40 }),
      status: optional(stringRule({ enumValues: ["pending", "confirmed", "cancelled", "completed", "checked-in", "no-show"], maxLength: 20 })),
      appointmentDate: dateRule(),
      appointmentTime: timeRule(),
      durationMinutes: integerRule({ min: 5, max: 240 }),
      plannedProcedures: optional(stringRule({ maxLength: 2000 })),
      notes: optional(stringRule({ maxLength: 1000 }))
    }
  },
  updateBody: {
    fields: {
      patientName: optional(stringRule({ minLength: 2, maxLength: 120 })),
      patientId: optional(uuidRule()),
      mobileNumber: optional(phoneRule()),
      email: optional(emailRule()),
      doctorId: optional(uuidRule()),
      category: optional(stringRule({ enumValues: appointmentCategories, maxLength: 40 })),
      status: optional(stringRule({ enumValues: ["pending", "confirmed", "cancelled", "completed", "checked-in", "no-show"], maxLength: 20 })),
      appointmentDate: optional(dateRule()),
      appointmentTime: optional(timeRule()),
      durationMinutes: optional(integerRule({ min: 5, max: 240 })),
      plannedProcedures: optional(stringRule({ maxLength: 2000 })),
      notes: optional(stringRule({ maxLength: 1000 }))
    },
    requireAtLeastOne: true
  },
  completeConsultationBody: {
    fields: {
      symptoms: optional(stringRule({ maxLength: 2000 })),
      diagnosis: optional(stringRule({ maxLength: 2000 })),
      prescription: optional(stringRule({ maxLength: 2000 })),
      notes: optional(stringRule({ maxLength: 2000 })),
      followUpDate: optional(dateRule()),
      followUpInDays: optional(integerRule({ min: 1, max: 365, coerceString: true })),
      sendFollowUpReminder: optional(booleanRule())
    },
    requireAtLeastOne: true
  },
  idParams: idParamsSchema,
  sendReminderBody: {
    fields: {}
  },
  markNoShowBody: {
    fields: {
      notifySms: optional(booleanRule()),
      notifyEmail: optional(booleanRule())
    }
  },
  bulkCancelBody: {
    fields: {
      appointmentDate: dateRule(),
      doctorId: optional(uuidRule())
    }
  }
};

const medicalRecordsSchemas = {
  listQuery: {
    fields: {
      ...paginationQuerySchema,
      q: optional(stringRule({ minLength: 1, maxLength: 120 })),
      status: optional(stringRule({ enumValues: medicalRecordStatuses, maxLength: 30 })),
      patientId: optional(uuidRule()),
      doctorId: optional(uuidRule()),
      appointmentId: optional(uuidRule())
    }
  },
  createBody: {
    fields: {
      patientId: uuidRule(),
      doctorId: uuidRule(),
      appointmentId: optional(uuidRule()),
      recordType: stringRule({ minLength: 2, maxLength: 100 }),
      status: optional(stringRule({ enumValues: medicalRecordStatuses, maxLength: 30 })),
      recordDate: dateRule(),
      symptoms: optional(stringRule({ maxLength: 2000 })),
      diagnosis: optional(stringRule({ maxLength: 2000 })),
      prescription: optional(stringRule({ maxLength: 2000 })),
      notes: optional(stringRule({ maxLength: 2000 })),
      fileUrl: optional(medicalRecordFileUrlRule)
    }
  },
  updateBody: {
    fields: {
      patientId: optional(uuidRule()),
      doctorId: optional(uuidRule()),
      appointmentId: optional(uuidRule()),
      recordType: optional(stringRule({ minLength: 2, maxLength: 100 })),
      status: optional(stringRule({ enumValues: medicalRecordStatuses, maxLength: 30 })),
      recordDate: optional(dateRule()),
      symptoms: optional(stringRule({ maxLength: 2000 })),
      diagnosis: optional(stringRule({ maxLength: 2000 })),
      prescription: optional(stringRule({ maxLength: 2000 })),
      followUpDate: optional(dateRule()),
      notes: optional(stringRule({ maxLength: 2000 })),
      fileUrl: optional(medicalRecordFileUrlRule)
    },
    requireAtLeastOne: true
  },
  idParams: idParamsSchema,
  sendFollowUpReminderBody: {
    fields: {}
  }
};

const billingsSchemas = {
  listQuery: {
    fields: {
      ...paginationQuerySchema,
      q: optional(stringRule({ minLength: 1, maxLength: 120 })),
      status: optional(stringRule({ enumValues: invoiceStatuses, maxLength: 20 })),
      patientId: optional(uuidRule())
    }
  },
  createBody: {
    fields: {
      patientId: uuidRule(),
      doctorId: optional(uuidRule()),
      appointmentId: optional(uuidRule()),
      description: optional(stringRule({ minLength: 2, maxLength: 200 })),
      amount: optional(numberRule({ min: 0.01, max: 10000000 })),
      items: optional(invoiceItemsRule),
      currency: optional(stringRule({ minLength: 3, maxLength: 3, pattern: /^[A-Z]{3}$/, safe: false })),
      issueDate: optional(dateRule()),
      dueDate: optional(dateRule({ allowDateTime: true })),
      status: optional(stringRule({ enumValues: invoiceStatuses, maxLength: 20 })),
      notes: optional(stringRule({ maxLength: 1000 }))
    }
  },
  updateBody: {
    fields: {
      description: optional(stringRule({ minLength: 2, maxLength: 200 })),
      amount: optional(numberRule({ min: 0.01, max: 10000000 })),
      items: optional(invoiceItemsRule),
      dueDate: optional(dateRule({ allowDateTime: true })),
      status: optional(stringRule({ enumValues: invoiceStatuses, maxLength: 20 })),
      notes: optional(stringRule({ maxLength: 1000 }))
    },
    requireAtLeastOne: true
  },
  issueBody: {
    fields: {
      dueDate: optional(dateRule({ allowDateTime: true }))
    }
  },
  paymentBody: {
    fields: {
      amount: numberRule({ min: 0.01, max: 10000000 }),
      method: stringRule({ enumValues: paymentMethods, maxLength: 30 }),
      reference: optional(stringRule({ maxLength: 120 })),
      status: optional(stringRule({ enumValues: ["completed", "failed"], maxLength: 20 })),
      paidAt: optional(stringRule({ minLength: 10, maxLength: 40, safe: false }))
    }
  },
  refundBody: {
    fields: {
      paymentId: uuidRule(),
      reason: optional(stringRule({ maxLength: 300 })),
      refundedAt: optional(stringRule({ minLength: 10, maxLength: 40, safe: false }))
    }
  },
  quickPayBody: {
    fields: {
      method: optional(stringRule({ enumValues: paymentMethods, maxLength: 30 })),
      reference: optional(stringRule({ maxLength: 120 }))
    }
  },
  paymentLinkBody: {
    fields: {
      expiresAt: optional(dateRule())
    }
  },
  paymentLinkParams: {
    fields: {
      id: uuidRule(),
      linkId: uuidRule()
    }
  },
  idParams: idParamsSchema
};

const dashboardSchemas = {
  reportsQuery: {
    fields: {
      period: optional(stringRule({ enumValues: reportPeriods, maxLength: 10 }))
    }
  }
};

const crmSchemas = {
  listQuery: {
    fields: {
      ...paginationQuerySchema,
      limit: optional(integerRule({ min: 1, max: 200, coerceString: true })),
      q: optional(stringRule({ minLength: 1, maxLength: 120 })),
      taskType: optional(stringRule({ enumValues: crmTaskTypes, maxLength: 20 })),
      status: optional(stringRule({ enumValues: crmTaskStatuses, maxLength: 30 })),
      patientId: optional(uuidRule()),
      assignedUserId: optional(uuidRule())
    }
  },
  createBody: {
    fields: {
      patientId: uuidRule(),
      sourceRecordId: optional(uuidRule()),
      sourceAppointmentId: optional(uuidRule()),
      taskType: stringRule({ enumValues: crmTaskTypes, maxLength: 20 }),
      title: optional(stringRule({ minLength: 2, maxLength: 200 })),
      priority: optional(stringRule({ enumValues: crmTaskPriorities, maxLength: 20 })),
      status: optional(stringRule({ enumValues: crmTaskStatuses, maxLength: 30 })),
      dueDate: dateRule(),
      assignedUserId: optional(uuidRule()),
      nextActionAt: optional(stringRule({ minLength: 10, maxLength: 40, safe: false })),
      outcomeNotes: optional(stringRule({ maxLength: 2000 }))
    }
  },
  updateBody: {
    fields: {
      title: optional(stringRule({ minLength: 2, maxLength: 200 })),
      priority: optional(stringRule({ enumValues: crmTaskPriorities, maxLength: 20 })),
      status: optional(stringRule({ enumValues: crmTaskStatuses, maxLength: 30 })),
      dueDate: optional(dateRule()),
      assignedUserId: optional(uuidRule()),
      lastContactedAt: optional(stringRule({ minLength: 10, maxLength: 40, safe: false })),
      nextActionAt: optional(stringRule({ minLength: 10, maxLength: 40, safe: false })),
      outcomeNotes: optional(stringRule({ maxLength: 2000 }))
    },
    requireAtLeastOne: true
  },
  idParams: idParamsSchema
};

const labSchemas = {
  testsListQuery: {
    fields: {
      ...paginationQuerySchema,
      limit: optional(integerRule({ min: 1, max: 200, coerceString: true })),
      q: optional(stringRule({ minLength: 1, maxLength: 120 })),
      active: optional(stringRule({ enumValues: ["true", "false"], maxLength: 5, safe: false }))
    }
  },
  testCreateBody: {
    fields: {
      code: optional(stringRule({ minLength: 2, maxLength: 30, safe: false })),
      name: stringRule({ minLength: 2, maxLength: 120 }),
      department: optional(stringRule({ minLength: 2, maxLength: 80 })),
      price: numberRule({ min: 0, max: 10000000 }),
      turnaroundHours: optional(integerRule({ min: 0, max: 720 })),
      instructions: optional(stringRule({ maxLength: 2000 })),
      isActive: optional(booleanRule())
    }
  },
  testUpdateBody: {
    fields: {
      code: optional(stringRule({ minLength: 2, maxLength: 30, safe: false })),
      name: optional(stringRule({ minLength: 2, maxLength: 120 })),
      department: optional(stringRule({ minLength: 2, maxLength: 80 })),
      price: optional(numberRule({ min: 0, max: 10000000 })),
      turnaroundHours: optional(integerRule({ min: 0, max: 720 })),
      instructions: optional(stringRule({ maxLength: 2000 })),
      isActive: optional(booleanRule())
    },
    requireAtLeastOne: true
  },
  ordersListQuery: {
    fields: {
      ...paginationQuerySchema,
      limit: optional(integerRule({ min: 1, max: 200, coerceString: true })),
      q: optional(stringRule({ minLength: 1, maxLength: 120 })),
      status: optional(stringRule({ enumValues: labOrderStatuses, maxLength: 30 })),
      patientId: optional(uuidRule()),
      doctorId: optional(uuidRule())
    }
  },
  orderCreateBody: {
    fields: {
      patientId: uuidRule(),
      doctorId: optional(uuidRule()),
      appointmentId: optional(uuidRule()),
      orderedDate: dateRule(),
      dueDate: optional(dateRule()),
      notes: optional(stringRule({ maxLength: 2000 })),
      items: labOrderItemsRule,
      status: optional(stringRule({ enumValues: labOrderStatuses, maxLength: 30 }))
    }
  },
  orderUpdateBody: {
    fields: {
      doctorId: optional(uuidRule()),
      appointmentId: optional(uuidRule()),
      orderedDate: optional(dateRule()),
      dueDate: optional(dateRule()),
      notes: optional(stringRule({ maxLength: 2000 })),
      items: optional(labOrderItemsRule),
      status: optional(stringRule({ enumValues: labOrderStatuses, maxLength: 30 }))
    },
    requireAtLeastOne: true
  },
  uploadBody: {
    fields: {
      fileName: stringRule({ minLength: 1, maxLength: 120, safe: false }),
      contentType: stringRule({ enumValues: medicalRecordUploadContentTypes, maxLength: 40, safe: false }),
      dataBase64: stringRule({ minLength: 20, maxLength: 8_000_000, safe: false })
    }
  },
  idParams: idParamsSchema
};

const pharmacySchemas = {
  medicinesListQuery: {
    fields: {
      ...paginationQuerySchema,
      limit: optional(integerRule({ min: 1, max: 200, coerceString: true })),
      q: optional(stringRule({ minLength: 1, maxLength: 120 })),
      active: optional(stringRule({ enumValues: ["true", "false"], maxLength: 5, safe: false }))
    }
  },
  medicineCreateBody: {
    fields: {
      code: optional(stringRule({ minLength: 2, maxLength: 40, safe: false })),
      name: stringRule({ minLength: 2, maxLength: 120 }),
      genericName: optional(stringRule({ minLength: 2, maxLength: 120 })),
      dosageForm: optional(stringRule({ minLength: 2, maxLength: 80 })),
      strength: optional(stringRule({ minLength: 1, maxLength: 80, safe: false })),
      unit: optional(stringRule({ minLength: 1, maxLength: 30, safe: false })),
      reorderLevel: optional(numberRule({ min: 0, max: 100000 })),
      isActive: optional(booleanRule())
    }
  },
  medicineUpdateBody: {
    fields: {
      code: optional(stringRule({ minLength: 2, maxLength: 40, safe: false })),
      name: optional(stringRule({ minLength: 2, maxLength: 120 })),
      genericName: optional(stringRule({ minLength: 2, maxLength: 120 })),
      dosageForm: optional(stringRule({ minLength: 2, maxLength: 80 })),
      strength: optional(stringRule({ minLength: 1, maxLength: 80, safe: false })),
      unit: optional(stringRule({ minLength: 1, maxLength: 30, safe: false })),
      reorderLevel: optional(numberRule({ min: 0, max: 100000 })),
      isActive: optional(booleanRule())
    },
    requireAtLeastOne: true
  },
  batchesListQuery: {
    fields: {
      ...paginationQuerySchema,
      limit: optional(integerRule({ min: 1, max: 200, coerceString: true })),
      q: optional(stringRule({ minLength: 1, maxLength: 120 })),
      medicineId: optional(uuidRule())
    }
  },
  batchCreateBody: {
    fields: {
      medicineId: uuidRule(),
      batchNumber: stringRule({ minLength: 2, maxLength: 60, safe: false }),
      manufacturer: optional(stringRule({ minLength: 2, maxLength: 120 })),
      expiryDate: dateRule(),
      receivedQuantity: numberRule({ min: 0.01, max: 1000000 }),
      availableQuantity: optional(numberRule({ min: 0, max: 1000000 })),
      purchasePrice: optional(numberRule({ min: 0, max: 10000000 })),
      salePrice: optional(numberRule({ min: 0, max: 10000000 })),
      receivedDate: optional(dateRule())
    }
  },
  batchUpdateBody: {
    fields: {
      batchNumber: optional(stringRule({ minLength: 2, maxLength: 60, safe: false })),
      manufacturer: optional(stringRule({ minLength: 2, maxLength: 120 })),
      expiryDate: optional(dateRule()),
      receivedQuantity: optional(numberRule({ min: 0.01, max: 1000000 })),
      availableQuantity: optional(numberRule({ min: 0, max: 1000000 })),
      purchasePrice: optional(numberRule({ min: 0, max: 10000000 })),
      salePrice: optional(numberRule({ min: 0, max: 10000000 })),
      receivedDate: optional(dateRule())
    },
    requireAtLeastOne: true
  },
  dispensesListQuery: {
    fields: {
      ...paginationQuerySchema,
      limit: optional(integerRule({ min: 1, max: 200, coerceString: true })),
      q: optional(stringRule({ minLength: 1, maxLength: 120 })),
      status: optional(stringRule({ enumValues: pharmacyDispenseStatuses, maxLength: 30 })),
      patientId: optional(uuidRule()),
      doctorId: optional(uuidRule())
    }
  },
  dispenseCreateBody: {
    fields: {
      patientId: uuidRule(),
      doctorId: optional(uuidRule()),
      appointmentId: optional(uuidRule()),
      medicalRecordId: optional(uuidRule()),
      dispensedDate: dateRule(),
      prescriptionSnapshot: optional(stringRule({ maxLength: 4000 })),
      notes: optional(stringRule({ maxLength: 2000 })),
      createInvoice: optional(booleanRule()),
      items: pharmacyDispenseItemsRule
    }
  },
  idParams: idParamsSchema
};

const inventorySchemas = {
  itemsListQuery: {
    fields: {
      ...paginationQuerySchema,
      limit: optional(integerRule({ min: 1, max: 200, coerceString: true })),
      q: optional(stringRule({ minLength: 1, maxLength: 120 })),
      active: optional(stringRule({ enumValues: ["true", "false"], maxLength: 5, safe: false }))
    }
  },
  itemCreateBody: {
    fields: {
      code: optional(stringRule({ minLength: 2, maxLength: 40, safe: false })),
      name: stringRule({ minLength: 2, maxLength: 120 }),
      category: optional(stringRule({ minLength: 2, maxLength: 80 })),
      unit: optional(stringRule({ minLength: 1, maxLength: 30, safe: false })),
      reorderLevel: optional(numberRule({ min: 0, max: 1000000 })),
      isActive: optional(booleanRule())
    }
  },
  itemUpdateBody: {
    fields: {
      code: optional(stringRule({ minLength: 2, maxLength: 40, safe: false })),
      name: optional(stringRule({ minLength: 2, maxLength: 120 })),
      category: optional(stringRule({ minLength: 2, maxLength: 80 })),
      unit: optional(stringRule({ minLength: 1, maxLength: 30, safe: false })),
      reorderLevel: optional(numberRule({ min: 0, max: 1000000 })),
      isActive: optional(booleanRule())
    },
    requireAtLeastOne: true
  },
  movementsListQuery: {
    fields: {
      ...paginationQuerySchema,
      limit: optional(integerRule({ min: 1, max: 200, coerceString: true })),
      q: optional(stringRule({ minLength: 1, maxLength: 120 })),
      itemId: optional(uuidRule()),
      movementType: optional(stringRule({ enumValues: inventoryMovementTypes, maxLength: 30 }))
    }
  },
  movementCreateBody: {
    fields: {
      itemId: uuidRule(),
      movementType: stringRule({ enumValues: inventoryMovementTypes, maxLength: 30 }),
      quantity: numberRule({ min: 0.01, max: 1000000 }),
      unitCost: optional(numberRule({ min: 0, max: 10000000 })),
      notes: optional(stringRule({ maxLength: 1000 })),
      movementDate: dateRule()
    }
  },
  idParams: idParamsSchema
};

const insuranceSchemas = {
  referenceDataQuery: {
    fields: {
      patientId: optional(uuidRule())
    }
  },
  providersListQuery: {
    fields: {
      ...paginationQuerySchema,
      limit: optional(integerRule({ min: 1, max: 200, coerceString: true })),
      q: optional(stringRule({ minLength: 1, maxLength: 120 })),
      active: optional(stringRule({ enumValues: ["true", "false"], maxLength: 5, safe: false }))
    }
  },
  providerCreateBody: {
    fields: {
      payerCode: optional(stringRule({ minLength: 2, maxLength: 40, safe: false })),
      name: stringRule({ minLength: 2, maxLength: 120 }),
      contactEmail: optional(emailRule()),
      contactPhone: optional(phoneRule()),
      portalUrl: optional(urlRule()),
      isActive: optional(booleanRule())
    }
  },
  providerUpdateBody: {
    fields: {
      payerCode: optional(stringRule({ minLength: 2, maxLength: 40, safe: false })),
      name: optional(stringRule({ minLength: 2, maxLength: 120 })),
      contactEmail: optional(emailRule()),
      contactPhone: optional(phoneRule()),
      portalUrl: optional(urlRule()),
      isActive: optional(booleanRule())
    },
    requireAtLeastOne: true
  },
  claimsListQuery: {
    fields: {
      ...paginationQuerySchema,
      limit: optional(integerRule({ min: 1, max: 200, coerceString: true })),
      q: optional(stringRule({ minLength: 1, maxLength: 120 })),
      status: optional(stringRule({ enumValues: insuranceClaimStatuses, maxLength: 30 })),
      patientId: optional(uuidRule()),
      providerId: optional(uuidRule()),
      invoiceId: optional(uuidRule())
    }
  },
  claimCreateBody: {
    fields: {
      providerId: uuidRule(),
      patientId: uuidRule(),
      doctorId: optional(uuidRule()),
      appointmentId: optional(uuidRule()),
      medicalRecordId: optional(uuidRule()),
      invoiceId: optional(uuidRule()),
      policyNumber: optional(stringRule({ minLength: 2, maxLength: 80, safe: false })),
      memberId: optional(stringRule({ minLength: 2, maxLength: 80, safe: false })),
      status: optional(stringRule({ enumValues: insuranceClaimStatuses, maxLength: 30 })),
      claimedAmount: optional(numberRule({ min: 0.01, max: 100000000 })),
      approvedAmount: optional(numberRule({ min: 0, max: 100000000 })),
      paidAmount: optional(numberRule({ min: 0, max: 100000000 })),
      diagnosisSummary: optional(stringRule({ maxLength: 2000 })),
      treatmentSummary: optional(stringRule({ maxLength: 2000 })),
      submittedDate: optional(dateRule()),
      responseDueDate: optional(dateRule()),
      approvedDate: optional(dateRule()),
      settledDate: optional(dateRule()),
      rejectionReason: optional(stringRule({ maxLength: 2000 })),
      notes: optional(stringRule({ maxLength: 2000 }))
    }
  },
  claimUpdateBody: {
    fields: {
      providerId: optional(uuidRule()),
      patientId: optional(uuidRule()),
      doctorId: optional(uuidRule()),
      appointmentId: optional(uuidRule()),
      medicalRecordId: optional(uuidRule()),
      invoiceId: optional(uuidRule()),
      policyNumber: optional(stringRule({ minLength: 2, maxLength: 80, safe: false })),
      memberId: optional(stringRule({ minLength: 2, maxLength: 80, safe: false })),
      status: optional(stringRule({ enumValues: insuranceClaimStatuses, maxLength: 30 })),
      claimedAmount: optional(numberRule({ min: 0.01, max: 100000000 })),
      approvedAmount: optional(numberRule({ min: 0, max: 100000000 })),
      paidAmount: optional(numberRule({ min: 0, max: 100000000 })),
      diagnosisSummary: optional(stringRule({ maxLength: 2000 })),
      treatmentSummary: optional(stringRule({ maxLength: 2000 })),
      submittedDate: optional(dateRule()),
      responseDueDate: optional(dateRule()),
      approvedDate: optional(dateRule()),
      settledDate: optional(dateRule()),
      rejectionReason: optional(stringRule({ maxLength: 2000 })),
      notes: optional(stringRule({ maxLength: 2000 }))
    },
    requireAtLeastOne: true
  },
  claimEventBody: {
    fields: {
      note: optional(stringRule({ maxLength: 2000 })),
      nextStatus: optional(stringRule({ enumValues: insuranceClaimStatuses, maxLength: 30 })),
      approvedAmount: optional(numberRule({ min: 0, max: 100000000 })),
      paidAmount: optional(numberRule({ min: 0, max: 100000000 })),
      rejectionReason: optional(stringRule({ maxLength: 2000 })),
      responseDueDate: optional(dateRule())
    },
    requireAtLeastOne: true
  },
  idParams: idParamsSchema
};

const notificationsSchemas = {
  updatePreferencesBody: {
    fields: {
      appointmentWhatsappEnabled: optional(booleanRule()),
      appointmentSmsEnabled: optional(booleanRule()),
      followUpWhatsappEnabled: optional(booleanRule()),
      followUpSmsEnabled: optional(booleanRule()),
      staffScheduleEmailEnabled: optional(booleanRule()),
      staffScheduleSmsEnabled: optional(booleanRule())
    },
    requireAtLeastOne: true
  },
  logsQuery: {
    fields: {
      limit: optional(integerRule({ min: 1, max: 200, coerceString: true })),
      notificationType: optional(stringRule({ enumValues: notificationTypes, maxLength: 40 })),
      channel: optional(stringRule({ enumValues: notificationChannels, maxLength: 20 })),
      status: optional(stringRule({ enumValues: notificationLogStatuses, maxLength: 20 }))
    }
  }
};

const commercialSchemas = {
  updatePricingBody: {
    fields: {
      planTier: optional(stringRule({ enumValues: ["starter", "growth", "enterprise"], maxLength: 20 })),
      basePlanPrice: optional(numberRule({ min: 0, max: 10000000 })),
      monthlyIncludedCredits: optional(integerRule({ min: 0, max: 1000000 })),
      lowBalanceThreshold: optional(integerRule({ min: 0, max: 1000000 })),
      topupPrice: optional(numberRule({ min: 0, max: 10000000 })),
      topupCreditAmount: optional(integerRule({ min: 1, max: 1000000 })),
      aiCreditsPerQuery: optional(integerRule({ min: 0, max: 1000 })),
      messageCreditsPerUnit: optional(integerRule({ min: 0, max: 1000 })),
      defaultAiCostPerQuery: optional(numberRule({ min: 0, max: 1000000 })),
      defaultMessageCostPerUnit: optional(numberRule({ min: 0, max: 1000000 }))
    },
    requireAtLeastOne: true
  },
  createTopUpBody: {
    fields: {
      packs: optional(integerRule({ min: 1, max: 1000 })),
      credits: optional(integerRule({ min: 1, max: 1000000 })),
      rupeeAmount: optional(numberRule({ min: 0, max: 10000000 })),
      note: optional(stringRule({ maxLength: 300 }))
    }
  },
  updatePlatformInfraBody: {
    fields: {
      usageMonth: optional(dateRule()),
      totalInfraCost: numberRule({ min: 0, max: 100000000 }),
      activeClinics: optional(integerRule({ min: 0, max: 1000000 })),
      notes: optional(stringRule({ maxLength: 500 }))
    }
  }
};

const aiSchemas = {
  askAssistantBody: {
    fields: {
      message: stringRule({ minLength: 2, maxLength: 4000, safe: false }),
      patientId: optional(uuidRule()),
      persona: optional(stringRule({ enumValues: ["staff", "patient"], maxLength: 20 })),
      workflow: optional(
        stringRule({
          enumValues: [
            "operations",
            "patient_summary",
            "follow_up",
            "billing",
            "appointment_help",
            "follow_up_help",
            "billing_help",
            "report_help"
          ],
          maxLength: 40
        })
      ),
      history: optional(aiChatHistoryRule)
    }
  },
  listPrescriptionSuggestionsQuery: {
    fields: {
      ...paginationQuerySchema,
      patientId: optional(uuidRule()),
      doctorId: optional(uuidRule()),
      appointmentId: optional(uuidRule()),
      medicalRecordId: optional(uuidRule()),
      status: optional(stringRule({ enumValues: ["generated", "accepted", "rejected"], maxLength: 20 }))
    }
  },
  generatePrescriptionSuggestionBody: {
    fields: {
      patientId: optional(uuidRule()),
      doctorId: optional(uuidRule()),
      appointmentId: optional(uuidRule()),
      medicalRecordId: optional(uuidRule()),
      symptoms: optional(stringRule({ maxLength: 2000, safe: false })),
      diagnosis: optional(stringRule({ maxLength: 2000, safe: false })),
      notes: optional(stringRule({ maxLength: 2000, safe: false }))
    },
    requireAtLeastOne: true
  },
  reviewPrescriptionSuggestionBody: {
    fields: {
      status: stringRule({ enumValues: ["accepted", "rejected"], maxLength: 20 }),
      reviewNote: optional(stringRule({ maxLength: 500, safe: false })),
      appointmentId: optional(uuidRule()),
      medicalRecordId: optional(uuidRule())
    }
  },
  idParams: idParamsSchema
};

const publicSchemas = {
  submitLeadBody: {
    fields: {
      activationType: optional(stringRule({ enumValues: ["demo", "trial"], maxLength: 20 })),
      fullName: stringRule({ minLength: 2, maxLength: 100, pattern: /^[a-zA-Z\s.'-]+$/ }),
      email: emailRule(),
      phone: phoneRule(),
      clinicName: stringRule({ minLength: 2, maxLength: 120 }),
      city: optional(stringRule({ minLength: 2, maxLength: 80 })),
      message: optional(stringRule({ minLength: 2, maxLength: 500 })),
      requestedPlanTier: optional(stringRule({ enumValues: ["starter", "growth", "enterprise"], maxLength: 20 })),
      demoDate: optional(dateRule()),
      demoTime: optional(timeRule()),
      demoTimezone: optional(stringRule({ minLength: 2, maxLength: 80, safe: false })),
      password: optional(passwordRule())
    }
  }
};

module.exports = {
  authSchemas,
  securitySchemas,
  branchesSchemas,
  patientsSchemas,
  doctorsSchemas,
  appointmentsSchemas,
  medicalRecordsSchemas,
  billingsSchemas,
  dashboardSchemas,
  crmSchemas,
  labSchemas,
  pharmacySchemas,
  inventorySchemas,
  insuranceSchemas,
  notificationsSchemas,
  commercialSchemas,
  aiSchemas,
  publicSchemas
};
