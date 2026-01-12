/* */
import mongoose, { Schema, Document } from 'mongoose';

export interface IDeal extends Document {
  referenceNumber: string;
  dealName: string;
  reservationsLeft: number;
  startDate: string;
  endDate: string;
  roomType: string[];
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
    reservationsLeft: { type: Number, default: 20 },
    startDate: { type: String, required: true },
    endDate: { type: String, required: true },
    roomType: { type: [String], required: true },
    status: { 
      type: String, 
      enum: ['Ongoing', 'Full', 'Inactive', 'New', 'Finished'], 
      default: 'New' 
    },
    price: { type: Number, required: true },
    discount: { type: Number, default: 0 },
    description: { type: String },
    tags: { type: [String] },
  },
  { timestamps: true }
);

export const Deal = mongoose.model<IDeal>('Deal', DealSchema);