import dayjs from 'dayjs';
import { Request, Response, Router } from 'express';
import { authenticate, requireRoles } from '../middleware/auth.js';
import { Booking } from '../models/booking.js';
import { Deal } from '../models/deal.js';
import { Feedback } from '../models/feedback.js';
import { InventoryItem } from '../models/inventoryItem.js';
import { Invoice } from '../models/invoice.js';
import { Order } from '../models/order.js';
import { Room } from '../models/room.js';
import { TripRequest } from '../models/tripRequest.js';

export const reportsRouter = Router();
reportsRouter.use(authenticate());

// --- Helper: Convert JSON to CSV ---
const convertToCSV = (data: any[], fields: string[]) => {
  if (!data || data.length === 0) return '';
  const header = fields.join(',') + '\n';
  const rows = data.map(row =>
    fields.map(field => {
      const val = row[field] !== undefined ? row[field] : '';
      return JSON.stringify(val);
    }).join(',')
  );
  return header + rows.join('\n');
};

/**
 * GET /api/reports/sidebar-counts
 * Returns real-time counts for sidebar badges
 */
reportsRouter.get('/sidebar-counts', requireRoles('admin', 'receptionist', 'manager'), async (_req: Request, res: Response) => {
  try {
    const [pendingBookings, activeOrders, lowStockItems] = await Promise.all([
      Booking.countDocuments({ status: 'Pending' }),
      Order.countDocuments({ status: 'Preparing' }),
      InventoryItem.countDocuments({ $expr: { $lte: ["$currentStock", "$minStock"] } })
    ]);

    res.json({
      bookings: pendingBookings,
      dining: activeOrders,
      inventory: lowStockItems
    });
  } catch (err) {
    console.error("Sidebar Counts Error:", err);
    res.json({ bookings: 0, dining: 0, inventory: 0 });
  }
});

/**
 * GET /api/reports/dashboard
 * Aggregates all data for the Main Admin Dashboard
 */
