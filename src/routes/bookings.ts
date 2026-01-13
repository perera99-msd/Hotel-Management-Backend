import { Router, Request, Response } from 'express';
import { authenticate, requireRoles } from '../middleware/auth.js';
import { Booking } from '../models/booking.js';
import { Room } from '../models/room.js';
import { User } from '../models/user.js';

export const bookingsRouter = Router();

bookingsRouter.use(authenticate());

/**
 * GET /api/bookings - List all bookings
 */
bookingsRouter.get('/', async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const isStaff = user.roles.some((r: string) => ['admin', 'receptionist', 'manager'].includes(r));
    const filter: any = isStaff ? {} : { guestId: user.mongoId };
    
    const bookings = await Booking.find(filter)
      .populate('roomId')
      .populate('guestId', 'name email phone')
      .sort({ createdAt: -1 })
      .lean();
      
    res.json(bookings);
  } catch (err) {
    console.error("Error fetching bookings:", err);
    res.status(500).json({ error: 'Failed to fetch bookings' });
  }
});

/**
 * POST /api/bookings - Create Booking (Handles New Guest)
 */
bookingsRouter.post('/', requireRoles('admin', 'receptionist', 'customer'), async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    let { roomId, checkIn, checkOut, guestId, guest, source, status: requestedStatus } = req.body;

    // Handle "New Guest" Payload by finding or creating a local User profile
    if (guest && !guestId) {
      const targetEmail = guest.email.toLowerCase();
      let existingProfile = await User.findOne({ email: targetEmail });

      if (!existingProfile) {
        existingProfile = await User.create({
          name: guest.name,
          email: targetEmail,
          phone: guest.phone || '',
          roles: ['customer'],
          status: 'active'
        });
      }
      guestId = existingProfile._id;
    }

    const finalGuestId = guestId || user.mongoId;
    if (!finalGuestId) return res.status(400).json({ error: "Guest identity missing." });
    if (!roomId) return res.status(400).json({ error: "Room not selected." });

    const start = new Date(checkIn);
    const end = new Date(checkOut);
    
    if (isNaN(start.getTime()) || isNaN(end.getTime())) return res.status(400).json({ error: 'Invalid dates' });
    if (start >= end) return res.status(400).json({ error: 'Check-out must be after check-in' });

    // Availability Check
    const overlapping = await Booking.findOne({
      roomId,
      status: { $in: ['Confirmed', 'CheckedIn'] },
      $or: [{ checkIn: { $lt: end }, checkOut: { $gt: start } }],
    });

    if (overlapping) return res.status(409).json({ error: 'Room is already booked' });

    // MERGED LOGIC: Check status from requested body or default to Confirmed
    const finalStatus = (requestedStatus === 'checked-in' || requestedStatus === 'CheckedIn') 
      ? 'CheckedIn' 
      : 'Confirmed';

    const newBooking = await Booking.create({
      roomId,
      guestId: finalGuestId,
      checkIn: start,
      checkOut: end,
      status: finalStatus,
      source: source || 'Local',
    });

    res.status(201).json(newBooking);
  } catch (err: any) {
    console.error("Create Booking Error:", err);
    res.status(500).json({ error: 'An internal error occurred while creating the booking' });
  }
});

/**
 * PUT /api/bookings/:id - Update booking
 */
bookingsRouter.put('/:id', requireRoles('admin', 'receptionist', 'manager'), async (req: Request, res: Response) => {
  try {
    const booking = await Booking.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!booking) return res.status(404).json({ error: 'Booking not found' });
    res.json(booking);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update booking' });
  }
});

/**
 * DELETE /api/bookings/:id - Delete booking
 */
bookingsRouter.delete('/:id', requireRoles('admin', 'manager'), async (req: Request, res: Response) => {
  try {
    const booking = await Booking.findByIdAndDelete(req.params.id);
    if (!booking) return res.status(404).json({ error: 'Booking not found' });
    res.json({ message: 'Booking deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete booking' });
  }
});

// POST /api/bookings/:id/checkin
bookingsRouter.post('/:id/checkin', requireRoles('admin', 'receptionist'), async (req: Request, res: Response) => {
  try {
    const booking = await Booking.findByIdAndUpdate(req.params.id, { status: 'CheckedIn' }, { new: true });
    if (!booking) return res.status(404).json({ error: 'Booking not found' });
    await Room.findByIdAndUpdate(booking.roomId, { status: 'Occupied' });
    res.json(booking);
  } catch (err) {
    res.status(500).json({ error: 'Failed to check in' });
  }
});

// POST /api/bookings/:id/checkout
bookingsRouter.post('/:id/checkout', requireRoles('admin', 'receptionist'), async (req: Request, res: Response) => {
  try {
    const booking = await Booking.findByIdAndUpdate(req.params.id, { status: 'CheckedOut' }, { new: true });
    if (!booking) return res.status(404).json({ error: 'Booking not found' });
    await Room.findByIdAndUpdate(booking.roomId, { status: 'Cleaning' });
    res.json(booking);
  } catch (err) {
    res.status(500).json({ error: 'Failed to check out' });
  }
});