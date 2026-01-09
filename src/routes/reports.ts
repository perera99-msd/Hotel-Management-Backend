import { Router, Request, Response } from 'express';
import { authenticate, requireRoles } from '../middleware/auth.js';
import { Room } from '../models/room.js';
import { Booking } from '../models/booking.js';
import { Order } from '../models/order.js';
import { InventoryItem } from '../models/inventoryItem.js';

export const reportsRouter = Router();
reportsRouter.use(authenticate());

// ... (keep occupancy and sales routes as they are) ...

reportsRouter.get('/occupancy', requireRoles('admin', 'receptionist'), async (_req: Request, res: Response) => {
  try {
    const totalRooms = await Room.countDocuments();
    const occupied = await Room.countDocuments({ status: 'Occupied' });
    const available = await Room.countDocuments({ status: 'Available' });
    const reserved = await Room.countDocuments({ status: 'Reserved' });
    res.json({ totalRooms, occupied, available, reserved, occupancyRate: totalRooms ? Math.round((occupied / totalRooms) * 100) : 0 });
  } catch (err) {
    res.status(500).json({ error: 'Failed to compute occupancy' });
  }
});

reportsRouter.get('/sales', requireRoles('admin'), async (_req: Request, res: Response) => {
  try {
    const since = new Date();
    since.setMonth(since.getMonth() - 12);
    const bookings = await Booking.find({ createdAt: { $gte: since } }).lean();
    const nightly = await Room.find().lean();
    const roomRates = new Map(nightly.map((r) => [r._id.toString(), r.rate]));
    const roomRevenue = bookings.reduce((sum, b) => {
      const nights = Math.max(1, Math.ceil((new Date(b.checkOut).getTime() - new Date(b.checkIn).getTime()) / (24 * 60 * 60 * 1000)));
      return sum + (roomRates.get((b.roomId as any).toString()) || 0) * nights;
    }, 0);
    const fnbRevenue = (await Order.find({ createdAt: { $gte: since } }).lean()).reduce((s, o) => s + o.totalAmount, 0);
    res.json({ roomRevenue, fnbRevenue, total: roomRevenue + fnbRevenue });
  } catch (err) {
    res.status(500).json({ error: 'Failed to compute sales' });
  }
});

reportsRouter.get('/inventory-usage', requireRoles('admin', 'receptionist'), async (_req: Request, res: Response) => {
  try {
    res.json({ message: 'Inventory usage tracking not implemented in this version.' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to compute inventory usage' });
  }
});

// Dashboard summary for receptionist/admin cards
reportsRouter.get('/summary', requireRoles('admin', 'receptionist'), async (_req: Request, res: Response) => {
  try {
    const totalRooms = await Room.countDocuments();
    const availableRooms = await Room.countDocuments({ status: 'Available' });
    const occupiedRooms = await Room.countDocuments({ status: 'Occupied' });
    const needsCleaning = await Room.countDocuments({ needsCleaning: true });
    
    // FIX: Updated field names to match InventoryItem model
    const lowStockCount = await InventoryItem.countDocuments({ 
      $expr: { $lte: ['$currentStock', '$minStock'] } 
    });

    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const endOfToday = new Date();
    endOfToday.setHours(23, 59, 59, 999);
    const todaysCheckins = await Booking.countDocuments({ status: { $in: ['Pending', 'Confirmed'] }, checkIn: { $gte: startOfToday, $lte: endOfToday } });
    const todaysCheckouts = await Booking.countDocuments({ status: { $in: ['CheckedIn'] }, checkOut: { $gte: startOfToday, $lte: endOfToday } });

    const since = new Date();
    since.setMonth(since.getMonth() - 1);
    const bookings = await Booking.find({ createdAt: { $gte: since } }).lean();
    const roomDocs = await Room.find().lean();
    const rateMap = new Map(roomDocs.map((r) => [r._id.toString(), r.rate]));
    const monthlyRoomRevenue = bookings.reduce((sum, b) => {
      const nights = Math.max(1, Math.ceil((new Date(b.checkOut).getTime() - new Date(b.checkIn).getTime()) / (24 * 60 * 60 * 1000)));
      return sum + (rateMap.get((b.roomId as any).toString()) || 0) * nights;
    }, 0);
    const monthlyFnb = (await Order.find({ createdAt: { $gte: since } }).lean()).reduce((s, o) => s + o.totalAmount, 0);

    res.json({
      totalRooms,
      availableRooms,
      occupiedRooms,
      needsCleaning,
      lowStockCount,
      todaysCheckins,
      todaysCheckouts,
      monthlyRevenue: monthlyRoomRevenue + monthlyFnb,
    });
  } catch (err) {
    console.error("Summary error:", err);
    res.status(500).json({ error: 'Failed to build summary' });
  }
});