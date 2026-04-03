import AuditLog from '../models/AuditLog.js';

export const logAction = async (userId, action, ip, metadata = {}) => {
  try {
    await AuditLog.create({ userId, action, ip, metadata });
  } catch (err) {
    console.error('Audit log error:', err);
  }
};
