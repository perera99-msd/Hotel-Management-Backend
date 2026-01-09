import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IInventoryItem extends Document {
  name: string;
  category: 'food' | 'beverage' | 'cleaning' | 'amenities' | 'other';
  currentStock: number;
  minStock: number;
  maxStock: number;
  unit: string;
  cost: number;
  supplier?: string;
  lastRestocked?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const InventoryItemSchema = new Schema<IInventoryItem>(
  {
    name: { type: String, required: true, index: true },
    category: { 
      type: String, 
      required: true, 
      enum: ['food', 'beverage', 'cleaning', 'amenities', 'other'],
      default: 'other' 
    },
    currentStock: { type: Number, required: true, default: 0, min: 0 },
    minStock: { type: Number, required: true, default: 0, min: 0 },
    maxStock: { type: Number, required: true, default: 0, min: 0 },
    unit: { type: String, required: true },
    cost: { type: Number, required: true, default: 0, min: 0 },
    supplier: { type: String },
    lastRestocked: { type: Date },
  },
  { timestamps: true }
);

export const InventoryItem: Model<IInventoryItem> = mongoose.model<IInventoryItem>('InventoryItem', InventoryItemSchema);