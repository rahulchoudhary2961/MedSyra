# Business Requirements Document

## Project

- Product name: `MedSyra`
- Document version: `Draft 1`
- Date: `2026-04-04`

## 1. Executive Summary

MedSyra is a clinic management SaaS platform designed for India-focused healthcare practices. It brings together appointments, patient records, billing, reminders, reporting, AI assistance, and a credit-based commercial engine in one product.

The core business aim is to help clinics replace manual or fragmented workflows with a single operational system while creating a sustainable recurring-revenue model through subscriptions and usage-based automation.

## 2. Business Objective

- Digitize core clinic operations in one platform.
- Reduce front-desk and administrative workload.
- Improve appointment coordination, follow-up adherence, and billing collection.
- Provide management visibility through reports and operational dashboards.
- Monetize advanced automation features through subscription plans plus credit usage.
- Convert website visitors into demos or active trials through a real activation flow.

## 3. Problem Statement

Many clinics still operate across paper registers, spreadsheets, WhatsApp messages, and disconnected tools. This creates recurring business problems:

- Missed appointments and weak follow-up discipline
- Poor payment tracking and delayed collections
- Limited visibility into revenue, no-shows, and clinic performance
- High manual effort for staff
- Low willingness to adopt software that feels complex or fragmented

## 4. Target Users

- Solo doctors
- Small and medium outpatient clinics
- Multi-doctor practices
- Reception and front-desk staff
- Billing staff
- Clinic admins and management
- Doctors who need patient history and AI-supported operational insight

## 5. Product Vision

MedSyra should become the operating system for small and growing clinics by combining:

- daily workflow execution
- staff usability
- healthcare record access
- payment visibility
- automation and reminders
- commercial transparency for the business running the software

## 6. Product Scope

The current and near-term product scope includes:

- public website and activation flow
- organization and user authentication
- role-based access control
- patient management
- doctor management
- appointment management
- medical records with attachment support
- billing and payment workflows
- dashboard and advanced reports
- AI assistant for clinic operations
- WhatsApp reminder workflows
- commercial engine for pricing, wallets, credits, and profitability
- lead capture, demo scheduling, and trial activation

## 7. Core Business Requirements

### 7.1 Organization and User Management

- The system must support organization-based multi-user access.
- Users must be able to sign up and belong to a clinic or healthcare organization.
- The system must support multiple roles including admin, receptionist, doctor, nurse, billing, and management.
- Access to features must be limited based on role.
- Email verification must be supported before active use.

### 7.2 Patient Management

- Staff must be able to create, search, edit, and view patients.
- Patient identity handling should reduce duplicate entry risk.
- Patient profiles should provide operational history and related activity context.

### 7.3 Doctor Management

- Admin users must be able to create and manage doctor records.
- Doctor profiles should support specialty and availability information.
- Doctor-linked scheduling constraints should support appointment workflow quality.

### 7.4 Appointment Management

- Staff must be able to book, reschedule, cancel, and complete appointments.
- Walk-in workflows must be supported.
- The system must track status changes including no-shows.
- Reminder generation should support operational follow-up.

### 7.5 Medical Records

- Clinics must be able to create and manage medical records tied to patients and doctors.
- Medical records must support follow-up planning.
- Attachments must not be publicly exposed and should only be retrievable through authenticated access.

### 7.6 Billing and Payment Management

- Staff must be able to create invoices and line items.
- The system must support invoice issuing, payment recording, refunds, and balance tracking.
- Outstanding receivables must be visible for follow-up and reporting.

### 7.7 Reporting and Operational Visibility

- Authorized users must be able to access dashboard summaries and detailed reports.
- Reports should show operational, billing, and clinical performance metrics.
- Exportable reporting outputs should be available for business use.

### 7.8 AI Assistant

- Authorized users must be able to ask operational questions in natural language.
- AI outputs must use clinic-context data rather than generic answers.
- AI usage must be controlled and monetized through the credit system.

### 7.9 Messaging and Reminders

- The system must support WhatsApp-based reminders and follow-up messages.
- Messaging activity must be tracked as product usage.
- Messaging usage must consume credits from the clinic wallet.

### 7.10 Commercial Engine

