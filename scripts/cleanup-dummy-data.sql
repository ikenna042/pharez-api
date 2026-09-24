-- ============================================================================
-- Remove dummy/test data, keep everything real (Sep 21+ Aba Power usage).
--
-- Take a snapshot first:
--   node src/database/migrations/snapshot.js --out backups/pre-cleanup
--
-- Expected row counts, confirmed by an actual dry run of this exact script
-- (executed inside a transaction and rolled back) on 2026-09-24. If your
-- numbers differ meaningfully, something has changed since this script was
-- written -- stop and re-verify before running for real:
--   installation_request  DELETE  122   (import_batch_id IN (1,2), the two
--                                        13OCT25.xlsx test batches)
--   meters                 DELETE  6151  (import_batch_id = 4, EXCLUDING 14
--                                        meters real installations still use)
--   assignment_batches     DELETE  8    (created 2026-09-07; meter_assignments
--                                        cascade-delete with them)
--   export_batches         DELETE  3    (the three Sep-7 test exports)
--   jed_customer_request   DELETE  20   (all of it -- shared fake phone/email)
--   users                  DELETE  4    (Super Admin, Jane Admin, Hannah Odi,
--                                        Ada Chinda -- NOT Mike Installer, who
--                                        is still installer_id on 2 kept
--                                        assignment batches + 8 kept
--                                        meter_assignments rows)
--   otps, api_key_logs     DELETE  all  (ephemeral, no business meaning)
--
-- Note on the meter count: a static pre-count of "meters no real installation
-- references" found 17 survivors, not 14. The difference is 3 meters that were
-- installed on Sep-7 TEST jobs -- they looked "still needed" only because a
-- Sep-7 installation_request row still pointed at them at count time. Step 1
-- below deletes those Sep-7 rows first, so by the time step 2 runs its own
-- "still referenced" check, those 3 meters are correctly recognised as
-- unneeded and swept up too. This is the exclusion subquery working as
-- intended, not a bug -- it reflects what's ACTUALLY still needed after the
-- prior steps ran, not a number frozen before this script started.
--
-- Deliberately NOT touched: the 14 shared meters (excluded automatically, not
-- by a hardcoded list); import_batches rows themselves (audit metadata, and
-- the survivors still reference batch #4 -- a NO ACTION FK that would reject
-- deleting it anyway); discos; active meter_types; api_keys;
-- users_id_migration_map (the UUID-migration audit trail).
--
-- One transaction. Every foreign key here is NO ACTION (Postgres's default
-- for a bare REFERENCES, with no auto-null), so if anything still points at a
-- row this script tries to remove, the whole thing rolls back untouched
-- rather than partially applying.
-- ============================================================================

BEGIN;

-- 1a. Detach any meter's back-reference to a Sep-7 installation about to be
--     deleted. meters.installation_request_id is a NO ACTION FK -- without
--     this, deleting an installation that was actually completed (1 of the
--     122) fails outright, because the meter used on it still points back.
UPDATE meters SET installation_request_id = NULL
WHERE installation_request_id IN (SELECT id FROM installation_request WHERE import_batch_id IN (1, 2));

-- 1b. Sep-7 test pending-installations (13OCT25.xlsx + its duplicate-upload
--     test). Runs before step 2, so step 2's "still referenced" check
--     reflects only real, kept installations.
DELETE FROM installation_request WHERE import_batch_id IN (1, 2);

-- 2. Sep-7 test meter inventory (Meter + Simcards.xlsx), excluding any meter
--    a real, kept installation still points to.
DELETE FROM meters
WHERE import_batch_id = 4
  AND id NOT IN (SELECT meter_id FROM installation_request WHERE meter_id IS NOT NULL);

-- 3. Defensive: detach any surviving meter from a batch about to be deleted.
--    meters.assignment_batch_id is NO ACTION, so without this, step 4 could
--    fail depending on which meters happened to survive step 2.
UPDATE meters SET assignment_batch_id = NULL WHERE assignment_batch_id IN (1,2,3,4,5,6,7,8);

-- 4. Sep-7 test assignment batches. meter_assignments rows tied to them
--    cascade-delete automatically.
DELETE FROM assignment_batches WHERE id IN (1,2,3,4,5,6,7,8);

-- 5. Sep-7 test export batches.
DELETE FROM export_batches WHERE id IN (1,2,3);

-- 6. JED test requests: every row shares the same placeholder phone, and all
--    but one share the same placeholder email.
DELETE FROM jed_customer_request
WHERE gsm = '+2348036233685' OR email = 'customer@example.com';

-- 7. The fixture accounts. Computed once into fixture_ids so every detach
--    step below and the final DELETE agree on exactly the same set --
--    Mike Installer is excluded here because he is still installer_id (a
--    NOT NULL column) on real, kept assignment_batches/meter_assignments rows.
DO $$
DECLARE
  fixture_ids uuid[];
BEGIN
  SELECT array_agg(id) INTO fixture_ids
  FROM users
  WHERE email LIKE '%@pharezapi.com'
    AND id NOT IN (
      SELECT installer_id FROM assignment_batches
      UNION
      SELECT installer_id FROM meter_assignments
    );

  -- Attribution-only columns. Nulling these loses "who did this" on old rows
  -- (including real Sep 21+ rows, since Jane Admin ran those imports) but
  -- touches no business content -- no status, no amount, nothing operational.
  UPDATE api_keys SET created_by = NULL WHERE created_by = ANY(fixture_ids);
  UPDATE assignment_batches SET assigned_by = NULL WHERE assigned_by = ANY(fixture_ids);
  UPDATE discos SET created_by = NULL WHERE created_by = ANY(fixture_ids);
  UPDATE discos SET updated_by = NULL WHERE updated_by = ANY(fixture_ids);
  UPDATE export_batches SET generated_by = NULL WHERE generated_by = ANY(fixture_ids);
  UPDATE import_batches SET uploaded_by = NULL WHERE uploaded_by = ANY(fixture_ids);
  UPDATE installation_request SET assigned_by = NULL WHERE assigned_by = ANY(fixture_ids);
  UPDATE installation_request SET assigned_to = NULL WHERE assigned_to = ANY(fixture_ids);
  UPDATE installation_request SET created_by = NULL WHERE created_by = ANY(fixture_ids);
  UPDATE installation_request SET installed_by = NULL WHERE installed_by = ANY(fixture_ids);
  UPDATE meter_types SET created_by = NULL WHERE created_by = ANY(fixture_ids);
  UPDATE meter_types SET updated_by = NULL WHERE updated_by = ANY(fixture_ids);
  UPDATE meters SET assigned_to = NULL WHERE assigned_to = ANY(fixture_ids);
  UPDATE meters SET uploaded_by = NULL WHERE uploaded_by = ANY(fixture_ids);

  DELETE FROM users WHERE id = ANY(fixture_ids);

  RAISE NOTICE 'Removed % fixture user(s)', COALESCE(array_length(fixture_ids, 1), 0);
END $$;

-- 8. Ephemeral tables -- no business meaning either way.
DELETE FROM otps;
DELETE FROM api_key_logs;

COMMIT;

-- ============================================================================
-- Required manual follow-up (not part of this script): zero SUPERADMIN
-- accounts remain after this runs. Promote a real one:
--
--   UPDATE users SET role = 'SUPERADMIN' WHERE phone = '<their phone>';
-- ============================================================================
