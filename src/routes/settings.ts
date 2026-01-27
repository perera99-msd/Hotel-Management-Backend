import dayjs from 'dayjs';
import { Request, Response, Router } from 'express';
import { authenticate, requireRoles } from '../middleware/auth.js';
import { Booking } from '../models/booking.js';
import { Invoice } from '../models/invoice.js';
import { Order } from '../models/order.js';
import { Room } from '../models/room.js';
import { Settings } from '../models/settings.js';
import { User } from '../models/user.js';

export const settingsRouter = Router();

settingsRouter.use(authenticate());

// GET /api/settings
settingsRouter.get('/', async (req: Request, res: Response) => {
  try {
    let settings = await Settings.findOne();
    if (!settings) {
      settings = await Settings.create({});
    }
    res.json(settings);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch settings' });
  }
});

// PUT /api/settings
settingsRouter.put('/', requireRoles('admin'), async (req: Request, res: Response) => {
  try {
    const settings = await Settings.findOneAndUpdate({}, req.body, {
      new: true,
      upsert: true,
      setDefaultsOnInsert: true
    });
    res.json(settings);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

// Floors management endpoints
// GET /api/settings/floors - list floors
settingsRouter.get('/floors', requireRoles('admin'), async (_req: Request, res: Response) => {
  try {
    let settings = await Settings.findOne();
    if (!settings) settings = await Settings.create({});
    const floors = (settings.floors || []).sort((a, b) => a - b);
    res.json({ floors });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch floors' });
  }
});

// POST /api/settings/floors - add a floor (adds highest+1 if not provided)
settingsRouter.post('/floors', requireRoles('admin'), async (req: Request, res: Response) => {
  try {
    let { floor } = req.body as { floor?: number };
    let settings = await Settings.findOne();
    if (!settings) settings = await Settings.create({});
    const currentFloors = (settings.floors || []).sort((a, b) => a - b);
    const nextFloor = (currentFloors.length ? currentFloors[currentFloors.length - 1] : 0) + 1;
    const toAdd = floor && !isNaN(Number(floor)) ? Number(floor) : nextFloor;
    settings = await Settings.findOneAndUpdate(
      {},
      { $addToSet: { floors: toAdd } },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );
    res.status(201).json({ floors: (settings?.floors || []).sort((a, b) => a - b) });
  } catch (err) {
    res.status(500).json({ error: 'Failed to add floor' });
  }
});

// DELETE /api/settings/floors/top - remove highest floor (cannot remove 1)
settingsRouter.delete('/floors/top', requireRoles('admin'), async (_req: Request, res: Response) => {
  try {
    let settings = await Settings.findOne();
    if (!settings) settings = await Settings.create({});
    const floors = (settings.floors || []).sort((a, b) => a - b);
    const top = floors[floors.length - 1] ?? 0;
    if (top === 0) {
      return res.status(400).json({ error: 'Cannot remove ground floor' });
    }

    // Prevent removing a floor that still has rooms assigned
    const roomsOnTop = await Room.countDocuments({ floor: top });
    if (roomsOnTop > 0) {
      return res.status(400).json({ error: `Cannot remove Floor ${top} while rooms are assigned` });
    }

    settings = await Settings.findOneAndUpdate(
      {},
      { $pull: { floors: top } },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );
    res.json({ floors: (settings?.floors || []).sort((a, b) => a - b) });
  } catch (err) {
    res.status(500).json({ error: 'Failed to remove top floor' });
  }
});

/**
 * GET /api/settings/export
 * Exports core business data (Bookings, Invoices, Customers)
 */
settingsRouter.get('/export', requireRoles('admin'), async (req: Request, res: Response) => {
  try {
    const [bookings, invoices, users] = await Promise.all([
      Booking.find().lean(),
      Invoice.find().lean(),
      User.find({ roles: 'customer' }).select('-uid').lean() // Exclude UID for privacy in simple exports
    ]);

    const exportData = {
      generatedAt: new Date(),
      type: "Business Data Export",
      data: {
        bookings,
        invoices,
        customers: users
      }
    };

    const filename = `data-export-${dayjs().format('YYYY-MM-DD')}.json`;
    res.header('Content-Type', 'application/json');
    res.attachment(filename);
    res.send(JSON.stringify(exportData, null, 2));
  } catch (err) {
    console.error("Export failed", err);
    res.status(500).json({ error: "Export failed" });
  }
});

/**
 * GET /api/settings/backup
 * Dumps the entire database state (Admin only)
 */
settingsRouter.get('/backup', requireRoles('admin'), async (req: Request, res: Response) => {
  try {
    const [users, rooms, bookings, invoices, orders, settings] = await Promise.all([
      User.find().lean(),
      Room.find().lean(),
      Booking.find().lean(),
      Invoice.find().lean(),
      Order.find().lean(),
      Settings.find().lean()
    ]);

    const backupData = {
      timestamp: new Date(),
      version: "1.0",
      collections: {
        users,
        rooms,
        bookings,
        invoices,
        orders,
        settings
      }
    };

    const filename = `full-backup-${dayjs().format('YYYY-MM-DD-HHmm')}.json`;
    res.header('Content-Type', 'application/json');
    res.attachment(filename);
    res.send(JSON.stringify(backupData, null, 2));
  } catch (err) {
    console.error("Backup failed", err);
    res.status(500).json({ error: "Backup failed" });
  }
});