import { Request, Response, Router } from 'express';
import admin from '../lib/firebaseAdmin.js';
import { logger } from '../lib/logger.js';
import { authenticate, requireRoles } from '../middleware/auth.js';
import { Booking } from '../models/booking.js';
import { Invoice } from '../models/invoice.js';
import { Order } from '../models/order.js';
import { TripRequest } from '../models/tripRequest.js';
import { User } from '../models/user.js';

export const userRouter = Router();

/**
 * POST /api/users/register
 * Links Firebase accounts to existing guest profiles or creates new ones
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
      if (user.uid && user.uid !== uid) {
        return res.status(400).json({ error: 'User with this email is already registered' });
      }
      user.uid = uid;
      if (name) user.name = name;
      if (phone) user.phone = phone;
      await user.save();
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
 */
userRouter.get('/me', async (req: Request, res: Response) => {
  try {
    if (!req.user?.uid) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    let user = await User.findOne({ uid: req.user.uid });

    // If user doesn't exist, create a new profile with Firebase data
    if (!user) {
      user = await User.create({
        uid: req.user.uid,
        email: req.user.email || '',
        name: req.user.email?.split('@')[0] || 'User',
        phone: '',
        roles: ['customer'],
        status: 'active'
      });
    }

    res.json(user);
  } catch (err: any) {
    console.error("Error fetching user profile:", err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * PUT /api/users/me
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
 * List users (Admin/Staff only)
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
 * POST /api/users/guest
 * ✅ NEW ENDPOINT: Create a shadow/walk-in guest without password/Firebase
 * Used by "New Booking" modal
 */
userRouter.post('/guest', requireRoles('admin', 'receptionist', 'manager'), async (req: Request, res: Response) => {
  try {
    const { email, name, phone } = req.body;

    if (!email || !name) {
      return res.status(400).json({ error: "Name and Email are required" });
    }

    const targetEmail = email.toLowerCase().trim();

    // Check if user already exists
    let user = await User.findOne({ email: targetEmail });
    if (user) {
      // Return existing user so booking can proceed
      return res.status(200).json(user);
    }

    // Create new shadow user (no UID)
    user = await User.create({
      email: targetEmail,
      name,
      phone: phone || '',
      roles: ['customer'],
      status: 'active'
    });

    res.status(201).json(user);
  } catch (err: any) {
    console.error("Guest Creation Error:", err);
    res.status(500).json({ error: 'Failed to create guest user' });
  }
});

/**
 * POST /api/users/create
 * Admin explicitly creates a user profile (with Firebase Auth)
 */
userRouter.post('/create', requireRoles('admin'), async (req: Request, res: Response) => {
  try {
    const { email, name, phone, role, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }

    // 1. Create in Firebase
    let firebaseUser;
    try {
      firebaseUser = await admin.auth().createUser({
        email,
        password,
        displayName: name,
        phoneNumber: phone || undefined
      });
    } catch (firebaseError: any) {
      // If user already exists in Firebase, try to find them
      if (firebaseError.code === 'auth/email-already-exists') {
        try {
          firebaseUser = await admin.auth().getUserByEmail(email);
        } catch (e) {
          return res.status(500).json({ error: "User exists in Auth but could not be retrieved." });
        }
      } else {
        return res.status(400).json({ error: `Firebase Error: ${firebaseError.message}` });
      }
    }

    // 2. Create/Update in MongoDB
    const newUser = await User.findOneAndUpdate(
      { email: email.toLowerCase() },
      {
        uid: firebaseUser.uid,
        email: email.toLowerCase(),
        name,
        phone: phone || '',
        roles: [role || 'customer'],
        status: 'active'
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

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
 * Admin deletes a user
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

/**
 * GET /api/users/dashboard
 * Customer gets their ongoing bookings, orders, and trip packages
 */
userRouter.get('/dashboard', authenticate(), async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;

    // Get ongoing bookings (Confirmed or CheckedIn)
    const bookings = await Booking.find({
      guestId: user.mongoId,
      status: { $in: ['Confirmed', 'CheckedIn'] }
    })
      .populate('roomId')
      .populate('appliedDealId', 'dealName discount') // Include deal info
      .sort({ checkIn: 1 })
      .lean();

    // Get completed bookings (CheckedOut) with invoice totals
    const completedBookings = await Booking.find({
      guestId: user.mongoId,
      status: 'CheckedOut'
    })
      .populate('roomId')
      .populate('appliedDealId', 'dealName discount') // Include deal info
      .sort({ checkOut: -1 })
      .lean();

    // Attach invoice totals to completed bookings
    const completedBookingsWithInvoices = await Promise.all(
      completedBookings.map(async (booking) => {
        const invoice = await Invoice.findOne({
          bookingId: booking._id,
          status: 'paid'
        }).lean();

        return {
          ...booking,
          invoiceTotal: invoice?.total || 0
        };
      })
    );

    // Get active orders only (Preparing or Ready) for CheckedIn bookings
    const orders = await Order.find({
      guestId: user.mongoId,
      status: { $in: ['Preparing', 'Ready'] }
    })
      .populate('bookingId', 'checkIn checkOut roomId')
      .sort({ createdAt: -1 })
      .lean();

    // Get all trip requests for user's bookings
    const tripRequests = await TripRequest.find({
      requestedBy: user.mongoId,
      status: { $nin: ['Cancelled', 'Rejected', 'Completed'] }
    })
      .populate('packageId', 'name location price images')
      .populate('bookingId', 'checkIn checkOut')
      .sort({ createdAt: -1 })
      .lean();

    res.json({
      bookings,
      completedBookings: completedBookingsWithInvoices,
      orders,
      tripRequests
    });
  } catch (err) {
    logger.error({ err }, 'Failed to fetch customer dashboard');
    res.status(500).json({ error: 'Failed to fetch dashboard data' });
  }
});