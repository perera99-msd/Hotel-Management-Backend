// src/models/order.ts
import mongoose, { Schema, Document, Model, Types } from 'mongoose';

export type OrderStatus = 'Preparing' | 'Ready' | 'Served' | 'Cancelled';

export interface IOrderItem {
  menuItemId: Types.ObjectId;
  name: string;
  quantity: number;
  price: number;
}

export interface IOrder extends Document {
  guestId?: Types.ObjectId; // Optional for manual orders
  guestName?: string;       // For manual orders
  roomNumber?: string;
  tableNumber?: string;
  specialNotes?: string;
  items: IOrderItem[];
  totalAmount: number;
  status: OrderStatus;
  placedBy: Types.ObjectId;
}

const OrderItemSchema = new Schema<IOrderItem>({
  menuItemId: { type: Schema.Types.ObjectId, ref: 'MenuItem', required: true },
  name: { type: String, required: true },
  quantity: { type: Number, required: true },
  price: { type: Number, required: true },
});

const OrderSchema = new Schema<IOrder>(
  {
    guestId: { type: Schema.Types.ObjectId, ref: 'User', index: true },
    guestName: { type: String },
    roomNumber: { type: String },
    tableNumber: { type: String },
    specialNotes: { type: String },
    items: { type: [OrderItemSchema], required: true },
    totalAmount: { type: Number, required: true },
    status: { type: String, enum: ['Preparing', 'Ready', 'Served', 'Cancelled'], default: 'Preparing', index: true },
    placedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

export const Order: Model<IOrder> = mongoose.model<IOrder>('Order', OrderSchema);