reportsRouter.get('/dashboard', requireRoles('admin', 'manager', 'receptionist'), async (_req: Request, res: Response) => {
  try {
    const today = dayjs();
    const todayStart = today.startOf('day').toDate();
    const todayEnd = today.endOf('day').toDate();

    const sixMonthsAgo = today.subtract(5, 'month').startOf('month').toDate();

    const [
      todayCheckIns,
      todayCheckOuts,
      rooms,
      deals,
      activeBookings,
      bookingsForStats,
      recentBookings,
      recentOrders,
      recentTrips,
      recentFeedback
    ] = await Promise.all([
      Booking.countDocuments({ checkIn: { $gte: todayStart, $lte: todayEnd }, status: { $in: ['Confirmed', 'CheckedIn'] } }),
      Booking.countDocuments({ checkOut: { $gte: todayStart, $lte: todayEnd }, status: { $in: ['CheckedIn', 'CheckedOut'] } }),
      Room.find().lean(),
      Deal.find({ status: 'Ongoing' }).lean(),
      Booking.find({ status: { $in: ['Confirmed', 'CheckedIn'] }, checkIn: { $lte: todayEnd }, checkOut: { $gte: todayStart } })
        .populate('roomId', 'roomNumber rate')
        .populate('guestId', 'name')
        .lean(),
      Booking.find({ status: { $in: ['Confirmed', 'CheckedIn', 'CheckedOut'] }, checkOut: { $gte: sixMonthsAgo } })
        .populate('roomId', 'rate')
        .lean(),
      Booking.find().sort({ createdAt: -1 }).limit(5).populate('roomId', 'roomNumber').populate('guestId', 'name').lean(),
      Order.find().sort({ createdAt: -1 }).limit(5).lean(),
      TripRequest.find().sort({ createdAt: -1 }).limit(5).lean(),
      Feedback.find().sort({ createdAt: -1 }).limit(1).populate('guestId', 'name').populate('bookingId', 'roomId').lean()
    ]);

    // Room metrics
    const totalRooms = rooms.length;
    const availableCount = rooms.filter((r) => r.status === 'Available').length;
    const occupiedCount = rooms.filter((r) => r.status === 'Occupied').length;
    const needsCleaningCount = rooms.filter((r) => r.status === 'Needs Cleaning').length;
    const maintenanceCount = rooms.filter((r) => r.status === 'Maintenance').length;
    const reservedCount = rooms.filter((r) => r.status === 'Reserved').length;
    const outOfOrderCount = rooms.filter((r) => r.status === 'Out of Order').length;

    // Real room status breakdown
    const roomStatusBreakdown = {
      available: availableCount,
      occupied: occupiedCount,
      reserved: reservedCount,
      needsCleaning: needsCleaningCount,
      maintenance: maintenanceCount,
      outOfOrder: outOfOrderCount,
    };

    const floorCompletion = totalRooms > 0
      ? Math.round(((totalRooms - needsCleaningCount - maintenanceCount) / totalRooms) * 100)
      : 100;

    // Room type metrics + deal overlays
    const roomTypesMap = new Map();
    rooms.forEach((r) => {
      if (!roomTypesMap.has(r.type)) {
        roomTypesMap.set(r.type, {
          type: r.type,
          deals: 0,
          current: 0,
          total: 0,
          rate: r.rate,
        });
      }
      const entry = roomTypesMap.get(r.type);
      entry.total += 1;
      if (r.status === 'Occupied') entry.current += 1;
    });

    deals.forEach((d: any) => {
      const roomTypes = Array.isArray(d.roomType) ? d.roomType : [];
      roomTypes.forEach((rtype: string) => {
        for (const [key, val] of roomTypesMap) {
          if (key.toLowerCase().includes(rtype.toLowerCase()) || rtype.toLowerCase().includes(key.toLowerCase())) {
            val.deals += 1;
          }
        }
      });
    });

    const roomTypesData = Array.from(roomTypesMap.values());

    // Occupancy trend (last 6 months)
    const occupancyData: { name: string; percentage: number }[] = [];
    const totalRoomsCount = Math.max(totalRooms, 1);

    for (let i = 5; i >= 0; i--) {
      const month = today.subtract(i, 'month');
      const monthStart = month.startOf('month');
      const monthEnd = month.endOf('month');
      const capacity = totalRoomsCount * month.daysInMonth();
      let occupiedNights = 0;

      bookingsForStats.forEach((b: any) => {
        const start = dayjs(b.checkIn);
        const end = dayjs(b.checkOut);
        const effectiveStart = start.isAfter(monthStart) ? start : monthStart;
        const effectiveEnd = end.isBefore(monthEnd) ? end : monthEnd;
        if (effectiveEnd.isAfter(effectiveStart)) {
          const nights = effectiveEnd.diff(effectiveStart, 'day') || 1;
          occupiedNights += nights;
        }
      });

      occupancyData.push({
        name: month.format('MMM'),
        percentage: capacity ? Math.min(100, Math.round((occupiedNights / capacity) * 100)) : 0,
      });
    }

    // Active guest count (adults + children where present)
    const totalGuests = activeBookings.reduce((sum: number, b: any) => {
      const adults = typeof b.adults === 'number' ? b.adults : 1;
      const kids = typeof b.children === 'number' ? b.children : 0;
      return sum + adults + kids;
    }, 0);

    // Recent activity timeline
    const recentActivity = [
      ...recentBookings.map((b: any) => ({
        id: `booking-${b._id.toString()}`,
        type: b.status === 'CheckedIn' ? 'checkin' : b.status === 'CheckedOut' ? 'checkout' : 'booking',
        description: `${b.guestId?.name || 'Guest'} ${b.status === 'CheckedIn' ? 'checked in' : 'made a booking'}`,
        room: (b.roomId as any)?.roomNumber,
        createdAt: b.createdAt || new Date(),
      })),
      ...recentOrders.map((o: any) => ({
        id: `order-${o._id.toString()}`,
        type: o.status === 'Ready' ? 'order-ready' : 'order',
        description: `Order ${o.status === 'Ready' ? 'ready' : 'placed'} ${o.roomNumber ? `for room ${o.roomNumber}` : ''}`.trim(),
        room: o.roomNumber,
        createdAt: o.createdAt || new Date(),
      })),
      ...recentTrips.map((t: any) => ({
        id: `trip-${t._id.toString()}`,
        type: 'trip',
        description: `Trip ${t.status?.toLowerCase() || 'update'} - ${t.packageName || t.location || 'Custom trip'}`,
        room: undefined,
        createdAt: t.createdAt || new Date(),
      })),
    ]
      .sort((a, b) => dayjs(b.createdAt).valueOf() - dayjs(a.createdAt).valueOf())
      .slice(0, 10)
      .map((item) => ({ ...item, time: dayjs(item.createdAt).toISOString() }));

    // Format most recent feedback for dashboard
    const feedbackData = recentFeedback.length > 0 ? recentFeedback.map((f: any) => {
      const booking = f.bookingId;
      const roomNumber = booking?.roomId?.roomNumber || booking?.roomId?.number || 'N/A';
      return {
        guest: f.guestId?.name || 'Unknown Guest',
        comment: f.comment || f.title || 'No comment',
        room: roomNumber,
        rating: f.rating
      };
    }) : [];

    res.json({
      metrics: {
        todayCheckIns,
        todayCheckOuts,
        totalInHotel: totalGuests || occupiedCount,
        totalAvailableRoom: availableCount,
        totalOccupiedRoom: occupiedCount,
      },
      roomTypes: roomTypesData,
      roomStatus: roomStatusBreakdown,
      floorStatus: {
        percentage: floorCompletion,
        status: [
          { name: 'Completed', color: 'text-blue-500', done: true },
          { name: 'Yet to Complete', color: 'text-gray-400', done: false },
        ],
      },
      occupancyData,
      feedback: feedbackData,
      recentActivity,
    });

  } catch (err) {
    console.error("Dashboard Stats Error:", err);
    res.status(500).json({ error: 'Failed to generate dashboard data' });
  }
});

