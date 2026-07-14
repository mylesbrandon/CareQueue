# CareQueue

## App structure

- `/` Adult Ops dashboard
- `/specialty` Ped / Newborn / NICU Ops dashboard
- `/teams` Teams & Nurses configuration
- `/runs` Assignment run review
- `/metrics` Metrics / Trends
- `/settings` Settings


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
