# 🌱 AgriSmart Greenhouse Server

A comprehensive IoT backend server for smart greenhouse management with ESP32/Arduino integration, real-time monitoring, and mobile app support.

## 🚀 Features

- **🔐 User Authentication**: JWT-based authentication with secure password hashing
- **📊 Sensor Data Management**: Real-time collection and storage of environmental data
- **🎛️ Device Control**: Remote control of pumps, lights, and ventilation systems
- **🤖 Smart Automation**: Automated irrigation, lighting, and climate control
- **📈 Data Analytics**: Historical datanpm install mongodb
- **⚡ Real-time Communication**: Socket.IO for live updates to mobile apps
- **🛡️ Security**: Rate limiting, CORS, helmet.js protection
- **📱 Mobile App Ready**: RESTful API designed for mobile applications
- **🌐 ESP32/Arduino Integration**: Dedicated endpoints for IoT devices

## 📡 Supported Sensors

- **Temperature & Humidity**: 2x DHT11 sensors (Temp1/Hum1, Temp2/Hum2)
- **Soil Moisture**: Capacitive soil moisture sensor (percentage)
- **Light Intensity**: LDR sensor (percentage)
- **pH Levels**: pH probe for nutrient solution
- **Water Tank Level**: Ultrasonic sensor (percentage)

## 🎛️ Controllable Devices

- **Water Pumps**: 2x relay-controlled pumps
- **Grow Lights**: 2x LED grow lights with scheduling
- **Ventilation**: Exhaust and intake fans
- **Nutrient System**: Nutrient pump
- **Climate Control**: Heater/cooler system

## 🛠️ Installation

### Prerequisites

- Node.js (v16 or higher)
- MongoDB (local or MongoDB Atlas)
- ESP32/Arduino devices with sensors

### Setup Steps

1. **Clone the repository**
   ```bash
   git clone <your-repo-url>
   cd Agrismart_Server
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Environment Configuration**
   ```bash
   # Copy the example environment file
   cp .env.example .env
   
   # Edit .env with your configuration
   nano .env
   ```

4. **Configure Environment Variables**
   ```env
   # Server Configuration
   PORT=3000
   NODE_ENV=development

   # Database Configuration
   MONGODB_URI=mongodb://localhost:27017/agrismart_greenhouse

   # JWT Configuration
   JWT_SECRET=your_super_secret_jwt_key_here_make_it_long_and_random
   JWT_EXPIRE=7d

   # CORS Configuration
   ALLOWED_ORIGINS=http://localhost:3000,http://localhost:8080,http://192.168.1.100:8080

   # Rate Limiting
   MAX_REQUESTS_PER_MINUTE=100

   # ESP32/Arduino Configuration
   ESP32_API_KEY=your_esp32_api_key_here
   ```

5. **Start the server**
   ```bash
   # Development mode (with nodemon)
   npm run dev
   
   # Production mode
   npm start
   ```

## 📚 API Documentation

### Authentication Endpoints

| Method | Endpoint | Description | Access |
|--------|----------|-------------|--------|
| POST | `/api/auth/register` | Register new user | Public |
| POST | `/api/auth/login` | Login user | Public |
| GET | `/api/auth/me` | Get user profile | Private |
| PUT | `/api/auth/profile` | Update profile | Private |
| PUT | `/api/auth/change-password` | Change password | Private |
| POST | `/api/auth/logout` | Logout user | Private |

### Sensor Data Endpoints

| Method | Endpoint | Description | Access |
|--------|----------|-------------|--------|
| POST | `/api/sensors/data` | Receive sensor data from ESP32 | Device API Key |
| GET | `/api/sensors/latest/:deviceId` | Get latest sensor readings | Private |
| GET | `/api/sensors/history/:deviceId` | Get historical sensor data | Private |
| GET | `/api/sensors/aggregate/:deviceId` | Get aggregated data for charts | Private |
| GET | `/api/sensors/status/:deviceId` | Get device online status | Private |

### Device Control Endpoints

| Method | Endpoint | Description | Access |
|--------|----------|-------------|--------|
| GET | `/api/control/:deviceId` | Get device control states | Private |
| POST | `/api/control/:deviceId/toggle/:relayName` | Toggle relay on/off | Private |
| PUT | `/api/control/:deviceId/relay/:relayName` | Set relay state | Private |
| GET | `/api/control/:deviceId/history` | Get control action history | Private |
| PUT | `/api/control/:deviceId/automation` | Update automation rules | Private |
| POST | `/api/control/:deviceId/override` | Set manual override | Private |
| DELETE | `/api/control/:deviceId/override` | Remove manual override | Private |
| GET | `/api/control/:deviceId/commands` | Get pending commands (ESP32) | Device API Key |
| POST | `/api/control/:deviceId/commands/:commandId/ack` | Acknowledge command | Device API Key |
| POST | `/api/control/:deviceId/status` | Update device status | Device API Key |

## 🔌 ESP32/Arduino Integration

### Sensor Data Format

Send sensor data to `POST /api/sensors/data`:

```json
{
  "deviceId": "greenhouse_001",
  "userId": "user_object_id",
  "greenhouseId": "greenhouse_object_id",
  "temp1": 24.5,
  "temp2": 25.1,
  "hum1": 65.2,
  "hum2": 68.7,
  "soilMoisture": 45.3,
  "lightIntensity": 78.9,
  "ph": 6.8,
  "waterTankLevel": 85.2,
  "deviceStatus": {
    "batteryLevel": 87,
    "wifiSignal": -45,
    "uptime": 86400,
    "freeMemory": 4096
  }
}
```

### Command Polling

ESP32 should regularly poll for commands:

```bash
GET /api/control/greenhouse_001/commands
Headers: x-api-key: your_esp32_api_key_here
```

Response:
```json
{
  "success": true,
  "data": {
    "commands": [
      {
        "_id": "command_id",
        "command": "set_relay",
        "parameters": {
          "relay": "waterPump1",
          "state": true,
          "pin": 2
        },
        "priority": "high"
      }
    ]
  }
}
```

### Command Acknowledgment

After executing a command, acknowledge it:

```bash
POST /api/control/greenhouse_001/commands/command_id/ack
Headers: x-api-key: your_esp32_api_key_here
Content-Type: application/json

