import mongoose from 'mongoose';

const auditSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  action: { type: String, required: true },
  ip: { type: String },
  metadata: { type: Object },
  timestamp: { type: Date, default: Date.now },
});

export default mongoose.model('AuditLog', auditSchema);
