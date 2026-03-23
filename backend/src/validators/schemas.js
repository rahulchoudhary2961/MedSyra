const {
  optional,
  stringRule,
  integerRule,
  numberRule,
  uuidRule,
  emailRule,
  phoneRule,
  dateRule,
  timeRule,
  passwordRule,
  urlRule
} = require("./rules");
const { USER_ROLES } = require("../constants/roles");

const roles = Object.values(USER_ROLES);
const appointmentStatuses = ["confirmed", "pending", "completed", "cancelled"];
const medicalRecordStatuses = ["completed", "pending review", "in progress"];
const patientStatuses = ["active", "follow-up", "pending", "inactive"];
const doctorStatuses = ["available", "busy", "off duty", "off-duty"];
const bloodTypes = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];
const invoiceStatuses = ["draft", "issued", "partially_paid", "paid", "overdue", "void"];
const paymentMethods = ["cash", "card", "bank_transfer", "insurance", "upi", "other"];

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
  resetPasswordBody: {
    fields: {
      email: emailRule(),
      token: stringRule({ minLength: 64, maxLength: 64, pattern: /^[a-f0-9]+$/, safe: false, lowercase: true }),
      newPassword: passwordRule()
    }
  }
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
      rating: optional(numberRule({ min: 0, max: 5 })),
      patientCount: optional(integerRule({ min: 0, max: 1000000 })),
      status: optional(stringRule({ enumValues: doctorStatuses, maxLength: 30 }))
    }
  }
};

const appointmentsSchemas = {
  listQuery: {
    fields: {
      ...paginationQuerySchema,
      q: optional(stringRule({ minLength: 1, maxLength: 120 })),
      date: optional(dateRule()),
      startDate: optional(dateRule()),
      endDate: optional(dateRule()),
      doctorId: optional(uuidRule()),
      status: optional(stringRule({ enumValues: appointmentStatuses, maxLength: 20 })),
      order: optional(stringRule({ enumValues: ["asc", "desc"], maxLength: 4 }))
    }
  },
  createBody: {
    fields: {
      patientId: uuidRule(),
      doctorId: uuidRule(),
      appointmentDate: dateRule(),
      appointmentTime: timeRule(),
      appointmentType: stringRule({
        enumValues: ["checkup", "follow-up", "followup", "consultation", "surgery", "emergency"],
        maxLength: 30
      }),
      status: optional(stringRule({ enumValues: appointmentStatuses, maxLength: 20 })),
      notes: optional(stringRule({ maxLength: 1000 })),
      feeAmount: optional(numberRule({ min: 0, max: 1000000 }))
    }
  },
  updateBody: {
    fields: {
      patientId: optional(uuidRule()),
      doctorId: optional(uuidRule()),
      appointmentDate: optional(dateRule()),
      appointmentTime: optional(timeRule()),
      appointmentType: optional(
        stringRule({
          enumValues: ["checkup", "follow-up", "followup", "consultation", "surgery", "emergency"],
          maxLength: 30
        })
      ),
      status: optional(stringRule({ enumValues: appointmentStatuses, maxLength: 20 })),
      notes: optional(stringRule({ maxLength: 1000 })),
      feeAmount: optional(numberRule({ min: 0, max: 1000000 }))
    },
    requireAtLeastOne: true
  },
  idParams: idParamsSchema,
  updateStatusParams: idParamsSchema,
  updateStatusBody: {
    fields: {
      status: stringRule({ enumValues: appointmentStatuses, maxLength: 20 })
    }
  }
};

const medicalRecordsSchemas = {
  listQuery: {
    fields: {
      ...paginationQuerySchema,
      q: optional(stringRule({ minLength: 1, maxLength: 120 })),
      status: optional(stringRule({ enumValues: medicalRecordStatuses, maxLength: 30 }))
    }
  },
  createBody: {
    fields: {
      patientId: uuidRule(),
      doctorId: uuidRule(),
      recordType: stringRule({ minLength: 2, maxLength: 100 }),
      status: optional(stringRule({ enumValues: medicalRecordStatuses, maxLength: 30 })),
      recordDate: dateRule(),
      notes: optional(stringRule({ maxLength: 2000 })),
      fileUrl: optional(urlRule())
    }
  },
  updateBody: {
    fields: {
      patientId: optional(uuidRule()),
      doctorId: optional(uuidRule()),
      recordType: optional(stringRule({ minLength: 2, maxLength: 100 })),
      status: optional(stringRule({ enumValues: medicalRecordStatuses, maxLength: 30 })),
      recordDate: optional(dateRule()),
      notes: optional(stringRule({ maxLength: 2000 })),
      fileUrl: optional(urlRule())
    },
    requireAtLeastOne: true
  }
  ,
  idParams: idParamsSchema
};

const billingsSchemas = {
  listQuery: {
    fields: {
      ...paginationQuerySchema,
      q: optional(stringRule({ minLength: 1, maxLength: 120 })),
      status: optional(stringRule({ enumValues: invoiceStatuses, maxLength: 20 }))
    }
  },
  createBody: {
    fields: {
      patientId: uuidRule(),
      doctorId: optional(uuidRule()),
      appointmentId: optional(uuidRule()),
      description: stringRule({ minLength: 2, maxLength: 200 }),
      amount: numberRule({ min: 0.01, max: 10000000 }),
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
      status: optional(stringRule({ enumValues: ["completed", "failed", "refunded"], maxLength: 20 })),
      paidAt: optional(stringRule({ minLength: 10, maxLength: 40, safe: false }))
    }
  },
  idParams: idParamsSchema
};

module.exports = {
  authSchemas,
  patientsSchemas,
  doctorsSchemas,
  appointmentsSchemas,
  medicalRecordsSchemas,
  billingsSchemas
};