{
  "success": true,
  "error": null
}
```

## 🤖 Automation Features

### Automatic Irrigation
- Triggers when soil moisture drops below threshold
- Configurable pump duration and cooldown period
- Prevents over-watering with intelligent timing

### Smart Lighting
- Automatically turns on lights when natural light is low
- Schedule-based operation with daily timers
- Separate control for multiple light zones

### Climate Control
- Temperature-based fan control
- Humidity management with ventilation
- Automated heating/cooling responses

### pH Management
- Alerts when pH levels are outside optimal range
- Automated nutrient pump activation
- Historical pH tracking and trends

## 📊 Data Visualization

The API provides aggregated data endpoints perfect for charts and analytics:

### Aggregated Data Query
```bash
GET /api/sensors/aggregate/greenhouse_001?groupBy=hour&metrics=temperature,humidity,soilMoisture&startDate=2024-01-01&endDate=2024-01-07
```

### Response Format
```json
{
  "success": true,
  "data": [
    {
      "_id": "2024-01-01 12:00:00",
      "avgTemp": 24.5,
      "minTemp": 22.1,
      "maxTemp": 26.8,
      "avgHumidity": 65.2,
      "avgSoilMoisture": 45.3,
      "count": 12,
      "alertCount": 0
    }
  ]
}
```

## 🔄 Real-time Communication

The server uses Socket.IO for real-time updates:

### Client Connection
```javascript
import { io } from 'socket.io-client';

const socket = io('http://localhost:3000');

// Join greenhouse room for updates
socket.emit('join_greenhouse', 'greenhouse_id');

// Listen for sensor data updates
socket.on('sensor_data', (data) => {
  console.log('New sensor data:', data);
});

// Listen for control state changes
socket.on('control_update', (data) => {
  console.log('Control state changed:', data);
});
```

## 🛡️ Security Features

- **JWT Authentication**: Secure token-based authentication
- **API Key Protection**: Separate authentication for IoT devices
- **Rate Limiting**: Prevents API abuse (100 requests/minute default)
- **CORS Protection**: Configurable allowed origins
- **Helmet.js**: Security headers for web protection
- **Input Validation**: All inputs are validated and sanitized

## 📋 Database Models

### User Model

- Authentication and profile information
- Alert threshold preferences
- Greenhouse access permissions

### SensorData Model

- Time-series environmental data
- Automated alert detection
- Device status tracking

### DeviceControl Model

- Relay states and control history
- Automation rules and schedules
- Command queue for ESP32 communication

### Greenhouse Model
- Facility information and settings
- Device management
- User access control

## 🔧 Configuration

### MongoDB Setup
1. Install MongoDB locally or use MongoDB Atlas
2. Create database: `agrismart_greenhouse`
3. Update connection string in `.env`

### ESP32 Configuration
1. Use the provided API key for device authentication
2. Configure device polling interval (recommended: 30-60 seconds)
3. Implement proper error handling for network connectivity

## 🚀 Deployment

### Production Deployment
1. Set `NODE_ENV=production` in environment
2. Use a process manager like PM2
3. Configure MongoDB replica set for high availability
4. Set up reverse proxy (Nginx) for SSL termination
5. Configure environment-specific CORS origins

### Docker Deployment
```dockerfile
# Dockerfile example
FROM node:16-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 3000
CMD ["npm", "start"]
```

## 🔍 Monitoring & Maintenance

### Health Checks
- `GET /health` - Server health status
- Automated cleanup of old data (configurable retention)
- Database connection monitoring

### Logging
- Console logging for development
- Structured logging for production
- Error tracking and alerting

### Data Cleanup
- Automatic deletion of sensor data older than 90 days
- Control history cleanup (30 days retention)
- Configurable retention policies

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## 📝 License

This project is licensed under the ISC License.

## 🆘 Support

For support and questions:
- Check the API documentation at `/api` endpoint
- Review the health check at `/health` endpoint
- Check server logs for troubleshooting

## 🔄 Changelog

### Version 1.0.0
- Initial release with full IoT integration
- User authentication and authorization
- Real-time sensor data collection
- Device control and automation
- Mobile app API support
- Data visualization endpoints

---

**Built with ❤️ for smart agriculture and IoT enthusiasts**
