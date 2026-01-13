import { Router, Request, Response } from 'express';
import { authenticate, requireRoles } from '../middleware/auth.js';
import { User } from '../models/user.js';
import { logger } from '../lib/logger.js';
import { auth } from '../lib/firebaseAdmin.js'; 

export const userRouter = Router();

// 1. PUBLIC REGISTRATION ROUTE (Must be defined BEFORE the top-level middleware if you want it completely open, 
// but since we need the Firebase UID, we use authenticate() but NOT requireRoles())
userRouter.post('/register', authenticate(), async (req: Request, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });

    const { name, email, phone } = req.body;

    // Prevent duplicate entries in MongoDB
    const existingUser = await User.findOne({ uid: req.user.uid });
    if (existingUser) {
      return res.status(200).json(existingUser); // Already synced
    }

    const newUser = await User.create({
      uid: req.user.uid,
      email: email || req.user.email,
      name: name,
      phone: phone,
      roles: ['customer'],
      status: 'active'
    });

    res.status(201).json(newUser);
  } catch (err: any) {
    logger.error({ err }, 'Registration sync failed');
    res.status(500).json({ error: 'Failed to sync user to database' });
  }
});

// Top-level middleware for remaining routes
userRouter.use(authenticate());

// GET /api/users - List all users
userRouter.get('/', requireRoles('admin', 'manager', 'receptionist'), async (req: Request, res: Response) => {
  try {
    const users = await User.find({}).sort({ createdAt: -1 });
    res.json(users);
  } catch (err) {
    logger.error({ err }, 'Failed to fetch users');
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// GET /api/users/me - Current Profile
userRouter.get('/me', async (req: Request, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
    const user = await User.findOne({ uid: req.user.uid });
    res.json(user || {});
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

// PUT /api/users/me - Update Current Profile
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
  } catch (err) {
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

// POST /api/users/create - Admin Create User
userRouter.post('/create', requireRoles('admin'), async (req: Request, res: Response) => {
  try {
    const { email, password, name, role, phone } = req.body;
    const firebaseUser = await auth.createUser({
      email,
      password: password || 'password123',
      displayName: name,
    });
    const newUser = await User.create({
      uid: firebaseUser.uid,
      email,
      name,
      phone,
      roles: [role || 'customer']
    });
    res.status(201).json(newUser);
  } catch (err: any) {
    logger.error({ err }, 'Create user failed');
    res.status(500).json({ error: err.message || 'Failed to create user' });
  }
});

// PUT /api/users/:id - Admin Update User
userRouter.put('/:id', requireRoles('admin'), async (req: Request, res: Response) => {
  try {
    const { name, role, status } = req.body;
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { name, roles: [role], status }, 
      { new: true }
    );
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update user' });
  }
});

// DELETE /api/users/:id - Admin Delete User
userRouter.delete('/:id', requireRoles('admin'), async (req: Request, res: Response) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    try {
      await auth.deleteUser(user.uid);
    } catch (fbErr) {
      logger.warn({ fbErr }, 'Failed to delete from Firebase, deleting local only');
    }
    await User.findByIdAndDelete(req.params.id);
    res.json({ message: 'User deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete user' });
  }
});