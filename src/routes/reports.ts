/* */
import { Router, Request, Response } from 'express';
import { authenticate, requireRoles } from '../middleware/auth.js';
import { Room } from '../models/room.js';
import { Booking } from '../models/booking.js';
import { Order } from '../models/order.js';
import { Invoice } from '../models/invoice.js';
import { InventoryItem } from '../models/inventoryItem.js';
import { Deal } from '../models/deal.js';
import dayjs from 'dayjs';

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
    const todayStart = dayjs().startOf('day').toDate();
    const todayEnd = dayjs().endOf('day').toDate();

    // 1. Fetch Metrics (Parallel)
    const [
      todayCheckIns,
      todayCheckOuts,
      rooms,
      deals
    ] = await Promise.all([
      Booking.countDocuments({ checkIn: { $gte: todayStart, $lte: todayEnd }, status: { $in: ['Confirmed', 'CheckedIn'] } }),
      Booking.countDocuments({ checkOut: { $gte: todayStart, $lte: todayEnd }, status: { $in: ['CheckedIn', 'CheckedOut'] } }),
      Room.find().lean(), 
      Deal.find({ status: 'Ongoing' }).lean()
    ]);

    // 2. Process Room Metrics
    let totalAvailable = 0;
    let totalOccupied = 0;
    let statusBreakdown = {
      occupied: { clean: 0, dirty: 0, inspected: 0 },
      available: { clean: 0, dirty: 0, inspected: 0 }
    };

    rooms.forEach(r => {
      if (r.status === 'Occupied') {
        totalOccupied++;
        statusBreakdown.occupied.clean++; 
      } else if (r.status === 'Available') {
        totalAvailable++;
        statusBreakdown.available.clean++;
      } else if (r.status === 'Cleaning') {
        statusBreakdown.available.dirty++; 
      } else if (r.status === 'Maintenance') {
        statusBreakdown.available.inspected++; 
      }
    });

    const totalRooms = rooms.length;
    const floorCompletion = totalRooms > 0 
      ? Math.round(((totalAvailable + totalOccupied) / totalRooms) * 100) 
      : 100;

    // 3. Process Room Types Data
    const roomTypesMap = new Map();
    
    rooms.forEach(r => {
      if (!roomTypesMap.has(r.type)) {
        roomTypesMap.set(r.type, { 
          type: r.type, 
          deals: 0, 
          current: 0, 
          total: 0, 
          rate: r.rate 
        });
      }
      const entry = roomTypesMap.get(r.type);
      entry.total++;
      if (r.status === 'Occupied') entry.current++;
    });

    // Map Active Deals to Room Types
    deals.forEach(d => {
      d.roomType.forEach((rtype: string) => {
        for (let [key, val] of roomTypesMap) {
          if (key.toLowerCase().includes(rtype.toLowerCase()) || rtype.toLowerCase().includes(key.toLowerCase())) {
            val.deals++;
          }
        }
      });
    });

    const roomTypesData = Array.from(roomTypesMap.values());

    // 4. Mock/Generate Occupancy Trend 
    const occupancyData = [
      { name: "Jan", percentage: 65 }, { name: "Feb", percentage: 70 },
      { name: "Mar", percentage: 75 }, { name: "Apr", percentage: 60 },
      { name: "May", percentage: 80 }, { name: "Jun", percentage: 85 },
      { name: "Jul", percentage: 90 }, { name: "Aug", percentage: 95 },
      { name: "Sep", percentage: 70 }, { name: "Oct", percentage: 75 },
      { name: "Nov", percentage: 85 }, { name: "Dec", percentage: 90 },
    ];

    // 5. Mock Feedback
    const feedback = [
      { guest: "Mark", comment: "Food could be better.", room: "A201" },
      { guest: "Christian", comment: "Facilities are not enough for amount paid.", room: "A101" },
      { guest: "Alexander", comment: "Room cleaning could be better.", room: "A301" },
    ];

    res.json({
      metrics: {
        todayCheckIns,
        todayCheckOuts,
        totalInHotel: totalOccupied * 2, 
        totalAvailableRoom: totalAvailable,
        totalOccupiedRoom: totalOccupied
      },
      roomTypes: roomTypesData,
      roomStatus: {
        occupied: { occupied: totalOccupied, ...statusBreakdown.occupied },
        available: { occupied: totalAvailable + statusBreakdown.available.dirty, ...statusBreakdown.available }
      },
      floorStatus: {
        percentage: floorCompletion,
        status: [
            { name: "Completed", color: "text-blue-500", done: true },
            { name: "Yet to Complete", color: "text-gray-400", done: false },
        ]
      },
      occupancyData,
      feedback
    });

  } catch (err) {
    console.error("Dashboard Stats Error:", err);
    res.status(500).json({ error: 'Failed to generate dashboard data' });
  }
});

/**
 * GET /api/reports/analytics
 * Returns all data needed for the Reports Dashboard
 */
