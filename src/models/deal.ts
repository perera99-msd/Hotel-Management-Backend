/* */
import mongoose, { Document, Schema, Types } from 'mongoose';

export interface IDeal extends Document {
  referenceNumber: string;
  dealName: string;
  dealType: 'room' | 'food' | 'trip';
  startDate: string;
  endDate: string;
  discountType?: 'percentage' | 'bogo';
  roomType?: string[];
  roomIds?: Types.ObjectId[];
  menuItemIds?: Types.ObjectId[];
  tripPackageIds?: Types.ObjectId[];
  status: 'Ongoing' | 'Full' | 'Inactive' | 'New' | 'Finished';
  price: number;
  discount: number;
  description?: string;
  tags?: string[];
  image?: string; // ✅ Single image
  createdAt: Date;
  updatedAt: Date;
}

const DealSchema = new Schema<IDeal>(
  {
    referenceNumber: { type: String, required: true, unique: true },
    dealName: { type: String, required: true },
    dealType: { type: String, enum: ['room', 'food', 'trip'], default: 'room', index: true },
    startDate: { type: String, required: true },
    endDate: { type: String, required: true },
    discountType: { type: String, enum: ['percentage', 'bogo'], default: 'percentage' },
    roomType: { type: [String] },
    roomIds: { type: [Schema.Types.ObjectId], ref: 'Room' },
    menuItemIds: { type: [Schema.Types.ObjectId], ref: 'MenuItem' },
    tripPackageIds: { type: [Schema.Types.ObjectId], ref: 'TripPackage' },
    status: {
      type: String,
      enum: ['Ongoing', 'Full', 'Inactive', 'New', 'Finished'],
      default: 'New'
    },
    price: { type: Number, default: 0 }, // Optional: calculated from monthly rate + discount
    discount: { type: Number, default: 0, required: true }, // Discount % applied to monthly rate
    description: { type: String },
    tags: { type: [String] },
    image: { type: String }, // ✅ Single image URL
  },
  { timestamps: true }
);

export const Deal = mongoose.model<IDeal>('Deal', DealSchema);