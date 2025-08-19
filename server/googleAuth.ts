import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import type { Express } from "express";
import { storage } from "./storage";

/**
 * Setup Google OAuth authentication
 */
export async function setupGoogleAuth(app: Express) {
  // Configure Google OAuth strategy
  passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID!,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    callbackURL: "/api/auth/google/callback"
  },
  async (accessToken, refreshToken, profile, done) => {
    try {
      // Extract user information from Google profile
      const googleEmail = profile.emails?.[0]?.value;
      const firstName = profile.name?.givenName;
      const lastName = profile.name?.familyName;
      const profileImageUrl = profile.photos?.[0]?.value;

      if (!googleEmail) {
        return done(new Error('No email found in Google profile'), false);
      }

      // Check if user already exists by Google ID first
      let user = await storage.getUserByGoogleId(profile.id);
      
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
    passport.authenticate('google', { 
      failureRedirect: '/?auth=failed' 
    }),
    (req, res) => {
      // Successful authentication
      res.redirect('/?auth=success');
    }
  );
}