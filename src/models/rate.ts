/* */
import mongoose, { Schema, Document } from 'mongoose';

export interface IRate extends Document {
  roomType: string;
  cancellationPolicy: string;
  price: number;
  rooms: number; // Availability count
  deals?: string; // Derived field
  createdAt: Date;
  updatedAt: Date;
}

const RateSchema = new Schema<IRate>(
  {
    roomType: { type: String, required: true },
    cancellationPolicy: { type: String, required: true },
    price: { type: Number, required: true },
    rooms: { type: Number, required: true, default: 0 },
    deals: { type: String, default: '' },
  },
  { timestamps: true }
);

export const Rate = mongoose.model<IRate>('Rate', RateSchema);