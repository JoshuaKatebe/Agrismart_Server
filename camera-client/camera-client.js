#!/usr/bin/env node

/**
 * Greenhouse Camera Client
 * 
 * This application captures video from your laptop's webcam and streams it
 * to the greenhouse server via WebSocket connection.
 * 
 * Install dependencies:
 * npm install socket.io-client opencv4nodejs commander dotenv
 * 
 * Usage:
 * node camera-client.js --device ESP32_001 --server http://localhost:3000
 */

const { Command } = require('commander');
const io = require('socket.io-client');
const cv = require('opencv4nodejs');
require('dotenv').config();

class CameraClient {
  constructor(options) {
    this.deviceId = options.device || 'GREENHOUSE_CAM_001';
    this.serverUrl = options.server || 'http://localhost:3000';
    this.cameraIndex = options.camera || 0;
    this.frameRate = options.fps || 15;
    this.quality = options.quality || 80;
    this.resolution = options.resolution || '640x480';
    
    this.socket = null;
    this.camera = null;
    this.isStreaming = false;
    this.frameCounter = 0;
    this.startTime = Date.now();
    
    // Parse resolution
    const [width, height] = this.resolution.split('x').map(Number);
    this.width = width;
    this.height = height;
    
    console.log(`📹 Greenhouse Camera Client`);
    console.log(`   Device ID: ${this.deviceId}`);
    console.log(`   Server: ${this.serverUrl}`);
    console.log(`   Camera: ${this.cameraIndex}`);
    console.log(`   Resolution: ${this.resolution}`);
    console.log(`   Frame Rate: ${this.frameRate} FPS`);
    console.log(`   Quality: ${this.quality}%`);
  }

