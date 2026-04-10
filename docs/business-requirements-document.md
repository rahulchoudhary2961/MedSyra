# Business Requirements Document

## Document Control

- Product: `MedSyra`
- Document version: `2.0`
- Document date: `2026-04-09`
- Document basis: current implementation in `backend/src`, `frontend/src`, SQL migrations in `backend/migrations`, and end-to-end flows in `frontend/tests/e2e`

## 1. Executive Summary

MedSyra is a multi-module clinic operations platform for small to mid-sized healthcare organizations. The product is designed to replace paper registers, fragmented spreadsheets, informal WhatsApp coordination, and disconnected billing tools with one operational workspace.

The implemented product already covers the full outpatient operational loop:

- lead capture and trial activation
- organization and staff access
- patients and doctors
- appointments and reminders
- medical records and follow-ups
- billing and payments
- CRM follow-up work
- lab, pharmacy, inventory, and insurance operations
- notifications, AI workflows, security oversight, and commercial credit tracking

The business goal is not only digitization. MedSyra is also positioned as a monetized SaaS with subscription pricing, credit-based AI and messaging usage, and clinic-level profitability visibility.

## 2. Source-Based Product Positioning

This BRD is based on the product as it exists in code today, not on a future concept deck.

Primary evidence used:

- `backend/src/routes`
- `backend/src/services`
- `backend/migrations`
- `frontend/src/app/dashboard`
- `frontend/tests/e2e/clinic-workflows.spec.ts`
- `frontend/tests/e2e/operations-workflows.spec.ts`

## 3. Business Problem

The product addresses these recurring clinic business problems:

- patient and visit data spread across paper, spreadsheets, and memory
- weak front-desk control over appointments, follow-ups, and no-shows
- delayed collections and poor invoice visibility
- low visibility into workload, revenue, and return-risk patients
- inconsistent reminder workflows
- difficulty coordinating lab, pharmacy, stock, and insurance around the same patient
- growing demand for automation without making the software harder to use

## 4. Business Goals

- Centralize day-to-day clinic workflows in one application.
- Reduce manual administrative effort at reception, billing, and care coordination layers.
- Improve appointment conversion, follow-up adherence, and collections.
- Give management and admins branch-aware visibility into revenue, workload, and operational bottlenecks.
- Support clinic growth through staff accounts, branch management, and modular operations.
- Monetize automation through subscription pricing plus credit-based AI and messaging usage.
- Convert website traffic into real demo requests or provisioned trial accounts.

## 5. Product Vision

MedSyra should function as the operating system for outpatient clinic operations. The product should be simple enough for reception staff and structured enough for management, while still supporting doctor workflows, patient communication, revenue control, and expansion into lab, pharmacy, and insurance operations.

## 6. Target Customers and Users

### Target organizations

- solo doctors
- single-branch clinics
- multi-doctor outpatient clinics
- small healthcare groups with multiple branches
- growing organizations that need one operational system across front desk, doctor, billing, and admin teams

### Primary user personas

- Clinic owner / administrator
- Management user
- Receptionist
- Front desk / nurse
- Doctor
- Billing staff

### Secondary system actors

- Patients receiving reminders, payment links, and follow-up communication
- Internal operations users managing pricing, credits, templates, campaigns, and staff access

## 7. Role Model

The implemented role model is:

- `admin`: full organizational access
- `management`: full organizational access
- `receptionist`: front-office workflow access
- `nurse`: front-desk workflow access
- `doctor`: doctor-facing operational and record access
- `billing`: billing, insurance, and payment-focused access

High-level access rules in current code:

- full-access roles control staff, settings, branches, reports, notifications, security, and pricing
- reception and front-desk roles manage patients and appointments
- doctors can access patients, appointments, CRM, lab, medical records, AI assistant, and doctor tools
- billing users access billing, pharmacy, inventory, and insurance

## 8. Scope Summary

