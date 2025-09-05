// server.js
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
});
