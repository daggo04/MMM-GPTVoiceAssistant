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
        maxMessages: 20, // Maximum number of messages to keep in history
        lineHeight: 1.5, // Line height for messages
        messageMaxWidth: "100%", // Maximum width for message text
        fadePoint: 0.80, // Start fade at 20% from top
        fadeLength: 600, // Length of the fade in pixels
    },

    // Define states as constants
    STATES: {
        OFF: 'OFF',           // Microphone completely off
        ACTIVE: 'ACTIVE'      // Full conversation mode
    },

    start: function() {
        Log.info("Starting module: MMM-GPTVoiceAssistant");
        this.currentState = this.STATES.OFF;
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

        // Set up CSS variables
        const root = document.documentElement;
        root.style.setProperty('--message-max-width', this.config.messageMaxWidth);
        root.style.setProperty('--line-height', this.config.lineHeight);
        
        // Calculate fade start point based on fadePoint configuration
        // Convert fadePoint (0-1) to pixels from top
        const fadeStart = `${this.config.fadeLength}px`;
        root.style.setProperty('--fade-start', fadeStart);
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

    addMessage: function(message, type = 'system') {
        // Don't add empty messages
        if (!message || message.trim() === '') return;
    
        const newMessage = {
            text: message,
            timestamp: Date.now(),
            type: type
        };
    
        if (type === 'assistant') {
            if (this.currentMessageBuffer === "") {
                this.messageHistory.push(newMessage);
                this.currentMessageBuffer = message;
            } else {
                const lastMessage = this.messageHistory[this.messageHistory.length - 1];
                if (lastMessage && lastMessage.type === 'assistant') {
                    lastMessage.text = this.currentMessageBuffer + message;
                    this.currentMessageBuffer += message;
                }
            }
        } else {
            this.messageHistory.push(newMessage);
        }
    
        // Keep only the most recent messages
        while (this.messageHistory.length > this.config.maxMessages) {
            this.messageHistory.shift();
        }
    
        this.updateDom();
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
            const constraints = {
                audio: true,
                video: false
            };
            const stream = await navigator.mediaDevices.getUserMedia(constraints);
            this.audioStream = stream;
            if (this.config.debug) {
                Log.info("Audio stream initialized");
            }
        } catch (error) {
            Log.error("Error setting up audio:", error);
            this.addMessage("Error initializing audio system", 'system');
            this.updateDom();
        }
    },

    setupWebRTC: async function() {
        if (this.currentState !== this.STATES.ACTIVE) {
            return;
        }

        try {
            this.addMessage("Connecting to assistant...", 'system');
            Log.info("Requesting OpenAI token");
            this.sendSocketNotification("START_SESSION", {});
        } catch (error) {
            Log.error("Error initiating WebRTC setup:", error);
            this.addMessage("Error setting up connection", 'system');
        }
    },


    handleOpenAIMessage: function(message) {
        try {
            this.logMessage(message);
            
            switch (message.type) {
                case "response.audio_transcript.delta":
                    this.isAssistantSpeaking = true;
                    this.addMessage(message.delta, 'assistant');
                    break;

                case "response.done":
                    this.currentMessageBuffer = "";
                    this.isAssistantSpeaking = false;
                    this.lastAssistantResponseTimestamp = Date.now();
                    if (this.config.logActivityUpdates) {
                        Log.info("Assistant finished speaking, updating timestamp");
                    }
                    break;

                case "conversation.item.created":
                    if (message.item?.role === "user") {
                        this.lastUserSpeechTimestamp = Date.now();
                        if (this.config.logActivityUpdates) {
                            Log.info("User spoke, updating timestamp");
                        }
                    }
                    break;

                case "input_audio_buffer.speech_started":
                    break;

                case "input_audio_buffer.speech_stopped":
                    break;
            }

            this.updateDom();

        } catch (error) {
            Log.error("Error processing message:", error);
            this.addMessage("Error processing message", 'system');
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
            Log.info("Received OpenAI token");
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
                    else if (this.peerConnection.connectionState === 'disconnected') {
                        Log.error("WebRTC connection disconnected. Retrying...");
                        this.setState(this.STATES.OFF);
                    }
                    else if (this.peerConnection.connectionState === 'connected') {
                        Log.info("WebRTC connection established");
                        this.addMessage("Connected to assistant", 'system');
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
                if (this.config.debug) {
                    Log.info("Successfully set remote description");
                }
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

    updateFadeVariables: function() {
        const messageHistory = document.querySelector('.message-history');
        if (!messageHistory) return;
        
        const containerHeight = messageHistory.clientHeight;
        const fadeStartPixels = containerHeight * this.config.fadePoint;
        const fadeStart = `${fadeStartPixels}px`;
        
        document.documentElement.style.setProperty('--fade-start', fadeStart);
    },

    calculateMessageVisibility: function(messageEl, containerHeight) {
        const rect = messageEl.getBoundingClientRect();
        const containerRect = messageEl.parentElement.getBoundingClientRect();
        const distanceFromTop = rect.top - containerRect.top;
        
        // If message is completely below the fade area, show fully
        if (distanceFromTop >= this.config.fadeHeight) {
            return true;
        }
        
        // If message is completely in the fade area, hide it
        if (rect.bottom <= containerRect.top + this.config.fadeHeight) {
            return false;
        }
        
        // Message is partially in fade area, keep it visible
        return true;
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

        // Create message history wrapper for mask
        const messageHistoryWrapper = document.createElement("div");
        messageHistoryWrapper.className = "message-history-wrapper";

        // Add message history
        const messageHistory = document.createElement("div");
        messageHistory.className = "message-history";

        // Clone and reverse the message array for display
        const displayMessages = [...this.messageHistory].reverse();

        displayMessages.forEach((msg) => {
            const messageEntry = document.createElement("div");
            messageEntry.className = `message-entry message-${msg.type}`;
            
            const text = document.createElement("div");
            text.textContent = msg.text;
            messageEntry.appendChild(text);
            
            messageHistory.appendChild(messageEntry);
        });

        messageHistoryWrapper.appendChild(messageHistory);
        wrapper.appendChild(messageHistoryWrapper);

        // After rendering, update fade variables and scroll
        setTimeout(() => {
            this.updateFadeVariables();
            messageHistory.scrollTop = messageHistory.scrollHeight;
        }, 100);

        return wrapper;
    },
    

    getStyles: function() {
        return [
            'MMM-GPTVoiceAssistant.css',
        ];
    }
});