| Module | Business purpose | Primary users | Current state |
| --- | --- | --- | --- |
| Public website | Capture demos and direct trial starts | Prospects | Implemented |
| Authentication | Signup, signin, verification, reset, staff setup | All users | Implemented |
| Dashboard | Daily operations, smart insights, queues | Admin, management, reception, doctor | Implemented |
| Patients | Register, search, update, profile view | Admin, reception, doctor | Implemented |
| Doctors | Doctor profile and availability management | Admin | Implemented |
| Appointments | Booking, walk-ins, status changes, reminders, no-shows | Admin, reception, doctor | Implemented |
| Medical records | Consultation records, attachments, follow-up reminders | Admin, doctor, reception for viewing | Implemented |
| Billing | Invoice lifecycle, payments, refunds, payment links, reconciliation | Admin, billing | Implemented |
| CRM | Follow-up tasking and smart recall intelligence | Admin, reception, doctor | Implemented |
| Lab | Test catalog, lab orders, report upload/download | Admin, reception, doctor | Implemented |
| Pharmacy | Medicine catalog, batches, dispensing, stock insights | Admin, billing, reception, doctor | Implemented |
| Inventory | Item catalog and stock movements | Admin, billing, reception | Implemented |
| Insurance | Provider master, claim queue, claim events | Admin, billing | Implemented |
| Notifications | Preferences, templates, campaigns, logs | Admin | Implemented |
| AI assistant | Natural-language clinic operations assistant | Admin, reception, doctor | Implemented |
| AI prescription support | Draft prescription suggestions with review workflow | Admin, doctor | Implemented |
| Doctor tools | Prescription workspace, templates, favorite medicines | Admin, doctor | Implemented |
| Branch management | Multi-branch scoping and staff assignment | Admin, management | Implemented |
| Security | Audit logs and security overview | Admin | Implemented |
| Commercial engine | Pricing rules, wallet, credits, top-ups, infra cost tracking | Admin | Implemented |
| Messages | Staff/patient chat UI | All users | UI placeholder only, not backend-backed |

## 9. End-to-End Business Workflows

The codebase and Playwright coverage confirm these core journeys:

1. Prospect books a demo from the landing page.
2. Prospect starts a free trial and a clinic admin account is provisioned immediately.
3. Admin signs in and accesses the dashboard.
4. Staff member is created and receives setup access by email.
5. Reception registers a patient.
6. Reception books an appointment or walk-in for that patient.
7. Doctor or staff completes the consultation and records outcomes.
8. Medical record follow-up action is scheduled and reminder delivery can be triggered.
9. Billing team creates, issues, and collects on an invoice.
10. Clinic sends appointment reminders, follow-up reminders, or marketing campaigns through configured channels.
11. CRM tracks recall tasks and patients who have not returned.
12. Lab order is created and report is attached to the order.
13. Pharmacy stock is created, batched, and dispensed to a patient.
14. Inventory item stock movement is recorded.
15. Insurance provider is created and claim lifecycle is tracked against a patient and invoice.
16. Management reviews reports, predictive analytics, and profitability.

## 10. Functional Requirements

### 10.1 Lead capture and activation

- The website must allow visitors to submit a demo request with preferred date and time.
- The website must allow visitors to start a trial directly.
- Trial creation must provision an organization and admin account, not just create a lead record.
- Lead records must store activation type, status, clinic details, city, follow-up date, and linkage to created organization/user where applicable.
- The system must support automated follow-up processing for due leads.

### 10.2 Organization, authentication, and staff management

- Users must belong to an organization.
- Email verification must be supported before normal use is considered complete.
- Password reset must be supported.
- Full-access users must be able to create staff members with assigned roles and branch assignments.
- The system must support resending staff setup emails.
- Staff notification preferences for daily schedule delivery must be editable.

### 10.3 Branch management

- Full-access users must be able to create and update branches.
- Core operational modules must support branch-aware reads and writes.
- Staff accounts must be assignable to a branch.
- Reports and dashboards must respect branch scope.

### 10.4 Patient management

- Staff must be able to create, search, view, and update patients.
- Patient profile access must show connected clinical and operational context.
- Patient search must support patient code, name, phone, and email.
- The system must generate organization-specific patient codes.
- Duplicate handling currently allows multiple patients with the same phone number.
- Email duplication remains the enforced patient identity constraint in current implementation.
- Patients must be soft-deletable by authorized users.

### 10.5 Doctor management

- Full-access users must be able to create and update doctor profiles.
- Doctor records must include specialty, fee, contact details, and operational availability data.
- Doctors must be linkable to staff/user context for workflow restrictions and AI context.

### 10.6 Appointment management

- Reception and authorized staff must be able to create, update, and cancel appointments.
- The product must support walk-in and standard appointment flows.
- Appointment statuses must cover pending, checked-in, completed, cancelled, and no-show handling.
- Time slot conflicts must be prevented.
- Appointment reminders must be sendable from the appointment workflow.
- No-show handling must support email and SMS notification attempts where configured.
- Doctors must see upcoming workload relevant to them.

