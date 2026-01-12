/* */
import mongoose from 'mongoose';

const settingsSchema = new mongoose.Schema({
  // System Info
  hotelName: { type: String, default: 'Grand Hotel' },
  address: { type: String, default: '123 Main Street' },
  phone: { type: String, default: '+1-555-0123' },
  email: { type: String, default: 'info@grandhotel.com' },
  
  // Notification Preferences
  emailNotifications: { type: Boolean, default: true },
  smsNotifications: { type: Boolean, default: false },
  lowStockAlerts: { type: Boolean, default: true },
}, { timestamps: true });

export const Settings = mongoose.model('Settings', settingsSchema);