const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const morgan = require('morgan');
const fs = require('fs').promises;
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const API_KEY = process.env.API_KEY || 'your-greenhouse-api-key-2024';

// Middleware
app.use(helmet());
app.use(cors());
app.use(morgan('combined'));
app.use(express.json({ limit: '1mb' }));
app.use(express.static('public'));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.'
});
app.use('/api', limiter);

// In-memory storage (replace with database in production)
let sensorData = [];
let latestData = null;
let deviceStatus = {};
let controlHistory = [];

// API Key middleware
const authenticateAPI = (req, res, next) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token || token !== API_KEY) {
    return res.status(401).json({ error: 'Unauthorized - Invalid API key' });
  }
  next();
};

// Helper function to log data to file (optional persistence)
const logToFile = async (data, type = 'sensor') => {
  try {
    const logDir = path.join(__dirname, 'logs');
    await fs.mkdir(logDir, { recursive: true });
    
    const filename = `${type}-${new Date().toISOString().split('T')[0]}.json`;
    const filepath = path.join(logDir, filename);
    
    let existingData = [];
    try {
      const fileContent = await fs.readFile(filepath, 'utf8');
      existingData = JSON.parse(fileContent);
    } catch (error) {
      // File doesn't exist or is empty, start fresh
    }
    
    existingData.push({
      timestamp: new Date().toISOString(),
      data: data
    });
    
    // Keep only last 1000 entries per file
    if (existingData.length > 1000) {
      existingData = existingData.slice(-1000);
    }
    
    await fs.writeFile(filepath, JSON.stringify(existingData, null, 2));
  } catch (error) {
    console.error('Error logging to file:', error);
  }
};

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
    },
    authentication: 'Bearer token required for all API endpoints',
    documentation: 'https://your-docs-url.com'
  });
});

// API Status
app.get('/api/status', authenticateAPI, (req, res) => {
  res.json({
    status: 'online',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    connectedDevices: Object.keys(deviceStatus).length,
    latestDataAge: latestData ? (Date.now() - new Date(latestData.receivedAt).getTime()) / 1000 : null
  });
});

// Receive sensor data from ESP32
app.post('/api/sensor-data', authenticateAPI, async (req, res) => {
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
    
    // Log to file for persistence
    await logToFile(data, 'sensor');
    
    console.log(`Sensor data received from ${data.deviceId || 'unknown device'}`);
    
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
app.get('/api/data/latest', authenticateAPI, (req, res) => {
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
app.get('/api/data/history', authenticateAPI, (req, res) => {
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
app.post('/api/control', authenticateAPI, async (req, res) => {
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
    
    // Log to file
    await logToFile(controlCommand, 'control');
    
    console.log(`Control command sent: ${command} to ${deviceId || 'all devices'}`);
    
    res.json({
      status: 'success',
      message: 'Control command queued',
      command: controlCommand
    });
    
    // Note: In a real implementation, you'd forward this command to the ESP32
    // This could be done via WebSocket, MQTT, or by storing it for the ESP32 to poll
    
  } catch (error) {
    console.error('Error processing control command:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to process control command'
    });
  }
});

// Get connected devices
app.get('/api/devices', authenticateAPI, (req, res) => {
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
app.get('/api/control/history', authenticateAPI, (req, res) => {
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

// WebSocket endpoint for real-time updates (optional)
const http = require('http');
const socketIo = require('socket.io');

const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// WebSocket authentication
io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  if (token === API_KEY) {
    next();
  } else {
    next(new Error('Authentication error'));
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
});

// Emit real-time data to WebSocket clients
const originalPush = sensorData.push;
sensorData.push = function(...args) {
  const result = originalPush.apply(this, args);
  if (args[0]) {
    io.emit('sensorData', args[0]);
  }
  return result;
};

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
server.listen(PORT, () => {
  console.log(`Smart Greenhouse Server running on port ${PORT}`);
  console.log(`API Documentation: http://localhost:${PORT}`);
  console.log(`Health Check: http://localhost:${PORT}/health`);
  console.log(`API Key: ${API_KEY}`);
});

module.exports = app;
