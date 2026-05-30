import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { Express } from "express";
import session from "express-session";
import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { storage } from "./storage";
import { User as SelectUser, InsertUser } from "@shared/schema";
import connectPg from "connect-pg-simple";

declare global {
  namespace Express {
    interface User extends SelectUser {}
  }
}

const scryptAsync = promisify(scrypt);

async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const buf = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${buf.toString("hex")}.${salt}`;
}

async function comparePasswords(supplied: string, stored: string) {
  const [hashed, salt] = stored.split(".");
  const hashedBuf = Buffer.from(hashed, "hex");
  const suppliedBuf = (await scryptAsync(supplied, salt, 64)) as Buffer;
  return timingSafeEqual(hashedBuf, suppliedBuf);
}

export function setupAuth(app: Express) {
  const sessionTtl = 7 * 24 * 60 * 60 * 1000; // 1 week
  const pgStore = connectPg(session);
  const sessionStore = new pgStore({
    conString: process.env.DATABASE_URL,
    createTableIfMissing: false,
    ttl: sessionTtl,
    tableName: "sessions",
  });

  const sessionSettings: session.SessionOptions = {
    secret: process.env.SESSION_SECRET!,
    resave: false,
    saveUninitialized: false,
    store: sessionStore,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      maxAge: sessionTtl,
      sameSite: 'lax', // Allow cross-site requests
    },
  };

  app.set("trust proxy", 1);
  app.use(session(sessionSettings));
  app.use(passport.initialize());
  app.use(passport.session());

  passport.use(
    new LocalStrategy(
      {
        usernameField: "email", // Use email as username field
      },
      async (email, password, done) => {
        try {
          const user = await storage.getUserByEmail(email);
          if (!user || !user.password || !(await comparePasswords(password, user.password))) {
            return done(null, false, { message: "Invalid email or password" });
          }
          return done(null, user);
        } catch (error) {
          return done(error);
        }
      }
    )
  );

  // Configure Google OAuth strategy with dynamic callback URL based on request
  console.log('Google Client ID:', process.env.GOOGLE_CLIENT_ID ? 'Set' : 'NOT SET');
  console.log('Google Client Secret:', process.env.GOOGLE_CLIENT_SECRET ? 'Set' : 'NOT SET');

  passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID!,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    callbackURL: '/api/auth/google/callback', // Use relative URL
    passReqToCallback: true
  },
  async (req, accessToken, refreshToken, profile, done) => {
    try {
      console.log('Google OAuth callback received for profile:', profile.id);
      
      // Extract user information from Google profile
      const rawGoogleEmail = profile.emails?.[0]?.value;
      const firstName = profile.name?.givenName;
      const lastName = profile.name?.familyName;
      const profileImageUrl = profile.photos?.[0]?.value;

      console.log('Google profile email:', rawGoogleEmail);

      if (!rawGoogleEmail) {
        console.error('No email found in Google profile');
        return done(new Error('No email found in Google profile'), false);
      }

      // Normalize email to lowercase for consistent handling
      const googleEmail = rawGoogleEmail.toLowerCase();

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
          console.log('Linked Google account to existing user:', user.id);
          
          // Note: Users now join leagues manually via invite code after registration
          console.log('User needs to join a league manually:', user.id);
        } else {
          // Create new user without username - they'll need to set it
          const userId = `google_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
          user = await storage.createUser({
            id: userId,
            email: googleEmail,
            username: null, // No username initially - user must set it
            googleId: profile.id,
            firstName: firstName || null,
            lastName: lastName || null,
            profileImageUrl: profileImageUrl || null,
            emailVerified: true, // Google accounts are pre-verified
            totalPoints: "0"
          });

          console.log('Created new Google user (needs username and league):', user.id);
          // Note: Users now join leagues manually via invite code after registration
        }
      }

      console.log('Google OAuth user processed:', user.id);
      return done(null, user);
    } catch (error) {
      console.error('Google OAuth error:', error);
      return done(error, false);
    }
  }));

  passport.serializeUser((user, done) => done(null, user.id));
  passport.deserializeUser(async (id: string, done) => {
    try {
      const user = await storage.getUser(id);
      done(null, user);
    } catch (error) {
      done(error);
    }
  });

  app.post("/api/register", async (req, res, next) => {
    try {
      const { email, password, username, firstName, lastName } = req.body;

      // Validate input
      if (!email || !password || !username) {
        return res.status(400).json({ message: "Email, password, and username are required" });
      }

      if (password.length < 6) {
        return res.status(400).json({ message: "Password must be at least 6 characters long" });
      }

      // Normalize email to lowercase for consistent checking
      const normalizedEmail = email.toLowerCase();
      
      // Check if user already exists
      const existingUserByEmail = await storage.getUserByEmail(normalizedEmail);
      if (existingUserByEmail) {
        return res.status(400).json({ message: "User with this email already exists" });
      }

      const existingUserByUsername = await storage.getUserByUsername(username);
      if (existingUserByUsername) {
        return res.status(400).json({ message: "Username already taken" });
      }

      // Create user
      const hashedPassword = await hashPassword(password);
      const userId = `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      const newUser = await storage.createUser({
        id: userId,
        email: normalizedEmail,
        password: hashedPassword,
        username,
        firstName: firstName || null,
        lastName: lastName || null,
        profileImageUrl: null,
        totalPoints: "0",
        emailVerified: false,
        receiveNotifications: true,
      });

      // Auto-login the user
      req.login(newUser, (err) => {
        if (err) return next(err);
        
        // Note: Users now join leagues manually via invite code after registration
        
        res.status(201).json({
          id: newUser.id,
          email: newUser.email,
          username: newUser.username,
          firstName: newUser.firstName,
          lastName: newUser.lastName,
          profileImageUrl: newUser.profileImageUrl,
          totalPoints: newUser.totalPoints,
          emailVerified: newUser.emailVerified,
          receiveNotifications: newUser.receiveNotifications,
        });
      });
    } catch (error) {
      console.error("Registration error:", error);
      res.status(500).json({ message: "Registration failed" });
    }
  });

  app.post("/api/login", (req, res, next) => {
    passport.authenticate("local", (err: any, user: any, info: any) => {
      if (err) {
        return res.status(500).json({ message: "Login failed" });
      }
      if (!user) {
        return res.status(401).json({ message: info?.message || "Invalid credentials" });
      }
      req.login(user, (err) => {
        if (err) {
          return res.status(500).json({ message: "Login failed" });
        }
        res.json({
          id: user.id,
          email: user.email,
          username: user.username,
          firstName: user.firstName,
          lastName: user.lastName,
          profileImageUrl: user.profileImageUrl,
          totalPoints: user.totalPoints,
          emailVerified: user.emailVerified,
          receiveNotifications: user.receiveNotifications,
        });
      });
    })(req, res, next);
  });

  app.post("/api/logout", (req, res, next) => {
    req.logout((err) => {
      if (err) return next(err);
      res.json({ message: "Logged out successfully" });
    });
  });

  app.get("/api/auth/user", (req, res) => {
    if (!req.isAuthenticated() || !req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    
    res.json({
      id: req.user.id,
      email: req.user.email,
      username: req.user.username,
      firstName: req.user.firstName,
      lastName: req.user.lastName,
      profileImageUrl: req.user.profileImageUrl,
      totalPoints: req.user.totalPoints,
      emailVerified: req.user.emailVerified,
      receiveNotifications: req.user.receiveNotifications,
    });
  });

  // Update user profile endpoint
  app.patch("/api/auth/profile", async (req, res) => {
    if (!req.isAuthenticated() || !req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    try {
      const { username } = req.body;
      const userId = req.user.id;

      if (username) {
        // Check if username is already taken by another user
        const existingUser = await storage.getUserByUsername(username);
        if (existingUser && existingUser.id !== userId) {
          return res.status(400).json({ message: "Username already taken" });
        }
      }

      const updatedUser = await storage.updateUser(userId, {
        username: username || null
      });

      // Update the session with the new username
      req.user.username = updatedUser.username;

      res.json({
        id: updatedUser.id,
        email: updatedUser.email,
        username: updatedUser.username,
        firstName: updatedUser.firstName,
        lastName: updatedUser.lastName,
        profileImageUrl: updatedUser.profileImageUrl,
        totalPoints: updatedUser.totalPoints,
        emailVerified: updatedUser.emailVerified,
        receiveNotifications: updatedUser.receiveNotifications,
      });
    } catch (error) {
      console.error("Error updating profile:", error);
      res.status(500).json({ message: "Failed to update profile" });
    }
  });

  // Check if current user is super user
  app.get("/api/auth/super-user-status", (req, res) => {
    if (!req.isAuthenticated() || !req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    
    const SUPER_USER_ID = "user_1753731196994_qfjmyp5i2";
    res.json({
      isSuperUser: req.user.id === SUPER_USER_ID
    });
  });

  // Google OAuth routes with dynamic callback URL support
  app.get('/api/auth/google', (req, res, next) => {
    console.log('Starting Google OAuth flow');
    console.log('Request headers:', {
      'user-agent': req.get('user-agent'),
      'referer': req.get('referer'),
      'host': req.get('host')
    });
    
    // Set dynamic callback URL based on the host making the request
    const protocol = req.protocol;
    const host = req.get('host');
    const callbackURL = `${protocol}://${host}/api/auth/google/callback`;
    
    console.log('Dynamic callback URL:', callbackURL);
    
    // Update the strategy's callback URL for this request
    const strategy = passport._strategy('google');
    if (strategy) {
      strategy._callbackURL = callbackURL;
    }
    
    next();
  }, passport.authenticate('google', { 
    scope: ['profile', 'email'] 
  }));

  app.get('/api/auth/google/callback',
    (req, res, next) => {
      console.log('Google callback route hit');
      console.log('Query params:', req.query);
      console.log('Session ID:', req.sessionID);
      next();
    },
    passport.authenticate('google', { 
      failureRedirect: '/?auth=failed'
    }),
    (req, res) => {
      console.log('Google OAuth successful, user:', req.user ? 'authenticated' : 'NO USER');
      if (req.user) {
        console.log('User ID:', req.user.id);
      }
      res.redirect('/?auth=success');
    }
  );

  // Test endpoint for debugging Google OAuth
  app.get('/api/auth/google/test', (req, res) => {
    const protocol = req.protocol;
    const host = req.get('host');
    const dynamicCallbackURL = `${protocol}://${host}/api/auth/google/callback`;
    
    res.json({
      clientIdSet: !!process.env.GOOGLE_CLIENT_ID,
      clientSecretSet: !!process.env.GOOGLE_CLIENT_SECRET,
      requestHost: host,
      dynamicCallbackURL: dynamicCallbackURL,
      supportedDomains: ['upsetpool.com', 'www.upsetpool.com', process.env.REPLIT_DOMAINS]
    });
  });
}

export const isAuthenticated = (req: any, res: any, next: any) => {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  next();
};