# Recipes, planner and integrations

This release extends the shared Meal library. All active accounts share recipes,
ratings, the To try collection, pantry staples and the meal planner. Shopping lists
retain their existing ownership and editor/viewer permissions.

## Review stages

1. **Recipe foundation:** `migrations/`, extended Meal schemas, `units.py`, recipe
   detail/editor screens, categories, tags, ratings and To try.
2. **Planning and shopping:** `routers/planner_router.py`, Planner/Library screens,
   versioned reviews, batch portions, suggestions and independent grocery contributions.
3. **Imports and portability:** `routers/recipes_router.py`, full URL drafts,
   ordered photo drafts, authenticated images/exports, and the Android file bridge.
4. **Calendar integration:** `integrations.py`, admin setup/status, persistent
   CalDAV jobs and `scripts/verify-nextcloud.py`.

## Using the features

- Open **Library → Recipes** to search names/descriptions/ingredients, filter tags or recipe
  category, limit total preparation/cooking time, and sort by shared rating.
- New recipes and imported drafts share an editor. Enter one method step per line.
  Leave an ingredient quantity blank when it is unknown or "to taste". Preparation
  notes and original recipe wording remain available in grocery source details.
- The detail page scales ingredients to selected servings, lets each user update
  their rating, manages the shared To try collection, and exports text or PDF.
  CSV and a PDF cookbook export all active recipes; cookbook pages include covers.
- **Planner** opens a Monday–Sunday week. Dinner starts enabled. Admins configure
  breakfast/lunch, timezone, meal times and duration in Settings → Planner.
  Existing slots retain their chosen times when defaults change.
- Plan a recipe, leftovers from an earlier cooking session, or a skip/eating-out
  note. Move/swap operations and removals have review screens. Removing a cooking
  session requires removing or reassigning its linked leftovers.
- Batch ingredients are purchased in the cooking week's grocery review. Portions
  include all linked leftover slots, including those in later weeks, exactly once.
- Suggestions fill empty positions and keep existing choices, pins, skips and
  leftovers. Explicit `vegetarian` and `fish` tags determine requested counts.
  Unrated recipes have weight 3/5. Recent exclusion defaults to one previous week;
  "Allow weekly repeat" exempts a recipe from that exclusion. Automatic selections
  do not duplicate recipes within the week. Unmet counts and empty positions are shown.
- **Usually have** in Library → Ingredients marks pantry staples. It does not track stock or expiry.
  **Basics** remains the existing regular-purchase checklist.
- Grocery reviews target a list the caller can edit. Pantry staples start excluded;
  include them individually during review. Any other ingredient can also be unticked as already available for this review. Quantities merge only for the same
  catalogue ingredient and explicit compatible units. Kilograms/grams and
  litres/millilitres convert; weight, volume and counts stay separate.
- Generated quantities are tracked independently from personal additions. An
  unchanged plan is a no-op. Reviews display reductions, removals and extra quantity
  after completion. Purchased and "Already have" rows stay completed. Clearing
  completed rows retains the planner's fulfilled amount. Renamed or re-unitised
  rows are preserved separately and identified in subsequent reviews.
- Recipe/planner reads are cached per account. Their changes, imports, exports and
  grocery commits require a connection. Existing shopping-item edits still use the
  durable offline outbox. Integration routes and exports are not service-worker cached.

The primary navigation is Shopping, Planner and Library. Legacy `/recipes`,
`/recipes/:id` and `/pantry` links redirect to the matching Library view. Recipe
IDs and API endpoints remain unchanged. Basics can be added directly from a
shopping list. Item options contain **Already have**; the main checkbox records a
purchase. Routine meal edits save immediately through the versioned planner API;
edits affecting linked leftovers still open a review.

## Integration setup

Configuration requires an administrator JWT obtained through interactive login;
API keys cannot read or change integration credentials. Saved secrets are never
returned. Credentials are encrypted with `DATA_DIR/integration.key`, a separately
created persistent key with mode 0600. Back it up along with the database/uploads.

Photo import is disabled until the administrator supplies a complete HTTPS
OpenAI-compatible **chat completions endpoint**, vision model and API key. No
provider is preselected. Upload one to five ordered JPEG, PNG or WebP images (up to
10 MB each, 30 MB total, 25 megapixels each). The remote provider receives these
images. Successful extraction opens an editable draft and retains originals as
reference images when saved; covers are uploaded separately. Extraction failures
leave the library unchanged and offer retry/manual entry.

Nextcloud setup accepts the canonical HTTPS installation URL, username and an app
password. Discover a writable calendar, or explicitly create **Meal Plan**.
This integration publishes the current week and future saved plans on connection.
Kitchen Cupboard owns its events: edits in Nextcloud are overwritten during
reconciliation, and deletions are repaired. Events have UTC instants calculated
from the configured local timezone, show as free, and contain no attendees or
alarms. They include an authenticated recipe link based on `PUBLIC_URL`.