/**
 * GET /api/reports/occupancy?range=weekly|monthly|yearly
 * Returns occupancy statistics for different time ranges
 */
reportsRouter.get('/occupancy', requireRoles('admin', 'manager', 'receptionist'), async (req: Request, res: Response) => {
  try {
    const range = (req.query.range as string) || 'monthly';
    const today = dayjs();

    const rooms = await Room.find().lean();
    const totalRooms = Math.max(rooms.length, 1);

    let occupancyData: { name: string; percentage: number }[] = [];

    if (range === 'weekly') {
      // Last 7 days
      for (let i = 6; i >= 0; i--) {
        const day = today.subtract(i, 'day');
        const dayStart = day.startOf('day').toDate();
        const dayEnd = day.endOf('day').toDate();

        const occupiedRooms = await Booking.countDocuments({
          status: { $in: ['Confirmed', 'CheckedIn'] },
          checkIn: { $lte: dayEnd },
          checkOut: { $gte: dayStart }
        });

        occupancyData.push({
          name: day.format('ddd'),
          percentage: Math.min(100, Math.round((occupiedRooms / totalRooms) * 100))
        });
      }
    } else if (range === 'yearly') {
      // Last 6 years
      for (let i = 5; i >= 0; i--) {
        const year = today.subtract(i, 'year');
        const yearStart = year.startOf('year');
        const yearEnd = year.endOf('year');
        // Calculate days in year (365 or 366 for leap year)
        const yearNumber = year.year();
        const daysInYear = (yearNumber % 4 === 0 && yearNumber % 100 !== 0) || (yearNumber % 400 === 0) ? 366 : 365;
        const capacity = totalRooms * daysInYear;
        let occupiedNights = 0;

        const yearBookings = await Booking.find({
          status: { $in: ['Confirmed', 'CheckedIn', 'CheckedOut'] },
          checkOut: { $gte: yearStart.toDate() },
          checkIn: { $lte: yearEnd.toDate() }
        }).lean();

        yearBookings.forEach((b: any) => {
          const start = dayjs(b.checkIn);
          const end = dayjs(b.checkOut);
          const effectiveStart = start.isAfter(yearStart) ? start : yearStart;
          const effectiveEnd = end.isBefore(yearEnd) ? end : yearEnd;
          if (effectiveEnd.isAfter(effectiveStart)) {
            const nights = effectiveEnd.diff(effectiveStart, 'day') || 1;
            occupiedNights += nights;
          }
        });

        occupancyData.push({
          name: year.format('YYYY'),
          percentage: capacity ? Math.min(100, Math.round((occupiedNights / capacity) * 100)) : 0
        });
      }
    } else {
      // Monthly (last 6 months) - default
      for (let i = 5; i >= 0; i--) {
        const month = today.subtract(i, 'month');
        const monthStart = month.startOf('month');
        const monthEnd = month.endOf('month');
        const capacity = totalRooms * month.daysInMonth();
        let occupiedNights = 0;

        const monthBookings = await Booking.find({
          status: { $in: ['Confirmed', 'CheckedIn', 'CheckedOut'] },
          checkOut: { $gte: monthStart.toDate() },
          checkIn: { $lte: monthEnd.toDate() }
        }).lean();

        monthBookings.forEach((b: any) => {
          const start = dayjs(b.checkIn);
          const end = dayjs(b.checkOut);
          const effectiveStart = start.isAfter(monthStart) ? start : monthStart;
          const effectiveEnd = end.isBefore(monthEnd) ? end : monthEnd;
          if (effectiveEnd.isAfter(effectiveStart)) {
            const nights = effectiveEnd.diff(effectiveStart, 'day') || 1;
            occupiedNights += nights;
          }
        });

        occupancyData.push({
          name: month.format('MMM'),
          percentage: capacity ? Math.min(100, Math.round((occupiedNights / capacity) * 100)) : 0
        });
      }
    }

    res.json({ occupancyData });
  } catch (err) {
    console.error("Occupancy Stats Error:", err);
    res.status(500).json({ error: 'Failed to get occupancy statistics' });
  }
});

