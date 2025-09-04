require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const http = require('http');
const { Server } = require('socket.io');
const connectDatabase = require('./config/database');
const cron = require('node-cron');
const FailsafeService = require('./services/failsafeService');

// Initialize Express app
const app = express();
const server = http.createServer(app);

// Initialize Socket.IO
const io = new Server(server, {
  cors: {
    origin: process.env.ALLOWED_ORIGINS?.split(',') || ["http://localhost:3000"],
    methods: ["GET", "POST"]
  }
});

// Connect to database
connectDatabase();

// Initialize failsafe service after database connection
let failsafeService = null;

// Security middleware
app.use(helmet());

// CORS middleware
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || ["http://localhost:3000"],
  credentials: true
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: parseInt(process.env.MAX_REQUESTS_PER_MINUTE) || 100,
  message: {
    success: false,
    message: 'Too many requests from this IP, please try again later.'
  },
  standardHeaders: true,
  legacyHeaders: false
});
app.use('/api', limiter);

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Add Socket.IO to request object for use in controllers
app.use((req, res, next) => {
  req.io = io;
  next();
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'AgriSmart Greenhouse Server is running!',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// API Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/sensors', require('./routes/sensors'));
app.use('/api/control', require('./routes/control'));

// API Documentation endpoint
app.get('/api', (req, res) => {
  res.json({
    success: true,
    message: 'AgriSmart Greenhouse API',
    version: '1.0.0',
    endpoints: {
      authentication: {
        register: 'POST /api/auth/register',
        login: 'POST /api/auth/login',
        profile: 'GET /api/auth/me',
        updateProfile: 'PUT /api/auth/profile',
        changePassword: 'PUT /api/auth/change-password',
        logout: 'POST /api/auth/logout'
      },
      sensors: {
        receiveSensorData: 'POST /api/sensors/data (Device API Key required)',
        getLatestData: 'GET /api/sensors/latest/:deviceId',
        getHistory: 'GET /api/sensors/history/:deviceId',
        getAggregatedData: 'GET /api/sensors/aggregate/:deviceId',
        getDeviceStatus: 'GET /api/sensors/status/:deviceId'
      },
      control: {
        getControlStates: 'GET /api/control/:deviceId',
        toggleRelay: 'POST /api/control/:deviceId/toggle/:relayName',
        setRelayState: 'PUT /api/control/:deviceId/relay/:relayName',
        getHistory: 'GET /api/control/:deviceId/history',
        updateAutomation: 'PUT /api/control/:deviceId/automation',
        setOverride: 'POST /api/control/:deviceId/override',
        removeOverride: 'DELETE /api/control/:deviceId/override',
        getPendingCommands: 'GET /api/control/:deviceId/commands (Device API Key required)',
        acknowledgeCommand: 'POST /api/control/:deviceId/commands/:commandId/ack (Device API Key required)',
        updateDeviceStatus: 'POST /api/control/:deviceId/status (Device API Key required)'
      }
    },
    documentation: 'Visit the GitHub repository for detailed API documentation'
  });
});

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log(`🔌 Client connected: ${socket.id}`);
  
  // Join greenhouse-specific rooms
  socket.on('join_greenhouse', (greenhouseId) => {
    socket.join(`greenhouse_${greenhouseId}`);
    console.log(`📡 Socket ${socket.id} joined greenhouse_${greenhouseId}`);
  });
  
  // Leave greenhouse room
  socket.on('leave_greenhouse', (greenhouseId) => {
    socket.leave(`greenhouse_${greenhouseId}`);
    console.log(`📡 Socket ${socket.id} left greenhouse_${greenhouseId}`);
  });
  
  // Handle failsafe status request
  socket.on('get_failsafe_status', (callback) => {
    if (failsafeService) {
      const status = failsafeService.getOfflineDevicesStatus();
      callback({ success: true, data: status });
    } else {
      callback({ success: false, message: 'Failsafe service not available' });
    }
  });
  
  // Handle manual failsafe test
  socket.on('test_failsafe', async (data, callback) => {
    try {
      if (failsafeService) {
        const result = await failsafeService.manualFailsafeTest(data.deviceId, data.userId);
        callback({ success: true, data: result });
      } else {
        callback({ success: false, message: 'Failsafe service not available' });
      }
    } catch (error) {
      callback({ success: false, message: error.message });
    }
  });
  
  // Handle disconnection
  socket.on('disconnect', () => {
    console.log(`🔌 Client disconnected: ${socket.id}`);
  });
});

