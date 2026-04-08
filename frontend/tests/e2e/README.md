## Playwright E2E

Install dependencies and browsers:

```bash
npm install
npm run test:e2e:install
```

Run the smoke suite:

```bash
npm run test:e2e
```

Authenticated specs are loaded automatically from the first env file that exists in this order:

1. `.env.playwright.local`
2. `.env.playwright`
3. `.env.local`

If you want the full authenticated suite to run without exporting shell variables each time, copy `frontend/.env.playwright.example` to `frontend/.env.playwright` and fill in:

```bash
PLAYWRIGHT_TEST_EMAIL=your-test-user@example.com
PLAYWRIGHT_TEST_PASSWORD=your-password
```

For authenticated workflows, make sure the backend is running and reachable at the same API base URL used by the frontend. In your current local setup that means `NEXT_PUBLIC_API_BASE_URL` should point to your local backend, for example `http://localhost:5000/api/v1`.

Run with the interactive Playwright UI:

```bash
npm run test:e2e:ui
```

Optional authenticated test:

```bash
$env:PLAYWRIGHT_TEST_EMAIL="your-test-user@example.com"
$env:PLAYWRIGHT_TEST_PASSWORD="your-password"
npm run test:e2e
```

Current suite coverage:

- public smoke pages
- authenticated dashboard access
- patients
- appointments
- billing and payments
- medical records
- doctors
- CRM
- lab
- inventory
- pharmacy
- insurance
- authenticated dashboard route loads for reports, settings, branches, assistant, and messages

If you already have the app running elsewhere, point Playwright at it:

```bash
$env:PLAYWRIGHT_BASE_URL="http://localhost:3000"
npm run test:e2e
```
