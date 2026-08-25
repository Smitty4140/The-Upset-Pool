import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import type { Express } from "express";
import { storage } from "./storage";

/**
 * Setup Google OAuth authentication
 */
export async function setupGoogleAuth(app: Express) {
  // Get the domain from environment variables
  const domain = process.env.REPLIT_DOMAINS?.split(',')[0] || 'localhost:5000';
  const protocol = domain.includes('localhost') ? 'http' : 'https';
  const callbackURL = `${protocol}://${domain}/api/auth/google/callback`;

  console.log('Google OAuth callback URL:', callbackURL);

  // Configure Google OAuth strategy
  passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID!,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    callbackURL: callbackURL
  },
  async (accessToken, refreshToken, profile, done) => {
    try {
      console.log('Google OAuth callback received for profile:', profile.id);
      
      // Extract user information from Google profile
      const googleEmail = profile.emails?.[0]?.value;
      const firstName = profile.name?.givenName;
      const lastName = profile.name?.familyName;
      const profileImageUrl = profile.photos?.[0]?.value;

      console.log('Google profile email:', googleEmail);

      if (!googleEmail) {
        console.error('No email found in Google profile');
        return done(new Error('No email found in Google profile'), false);
      }

      // Check if user already exists by Google ID first
      let user = await storage.getUserByGoogleId(profile.id);
      console.log('Existing user by Google ID:', user ? 'found' : 'not found');
      
      if (user) {
        // User exists with this Google ID, update if needed
        user = await storage.updateUser(user.id, {
          email: googleEmail,
          firstName: firstName || user.firstName,
          lastName: lastName || user.lastName,
          profileImageUrl: profileImageUrl || user.profileImageUrl,
        });
      } else {
        // Check if user exists by email
        const existingUser = await storage.getUserByEmail(googleEmail);
        
        if (existingUser) {
          // Link Google account to existing email user
          user = await storage.updateUser(existingUser.id, {
            googleId: profile.id,
            firstName: firstName || existingUser.firstName,
            lastName: lastName || existingUser.lastName,
            profileImageUrl: profileImageUrl || existingUser.profileImageUrl,
          });
        } else {
          // Create new user
          const userId = `google_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
          user = await storage.createUser({
            id: userId,
            email: googleEmail,
            username: googleEmail, // Use email as username for Google users
            googleId: profile.id,
            firstName: firstName || null,
            lastName: lastName || null,
            profileImageUrl: profileImageUrl || null,
            emailVerified: true, // Google accounts are pre-verified
          });
        }
      }

      return done(null, user);
    } catch (error) {
      console.error('Google OAuth error:', error);
      return done(error, false);
    }
  }));

  // Google OAuth routes
  app.get('/api/auth/google',
    passport.authenticate('google', { 
      scope: ['profile', 'email'] 
    })
  );

  app.get('/api/auth/google/callback',
    (req, res, next) => {
      console.log('Google callback route hit, query params:', req.query);
      next();
    },
    passport.authenticate('google', { 
      failureRedirect: '/?auth=failed'
    }),
    (req, res) => {
      console.log('Google OAuth successful, user authenticated');
      res.redirect('/?auth=success');
    }
  );
}