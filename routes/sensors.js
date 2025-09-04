const express = require('express');
const router = express.Router();
const {
  receiveSensorData,
  getLatestSensorData,
  getSensorHistory,
  getAggregatedData,
  getDeviceStatus
} = require('../controllers/sensorController');
const { authenticateToken, authenticateDevice } = require('../middleware/auth');

// @route   POST /api/sensors/data
// @desc    Receive sensor data from ESP32/Arduino
// @access  Device (API Key required)
router.post('/data', authenticateDevice, receiveSensorData);

// @route   GET /api/sensors/latest/:deviceId
// @desc    Get latest sensor data
// @access  Private
router.get('/latest/:deviceId', authenticateToken, getLatestSensorData);

// @route   GET /api/sensors/history/:deviceId
// @desc    Get sensor data history
// @access  Private
router.get('/history/:deviceId', authenticateToken, getSensorHistory);

// @route   GET /api/sensors/aggregate/:deviceId
// @desc    Get aggregated sensor data for charts
// @access  Private
router.get('/aggregate/:deviceId', authenticateToken, getAggregatedData);

// @route   GET /api/sensors/status/:deviceId
// @desc    Get device status
// @access  Private
router.get('/status/:deviceId', authenticateToken, getDeviceStatus);

module.exports = router;
