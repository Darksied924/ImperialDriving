// src/utils/receiptNumber.js
// Generates receipt numbers like RCP-2026-0001.
//
// Uses receipt_counters with an atomic upsert so concurrent payment
// inserts cannot collide on the same suffix. Postgres serializes the
// ON CONFLICT DO UPDATE on the year row — second caller blocks, then
// sees the incremented value and increments again. No race, no dupes,
// no unique-constraint 500s.
//
// Must be called with a transaction-scoped client so the counter
// increment and the payment INSERT commit (or roll back) together.
// If the payment insert fails, the counter rolls back too — no gaps.
// If it succeeds, the counter advances — the next call gets the next
// number. That's the audit-clean behavior: no gaps on failure, no
// duplicates on success.

async function generateReceiptNumber(client) {
  if (!client || typeof client.query !== 'function') {
    throw new Error('generateReceiptNumber requires a transaction client');
  }

  const year = new Date().getFullYear();

  const { rows } = await client.query(
    `INSERT INTO receipt_counters (year, last_value)
          VALUES ($1, 1)
     ON CONFLICT (year)
     DO UPDATE SET last_value = receipt_counters.last_value + 1
       RETURNING last_value`,
    [year]
  );

  const seq = rows[0].last_value;
  return `RCP-${year}-${String(seq).padStart(4, '0')}`;
}

module.exports = { generateReceiptNumber };