  async initialize() {
    try {
      console.log('🔌 Connecting to server...');
      await this.connectToServer();
      
      console.log('📹 Initializing camera...');
      await this.initializeCamera();
      
      console.log('🎬 Starting video stream...');
      this.startStreaming();
      
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
          type: 'webcam',
          capabilities: {
            resolution: this.resolution,
            maxFps: this.frameRate,
            formats: ['jpeg', 'png']
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
        this.isStreaming = false;
      });

      this.socket.on('settings_update', (settings) => {
        console.log('⚙️ Received settings update:', settings);
        this.updateSettings(settings);
      });

      this.socket.on('take_snapshot', () => {
        console.log('📸 Snapshot requested');
        this.takeSnapshot();
      });

      // Timeout after 10 seconds
      setTimeout(() => {
        if (!this.socket.connected) {
          reject(new Error('Connection timeout'));
        }
      }, 10000);
    });
  }

  async initializeCamera() {
    try {
      this.camera = new cv.VideoCapture(this.cameraIndex);
      
      // Set camera properties
      this.camera.set(cv.CAP_PROP_FRAME_WIDTH, this.width);
      this.camera.set(cv.CAP_PROP_FRAME_HEIGHT, this.height);
      this.camera.set(cv.CAP_PROP_FPS, this.frameRate);
      
      // Test camera by reading a frame
      const testFrame = this.camera.read();
      if (testFrame.empty) {
        throw new Error('Failed to read from camera');
      }
      
      console.log(`📹 Camera initialized: ${testFrame.cols}x${testFrame.rows}`);
      
    } catch (error) {
      throw new Error(`Camera initialization failed: ${error.message}`);
    }
  }

  startStreaming() {
    if (this.isStreaming) return;
    
    this.isStreaming = true;
    
    const streamLoop = () => {
      if (!this.isStreaming) return;
      
      try {
        const frame = this.camera.read();
        if (frame.empty) {
          console.log('⚠️ Empty frame received');
          setTimeout(streamLoop, 100);
          return;
        }

        // Resize if needed
        let processedFrame = frame;
        if (frame.cols !== this.width || frame.rows !== this.height) {
          processedFrame = frame.resize(this.height, this.width);
        }

        // Encode to JPEG
        const encoded = cv.imencode('.jpg', processedFrame, [
          cv.IMWRITE_JPEG_QUALITY, this.quality
        ]);
        
        // Convert to base64
        const base64Frame = encoded.toString('base64');
        
        // Send frame to server
        if (this.socket && this.socket.connected) {
          this.socket.emit('video_frame', {
            frame: base64Frame,
            timestamp: Date.now(),
            deviceId: this.deviceId,
            metadata: {
              width: processedFrame.cols,
              height: processedFrame.rows,
              channels: processedFrame.channels,
              size: encoded.length
            }
          });
          
          this.frameCounter++;
          
          // Log stats every 100 frames
          if (this.frameCounter % 100 === 0) {
            const elapsed = (Date.now() - this.startTime) / 1000;
            const fps = this.frameCounter / elapsed;
            console.log(`📊 Frames: ${this.frameCounter}, FPS: ${fps.toFixed(2)}, Size: ${encoded.length} bytes`);
          }
        }
        
        // Schedule next frame
        setTimeout(streamLoop, 1000 / this.frameRate);
        
      } catch (error) {
        console.error('❌ Frame capture error:', error.message);
        setTimeout(streamLoop, 1000);
      }
    };

    streamLoop();
  }

  updateSettings(settings) {
    if (settings.resolution && settings.resolution !== this.resolution) {
      console.log(`📏 Updating resolution: ${this.resolution} -> ${settings.resolution}`);
      const [width, height] = settings.resolution.split('x').map(Number);
      this.width = width;
      this.height = height;
      this.resolution = settings.resolution;
      
      if (this.camera) {
        this.camera.set(cv.CAP_PROP_FRAME_WIDTH, this.width);
        this.camera.set(cv.CAP_PROP_FRAME_HEIGHT, this.height);
      }
    }
    
    if (settings.quality && settings.quality !== this.quality) {
      console.log(`🎨 Updating quality: ${this.quality}% -> ${settings.quality}%`);
      this.quality = settings.quality;
    }
    
    if (settings.frameRate && settings.frameRate !== this.frameRate) {
      console.log(`🎬 Updating frame rate: ${this.frameRate} -> ${settings.frameRate} FPS`);
      this.frameRate = settings.frameRate;
      
      if (this.camera) {
        this.camera.set(cv.CAP_PROP_FPS, this.frameRate);
      }
    }
  }

  takeSnapshot() {
    try {
      const frame = this.camera.read();
      if (frame.empty) {
        console.log('⚠️ Cannot take snapshot: empty frame');
        return;
      }

      // Encode to high-quality JPEG for snapshot
      const encoded = cv.imencode('.jpg', frame, [
        cv.IMWRITE_JPEG_QUALITY, 95
      ]);
      
      const base64Frame = encoded.toString('base64');
      
      // Send snapshot to server
      if (this.socket && this.socket.connected) {
        this.socket.emit('snapshot_captured', {
          frame: base64Frame,
          timestamp: Date.now(),
          deviceId: this.deviceId,
          reason: 'manual_request'
        });
        
        console.log('📸 Snapshot captured and sent');
      }
      
    } catch (error) {
      console.error('❌ Snapshot error:', error.message);
    }
  }

  async cleanup() {
    console.log('🧹 Cleaning up...');
    
    this.isStreaming = false;
    
    if (this.camera) {
      this.camera.release();
      console.log('📹 Camera released');
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
      const avgFps = this.frameCounter / elapsed;
      
      this.socket.emit('camera_status', {
        deviceId: this.deviceId,
        isStreaming: this.isStreaming,
        frameCount: this.frameCounter,
        avgFps: Math.round(avgFps * 100) / 100,
        uptime: elapsed,
        settings: {
          resolution: this.resolution,
          quality: this.quality,
          frameRate: this.frameRate
        }
      });
    }
  }
}

// Command line interface
const program = new Command();

program
  .name('camera-client')
  .description('Greenhouse Camera Client - Stream webcam to greenhouse server')
  .version('1.0.0')
  .option('-d, --device <deviceId>', 'Device ID', 'GREENHOUSE_CAM_001')
  .option('-s, --server <url>', 'Server URL', 'http://localhost:3000')
  .option('-c, --camera <index>', 'Camera index', '0')
  .option('-f, --fps <rate>', 'Frame rate', '15')
  .option('-q, --quality <percent>', 'JPEG quality (1-100)', '80')
  .option('-r, --resolution <resolution>', 'Resolution (WxH)', '640x480')
  .parse();

const options = program.opts();

// Convert numeric options
options.camera = parseInt(options.camera);
options.fps = parseInt(options.fps);
options.quality = parseInt(options.quality);

// Create and start camera client
const client = new CameraClient(options);

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
