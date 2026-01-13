import mongoose, { Schema, Document } from 'mongoose';

export interface IUser extends Document {
  uid?: string;          // Made optional for shadow profiles
  email: string;
  name: string;
  phone?: string;
  roles: string[];
  status: 'active' | 'inactive';
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema = new Schema<IUser>(
  {
    uid: { 
      type: String, 
      required: false, // Allows creation of guest profiles without Firebase UID
      unique: true, 
      sparse: true,    // Essential: allows multiple null/missing values in a unique index
      index: true 
    },
    email: { 
      type: String, 
      required: true, 
      unique: true, 
      lowercase: true, 
      trim: true 
    },
    name: { type: String, required: true },
    phone: { type: String },
    roles: { 
      type: [String], 
      default: ['customer'],
      enum: ['admin', 'manager', 'receptionist', 'customer'] 
    },
    status: {
      type: String,
      enum: ['active', 'inactive'],
      default: 'active'
    }
  },
  { timestamps: true }
);

export const User = mongoose.model<IUser>('User', UserSchema);