// src/routes/vehicles.routes.js
//
// Vehicles admin routes. Mounted at /admin/vehicles (see server.js). Admin-only.
//
// Follows the same pattern as courses.routes.js:
//   service → validation → views → audit.
//
// Validators return an array of error strings (see middleware/validation.js).
// On validation failure we re-derive form state from req.body so the admin
// keeps what they typed. On success we build a typed payload for the service.
//
// actorFromReq(req) threads ip_address / user_agent into every audit row.
//
// 7 routes:
//   GET  /vehicles              list (with ?deleted=1 to show deleted)
//   GET  /vehicles/new          create form
//   POST /vehicles              create
//   GET  /vehicles/:id/edit     edit form
//   POST /vehicles/:id          update
//   POST /vehicles/:id/delete   soft delete
//   POST /vehicles/:id/reactivate

const express = require('express');
const router = express.Router();

const { ensureAuthenticated, requireRole } = require('../middleware/auth');
const {
  validateNewVehicle,
  validateVehicleUpdate,
} = require('../middleware/validation');
const vehicleService = require('../services/vehicle.service');

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (v) => UUID_RE.test(v);

// Form state for re-render on validation failure — string-ish values that
// round-trip cleanly into the EJS form inputs.
function formStateFromBody(body = {}) {
  const s = (v) => (v == null ? '' : String(v).trim());
  return {
    registration_number: s(body.registration_number).toUpperCase(),
    make:                s(body.make),
    model:               s(body.model),
    year:                s(body.year),
    color:               s(body.color),
    transmission:        s(body.transmission),
    status:              s(body.status) || 'available',
    notes:               s(body.notes),
  };
}

// Typed payload for the service — numbers where numbers belong, nulls where
// blanks are allowed.
function payloadFromBody(body = {}) {
  const s = formStateFromBody(body);
  return {
    registration_number: s.registration_number,
    make:                s.make         || null,
    model:               s.model        || null,
    year:                s.year === '' ? null : parseInt(s.year, 10),
    color:               s.color        || null,
    transmission:        s.transmission || null,
    status:              s.status       || 'available',
    notes:               s.notes        || null,
  };
}

