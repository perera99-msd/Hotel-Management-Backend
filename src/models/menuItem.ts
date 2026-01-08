// src/models/menuItem.ts
import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IMenuItem extends Document {
  name: string;
  category: string;
  description?: string;
  ingredients: string[];
  price: number;
  discount?: number;
  available: boolean;
  image?: string;
}

const MenuItemSchema = new Schema<IMenuItem>(
  {
    name: { type: String, required: true },
    category: { type: String, required: true },
    description: { type: String },
    ingredients: { type: [String], default: [] },
    price: { type: Number, required: true },
    discount: { type: Number },
    available: { type: Boolean, default: true },
    image: { type: String }, // Storing base64 string for simplicity
  },
  { timestamps: true }
);

export const MenuItem: Model<IMenuItem> = mongoose.model<IMenuItem>('MenuItem', MenuItemSchema);