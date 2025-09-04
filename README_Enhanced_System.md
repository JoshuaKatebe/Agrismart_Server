# Enhanced Greenhouse Control System

This enhanced system provides comprehensive control over greenhouse automation with manual and automatic modes for various actuators.

## System Overview

### Arduino (Sensor & Actuator Controller)
- **DHT Sensors**: Moved to pins A4 (outside) and A5 (greenhouse)
- **Relays**: 
  - Pin 4: Water pump (Auto/Manual modes)
  - Pin 7: Fertilizer pump (Manual only)
  - Pin 8: Ventilation fan (Auto/Manual modes)

### ESP32 (WiFi Gateway & Web Interface)
- Provides web interface for control
- Forwards data to external server
- Handles commands from web interface and API

## Control Modes

### Water Pump
- **Automatic Mode**: Activates when soil moisture < 50% AND water tank > 20%
- **Manual Mode**: Controlled via web interface or API commands

### Ventilation Fan  
- **Automatic Mode**: Activates when greenhouse temperature > 30°C
- **Manual Mode**: Controlled via web interface or API commands

### Fertilizer Pump
- **Manual Only**: Fully controlled via web interface or API commands

## Communication Protocol

### Arduino ← ESP32 Commands
Format: `DEVICE:MODE:STATE`

Examples:
- `WATER:AUTO` - Set water pump to automatic mode
- `WATER:MANUAL:ON` - Set water pump to manual mode and turn on
- `WATER:MANUAL:OFF` - Set water pump to manual mode and turn off
- `FAN:AUTO` - Set fan to automatic mode
- `FAN:MANUAL:ON` - Set fan to manual mode and turn on
- `FAN:MANUAL:OFF` - Set fan to manual mode and turn off
- `FERTILIZER:ON` - Turn fertilizer pump on
- `FERTILIZER:OFF` - Turn fertilizer pump off

### Arduino → ESP32 Data Packet
Format: `T1:25.0,H1:60.0,T2:28.0,H2:70.0,Soil:45,Light:80,Tank:75,pH:6.8,WaterPump:ON,WaterMode:AUTO,Fan:OFF,FanMode:AUTO,Fertilizer:OFF,RFID:NoCard`

## ESP32 Web Interface

### URLs
- `/` - Main dashboard with controls and sensor readings
- `/command?cmd=COMMAND` - Send command to Arduino
- `/data` - Get raw sensor data
- `/api/data` - Get structured JSON data
- `/api/control` - POST endpoint for external control

### Web Interface Features
- Real-time sensor data display
- Individual control buttons for each actuator
- Mode switching (Auto/Manual) for water pump and fan
- Status indicators with color coding
- Auto-refresh every 30 seconds

## API Endpoints

### GET /api/data
Returns structured JSON data:
```json
{
  "deviceId": "AA:BB:CC:DD:EE:FF",
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

### POST /api/control
Send control commands via JSON:
```json
{
  "command": "WATER:MANUAL:ON"
}
```

Response:
```json
{
  "status": "success",
  "command": "WATER:MANUAL:ON"
}
```

## Server Integration

The ESP32 automatically forwards sensor data to your server every 30 seconds. Update these variables in the ESP32 code:
- `SERVER_URL`: Your server endpoint URL
- `API_KEY`: Your authentication key

The data is sent as JSON with the same structure as the `/api/data` endpoint.

## Pin Assignments

### Arduino Uno
| Pin | Function | Notes |
|-----|----------|-------|
| A0 | pH Level | pH sensor analog input |
| A1 | pH Temperature | pH sensor temperature compensation |
| A2 | Soil Moisture | Analog soil moisture sensor |
| A3 | LDR | Light sensor |
| A4 | DHT1 (Outside) | Outside temperature/humidity |
| A5 | DHT2 (Greenhouse) | Greenhouse temperature/humidity |
| D2 | ESP32 RX | SoftwareSerial to ESP32 |
| D3 | ESP32 TX | SoftwareSerial to ESP32 |
| D4 | Water Pump Relay | Auto/Manual control |
| D5 | Ultrasonic Echo | Tank level sensor |
| D6 | Ultrasonic Trig | Tank level sensor |
| D7 | Fertilizer Pump Relay | Manual control only |
| D8 | Ventilation Fan Relay | Auto/Manual control |
| D9 | RFID RST | RFID module reset |
| D10 | RFID SS | RFID module slave select |
| D11 | SPI MOSI | RFID communication |
| D12 | SPI MISO | RFID communication |
| D13 | SPI SCK | RFID communication |

### ESP32
| Pin | Function | Notes |
|-----|----------|-------|
| GPIO2 | Status LED | Built-in LED for activity indication |
| GPIO16 | Arduino TX | UART communication with Arduino |
| GPIO17 | Arduino RX | UART communication with Arduino |

## Setup Instructions

1. **Arduino Setup**:
   - Upload `arduino_enhanced.ino` to your Arduino Uno
   - Connect sensors and relays according to pin assignments
   - Ensure all required libraries are installed

2. **ESP32 Setup**:
   - Upload `esp32_enhanced.cpp` to your ESP32
   - Update WiFi credentials in the code
   - Update server URL and API key if using server integration
   - Install required libraries: WiFi, WebServer, HTTPClient, ArduinoJson

3. **Hardware Connections**:
   - Connect Arduino pin D2 to ESP32 GPIO17
   - Connect Arduino pin D3 to ESP32 GPIO16
   - Connect common ground between Arduino and ESP32
   - Power both devices appropriately

4. **Testing**:
   - Monitor serial outputs from both devices
   - Access the web interface at the ESP32's IP address
   - Test manual control of all actuators
   - Verify automatic modes with appropriate sensor conditions

## Troubleshooting

- **Communication Issues**: Check UART connections and baud rates (9600)
- **Relay Not Working**: Verify power supply and relay module connections
- **Sensor Readings Incorrect**: Check sensor connections and calibration values
- **WiFi Connection Problems**: Verify credentials and network accessibility
- **Web Interface Not Loading**: Check ESP32 IP address and port 80 accessibility

## Future Enhancements

- Add data logging to SD card
- Implement scheduling system for fertilizer pump
- Add SMS/email alerts for critical conditions
- Integrate with weather API for enhanced automation
- Add camera module for visual monitoring
