import { Router, Request, Response } from 'express';
import { authenticate, requireRoles } from '../middleware/auth.js';
import { InventoryItem } from '../models/inventoryItem.js';

export const inventoryRouter = Router();
inventoryRouter.use(authenticate());

// GET /api/inventory - Get all items
inventoryRouter.get('/', requireRoles('admin', 'receptionist'), async (_req: Request, res: Response) => {
  try {
    const items = await InventoryItem.find().sort({ name: 1 }).lean();
    // Map _id to id for frontend compatibility
    const formattedItems = items.map(item => ({
      ...item,
      id: item._id.toString()
    }));
    res.json(formattedItems);
  } catch (err) {
    console.error('Error fetching inventory:', err);
    res.status(500).json({ error: 'Failed to fetch inventory' });
  }
});

// POST /api/inventory - Create item
inventoryRouter.post('/', requireRoles('admin', 'receptionist'), async (req: Request, res: Response) => {
  try {
    const payload = req.body;
    const item = new InventoryItem(payload);
    await item.save();
    
    // FIX: Cast to Record<string, any> to avoid TypeScript spread errors
    const itemObj = item.toObject() as Record<string, any>;
    
    res.status(201).json({ 
      ...itemObj, 
      id: itemObj._id.toString() 
    });
  } catch (err: any) {
    console.error('Error creating inventory item:', err);
    res.status(400).json({ error: err.message || 'Failed to create inventory item' });
  }
});

// PUT /api/inventory/:id - Update item
inventoryRouter.put('/:id', requireRoles('admin', 'receptionist'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const payload = req.body;
    
    // Remove id/_id from payload to avoid immutable field errors
    delete payload.id;
    delete payload._id;
    delete payload.createdAt;
    delete payload.updatedAt;

    const item = await InventoryItem.findByIdAndUpdate(
      id, 
      { $set: payload },
      { new: true, runValidators: true }
    ).lean();

    if (!item) {
      return res.status(404).json({ error: 'Item not found' });
    }

    // item is a plain JS object here because of .lean(), so spread works fine
    res.json({ ...item, id: item._id.toString() });
  } catch (err: any) {
    console.error('Error updating inventory item:', err);
    res.status(400).json({ error: err.message || 'Failed to update item' });
  }
});

// DELETE /api/inventory/:id - Delete item
inventoryRouter.delete('/:id', requireRoles('admin', 'receptionist'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const result = await InventoryItem.findByIdAndDelete(id);
    
    if (!result) {
      return res.status(404).json({ error: 'Item not found' });
    }

    res.json({ message: 'Item deleted successfully' });
  } catch (err) {
    console.error('Error deleting inventory item:', err);
    res.status(500).json({ error: 'Failed to delete item' });
  }
});