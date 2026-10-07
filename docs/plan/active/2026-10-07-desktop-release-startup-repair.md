---
tags:
  - plan
  - active
description: Repair Desktop release startup and Windows ASAR verification exposed by v0.15.0 gates
created: 2026-10-07T20:35:00Z
updated: 2026-10-07T20:35:00Z
---

# Desktop release startup repair

The authorized milestone release reached immutable tag `v0.15.0` at
`6e723387ffc10b1b4a0eade421774b36c6feed28`, but release run `37679879727`
correctly kept it Draft when Desktop acceptance failed. Production remains v0.14.1.

## Observed failures

- The Linux AppImage process throws `DATABASE_URL or DB_HOST must be set before
  initializing PrismaClient` before creating a window. Importing the Goal owner
  root without either variable reproduces the same exception. Goal and Task
  Prisma adapters import generated Prisma values through the database singleton
  entrypoint; Desktop selects PowerSync adapters but still evaluates that import.
- Windows ASAR inventory finds Winston's CommonJS is-stream package, but its
  extraction call uses POSIX separators. The ASAR implementation traverses
  paths with the host `path.sep`, causing a false missing-file error on Windows.
- macOS startup and installed-update failures must be rechecked after the same
  dependency repair; do not assume all platform failures have one cause.

## Work and acceptance

1. Add red owner-entrypoint import tests with database environment absent.
2. Import Prisma values from the existing generated-client subpath without
   instantiating the server singleton; preserve injected database ownership.
3. Normalize the ASAR extraction path for the host. Keep closure/version checks.
4. Verify focused tests, types/lint, actual packaged Desktop startup, and the
   existing Windows/Linux installed-update gates. Preserve unsigned-pilot.
5. Review and merge the repair, publish corrective v0.15.1 through all exact-SHA
   gates, then deploy and finish the already-authorized workspace cleanup.

The v0.15.0 tag must not move and its incomplete Draft must not be published.
No synthetic database configuration will be added to Desktop to hide the defect.
