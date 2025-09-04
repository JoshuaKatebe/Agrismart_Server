#!/usr/bin/env node

/**
 * Simple Greenhouse Camera Client
 * 
 * This is a simpler version that uses node-webcam (easier to install than OpenCV)
 * Captures periodic snapshots and streams them to the server.
 * 
 * Install dependencies:
 * npm install socket.io-client node-webcam commander
 * 
 * Usage:
 * node simple-camera-client.js --device GREENHOUSE_CAM_001 --server http://localhost:3000
 */

const { Command } = require('commander');
const io = require('socket.io-client');
const NodeWebcam = require('node-webcam');
const fs = require('fs');
const path = require('path');

class SimpleCameraClient {
  constructor(options) {
    this.deviceId = options.device || 'GREENHOUSE_CAM_001';
    this.serverUrl = options.server || 'http://localhost:3000';
    this.captureInterval = options.interval || 5; // seconds
    this.quality = options.quality || 80;
    this.resolution = options.resolution || '640x480';
    
    this.socket = null;
    this.webcam = null;
    this.isRunning = false;
    this.captureCount = 0;
    this.startTime = Date.now();
    
    // Parse resolution
    const [width, height] = this.resolution.split('x').map(Number);
    this.width = width;
    this.height = height;
    
    // Setup webcam options
    this.webcamOptions = {
      width: this.width,
      height: this.height,
      quality: this.quality,
      delay: 0,
      saveShots: false,
      output: "jpeg",
      device: false,
      callbackReturn: "base64",
      verbose: false
    };
    
    console.log(`📹 Simple Greenhouse Camera Client`);
    console.log(`   Device ID: ${this.deviceId}`);
    console.log(`   Server: ${this.serverUrl}`);
    console.log(`   Resolution: ${this.resolution}`);
    console.log(`   Capture Interval: ${this.captureInterval}s`);
    console.log(`   Quality: ${this.quality}%`);
  }

  async initialize() {
    try {
      console.log('🔌 Connecting to server...');
      await this.connectToServer();
      
      console.log('📹 Initializing camera...');
      this.initializeCamera();
      
      console.log('🎬 Starting image capture...');
      this.startCapturing();
      
      console.log('✅ Camera client running successfully!');
      console.log('Press Ctrl+C to stop');
      
    } catch (error) {
      console.error('❌ Failed to initialize camera client:', error.message);
      process.exit(1);
    }
  }

  connectToServer() {
    return new Promise((resolve, reject) => {
      this.socket = io(this.serverUrl, {
        transports: ['websocket'],
        timeout: 10000
      });

      this.socket.on('connect', () => {
        console.log('✅ Connected to greenhouse server');
        
        // Register as camera client
        this.socket.emit('register_camera', {
          deviceId: this.deviceId,
          type: 'webcam_snapshots',
          capabilities: {
            resolution: this.resolution,
            captureInterval: this.captureInterval,
            formats: ['jpeg']
          }
        });
        
        resolve();
      });

      this.socket.on('connect_error', (error) => {
        console.error('❌ Connection failed:', error.message);
        reject(error);
      });

      this.socket.on('disconnect', () => {
        console.log('🔌 Disconnected from server');
        this.isRunning = false;
      });

      this.socket.on('settings_update', (settings) => {
        console.log('⚙️ Received settings update:', settings);
        this.updateSettings(settings);
      });

      this.socket.on('take_snapshot', () => {
        console.log('📸 Immediate snapshot requested');
        this.captureAndSend();
      });

      // Timeout after 10 seconds
      setTimeout(() => {
        if (!this.socket.connected) {
          reject(new Error('Connection timeout'));
        }
      }, 10000);
    });
  }

  initializeCamera() {
    try {
      // Test different webcam options for Windows
      const windowsOptions = {
        ...this.webcamOptions,
        // For Windows, try these device options
        device: false, // Auto-detect
      };
      
      this.webcam = NodeWebcam.create(windowsOptions);
      console.log('📹 Camera initialized with node-webcam');
      
    } catch (error) {
      throw new Error(`Camera initialization failed: ${error.message}`);
    }
  }

  startCapturing() {
    if (this.isRunning) return;
    
    this.isRunning = true;
    
    // Capture first image immediately
    setTimeout(() => this.captureAndSend(), 1000);
    
    // Set up interval capturing
    this.captureTimer = setInterval(() => {
      this.captureAndSend();
    }, this.captureInterval * 1000);
  }