### 10.7 Medical records

- Doctors and full-access users must be able to create and update medical records.
- Records must store consultation details including symptoms, diagnosis, prescription, notes, and follow-up dates.
- Attachments must be uploaded and retrieved through authenticated endpoints only.
- Follow-up reminders must be triggerable from medical records.
- Follow-up reminder status must be tracked against records.

### 10.8 Dashboard and operational oversight

- The dashboard must show daily summary cards for appointments, revenue, pending payments, and no-shows.
- The dashboard must expose action-required queues for collections, follow-ups, lab readiness, and insurance follow-up.
- The dashboard must show CRM-style recall and follow-up queues.
- The dashboard must surface smart insights such as patients who did not return, common issues, weekly revenue, and follow-ups due today.

### 10.9 Billing and payments

- Billing users must be able to create, edit, issue, and delete invoices as allowed by role.
- The invoice lifecycle must support draft, issued, partially paid, paid, overdue, and refunded scenarios.
- Staff must be able to record payments and refunds.
- The system must generate invoice PDF output.
- The system must support reconciliation reporting.
- The system must support online payment links for invoices through Razorpay.
- Incoming payment-link webhook events must reconcile into invoice payments.

### 10.10 CRM

- Staff must be able to create CRM tasks linked to patients.
- CRM tasks must support follow-up due dates, task type, priority, notes, and status updates.
- The product must expose smart follow-up intelligence for recall and outreach planning.

### 10.11 Lab operations

- The lab module must support a managed test catalog.
- Staff must be able to create lab orders for patients.
- Lab orders must support notes, status changes, and report upload/download.
- The lab workflow must stay branch-aware.

### 10.12 Pharmacy operations

- Full-access users must manage medicine master data.
- Full-access users must manage medicine batches and stock entries.
- Authorized staff must be able to dispense medicines to patients.
- Pharmacy insights must expose reorder and usage visibility.
- Dispense flows must be traceable to patient context.

### 10.13 Inventory operations

- Full-access users must manage inventory items.
- Authorized operational users must record stock movements.
- Inventory should support categories, units, reorder levels, movement type, unit cost, and notes.

### 10.14 Insurance operations

- Billing and full-access users must manage insurance provider master data.
- Billing and full-access users must create insurance claims tied to patient and invoice context.
- Claim lifecycle updates must support events and status transitions.
- Insurance work must be visible as a queue, not only as raw records.

### 10.15 Notifications center

- Full-access users must control notification preferences by channel and use case.
- Preferences must support appointment reminders, follow-up reminders, staff schedule notifications, and campaigns.
- The system must support notification templates.
- Templates must support placeholders and condition-tag-based selection.
- The system must support campaigns against defined patient audiences.
- Notification logs must record sent and failed deliveries.

### 10.16 Staff notification workflows

- Staff daily schedule notifications must support email and SMS channels.
- Organization-level preferences and staff-level preferences must both be considered before sending.

### 10.17 AI assistant

- Authorized users must be able to ask operational questions in natural language.
- The assistant must use clinic summary, recent activity, branch context, and optional patient context.
- The assistant must provide short operational answers rather than generic chatbot behavior.

### 10.18 AI prescription support and doctor tools

- Doctors and full-access users must be able to generate AI prescription suggestions for review.
- AI output must remain a draft requiring clinician review.
- The system must support review status for AI-generated suggestions.
- Doctors must have access to a prescription workspace, reusable prescription templates, and favorite medicines.

### 10.19 Reports and analytics

- Reports must support multiple periods such as 7d, 30d, 90d, and 12m.
- Reports must provide operational, billing, doctor, disease-pattern, and revenue views.
- Reports must provide predictive views for revisit likelihood, disease trends, and revenue forecasting.
- Reports must support export behavior suitable for business review.
- Full-access users must also see commercial wallet and profitability data in reports.

### 10.20 Commercial engine

- Each organization must have pricing configuration and a credit wallet.
- Monthly included credits must be granted.
- AI and message usage must consume credits.
- The product must track top-up credits and top-up revenue.
- The product must calculate total revenue, total cost, and clinic-level profitability.
- Admins must be able to update pricing rules, perform manual top-ups, and maintain shared infra cost inputs.
- Low-balance state must be visible.

