#include <WiFi.h>
#include <WebServer.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>

// Wi-Fi credentials
const char* ssid = "virus.exe downloading...";
const char* password = "yeahboiii";

// Web server on port 80
WebServer server(80);

// Server configuration for data forwarding
const char* SERVER_URL = "http://your-server-domain.com/api/sensor-data"; // Update with your server URL
const char* API_KEY = "your-api-key"; // Update with your API key

// Latest sensor data from Arduino
String latestData = "Waiting for sensor data...";
String lastParsedData = "";

// Data structure to hold parsed sensor values
struct SensorData {
  float temp1, temp2;
  float hum1, hum2;
  int soil, light, tank;
  float ph;
  String waterPump, waterMode;
  String fan, fanMode;
  String fertilizer;
  String rfid;
  unsigned long timestamp;
};

SensorData currentData;

// HTML page template
String getWebPage() {
  String html = R"(
<!DOCTYPE html>
<html>
<head>
    <meta charset='UTF-8'>
    <meta name='viewport' content='width=device-width, initial-scale=1'>
    <title>Greenhouse Control Dashboard</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; background-color: #f5f5f5; }
        .container { max-width: 1200px; margin: 0 auto; }
        .card { background: white; padding: 20px; margin: 10px 0; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .sensor-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 15px; }
        .control-section { margin: 20px 0; }
        .btn { padding: 10px 20px; margin: 5px; border: none; border-radius: 4px; cursor: pointer; }
        .btn-primary { background-color: #007bff; color: white; }
        .btn-success { background-color: #28a745; color: white; }
        .btn-danger { background-color: #dc3545; color: white; }
        .btn-warning { background-color: #ffc107; color: black; }
        .status { padding: 5px 10px; border-radius: 4px; font-weight: bold; }
        .status-on { background-color: #d4edda; color: #155724; }
        .status-off { background-color: #f8d7da; color: #721c24; }
        .mode-auto { background-color: #cce5ff; color: #0056b3; }
        .mode-manual { background-color: #fff3cd; color: #856404; }
        h1 { color: #333; text-align: center; }
        h2 { color: #666; border-bottom: 2px solid #007bff; padding-bottom: 5px; }
        .refresh-btn { float: right; }
        .data-time { font-size: 12px; color: #666; }
    </style>
    <script>
        function sendCommand(command) {
            fetch('/command?cmd=' + encodeURIComponent(command))
                .then(response => response.text())
                .then(data => {
                    alert(data);
                    setTimeout(() => location.reload(), 1000);
                })
                .catch(error => alert('Error: ' + error));
        }
        
        function refreshData() {
            location.reload();
        }
        
        // Auto-refresh every 30 seconds
        setInterval(() => {
            fetch('/data')
                .then(response => response.text())
                .then(data => {
                    document.getElementById('sensorData').innerHTML = data;
                });
        }, 30000);
    </script>
</head>
<body>
    <div class='container'>
        <h1>🌱 Greenhouse Control Dashboard</h1>
        <button class='btn btn-primary refresh-btn' onclick='refreshData()'>🔄 Refresh</button>
        
        <div class='card'>
            <h2>📊 Sensor Data</h2>
            <div class='data-time'>Last updated: <span id='timestamp'>)" + String(millis()/1000) + R"( seconds ago</span></div>
            <div id='sensorData'>)" + latestData + R"(</div>
        </div>

        <div class='card'>
            <h2>💧 Water Pump Control</h2>
            <div class='control-section'>
                <span class='status )" + (currentData.waterPump == "ON" ? "status-on" : "status-off") + R"('>
                    Status: )" + currentData.waterPump + R"(
                </span>
                <span class='status )" + (currentData.waterMode == "AUTO" ? "mode-auto" : "mode-manual") + R"('>
                    Mode: )" + currentData.waterMode + R"(
                </span>
                <br><br>
                <button class='btn btn-success' onclick='sendCommand("WATER:AUTO")'>🤖 Auto Mode</button>
                <button class='btn btn-warning' onclick='sendCommand("WATER:MANUAL:ON")'>🔛 Manual ON</button>
                <button class='btn btn-danger' onclick='sendCommand("WATER:MANUAL:OFF")'>🔴 Manual OFF</button>
            </div>
        </div>

        <div class='card'>
            <h2>🌪️ Ventilation Fan Control</h2>
            <div class='control-section'>
                <span class='status )" + (currentData.fan == "ON" ? "status-on" : "status-off") + R"('>
                    Status: )" + currentData.fan + R"(
                </span>
                <span class='status )" + (currentData.fanMode == "AUTO" ? "mode-auto" : "mode-manual") + R"('>
                    Mode: )" + currentData.fanMode + R"(
                </span>
                <br><br>
                <button class='btn btn-success' onclick='sendCommand("FAN:AUTO")'>🤖 Auto Mode</button>
                <button class='btn btn-warning' onclick='sendCommand("FAN:MANUAL:ON")'>🔛 Manual ON</button>
                <button class='btn btn-danger' onclick='sendCommand("FAN:MANUAL:OFF")'>🔴 Manual OFF</button>
            </div>
        </div>

        <div class='card'>
            <h2>🧪 Fertilizer Pump Control</h2>
            <div class='control-section'>
                <span class='status )" + (currentData.fertilizer == "ON" ? "status-on" : "status-off") + R"('>
                    Status: )" + currentData.fertilizer + R"(
                </span>
                <span class='status mode-manual'>Mode: MANUAL ONLY</span>
                <br><br>
                <button class='btn btn-warning' onclick='sendCommand("FERTILIZER:ON")'>🔛 Turn ON</button>
                <button class='btn btn-danger' onclick='sendCommand("FERTILIZER:OFF")'>🔴 Turn OFF</button>
            </div>
        </div>

        <div class='card'>
            <h2>📈 Detailed Sensor Readings</h2>
            <div class='sensor-grid'>
                <div><strong>🌡️ Outside Temp:</strong> )" + String(currentData.temp1) + R"(°C</div>
                <div><strong>🌡️ Greenhouse Temp:</strong> )" + String(currentData.temp2) + R"(°C</div>
                <div><strong>💧 Outside Humidity:</strong> )" + String(currentData.hum1) + R"(%</div>
                <div><strong>💧 Greenhouse Humidity:</strong> )" + String(currentData.hum2) + R"(%</div>
                <div><strong>🌱 Soil Moisture:</strong> )" + String(currentData.soil) + R"(%</div>
                <div><strong>💡 Light Level:</strong> )" + String(currentData.light) + R"(%</div>
                <div><strong>🛢️ Water Tank:</strong> )" + String(currentData.tank) + R"(%</div>
                <div><strong>🧪 pH Level:</strong> )" + String(currentData.ph) + R"(</div>
                <div><strong>🏷️ RFID:</strong> )" + currentData.rfid + R"(</div>
            </div>
        </div>
    </div>
</body>
</html>
)";
  return html;
}

void parseSensorData(String data) {
  // Parse the sensor data string
  // Format: T1:25.0,H1:60.0,T2:28.0,H2:70.0,Soil:45,Light:80,Tank:75,pH:6.8,WaterPump:ON,WaterMode:AUTO,Fan:OFF,FanMode:AUTO,Fertilizer:OFF,RFID:NoCard
  
  currentData.temp1 = extractValue(data, "T1:").toFloat();
  currentData.temp2 = extractValue(data, "T2:").toFloat();
  currentData.hum1 = extractValue(data, "H1:").toFloat();
  currentData.hum2 = extractValue(data, "H2:").toFloat();
  currentData.soil = extractValue(data, "Soil:").toInt();
  currentData.light = extractValue(data, "Light:").toInt();
  currentData.tank = extractValue(data, "Tank:").toInt();
  currentData.ph = extractValue(data, "pH:").toFloat();
  currentData.waterPump = extractValue(data, "WaterPump:");
  currentData.waterMode = extractValue(data, "WaterMode:");
  currentData.fan = extractValue(data, "Fan:");
  currentData.fanMode = extractValue(data, "FanMode:");
  currentData.fertilizer = extractValue(data, "Fertilizer:");
  currentData.rfid = extractValue(data, "RFID:");
  currentData.timestamp = millis();
  
  lastParsedData = data;
}

String extractValue(String data, String key) {
  int startIndex = data.indexOf(key);
  if (startIndex == -1) return "";
  
  startIndex += key.length();
  int endIndex = data.indexOf(",", startIndex);
  if (endIndex == -1) endIndex = data.length();
  
  return data.substring(startIndex, endIndex);
}

void sendDataToServer() {
  if (WiFi.status() == WL_CONNECTED && lastParsedData.length() > 0) {
    HTTPClient http;
    http.begin(SERVER_URL);
    http.addHeader("Content-Type", "application/json");
    http.addHeader("Authorization", "Bearer " + String(API_KEY));
    
    // Create JSON payload
    DynamicJsonDocument doc(1024);
    doc["deviceId"] = WiFi.macAddress();
    doc["timestamp"] = currentData.timestamp;
    doc["sensors"]["outsideTemp"] = currentData.temp1;
    doc["sensors"]["greenhouseTemp"] = currentData.temp2;
    doc["sensors"]["outsideHumidity"] = currentData.hum1;
    doc["sensors"]["greenhouseHumidity"] = currentData.hum2;
    doc["sensors"]["soilMoisture"] = currentData.soil;
    doc["sensors"]["lightLevel"] = currentData.light;
    doc["sensors"]["waterTank"] = currentData.tank;
    doc["sensors"]["phLevel"] = currentData.ph;
    doc["actuators"]["waterPump"]["status"] = currentData.waterPump;
    doc["actuators"]["waterPump"]["mode"] = currentData.waterMode;
    doc["actuators"]["ventilationFan"]["status"] = currentData.fan;
    doc["actuators"]["ventilationFan"]["mode"] = currentData.fanMode;
    doc["actuators"]["fertilizerPump"]["status"] = currentData.fertilizer;
    doc["rfid"] = currentData.rfid;
    
    String jsonString;
    serializeJson(doc, jsonString);
    
    int httpResponseCode = http.POST(jsonString);
    
    if (httpResponseCode > 0) {
      Serial.println("Data sent to server successfully. Response code: " + String(httpResponseCode));
    } else {
      Serial.println("Error sending data to server: " + String(httpResponseCode));
    }
    
    http.end();
  }
}

// Route handlers
void handleRoot() {
  server.send(200, "text/html", getWebPage());
}

void handleCommand() {
  if (server.hasArg("cmd")) {
    String command = server.arg("cmd");
    Serial.println("Web command received: " + command);
    
    // Send command to Arduino via UART
    Serial1.println(command);
    
    server.send(200, "text/plain", "Command sent: " + command);
  } else {
    server.send(400, "text/plain", "Missing command parameter");
  }
}

void handleData() {
  server.send(200, "text/plain", latestData);
}

void handleAPI() {
  // API endpoint for external systems
  DynamicJsonDocument doc(1024);
  doc["deviceId"] = WiFi.macAddress();
  doc["timestamp"] = currentData.timestamp;
  doc["sensors"]["outsideTemp"] = currentData.temp1;
  doc["sensors"]["greenhouseTemp"] = currentData.temp2;
  doc["sensors"]["outsideHumidity"] = currentData.hum1;
  doc["sensors"]["greenhouseHumidity"] = currentData.hum2;
  doc["sensors"]["soilMoisture"] = currentData.soil;
  doc["sensors"]["lightLevel"] = currentData.light;
  doc["sensors"]["waterTank"] = currentData.tank;
  doc["sensors"]["phLevel"] = currentData.ph;
  doc["actuators"]["waterPump"]["status"] = currentData.waterPump;
  doc["actuators"]["waterPump"]["mode"] = currentData.waterMode;
  doc["actuators"]["ventilationFan"]["status"] = currentData.fan;
  doc["actuators"]["ventilationFan"]["mode"] = currentData.fanMode;
  doc["actuators"]["fertilizerPump"]["status"] = currentData.fertilizer;
  doc["rfid"] = currentData.rfid;
  
  String jsonString;
  serializeJson(doc, jsonString);
  
  server.send(200, "application/json", jsonString);
}

void handleControl() {
  // API endpoint for external control
  if (server.method() == HTTP_POST) {
    String body = server.arg("plain");
    DynamicJsonDocument doc(512);
    deserializeJson(doc, body);
    
    if (doc.containsKey("command")) {
      String command = doc["command"];
      Serial1.println(command);
      server.send(200, "application/json", "{\"status\":\"success\",\"command\":\"" + command + "\"}");
    } else {
      server.send(400, "application/json", "{\"status\":\"error\",\"message\":\"Missing command\"}");
    }
  } else {
    server.send(405, "text/plain", "Method not allowed");
  }
}

void setup() {
  Serial.begin(115200); // USB debug
  Serial1.begin(9600, SERIAL_8N1, 16, 17); // UART from Arduino

  pinMode(2, OUTPUT); // Onboard LED

  // Connect to Wi-Fi
  WiFi.begin(ssid, password);
  Serial.print("Connecting to WiFi");
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\nWiFi connected");
  Serial.print("IP Address: ");
  Serial.println(WiFi.localIP());

  // Setup routes
  server.on("/", handleRoot);
  server.on("/command", handleCommand);
  server.on("/data", handleData);
  server.on("/api/data", handleAPI);
  server.on("/api/control", handleControl);
  
  server.begin();
  Serial.println("Web server started");
  
  // Initialize current data structure
  currentData.temp1 = 0;
  currentData.temp2 = 0;
  currentData.hum1 = 0;
  currentData.hum2 = 0;
  currentData.soil = 0;
  currentData.light = 0;
  currentData.tank = 0;
  currentData.ph = 0;
  currentData.waterPump = "OFF";
  currentData.waterMode = "AUTO";
  currentData.fan = "OFF";
  currentData.fanMode = "AUTO";
  currentData.fertilizer = "OFF";
  currentData.rfid = "NoCard";
  currentData.timestamp = 0;
}

void loop() {
  server.handleClient();

  // Read UART data from Arduino
  if (Serial1.available()) {
    latestData = Serial1.readStringUntil('\n');
    Serial.println("Received: " + latestData);
    
    // Parse the received data
    parseSensorData(latestData);
    
    // Send data to server (every 30 seconds to avoid overwhelming the server)
    static unsigned long lastServerUpdate = 0;
    if (millis() - lastServerUpdate > 30000) {
      sendDataToServer();
      lastServerUpdate = millis();
    }
  }

  // Blink LED to show activity
  static unsigned long lastBlink = 0;
  if (millis() - lastBlink > 1000) {
    digitalWrite(2, !digitalRead(2));
    lastBlink = millis();
  }

  delay(100); // Prevent flooding
}
