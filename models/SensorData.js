const mongoose = require('mongoose');

const sensorDataSchema = new mongoose.Schema({
  deviceId: {
    type: String,
    required: [true, 'Device ID is required'],
    trim: true,
    index: true
  },
  greenhouseId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Greenhouse',
    required: [true, 'Greenhouse ID is required'],
    index: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'User ID is required'],
    index: true
  },
  
  // Temperature sensors (2 DHT11 sensors)
  temperature: {
    temp1: {
      value: { type: Number, required: true },
      unit: { type: String, default: 'C' },
      sensorType: { type: String, default: 'DHT11' },
      location: { type: String, default: 'Zone 1' }
    },
    temp2: {
      value: { type: Number, required: true },
      unit: { type: String, default: 'C' },
      sensorType: { type: String, default: 'DHT11' },
      location: { type: String, default: 'Zone 2' }
    },
    average: { type: Number }
  },
  
  // Humidity sensors (2 DHT11 sensors)
  humidity: {
    hum1: {
      value: { type: Number, required: true },
      unit: { type: String, default: '%' },
      sensorType: { type: String, default: 'DHT11' },
      location: { type: String, default: 'Zone 1' }
    },
    hum2: {
      value: { type: Number, required: true },
      unit: { type: String, default: '%' },
      sensorType: { type: String, default: 'DHT11' },
      location: { type: String, default: 'Zone 2' }
    },
    average: { type: Number }
  },
  
  // Soil moisture sensor
  soilMoisture: {
    value: { type: Number, required: true },
    unit: { type: String, default: '%' },
    sensorType: { type: String, default: 'Capacitive' },
    location: { type: String, default: 'Soil bed' }
  },
  
  // Light intensity sensor
  lightIntensity: {
    value: { type: Number, required: true },
    unit: { type: String, default: '%' },
    sensorType: { type: String, default: 'LDR' },
    location: { type: String, default: 'Canopy level' }
  },
  
  // pH sensor
  ph: {
    value: { type: Number, required: true },
    unit: { type: String, default: 'pH' },
    sensorType: { type: String, default: 'pH probe' },
    location: { type: String, default: 'Nutrient solution' }
  },
  
  // Water tank level
  waterTankLevel: {
    value: { type: Number, required: true },
    unit: { type: String, default: '%' },
    sensorType: { type: String, default: 'Ultrasonic' },
    location: { type: String, default: 'Main water tank' }
  },
  
  // Data quality and status
  dataQuality: {
    type: String,
    enum: ['good', 'warning', 'error'],
    default: 'good'
  },
  
  alerts: [{
    type: {
      type: String,
      enum: ['temperature_high', 'temperature_low', 'humidity_high', 'humidity_low', 
             'soil_moisture_low', 'ph_high', 'ph_low', 'water_tank_low', 'sensor_error']
    },
    message: String,
    severity: {
      type: String,
      enum: ['low', 'medium', 'high', 'critical'],
      default: 'medium'
    },
    acknowledged: { type: Boolean, default: false }
  }],
  
  // Actuator states (from ESP32 feedback)
  actuatorStates: {
    waterPump: {
      status: { type: String, enum: ['ON', 'OFF'], default: 'OFF' },
      mode: { type: String, enum: ['AUTO', 'MANUAL'], default: 'AUTO' }
    },
    ventilationFan: {
      status: { type: String, enum: ['ON', 'OFF'], default: 'OFF' },
      mode: { type: String, enum: ['AUTO', 'MANUAL'], default: 'AUTO' }
    },
    fertilizerPump: {
      status: { type: String, enum: ['ON', 'OFF'], default: 'OFF' }
    }
  },
  
  // RFID data
  rfidData: {
    type: String,
    default: 'NoCard'
  },
  
  // ESP32/Arduino status
  deviceStatus: {
    batteryLevel: Number,
    wifiSignal: Number,
    uptime: Number,
    lastHeartbeat: { type: Date, default: Date.now }
  },
  
  // Raw sensor readings for debugging
  rawData: {
    type: mongoose.Schema.Types.Mixed
  },
  
  // Processing timestamp
  processedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Indexes for performance
sensorDataSchema.index({ createdAt: -1 });
sensorDataSchema.index({ deviceId: 1, createdAt: -1 });
sensorDataSchema.index({ userId: 1, createdAt: -1 });
sensorDataSchema.index({ greenhouseId: 1, createdAt: -1 });

// Pre-save middleware to calculate averages and detect alerts
sensorDataSchema.pre('save', function(next) {
  // Calculate temperature average
  if (this.temperature.temp1.value && this.temperature.temp2.value) {
    this.temperature.average = (this.temperature.temp1.value + this.temperature.temp2.value) / 2;
  }
  
  // Calculate humidity average
  if (this.humidity.hum1.value && this.humidity.hum2.value) {
    this.humidity.average = (this.humidity.hum1.value + this.humidity.hum2.value) / 2;
  }
  
  next();
});

// Static method to get latest data for a device
sensorDataSchema.statics.getLatestByDevice = function(deviceId, limit = 1) {
  return this.find({ deviceId })
    .sort({ createdAt: -1 })
    .limit(limit)
    .populate('userId', 'username firstName lastName')
    .populate('greenhouseId', 'name location');
};

// Static method to get data within time range
sensorDataSchema.statics.getDataInRange = function(deviceId, startDate, endDate) {
  return this.find({
    deviceId,
    createdAt: { $gte: startDate, $lte: endDate }
  }).sort({ createdAt: 1 });
};

// Instance method to check if data is within normal ranges
sensorDataSchema.methods.checkAlerts = function(thresholds) {
  const alerts = [];
  
  // Temperature alerts
  if (this.temperature.average > thresholds.tempMax) {
    alerts.push({
      type: 'temperature_high',
      message: `Temperature is too high: ${this.temperature.average}°C`,
      severity: 'high'
    });
  } else if (this.temperature.average < thresholds.tempMin) {
    alerts.push({
      type: 'temperature_low',
      message: `Temperature is too low: ${this.temperature.average}°C`,
      severity: 'high'
    });
  }
  
  // Humidity alerts
  if (this.humidity.average > thresholds.humidityMax) {
    alerts.push({
      type: 'humidity_high',
      message: `Humidity is too high: ${this.humidity.average}%`,
      severity: 'medium'
    });
  } else if (this.humidity.average < thresholds.humidityMin) {
    alerts.push({
      type: 'humidity_low',
      message: `Humidity is too low: ${this.humidity.average}%`,
      severity: 'medium'
    });
  }
  
  // Soil moisture alert
  if (this.soilMoisture.value < thresholds.soilMoistureMin) {
    alerts.push({
      type: 'soil_moisture_low',
      message: `Soil moisture is low: ${this.soilMoisture.value}%`,
      severity: 'high'
    });
  }
  
  // pH alerts
  if (this.ph.value > thresholds.phMax || this.ph.value < thresholds.phMin) {
    alerts.push({
      type: this.ph.value > thresholds.phMax ? 'ph_high' : 'ph_low',
      message: `pH level is abnormal: ${this.ph.value}`,
      severity: 'medium'
    });
  }
  
  // Water tank alert
  if (this.waterTankLevel.value < thresholds.waterTankMin) {
    alerts.push({
      type: 'water_tank_low',
      message: `Water tank level is low: ${this.waterTankLevel.value}%`,
      severity: 'critical'
    });
  }
  
  this.alerts = alerts;
  return alerts;
};

module.exports = mongoose.model('SensorData', sensorDataSchema);
