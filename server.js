const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const bodyParser = require("body-parser");
const cors = require("cors");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
cors: {
origin: "*", // Allow ESP32 + browser
},
});

app.use(cors());
app.use(bodyParser.json());

let latestSensorData = {};

// ============ REST ENDPOINTS ============

// Receive sensor data from ESP32
app.post("/api/sensor-data", (req, res) => {
latestSensorData = req.body;
console.log("📡 Sensor data received:", latestSensorData);
io.emit("sensorUpdate", latestSensorData); // Broadcast to clients
res.status(200).json({ message: "Data received" });
});

// Provide latest sensor data
app.get("/api/sensor-data", (req, res) => {
res.json(latestSensorData);
});

// Send control commands to ESP32
app.post("/api/control", (req, res) => {
const { command } = req.body;

if (!command) {
return res.status(400).json({ error: "Command is required" });
}

console.log("🎮 Control command received via API:", command);
io.emit("controlCommand", { command: command });
res.status(200).json({ message: "Command sent", command: command });
});

// Alternative GET endpoint for simple commands
app.get("/api/control/:command", (req, res) => {
const command = req.params.command;
console.log("🎮 Control command received via GET:", command);
io.emit("controlCommand", { command: command });
res.status(200).json({ message: "Command sent", command: command });
});

// Water pump control endpoints
app.post("/api/water/auto", (req, res) => {
const command = "WATER:AUTO";
console.log("💧 Water pump auto mode activated");
io.emit("controlCommand", { command: command });
res.status(200).json({ message: "Water pump set to auto mode" });
});

app.post("/api/water/manual/on", (req, res) => {
const command = "WATER:MANUAL:ON";
console.log("💧 Water pump manual ON");
io.emit("controlCommand", { command: command });
res.status(200).json({ message: "Water pump turned ON (manual)" });
});

app.post("/api/water/manual/off", (req, res) => {
const command = "WATER:MANUAL:OFF";
console.log("💧 Water pump manual OFF");
io.emit("controlCommand", { command: command });
res.status(200).json({ message: "Water pump turned OFF (manual)" });
});

// Fan control endpoints
app.post("/api/fan/auto", (req, res) => {
const command = "FAN:AUTO";
console.log("🌪️ Fan auto mode activated");
io.emit("controlCommand", { command: command });
res.status(200).json({ message: "Fan set to auto mode" });
});

app.post("/api/fan/manual/on", (req, res) => {
const command = "FAN:MANUAL:ON";
console.log("🌪️ Fan manual ON");
io.emit("controlCommand", { command: command });
res.status(200).json({ message: "Fan turned ON (manual)" });
});

app.post("/api/fan/manual/off", (req, res) => {
const command = "FAN:MANUAL:OFF";
console.log("🌪️ Fan manual OFF");
io.emit("controlCommand", { command: command });
res.status(200).json({ message: "Fan turned OFF (manual)" });
});

// Fertilizer pump control endpoints
app.post("/api/fertilizer/on", (req, res) => {
const command = "FERTILIZER:ON";
console.log("🧪 Fertilizer pump ON");
io.emit("controlCommand", { command: command });
res.status(200).json({ message: "Fertilizer pump turned ON" });
});

app.post("/api/fertilizer/off", (req, res) => {
const command = "FERTILIZER:OFF";
console.log("🧪 Fertilizer pump OFF");
io.emit("controlCommand", { command: command });
res.status(200).json({ message: "Fertilizer pump turned OFF" });
});

// ============ SOCKET.IO ============

io.on("connection", (socket) => {
console.log("🔌 Client connected:", socket.id);

// Send latest data immediately when someone connects
if (Object.keys(latestSensorData).length > 0) {
socket.emit("sensorUpdate", latestSensorData);
}

// Handle control commands from web clients
socket.on("controlCommand", (cmd) => {
console.log("⚡ Control command received:", cmd);

// Forward command to ESP32 (SocketIOclient will catch it)
io.emit("controlCommand", { command: cmd });
});

socket.on("disconnect", () => {
console.log("❌ Client disconnected:", socket.id);
});
});

// ============ START SERVER ============
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
console.log(`🚀 Server running on port ${PORT}`);
console.log(`📋 Available endpoints:`);
console.log(`   POST /api/control - Send any command`);
console.log(`   GET  /api/control/:command - Send command via URL`);
console.log(`   POST /api/water/auto - Water pump auto mode`);
console.log(`   POST /api/water/manual/on - Water pump manual ON`);
console.log(`   POST /api/water/manual/off - Water pump manual OFF`);
console.log(`   POST /api/fan/auto - Fan auto mode`);
console.log(`   POST /api/fan/manual/on - Fan manual ON`);
console.log(`   POST /api/fan/manual/off - Fan manual OFF`);
console.log(`   POST /api/fertilizer/on - Fertilizer pump ON`);
console.log(`   POST /api/fertilizer/off - Fertilizer pump OFF`);
});