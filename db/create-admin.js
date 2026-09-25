#!/usr/bin/env node
/**
 * Creates the first admin user.
 *
 * Usage:
 *   ADMIN_EMAIL=admin@imperial.local \
 *   ADMIN_PASSWORD='StrongPass123!' \
 *   node db/create-admin.js
 *
 * Optional: ADMIN_FIRST_NAME, ADMIN_LAST_NAME
 */

require('dotenv').config();
const bcrypt = require('bcryptjs');
const pool = require('../src/config/db');

const SALT_ROUNDS = 12;

async function main() {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  const firstName = process.env.ADMIN_FIRST_NAME || 'System';
  const lastName = process.env.ADMIN_LAST_NAME || 'Admin';

  if (!email || !password) {
    console.error('ADMIN_EMAIL and ADMIN_PASSWORD are required.');
    process.exit(1);
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Look up the admin role.
    const { rows: roleRows } = await client.query(
      `SELECT id FROM roles WHERE name = $1 LIMIT 1`,
      ['admin']
    );
    if (roleRows.length === 0) {
      throw new Error('Role "admin" not found. Run the role seeds first.');
    }
    const roleId = roleRows[0].id;

    // Bail if the user already exists.
    const { rows: existing } = await client.query(
      `SELECT id FROM users WHERE email = $1 LIMIT 1`,
      [email]
    );
    if (existing.length > 0) {
      await client.query('ROLLBACK');
      console.log(`User ${email} already exists. Nothing to do.`);
      return;
    }

    const hash = await bcrypt.hash(password, SALT_ROUNDS);

    await client.query(
      `INSERT INTO users
         (role_id, email, password_hash, first_name, last_name, status)
       VALUES ($1, $2, $3, $4, $5, 'active')`,
      [roleId, email, hash, firstName, lastName]
    );

    await client.query('COMMIT');
    console.log(`Admin created: ${email}`);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Failed to create admin:', err.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main();