import { Router, Request, Response } from 'express';
import { authenticate, requireRoles } from '../middleware/auth.js';
import { TripPackage } from '../models/tripPackage.js';
import { TripRequest } from '../models/tripRequest.js';
import { User } from '../models/user.js'; // Import User to validate guests

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
    // Populate user details
    const requests = await TripRequest.find({})
      .populate('requestedBy', 'name email phone')
      .populate('packageId', 'name')
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

// POST /requests - Customer: Request Trip
tripsRouter.post('/requests', requireRoles('customer'), async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    // Basic implementation for customer request
    const created = await TripRequest.create({ 
        requestedBy: user.mongoId, 
        details: req.body.details,
        status: 'Requested'
    });
    res.status(201).json(created);
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to create trip request' });
  }
});