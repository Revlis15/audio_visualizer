class AudioVisualizer {
  constructor() {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(
      75,
      window.innerWidth / window.innerHeight,
      0.1,
      1000
    );
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(this.renderer.domElement);

    // Audio setup
    this.audioContext = new (window.AudioContext ||
      window.webkitAudioContext)();
    this.analyser = this.audioContext.createAnalyser();
    this.analyser.fftSize = 256;
    this.dataArray = new Uint8Array(this.analyser.frequencyBinCount);

    // Audio source
    this.audioSource = null;
    this.audioBuffer = null;
    this.isPlaying = false;
    this.isUsingMic = false;
    this.micStream = null;
    this.startTime = 0;
    this.pauseTime = 0;
    this.totalDuration = 0;
    this.currentPosition = 0;
    this.audioStartTime = 0;
    this.audioGainNode = null;

    // Speech recognition setup
    this.recognition = null;
    this.isRecognizing = false;
    this.speechText = "";
    this.setupSpeechRecognition();

    // Visualization parameters
    this.displacementMultiplier = 1.0;
    this.vibrationSpeed = 0.02;
    this.vibrationAmount = 0.1;
    this.time = 0;
    this.sphereRadius = 5.0;
    this.sphereColor = 0xffffff; // Default color (white)
    this.numPoints = 40000; // Default number of points
    this.orbitingCircles = []; // Array to store orbiting circles

    // Create initial sphere
    this.createSphere();

    // Position camera further back to see the circles
    this.camera.position.z = 25;

    // Add ambient light
    const ambientLight = new THREE.AmbientLight(0x404040);
    this.scene.add(ambientLight);

    // Add directional light for better visibility
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.5);
    directionalLight.position.set(1, 1, 1);
    this.scene.add(directionalLight);

    // Handle window resize
    window.addEventListener("resize", () => this.onWindowResize(), false);

    // Setup UI controls
    this.setupControls();
    this.setupDisplacementControl();
    this.setupSphereSizeControl();
    this.setupColorControl();
    this.setupPointCountControl();
    this.setupRingCountControl();
    this.createOrbitingCircles();

    // Start animation
    this.animate();
  }

  formatTime(seconds) {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
  }

  updateTimeDisplay() {
    if (this.isPlaying) {
      const elapsedTime = this.audioContext.currentTime - this.audioStartTime;
      const currentTime = this.currentPosition + elapsedTime;
      document.getElementById("currentTime").textContent =
        this.formatTime(currentTime);
    } else {
      document.getElementById("currentTime").textContent = this.formatTime(
        this.currentPosition
      );
    }
  }

  setupSpeechRecognition() {
    if ("webkitSpeechRecognition" in window) {
      this.recognition = new webkitSpeechRecognition();
      this.recognition.continuous = true;
      this.recognition.interimResults = true;
      this.recognition.lang = "en-US";

      this.recognition.onstart = () => {
        this.isRecognizing = true;
        document.getElementById("micStatus").textContent =
          "Microphone & Speech: On";
        document.getElementById("speechBox").classList.add("listening");
      };

      this.recognition.onend = () => {
        this.isRecognizing = false;
        if (!this.isUsingMic) {
          document.getElementById("micStatus").textContent =
            "Microphone & Speech: Off";
          document.getElementById("speechBox").classList.remove("listening");
        }
      };

      this.recognition.onresult = (event) => {
        let interimTranscript = "";
        let finalTranscript = "";

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            finalTranscript += transcript + "\n";
          } else {
            interimTranscript += transcript;
          }
        }

        this.speechText = finalTranscript + interimTranscript;
        document.getElementById("speechText").textContent =
          this.speechText || "No speech detected";
      };

      this.recognition.onerror = (event) => {
        console.error("Speech recognition error:", event.error);
        document.getElementById(
          "micStatus"
        ).textContent = `Error: ${event.error}`;
      };
    } else {
      console.error("Speech recognition not supported");
      document.getElementById("micStatus").textContent =
        "Speech Recognition: Not Supported";
      document.getElementById("micToggle").disabled = true;
    }
  }

  setupControls() {
    const fileInput = document.getElementById("fileInput");
    const playButton = document.getElementById("playButton");
    const pauseButton = document.getElementById("pauseButton");
    const status = document.getElementById("status");
    const micToggle = document.getElementById("micToggle");
    const micStatus = document.getElementById("micStatus");
    const fileControls = document.getElementById("fileControls");

    micToggle.addEventListener("click", async () => {
      if (!this.isUsingMic) {
        try {
          // Start microphone
          this.micStream = await navigator.mediaDevices.getUserMedia({
            audio: true,
          });
          const source = this.audioContext.createMediaStreamSource(
            this.micStream
          );
          source.connect(this.analyser);
          this.analyser.connect(this.audioContext.destination);

          // Start speech recognition
          if (this.recognition) {
            this.recognition.start();
          }

          this.isUsingMic = true;
          micToggle.textContent = "Stop Microphone & Speech";
          micToggle.classList.add("active");
          micStatus.textContent = "Microphone & Speech: On";
          status.textContent = "Using microphone input";

          // Disable file controls while using mic
          fileControls.style.opacity = "0.5";
          fileControls.style.pointerEvents = "none";

          // Stop any playing audio file
          if (this.isPlaying) {
            this.pauseAudio();
            playButton.disabled = true;
            pauseButton.disabled = true;
          }
        } catch (error) {
          console.error("Error accessing microphone:", error);
          status.textContent = "Error accessing microphone";
        }
      } else {
        this.stopMicrophone();
        micToggle.textContent = "Start Microphone & Speech";
        micToggle.classList.remove("active");
        micStatus.textContent = "Microphone & Speech: Off";
        status.textContent = "No audio source selected";

        // Re-enable file controls
        fileControls.style.opacity = "1";
        fileControls.style.pointerEvents = "auto";
      }
    });

    fileInput.addEventListener("change", async (e) => {
      const file = e.target.files[0];
      if (file) {
        try {
          // Stop microphone if it's active
          if (this.isUsingMic) {
            this.stopMicrophone();
            micToggle.textContent = "Start Microphone & Speech";
            micToggle.classList.remove("active");
            micStatus.textContent = "Microphone & Speech: Off";
          }

          status.textContent = "Loading audio file...";
          const arrayBuffer = await file.arrayBuffer();
          this.audioBuffer = await this.audioContext.decodeAudioData(
            arrayBuffer
          );
          this.totalDuration = this.audioBuffer.duration;
          this.currentPosition = 0;
          document.getElementById("totalTime").textContent = this.formatTime(
            this.totalDuration
          );
          document.getElementById("currentTime").textContent =
            this.formatTime(0);
          playButton.disabled = false;
          status.textContent = `Loaded: ${file.name}`;
        } catch (error) {
          console.error("Error loading audio file:", error);
          status.textContent = "Error loading audio file";
        }
      }
    });

    playButton.addEventListener("click", () => {
      if (this.audioBuffer && !this.isPlaying) {
        this.playAudio();
        playButton.disabled = true;
        pauseButton.disabled = false;
        status.textContent = "Playing";
      }
    });

    pauseButton.addEventListener("click", () => {
      if (this.isPlaying) {
        this.pauseAudio();
        playButton.disabled = false;
        pauseButton.disabled = true;
        status.textContent = "Paused";
      }
    });
  }

  stopMicrophone() {
    if (this.micStream) {
      this.micStream.getTracks().forEach((track) => track.stop());
      this.micStream = null;
    }
    if (this.recognition) {
      this.recognition.stop();
    }
    this.isUsingMic = false;
    this.isRecognizing = false;
    document.getElementById("speechBox").classList.remove("listening");
  }

  async playAudio() {
    if (this.audioContext.state === "suspended") {
      await this.audioContext.resume();
    }

    // Create gain node for volume control
    if (!this.audioGainNode) {
      this.audioGainNode = this.audioContext.createGain();
      this.audioGainNode.connect(this.audioContext.destination);
    }

    // Create a new audio source
    this.audioSource = this.audioContext.createBufferSource();
    this.audioSource.buffer = this.audioBuffer;

    // Connect the audio graph
    this.audioSource.connect(this.analyser);
    this.analyser.connect(this.audioGainNode);

    // Set the start time
    this.audioStartTime = this.audioContext.currentTime;

    // Start from the current position
    this.audioSource.start(0, this.currentPosition);
    this.isPlaying = true;

    // Handle playback end
    this.audioSource.onended = () => {
      if (this.isPlaying) {
        // Only reset if we're not paused
        this.isPlaying = false;
        this.currentPosition = 0;
        document.getElementById("playButton").disabled = false;
        document.getElementById("pauseButton").disabled = true;
        document.getElementById("status").textContent = "Playback finished";
        document.getElementById("currentTime").textContent = this.formatTime(0);
      }
    };
  }

  pauseAudio() {
    if (this.audioSource && this.isPlaying) {
      // Calculate the current position
      const elapsedTime = this.audioContext.currentTime - this.audioStartTime;
      this.currentPosition += elapsedTime;

      // Stop the current audio source
      try {
        this.audioSource.stop();
      } catch (e) {
        console.log("Audio source already stopped");
      }

      // Disconnect and clean up
      this.audioSource.disconnect();
      this.audioSource = null;

      this.isPlaying = false;
      this.updateTimeDisplay();
    }
  }

  createSphere() {
    // Create points using Fibonacci Sphere Sampling
    const points = this.generateFibonacciSphere(this.numPoints);

    // Create geometry from points
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(points, 3)
    );

    // Store original positions for animation
    this.originalPositions = new Float32Array(points);

    // Basic material with current color
    const material = new THREE.PointsMaterial({
      color: this.sphereColor,
      size: 0.05,
      transparent: true,
      opacity: 0.8,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
    });

    // Create point cloud
    this.pointCloud = new THREE.Points(geometry, material);
    this.scene.add(this.pointCloud);
  }

  generateFibonacciSphere(numPoints) {
    const points = [];
    const phi = Math.PI * (3 - Math.sqrt(5)); // golden angle in radians

    for (let i = 0; i < numPoints; i++) {
      const y = 1 - (i / (numPoints - 1)) * 2; // y goes from 1 to -1
      const radius = Math.sqrt(1 - y * y); // radius at y

      const theta = phi * i; // golden angle increment

      const x = Math.cos(theta) * radius;
      const z = Math.sin(theta) * radius;

      // Scale to current radius
      points.push(
        x * this.sphereRadius,
        y * this.sphereRadius,
        z * this.sphereRadius
      );
    }

    return points;
  }

  onWindowResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  updateSphere() {
    this.analyser.getByteFrequencyData(this.dataArray);
    this.time += this.vibrationSpeed;

    const positions = this.pointCloud.geometry.attributes.position.array;

    for (let i = 0; i < positions.length; i += 3) {
      const index = Math.floor(i / 3) % this.dataArray.length;
      const audioValue = this.dataArray[index] / 255.0;

      // Get original position
      const x = this.originalPositions[i];
      const y = this.originalPositions[i + 1];
      const z = this.originalPositions[i + 2];

      // Calculate distance from center for more interesting displacement
      const distance = Math.sqrt(x * x + y * y + z * z);
      const normalizedDistance = distance / 5; // Normalize to 0-1 range

      // Add default vibration
      const vibration =
        Math.sin(this.time + distance * 2) * this.vibrationAmount;

      // Combine audio-reactive displacement with vibration
      const displacement =
        (audioValue * this.displacementMultiplier + vibration) *
        (1 + normalizedDistance);
      const scale = 1 + displacement;

      // Update point cloud positions
      positions[i] = x * scale;
      positions[i + 1] = y * scale;
      positions[i + 2] = z * scale;
    }

    this.pointCloud.geometry.attributes.position.needsUpdate = true;

    // Rotate sphere
    this.pointCloud.rotation.y += 0.001;
    this.pointCloud.rotation.x += 0.0005;
  }

  animate() {
    requestAnimationFrame(() => this.animate());
    this.updateSphere();
    this.updateOrbitingCircles();
    this.updateTimeDisplay();
    this.renderer.render(this.scene, this.camera);
  }

  // Add method to change displacement range
  setDisplacementRange(multiplier) {
    this.displacementMultiplier = multiplier;
  }

  // Add method to control vibration
  setVibration(amount, speed) {
    this.vibrationAmount = amount;
    this.vibrationSpeed = speed;
  }

  setupDisplacementControl() {
    const slider = document.getElementById("displacementRange");
    const valueDisplay = document.getElementById("displacementValue");

    slider.addEventListener("input", (e) => {
      const value = parseFloat(e.target.value);
      this.setDisplacementRange(value);
      valueDisplay.textContent = value.toFixed(1);
    });
  }

  setupSphereSizeControl() {
    const slider = document.getElementById("sphereSize");
    const valueDisplay = document.getElementById("sphereSizeValue");

    slider.addEventListener("input", (e) => {
      const value = parseFloat(e.target.value);
      this.setSphereSize(value);
      valueDisplay.textContent = value.toFixed(1);
    });
  }

  setSphereSize(radius) {
    this.sphereRadius = radius;

    // Remove old point cloud
    if (this.pointCloud) {
      this.scene.remove(this.pointCloud);
      this.pointCloud.geometry.dispose();
      this.pointCloud.material.dispose();
    }

    // Create new sphere with updated size
    this.createSphere();

    // Update all orbiting circles with the new radius
    this.orbitingCircles.forEach((circle) => {
      if (circle.geometry) {
        // Remove old circle
        this.scene.remove(circle);
        circle.geometry.dispose();
        circle.material.dispose();
      }
    });

    // Clear the array and recreate circles
    this.orbitingCircles = [];
    this.createOrbitingCircles();
  }

  setupColorControl() {
    const colorPicker = document.getElementById("sphereColor");

    colorPicker.addEventListener("input", (e) => {
      const color = e.target.value;
      this.setSphereColor(color);
    });
  }

  setSphereColor(color) {
    this.sphereColor = new THREE.Color(color).getHex();

    if (this.pointCloud && this.pointCloud.material) {
      this.pointCloud.material.color.setHex(this.sphereColor);
    }

    // Update all orbiting circles with the new color
    this.orbitingCircles.forEach((circle) => {
      if (circle.material) {
        circle.material.color.setHex(this.sphereColor);
        circle.material.emissive.setHex(this.sphereColor);
      }
    });
  }

  setupPointCountControl() {
    const slider = document.getElementById("pointCount");
    const valueDisplay = document.getElementById("pointCountValue");

    slider.addEventListener("input", (e) => {
      const value = parseInt(e.target.value);
      this.setPointCount(value);
      valueDisplay.textContent = value.toLocaleString();
    });
  }

  setPointCount(count) {
    this.numPoints = count;

    // Remove old point cloud
    if (this.pointCloud) {
      this.scene.remove(this.pointCloud);
      this.pointCloud.geometry.dispose();
      this.pointCloud.material.dispose();
    }

    // Create new sphere with updated point count
    this.createSphere();
  }

  setupRingCountControl() {
    const slider = document.getElementById("ringCount");
    const valueDisplay = document.getElementById("ringCountValue");

    slider.addEventListener("input", (e) => {
      const value = parseInt(e.target.value);
      this.setRingCount(value);
      valueDisplay.textContent = value;
    });
  }

  setRingCount(count) {
    // Remove existing rings
    this.orbitingCircles.forEach((circle) => {
      this.scene.remove(circle);
      circle.geometry.dispose();
      circle.material.dispose();
    });
    this.orbitingCircles = [];

    // Generate random configurations for each ring
    const circleConfigs = [];
    for (let i = 0; i < count; i++) {
      // Generate random properties
      const rotationSpeed =
        (Math.random() * 0.03 - 0.015) * (Math.random() > 0.5 ? 1 : -1); // Random between -0.015 and 0.015
      const tilt = Math.random() * Math.PI * 2; // Random angle between 0 and 2π
      const axisChangeSpeed = Math.random() * 0.02; // Random between 0 and 0.02
      const radiusOffset = -1 + (Math.random() * 0.4 - 0.2); // Random offset between -1.2 and -0.8
      const tubeWidth = 0.03 + Math.random() * 0.04; // Random width between 0.03 and 0.07

      circleConfigs.push({
        rotationSpeed,
        tilt,
        axisChangeSpeed,
        radiusOffset,
        tubeWidth,
      });
    }

    // Create the rings
    circleConfigs.forEach((config) => {
      const geometry = new THREE.TorusGeometry(
        this.sphereRadius + config.radiusOffset,
        config.tubeWidth,
        8,
        100
      );
      const material = new THREE.MeshPhongMaterial({
        color: this.sphereColor,
        transparent: true,
        opacity: 0.3,
        shininess: 50,
        emissive: this.sphereColor,
        emissiveIntensity: 0.3,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });

      const circle = new THREE.Mesh(geometry, material);

      circle.rotation.x = Math.PI / 2;
      circle.rotation.z = config.tilt;

      circle.userData = {
        rotationSpeed: config.rotationSpeed,
        tilt: config.tilt,
        axisChangeSpeed: config.axisChangeSpeed,
        time: Math.random() * 100, // Random starting time for more varied initial positions
        radiusOffset: config.radiusOffset,
        tubeWidth: config.tubeWidth,
      };

      this.orbitingCircles.push(circle);
      this.scene.add(circle);
    });
  }

  createOrbitingCircles() {
    // Initialize with default number of rings (8)
    this.setRingCount(8);
  }

  updateOrbitingCircles() {
    this.orbitingCircles.forEach((circle) => {
      // Update time for continuous axis changes
      circle.userData.time += circle.userData.axisChangeSpeed;

      // Calculate rotation based on time
      const xRotation =
        Math.sin(circle.userData.time) * circle.userData.rotationSpeed;
      const yRotation =
        Math.cos(circle.userData.time) * circle.userData.rotationSpeed;
      const zRotation =
        Math.sin(circle.userData.time * 0.5) * circle.userData.rotationSpeed;

      // Apply rotations
      circle.rotation.x += xRotation;
      circle.rotation.y += yRotation;
      circle.rotation.z += zRotation;

      // Calculate distance from center for more interesting displacement
      const distance = this.sphereRadius;
      const normalizedDistance = distance / 5; // Normalize to 0-1 range

      // Add default vibration
      const vibration =
        Math.sin(this.time + distance * 2) * this.vibrationAmount;

      // Make circles react to audio with the same displacement as the sphere
      if (this.dataArray) {
        // Find the minimum audio value for more stable rings
        const minValue = Math.min(...this.dataArray) / 255;

        // Calculate displacement using minimum value
        const displacement =
          (minValue * this.displacementMultiplier + vibration) *
          (1 + normalizedDistance);
        // Ensure minimum scale to keep rings outside sphere
        const scale = Math.max(1 + displacement, 0.8);

        // Apply the scale
        circle.scale.set(scale, scale, scale);

        // Update the ring's radius to match the sphere's current size plus offset
        if (circle.geometry) {
          const newRadius =
            (this.sphereRadius + circle.userData.radiusOffset) * scale;
          const newGeometry = new THREE.TorusGeometry(
            newRadius,
            circle.userData.tubeWidth,
            8,
            100
          );
          circle.geometry.dispose();
          circle.geometry = newGeometry;
        }
      } else {
        // Apply default vibration when no audio
        const scale = Math.max(1 + vibration, 0.8); // Ensure minimum scale
        circle.scale.set(scale, scale, scale);

        // Update the ring's radius with vibration plus offset
        if (circle.geometry) {
          const newRadius =
            (this.sphereRadius + circle.userData.radiusOffset) * scale;
          const newGeometry = new THREE.TorusGeometry(
            newRadius,
            circle.userData.tubeWidth,
            8,
            100
          );
          circle.geometry.dispose();
          circle.geometry = newGeometry;
        }
      }
    });
  }
}

// Initialize the visualizer when the page loads
window.addEventListener("load", () => {
  new AudioVisualizer();
});
