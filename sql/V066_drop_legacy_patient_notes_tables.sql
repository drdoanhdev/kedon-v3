-- V066: Drop legacy patient notes tables after V065 cutover
-- Preconditions:
-- 1) V065_simplify_patient_notes_single_table.sql has been executed.
-- 2) Application code has switched to patient_notes_simple.

DROP TABLE IF EXISTS patient_contact_tasks_history;
DROP TABLE IF EXISTS patient_alerts_history;
DROP TABLE IF EXISTS patient_contact_tasks;
DROP TABLE IF EXISTS patient_alerts;
