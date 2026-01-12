/* */
import { Router, Request, Response } from 'express';
import { authenticate, requireRoles } from '../middleware/auth.js';
import { Rate } from '../models/rate.js';

export const ratesRouter = Router();

ratesRouter.use(authenticate());

// Helper to derive deal name (matching your UI logic)
const getDealName = (roomType: string) => {
  const type = roomType.toLowerCase();
  if (type === 'single' || type === 'triple') return 'Family deal';
  if (type === 'double') return 'Christmas deal';
  return 'Black Friday';
};

// GET /api/rates - List all rates
ratesRouter.get('/', async (req: Request, res: Response) => {
  try {
    const rates = await Rate.find().sort({ createdAt: -1 });
    
    // Format to match UI Table Data structure
    const formattedRates = rates.map(r => ({
      id: r._id,
      roomType: r.roomType.charAt(0).toUpperCase() + r.roomType.slice(1),
      cancellationPolicy: r.cancellationPolicy,
      price: r.price,
      rooms: r.rooms,
      deals: r.deals || getDealName(r.roomType),
      // UI specific formatted strings
      dealPrice: `$ ${r.price}`,
      rate: `$ ${r.price}`,
      availability: `${r.rooms} rooms`
    }));

    res.json(formattedRates);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch rates' });
  }
});

// POST /api/rates - Create new rate
ratesRouter.post('/', requireRoles('admin', 'manager'), async (req: Request, res: Response) => {
  try {
    const { roomType, cancellationPolicy, price, rooms } = req.body;

    const newRate = await Rate.create({
      roomType,
      cancellationPolicy,
      price: parseFloat(price),
      rooms: parseInt(rooms),
      deals: getDealName(roomType)
    });

    res.status(201).json(newRate);
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to create rate' });
  }
});

// PUT /api/rates/:id - Update rate
ratesRouter.put('/:id', requireRoles('admin', 'manager'), async (req: Request, res: Response) => {
  try {
    const { roomType, cancellationPolicy, price, rooms } = req.body;
    
    const updatedRate = await Rate.findByIdAndUpdate(
      req.params.id, 
      {
        roomType,
        cancellationPolicy,
        price: parseFloat(price),
        rooms: parseInt(rooms),
        deals: getDealName(roomType)
      },
      { new: true }
    );

    if (!updatedRate) return res.status(404).json({ error: 'Rate not found' });
    res.json(updatedRate);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update rate' });
  }
});

// DELETE /api/rates/:id - Delete rate
ratesRouter.delete('/:id', requireRoles('admin', 'manager'), async (req: Request, res: Response) => {
  try {
    const deleted = await Rate.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Rate not found' });
    res.json({ message: 'Rate deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete rate' });
  }
});