// Audit context passed to the service.
function actorFromReq(req) {
  return {
    userId:    req.user.id,
    ipAddress: req.ip || null,
    userAgent: req.get('user-agent') || null,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Guards — apply to every route below. Admin-only.
// ─────────────────────────────────────────────────────────────────────────────

router.use(ensureAuthenticated, requireRole('admin'));

// ─────────────────────────────────────────────────────────────────────────────
// GET /admin/vehicles — list
// ─────────────────────────────────────────────────────────────────────────────

router.get('/', async (req, res, next) => {
  try {
    const showDeleted = req.query.deleted === '1';
    const vehicles = await vehicleService.listVehicles({ includeDeleted: showDeleted });

    res.render('admin/vehicles', {
      title: 'Vehicles',
      user: req.user,
      basePath: req.baseUrl,   // "/admin/vehicles"
      vehicles,
      showDeleted,
      errors: [],
      active: 'vehicles',
    });
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /admin/vehicles/new — create form
// ─────────────────────────────────────────────────────────────────────────────

router.get('/new', (req, res) => {
  res.render('admin/vehicle-form', {
    title: 'New Vehicle',
    user: req.user,
    basePath: req.baseUrl,
    mode: 'create',
    vehicle: {
      registration_number: '',
      make: '', model: '', year: '', color: '',
      transmission: '', status: 'available', notes: '',
    },
    errors: [],
    active: 'vehicles',
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /admin/vehicles — create
// ─────────────────────────────────────────────────────────────────────────────

router.post('/', async (req, res, next) => {
  const errors = validateNewVehicle(req.body);

  if (errors.length) {
    return res.status(400).render('admin/vehicle-form', {
      title: 'New Vehicle',
      user: req.user,
      basePath: req.baseUrl,
      mode: 'create',
      vehicle: formStateFromBody(req.body),
      errors,
      active: 'vehicles',
    });
  }

  try {
    await vehicleService.createVehicle(payloadFromBody(req.body), actorFromReq(req));
    res.redirect(req.baseUrl);
  } catch (err) {
    if (err.code === '23505') {
      const reg = formStateFromBody(req.body).registration_number;
      return res.status(400).render('admin/vehicle-form', {
        title: 'New Vehicle',
        user: req.user,
        basePath: req.baseUrl,
        mode: 'create',
        vehicle: formStateFromBody(req.body),
        errors: [`A vehicle with registration "${reg}" already exists.`],
        active: 'vehicles',
      });
    }
    if (err.code === '23514' || err.code === '22P02') {
      return res.status(400).render('admin/vehicle-form', {
        title: 'New Vehicle',
        user: req.user,
        basePath: req.baseUrl,
        mode: 'create',
        vehicle: formStateFromBody(req.body),
        errors: ['One of the selected values is not allowed.'],
        active: 'vehicles',
      });
    }
    next(err);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /admin/vehicles/:id/edit — edit form
// ─────────────────────────────────────────────────────────────────────────────

router.get('/:id/edit', async (req, res, next) => {
  if (!isUuid(req.params.id)) return res.status(404).send('Not Found');

  try {
    const vehicle = await vehicleService.getVehicleById(req.params.id);
    if (!vehicle) return res.status(404).send('Not Found');

    res.render('admin/vehicle-form', {
      title: `Edit ${vehicle.registration_number}`,
      user: req.user,
      basePath: req.baseUrl,
      mode: 'edit',
      vehicle: {
        id:                  vehicle.id,
        registration_number: vehicle.registration_number,
        make:                vehicle.make  || '',
        model:               vehicle.model || '',
        year:                vehicle.year == null ? '' : String(vehicle.year),
        color:               vehicle.color || '',
        transmission:        vehicle.transmission || '',
        status:              vehicle.status || 'available',
        notes:               vehicle.notes || '',
      },
      errors: [],
      active: 'vehicles',
    });
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /admin/vehicles/:id — update
// ─────────────────────────────────────────────────────────────────────────────

router.post('/:id', async (req, res, next) => {
  if (!isUuid(req.params.id)) return res.status(404).send('Not Found');

  const errors = validateVehicleUpdate(req.body);

  if (errors.length) {
    return res.status(400).render('admin/vehicle-form', {
      title: 'Edit Vehicle',
      user: req.user,
      basePath: req.baseUrl,
      mode: 'edit',
      vehicle: { ...formStateFromBody(req.body), id: req.params.id },
      errors,
      active: 'vehicles',
    });
  }

  try {
    const updated = await vehicleService.updateVehicle(
      req.params.id,
      payloadFromBody(req.body),
      actorFromReq(req)
    );

    if (!updated) return res.status(404).send('Not Found');

    res.redirect(req.baseUrl);
  } catch (err) {
    if (err.code === '23505') {
      const reg = formStateFromBody(req.body).registration_number;
      return res.status(400).render('admin/vehicle-form', {
        title: 'Edit Vehicle',
        user: req.user,
        basePath: req.baseUrl,
        mode: 'edit',
        vehicle: { ...formStateFromBody(req.body), id: req.params.id },
        errors: [`A vehicle with registration "${reg}" already exists.`],
        active: 'vehicles',
      });
    }
    if (err.code === '23514' || err.code === '22P02') {
      return res.status(400).render('admin/vehicle-form', {
        title: 'Edit Vehicle',
        user: req.user,
        basePath: req.baseUrl,
        mode: 'edit',
        vehicle: { ...formStateFromBody(req.body), id: req.params.id },
        errors: ['One of the selected values is not allowed.'],
        active: 'vehicles',
      });
    }
    next(err);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /admin/vehicles/:id/delete — soft delete
// ─────────────────────────────────────────────────────────────────────────────

router.post('/:id/delete', async (req, res, next) => {
  if (!isUuid(req.params.id)) return res.status(404).send('Not Found');

  try {
    const deleted = await vehicleService.softDeleteVehicle(
      req.params.id,
      actorFromReq(req)
    );
    if (!deleted) return res.status(404).send('Not Found');
    res.redirect(req.baseUrl);
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /admin/vehicles/:id/reactivate — un-delete
// ─────────────────────────────────────────────────────────────────────────────

router.post('/:id/reactivate', async (req, res, next) => {
  if (!isUuid(req.params.id)) return res.status(404).send('Not Found');

  try {
    const vehicle = await vehicleService.reactivateVehicle(
      req.params.id,
      actorFromReq(req)
    );
    if (!vehicle) return res.status(404).send('Not Found');
    res.redirect(req.baseUrl + '?deleted=1');
  } catch (err) {
    next(err);
  }
});

module.exports = router;
