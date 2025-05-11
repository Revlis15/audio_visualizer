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
    this.animationDuration = 3; // Default duration in seconds
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

    // Add new properties for ring controls
    this.ringSpeed = 0.015;
    this.ringTilt = 0;
    this.ringSize = 0.03;
    this.ringOffset = -1;
    this.ringBrightness = 1.0;
    this.ringOpacity = 0.3;
    this.ringColor = 0xffffff; // Add ring color property

    // Add inner sphere properties
    this.innerSphereRadius = 2.0;
    this.innerSphereColor = 0xffffff;
    this.innerSphereOpacity = 0.5;
    this.innerSphereDisplacement = 1.0;
    this.innerSphereBrightness = 1.0; // Add brightness property
    this.innerSphere = null;

    // Create initial sphere
    this.createSphere();
    this.createInnerSphere();

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
    this.setupInnerSphereControls();
    this.setupColorControl();
    this.setupPointCountControl();
    this.setupRingCountControl();
    this.setupRingControls();
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

      // Set up language detection and switching
      this.currentLanguage = "en-US"; // Default language
      this.recognition.lang = this.currentLanguage;

      // Add language toggle button to the UI
      const micToggle = document.getElementById("micToggle");
      const languageToggle = document.createElement("button");
      languageToggle.className = "button language-toggle";
      languageToggle.textContent = "Switch to Vietnamese";
      languageToggle.style.marginLeft = "10px";
      micToggle.parentNode.insertBefore(languageToggle, micToggle.nextSibling);

      languageToggle.addEventListener("click", () => {
        if (this.currentLanguage === "en-US") {
          this.currentLanguage = "vi-VN";
          this.recognition.lang = "vi-VN";
          languageToggle.textContent = "Switch to English";
        } else {
          this.currentLanguage = "en-US";
          this.recognition.lang = "en-US";
          languageToggle.textContent = "Switch to Vietnamese";
        }

        // If recognition is active, restart it with new language
        if (this.isRecognizing) {
          this.recognition.stop();
          setTimeout(() => {
            this.recognition.start();
          }, 100);
        }
      });

      this.recognition.onstart = () => {
        this.isRecognizing = true;
        document.getElementById(
          "micStatus"
        ).textContent = `Microphone & Speech: On (${
          this.currentLanguage === "en-US" ? "English" : "Vietnamese"
        })`;
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

    // Add animation duration control
    const durationSlider = document.getElementById("animationDuration");
    const durationValue = document.getElementById("animationDurationValue");

    durationSlider.addEventListener("input", (e) => {
      const value = parseFloat(e.target.value);
      this.setAnimationDuration(value);
      durationValue.textContent = value.toFixed(1) + "s";
    });

    // Add replay animation button
    const replayButton = document.getElementById("replayAnimation");
    replayButton.addEventListener("click", () => this.replayAnimation());

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

          // Disconnect any existing connections
          if (this.audioGainNode) {
            this.audioGainNode.disconnect();
          }

          // Create new gain node
          this.audioGainNode = this.audioContext.createGain();
          this.audioGainNode.gain.value = 1.0; // Adjust microphone volume if needed

          // Connect the audio graph
          source.connect(this.analyser);
          this.analyser.connect(this.audioGainNode);
          this.audioGainNode.connect(this.audioContext.destination);

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
    if (this.audioGainNode) {
      this.audioGainNode.disconnect();
    }

    // Reset audio analyzer
    this.analyser.disconnect();
    this.analyser.connect(this.audioContext.destination);

    // Reset visualization to default state
    this.resetVisualization();

    this.isUsingMic = false;
    this.isRecognizing = false;
    document.getElementById("speechBox").classList.remove("listening");
  }

  resetVisualization() {
    // Reset sphere to default state
    if (this.pointCloud) {
      const positions = this.pointCloud.geometry.attributes.position.array;
      for (let i = 0; i < positions.length; i += 3) {
        positions[i] = this.originalPositions[i];
        positions[i + 1] = this.originalPositions[i + 1];
        positions[i + 2] = this.originalPositions[i + 2];
      }
      this.pointCloud.geometry.attributes.position.needsUpdate = true;
    }

    // Reset inner sphere to default state
    if (this.innerSphere) {
      this.innerSphere.scale.set(1, 1, 1);
    }

    // Reset rings to default state
    this.orbitingCircles.forEach((circle) => {
      if (!circle.userData.isAnimating) {
        circle.scale.set(1, 1, 1);
        if (circle.geometry) {
          const newRadius = this.sphereRadius + circle.userData.radiusOffset;
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
    // Only process audio data if we have an active source
    if (this.isUsingMic || this.isPlaying) {
      this.analyser.getByteFrequencyData(this.dataArray);
    } else {
      // Fill with zeros when no audio source
      this.dataArray.fill(0);
    }

    this.time += this.vibrationSpeed;

    // Update main sphere
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

    // Update inner sphere with enhanced audio reactivity
    if (this.innerSphere) {
      // Get frequency bands for different parts of the audio spectrum
      const bassFreq =
        this.dataArray.slice(0, 10).reduce((a, b) => a + b, 0) / 2550; // Bass frequencies
      const midFreq =
        this.dataArray.slice(10, 50).reduce((a, b) => a + b, 0) / 10200; // Mid frequencies
      const highFreq =
        this.dataArray.slice(50).reduce((a, b) => a + b, 0) / 51000; // High frequencies

      // Combine frequencies with different weights
      const avgValue = (bassFreq * 1.5 + midFreq + highFreq * 0.5) / 3;
      const vibration = Math.sin(this.time) * this.vibrationAmount;

      // Enhanced displacement calculation
      const displacement =
        avgValue * this.innerSphereDisplacement * 1.5 + vibration;
      const scale = 1 + displacement;

      // Apply scale with smooth transitions
      this.innerSphere.scale.lerp(new THREE.Vector3(scale, scale, scale), 0.1);
    }

    // Update rings with enhanced audio reactivity
    this.orbitingCircles.forEach((circle, index) => {
      if (!circle.userData.isAnimating) {
        // Get frequency bands for different parts of the audio spectrum
        const bassFreq =
          this.dataArray.slice(0, 10).reduce((a, b) => a + b, 0) / 2550;
        const midFreq =
          this.dataArray.slice(10, 50).reduce((a, b) => a + b, 0) / 10200;
        const highFreq =
          this.dataArray.slice(50).reduce((a, b) => a + b, 0) / 51000;

        // Use different frequency bands for different rings
        let audioValue;
        if (index % 3 === 0) {
          audioValue = bassFreq * 1.5; // Bass rings
        } else if (index % 3 === 1) {
          audioValue = midFreq; // Mid rings
        } else {
          audioValue = highFreq * 0.8; // High rings
        }

        // Add unique vibration pattern for each ring
        const vibration =
          Math.sin(this.time + circle.userData.time * 2) * this.vibrationAmount;

        // Enhanced displacement calculation
        const displacement =
          audioValue * this.displacementMultiplier * 1.2 + vibration;
        const scale = Math.max(1 + displacement, 0.8);

        // Apply scale with smooth transitions
        circle.scale.lerp(new THREE.Vector3(scale, scale, scale), 0.1);

        // Update the ring's radius
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

    // Rotate sphere
    this.pointCloud.rotation.y += 0.001;
    this.pointCloud.rotation.x += 0.0005;

    // Rotate inner sphere in opposite direction
    if (this.innerSphere) {
      this.innerSphere.rotation.y -= 0.002;
      this.innerSphere.rotation.x -= 0.001;
    }
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

      // Animate each element
      if (this.innerSphere) {
        const scale = this.animationProgress;
        this.innerSphere.scale.set(scale, scale, scale);
        this.innerSphere.material.opacity = scale * this.innerSphereOpacity;
        this.innerSphere.rotation.y = -scale * Math.PI * 2;
        this.innerSphere.rotation.x = -scale * Math.PI;
      }

      this.orbitingCircles.forEach((circle) => {
        if (circle.userData.isAnimating && circle.userData.animationStartTime) {
          if (this.animationProgress < 1) {
            // Shrink from outside window
            const scale = 10 - this.animationProgress * 9;
            circle.scale.set(scale, scale, scale);
            // Fade in as it gets closer to final size
            const fadeStart = 0.7;
            const fadeProgress = Math.max(
              0,
              (this.animationProgress - fadeStart) / (1 - fadeStart)
            );
            circle.material.opacity =
              fadeProgress * circle.userData.targetOpacity;
          } else {
            circle.scale.set(1, 1, 1);
            circle.material.opacity = circle.userData.targetOpacity;
            circle.userData.isAnimating = false;
          }
        }
      });

      if (this.pointCloud) {
        if (this.animationProgress > 0) {
          this.pointCloud.visible = true;
          const positions = this.pointCloud.geometry.attributes.position.array;
          for (let j = 0; j < positions.length; j += 3) {
            const t = 1 - Math.pow(1 - this.animationProgress, 2);
            positions[j] =
              this.startPositions[j] +
              (this.originalPositions[j] - this.startPositions[j]) * t;
            positions[j + 1] =
              this.startPositions[j + 1] +
              (this.originalPositions[j + 1] - this.startPositions[j + 1]) * t;
            positions[j + 2] =
              this.startPositions[j + 2] +
              (this.originalPositions[j + 2] - this.startPositions[j + 2]) * t;
          }
          if (this.pointCloud.material) {
            const opacityProgress = Math.max(
              0,
              (this.animationProgress - 0.2) / 0.8
            );
            this.pointCloud.material.opacity = opacityProgress * 0.8;
          }
          this.pointCloud.rotation.y = this.animationProgress * Math.PI * 2;
        } else {
          this.pointCloud.visible = false;
          this.pointCloud.material.opacity = 0;
        }
        this.pointCloud.geometry.attributes.position.needsUpdate = true;
      }

      if (this.animationProgress >= 1) {
        this.isAnimating = false;
        this.isRingsAnimating = false;
        // Immediately update to audio-reactive state
        if (this.pointCloud && this.originalPositions) {
          const positions = this.pointCloud.geometry.attributes.position.array;
          for (let i = 0; i < positions.length; i++) {
            positions[i] = this.originalPositions[i];
          }
          this.pointCloud.geometry.attributes.position.needsUpdate = true;
          this.pointCloud.visible = true;
          if (this.pointCloud.material) {
            this.pointCloud.material.opacity = 0.8;
          }
        }
        this.updateSphere();
      }
    } else {
      this.updateSphere();
    }

    this.updateOrbitingCircles();
    this.updateTimeDisplay();
    this.renderer.render(this.scene, this.camera);
  }

  updateOrbitingCircles() {
    this.orbitingCircles.forEach((circle) => {
      // Only update rotations and audio reactivity if not animating
      if (!circle.userData.isAnimating) {
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
        const normalizedDistance = distance / 5;

        // Add default vibration
        const vibration =
          Math.sin(this.time + distance * 2) * this.vibrationAmount;

        // Make circles react to audio with the same displacement as the sphere
        if (this.dataArray) {
          const minValue = Math.min(...this.dataArray) / 255;
          const displacement =
            (minValue * this.displacementMultiplier + vibration) *
            (1 + normalizedDistance);
          const scale = Math.max(1 + displacement, 0.8);
          circle.scale.set(scale, scale, scale);

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
          const scale = Math.max(1 + vibration, 0.8);
          circle.scale.set(scale, scale, scale);

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
      }
    });
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
      ? this.pointCloud.material.uniforms.color.value.getHex()
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

    // Generate new points with updated radius
    const points = this.generateFibonacciSphere(this.numPoints);
    this.originalPositions = new Float32Array(points);

    // Create new geometry from points
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(this.originalPositions, 3)
    );

    // Create new material
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

    // Create new point cloud
    this.pointCloud = new THREE.Points(geometry, material);
    this.scene.add(this.pointCloud);

    // Restore sphere states if we were already animated
    if (currentPositions && !this.isAnimating) {
      const newPositions = this.pointCloud.geometry.attributes.position.array;
      const copyLength = Math.min(currentPositions.length, newPositions.length);

      for (let i = 0; i < copyLength; i++) {
        newPositions[i] = currentPositions[i];
      }

      this.pointCloud.geometry.attributes.position.needsUpdate = true;
      this.pointCloud.material.uniforms.color.value.setHex(currentColor);
    }

    // Update rings with new radius
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
    const currentColor = this.pointCloud
      ? this.pointCloud.material.uniforms.color.value.getHex()
      : this.sphereColor;
    const currentOpacity = this.pointCloud
      ? this.pointCloud.material.opacity
      : 0;

    // Remove old point cloud
    if (this.pointCloud) {
      this.scene.remove(this.pointCloud);
      this.pointCloud.geometry.dispose();
      this.pointCloud.material.dispose();
    }

    // Generate new points with updated count
    const points = this.generateFibonacciSphere(this.numPoints);
    this.originalPositions = new Float32Array(points);

    // Create new geometry from points
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(this.originalPositions, 3)
    );

    // Create new material
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

    // Create new point cloud
    this.pointCloud = new THREE.Points(geometry, material);
    this.scene.add(this.pointCloud);

    // Restore states if we were already animated
    if (!this.isAnimating) {
      this.pointCloud.material.uniforms.color.value.setHex(currentColor);
    }

    // Update the start positions for animation if needed
    if (this.isAnimating) {
      this.startPositions = new Float32Array(points.length);
      const spread = 100;
      for (let i = 0; i < points.length; i += 3) {
        this.startPositions[i] = (Math.random() - 0.5) * spread;
        this.startPositions[i + 1] = (Math.random() - 0.5) * spread;
        this.startPositions[i + 2] = (Math.random() - 0.5) * spread;
      }
    }
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
          color: this.ringColor,
          transparent: true,
          opacity: isInitialCreation ? 0 : this.ringOpacity,
          shininess: 50,
          emissive: this.ringColor,
          emissiveIntensity: this.ringBrightness * 0.3,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        });

        const circle = new THREE.Mesh(geometry, material);

        // Set initial scale based on whether it's initial creation or not
        const initialScale = isInitialCreation ? 10 : 1;
        circle.scale.set(initialScale, initialScale, initialScale);

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
          isAnimating: isInitialCreation,
          animationStartTime: Date.now(),
          targetOpacity: this.ringOpacity,
          targetScale: 1,
          initialScale: initialScale,
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

  setupRingControls() {
    const speedSlider = document.getElementById("ringSpeed");
    const tiltSlider = document.getElementById("ringTilt");
    const sizeSlider = document.getElementById("ringSize");
    const offsetSlider = document.getElementById("ringOffset");
    const brightnessSlider = document.getElementById("ringBrightness");
    const opacitySlider = document.getElementById("ringOpacity");
    const colorPicker = document.getElementById("ringColor");

    // Set initial values
    speedSlider.value = this.ringSpeed;
    tiltSlider.value = this.ringTilt;
    sizeSlider.value = this.ringSize;
    offsetSlider.value = this.ringOffset;
    brightnessSlider.value = this.ringBrightness;
    opacitySlider.value = this.ringOpacity;
    colorPicker.value = "#" + this.ringColor.toString(16).padStart(6, "0");

    speedSlider.addEventListener("input", (e) => {
      const value = parseFloat(e.target.value);
      this.setRingSpeed(value);
      document.getElementById("ringSpeedValue").textContent = value.toFixed(3);
    });

    tiltSlider.addEventListener("input", (e) => {
      const value = parseInt(e.target.value);
      this.setRingTilt(value);
      document.getElementById("ringTiltValue").textContent = `${value}°`;
    });

    sizeSlider.addEventListener("input", (e) => {
      const value = parseFloat(e.target.value);
      this.setRingSize(value);
      document.getElementById("ringSizeValue").textContent = value.toFixed(3);
    });

    offsetSlider.addEventListener("input", (e) => {
      const value = parseFloat(e.target.value);
      this.setRingOffset(value);
      document.getElementById("ringOffsetValue").textContent = value.toFixed(1);
    });

    brightnessSlider.addEventListener("input", (e) => {
      const value = parseFloat(e.target.value);
      this.setRingBrightness(value);
      document.getElementById("ringBrightnessValue").textContent =
        value.toFixed(1);
    });

    opacitySlider.addEventListener("input", (e) => {
      const value = parseFloat(e.target.value);
      this.setRingOpacity(value);
      document.getElementById("ringOpacityValue").textContent =
        value.toFixed(2);
    });

    colorPicker.addEventListener("input", (e) => {
      const color = e.target.value;
      this.setRingColor(color);
    });
  }

  setRingSpeed(speed) {
    this.ringSpeed = speed;
    this.orbitingCircles.forEach((circle) => {
      circle.userData.rotationSpeed = speed * (Math.random() > 0.5 ? 1 : -1);
    });
  }

  setRingTilt(tilt) {
    this.ringTilt = tilt;
    const tiltRadians = (tilt * Math.PI) / 180;
    this.orbitingCircles.forEach((circle) => {
      circle.rotation.z = tiltRadians;
    });
  }

  setRingSize(size) {
    this.ringSize = size;
    this.orbitingCircles.forEach((circle, index) => {
      circle.userData.tubeWidth = size;
      const newGeometry = new THREE.TorusGeometry(
        this.sphereRadius + circle.userData.radiusOffset,
        size,
        8,
        100
      );
      circle.geometry.dispose();
      circle.geometry = newGeometry;
    });
  }

  setRingOffset(offset) {
    this.ringOffset = offset;
    this.orbitingCircles.forEach((circle, index) => {
      circle.userData.radiusOffset = offset;
      const newGeometry = new THREE.TorusGeometry(
        this.sphereRadius + offset,
        circle.userData.tubeWidth,
        8,
        100
      );
      circle.geometry.dispose();
      circle.geometry = newGeometry;
    });
  }

  setRingBrightness(brightness) {
    this.ringBrightness = brightness;
    this.orbitingCircles.forEach((circle) => {
      if (circle.material) {
        circle.material.emissiveIntensity = brightness * 0.3;
        circle.material.color.setRGB(
          (brightness * ((this.sphereColor >> 16) & 255)) / 255,
          (brightness * ((this.sphereColor >> 8) & 255)) / 255,
          (brightness * (this.sphereColor & 255)) / 255
        );
      }
    });
  }

  setRingOpacity(opacity) {
    this.ringOpacity = opacity;
    this.orbitingCircles.forEach((circle) => {
      if (circle.material) {
        circle.userData.targetOpacity = opacity;
        // Only update current opacity if not animating
        if (!circle.userData.isAnimating) {
          circle.material.opacity = opacity;
        }
      }
    });
  }

  setRingColor(color) {
    this.ringColor = new THREE.Color(color).getHex();
    this.orbitingCircles.forEach((circle) => {
      if (circle.material) {
        circle.material.color.setHex(this.ringColor);
        circle.material.emissive.setHex(this.ringColor);
      }
    });
  }

  createInnerSphere() {
    const geometry = new THREE.SphereGeometry(this.innerSphereRadius, 32, 32);
    const material = new THREE.MeshPhongMaterial({
      color: this.innerSphereColor,
      transparent: true,
      opacity: 0, // Start with 0 opacity
      shininess: 50,
      emissive: this.innerSphereColor,
      emissiveIntensity: this.innerSphereBrightness * 0.3,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    this.innerSphere = new THREE.Mesh(geometry, material);
    this.innerSphere.scale.set(0, 0, 0); // Start with 0 scale
    this.scene.add(this.innerSphere);
  }

  setupInnerSphereControls() {
    const sizeSlider = document.getElementById("innerSphereSize");
    const colorPicker = document.getElementById("innerSphereColor");
    const opacitySlider = document.getElementById("innerSphereOpacity");
    const brightnessSlider = document.getElementById("innerSphereBrightness");
    const displacementSlider = document.getElementById(
      "innerSphereDisplacement"
    );

    // Set initial values
    sizeSlider.value = this.innerSphereRadius;
    colorPicker.value =
      "#" + this.innerSphereColor.toString(16).padStart(6, "0");
    opacitySlider.value = this.innerSphereOpacity;
    brightnessSlider.value = this.innerSphereBrightness;
    displacementSlider.value = this.innerSphereDisplacement;

    sizeSlider.addEventListener("input", (e) => {
      const value = parseFloat(e.target.value);
      this.setInnerSphereSize(value);
      document.getElementById("innerSphereSizeValue").textContent =
        value.toFixed(1);
    });

    colorPicker.addEventListener("input", (e) => {
      const color = e.target.value;
      this.setInnerSphereColor(color);
    });

    opacitySlider.addEventListener("input", (e) => {
      const value = parseFloat(e.target.value);
      this.setInnerSphereOpacity(value);
      document.getElementById("innerSphereOpacityValue").textContent =
        value.toFixed(2);
    });

    brightnessSlider.addEventListener("input", (e) => {
      const value = parseFloat(e.target.value);
      this.setInnerSphereBrightness(value);
      document.getElementById("innerSphereBrightnessValue").textContent =
        value.toFixed(1);
    });

    displacementSlider.addEventListener("input", (e) => {
      const value = parseFloat(e.target.value);
      this.setInnerSphereDisplacement(value);
      document.getElementById("innerSphereDisplacementValue").textContent =
        value.toFixed(1);
    });
  }

  setInnerSphereSize(radius) {
    this.innerSphereRadius = radius;
    if (this.innerSphere) {
      const newGeometry = new THREE.SphereGeometry(radius, 32, 32);
      this.innerSphere.geometry.dispose();
      this.innerSphere.geometry = newGeometry;
    }
  }

  setInnerSphereColor(color) {
    this.innerSphereColor = new THREE.Color(color).getHex();
    if (this.innerSphere && this.innerSphere.material) {
      this.innerSphere.material.color.setHex(this.innerSphereColor);
      this.innerSphere.material.emissive.setHex(this.innerSphereColor);
    }
  }

  setInnerSphereOpacity(opacity) {
    this.innerSphereOpacity = opacity;
    if (this.innerSphere && this.innerSphere.material) {
      this.innerSphere.material.opacity = opacity;
    }
  }

  setInnerSphereDisplacement(displacement) {
    this.innerSphereDisplacement = displacement;
  }

  setInnerSphereBrightness(brightness) {
    this.innerSphereBrightness = brightness;
    if (this.innerSphere && this.innerSphere.material) {
      this.innerSphere.material.emissiveIntensity = brightness * 0.3;
    }
  }

  setAnimationDuration(duration) {
    this.animationDuration = duration;
  }

  replayAnimation() {
    // Reset animation state
    this.isAnimating = true;
    this.animationProgress = 0;
    this.animationStartTime = Date.now();
    this.isRingsAnimating = false;

    // Reset point cloud positions to new random start positions
    if (this.pointCloud && this.originalPositions) {
      const positions = this.pointCloud.geometry.attributes.position.array;
      const spread = 100;
      this.startPositions = new Float32Array(this.originalPositions.length);
      for (let i = 0; i < this.originalPositions.length; i += 3) {
        this.startPositions[i] = (Math.random() - 0.5) * spread;
        this.startPositions[i + 1] = (Math.random() - 0.5) * spread;
        this.startPositions[i + 2] = (Math.random() - 0.5) * spread;
        positions[i] = this.startPositions[i];
        positions[i + 1] = this.startPositions[i + 1];
        positions[i + 2] = this.startPositions[i + 2];
      }
      this.pointCloud.geometry.attributes.position.needsUpdate = true;
      this.pointCloud.material.opacity = 0;
      this.pointCloud.visible = false;
    }

    // Reset inner sphere
    if (this.innerSphere) {
      this.innerSphere.scale.set(0, 0, 0);
      this.innerSphere.material.opacity = 0;
      this.innerSphere.visible = true;
    }

    // Reset rings animation
    this.orbitingCircles.forEach((circle) => {
      circle.userData.isAnimating = true;
      circle.userData.animationStartTime = Date.now();
      circle.scale.set(10, 10, 10); // Start from outside window
      circle.material.opacity = 0;
      circle.visible = true;
    });
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
