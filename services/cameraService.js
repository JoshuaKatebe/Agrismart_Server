const fs = require('fs');
const path = require('path');
const moment = require('moment');

class CameraService {
  constructor(io) {
    this.io = io;
    this.activeCameras = new Map();
    this.snapshots = new Map();
    this.recordings = new Map();
    
    // Camera settings
    this.defaultSettings = {
      resolution: '640x480',
      quality: 80,
      frameRate: 15,
      recordingEnabled: false,
      snapshotInterval: 0, // 0 = disabled, minutes
      maxRecordingDuration: 3600 // 1 hour in seconds
    };
    
    this.setupDirectories();
    this.startCleanupSchedule();
  }

  setupDirectories() {
    const dirs = ['uploads/cameras', 'uploads/cameras/snapshots', 'uploads/cameras/recordings'];
    dirs.forEach(dir => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    });
  }

  // Register a new camera stream
  registerCamera(deviceId, clientSocket, cameraInfo = {}) {
    console.log(`📹 Registering camera for device: ${deviceId}`);
    
    const camera = {
      deviceId,
      clientSocket,
      isActive: true,
      startTime: new Date(),
      lastFrame: null,
      frameCount: 0,
      settings: { ...this.defaultSettings, ...cameraInfo },
      viewers: new Set(), // Sockets watching this camera
      stats: {
        totalFrames: 0,
        avgFps: 0,
        lastActivity: new Date()
      }
    };

    this.activeCameras.set(deviceId, camera);
    
    // Set up client socket events
    this.setupCameraEvents(clientSocket, deviceId);
    
    // Notify all clients that camera is online
    this.io.emit('camera_online', {
      deviceId,
      timestamp: new Date(),
      settings: camera.settings
    });

    return camera;
  }

  setupCameraEvents(clientSocket, deviceId) {
    const camera = this.activeCameras.get(deviceId);
    if (!camera) return;

    // Handle video frame data
    clientSocket.on('video_frame', (data) => {
      this.handleVideoFrame(deviceId, data);
    });

    // Handle camera settings update
    clientSocket.on('camera_settings', (settings) => {
      this.updateCameraSettings(deviceId, settings);
    });

    // Handle snapshot request
    clientSocket.on('take_snapshot', (data) => {
      this.takeSnapshot(deviceId, data);
    });

    // Handle disconnect
    clientSocket.on('disconnect', () => {
      this.unregisterCamera(deviceId);
    });

    // Handle camera status
    clientSocket.on('camera_status', (status) => {
      this.updateCameraStatus(deviceId, status);
    });
  }

  handleVideoFrame(deviceId, frameData) {
    const camera = this.activeCameras.get(deviceId);
    if (!camera) return;

    // Update camera stats
    camera.frameCount++;
    camera.stats.totalFrames++;
    camera.stats.lastActivity = new Date();
    camera.lastFrame = frameData;

    // Calculate FPS
    const elapsed = (Date.now() - camera.startTime.getTime()) / 1000;
    camera.stats.avgFps = camera.frameCount / elapsed;

    // Broadcast frame to all viewers
    camera.viewers.forEach(viewerSocket => {
      try {
        viewerSocket.emit('camera_frame', {
          deviceId,
          frame: frameData.frame,
          timestamp: frameData.timestamp || Date.now(),
          frameNumber: camera.frameCount
        });
      } catch (error) {
        console.error(`Error sending frame to viewer:`, error);
        camera.viewers.delete(viewerSocket);
      }
    });

    // Auto-snapshot if enabled
    if (camera.settings.snapshotInterval > 0) {
      this.handleAutoSnapshot(deviceId);
    }

    // Emit stats periodically (every 30 frames)
    if (camera.frameCount % 30 === 0) {
      this.io.emit('camera_stats', {
        deviceId,
        stats: camera.stats
      });
    }
  }

  addViewer(deviceId, viewerSocket) {
    const camera = this.activeCameras.get(deviceId);
    if (!camera) {
      viewerSocket.emit('camera_error', {
        deviceId,
        error: 'Camera not found or offline'
      });
      return false;
    }

    camera.viewers.add(viewerSocket);
    console.log(`📺 Added viewer for camera ${deviceId}. Total viewers: ${camera.viewers.size}`);

    // Send latest frame immediately
    if (camera.lastFrame) {
      viewerSocket.emit('camera_frame', {
        deviceId,
        frame: camera.lastFrame.frame,
        timestamp: camera.lastFrame.timestamp || Date.now(),
        frameNumber: camera.frameCount
      });
    }

    // Handle viewer disconnect
    viewerSocket.on('disconnect', () => {
      camera.viewers.delete(viewerSocket);
      console.log(`📺 Removed viewer for camera ${deviceId}. Total viewers: ${camera.viewers.size}`);
    });

    return true;
  }

  removeViewer(deviceId, viewerSocket) {
    const camera = this.activeCameras.get(deviceId);
    if (camera) {
      camera.viewers.delete(viewerSocket);
    }
  }

  async takeSnapshot(deviceId, options = {}) {
    const camera = this.activeCameras.get(deviceId);
    if (!camera || !camera.lastFrame) {
      throw new Error('Camera not available or no recent frame');
    }

    const timestamp = moment().format('YYYY-MM-DD_HH-mm-ss');
    const filename = `${deviceId}_${timestamp}.jpg`;
    const filepath = path.join('uploads/cameras/snapshots', filename);

    try {
      // Save the frame as a snapshot
      const frameBuffer = Buffer.from(camera.lastFrame.frame, 'base64');
      fs.writeFileSync(filepath, frameBuffer);

      const snapshot = {
        deviceId,
        filename,
        filepath,
        timestamp: new Date(),
        size: frameBuffer.length,
        reason: options.reason || 'manual',
        metadata: {
          resolution: camera.settings.resolution,
          quality: camera.settings.quality,
          frameNumber: camera.frameCount
        }
      };

      this.snapshots.set(filename, snapshot);

      // Notify clients
      this.io.emit('snapshot_taken', snapshot);

      // Clean up old snapshots
      this.cleanupSnapshots(deviceId);

      return snapshot;
    } catch (error) {
      console.error('Error taking snapshot:', error);
      throw error;
    }
  }

  handleAutoSnapshot(deviceId) {
    const camera = this.activeCameras.get(deviceId);
    if (!camera) return;

    const now = Date.now();
    const intervalMs = camera.settings.snapshotInterval * 60 * 1000;
    
    if (!camera.lastAutoSnapshot || (now - camera.lastAutoSnapshot) >= intervalMs) {
      camera.lastAutoSnapshot = now;
      this.takeSnapshot(deviceId, { reason: 'auto' }).catch(console.error);
    }
  }

  updateCameraSettings(deviceId, newSettings) {
    const camera = this.activeCameras.get(deviceId);
    if (!camera) return false;

    camera.settings = { ...camera.settings, ...newSettings };
    
    // Notify the camera client about setting changes
    camera.clientSocket.emit('settings_update', camera.settings);
    
    // Notify other clients
    this.io.emit('camera_settings_updated', {
      deviceId,
      settings: camera.settings
    });

    console.log(`📹 Updated settings for camera ${deviceId}:`, newSettings);
    return true;
  }

  updateCameraStatus(deviceId, status) {
    const camera = this.activeCameras.get(deviceId);
    if (!camera) return;

    camera.status = status;
    
    this.io.emit('camera_status_update', {
      deviceId,
      status,
      timestamp: new Date()
    });
  }

  unregisterCamera(deviceId) {
    const camera = this.activeCameras.get(deviceId);
    if (!camera) return;

    console.log(`📹 Unregistering camera for device: ${deviceId}`);

    // Notify all viewers
    camera.viewers.forEach(viewerSocket => {
      viewerSocket.emit('camera_offline', {
        deviceId,
        timestamp: new Date()
      });
    });

    // Notify all clients
    this.io.emit('camera_offline', {
      deviceId,
      timestamp: new Date(),
      stats: camera.stats
    });

    this.activeCameras.delete(deviceId);
  }

  // Get camera information
  getCameraInfo(deviceId) {
    const camera = this.activeCameras.get(deviceId);
    if (!camera) return null;

    return {
      deviceId: camera.deviceId,
      isActive: camera.isActive,
      startTime: camera.startTime,
      settings: camera.settings,
      stats: camera.stats,
      viewerCount: camera.viewers.size,
      status: camera.status || 'active'
    };
  }

  // Get all active cameras
  getAllCameras() {
    const cameras = [];
    this.activeCameras.forEach((camera, deviceId) => {
      cameras.push(this.getCameraInfo(deviceId));
    });
    return cameras;
  }

  // Get snapshots for a device
  getSnapshots(deviceId, limit = 20) {
    const deviceSnapshots = [];
    this.snapshots.forEach(snapshot => {
      if (snapshot.deviceId === deviceId) {
        deviceSnapshots.push(snapshot);
      }
    });
    
    // Sort by timestamp (newest first)
    deviceSnapshots.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    
    return deviceSnapshots.slice(0, limit);
  }

  // Cleanup old snapshots
  cleanupSnapshots(deviceId, maxCount = 50) {
    const deviceSnapshots = this.getSnapshots(deviceId, 1000);
    
    if (deviceSnapshots.length > maxCount) {
      const toDelete = deviceSnapshots.slice(maxCount);
      
      toDelete.forEach(snapshot => {
        try {
          if (fs.existsSync(snapshot.filepath)) {
            fs.unlinkSync(snapshot.filepath);
          }
          this.snapshots.delete(snapshot.filename);
        } catch (error) {
          console.error('Error deleting snapshot:', error);
        }
      });
      
      console.log(`🧹 Cleaned up ${toDelete.length} old snapshots for ${deviceId}`);
    }
  }

  // Start scheduled cleanup
  startCleanupSchedule() {
    // Clean up old snapshots every hour
    setInterval(() => {
      this.activeCameras.forEach((camera, deviceId) => {
        this.cleanupSnapshots(deviceId);
      });
    }, 60 * 60 * 1000); // 1 hour
  }

  // Emergency snapshot (triggered by alerts)
  async takeEmergencySnapshot(deviceId, alertType, alertData) {
    try {
      const snapshot = await this.takeSnapshot(deviceId, {
        reason: 'emergency',
        alertType,
        alertData
      });

      console.log(`🚨 Emergency snapshot taken for ${deviceId}: ${alertType}`);
      
      // Send emergency notification
      this.io.emit('emergency_snapshot', {
        deviceId,
        snapshot,
        alert: {
          type: alertType,
          data: alertData
        }
      });

      return snapshot;
    } catch (error) {
      console.error('Failed to take emergency snapshot:', error);
      return null;
    }
  }
}

module.exports = CameraService;
