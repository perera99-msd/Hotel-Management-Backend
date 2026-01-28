import mongoose, { Document, Model, Schema, Types } from 'mongoose';

export type BookingStatus = 'Pending' | 'Confirmed' | 'CheckedIn' | 'CheckedOut' | 'Cancelled';
export type BookingSource = 'Local' | 'Online' | 'Booking.com' | 'TripAdvisor' | 'Expedia';

export interface IBooking extends Document {
  roomId: Types.ObjectId;
  guestId: Types.ObjectId;
  checkIn: Date;
  checkOut: Date;
  status: BookingStatus;
  source: BookingSource;
  sourceBookingId?: string;
  // ✅ Added missing fields
  adults: number;
  children: number;
  preferences?: {
    bedType?: string;
    mealPlan?: string;
    specialRequests?: string;
  };
  // Pricing fields for rates/deals
  appliedRate?: number;
  appliedRateSource?: 'room' | 'rate' | 'deal';
  appliedRateId?: Types.ObjectId;
  appliedDealId?: Types.ObjectId;
  appliedDiscount?: number;
  roomNights?: number;
  roomTotal?: number;
  // ✅ Rate Locking - Pricing Snapshot
  pricingSnapshot?: {
    baseRate: number;
    totalAmount: number;
    taxApplied: number;
    currency: string;
  };
  // ✅ Detailed rate breakdown for multi-month and pro-rated deals
  rateBreakdown?: {
    totalNights: number;
    monthlyBreakdowns: Array<{
      month: number;
      monthName: string;
      year: number;
      days: number;
      rate: number;
      subtotal: number;
      dealDays?: number;
      dealName?: string;
      dealDiscount?: number;
      dealAmount?: number;
    }>;
    subtotal: number;
    totalDealDiscount: number;
    total: number;
    dealApplied: boolean;
    dealName?: string;
    lineItemDescriptions: string[];
  };
}

const BookingSchema = new Schema<IBooking>(
  {
    roomId: { type: Schema.Types.ObjectId, ref: 'Room', required: true, index: true },
    guestId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    checkIn: { type: Date, required: true },
    checkOut: { type: Date, required: true },
    status: { type: String, enum: ['Pending', 'Confirmed', 'CheckedIn', 'CheckedOut', 'Cancelled'], default: 'Pending' },

    source: {
      type: String,
      enum: ['Local', 'Online', 'Booking.com', 'TripAdvisor', 'Expedia'],
      default: 'Local',
      index: true
    },

    sourceBookingId: { type: String, index: true },

    // ✅ Added new fields to Schema
    adults: { type: Number, default: 1 },
    children: { type: Number, default: 0 },
    preferences: {
      bedType: { type: String },
      mealPlan: { type: String },
      specialRequests: { type: String }
    },
    appliedRate: { type: Number },
    appliedRateSource: { type: String, enum: ['room', 'rate', 'deal'] },
    appliedRateId: { type: Schema.Types.ObjectId, ref: 'Rate' },
    appliedDealId: { type: Schema.Types.ObjectId, ref: 'Deal' },
    appliedDiscount: { type: Number, default: 0 },
    roomNights: { type: Number },
    roomTotal: { type: Number },
    pricingSnapshot: {
      baseRate: { type: Number },
      totalAmount: { type: Number },
      taxApplied: { type: Number },
      currency: { type: String, default: 'USD' }
    },
    rateBreakdown: {
      totalNights: { type: Number },
      monthlyBreakdowns: [{
        month: { type: Number },
        monthName: { type: String },
        year: { type: Number },
        days: { type: Number },
        rate: { type: Number },
        subtotal: { type: Number },
        dealDays: { type: Number },
        dealName: { type: String },
        dealDiscount: { type: Number },
        dealAmount: { type: Number }
      }],
      subtotal: { type: Number },
      totalDealDiscount: { type: Number },
      total: { type: Number },
      dealApplied: { type: Boolean },
      dealName: { type: String },
      lineItemDescriptions: [{ type: String }]
    }
  },
  { timestamps: true }
);

BookingSchema.index({ source: 1, sourceBookingId: 1 }, { unique: true, partialFilterExpression: { sourceBookingId: { $exists: true } } });

export const Booking: Model<IBooking> = mongoose.model<IBooking>('Booking', BookingSchema);