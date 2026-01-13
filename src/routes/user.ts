import { Router, Request, Response } from 'express';
import { User } from '../models/user.js';
import { authenticate, requireRoles } from '../middleware/auth.js';
import { logger } from '../lib/logger.js';
import admin from '../lib/firebaseAdmin.js'; // Ensure correct import for Firebase Admin

export const userRouter = Router();

/**
 * POST /api/users/register
 * Links Firebase accounts to existing guest profiles or creates new ones
 * This handles the sync after a user registers via Firebase on the frontend.
 */
userRouter.post('/register', async (req: Request, res: Response) => {
  try {
    const { uid, email, name, phone } = req.body;

    if (!uid || !email) {
      return res.status(400).json({ error: 'UID and Email are required' });
    }

    const targetEmail = email.toLowerCase();
    let user = await User.findOne({ email: targetEmail });

    // If a guest profile exists with this email, link the Firebase UID
    if (user) {
      if (user.uid) {
        return res.status(400).json({ error: 'User with this email is already registered' });
      }
      user.uid = uid;
      if (name) user.name = name;
      if (phone) user.phone = phone;
      await user.save();
      logger.info({ uid: user.uid }, 'Existing profile linked to Firebase UID');
      return res.status(200).json({ message: 'Profile linked and registration complete', user });
    }

    // Otherwise, create a brand new user
    const newUser = await User.create({
      uid,
      email: targetEmail,
      name: name || 'New User',
      phone: phone || '',
      roles: ['customer'],
      status: 'active'
    });

    logger.info({ uid: newUser.uid }, 'New user successfully created and synced to MongoDB');
    res.status(201).json(newUser);
  } catch (err: any) {
    logger.error({ err }, 'Registration sync failed');
    res.status(500).json({ error: 'Registration failed due to server error' });
  }
});

/**
 * Middleware: All routes below this line require a valid Bearer token
 */
userRouter.use(authenticate());

/**
 * GET /api/users/me
 * Retrieves the current logged-in user's profile based on their Firebase UID.
 * Essential for frontend role-based redirection.
 */
userRouter.get('/me', async (req: Request, res: Response) => {
  try {
    // req.user is populated by the authenticate() middleware
    const user = await User.findOne({ uid: req.user?.uid });
    
    if (!user) {
      return res.status(404).json({ error: 'User profile not found in database' });
    }

    res.json(user);
  } catch (err: any) {
    console.error("Error fetching user profile:", err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * PUT /api/users/me
 * Allows users to update their own profile information
 */
userRouter.put('/me', async (req: Request, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
    const { name, phone } = req.body; 
    
    const user = await User.findOneAndUpdate(
      { uid: req.user.uid },
      { name, phone },
      { new: true }
    );
    
    res.json(user);
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

/**
 * GET /api/users
 * List users (Admin/Staff only). 
 * Used by staff to select a guest for a new booking.
 */
userRouter.get('/', requireRoles('admin', 'manager', 'receptionist'), async (req: Request, res: Response) => {
  try {
    // Return users sorted by creation date
    const users = await User.find({}).sort({ createdAt: -1 });
    res.json(users);
  } catch (err) {
    logger.error({ err }, 'Failed to fetch users');
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

/**
 * POST /api/users/create
 * Admin explicitly creates a user profile
 */
userRouter.post('/create', requireRoles('admin'), async (req: Request, res: Response) => {
  try {
    const { uid, email, name, phone, role } = req.body;

    const newUser = await User.create({
      uid,
      email: email.toLowerCase(),
      name,
      phone: phone || '',
      roles: [role || 'customer'],
      status: 'active'
    });

    res.status(201).json(newUser);
  } catch (err: any) {
    logger.error({ err }, 'Create user failed');
    res.status(500).json({ error: err.message || 'Failed to create user' });
  }
});

/**
 * PUT /api/users/:id
 * Admin updates a specific user's details or role
 */
userRouter.put('/:id', requireRoles('admin'), async (req: Request, res: Response) => {
  try {
    const { name, role, status, phone } = req.body;
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { name, roles: [role], status, phone }, 
      { new: true }
    );
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update user' });
  }
});

/**
 * DELETE /api/users/:id
 * Admin deletes a user from MongoDB and attempts to remove from Firebase
 */
userRouter.delete('/:id', requireRoles('admin'), async (req: Request, res: Response) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    
    try {
      if (user.uid) {
        await admin.auth().deleteUser(user.uid);
      }
    } catch (fbErr) {
      logger.warn({ fbErr }, 'Failed to delete from Firebase, deleting local only');
    }

    await User.findByIdAndDelete(req.params.id);
    res.json({ message: 'User deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete user' });
  }
});