The worker checks persistent jobs every 20 seconds and reconciles every 15 minutes.
Each event has an installation-specific stable UID and stored URL/ETag. Conditional
writes reread conflicts. Transient errors back off up to one hour; authentication
or permission failures pause processing until corrected. Settings shows pending
jobs, last success/error and Retry now. Disabling stops processing and retains
calendar events. Disconnecting also forgets the remote mapping and saved password,
leaving existing events in the old calendar; use a fresh dedicated calendar when
reconnecting after a disconnect.

All integration traffic validates TLS and rejects redirects with credentials.
For an internal HTTPS server, explicitly allow its hostname in the comma-separated
`INTEGRATION_LAN_HOSTS` server setting. A private CA can be supplied through the
standard `SSL_CERT_FILE` environment variable and a mounted CA bundle. This does
not disable TLS verification. Set `PUBLIC_URL` to the externally usable app origin.

References: [Nextcloud calendars](https://docs.nextcloud.com/server/stable/user_manual/en/groupware/calendar.html),
[Nextcloud app passwords](https://docs.nextcloud.com/server/stable/user_manual/en/session_management.html),
[CalDAV conditional writes](https://www.rfc-editor.org/rfc/rfc4791),
[iCalendar](https://www.rfc-editor.org/rfc/rfc5545).

## Migration and rollout

Startup runs Alembic revisions `0001` (frozen legacy baseline) and `0002` (recipe and
planner extensions). The baseline creates missing legacy tables and retains
existing tables/IDs. SQLite's batch migration makes recipe quantities nullable.
Clean installation and repeated startup use the same revisions. Automatic downgrade
is intentionally unavailable; restore the complete backup when rolling back.

Deployment is a separate operation:

1. Back up SQLite consistently, uploads, `integration.key` and the runtime
   environment without printing secrets. Keep an automatic rollback container.
2. Set `DATABASE_URL` and `DATA_DIR` to a **copy** of persistent data and run
   `python backend/migrate.py` with the normal server environment. Verify SQLite
   integrity and representative users, lists, recipes and ingredients in the copy.
3. Follow repository CI: both Test and Docker Hub workflows must pass before the
   official image is rolled out. Mount the existing persistent directory at `/app/data`.
4. Follow the repository Unraid checks: `/api/`, `/api/openapi.json`, the new recipe,
   planner/pantry/integration routes, database integrity, restart count and startup
   errors. Preserve Cloudflare's `/sw.js` cache bypass and purge the old script.
5. Enable optional integrations only after their credentials and target calendar
   have been reviewed in Settings. No production connection is needed to run tests.

## Validation commands

```sh
python -m pip install -r backend/requirements-dev.txt
python -m pytest -q backend/tests
cd frontend
npm ci
npm test
npm run build
npx playwright install chromium firefox
npm run test:e2e
cd ../android
./gradlew assembleDebug assembleDebugAndroidTest
./gradlew connectedDebugAndroidTest
```

Use Node 22.22.2+ (Node 24 also works), Python 3.12 and Java 17/Android SDK 35.
Browser tests use their own database; `KC_E2E_DATABASE_URL`, `KC_E2E_DATA_DIR` and
`KC_E2E_PYTHON` override test paths/interpreter. Run them serially because the planner
is intentionally shared. Android instrumentation uses a disposable emulator and
stubs system activity results to check ordered gallery selection, camera URI results
and writing authenticated export bytes through the document picker.

`python scripts/verify-nextcloud.py` is an opt-in live acceptance test. Its docstring
lists the environment inputs. Supply a disposable Nextcloud account and a disposable
application database/data directory. It creates and removes its own calendar.

Live photo extraction remains a separate verification step requiring a configured
vision endpoint/model and provider credentials. Mock-provider tests verify ordering,
draft-only behaviour, invalid responses, file limits and credential isolation.

## Local verification record (2026-09-14)

- Backend: 31 tests passed, including populated legacy migration, clean install/rerun,
  null quantities, compatible/incompatible unit aggregation, batch portions, shared
  permissions, stale/idempotent reviews, purchases and personal extras, pantry,
  ratings/search, archived planning history, photo drafts/errors/limits/secrets,
  and decoded PDF/CSV content.
- Frontend: 17 tests passed; production/PWA build passed.
- Playwright: 7 flows passed across Chromium and Firefox; one duplicate cross-user
  Firefox flow is intentionally skipped. Flows include recipe editing/scaling,
  authenticated PDF download, planner review, grocery generation, Already have,
  offline recipe/planner viewing and the existing offline shopping lifecycle.
- Live CalDAV: passed against a disposable Nextcloud 33.0.9 calendar over validated
  HTTPS with a generated app password. Covered discovery/create/update/move/delete,
  stable UID, remote edit/deletion repair, persisted jobs, authentication pause and
  recovery, and disable-leaves-events. The test calendar was removed afterward.
  Conditional-conflict and DST boundaries also have deterministic backend tests.
- Android: app and instrumentation APKs built; signature/package verified. Runtime
  instrumentation could not run because the host emulator segfaulted before boot.
  The development APK signer differs from 1.0.1; an in-place update needs the
  original keystore. See `android/releases/README.md`.
- Live vision-provider verification is pending configuration/credentials. No provider
  was selected automatically. Mock-provider extraction tests passed.
- No production rollout, production calendar connection, CI push or Unraid restart
  was performed.