### 10.21 Security and audit

- Full-access users must be able to view security overview metrics.
- Audit logs must support filtering by module, outcome, and destructive actions.
- Destructive and administrative actions must be recorded for review.

## 11. Core Business Rules

- Data is scoped by organization.
- Operational modules are branch-aware where branch management is enabled.
- Only authorized roles may access or mutate each module.
- Appointment booking must prevent double-booking conflicts.
- Medical record attachments must not be publicly exposed.
- Patient phone number is no longer a uniqueness rule.
- Patient email remains the active duplicate check.
- AI and messaging usage is intended to consume wallet credits.
- Online payments currently apply to invoices, not to MedSyra subscription billing itself.
- Notification delivery depends on both organization preferences and provider configuration.

## 12. External Integrations

Current code indicates the following integration points:

- `Brevo` for transactional email
- `YCloud` for WhatsApp reminders and campaigns
- `httpSMS` as the default SMS provider, with `Twilio` retained as optional compatibility fallback
- `NVIDIA API` for AI assistant and AI prescription generation
- `Razorpay` for invoice payment links and webhook-based payment reconciliation
- `PostgreSQL` as the primary system of record
- optional `Redis` support for caching

## 13. Reporting and KPI Requirements

Operational KPIs required by the current product:

- today appointments
- today revenue
- pending payments
- no-shows
- completion rate
- cancellation rate
- collection rate
- pending invoice count and amount
- average invoice value
- average payment value
- refunded amount
- top doctors by workload and revenue
- outstanding invoice queue
- disease patterns and diagnosis frequency
- revisit prediction and recall risk
- revenue forecasting
- wallet balance, credits consumed, top-up revenue, infra cost, and profit amount

## 14. Non-Functional Requirements

- secure authentication and role-based authorization
- organization and branch data isolation
- auditable operational changes
- reliable background processing for reminders, lead follow-up, and payment webhooks
- responsive UI for desktop and mobile clinic usage
- acceptable performance for dashboard, reports, and search-heavy screens
- safe handling of protected medical attachments
- provider-aware notification failure logging
- operational continuity even when some metadata calls partially fail

## 15. Success Metrics

- demo request conversion rate
- trial creation rate
- verified trial completion rate
- monthly active organizations
- appointment booking and completion volume
- follow-up reminder usage
- collection rate improvement
- no-show reduction
- AI query consumption
- messaging consumption
- top-up revenue per clinic
- clinic-level profitability

## 16. Current Gaps and Honest Constraints

The current codebase also shows clear gaps that should not be hidden in a real BRD:

- The `Messages` page is currently a static UI mock and is not backed by API routes or persisted conversations.
- Public commercial collection for MedSyra subscriptions is not implemented; the commercial engine is internal and manual.
- Lead capture exists in the backend, but there is no dedicated internal lead-management dashboard yet.
- Some clinic/profile settings in the Settings UI are stored locally in the browser and are not authoritative server-side organization settings.
- Patient-facing self-service portals are not implemented.
- API throttling policy needs to be redesigned before hard production rollout because the previous limiter behavior was relaxed during stabilization.

## 17. Out of Scope for the Current Product Baseline

- inpatient / hospital bed management
- operation theatre workflows
- EHR interoperability standards integration
- payer clearinghouse automation
- full omnichannel chat platform
- patient mobile app or patient portal
- automated subscription billing for MedSyra SaaS plans
- super-admin control plane across all tenant organizations

## 18. Recommended Next Priorities

- build an internal lead-management and activation operations dashboard
- replace the placeholder Messages screen with a real backed communication model or remove it from navigation
- move clinic profile settings from local browser state to server-backed organization settings
- define a production-grade abuse-protection and throttling policy
- add customer-facing subscription billing for MedSyra plans if commercialization is intended beyond manual operations
- add migration/import tooling for patients, doctors, invoices, and stock masters
- add a super-admin layer for multi-tenant business operations if MedSyra will be sold at scale

## 19. Conclusion

MedSyra is no longer just a basic clinic CRUD app. The codebase already supports a broad operating model: activation, branch-aware operations, clinical and administrative workflows, patient communication, analytics, AI assistance, and an internal commercial engine.

The real business requirement now is to make that breadth operationally trustworthy. The next phase is less about adding random modules and more about tightening product maturity around lead management, persistent settings, messaging, production controls, and commercial rollout.
