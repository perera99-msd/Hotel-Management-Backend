// src/models/order.ts
import mongoose, { Document, Model, Schema, Types } from 'mongoose';

export type OrderStatus = 'Preparing' | 'Ready' | 'Served' | 'Cancelled';

export interface IOrderItem {
  menuItemId: Types.ObjectId;
  name: string;
  quantity: number;
  price: number;
}

export interface IOrder extends Document {
  bookingId: Types.ObjectId;
  guestId?: Types.ObjectId; // Optional for manual orders
  guestName?: string;       // For manual orders
  roomNumber?: string;
  tableNumber?: string;
  specialNotes?: string;
  items: IOrderItem[];
  totalAmount: number;
  dealDiscount?: number;
  appliedDeals?: {
    dealId: Types.ObjectId;
    dealName?: string;
    discountType?: 'percentage' | 'bogo';
    discount?: number;
    savings?: number;
  }[];
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
    bookingId: { type: Schema.Types.ObjectId, ref: 'Booking', required: true, index: true },
    guestId: { type: Schema.Types.ObjectId, ref: 'User', index: true },
    guestName: { type: String },
    roomNumber: { type: String },
    tableNumber: { type: String },
    specialNotes: { type: String },
    items: { type: [OrderItemSchema], required: true },
    totalAmount: { type: Number, required: true },
    dealDiscount: { type: Number, default: 0 },
    appliedDeals: {
      type: [
        {
          dealId: { type: Schema.Types.ObjectId, ref: 'Deal', required: true },
          dealName: { type: String },
          discountType: { type: String, enum: ['percentage', 'bogo'] },
          discount: { type: Number },
          savings: { type: Number }
        }
      ],
      default: []
    },
    status: { type: String, enum: ['Preparing', 'Ready', 'Served', 'Cancelled'], default: 'Preparing', index: true },
    placedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

export const Order: Model<IOrder> = mongoose.model<IOrder>('Order', OrderSchema);