- Each clinic must have an assigned plan and pricing configuration.
- Each clinic must have a credit wallet.
- Monthly included credits, top-ups, and usage debits must be tracked.
- Commercial profitability must be visible per clinic based on revenue and cost.
- The system must support top-ups and internal cost tracking for AI, messaging, and infra.

### 7.11 Lead Conversion and Activation

- Website visitors must be able to request a demo with a preferred date and time.
- Website visitors must be able to start a free trial directly.
- Demo and trial requests must be stored as real leads with statuses.
- Trial activation must provision a clinic admin account rather than only sending a callback request.
- The system must support follow-up reminders for pending leads.

## 8. Functional Modules

### 8.1 Public Website

- Product marketing
- pricing presentation
- demo request flow
- free-trial activation flow

### 8.2 Authentication

- signup
- signin
- verify email
- password reset

### 8.3 Dashboard

- summary metrics
- operational overview

### 8.4 Patients

- patient CRUD
- search and profile access

### 8.5 Doctors

- doctor CRUD
- role linking and availability details

### 8.6 Appointments

- booking
- updates
- completion
- reminder support
- no-show handling

### 8.7 Medical Records

- record creation and update
- attachment storage and secure retrieval
- follow-up support

### 8.8 Billing

- invoice management
- payment recording
- receivable tracking

### 8.9 Reports

- clinic reporting
- export support
- commercial profitability view

### 8.10 AI Assistant

- operational Q&A
- patient-aware and clinic-aware usage

### 8.11 Messaging

- WhatsApp reminders
- follow-up messaging

### 8.12 Commercial Engine

- plan configuration
- wallet management
- top-ups
- usage debits
- profitability tracking

### 8.13 Lead Management Backend

- lead capture
- status tracking
- follow-up reminders
- trial provisioning linkage

## 9. Commercial Model

The current business model is a hybrid of subscription revenue and usage expansion revenue.

### Subscription Tiers

- `Starter: Rs. 799 / month`
- `Growth: Rs. 1499 / month`
- `Enterprise: custom pricing`

### Credit Logic

- monthly credits are included based on plan
- AI queries consume credits
- WhatsApp reminders consume credits
- clinics can purchase top-up packs

### Business Intent

- keep entry pricing simple and accessible
- monetize automation usage as clinics grow
- track profitability per clinic rather than relying only on revenue

## 10. Non-Functional Requirements

- secure authenticated access to protected modules
- role-based authorization for operational safety
- private handling of medical-record attachments
- rate limiting and abuse protection on public and protected APIs
- responsive UI for common clinic devices
- stable monthly commercial calculations
- auditable ledger-style credit transaction storage
- testable backend services and production build validation

## 11. Success Metrics

- visitor-to-demo conversion rate
- visitor-to-trial activation rate
- trial-to-verified-user conversion rate
- monthly active clinics
- appointment completion rate
- no-show rate reduction
- collection rate improvement
- AI and messaging credit usage per clinic
- top-up revenue per clinic
- monthly profitability per clinic

## 12. Current Strengths

- broad clinic workflow coverage already exists
- commercial engine is now implemented
- AI and messaging are tied to wallet credits
- reporting includes operational and commercial visibility
- landing-page activation flow now supports demo scheduling and direct trial creation
- medical-record attachments are secured behind authenticated access

## 13. Risks and Gaps

- legal and trust documentation still needs completion
- internal CRM or lead-management UI is not yet present
- trial onboarding is functional but still basic
- healthcare trust and compliance positioning needs stronger documentation
- import and migration tooling is still limited

## 14. Recommended Next Phase

- add an internal lead management dashboard
- add onboarding tasks after trial activation
- add import tools for patient and billing migration
- add trust-center, privacy, and terms pages
- add real subscription/payment collection flows
- add super-admin operational visibility across organizations

## 15. Conclusion

MedSyra is positioned as an operational SaaS for clinics that combines workflow execution, reporting, reminders, AI assistance, and commercial monetization in one product. The product already supports the foundations of clinic digitization and now includes both a commercial engine and a real activation flow. The next business step is to improve trust, onboarding maturity, and internal lead handling so sales and conversion become more repeatable.
