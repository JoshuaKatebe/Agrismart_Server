const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const PORT = 443;

// Middleware
app.use(helmet());
app.use(cors());
app.use(morgan('combined'));
app.use(express.json({ limit: '1mb' }));
app.use(express.static('public'));

// In-memory storage
let sensorData = [];
let latestData = null;
let deviceStatus = {};
let controlHistory = [];

// Routes

// Root route - API documentation
app.get('/', (req, res) => {
  res.json({
    name: 'Smart Greenhouse API',
    version: '1.0.0',
    endpoints: {
      'GET /api/status': 'Get API status',
      'GET /api/data/latest': 'Get latest sensor data',
      'GET /api/data/history': 'Get historical sensor data',
      'POST /api/sensor-data': 'Receive sensor data from ESP32',
      'POST /api/control': 'Send control commands',
      'GET /api/devices': 'List connected devices',
      'GET /api/control/history': 'Get control command history'
    }
  });
});

// API Status
app.get('/api/status', (req, res) => {
  res.json({
    status: 'online',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    connectedDevices: Object.keys(deviceStatus).length,
    latestDataAge: latestData ? (Date.now() - new Date(latestData.receivedAt).getTime()) / 1000 : null
  });
});

// Receive sensor data from ESP32
app.post('/api/sensor-data', async (req, res) => {
  try {
    const data = {
      ...req.body,
      receivedAt: new Date().toISOString(),
      ip: req.ip
    };
    
    // Store data
    sensorData.push(data);
    latestData = data;
    
    // Update device status
    if (data.deviceId) {
      deviceStatus[data.deviceId] = {
        lastSeen: new Date().toISOString(),
        ip: req.ip,
        status: 'online'
      };
    }
    
    // Keep only last 1000 entries in memory
    if (sensorData.length > 1000) {
      sensorData = sensorData.slice(-1000);
    }
    
    console.log(`Sensor data received from ${data.deviceId || 'unknown device'}`);
    
    // Emit to WebSocket clients
    io.emit('sensorData', data);
    
    res.json({
      status: 'success',
      message: 'Sensor data received',
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Error processing sensor data:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to process sensor data'
    });
  }
});

// Get latest sensor data
app.get('/api/data/latest', (req, res) => {
  if (!latestData) {
    return res.status(404).json({
      error: 'No data available',
      message: 'No sensor data has been received yet'
    });
  }
  
  res.json({
    status: 'success',
    data: latestData,
    age: (Date.now() - new Date(latestData.receivedAt).getTime()) / 1000
  });
});

// Get historical sensor data
app.get('/api/data/history', (req, res) => {
  const { limit = 100, from, to, deviceId } = req.query;
  
  let filteredData = [...sensorData];
  
  // Filter by device ID
  if (deviceId) {
    filteredData = filteredData.filter(d => d.deviceId === deviceId);
  }
  
  // Filter by date range
  if (from) {
    const fromDate = new Date(from);
    filteredData = filteredData.filter(d => new Date(d.receivedAt) >= fromDate);
  }
  
  if (to) {
    const toDate = new Date(to);
    filteredData = filteredData.filter(d => new Date(d.receivedAt) <= toDate);
  }
  
  // Limit results
  const limitNum = Math.min(parseInt(limit), 1000);
  filteredData = filteredData.slice(-limitNum);
  
  res.json({
    status: 'success',
    count: filteredData.length,
    data: filteredData
  });
});

// Send control commands
app.post('/api/control', async (req, res) => {
  try {
    const { command, deviceId, description } = req.body;
    
    if (!command) {
      return res.status(400).json({
        error: 'Bad request',
        message: 'Command is required'
      });
    }
    
    // Valid commands
    const validCommands = [
      'WATER:AUTO', 'WATER:MANUAL:ON', 'WATER:MANUAL:OFF',
      'FAN:AUTO', 'FAN:MANUAL:ON', 'FAN:MANUAL:OFF',
      'FERTILIZER:ON', 'FERTILIZER:OFF'
    ];
    
    if (!validCommands.includes(command)) {
      return res.status(400).json({
        error: 'Invalid command',
        message: 'Command not recognized',
        validCommands
      });
    }
    
    // Store control command
    const controlCommand = {
      command,
      deviceId,
      description,
      timestamp: new Date().toISOString(),
      ip: req.ip,
      status: 'sent'
    };
    
    controlHistory.push(controlCommand);
    
    // Keep only last 500 control commands
    if (controlHistory.length > 500) {
      controlHistory = controlHistory.slice(-500);
    }
    
    console.log(`Control command sent: ${command} to ${deviceId || 'all devices'}`);
    
    // Emit control command to WebSocket clients (ESP32 can listen to this)
    io.emit('controlCommand', controlCommand);
    
    res.json({
      status: 'success',
      message: 'Control command queued',
      command: controlCommand
    });
    
  } catch (error) {
    console.error('Error processing control command:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to process control command'
    });
  }
});

// Get connected devices
app.get('/api/devices', (req, res) => {
  const devices = Object.entries(deviceStatus).map(([deviceId, status]) => ({
    deviceId,
    ...status,
    online: (Date.now() - new Date(status.lastSeen).getTime()) < 120000 // 2 minutes
  }));
  
  res.json({
    status: 'success',
    count: devices.length,
    devices
  });
});

// Get control command history
app.get('/api/control/history', (req, res) => {
  const { limit = 50, deviceId } = req.query;
  
  let filteredHistory = [...controlHistory];
  
  if (deviceId) {
    filteredHistory = filteredHistory.filter(cmd => cmd.deviceId === deviceId);
  }
  
  const limitNum = Math.min(parseInt(limit), 500);
  filteredHistory = filteredHistory.slice(-limitNum).reverse();
  
  res.json({
    status: 'success',
    count: filteredHistory.length,
    data: filteredHistory
  });
});

// WebSocket setup
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

io.on('connection', (socket) => {
  console.log('WebSocket client connected');
  
  // Send latest data on connection
  if (latestData) {
    socket.emit('sensorData', latestData);
  }
  
  socket.on('disconnect', () => {
    console.log('WebSocket client disconnected');
  });
  
  // Handle control commands from clients
  socket.on('sendCommand', (command) => {
    console.log('Command received via WebSocket:', command);
    io.emit('controlCommand', command);
  });
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Not found',
    message: 'The requested endpoint does not exist'
  });
});

// Error handler
app.use((error, req, res, next) => {
  console.error('Server error:', error);
  res.status(500).json({
    error: 'Internal server error',
    message: 'An unexpected error occurred'
  });
});

// Cleanup old device status (mark offline after 5 minutes)
setInterval(() => {
  const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
  Object.keys(deviceStatus).forEach(deviceId => {
    if (new Date(deviceStatus[deviceId].lastSeen).getTime() < fiveMinutesAgo) {
      deviceStatus[deviceId].status = 'offline';
    }
  });
}, 60000); // Check every minute

// Start server
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Smart Greenhouse Server running on port ${PORT}`);
  console.log(`API Documentation: http://localhost:${PORT}`);
  console.log(`Health Check: http://localhost:${PORT}/health`);
});

module.exports = app;