/**
 * GET /api/reports/available-floors
 * Returns list of floors that have rooms
 */
reportsRouter.get('/available-floors', requireRoles('admin', 'manager', 'receptionist'), async (_req: Request, res: Response) => {
  try {
    const floors = await Room.distinct('floor');
    const sortedFloors = floors.sort((a, b) => a - b);
    res.json({ floors: sortedFloors });
  } catch (err) {
    console.error("Available Floors Error:", err);
    res.status(500).json({ error: 'Failed to get available floors' });
  }
});

/**
 * GET /api/reports/floor-status?floor=1
 * Returns floor-specific status and completion percentage
 */
reportsRouter.get('/floor-status', requireRoles('admin', 'manager', 'receptionist'), async (req: Request, res: Response) => {
  try {
    const floorParam = req.query.floor as string;

    if (!floorParam) {
      return res.status(400).json({ error: 'Floor parameter is required' });
    }

    const floor = parseInt(floorParam, 10);
    if (isNaN(floor)) {
      return res.status(400).json({ error: 'Invalid floor number' });
    }

    const rooms = await Room.find({ floor }).lean();
    const totalRooms = rooms.length;

    if (totalRooms === 0) {
      return res.json({
        floor,
        totalRooms: 0,
        percentage: 0,
        status: [
          { name: 'Completed', color: 'text-blue-500', done: true },
          { name: 'Yet to Complete', color: 'text-gray-400', done: false },
        ],
      });
    }

    const cleaningCount = rooms.filter((r) => (r.status as any) === 'Cleaning' || r.status === 'Needs Cleaning').length;
    const maintenanceCount = rooms.filter((r) => r.status === 'Maintenance').length;

    const floorCompletion = Math.round(((totalRooms - cleaningCount - maintenanceCount) / totalRooms) * 100);

    res.json({
      floor,
      totalRooms,
      percentage: floorCompletion,
      status: [
        { name: 'Completed', color: 'text-blue-500', done: true },
        { name: 'Yet to Complete', color: 'text-gray-400', done: false },
      ],
    });

  } catch (err) {
    console.error("Floor Status Error:", err);
    res.status(500).json({ error: 'Failed to get floor status' });
  }
});

/**
 * GET /api/reports/analytics
 * Returns all data needed for the Reports Dashboard
 * Supports query parameter: ?period=daily|weekly|monthly|yearly
 */
