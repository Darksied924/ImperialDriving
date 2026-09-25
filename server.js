/**
 * Imperial Driving School — Express server entry point.
 */

require('dotenv').config();

const path = require('path');
const express = require('express');

const sessionConfig = require('./src/config/session');
const passport = require('./src/config/passport');

const authRoutes = require('./src/routes/auth.routes');
const healthRoutes = require('./src/routes/health.routes');
const adminRoutes = require('./src/routes/admin.routes'); // NEW

const { ensureAuthenticated, requireRole } = require('./src/middleware/auth');

const app = express();
const PORT = process.env.PORT || 5000;

process.on('unhandledRejection', (err) => {
  console.error('UNHANDLED REJECTION:', err);
});
process.on('uncaughtException', (err) => {
  console.error('UNCAUGHT EXCEPTION:', err);
});

// Trust proxy when behind HTTPS in production (needed for secure cookies).
if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}

// Views
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Body parsers
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Static assets
app.use(express.static(path.join(__dirname, 'public')));

// Sessions
app.use(sessionConfig);

// Passport
app.use(passport.initialize());
app.use(passport.session());

// Expose the current user to every view.
app.use((req, res, next) => {
  res.locals.user = req.user || null;
  next();
});

// Routes
app.use('/', healthRoutes);
app.use('/auth', authRoutes);
app.use('/admin', adminRoutes); // NEW

// Placeholder dashboards — replace with real routers later.
function placeholderDashboard(label) {
  return (req, res) => {
    res.send(`
      <!doctype html>
      <html lang="en">
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>${label} · Imperial Driving School</title>
        <style>
          body {
            font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
            max-width: 640px;
            margin: 60px auto;
            padding: 0 16px;
            color: #0f172a;
          }
          h1 { margin: 0 0 8px; font-size: 1.4rem; }
          p { color: #475569; }
          button {
            margin-top: 20px;
            padding: 10px 16px;
            border: 0;
            border-radius: 8px;
            background: #1d4ed8;
            color: #fff;
            font-size: 0.95rem;
            cursor: pointer;
          }
          button:hover { background: #1e40af; }
        </style>
      </head>
      <body>
        <h1>${label}</h1>
        <p>Welcome, <strong>${req.user.name}</strong> (${req.user.role}).</p>
        <form method="POST" action="/auth/logout">
          <button type="submit">Sign out</button>
        </form>
      </body>
      </html>
    `);
  };
}

app.get(
  '/admin/dashboard',
  ensureAuthenticated,
  requireRole('admin'),
  placeholderDashboard('Admin dashboard')
);

app.get(
  '/reception/dashboard',
  ensureAuthenticated,
  requireRole('reception', 'admin'),
  placeholderDashboard('Reception dashboard')
);

app.get(
  '/students/dashboard',
  ensureAuthenticated,
  requireRole('student'),
  placeholderDashboard('Student dashboard')
);
// 404
app.use((req, res) => {
  res.status(404).send('Not Found');
});

// Error handler
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).send('Internal Server Error');
});

app.listen(PORT, () => {
  console.log(`Imperial Driving School running on http://localhost:${PORT}`);
});