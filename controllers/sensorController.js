const SensorData = require('../models/SensorData');
const DeviceControl = require('../models/DeviceControl');
const User = require('../models/User');
const Greenhouse = require('../models/Greenhouse');
const moment = require('moment');

// @desc    Receive sensor data from ESP32/Arduino (Enhanced)
// @route   POST /api/sensors/data
// @access  Device (API Key required)
const receiveSensorData = async (req, res) => {
  try {
    const {
      deviceId,
      userId,
      greenhouseId,
      timestamp,
      sensors,
      actuators,
      rfid,
      deviceStatus,
      rawData
    } = req.body;

    // Support both old and new data formats
    let sensorDataInput;
    
    if (sensors && sensors.outsideTemp !== undefined) {
      // New format from enhanced ESP32
      sensorDataInput = {
        temp1: sensors.outsideTemp,
        temp2: sensors.greenhouseTemp,
        hum1: sensors.outsideHumidity,
        hum2: sensors.greenhouseHumidity,
        soilMoisture: sensors.soilMoisture,
        lightIntensity: sensors.lightLevel,
        ph: sensors.phLevel,
        waterTankLevel: sensors.waterTank,
        actuatorStates: actuators,
        rfidData: rfid
      };
    } else {
      // Legacy format - extract from individual fields
      const {
        temp1,
        temp2,
        hum1,
        hum2,
        soilMoisture,
        lightIntensity,
        ph,
        waterTankLevel
      } = req.body;
      
      sensorDataInput = {
        temp1,
        temp2,
        hum1,
        hum2,
        soilMoisture,
        lightIntensity,
        ph,
        waterTankLevel,
        actuatorStates: null,
        rfidData: null
      };
    }

    // Validate required fields
    if (!deviceId || !userId || !greenhouseId) {
      return res.status(400).json({
        success: false,
        message: 'Device ID, User ID, and Greenhouse ID are required'
      });
    }

    // Verify user and greenhouse exist
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const greenhouse = await Greenhouse.findById(greenhouseId);
    if (!greenhouse) {
      return res.status(404).json({
        success: false,
        message: 'Greenhouse not found'
      });
    }

    // Create sensor data document
    const sensorData = new SensorData({
      deviceId,
      userId,
      greenhouseId,
      temperature: {
        temp1: {
          value: parseFloat(sensorDataInput.temp1) || 0,
          unit: 'C',
          sensorType: 'DHT11',
          location: sensors && sensors.outsideTemp !== undefined ? 'Outside' : 'Zone 1'
        },
        temp2: {
          value: parseFloat(sensorDataInput.temp2) || 0,
          unit: 'C',
          sensorType: 'DHT11',
          location: sensors && sensors.greenhouseTemp !== undefined ? 'Greenhouse' : 'Zone 2'
        }
      },
      humidity: {
        hum1: {
          value: parseFloat(sensorDataInput.hum1) || 0,
          unit: '%',
          sensorType: 'DHT11',
          location: sensors && sensors.outsideHumidity !== undefined ? 'Outside' : 'Zone 1'
        },
        hum2: {
          value: parseFloat(sensorDataInput.hum2) || 0,
          unit: '%',
          sensorType: 'DHT11',
          location: sensors && sensors.greenhouseHumidity !== undefined ? 'Greenhouse' : 'Zone 2'
        }
      },
      soilMoisture: {
        value: parseFloat(sensorDataInput.soilMoisture) || 0,
        unit: '%',
        sensorType: 'Capacitive',
        location: 'Soil bed'
      },
      lightIntensity: {
        value: parseFloat(sensorDataInput.lightIntensity) || 0,
        unit: '%',
        sensorType: 'LDR',
        location: 'Canopy level'
      },
      ph: {
        value: parseFloat(sensorDataInput.ph) || 7.0,
        unit: 'pH',
        sensorType: 'pH4502C',
        location: 'Nutrient solution'
      },
      waterTankLevel: {
        value: parseFloat(sensorDataInput.waterTankLevel) || 0,
        unit: '%',
        sensorType: 'Ultrasonic',
        location: 'Main water tank'
      },
      // Store actuator states if provided
      actuatorStates: sensorDataInput.actuatorStates || {},
      rfidData: sensorDataInput.rfidData || 'NoCard',
      deviceStatus: deviceStatus || {},
      rawData: rawData || req.body,
      dataQuality: 'good'
    });

    // Check for alerts based on user preferences
    const userPreferences = user.preferences.alertThresholds;
    const alerts = sensorData.checkAlerts(userPreferences);

    // Save sensor data
    await sensorData.save();

    // Update greenhouse stats
    greenhouse.stats.totalSensorReadings += 1;
    greenhouse.stats.lastDataReceived = new Date();
    if (alerts.length > 0) {
      greenhouse.stats.totalAlerts += alerts.length;
    }
    await greenhouse.save();

    // Update device status in greenhouse
    await greenhouse.updateDeviceStatus(deviceId, 'active');

    // Update device control with latest actuator states if provided
    if (sensorDataInput.actuatorStates) {
      await updateDeviceControlStates(deviceId, sensorDataInput.actuatorStates);
    }

    // Trigger automation if needed
    if (alerts.length > 0) {
      await handleAutomationTriggers(deviceId, sensorData, alerts);
    }

    // Emit real-time data via Socket.IO
    req.io.emit(`greenhouse_${greenhouseId}`, {
      type: 'sensor_data',
      deviceId,
      data: {
        sensors: {
          temperature: sensorData.temperature,
          humidity: sensorData.humidity,
          soilMoisture: sensorData.soilMoisture,
          lightIntensity: sensorData.lightIntensity,
          ph: sensorData.ph,
          waterTankLevel: sensorData.waterTankLevel
        },
        actuators: sensorDataInput.actuatorStates,
        rfid: sensorDataInput.rfidData,
        timestamp: sensorData.createdAt
      },
      alerts: alerts
    });

    res.status(201).json({
      success: true,
      message: 'Sensor data received successfully',
      data: {
        id: sensorData._id,
        timestamp: sensorData.createdAt,
        alerts: alerts,
        averageTemperature: sensorData.temperature.average,
        averageHumidity: sensorData.humidity.average,
        actuatorStates: sensorDataInput.actuatorStates,
        rfidData: sensorDataInput.rfidData
      }
    });

  } catch (error) {
    console.error('Sensor data reception error:', error);
    
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: messages
      });
    }

    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// @desc    Get latest sensor data
