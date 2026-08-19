const jwt = require('jsonwebtoken');
const User = require('../models/User');

// الدالة الرئيسية للمصادقة
const auth = async function (req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'Access denied. No token provided.' });
    }
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId).select('-password');
    if (!user) return res.status(401).json({ message: 'User not found.' });
    if (!user.isActive) return res.status(401).json({ message: 'User is disabled.' });
    req.user = user;
    next();
  } catch (err) {
    res.status(401).json({ message: 'Invalid token.' });
  }
};

// دالة التحقق من الدور
const requireRole = (role) => {
  return (req, res, next) => {
    if (req.user && req.user.role === role) {
      next();
    } else {
      res.status(403).json({ message: 'Forbidden: insufficient permissions.' });
    }
  };
};

// تصدير الدوال بشكل صحيح
module.exports = auth;
module.exports.requireRole = requireRole;