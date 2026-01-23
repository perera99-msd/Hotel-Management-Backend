import mongoose, { Schema, Document, Model, Types } from 'mongoose';

export interface IRevenue extends Document {
  invoiceId: Types.ObjectId;
  bookingId: Types.ObjectId;
  amount: number;
  date: Date;
  year: number;
  month: number;
  day: number;
  createdAt: Date;
  updatedAt: Date;
}

const RevenueSchema = new Schema<IRevenue>(
  {
    invoiceId: { type: Schema.Types.ObjectId, ref: 'Invoice', required: true, index: true },
    bookingId: { type: Schema.Types.ObjectId, ref: 'Booking', required: true, index: true },
    amount: { type: Number, required: true },
    date: { type: Date, required: true, index: true },
    year: { type: Number, required: true },
    month: { type: Number, required: true },
    day: { type: Number, required: true }
  },
  { timestamps: true }
);

// Compound index for efficient querying
RevenueSchema.index({ year: 1, month: 1, day: 1 });
RevenueSchema.index({ year: 1, month: 1 });
RevenueSchema.index({ year: 1 });

export const Revenue: Model<IRevenue> = mongoose.model<IRevenue>('Revenue', RevenueSchema);