// @route   GET /api/sensors/latest/:deviceId
// @access  Private
const getLatestSensorData = async (req, res) => {
  try {
    const { deviceId } = req.params;
    const limit = parseInt(req.query.limit) || 1;

    const sensorData = await SensorData.getLatestByDevice(deviceId, limit);

    if (!sensorData || sensorData.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No sensor data found for this device'
      });
    }

    res.json({
      success: true,
      data: sensorData,
      count: sensorData.length
    });

  } catch (error) {
    console.error('Get latest sensor data error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// @desc    Get sensor data history
// @route   GET /api/sensors/history/:deviceId
// @access  Private
const getSensorHistory = async (req, res) => {
  try {
    const { deviceId } = req.params;
    const {
      startDate,
      endDate,
      interval = 'hour',
      limit = 100,
      page = 1
    } = req.query;

    // Default to last 24 hours if no date range provided
    const start = startDate ? new Date(startDate) : moment().subtract(24, 'hours').toDate();
    const end = endDate ? new Date(endDate) : new Date();

    const skip = (page - 1) * limit;

    const sensorData = await SensorData.find({
      deviceId,
      createdAt: { $gte: start, $lte: end }
    })
    .sort({ createdAt: -1 })
    .limit(parseInt(limit))
    .skip(skip)
    .populate('userId', 'username firstName lastName')
    .populate('greenhouseId', 'name location');

    const total = await SensorData.countDocuments({
      deviceId,
      createdAt: { $gte: start, $lte: end }
    });

    res.json({
      success: true,
      data: sensorData,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalRecords: total,
        limit: parseInt(limit)
      },
      dateRange: {
        start,
        end
      }
    });

  } catch (error) {
    console.error('Get sensor history error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// @desc    Get aggregated sensor data for charts
// @route   GET /api/sensors/aggregate/:deviceId
// @access  Private
const getAggregatedData = async (req, res) => {
  try {
    const { deviceId } = req.params;
    const {
      startDate,
      endDate,
      groupBy = 'hour', // hour, day, week, month
      metrics = 'temperature,humidity,soilMoisture'
    } = req.query;

    const start = startDate ? new Date(startDate) : moment().subtract(7, 'days').toDate();
    const end = endDate ? new Date(endDate) : new Date();

    const requestedMetrics = metrics.split(',');
    
    // Aggregation pipeline
    const pipeline = [
      {
        $match: {
          deviceId,
          createdAt: { $gte: start, $lte: end }
        }
      },
      {
        $group: {
          _id: {
            $dateToString: {
              format: getDateFormat(groupBy),
              date: '$createdAt'
            }
          },
          avgTemp: { $avg: '$temperature.average' },
          minTemp: { $min: '$temperature.average' },
          maxTemp: { $max: '$temperature.average' },
          avgHumidity: { $avg: '$humidity.average' },
          minHumidity: { $min: '$humidity.average' },
          maxHumidity: { $max: '$humidity.average' },
          avgSoilMoisture: { $avg: '$soilMoisture.value' },
          minSoilMoisture: { $min: '$soilMoisture.value' },
          maxSoilMoisture: { $max: '$soilMoisture.value' },
          avgLightIntensity: { $avg: '$lightIntensity.value' },
          avgPh: { $avg: '$ph.value' },
          avgWaterTank: { $avg: '$waterTankLevel.value' },
          count: { $sum: 1 },
          alertCount: { $sum: { $size: '$alerts' } }
        }
      },
      {
        $sort: { _id: 1 }
      }
    ];

    const aggregatedData = await SensorData.aggregate(pipeline);

    res.json({
      success: true,
      data: aggregatedData,
      dateRange: { start, end },
      groupBy,
      metrics: requestedMetrics
    });

  } catch (error) {
    console.error('Get aggregated data error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// @desc    Get device status
// @route   GET /api/sensors/status/:deviceId
// @access  Private
const getDeviceStatus = async (req, res) => {
  try {
    const { deviceId } = req.params;

    // Get latest sensor data for device status
    const latestData = await SensorData.findOne({ deviceId })
      .sort({ createdAt: -1 })
      .select('deviceStatus createdAt dataQuality');

    if (!latestData) {
      return res.status(404).json({
        success: false,
        message: 'No data found for this device'
      });
    }

    // Check if device is online (received data within last 10 minutes)
    const isOnline = moment().diff(moment(latestData.createdAt), 'minutes') <= 10;

    res.json({
      success: true,
      data: {
        deviceId,
        isOnline,
        lastSeen: latestData.createdAt,
        status: latestData.deviceStatus,
        dataQuality: latestData.dataQuality
      }
    });

  } catch (error) {
    console.error('Get device status error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Helper function to handle automation triggers
const handleAutomationTriggers = async (deviceId, sensorData, alerts) => {
  try {
    const deviceControl = await DeviceControl.findOne({ deviceId });
    if (!deviceControl || !deviceControl.automationRules) {
      return;
    }

    const rules = deviceControl.automationRules;

    // Check irrigation automation
    if (rules.irrigation.enabled) {
      const soilMoistureAlert = alerts.find(alert => alert.type === 'soil_moisture_low');
      if (soilMoistureAlert && sensorData.soilMoisture.value < rules.irrigation.soilMoistureThreshold) {
        // Check cooldown period
        const lastTriggered = rules.irrigation.lastTriggered;
        if (!lastTriggered || moment().diff(moment(lastTriggered), 'seconds') > rules.irrigation.cooldownPeriod) {
          await deviceControl.setRelay('waterPump1', true, 'automation', null, 'Low soil moisture detected');
          rules.irrigation.lastTriggered = new Date();
          
          // Schedule to turn off pump after duration
          setTimeout(async () => {
            await deviceControl.setRelay('waterPump1', false, 'automation', null, 'Irrigation duration completed');
          }, rules.irrigation.pumpDuration * 1000);
        }
      }
    }

    // Check ventilation automation
    if (rules.ventilation.enabled) {
      const tempHigh = alerts.find(alert => alert.type === 'temperature_high');
      const humidityHigh = alerts.find(alert => alert.type === 'humidity_high');
      
      if (tempHigh || humidityHigh) {
        await deviceControl.setRelay('exhaustFan', true, 'automation', null, 'High temperature/humidity detected');
        await deviceControl.setRelay('intakeFan', true, 'automation', null, 'Ventilation needed');
        
        // Schedule to turn off fans after duration
        setTimeout(async () => {
          await deviceControl.setRelay('exhaustFan', false, 'automation', null, 'Ventilation duration completed');
          await deviceControl.setRelay('intakeFan', false, 'automation', null, 'Ventilation duration completed');
        }, rules.ventilation.fanDuration * 1000);
      }
    }

    await deviceControl.save();

  } catch (error) {
    console.error('Automation trigger error:', error);
  }
};

// Helper function to update device control states with actuator feedback
const updateDeviceControlStates = async (deviceId, actuatorStates) => {
  try {
    const DeviceControl = require('../models/DeviceControl');
    const deviceControl = await DeviceControl.findOne({ deviceId });
    
    if (!deviceControl) {
      console.log(`Device control not found for ${deviceId}, creating new one`);
      return;
    }

    // Update relay states based on ESP32 feedback
    if (actuatorStates.waterPump) {
      if (deviceControl.relays.waterPump) {
        deviceControl.relays.waterPump.state = actuatorStates.waterPump.status === 'ON';
        deviceControl.relays.waterPump.mode = actuatorStates.waterPump.mode || 'AUTO';
        deviceControl.relays.waterPump.lastHeartbeat = new Date();
      }
    }

    if (actuatorStates.ventilationFan) {
      if (deviceControl.relays.ventilationFan) {
        deviceControl.relays.ventilationFan.state = actuatorStates.ventilationFan.status === 'ON';
        deviceControl.relays.ventilationFan.mode = actuatorStates.ventilationFan.mode || 'AUTO';
        deviceControl.relays.ventilationFan.lastHeartbeat = new Date();
      }
    }

    if (actuatorStates.fertilizerPump) {
      if (deviceControl.relays.fertilizerPump) {
        deviceControl.relays.fertilizerPump.state = actuatorStates.fertilizerPump.status === 'ON';
        deviceControl.relays.fertilizerPump.lastHeartbeat = new Date();
      }
    }

    await deviceControl.save();
  } catch (error) {
    console.error('Error updating device control states:', error);
  }
};

// Helper function to get date format for aggregation
const getDateFormat = (groupBy) => {
  switch (groupBy) {
    case 'hour':
      return '%Y-%m-%d %H:00:00';
    case 'day':
      return '%Y-%m-%d';
    case 'week':
      return '%Y-%U';
    case 'month':
      return '%Y-%m';
    default:
      return '%Y-%m-%d %H:00:00';
  }
};

module.exports = {
  receiveSensorData,
  getLatestSensorData,
  getSensorHistory,
  getAggregatedData,
  getDeviceStatus
};
