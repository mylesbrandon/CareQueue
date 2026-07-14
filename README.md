# CareQueue

CareQueue is now structured as a Next.js operations app rather than a static browser prototype.

## App structure

- `/` Adult Ops dashboard
- `/specialty` Ped / Newborn / NICU Ops dashboard
- `/teams` Teams & Nurses configuration
- `/runs` Assignment run review
- `/metrics` Metrics / Trends
- `/settings` Settings

The app shell uses a fixed left sidebar and an ops-first desktop layout. The home page is the Adult Ops dashboard.

## Key workflow

1. Open the workspace dashboard.
2. Generate draft assignments.
3. Review grouped assignments by nurse.
4. Inspect overflow and aging alerts.
5. Override as needed.
6. Publish assignments.

## Local development

1. Install dependencies:
   `npm install`
2. Start the app:
   `npm run dev`
3. Open:
   `http://localhost:3000`

## Notes

- The current app uses deterministic demo data for adult and specialty workspaces.
- The case detail experience is implemented as an in-dashboard drawer, not a separate page.
- Teams & Nurses is an editable admin-style table meant to model eligibility inputs.
