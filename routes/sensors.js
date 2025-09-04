const express = require('express');
const router = express.Router();
const {
  receiveSensorData,
  getLatestSensorData,
  getSensorHistory,
  getAggregatedData,
  getDeviceStatus
} = require('../controllers/sensorController');

// @route   POST /api/sensors/data
// @desc    Receive sensor data from ESP32/Arduino
// @access  Public
router.post('/data', receiveSensorData);

// @route   GET /api/sensors/latest/:deviceId
// @desc    Get latest sensor data
// @access  Public
router.get('/latest/:deviceId', getLatestSensorData);

// @route   GET /api/sensors/history/:deviceId
// @desc    Get sensor data history
// @access  Public
router.get('/history/:deviceId', getSensorHistory);

// @route   GET /api/sensors/aggregate/:deviceId
// @desc    Get aggregated sensor data for charts
// @access  Public
router.get('/aggregate/:deviceId', getAggregatedData);

// @route   GET /api/sensors/status/:deviceId
// @desc    Get device status
// @access  Public
router.get('/status/:deviceId', getDeviceStatus);

module.exports = router;
