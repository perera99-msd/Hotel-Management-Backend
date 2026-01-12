/* */
import { Router, Request, Response } from 'express';
import { authenticate, requireRoles } from '../middleware/auth.js';
import { User } from '../models/user.js';
import { logger } from '../lib/logger.js';
// ✅ FIX: Now works because firebaseAdmin.ts exports 'auth'
import { auth } from '../lib/firebaseAdmin.js'; 

export const userRouter = Router();
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
    // 1. Create in Firebase
    const firebaseUser = await auth.createUser({
      email,
      password: password || 'password123',
      displayName: name,
    });
    // 2. Create in MongoDB
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