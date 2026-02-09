import mongoose, { Document, Model, Schema, Types } from 'mongoose';

export type TripRequestStatus = 'Requested' | 'Pending' | 'Confirmed' | 'Completed' | 'Cancelled' | 'Reviewed' | 'Approved' | 'Rejected';

export interface ITripRequest extends Document {
  bookingId: Types.ObjectId;
  requestedBy: Types.ObjectId;
  packageId?: Types.ObjectId; // Link to specific package if applicable
  packageName?: string;       // Snapshot of name in case package is deleted
  location?: string;
  tripDate?: Date;
  participants: number;
  totalPrice?: number;
  appliedDealId?: Types.ObjectId;
  appliedDiscount?: number;
  dealDiscountAmount?: number;
  details: string;            // Notes or Custom Details
  status: TripRequestStatus;
  responseNotes?: string;
}

const TripRequestSchema = new Schema<ITripRequest>(
  {
    bookingId: { type: Schema.Types.ObjectId, ref: 'Booking', required: true, index: true },
    requestedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    packageId: { type: Schema.Types.ObjectId, ref: 'TripPackage' },
    packageName: { type: String },
    location: { type: String },
    tripDate: { type: Date },
    participants: { type: Number, default: 1 },
    totalPrice: { type: Number },
    appliedDealId: { type: Schema.Types.ObjectId, ref: 'Deal' },
    appliedDiscount: { type: Number },
    dealDiscountAmount: { type: Number },
    details: { type: String, default: '' },
    status: {
      type: String,
      enum: ['Requested', 'Pending', 'Confirmed', 'Completed', 'Cancelled', 'Reviewed', 'Approved', 'Rejected'],
      default: 'Pending',
      index: true
    },
    responseNotes: { type: String },
  },
  { timestamps: true }
);

export const TripRequest: Model<ITripRequest> = mongoose.model<ITripRequest>('TripRequest', TripRequestSchema);