/* */
import { Request, Response, Router } from 'express';
import mongoose from 'mongoose';
import { authenticate, requireRoles } from '../middleware/auth.js';
import { Deal } from '../models/deal.js';

export const dealsRouter = Router();

dealsRouter.use(authenticate());

const normalizeIds = (value: any) => {
  const arr = Array.isArray(value) ? value : value ? [value] : [];
  return arr
    .filter(Boolean)
    .filter((id: string) => mongoose.Types.ObjectId.isValid(id))
    .map((id: string) => new mongoose.Types.ObjectId(id));
};

const allowedStatuses = ['Ongoing', 'Full', 'Inactive', 'New', 'Finished'];

const resolveDealType = (dealType: any) => {
  if (dealType === 'food' || dealType === 'trip' || dealType === 'room') return dealType;
  return 'room';
};

// GET /api/deals
dealsRouter.get('/', async (req: Request, res: Response) => {
  try {
    const now = new Date();

    // Auto-remove expired deals
    const allDeals = await Deal.find();
    const expiredIds = allDeals
      .filter((d) => {
        const end = new Date(d.endDate);
        return !Number.isNaN(end.getTime()) && end < now;
      })
      .map((d) => d._id);

    if (expiredIds.length > 0) {
      await Deal.deleteMany({ _id: { $in: expiredIds } });
    }

    const deals = await Deal.find().sort({ createdAt: -1 });
    const formattedDeals = deals.map(d => ({
      id: d._id,
      referenceNumber: d.referenceNumber,
      dealName: d.dealName,
      dealType: d.dealType || 'room',
      discountType: d.discountType || 'percentage',
      endDate: d.endDate,
      roomType: Array.isArray(d.roomType) ? d.roomType.join(', ') : '',
      roomTypeRaw: Array.isArray(d.roomType) ? d.roomType : [],
      roomIds: (d as any).roomIds?.map((r: any) => r.toString()) || [],
      menuItemIds: (d as any).menuItemIds?.map((m: any) => m.toString()) || [],
      tripPackageIds: (d as any).tripPackageIds?.map((t: any) => t.toString()) || [],
      status: d.status,
      price: d.price,
      description: d.description,
      tags: d.tags,
      startDate: d.startDate,
      discount: d.discount,
      image: d.image
    }));
    res.json(formattedDeals);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch deals' });
  }
});

// POST /api/deals
dealsRouter.post('/', requireRoles('admin', 'manager', 'receptionist'), async (req: Request, res: Response) => {
  try {
    const { referenceNumber } = req.body;
    const dealType = resolveDealType(req.body.dealType);
    const discountType = req.body.discountType === 'bogo' ? 'bogo' : 'percentage';

    // Validate required fields
    if (!allowedStatuses.includes(req.body.status || 'New')) {
      return res.status(400).json({ error: 'Invalid status value' });
    }

    if (dealType === 'room') {
      if (!req.body.roomIds || !Array.isArray(req.body.roomIds) || req.body.roomIds.length === 0) {
        return res.status(400).json({ error: 'At least one room must be selected for the deal' });
      }
    }

    if (dealType === 'food') {
      if (!req.body.menuItemIds || !Array.isArray(req.body.menuItemIds) || req.body.menuItemIds.length === 0) {
        return res.status(400).json({ error: 'At least one menu item must be selected for the deal' });
      }
    }

    if (dealType === 'trip') {
      if (!req.body.tripPackageIds || !Array.isArray(req.body.tripPackageIds) || req.body.tripPackageIds.length === 0) {
        return res.status(400).json({ error: 'At least one trip package must be selected for the deal' });
      }
    }

    const existing = await Deal.findOne({ referenceNumber });
    if (existing) return res.status(400).json({ error: 'Reference number already exists' });

    const normalizedRoomIds = normalizeIds(req.body.roomIds);
    const normalizedMenuItemIds = normalizeIds(req.body.menuItemIds);
    const normalizedTripPackageIds = normalizeIds(req.body.tripPackageIds);

    if (dealType === 'room' && normalizedRoomIds.length === 0) {
      return res.status(400).json({ error: 'Invalid room IDs provided' });
    }

    if (dealType === 'food' && normalizedMenuItemIds.length === 0) {
      return res.status(400).json({ error: 'Invalid menu item IDs provided' });
    }

    if (dealType === 'trip' && normalizedTripPackageIds.length === 0) {
      return res.status(400).json({ error: 'Invalid trip package IDs provided' });
    }

    const roomType = Array.isArray(req.body.roomTypes) ? req.body.roomTypes : req.body.roomType;

    const newDeal = await Deal.create({
      ...req.body,
      dealType,
      discountType,
      roomType,
      roomIds: normalizedRoomIds,
      menuItemIds: normalizedMenuItemIds,
      tripPackageIds: normalizedTripPackageIds,
      status: req.body.status || 'New',
      price: req.body.price || 0 // Price is optional, discount is primary
    });
    res.status(201).json(newDeal);
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to create deal' });
  }
});

// PUT /api/deals/:id
dealsRouter.put('/:id', requireRoles('admin', 'manager', 'receptionist'), async (req: Request, res: Response) => {
  try {
    const updateData: any = { ...req.body };
    updateData.dealType = resolveDealType(updateData.dealType);
    updateData.discountType = updateData.discountType === 'bogo' ? 'bogo' : 'percentage';
    if (typeof updateData.roomType === 'string') {
      updateData.roomType = updateData.roomType.split(',').map((s: string) => s.trim());
    }
    if (updateData.roomIds) {
      updateData.roomIds = normalizeIds(updateData.roomIds);
    }
    if (updateData.menuItemIds) {
      updateData.menuItemIds = normalizeIds(updateData.menuItemIds);
    }
    if (updateData.tripPackageIds) {
      updateData.tripPackageIds = normalizeIds(updateData.tripPackageIds);
    }
    const updatedDeal = await Deal.findByIdAndUpdate(req.params.id, updateData, { new: true });
    if (!updatedDeal) return res.status(404).json({ error: 'Deal not found' });
    res.json({
      ...updatedDeal.toObject(),
      id: updatedDeal._id,
      dealType: updatedDeal.dealType || 'room',
      discountType: updatedDeal.discountType || 'percentage',
      roomType: Array.isArray(updatedDeal.roomType) ? updatedDeal.roomType.join(', ') : '',
      roomIds: (updatedDeal as any).roomIds?.map((r: any) => r.toString()) || [],
      menuItemIds: (updatedDeal as any).menuItemIds?.map((m: any) => m.toString()) || [],
      tripPackageIds: (updatedDeal as any).tripPackageIds?.map((t: any) => t.toString()) || [],
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update deal' });
  }
});

// DELETE /api/deals/:id
dealsRouter.delete('/:id', requireRoles('admin', 'manager', 'receptionist'), async (req: Request, res: Response) => {
  try {
    const deleted = await Deal.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Deal not found' });
    res.json({ message: 'Deal deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete deal' });
  }
});