reportsRouter.get('/analytics', requireRoles('admin', 'receptionist'), async (req: Request, res: Response) => {
  try {
    const today = dayjs();
    const period = (req.query.period as string) || 'monthly';

    let timeRangeStart: dayjs.Dayjs;
    let iterationUnit: 'day' | 'week' | 'month' | 'year';
    let labelFormat: string;
    let iterations: number;

    // Determine time range based on period
    switch (period) {
      case 'daily':
        timeRangeStart = today.subtract(6, 'day');
        iterationUnit = 'day';
        labelFormat = 'ddd';
        iterations = 7;
        break;
      case 'weekly':
        timeRangeStart = today.subtract(3, 'week');
        iterationUnit = 'week';
        labelFormat = 'MMM DD';
        iterations = 4;
        break;
      case 'yearly':
        timeRangeStart = today.subtract(1, 'year');
        iterationUnit = 'year';
        labelFormat = 'YYYY';
        iterations = 2;
        break;
      case 'monthly':
      default:
        timeRangeStart = today.subtract(5, 'month').startOf('month');
        iterationUnit = 'month';
        labelFormat = 'MMM';
        iterations = 6;
        break;
    }

    const rooms = await Room.find().lean();
    const totalRoomsCount = rooms.length;
    const roomMap = new Map(rooms.map(r => [r._id.toString(), r]));

    // Fetch bookings that overlap with the time window
    const bookings = await Booking.find({
      $or: [
        { checkIn: { $gte: timeRangeStart.toDate() } },
        { checkOut: { $gte: timeRangeStart.toDate() } },
        // Also catch bookings that span across the entire window
        { checkIn: { $lte: timeRangeStart.toDate() }, checkOut: { $gte: today.toDate() } }
      ],
      status: { $in: ['Confirmed', 'CheckedIn', 'CheckedOut'] }
    }).lean();

    // Fetch invoices for actual revenue data
    const invoices = await Invoice.find({
      createdAt: { $gte: timeRangeStart.toDate() },
      status: { $ne: 'Cancelled' }
    }).populate('bookingId').lean();

    const orders = await Order.find({
      createdAt: { $gte: timeRangeStart.toDate() },
      status: { $ne: 'Cancelled' }
    }).lean();

    // Fetch feedback for ratings
    const feedbackRecords = await Feedback.find({
      createdAt: { $gte: timeRangeStart.toDate() }
    }).lean();

    const monthlyData = [];
    let currentIterTime = timeRangeStart.clone();

    // Iterate through the specified period
    for (let i = 0; i < iterations; i++) {
      const periodStart = currentIterTime.startOf(iterationUnit);
      const periodEnd = currentIterTime.endOf(iterationUnit);
      const periodKey = currentIterTime.format(labelFormat);
      const daysInPeriod = periodEnd.diff(periodStart, 'day') + 1;
      const totalCapacity = totalRoomsCount * daysInPeriod;

      let occupiedNights = 0;
      let monthRoomRevenue = 0;

      bookings.forEach(b => {
        const bStart = dayjs(b.checkIn);
        const bEnd = dayjs(b.checkOut);

        // Calculate overlap with this period
        const effectiveStart = bStart.isAfter(periodStart) ? bStart : periodStart;
        const effectiveEnd = bEnd.isBefore(periodEnd) ? bEnd : periodEnd;

        if (effectiveEnd.isAfter(effectiveStart)) {
          const nights = effectiveEnd.diff(effectiveStart, 'day');
          const room = roomMap.get((b.roomId as any).toString());

          if (room) {
            occupiedNights += nights;
          }
        }
      });

      // Calculate ACTUAL revenue from invoices for this period
      invoices.forEach((inv: any) => {
        const invDate = dayjs(inv.createdAt);
        if (invDate.isAfter(periodStart) && invDate.isBefore(periodEnd)) {
          monthRoomRevenue += inv.total || 0;
        }
      });

      const monthFnBRevenue = orders
        .filter(o => {
          const orderTime = dayjs((o as any).createdAt);
          return orderTime.isAfter(periodStart) && orderTime.isBefore(periodEnd);
        })
        .reduce((sum, o) => sum + o.totalAmount, 0);

      monthlyData.push({
        name: periodKey,
        occupancy: totalCapacity > 0 ? Math.round((occupiedNights / totalCapacity) * 100) : 0,
        revenue: monthRoomRevenue + monthFnBRevenue,
        roomRevenue: monthRoomRevenue,
        fnbRevenue: monthFnBRevenue
      });

      currentIterTime = currentIterTime.add(1, iterationUnit);
    }

    // Room Type Distribution Stats - Use actual invoice data
    const roomTypeStats: Record<string, { value: number, revenue: number }> = {};

    invoices.forEach((inv: any) => {
      const booking = inv.bookingId;
      if (booking && booking.roomId) {
        const roomId = typeof booking.roomId === 'object' ? booking.roomId._id?.toString() : booking.roomId.toString();
        const room = roomMap.get(roomId);
        if (room) {
          if (!roomTypeStats[room.type]) roomTypeStats[room.type] = { value: 0, revenue: 0 };
          roomTypeStats[room.type].value += 1;
          roomTypeStats[room.type].revenue += inv.total || 0;
        }
      }
    });

    const roomTypeData = Object.keys(roomTypeStats).map(type => ({
      name: type.charAt(0).toUpperCase() + type.slice(1),
      value: roomTypeStats[type].value,
      revenue: roomTypeStats[type].revenue
    }));

    // Daily Occupancy (Last 7 Days)
    const dailyOccupancy = [];
    for (let i = 6; i >= 0; i--) {
      const day = today.subtract(i, 'day');
      const dayStart = day.startOf('day');
      const dayEnd = day.endOf('day');

      const occupiedCount = bookings.filter(b => {
        const start = dayjs(b.checkIn);
        const end = dayjs(b.checkOut);
        // Is occupied if booking starts before end of day AND ends after start of day
        return start.isBefore(dayEnd) && end.isAfter(dayStart);
      }).length;

      dailyOccupancy.push({
        day: day.format('ddd'),
        occupancy: totalRoomsCount > 0 ? Math.round((occupiedCount / totalRoomsCount) * 100) : 0
      });
    }

    const totalRoomRev = monthlyData.reduce((acc, curr) => acc + curr.roomRevenue, 0);
    const totalFnBRev = monthlyData.reduce((acc, curr) => acc + curr.fnbRevenue, 0);
    const totalRev = totalRoomRev + totalFnBRev;

    const revenueSources = [
      { name: "Room Revenue", value: totalRoomRev, percentage: totalRev ? Math.round((totalRoomRev / totalRev) * 100) : 0 },
      { name: "Food & Beverage", value: totalFnBRev, percentage: totalRev ? Math.round((totalFnBRev / totalRev) * 100) : 0 },
    ];

    const currentMonthData = monthlyData[monthlyData.length - 1];
    const prevMonthData = monthlyData.length > 1 ? monthlyData[monthlyData.length - 2] : { occupancy: 0, revenue: 0 };
    const calculateChange = (current: number, prev: number) => {
      if (prev === 0) return current > 0 ? "100" : "0";
      return (((current - prev) / prev) * 100).toFixed(1);
    };

    // Calculate average rating from actual feedback
    const avgRating = feedbackRecords.length > 0
      ? (feedbackRecords.reduce((sum, f: any) => sum + f.rating, 0) / feedbackRecords.length).toFixed(1)
      : "0.0";

    const metrics = {
      occupancyRate: currentMonthData.occupancy,
      occupancyChange: calculateChange(currentMonthData.occupancy, prevMonthData.occupancy),
      revenue: currentMonthData.revenue,
      revenueChange: calculateChange(currentMonthData.revenue, prevMonthData.revenue),
      totalRooms: totalRoomsCount,
      avgRating: parseFloat(avgRating)
    };

    // Guest Satisfaction by Month - Use real feedback data
    const feedbackByMonth: Record<string, number[]> = {};
    feedbackRecords.forEach((f: any) => {
      const monthKey = dayjs(f.createdAt).format(labelFormat);
      if (!feedbackByMonth[monthKey]) feedbackByMonth[monthKey] = [];
      feedbackByMonth[monthKey].push(f.rating);
    });

    const guestSatisfaction = monthlyData.map(m => {
      const ratings = feedbackByMonth[m.name] || [];
      const avgMonthRating = ratings.length > 0
        ? ratings.reduce((sum, r) => sum + r, 0) / ratings.length
        : 0;
      return {
        month: m.name,
        rating: parseFloat(avgMonthRating.toFixed(1))
      };
    });

    res.json({ metrics, occupancyData: monthlyData, roomTypeData, revenueSources, dailyOccupancy, guestSatisfaction });

  } catch (err) {
    console.error("Analytics Error:", err);
    res.status(500).json({ error: 'Failed to generate analytics' });
  }
});

