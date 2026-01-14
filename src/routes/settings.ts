import { Router, Request, Response } from 'express';
import { authenticate, requireRoles } from '../middleware/auth.js';
import { Settings } from '../models/settings.js';
import { User } from '../models/user.js';
import { Room } from '../models/room.js';
import { Booking } from '../models/booking.js';
import { Invoice } from '../models/invoice.js';
import { Order } from '../models/order.js';
import dayjs from 'dayjs';

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