-- 014_add_course_min_deposit_and_receipt_counters.sql
-- Phase 6 (Payments + Receipts) prerequisites.
--
-- 1. courses.min_first_deposit
--    Minimum amount required on a student's FIRST payment for that course.
--    Defaults to 0 so existing courses and newly-created courses start
--    permissive; admins set the real minimum via the Courses admin UI.
--
-- 2. receipt_counters
--    Per-year counter table mirroring admission_counters. Enables
--    RCP-YYYY-NNNN receipt numbers that reset on Jan 1 each year,
--    matching the IMP-YYYY-NNNN admission-number behavior.

ALTER TABLE courses
  ADD COLUMN min_first_deposit NUMERIC(12,2) NOT NULL DEFAULT 0
    CHECK (min_first_deposit >= 0);

CREATE TABLE receipt_counters (
  year       INTEGER PRIMARY KEY,
  last_value INTEGER NOT NULL DEFAULT 0
);
