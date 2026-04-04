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
      dueDate: optional(dateRule()),
      status: optional(stringRule({ enumValues: invoiceStatuses, maxLength: 20 })),
      notes: optional(stringRule({ maxLength: 1000 }))
    }
  },
  updateBody: {
    fields: {
      description: optional(stringRule({ minLength: 2, maxLength: 200 })),
      amount: optional(numberRule({ min: 0.01, max: 10000000 })),
      items: optional(invoiceItemsRule),
      dueDate: optional(dateRule()),
      status: optional(stringRule({ enumValues: invoiceStatuses, maxLength: 20 })),
      notes: optional(stringRule({ maxLength: 1000 }))
    },
    requireAtLeastOne: true
  },
  issueBody: {
    fields: {
      dueDate: optional(dateRule())
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
  idParams: idParamsSchema
};

const dashboardSchemas = {
  reportsQuery: {
    fields: {
      period: optional(stringRule({ enumValues: reportPeriods, maxLength: 10 }))
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
      patientId: optional(uuidRule())
    }
  }
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
  patientsSchemas,
  doctorsSchemas,
  appointmentsSchemas,
  medicalRecordsSchemas,
  billingsSchemas,
  dashboardSchemas,
  commercialSchemas,
  aiSchemas,
  publicSchemas
};
