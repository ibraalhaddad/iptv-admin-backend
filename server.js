require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const packageRoutes = require('./routes/packages');
const hostRoutes = require('./routes/hosts');
const lineRoutes = require('./routes/lines');
const couponRoutes = require('./routes/coupons');
const statsRoutes = require('./routes/stats');
const settingsRoutes = require('./routes/settings');

const app = express();

app.use(cors());
app.use(express.json());

// الاتصال بقاعدة البيانات
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('✅ MongoDB connected'))
  .catch(err => {
    console.error('❌ MongoDB connection error:', err);
    process.exit(1);
  });

// المسارات
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/packages', packageRoutes);
app.use('/api/hosts', hostRoutes);
app.use('/api/lines', lineRoutes);
app.use('/api/coupons', couponRoutes);
app.use('/api/stats', statsRoutes);
app.use('/api/settings', settingsRoutes);

// معالجة الأخطاء
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ message: 'Internal server error' });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, '0.0.0.0', () => console.log(`🚀 Server running on port ${PORT}`));