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

    // Animation properties
    this.animationProgress = 0;
    this.animationDuration = 5;
    this.isAnimating = true;
    this.animationStartTime = Date.now();
    this.startPositions = [];
    this.ringsAnimationProgress = 0;
    this.isRingsAnimating = false;
    this.ringsAnimationStartTime = null;

    // Get initial ring count from slider
    const ringCountSlider = document.getElementById("ringCount");
    this.initialRingCount = parseInt(ringCountSlider.value);

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
    this.numPoints = 20000; // Default number of points
    this.orbitingCircles = []; // Array to store orbiting circles

    // Add new properties for point brightness control
    this.pointSize = 0.15;
    this.pointBrightness = 1.0;
    this.edgeBrightness = 2.0;
    this.useEdgeEffect = true;

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
    this.setupPointBrightnessControl();

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
    const finalPositions = new Float32Array(points);

    // Create initial random positions around the screen
    this.startPositions = new Float32Array(points.length);
    const spread = 100;

    for (let i = 0; i < points.length; i += 3) {
      this.startPositions[i] = (Math.random() - 0.5) * spread;
      this.startPositions[i + 1] = (Math.random() - 0.5) * spread;
      this.startPositions[i + 2] = (Math.random() - 0.5) * spread;
    }

    // Create geometry from points
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(this.startPositions, 3)
    );

    // Store final positions for animation
    this.originalPositions = finalPositions;

    // Create custom shader material for better point control
    const material = new THREE.ShaderMaterial({
      uniforms: {
        color: { value: new THREE.Color(this.sphereColor) },
        pointSize: { value: this.pointSize },
        brightness: { value: this.pointBrightness },
        edgeBrightness: { value: this.edgeBrightness },
        useEdgeEffect: { value: this.useEdgeEffect ? 1.0 : 0.0 },
      },
      vertexShader: `
        uniform float pointSize;
        uniform float brightness;
        uniform float edgeBrightness;
        uniform float useEdgeEffect;
        
        varying float vDistance;
        
        void main() {
          vDistance = length(position);
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = pointSize * (300.0 / -mvPosition.z);
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: `
        uniform vec3 color;
        uniform float brightness;
        uniform float edgeBrightness;
        uniform float useEdgeEffect;
        
        varying float vDistance;
        
        void main() {
          float dist = length(gl_PointCoord - vec2(0.5));
          if (dist > 0.5) discard;
          
          float edgeFactor = 1.0;
          if (useEdgeEffect > 0.5) {
            float edgeIntensity = 1.0 - smoothstep(0.0, 0.5, dist);
            edgeFactor = 1.0 + (edgeBrightness - 1.0) * pow(edgeIntensity, 0.5);
          }
          
          float finalBrightness = brightness * edgeFactor;
          gl_FragColor = vec4(color * finalBrightness, 1.0);
        }
      `,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
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

    // Handle initial sphere animation
    if (this.isAnimating) {
      const currentTime = Date.now();
      const elapsedTime = (currentTime - this.animationStartTime) / 1000;
      this.animationProgress = Math.min(
        elapsedTime / this.animationDuration,
        1
      );

      if (this.pointCloud) {
        const positions = this.pointCloud.geometry.attributes.position.array;

        // Animate each point from its start position to its final position
        for (let i = 0; i < positions.length; i += 3) {
          const t = 1 - Math.pow(1 - this.animationProgress, 2);

          positions[i] =
            this.startPositions[i] +
            (this.originalPositions[i] - this.startPositions[i]) * t;
          positions[i + 1] =
            this.startPositions[i + 1] +
            (this.originalPositions[i + 1] - this.startPositions[i + 1]) * t;
          positions[i + 2] =
            this.startPositions[i + 2] +
            (this.originalPositions[i + 2] - this.startPositions[i + 2]) * t;
        }

        this.pointCloud.geometry.attributes.position.needsUpdate = true;

        // Animate opacity with a delay
        if (this.pointCloud.material) {
          const opacityProgress = Math.max(
            0,
            (this.animationProgress - 0.2) / 0.8
          );
          this.pointCloud.material.opacity = opacityProgress * 0.8;
        }

        // Add some rotation during animation
        this.pointCloud.rotation.y = this.animationProgress * Math.PI * 2;
      }

      if (this.animationProgress >= 1) {
        this.isAnimating = false;
        this.isRingsAnimating = true;
        this.ringsAnimationStartTime = Date.now();

        // Start ring animations
        this.orbitingCircles.forEach((circle) => {
          circle.userData.isAnimating = true;
          circle.userData.animationStartTime = Date.now();
        });
      }
    } else {
      this.updateSphere();
    }

    // Handle rings animation
    if (this.isRingsAnimating) {
      const currentTime = Date.now();
      const elapsedTime = (currentTime - this.ringsAnimationStartTime) / 1000;
      this.ringsAnimationProgress = Math.min(elapsedTime / 2, 1); // 2 seconds for rings animation

      this.orbitingCircles.forEach((circle, index) => {
        // Stagger the animation of each ring
        const ringProgress = Math.max(
          0,
          (this.ringsAnimationProgress - index * 0.02) / 0.8
        );

        // Scale up
        const scale = ringProgress;
        circle.scale.set(scale, scale, scale);

        // Fade in
        if (circle.material) {
          circle.material.opacity = ringProgress * 0.3;
        }
      });

      if (this.ringsAnimationProgress >= 1) {
        this.isRingsAnimating = false;
      }
    }

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

    // Store current states before recreating
    const currentPositions = this.pointCloud
      ? this.pointCloud.geometry.attributes.position.array.slice()
      : null;
    const currentOpacity = this.pointCloud
      ? this.pointCloud.material.opacity
      : 0;
    const currentColor = this.pointCloud
      ? this.pointCloud.material.color.getHex()
      : this.sphereColor;

    // Store ring states
    const ringStates = this.orbitingCircles.map((circle) => ({
      opacity: circle.material.opacity,
      scale: circle.scale.x,
      rotation: {
        x: circle.rotation.x,
        y: circle.rotation.y,
        z: circle.rotation.z,
      },
      userData: { ...circle.userData },
    }));

    // Remove old point cloud
    if (this.pointCloud) {
      this.scene.remove(this.pointCloud);
      this.pointCloud.geometry.dispose();
      this.pointCloud.material.dispose();
    }

    // Create new sphere with updated size
    this.createSphere();

    // Restore sphere states if we were already animated
    if (currentPositions && !this.isAnimating) {
      const newPositions = this.pointCloud.geometry.attributes.position.array;
      const copyLength = Math.min(currentPositions.length, newPositions.length);

      for (let i = 0; i < copyLength; i++) {
        newPositions[i] = currentPositions[i];
      }

      this.pointCloud.geometry.attributes.position.needsUpdate = true;
      this.pointCloud.material.opacity = currentOpacity;
      this.pointCloud.material.color.setHex(currentColor);
    }

    // Update existing rings instead of recreating them
    this.orbitingCircles.forEach((circle, index) => {
      if (circle.geometry) {
        // Store current state
        const currentOpacity = circle.material.opacity;
        const currentScale = circle.scale.x;
        const currentRotation = {
          x: circle.rotation.x,
          y: circle.rotation.y,
          z: circle.rotation.z,
        };
        const config = circle.userData;

        // Remove old geometry
        circle.geometry.dispose();

        // Create new geometry with updated radius
        const newGeometry = new THREE.TorusGeometry(
          this.sphereRadius + config.radiusOffset,
          config.tubeWidth,
          8,
          100
        );

        // Update the circle with new geometry
        circle.geometry = newGeometry;

        // Restore state
        circle.material.opacity = currentOpacity;
        circle.scale.set(currentScale, currentScale, currentScale);
        circle.rotation.set(
          currentRotation.x,
          currentRotation.y,
          currentRotation.z
        );
      }
    });
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
      this.pointCloud.material.uniforms.color.value.setHex(this.sphereColor);
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

    // Store current states before recreating
    const currentPositions = this.pointCloud
      ? this.pointCloud.geometry.attributes.position.array.slice()
      : null;
    const currentOpacity = this.pointCloud
      ? this.pointCloud.material.opacity
      : 0;
    const currentColor = this.pointCloud
      ? this.pointCloud.material.color.getHex()
      : this.sphereColor;

    // Remove old point cloud
    if (this.pointCloud) {
      this.scene.remove(this.pointCloud);
      this.pointCloud.geometry.dispose();
      this.pointCloud.material.dispose();
    }

    // Create new sphere with updated point count
    this.createSphere();

    // Restore states if we were already animated
    if (currentPositions && !this.isAnimating) {
      // Only copy positions if the new sphere has enough space
      const newPositions = this.pointCloud.geometry.attributes.position.array;
      const copyLength = Math.min(currentPositions.length, newPositions.length);

      // Copy positions safely
      for (let i = 0; i < copyLength; i++) {
        newPositions[i] = currentPositions[i];
      }

      this.pointCloud.geometry.attributes.position.needsUpdate = true;
      this.pointCloud.material.opacity = currentOpacity;
      this.pointCloud.material.color.setHex(currentColor);
    }
  }

  setupRingCountControl() {
    const slider = document.getElementById("ringCount");
    const valueDisplay = document.getElementById("ringCountValue");

    slider.addEventListener("input", (e) => {
      const value = parseInt(e.target.value);
      // Only allow ring count changes after initial animation
      if (!this.isAnimating) {
        this.setRingCount(value);
        valueDisplay.textContent = value;
      }
    });
  }

  setRingCount(count, isInitialCreation = false) {
    const currentCount = this.orbitingCircles.length;

    if (count === currentCount) {
      return; // No change needed
    }

    if (count < currentCount) {
      // Remove excess rings
      for (let i = currentCount - 1; i >= count; i--) {
        const circle = this.orbitingCircles[i];
        this.scene.remove(circle);
        circle.geometry.dispose();
        circle.material.dispose();
        this.orbitingCircles.pop();
      }
    } else {
      // Add new rings
      for (let i = currentCount; i < count; i++) {
        const rotationSpeed =
          (Math.random() * 0.03 - 0.015) * (Math.random() > 0.5 ? 1 : -1);
        const tilt = Math.random() * Math.PI * 2;
        const axisChangeSpeed = Math.random() * 0.02;
        const radiusOffset = -1 + (Math.random() * 0.4 - 0.2);
        const tubeWidth = 0.03 + Math.random() * 0.04;

        const geometry = new THREE.TorusGeometry(
          this.sphereRadius + radiusOffset,
          tubeWidth,
          8,
          100
        );

        const material = new THREE.MeshPhongMaterial({
          color: this.sphereColor,
          transparent: true,
          opacity: 0,
          shininess: 50,
          emissive: this.sphereColor,
          emissiveIntensity: 0.3,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        });

        const circle = new THREE.Mesh(geometry, material);

        // Always start with 0 scale
        circle.scale.set(0, 0, 0);

        // Set initial rotation
        circle.rotation.x = Math.PI / 2;
        circle.rotation.z = tilt;

        circle.userData = {
          rotationSpeed,
          tilt,
          axisChangeSpeed,
          time: Math.random() * 100,
          radiusOffset,
          tubeWidth,
          isAnimating: !isInitialCreation,
          animationStartTime: isInitialCreation ? null : Date.now(),
        };

        this.orbitingCircles.push(circle);
        this.scene.add(circle);
      }
    }
  }

  createOrbitingCircles() {
    // Initialize with the current ring count from the slider
    const ringCountSlider = document.getElementById("ringCount");
    const currentRingCount = parseInt(ringCountSlider.value);
    this.setRingCount(currentRingCount, true); // Pass true to indicate initial creation
  }

  updateOrbitingCircles() {
    this.orbitingCircles.forEach((circle) => {
      // Handle ring animation
      if (circle.userData.isAnimating && circle.userData.animationStartTime) {
        const elapsed =
          (Date.now() - circle.userData.animationStartTime) / 1000;
        const progress = Math.min(elapsed / 0.5, 1); // 0.5 second animation

        if (progress < 1) {
          // Scale up
          const scale = progress;
          circle.scale.set(scale, scale, scale);

          // Fade in
          circle.material.opacity = progress * 0.3;
        } else {
          // Animation complete
          circle.scale.set(1, 1, 1);
          circle.material.opacity = 0.3;
          circle.userData.isAnimating = false;
        }
      }

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

  setupPointBrightnessControl() {
    const brightnessSlider = document.getElementById("pointBrightness");
    const edgeBrightnessSlider = document.getElementById("edgeBrightness");
    const edgeEffectToggle = document.getElementById("edgeEffect");

    // Set initial values
    brightnessSlider.value = this.pointBrightness;
    edgeBrightnessSlider.value = this.edgeBrightness;
    edgeEffectToggle.checked = this.useEdgeEffect;
    document.getElementById("pointBrightnessValue").textContent =
      this.pointBrightness.toFixed(1);
    document.getElementById("edgeBrightnessValue").textContent =
      this.edgeBrightness.toFixed(1);

    brightnessSlider.addEventListener("input", (e) => {
      const value = parseFloat(e.target.value);
      this.setPointBrightness(value);
      document.getElementById("pointBrightnessValue").textContent =
        value.toFixed(1);
    });

    edgeBrightnessSlider.addEventListener("input", (e) => {
      const value = parseFloat(e.target.value);
      this.setEdgeBrightness(value);
      document.getElementById("edgeBrightnessValue").textContent =
        value.toFixed(1);
    });

    edgeEffectToggle.addEventListener("change", (e) => {
      this.setEdgeEffect(e.target.checked);
    });
  }

  setPointBrightness(value) {
    this.pointBrightness = value;
    if (this.pointCloud && this.pointCloud.material) {
      this.pointCloud.material.uniforms.brightness.value = value;
    }
  }

  setEdgeBrightness(value) {
    this.edgeBrightness = value;
    if (this.pointCloud && this.pointCloud.material) {
      this.pointCloud.material.uniforms.edgeBrightness.value = value;
    }
  }

  setEdgeEffect(enabled) {
    this.useEdgeEffect = enabled;
    if (this.pointCloud && this.pointCloud.material) {
      this.pointCloud.material.uniforms.useEdgeEffect.value = enabled
        ? 1.0
        : 0.0;
    }
  }
}

// Initialize the visualizer when the page loads
window.addEventListener("load", async () => {
  const visualizer = new AudioVisualizer();

  // Load default audio file
  try {
    const response = await fetch(
      "Cartoon, Jéja - On & On (feat. Daniel Levi) - Electronic Pop - NCS - Copyright Free Music.mp3"
    );
    const arrayBuffer = await response.arrayBuffer();
    visualizer.audioBuffer = await visualizer.audioContext.decodeAudioData(
      arrayBuffer
    );
    visualizer.totalDuration = visualizer.audioBuffer.duration;
    visualizer.currentPosition = 0;
    document.getElementById("totalTime").textContent = visualizer.formatTime(
      visualizer.totalDuration
    );
    document.getElementById("currentTime").textContent =
      visualizer.formatTime(0);
    document.getElementById("playButton").disabled = false;
    document.getElementById("status").textContent = "Default audio loaded";
  } catch (error) {
    console.error("Error loading default audio file:", error);
    document.getElementById("status").textContent =
      "Error loading default audio file";
  }
});
