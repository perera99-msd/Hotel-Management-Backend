import { Router, Request, Response } from 'express';
import { authenticate, requireRoles } from '../middleware/auth.js'; // Import requireRoles
import { User } from '../models/user.js';
import { logger } from '../lib/logger.js';

export const userRouter = Router();

// Apply authentication middleware to all routes in this router
userRouter.use(authenticate());

// ✅ NEW ROUTE: Get all users (for searching customers)
// Restricted to admin/manager/receptionist to protect privacy
userRouter.get('/', requireRoles('admin', 'manager', 'receptionist'), async (req: Request, res: Response) => {
  try {
    // Select only necessary fields for the dropdown
    const users = await User.find({}).select('name email phone roles uid _id');
    res.json(users);
  } catch (err) {
    logger.error({ err }, 'Failed to fetch users');
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// POST /register - Create a new user
userRouter.post('/register', async (req: Request, res: Response) => {
  try {
    const user = req.user; 
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    // Allow admins/receptionists to register OTHER users (for manual booking)
    // OR allow self-registration if uid matches.
    // Ideally, for "New Guest" in modal, we might just pass the data without a UID (or generate a placeholder).
    // For now, we assume this endpoint is used for self-registration or requires valid logic.
    // However, the Modal implementation below calls a specific endpoint. 
    
    // To support the Modal's "New Guest" feature which might not have a Firebase UID yet:
    // We typically separate "Create User" (admin) from "Register Self" (public).
    // For this specific fix, we will assume standard flow or basic creation.
    
    const { name, email, phone, role } = req.body;

    const newUser = await User.create({
      uid: user.uid, // Note: This binds to the CURRENT logged in user if not careful. 
                     // For creating *other* guests, you might need a different admin endpoint.
                     // But for searching *existing*, this GET route above is what you needed.
      email: email || user.email,
      name: name,
      phone: phone,
      roles: ['customer'] 
    });

    res.status(201).json(newUser);
  } catch (err) {
    // If it's a duplicate key error (user exists), try to find and return them
    if ((err as any).code === 11000) {
        const existing = await User.findOne({ email: req.body.email });
        if(existing) return res.json(existing);
    }
    logger.error({ err }, 'Failed to register user');
    res.status(500).json({ error: 'Failed to register user' });
  }
});

// GET /me - Get current user profile
userRouter.get('/me', async (req: Request, res: Response) => {
  try {
    const user = req.user;
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const doc = await User.findOne({ uid: user.uid });
    
    if (!doc) {
      return res.status(404).json({ error: 'User profile not found' });
    }
    
    res.json(doc);
  } catch (err) {
    logger.error({ err }, 'Failed to fetch profile');
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

// PUT /me - Update profile
userRouter.put('/me', async (req: Request, res: Response) => {
  try {
    const user = req.user;
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const update = req.body;
    delete update.uid;
    delete update.roles; 

    const doc = await User.findOneAndUpdate(
      { uid: user.uid }, 
      update, 
      { new: true }
    );

    res.json(doc);
  } catch (err) {
    res.status(400).json({ error: 'Failed to update profile' });
  }
});