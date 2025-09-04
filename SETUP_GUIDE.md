# 🌱 AgriSmart Greenhouse Server Setup Guide

This guide will help you set up the enhanced greenhouse control system with MongoDB Atlas, failsafe monitoring, and ESP32 integration.

## 📋 Table of Contents
1. [MongoDB Atlas Setup](#mongodb-atlas-setup)
2. [Environment Configuration](#environment-configuration)
3. [Server Installation](#server-installation)
4. [ESP32 Integration](#esp32-integration)
5. [Device API Authentication](#device-api-authentication)
6. [Testing the System](#testing-the-system)
7. [Failsafe System Overview](#failsafe-system-overview)

## 🗄️ MongoDB Atlas Setup

### Step 1: Create MongoDB Atlas Account
1. Go to [MongoDB Atlas](https://www.mongodb.com/cloud/atlas)
2. Sign up for a free account
3. Create a new project called "AgriSmart Greenhouse"

### Step 2: Create a Cluster
1. Click "Build a Database"
2. Choose **M0 FREE** tier
3. Select your preferred cloud provider and region
4. Name your cluster (e.g., "AgriSmartCluster")
5. Click "Create Cluster"

### Step 3: Configure Database Access
1. Go to **Database Access** in the left sidebar
2. Click "Add New Database User"
3. Choose **Password** authentication
4. Create username: `agrismart_user`
5. Generate a secure password (save this!)
6. Set role to **Atlas Admin** (for development) or **Read and write to any database**
7. Click "Add User"

### Step 4: Configure Network Access
1. Go to **Network Access** in the left sidebar
2. Click "Add IP Address"
3. For development: Click "Allow Access from Anywhere" (0.0.0.0/0)
4. For production: Add your specific IP addresses
5. Click "Confirm"

### Step 5: Get Connection String
1. Go to **Clusters** and click "Connect" on your cluster
2. Choose "Connect your application"
3. Select **Node.js** and version **4.1 or later**
4. Copy the connection string
5. It should look like: `mongodb+srv://agrismart_user:<password>@agrismartcluster.xxxxx.mongodb.net/?retryWrites=true&w=majority`

### Step 6: Database Structure
The system will automatically create these collections:
- `users` - User accounts and preferences
- `greenhouses` - Greenhouse configurations
- `sensordata` - All sensor readings and actuator states
- `devicecontrols` - Device control states and commands
- `sessions` - User session management

## ⚙️ Environment Configuration

### Step 1: Create Environment File
```bash
cp .env.example .env
```

### Step 2: Update `.env` file
```env
# Server Configuration
NODE_ENV=development
PORT=3000

# MongoDB Atlas Configuration
MONGODB_URI=mongodb+srv://agrismart_user:YOUR_PASSWORD@agrismartcluster.xxxxx.mongodb.net/agrismart_greenhouse?retryWrites=true&w=majority

# JWT Configuration
JWT_SECRET=your-super-secret-jwt-key-at-least-32-characters-long
JWT_EXPIRE=7d

# ESP32/Arduino Device API Key
ESP32_API_KEY=greenhouse_device_api_key_2024

# Security Configuration
MAX_REQUESTS_PER_MINUTE=100
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:3001,http://192.168.1.100:8080

# Failsafe System Configuration
FAILSAFE_OFFLINE_THRESHOLD=10
FAILSAFE_CHECK_INTERVAL=5
EMERGENCY_FAILSAFE_TIMEOUT=60
```

**Important Notes:**
- Replace `YOUR_PASSWORD` with your actual MongoDB user password
- Replace the cluster URL with your actual cluster URL
- Generate a secure JWT secret (at least 32 characters)
- Choose a strong ESP32 API key

## 🚀 Server Installation

### Step 1: Install Dependencies
```bash
npm install
```

### Step 2: Start the Server
```bash
# Development mode with auto-restart
npm run dev

# Production mode
npm start
```

### Step 3: Verify Installation
1. Check server logs for successful startup
2. Visit: `http://localhost:3000/health`
3. Visit: `http://localhost:3000/api` for API documentation

Expected startup logs:
```
🌱 ================================== 🌱
🌱     AgriSmart Greenhouse Server     🌱
🌱 ================================== 🌱

🚀 Server running on port 3000
📡 Socket.IO enabled for real-time communication
🔐 JWT Authentication enabled
🛡️  Security middleware active
⚡ Rate limiting: 100 req/min
🛡️  Failsafe monitoring system initialized

Ready to accept connections! 🎉
```

## 🔧 ESP32 Integration

### Step 1: Update ESP32 Code
Replace the server URL and API key in your ESP32 code:

```cpp
// In esp32_enhanced.cpp
const char* SERVER_URL = "http://your-server-ip:3000/api/sensors/data";
const char* API_KEY = "greenhouse_device_api_key_2024"; // Same as in .env file
```

### Step 2: ESP32 Data Format
Your ESP32 should send data in this JSON format:
```json
{
  "deviceId": "ESP32_001",
  "userId": "user_object_id_here",
  "greenhouseId": "greenhouse_object_id_here",
  "timestamp": 1234567890,
  "sensors": {
    "outsideTemp": 25.0,
    "greenhouseTemp": 28.0,
    "outsideHumidity": 60.0,
    "greenhouseHumidity": 70.0,
    "soilMoisture": 45,
    "lightLevel": 80,
    "waterTank": 75,
    "phLevel": 6.8
  },
  "actuators": {
    "waterPump": {
      "status": "ON",
      "mode": "AUTO"
    },
    "ventilationFan": {
      "status": "OFF",
      "mode": "AUTO"
    },
    "fertilizerPump": {
      "status": "OFF"
    }
  },
  "rfid": "NoCard"
}
```

### Step 3: ESP32 Command Polling
Your ESP32 should poll for commands every 30 seconds:

```cpp
// GET /api/control/ESP32_001/commands
// Headers: Authorization: Bearer greenhouse_device_api_key_2024
```

## 🔑 Device API Authentication

### How Device API Works

The **Device API** is a special authentication system for your ESP32/Arduino devices to securely communicate with the server without user login credentials.

#### 1. **API Key Authentication**
- Devices use a special API key instead of user JWT tokens
- Set in environment variable: `ESP32_API_KEY`
- Must be included in device requests as: `Authorization: Bearer YOUR_API_KEY`

#### 2. **Device-Only Endpoints**
These endpoints require Device API authentication:

**POST** `/api/sensors/data` - Upload sensor data and actuator states
```bash
curl -X POST http://localhost:3000/api/sensors/data \
  -H "Authorization: Bearer greenhouse_device_api_key_2024" \
  -H "Content-Type: application/json" \
  -d '{
    "deviceId": "ESP32_001",
    "userId": "user_id_here",
    "greenhouseId": "greenhouse_id_here",
    "sensors": {...},
    "actuators": {...}
  }'
```

**GET** `/api/control/:deviceId/commands` - Get pending commands
```bash
curl -X GET http://localhost:3000/api/control/ESP32_001/commands \
  -H "Authorization: Bearer greenhouse_device_api_key_2024"
```

**POST** `/api/control/:deviceId/commands/:commandId/ack` - Acknowledge command
```bash
curl -X POST http://localhost:3000/api/control/ESP32_001/commands/cmd_123/ack \
  -H "Authorization: Bearer greenhouse_device_api_key_2024" \
  -d '{"success": true}'
```

#### 3. **Security Features**
- API key is validated server-side before processing
- Rate limiting applies to device requests
- Invalid keys are logged and rejected
- Commands are queued and tracked with acknowledgments

## 🧪 Testing the System

### Step 1: Test Health Check
```bash
curl http://localhost:3000/health
```

### Step 2: Test Device Data Submission
```bash
curl -X POST http://localhost:3000/api/sensors/data \
  -H "Authorization: Bearer greenhouse_device_api_key_2024" \
  -H "Content-Type: application/json" \
  -d '{
    "deviceId": "ESP32_001",
    "userId": "675123456789abcdef123456",
    "greenhouseId": "675123456789abcdef123457",
    "sensors": {
      "outsideTemp": 22.5,
      "greenhouseTemp": 26.3,
      "outsideHumidity": 55,
      "greenhouseHumidity": 68,
      "soilMoisture": 42,
      "lightLevel": 75,
      "waterTank": 80,
      "phLevel": 6.9
    },
    "actuators": {
      "waterPump": {"status": "OFF", "mode": "AUTO"},
      "ventilationFan": {"status": "OFF", "mode": "AUTO"},
      "fertilizerPump": {"status": "OFF"}
    },
    "rfid": "NoCard"
  }'
```

### Step 3: Test WebSocket Connection
Use a WebSocket client or browser console:
```javascript
const socket = io('http://localhost:3000');
socket.emit('join_greenhouse', 'greenhouse_id_here');
socket.on('sensor_data', (data) => {
  console.log('Real-time sensor data:', data);
});
```

## 🛡️ Failsafe System Overview

### What is the Failsafe System?

The failsafe system is an **automatic safety net** that monitors your ESP32 devices and takes emergency actions when devices go offline or critical conditions are detected.

### Key Features:

#### 1. **Offline Detection**
- Monitors device heartbeats every 5 minutes
- Considers device offline after 10 minutes of no communication
- Sends real-time alerts via WebSocket

#### 2. **Escalation Levels**
- **10 minutes**: Warning notification sent
- **30 minutes**: High priority alert
- **60 minutes**: Critical alert + Emergency failsafe activation

#### 3. **Emergency Actions**
When failsafe activates:
- ✅ **Water pump**: Activated in MANUAL mode (safe watering)
- ✅ **Ventilation fan**: Activated in MANUAL mode (prevent overheating)
- ❌ **Fertilizer pump**: Deactivated (safety precaution)

#### 4. **Auto-Recovery**
When device comes back online:
- Reset pumps back to AUTO mode
- Send recovery commands to ESP32
- Log all actions for audit trail

#### 5. **Manual Override**
- Trigger failsafe manually via API: `POST /api/control/:deviceId/failsafe`
- Test failsafe system: WebSocket event `test_failsafe`
- Monitor status: WebSocket event `get_failsafe_status`

### Failsafe Configuration
```env
FAILSAFE_OFFLINE_THRESHOLD=10    # Minutes before considering offline
FAILSAFE_CHECK_INTERVAL=5        # Check every N minutes
EMERGENCY_FAILSAFE_TIMEOUT=60    # Minutes before emergency activation
```

### Real-time Notifications
The system sends these WebSocket events:
- `device_offline` - Device just went offline
- `device_offline_escalation` - Extended offline period
- `emergency_failsafe` - Emergency procedures activated
- `device_online` - Device reconnected
- `critical_alert` - Critical conditions detected

## 🎯 New API Endpoints Summary

### Enhanced Control Endpoints
- **PUT** `/api/control/:deviceId/relay/:relayName/mode` - Set AUTO/MANUAL mode
- **GET** `/api/control/:deviceId/status` - Get device status with failsafe info
- **POST** `/api/control/:deviceId/failsafe` - Trigger emergency failsafe

### Command Format for ESP32
Commands sent to ESP32 are in this format:
- `WATER:AUTO` - Set water pump to automatic mode
- `WATER:MANUAL:ON` - Set water pump to manual ON
- `WATER:MANUAL:OFF` - Set water pump to manual OFF
- `FAN:AUTO` - Set fan to automatic mode
- `FAN:MANUAL:ON` - Set fan to manual ON
- `FAN:MANUAL:OFF` - Set fan to manual OFF
- `FERTILIZER:ON` - Turn fertilizer pump ON
- `FERTILIZER:OFF` - Turn fertilizer pump OFF

## 🎉 You're Ready!

Your AgriSmart Greenhouse Server is now fully configured with:
- ✅ MongoDB Atlas cloud database
- ✅ Enhanced ESP32 integration with actuator feedback
- ✅ Automatic failsafe monitoring system
- ✅ Real-time WebSocket notifications
- ✅ Manual/Automatic mode controls
- ✅ Device API authentication
- ✅ Emergency backup procedures

The server will automatically handle device offline situations and keep your plants safe! 🌱

## 📞 Support
If you encounter any issues:
1. Check the server logs for error messages
2. Verify MongoDB Atlas connection and network access
3. Ensure ESP32 API key matches the server configuration
4. Test network connectivity between ESP32 and server
