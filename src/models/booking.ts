import mongoose, { Schema, Document, Model, Types } from 'mongoose';

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
    roomTotal: { type: Number }
  },
  { timestamps: true }
);

BookingSchema.index({ source: 1, sourceBookingId: 1 }, { unique: true, partialFilterExpression: { sourceBookingId: { $exists: true } } });

export const Booking: Model<IBooking> = mongoose.model<IBooking>('Booking', BookingSchema);