reportsRouter.get('/analytics', requireRoles('admin', 'receptionist'), async (_req: Request, res: Response) => {
  try {
    const today = dayjs();
    const sixMonthsAgo = today.subtract(5, 'month').startOf('month');

    const rooms = await Room.find().lean();
    const totalRoomsCount = rooms.length;
    const roomMap = new Map(rooms.map(r => [r._id.toString(), r]));
    
    const bookings = await Booking.find({
      $or: [
        { checkIn: { $gte: sixMonthsAgo.toDate() } },
        { checkOut: { $gte: sixMonthsAgo.toDate() } }
      ],
      status: { $in: ['Confirmed', 'CheckedIn', 'CheckedOut'] }
    }).lean();

    const orders = await Order.find({
      createdAt: { $gte: sixMonthsAgo.toDate() },
      status: { $ne: 'Cancelled' }
    }).lean();

    const monthlyData = [];
    let currentIterMonth = sixMonthsAgo.clone();

    while (currentIterMonth.isBefore(today.add(1, 'month'))) {
      const monthStart = currentIterMonth.startOf('month');
      const monthEnd = currentIterMonth.endOf('month');
      const monthKey = currentIterMonth.format('MMM');
      const daysInMonth = currentIterMonth.daysInMonth();
      const totalCapacity = totalRoomsCount * daysInMonth;

      let occupiedNights = 0;
      let monthRoomRevenue = 0;

      bookings.forEach(b => {
        const bStart = dayjs(b.checkIn);
        const bEnd = dayjs(b.checkOut);
        
        const effectiveStart = bStart.isAfter(monthStart) ? bStart : monthStart;
        const effectiveEnd = bEnd.isBefore(monthEnd) ? bEnd : monthEnd;

        if (effectiveEnd.isAfter(effectiveStart)) {
          const nights = effectiveEnd.diff(effectiveStart, 'day');
          const room = roomMap.get((b.roomId as any).toString());
          if (room) {
            occupiedNights += nights;
            monthRoomRevenue += (room.rate * nights);
          }
        }
      });

      const monthFnBRevenue = orders
        .filter(o => dayjs((o as any).createdAt).isSame(currentIterMonth, 'month'))
        .reduce((sum, o) => sum + o.totalAmount, 0);

      monthlyData.push({
        name: monthKey,
        occupancy: totalCapacity > 0 ? Math.round((occupiedNights / totalCapacity) * 100) : 0,
        revenue: monthRoomRevenue + monthFnBRevenue,
        roomRevenue: monthRoomRevenue,
        fnbRevenue: monthFnBRevenue
      });

      currentIterMonth = currentIterMonth.add(1, 'month');
    }

    const roomTypeStats: Record<string, { value: number, revenue: number }> = {};
    bookings.forEach(b => {
      const room = roomMap.get((b.roomId as any).toString());
      if (room) {
         const nights = Math.max(1, dayjs(b.checkOut).diff(dayjs(b.checkIn), 'day'));
         const val = room.rate * nights;
         if (!roomTypeStats[room.type]) roomTypeStats[room.type] = { value: 0, revenue: 0 };
         roomTypeStats[room.type].value += 1;
         roomTypeStats[room.type].revenue += val;
      }
    });

    const roomTypeData = Object.keys(roomTypeStats).map(type => ({
      name: type.charAt(0).toUpperCase() + type.slice(1),
      value: roomTypeStats[type].value,
      revenue: roomTypeStats[type].revenue
    }));

    const dailyOccupancy = [];
    for (let i = 6; i >= 0; i--) {
      const day = today.subtract(i, 'day');
      const dayStart = day.startOf('day');
      const dayEnd = day.endOf('day');
      
      const occupiedCount = bookings.filter(b => {
        const start = dayjs(b.checkIn);
        const end = dayjs(b.checkOut);
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
      { name: "Room Revenue", value: totalRoomRev, percentage: totalRev ? Math.round((totalRoomRev/totalRev)*100) : 0 },
      { name: "Food & Beverage", value: totalFnBRev, percentage: totalRev ? Math.round((totalFnBRev/totalRev)*100) : 0 },
    ];

    const currentMonthData = monthlyData[monthlyData.length - 1];
    const prevMonthData = monthlyData.length > 1 ? monthlyData[monthlyData.length - 2] : { occupancy: 0, revenue: 0 };
    const calculateChange = (current: number, prev: number) => {
      if (prev === 0) return current > 0 ? "100" : "0";
      return (((current - prev) / prev) * 100).toFixed(1);
    };

    const metrics = {
      occupancyRate: currentMonthData.occupancy,
      occupancyChange: calculateChange(currentMonthData.occupancy, prevMonthData.occupancy),
      revenue: currentMonthData.revenue,
      revenueChange: calculateChange(currentMonthData.revenue, prevMonthData.revenue),
      totalRooms: totalRoomsCount,
      avgRating: 4.8 
    };

    const guestSatisfaction = monthlyData.map(m => ({
        month: m.name,
        rating: 4.0 + (Math.random() * 1) 
    }));

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
      for (let i = 29; i >= 0; i--) {
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
      for (let i = 5; i >= 0; i--) {
        const date = today.subtract(i, 'month');
        const start = date.startOf('month');
        const end = date.endOf('month');
        
        const bookings = await Booking.find({ createdAt: { $gte: start.toDate(), $lte: end.toDate() }, status: 'CheckedOut' }).populate('roomId');
        const roomRev = bookings.reduce((sum, b: any) => sum + (b.roomId?.rate || 0), 0);
        
        const orders = await Order.find({ createdAt: { $gte: start.toDate(), $lte: end.toDate() }, status: { $ne: 'Cancelled' } });
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