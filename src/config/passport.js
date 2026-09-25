/**
 * Passport configuration.
 * Exports a fully configured passport instance.
 */

const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const authService = require('../services/auth.service');

passport.use(
  new LocalStrategy(
    { usernameField: 'email', passwordField: 'password' },
    async (email, password, done) => {
      try {
        const user = await authService.findByEmail(email);

        // Generic failure message — do not reveal which field was wrong.
        const invalid = () => done(null, false, { message: 'Invalid email or password.' });

        if (!user) return invalid();
        if (!user.is_active) return invalid();

        const ok = await authService.verifyPassword(user, password);
        if (!ok) return invalid();

        return done(null, authService.toSessionUser(user));
      } catch (err) {
        return done(err);
      }
    }
  )
);

// Only the user id is stored in the session.
passport.serializeUser((user, done) => done(null, user.id));

// On each request, reload the user from the database.
passport.deserializeUser(async (id, done) => {
  try {
    const user = await authService.findById(id);
    if (!user) {
      console.warn('deserializeUser: no user found for id', id);
      return done(null, false);
    }
    done(null, authService.toSessionUser(user));
  } catch (err) {
    console.error('deserializeUser error:', err.message);
    done(err);
  }
});

module.exports = passport;