  captureAndSend() {
    if (!this.isRunning || !this.socket || !this.socket.connected) {
      return;
    }

    this.webcam.capture('temp_capture', (err, data) => {
      if (err) {
        console.error('❌ Capture error:', err.message);
        return;
      }

      try {
        // data is already base64 when using callbackReturn: "base64"
        const base64Frame = data;
        
        // Send frame to server
        this.socket.emit('video_frame', {
          frame: base64Frame,
          timestamp: Date.now(),
          deviceId: this.deviceId,
          metadata: {
            width: this.width,
            height: this.height,
            captureInterval: this.captureInterval,
            quality: this.quality
          }
        });
        
        this.captureCount++;
        
        const elapsed = (Date.now() - this.startTime) / 1000;
        const avgInterval = elapsed / this.captureCount;
        
        console.log(`📸 Capture ${this.captureCount} sent (avg ${avgInterval.toFixed(1)}s)`);
        
      } catch (error) {
        console.error('❌ Send error:', error.message);
      }
    });
  }

  updateSettings(settings) {
    let needsRestart = false;
    
    if (settings.resolution && settings.resolution !== this.resolution) {
      console.log(`📏 Updating resolution: ${this.resolution} -> ${settings.resolution}`);
      const [width, height] = settings.resolution.split('x').map(Number);
      this.width = width;
      this.height = height;
      this.resolution = settings.resolution;
      this.webcamOptions.width = width;
      this.webcamOptions.height = height;
      needsRestart = true;
    }
    
    if (settings.quality && settings.quality !== this.quality) {
      console.log(`🎨 Updating quality: ${this.quality}% -> ${settings.quality}%`);
      this.quality = settings.quality;
      this.webcamOptions.quality = settings.quality;
      needsRestart = true;
    }
    
    if (settings.captureInterval && settings.captureInterval !== this.captureInterval) {
      console.log(`⏱️ Updating interval: ${this.captureInterval}s -> ${settings.captureInterval}s`);
      this.captureInterval = settings.captureInterval;
      
      // Restart timer with new interval
      if (this.captureTimer) {
        clearInterval(this.captureTimer);
        this.captureTimer = setInterval(() => {
          this.captureAndSend();
        }, this.captureInterval * 1000);
      }
    }
    
    if (needsRestart) {
      console.log('🔄 Restarting camera with new settings...');
      this.webcam = NodeWebcam.create(this.webcamOptions);
    }
  }

  async cleanup() {
    console.log('🧹 Cleaning up...');
    
    this.isRunning = false;
    
    if (this.captureTimer) {
      clearInterval(this.captureTimer);
      console.log('⏱️ Capture timer stopped');
    }
    
    if (this.socket) {
      this.socket.disconnect();
      console.log('🔌 Disconnected from server');
    }
    
    console.log('👋 Camera client stopped');
  }

  // Send periodic status updates
  sendStatus() {
    if (this.socket && this.socket.connected) {
      const elapsed = (Date.now() - this.startTime) / 1000;
      const avgInterval = this.captureCount > 0 ? elapsed / this.captureCount : 0;
      
      this.socket.emit('camera_status', {
        deviceId: this.deviceId,
        isRunning: this.isRunning,
        captureCount: this.captureCount,
        avgInterval: Math.round(avgInterval * 100) / 100,
        uptime: elapsed,
        settings: {
          resolution: this.resolution,
          quality: this.quality,
          captureInterval: this.captureInterval
        }
      });
    }
  }
}

// Command line interface
const program = new Command();

program
  .name('simple-camera-client')
  .description('Simple Greenhouse Camera Client - Capture webcam snapshots')
  .version('1.0.0')
  .option('-d, --device <deviceId>', 'Device ID', 'GREENHOUSE_CAM_001')
  .option('-s, --server <url>', 'Server URL', 'http://localhost:3000')
  .option('-i, --interval <seconds>', 'Capture interval in seconds', '5')
  .option('-q, --quality <percent>', 'JPEG quality (1-100)', '80')
  .option('-r, --resolution <resolution>', 'Resolution (WxH)', '640x480')
  .parse();

const options = program.opts();

// Convert numeric options
options.interval = parseInt(options.interval);
options.quality = parseInt(options.quality);

// Validate options
if (options.interval < 1) {
  console.error('❌ Capture interval must be at least 1 second');
  process.exit(1);
}

if (options.quality < 1 || options.quality > 100) {
  console.error('❌ Quality must be between 1 and 100');
  process.exit(1);
}

// Create and start camera client
const client = new SimpleCameraClient(options);

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🛑 Received SIGINT, shutting down gracefully...');
  await client.cleanup();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n🛑 Received SIGTERM, shutting down gracefully...');
  await client.cleanup();
  process.exit(0);
});

// Send status updates every 30 seconds
setInterval(() => {
  client.sendStatus();
}, 30000);

// Initialize and start
client.initialize().catch(error => {
  console.error('❌ Failed to start camera client:', error);
  process.exit(1);
});
