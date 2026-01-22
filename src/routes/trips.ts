import { Router, Request, Response } from 'express';
import { authenticate, requireRoles } from '../middleware/auth.js';
import { TripPackage } from '../models/tripPackage.js';
import { TripRequest } from '../models/tripRequest.js';
import { User } from '../models/user.js'; 

export const tripsRouter = Router();
tripsRouter.use(authenticate());

// --- PACKAGES ---

// GET /trips - Fetch all packages
tripsRouter.get('/', async (req: Request, res: Response) => {
  try {
    const trips = await TripPackage.find({}).sort({ createdAt: -1 }).lean();
    res.json(trips);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch trips' });
  }
});

// POST /trips - Create new package
tripsRouter.post('/', requireRoles('admin', 'receptionist'), async (req: Request, res: Response) => {
  try {
    const created = await TripPackage.create(req.body);
    res.status(201).json(created);
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to create trip package' });
  }
});

// PUT /trips/:id
tripsRouter.put('/:id', requireRoles('admin', 'receptionist'), async (req: Request, res: Response) => {
  try {
    const updated = await TripPackage.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json(updated);
  } catch (err) { res.status(400).json({ error: 'Update failed' }); }
});

// DELETE /trips/:id
tripsRouter.delete('/:id', requireRoles('admin', 'receptionist'), async (req: Request, res: Response) => {
  try {
    await TripPackage.findByIdAndDelete(req.params.id);
    res.json({ message: 'Deleted' });
  } catch (err) { res.status(500).json({ error: 'Delete failed' }); }
});

// PATCH /trips/:id/status
tripsRouter.patch('/:id/status', requireRoles('admin', 'receptionist'), async (req: Request, res: Response) => {
  try {
    const updated = await TripPackage.findByIdAndUpdate(req.params.id, { status: req.body.status }, { new: true });
    res.json(updated);
  } catch (err) { res.status(400).json({ error: 'Status update failed' }); }
});


// --- BOOKINGS / REQUESTS ---

// GET /requests - Admin: List all bookings
tripsRouter.get('/requests', requireRoles('admin', 'receptionist'), async (req: Request, res: Response) => {
  try {
    const requests = await TripRequest.find({})
      .populate('requestedBy', 'name email phone')
      .populate('packageId', 'name location')
      .sort({ createdAt: -1 })
      .lean();
    res.json(requests);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch bookings' });
  }
});

// POST /requests/admin - Admin: Manually Add Booking
tripsRouter.post('/requests/admin', requireRoles('admin', 'receptionist'), async (req: Request, res: Response) => {
  try {
    const { guestId, packageId, tripDate, participants, price, status, notes } = req.body;

    // 1. Get Package Details (snapshot)
    const pkg = await TripPackage.findById(packageId);
    if (!pkg) return res.status(404).json({ error: 'Package not found' });

    // 2. Create Request
    const newBooking = await TripRequest.create({
      requestedBy: guestId,
      packageId: pkg._id,
      packageName: pkg.name,
      location: pkg.location,
      tripDate: tripDate,
      participants: participants,
      totalPrice: price || (pkg.price * participants),
      status: status || 'Confirmed',
      details: notes || 'Manual Booking by Admin'
    });

    res.status(201).json(newBooking);
  } catch (err: any) {
    console.error(err);
    res.status(400).json({ error: err.message || 'Failed to create booking' });
  }
});

// POST /requests - Customer: Request Trip (Standard or Custom)
tripsRouter.post('/requests', requireRoles('customer'), async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const { packageId, tripDate, participants, details, location, guestInfo } = req.body;
    
    let bookingData: any = {
        requestedBy: user.mongoId,
        participants: participants || 1,
        status: 'Requested',
        details: details || '' // Can contain serialized JSON of custom details or guest info
    };

    if (packageId) {
        // --- Standard Package Booking ---
        const pkg = await TripPackage.findById(packageId);
        if (!pkg) return res.status(404).json({ error: 'Package not found' });

        bookingData.packageId = pkg._id;
        bookingData.packageName = pkg.name;
        bookingData.location = pkg.location;
        bookingData.totalPrice = pkg.price * (participants || 1); // Estimated total
        bookingData.tripDate = tripDate;
        
        // Append guest contact info to details if provided
        if (guestInfo) {
             const contactStr = `\n\nContact Info:\nName: ${guestInfo.fullName}\nPhone: ${guestInfo.phoneNumber}\nEmail: ${guestInfo.email}`;
             bookingData.details += contactStr;
        }

    } else {
        // --- Custom Trip Request ---
        bookingData.packageName = "Custom Trip Request";
        bookingData.location = location || "Custom Destination";
        bookingData.tripDate = tripDate; 
        // totalPrice is left undefined/0 until admin reviews
    }

    const created = await TripRequest.create(bookingData);
    res.status(201).json(created);
  } catch (err: any) {
    console.error("Trip Request Error:", err);
    res.status(400).json({ error: err.message || 'Failed to create trip request' });
  }
});