/**
 * GET /api/reports/export/:type
 * Generates and downloads a CSV report
 */
reportsRouter.get('/export/:type', requireRoles('admin', 'receptionist'), async (req: Request, res: Response) => {
  try {
    const { type } = req.params;
    const today = dayjs();
    let data: any[] = [];
    let fields: string[] = [];
    let filename = `report-${type}-${today.format('YYYY-MM-DD')}.csv`;

    if (type === 'occupancy') {
      fields = ['Date', 'TotalRooms', 'Occupied', 'OccupancyRate'];
      const totalRooms = await Room.countDocuments();

      // Last 30 Days
      for (let i = 0; i < 30; i++) {
        const date = today.subtract(i, 'day');
        const start = date.startOf('day').toDate();
        const end = date.endOf('day').toDate();

        const occupied = await Booking.countDocuments({
          checkIn: { $lte: end },
          checkOut: { $gte: start },
          status: { $in: ['Confirmed', 'CheckedIn'] }
        });

        data.push({
          Date: date.format('YYYY-MM-DD'),
          TotalRooms: totalRooms,
          Occupied: occupied,
          OccupancyRate: totalRooms ? ((occupied / totalRooms) * 100).toFixed(1) + '%' : '0%'
        });
      }

    } else if (type === 'revenue') {
      fields = ['Month', 'RoomRevenue', 'FoodAndBevRevenue', 'TotalRevenue'];

      // Last 6 Months
      for (let i = 0; i < 6; i++) {
        const date = today.subtract(i, 'month');
        const start = date.startOf('month');
        const end = date.endOf('month');

        // Find bookings that CHECKED OUT in this month (Realized Revenue)
        const bookings = await Booking.find({
          checkOut: { $gte: start.toDate(), $lte: end.toDate() },
          status: { $in: ['CheckedOut', 'CheckedIn'] }
        }).populate('roomId');

        // Calculate Revenue: Use totalAmount if exists, else (nights * rate)
        const roomRev = bookings.reduce((sum, b: any) => {
          const nights = dayjs(b.checkOut).diff(dayjs(b.checkIn), 'day') || 1;
          const amount = b.totalAmount || ((b.roomId?.rate || 0) * nights);
          return sum + amount;
        }, 0);

        const orders = await Order.find({
          createdAt: { $gte: start.toDate(), $lte: end.toDate() },
          status: { $ne: 'Cancelled' }
        });
        const fnbRev = orders.reduce((sum, o) => sum + o.totalAmount, 0);

        data.push({
          Month: date.format('MMM YYYY'),
          RoomRevenue: roomRev.toFixed(2),
          FoodAndBevRevenue: fnbRev.toFixed(2),
          TotalRevenue: (roomRev + fnbRev).toFixed(2)
        });
      }

    } else if (type === 'guest') {
      fields = ['GuestName', 'Email', 'CheckIn', 'CheckOut', 'Status', 'Source'];
      const bookings = await Booking.find().sort({ checkIn: -1 }).limit(100).populate('guestId', 'name email');
      data = bookings.map((b: any) => ({
        GuestName: b.guestId?.name || 'Unknown',
        Email: b.guestId?.email || 'N/A',
        CheckIn: dayjs(b.checkIn).format('YYYY-MM-DD'),
        CheckOut: dayjs(b.checkOut).format('YYYY-MM-DD'),
        Status: b.status,
        Source: b.source
      }));

    } else if (type === 'financial') {
      fields = ['InvoiceID', 'Guest', 'Date', 'Subtotal', 'Tax', 'Total', 'Status'];
      const invoices = await Invoice.find().sort({ createdAt: -1 }).limit(200).populate('guestId', 'name');
      data = invoices.map((inv: any) => ({
        InvoiceID: inv._id.toString(),
        Guest: inv.guestId?.name || 'N/A',
        Date: dayjs(inv.createdAt).format('YYYY-MM-DD'),
        Subtotal: inv.subtotal.toFixed(2),
        Tax: inv.tax.toFixed(2),
        Total: inv.total.toFixed(2),
        Status: inv.status
      }));
    } else {
      return res.status(400).json({ error: "Invalid report type" });
    }

    const csv = convertToCSV(data, fields);
    res.header('Content-Type', 'text/csv');
    res.attachment(filename);
    return res.send(csv);

  } catch (err) {
    console.error("Export Error:", err);
    res.status(500).json({ error: 'Failed to export report' });
  }
});
