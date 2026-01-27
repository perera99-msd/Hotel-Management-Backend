// src/models/room.ts
import mongoose, { Document, Model, Schema } from 'mongoose';

export type RoomType = 'single' | 'double' | 'suite' | 'family';
export type RoomStatus = 'Available' | 'Occupied' | 'Reserved' | 'Cleaning' | 'Maintenance';
export type RoomTier = 'Deluxe' | 'Normal';

export interface IRoom extends Document {
  name?: string;
  roomNumber: string; // Changed to String to support "101A" etc.
  type: RoomType;
  tier: RoomTier; // Deluxe or Normal
  rate: number;
  monthlyRates: number[]; // 12 monthly rates (Jan-Dec)
  amenities: string[];
  status: RoomStatus;
  floor: number;        // ✅ Added
  maxOccupancy: number; // ✅ Added
}

const RoomSchema = new Schema<IRoom>(
  {
    name: { type: String, trim: true },
    roomNumber: { type: String, required: true, unique: true, index: true },
    type: { type: String, enum: ['single', 'double', 'suite', 'family'], required: true },
    tier: { type: String, enum: ['Deluxe', 'Normal'], default: 'Normal', index: true },
    rate: { type: Number, required: true },
    monthlyRates: {
      type: [Number],
      default: function (this: any) {
        return Array(12).fill(this.rate || 0);
      }
    },
    amenities: { type: [String], default: [] },
    status: {
      type: String,
      enum: ['Available', 'Occupied', 'Reserved', 'Cleaning', 'Maintenance'],
      default: 'Available'
    },
    floor: { type: Number, required: true, default: 0 },         // ✅ Added (required)
    maxOccupancy: { type: Number, default: 2 },  // ✅ Added
  },
  { timestamps: true }
);

export const Room: Model<IRoom> = mongoose.model<IRoom>('Room', RoomSchema);