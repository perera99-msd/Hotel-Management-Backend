/* */
import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IDeal extends Document {
  referenceNumber: string;
  dealName: string;
  startDate: string;
  endDate: string;
  roomType: string[];
  roomIds?: Types.ObjectId[];
  status: 'Ongoing' | 'Full' | 'Inactive' | 'New' | 'Finished';
  price: number;
  discount: number;
  description?: string;
  tags?: string[];
  createdAt: Date;
  updatedAt: Date;
}

const DealSchema = new Schema<IDeal>(
  {
    referenceNumber: { type: String, required: true, unique: true },
    dealName: { type: String, required: true },
    startDate: { type: String, required: true },
    endDate: { type: String, required: true },
    roomType: { type: [String], required: true },
    roomIds: { type: [Schema.Types.ObjectId], ref: 'Room', required: true }, // Required: deals must target specific rooms
    status: { 
      type: String, 
      enum: ['Ongoing', 'Full', 'Inactive', 'New', 'Finished'], 
      default: 'New' 
    },
    price: { type: Number, default: 0 }, // Optional: calculated from monthly rate + discount
    discount: { type: Number, default: 0, required: true }, // Discount % applied to monthly rate
    description: { type: String },
    tags: { type: [String] },
  },
  { timestamps: true }
);

export const Deal = mongoose.model<IDeal>('Deal', DealSchema);