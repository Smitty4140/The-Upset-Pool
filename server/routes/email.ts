import { Router } from "express";
import { isAuthenticated } from "../replitAuth";
import { storage } from "../storage";
import { sendWelcomeEmail, sendPickReminderEmail } from "../email";
import crypto from "crypto";
import { eq } from "drizzle-orm";
import { users } from "@shared/schema";
import { db } from "../db";

const router = Router();

// Send verification email to user
router.post("/verify-email", isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user.claims.sub;
    const user = await storage.getUser(userId);
    
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    
    if (!user.email) {
      return res.status(400).json({ message: "User does not have an email address" });
    }
    
    if (user.emailVerified) {
      return res.status(400).json({ message: "Email already verified" });
    }
    
    // Generate verification token (in a real app, store this in a database)
    // Here we'll just simulate sending an email with the verification link
    const verificationToken = crypto.randomBytes(32).toString('hex');
    
    // In production, save this token to the database with a timeout
    // For demo purposes, we'll just send an email with a simulated verification link
    const verificationLink = `https://${req.hostname}/verify-email?token=${verificationToken}&userId=${userId}`;
    
    // Send welcome email with verification link
    const emailSent = await sendWelcomeEmail(user.email, user.username);
    
    if (!emailSent) {
      return res.status(500).json({ message: "Failed to send verification email" });
    }
    
    // For demo purposes, automatically verify the email
    // In a real app, the user would need to click the link in the email
    await db.update(users)
      .set({ emailVerified: true })
      .where(eq(users.id, userId));
    
    return res.status(200).json({ message: "Verification email sent" });
  } catch (error) {
    console.error("Error sending verification email:", error);
    return res.status(500).json({ message: "Server error" });
  }
});

// Send reminder emails to users who haven't made a pick for the current week
router.post("/send-reminders", isAuthenticated, async (req: any, res) => {
  try {
    // Check if user is an admin
    const userId = req.user.claims.sub;
    const user = await storage.getUser(userId);
    
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    
    // Get current week
    const currentWeek = await storage.getCurrentNFLWeek();
    
    if (!currentWeek) {
      return res.status(404).json({ message: "No active NFL week found" });
    }
    
    // Get all users in the league
    const allUsers = await storage.getAllUsers();
    
    // Filter users with email who have opted in to notifications
    const eligibleUsers = allUsers.filter(u => 
      u.email && u.receiveNotifications !== false && u.emailVerified
    );
    
    // For each eligible user, check if they've made a pick for this week
    // If not, send them a reminder
    const results = [];
    
    for (const user of eligibleUsers) {
      // First league (for now)
      const userPick = await storage.getUserPick(user.id, currentWeek.id, 1);
      
      if (!userPick && user.email) {
        // Format deadline date
        const deadline = new Date(currentWeek.picksLockAt).toLocaleString('en-US', {
          weekday: 'long',
          month: 'long',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
          timeZone: 'America/New_York'
        });
        
        // Send reminder email
        const emailSent = await sendPickReminderEmail(
          user.email, 
          user.username, 
          currentWeek.weekNumber,
          deadline
        );
        
        results.push({
          userId: user.id,
          username: user.username,
          emailSent
        });
      }
    }
    
    return res.status(200).json({ 
      message: "Reminder emails processed", 
      total: eligibleUsers.length,
      remindersSent: results.length,
      results 
    });
  } catch (error) {
    console.error("Error sending reminder emails:", error);
    return res.status(500).json({ message: "Server error" });
  }
});

export default router;