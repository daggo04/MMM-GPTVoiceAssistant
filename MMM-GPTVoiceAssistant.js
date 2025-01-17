Module.register("MMM-GPTVoiceAssistant", {
    defaults: {
        // Keyboard controls (for development)
        microphoneToggleKey: "o",  // Toggle between OFF and ACTIVE
        
        // Conversation settings
        inactivityTimeout: 60000,  // Time in ms to wait for activity before stopping
        
        // Debug settings
        debug: false, // General debug mode
        logAPI: "false", // Can be "verbose", "concise" or false
        logActivityUpdates: false, // Log activity updates and timeout countdown for debugging
        visualFeedback: true, // Show visual feedback when listening

        // Visual settings
        maxMessages: 10, // Maximum number of messages to show
        fadePoint: 0.2, // Start fading at 25% of the list
        fade: true, // Fade messages when reaching fadePoint
    },

    // Define states as constants
    STATES: {
        OFF: 'OFF',           // Microphone completely off
        ACTIVE: 'ACTIVE'      // Full conversation mode
    },

    start: function() {
        Log.info("Starting module: MMM-AuroraAssistant");
        this.currentState = this.STATES.OFF;
        this.assistantMessage = "Aurora Assistant is ready!";
        this.userMessage = "";
        this.isListening = false;
        this.peerConnection = null;
        this.dataChannel = null;
        this.lastUserSpeechTimestamp = null;
        this.lastAssistantResponseTimestamp = null;
        this.userSilenceTimer = null;
        this.assistantResponseTimer = null;
        this.isAssistantSpeaking = false;
        this.messageHistory = [];
        this.currentMessageBuffer = ""; // Add this to accumulate message parts
        
        this.setupAudio();
        this.setupKeyboardControls();
    },

        // Add the Magic Mirror notification handler
    notificationReceived: function(notification) {
            if (notification === "CLOCK_SECOND") {
                this.checkTimeout();
            }
        },

    setState: function(newState) {
        const oldState = this.currentState;
        this.currentState = newState;
        
        Log.info(`State transition: ${oldState} -> ${newState}`);

        switch (newState) {
            case this.STATES.OFF:
                this.stopActiveListening();
                break;
                
            case this.STATES.ACTIVE:
                this.startActiveListening();
                break;
        }
        
        this.updateDom();
    },

    addMessage: function(message) {
        this.messageHistory.push({
            text: message,
            timestamp: Date.now()
        });
        
        // Keep only the last N messages
        if (this.messageHistory.length > this.config.maxMessages) {
            this.messageHistory = this.messageHistory.slice(-this.config.maxMessages);
        }
        
        this.updateDom();
    },

    updateCurrentMessage: function(delta) {
        this.currentMessageBuffer += delta;
        if (this.messageHistory.length > 0) {
            this.messageHistory[this.messageHistory.length - 1].text = this.currentMessageBuffer;
            this.updateDom();
        }
    },


    clearHistory: function() {
        this.messageHistory = [];
        this.currentMessageBuffer = "";
        this.updateDom();
    },

    setupKeyboardControls: function() {
        document.addEventListener("keydown", (event) => {
            if (event.key === this.config.microphoneToggleKey) {
                // Toggle between OFF and ACTIVE
                this.setState(this.currentState === this.STATES.OFF ? 
                    this.STATES.ACTIVE : this.STATES.OFF);
            }
        });
    },

    setupAudio: async function() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            this.audioStream = stream;
            if (this.config.debug) {
                Log.info("Audio stream initialized");
            }
        } catch (error) {
            Log.error("Error setting up audio:", error);
            this.assistantMessage = "Error initializing audio system";
            this.updateDom();
        }
    },

    setupWebRTC: async function() {
        if (this.currentState !== this.STATES.ACTIVE) {
            return;
        }

        try {
            // First, request a token from the node helper
            this.sendSocketNotification("START_SESSION", {});
            Log.info("Requesting OpenAI token");
            this.assistantMessage = "Connecting to assistant...";
            this.updateDom();
        } catch (error) {
            Log.error("Error initiating WebRTC setup:", error);
            this.assistantMessage = "Error setting up connection";
            this.updateDom();
        }
    },


    handleOpenAIMessage: function(message) {
        try {
            // Log message for debugging
            this.logMessage(message);
            
            switch (message.type) {
                case "response.audio_transcript.delta":
                    this.isAssistantSpeaking = true;
                    
                    // If this is the start of a new message
                    if (this.currentMessageBuffer === "") {
                        // If there are existing messages, shift them down
                        if (this.messageHistory.length > 0) {
                            // Add new empty message at the start
                            this.messageHistory.unshift({
                                text: "",
                                timestamp: Date.now()
                            });
                            
                            // Keep only the maximum number of messages
                            if (this.messageHistory.length > this.config.maxMessages) {
                                this.messageHistory = this.messageHistory.slice(0, this.config.maxMessages);
                            }
                        } else {
                            // If no messages exist, create first one
                            this.messageHistory.unshift({
                                text: "",
                                timestamp: Date.now()
                            });
                        }
                    }
                    
                    // Update the current message buffer and the first message
                    this.currentMessageBuffer += message.delta;
                    this.messageHistory[0].text = this.currentMessageBuffer;
                    break;

                case "response.done":
                    // Message is complete, prepare for next one
                    this.currentMessageBuffer = "";
                    // Assistant finished speaking
                    this.isAssistantSpeaking = false;
                    this.lastAssistantResponseTimestamp = Date.now();
                    if (this.config.logActivityUpdates) {
                        Log.info("Assistant finished speaking, updating timestamp");
                    }
                    break;

                case "conversation.item.created":
                    if (message.item?.role === "user") {
                        // User was detected speaking
                        this.lastUserSpeechTimestamp = Date.now();
                        if (this.config.logActivityUpdates) {
                            Log.info("User spoke, updating timestamp");
                        }
                    }
                    break;
            }

            // Update the DOM
            this.updateDom();

        } catch (error) {
            Log.error("Error processing message:", error);
        }

        if (this.config.debug) {
            Log.info("Message History:", this.messageHistory);
        }
    },

    setupDataChannel: function() {
        this.dataChannel.onopen = () => {
            if (this.config.debug){
                Log.info("Data channel opened");
            }
            this.configureAssistant();
        };

        this.dataChannel.onmessage = (event) => {
            try {
                const message = JSON.parse(event.data);
                this.handleOpenAIMessage(message);
            } catch (error) {
                Log.error("Error parsing message:", error);
            }
        };
    },

    configureAssistant: function() {
        const config = {
            type: 'response.create',
            response: {
                modalities: ['text', 'audio'],
                instructions: "You are Aurora, a helpful assistant for a smart mirror. Be concise and clear in your responses."
            }
        };
        this.dataChannel.send(JSON.stringify(config));
        if (this.config.debug) {
            Log.info("Configuring assistant with:", JSON.stringify(config, null, 2));
        }
    },

    startActiveListening: function() {
        Log.info("Starting active listening mode");
        this.lastUserSpeechTimestamp = Date.now();
        this.lastAssistantResponseTimestamp = Date.now();
        this.isListening = true;
        this.addMessage("I'm listening...");
        this.currentMessageBuffer = "";
        this.setupWebRTC();
    },

    stopActiveListening: function() {
        if (this.peerConnection) {
            this.peerConnection.close();
            this.peerConnection = null;
        }
        if (this.dataChannel) {
            this.dataChannel.close();
            this.dataChannel = null;
        }
        this.isListening = false;
        this.clearHistory();
    },

    checkTimeout: function() {
        // Only check if we're in ACTIVE state and not speaking
        if (this.currentState !== this.STATES.ACTIVE || this.isAssistantSpeaking) {
            return;
        }

        const now = Date.now();
        const timeSinceLastUserSpeech = now - (this.lastUserSpeechTimestamp || now);
        const timeSinceLastAssistantResponse = now - (this.lastAssistantResponseTimestamp || now);
        
        // Log current status if in debug mode
        if (this.config.logActivityUpdates) {
            Log.info("Activity check:", {
                userSilence: Math.round(timeSinceLastUserSpeech / 1000) + "s",
                assistantSilence: Math.round(timeSinceLastAssistantResponse / 1000) + "s",
                timeout: Math.round(this.config.inactivityTimeout / 1000) + "s"
            });
        }

        // Check if either user or assistant has been inactive for too long
        if (timeSinceLastUserSpeech >= this.config.inactivityTimeout || 
            timeSinceLastAssistantResponse >= this.config.inactivityTimeout) {
            Log.info(`Conversation timeout reached: User - ${Math.round(timeSinceLastUserSpeech/1000)}s, Assistant - ${Math.round(timeSinceLastAssistantResponse/1000)}s`);
            this.setState(this.STATES.OFF);
        }
    },

    socketNotificationReceived: async function(notification, payload) {
        if (notification === "TOKEN_RECEIVED") {
            try {
                Log.info("Setting up WebRTC connection");
                
                // Create a new RTCPeerConnection
                this.peerConnection = new RTCPeerConnection({
                    iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
                });

                // Connection state changes with better error handling
                this.peerConnection.onconnectionstatechange = () => {
                    Log.info("WebRTC connection state:", this.peerConnection.connectionState);
                    if (this.peerConnection.connectionState === 'failed') {
                        Log.error("WebRTC connection failed. Retrying...");
                        this.setState(this.STATES.OFF);
                    }
                };

                this.peerConnection.oniceconnectionstatechange = () => {
                    if(this.debug) {
                        Log.info("ICE connection state:", this.peerConnection.iceConnectionState);
                    }
                };

                this.peerConnection.onicegatheringstatechange = () => {
                    if(this.debug) {
                        Log.info("ICE gathering state:", this.peerConnection.iceGatheringState);
                    }
                };

                // Add audio track
                if (this.audioStream) {
                    this.audioStream.getAudioTracks().forEach(track => {
                        if (this.config.debug) {
                        Log.info("Adding audio track to connection");
                        }
                        this.peerConnection.addTrack(track, this.audioStream);
                    });
                }

                // Create data channel
                this.dataChannel = this.peerConnection.createDataChannel('response');
                this.setupDataChannel();

                // Handle remote tracks
                this.peerConnection.ontrack = (event) => {
                    Log.info("Received remote track:", event.track.kind);
                    const audio = new Audio();
                    audio.srcObject = event.streams[0];
                    audio.play();
                };

                // Create and set local description
                const offer = await this.peerConnection.createOffer();
                await this.peerConnection.setLocalDescription(offer);
                Log.info("Created and set local description");

                // Send offer to node helper for relay
                this.sendSocketNotification("RELAY_TO_OPENAI", {
                    sdp: this.peerConnection.localDescription.sdp,
                    token: payload.token
                });

            } catch (error) {
                Log.error("Error in WebRTC setup:", error);
                this.setState(this.STATES.OFF);
            }
        } else if (notification === "OPENAI_ANSWER") {
            try {
                const answer = new RTCSessionDescription({
                    type: 'answer',
                    sdp: payload.sdp
                });
                await this.peerConnection.setRemoteDescription(answer);
                Log.info("Successfully established WebRTC connection");
                this.assistantMessage = "I'm listening...";
            } catch (error) {
                Log.error("Error setting remote description:", error);
                this.setState(this.STATES.OFF);
            }
        } else if (notification === "ERROR") {
            Log.error("Received error:", payload.message);
            this.assistantMessage = "Connection error occurred";
            this.updateDom();
            this.setState(this.STATES.OFF);
        }
    },

    logMessage: function(message) {
        if (!this.config.logAPI) return;
        
        if (this.config.logAPI === "concise") {
            switch (message.type) {
                // User speech events
                case "input_audio_buffer.speech_started":
                    Log.info("User started speaking");
                    break;
                    
                case "input_audio_buffer.speech_stopped":
                    Log.info("User stopped speaking");
                    break;
                    
                case "conversation.item.created":
                    if (message.item?.role === "user") {
                        Log.info("User input captured");
                    } else if (message.item?.role === "assistant") {
                        Log.info("Assistant responding");
                    }
                    break;
                    
                // Assistant speech events
                case "response.audio_transcript.delta":
                    Log.info(`Assistant: "${message.delta}"`);
                    break;
                    
                case "response.audio_transcript.done":
                    Log.info(`Complete response: "${message.transcript}"`);
                    break;
                    
                case "response.content_part.done":
                    if (!this.config.logActivityUpdates) {Log.info("Assistant finished speaking");}
                    break;
                    
                case "response.done":
                    const usage = message.response?.usage;
                    if (usage) {
                        Log.info("Conversation stats:", {
                            total_tokens: usage.total_tokens,
                            input_tokens: usage.input_tokens,
                            output_tokens: usage.output_tokens
                        });
                    }
                    break;
                    
                case "session.created":
                case "session.updated":
                    Log.info(`Session ${message.type.split('.')[1]}`);
                    break;
            }
        } else if (this.config.logAPI === "verbose") {
            const formatted = message;
            
            Log.info("OpenAI message:", JSON.stringify(formatted, null, 2));
        }
    },

    // Calculate opacity based on position
    calculateOpacity: function(index, total) {
        if (!this.config.fade) return 1;
        if (this.config.fadePoint < 0) this.config.fadePoint = 0;
        
        const startingPoint = total * this.config.fadePoint;
        const numFadeSteps = total - startingPoint;
        
        if (index >= startingPoint) {
            return 1 - (index - startingPoint) / numFadeSteps;
        }
        return 1;
    },

    getDom: function() {
        const wrapper = document.createElement("div");
        wrapper.className = "aurora-wrapper";

        // Add icon container
        const iconContainer = document.createElement("div");
        iconContainer.className = `icon-container ${this.currentState === this.STATES.ACTIVE ? 'active' : ''}`;
        iconContainer.innerHTML = `
            <lord-icon
                src="https://cdn.lordicon.com/wfqiocpv.json"
                trigger="loop"
                state="loop-talking"
                colors="primary:#ffffff,secondary:#ffffff"
                style="width:250px;height:250px">
            </lord-icon>`;
        wrapper.appendChild(iconContainer);

        // Add message history
        const messageHistory = document.createElement("div");
        messageHistory.className = "message-history";

        this.messageHistory.forEach((msg, index) => {
            const messageEntry = document.createElement("div");
            messageEntry.className = "message-entry";
            messageEntry.style.opacity = this.calculateOpacity(index, this.messageHistory.length);
            
            const text = document.createElement("div");
            text.textContent = msg.text;
            messageEntry.appendChild(text);
            
            messageHistory.appendChild(messageEntry);
        });

        wrapper.appendChild(messageHistory);

        return wrapper;
    },

    getStyles: function() {
        return [
            'MMM-GPTVoiceAssistant.css',
        ];
    }
});