// Global error handling middleware
app.use((err, req, res, next) => {
  console.error('🚨 Unhandled error:', err);
  res.status(500).json({
    success: false,
    message: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message
  });
});

// Handle 404 - Route not found
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found',
    availableRoutes: {
      health: 'GET /health',
      api: 'GET /api',
      auth: '/api/auth/*',
      sensors: '/api/sensors/*',
      control: '/api/control/*'
    }
  });
});

// Scheduled tasks
// Clean up old sensor data every day at 2 AM
cron.schedule('0 2 * * *', async () => {
  try {
    console.log('🧹 Running scheduled cleanup of old sensor data...');
    const SensorData = require('./models/SensorData');
    const moment = require('moment');
    
    // Delete sensor data older than 90 days
    const cutoffDate = moment().subtract(90, 'days').toDate();
    const result = await SensorData.deleteMany({
      createdAt: { $lt: cutoffDate }
    });
    
    console.log(`🗑️  Cleaned up ${result.deletedCount} old sensor data records`);
  } catch (error) {
    console.error('❌ Error during scheduled cleanup:', error);
  }
});

// Clean up old control history every week
cron.schedule('0 3 * * 0', async () => {
  try {
    console.log('🧹 Running scheduled cleanup of old control history...');
    const DeviceControl = require('./models/DeviceControl');
    const moment = require('moment');
    
    // Remove control history older than 30 days from all devices
    const cutoffDate = moment().subtract(30, 'days').toDate();
    const devices = await DeviceControl.find({});
    
    let totalRemoved = 0;
    for (const device of devices) {
      const initialCount = device.controlHistory.length;
      device.controlHistory = device.controlHistory.filter(
        history => new Date(history.timestamp) >= cutoffDate
      );
      const removed = initialCount - device.controlHistory.length;
      totalRemoved += removed;
      
      if (removed > 0) {
        await device.save();
      }
    }
    
    console.log(`🗑️  Cleaned up ${totalRemoved} old control history records`);
  } catch (error) {
    console.error('❌ Error during control history cleanup:', error);
  }
});

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(``);
  console.log(`🌱 ================================== 🌱`);
  console.log(`🌱     AgriSmart Greenhouse Server     🌱`);
  console.log(`🌱 ================================== 🌱`);
  console.log(``);
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`🌐 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`📡 Socket.IO enabled for real-time communication`);
  console.log(`🔐 JWT Authentication enabled`);
  console.log(`🛡️  Security middleware active`);
  console.log(`⚡ Rate limiting: ${process.env.MAX_REQUESTS_PER_MINUTE || 100} req/min`);
  console.log(``);
  console.log(`📋 Available endpoints:`);
  console.log(`   • Health Check: http://localhost:${PORT}/health`);
  console.log(`   • API Documentation: http://localhost:${PORT}/api`);
  console.log(`   • Authentication: http://localhost:${PORT}/api/auth/*`);
  console.log(`   • Sensor Data: http://localhost:${PORT}/api/sensors/*`);
  console.log(`   • Device Control: http://localhost:${PORT}/api/control/*`);
  console.log(``);
  console.log(`🔑 ESP32/Arduino API Key: ${process.env.ESP32_API_KEY}`);
  console.log(`📊 MongoDB: ${process.env.MONGODB_URI?.replace(/\/\/.*@/, '//***:***@')}`);
  console.log(``);
  
  // Initialize failsafe service after server starts
  try {
    failsafeService = new FailsafeService(io);
    console.log(`🛡️  Failsafe monitoring system initialized`);
  } catch (error) {
    console.error(`❌ Failed to initialize failsafe service:`, error);
  }
  
  console.log(`Ready to accept connections! 🎉`);
  console.log(``);
});
