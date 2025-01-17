const NodeHelper = require("node_helper");
const fetch = require('node-fetch');

module.exports = NodeHelper.create({
  start: function () {
    console.log("Starting helper for: MMM-AuroraAssistant");
    this.reset();
  },

  reset: function() {
    console.log("Resetting helper state");
  },

  async getEphemeralToken() {
    try {
      const response = await fetch("https://api.openai.com/v1/realtime/sessions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4o-realtime-preview-2024-12-17",
          voice: "verse",
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to get ephemeral token: ${response.status}, ${errorText}`);
      }

      const data = await response.json();
      return data.client_secret.value;
    } catch (error) {
      console.error("Error getting ephemeral token:", error);
      throw error;
    }
  },

  socketNotificationReceived: async function (notification, payload) {
    if (notification === "START_SESSION") {
      try {
        const token = await this.getEphemeralToken();
        this.sendSocketNotification("TOKEN_RECEIVED", { token });
      } catch (error) {
        console.error("Error starting session:", error);
        this.sendSocketNotification("ERROR", { message: error.message });
      }
    } else if (notification === "RELAY_TO_OPENAI") {
      this.relayToOpenAI(payload);
    }
  },

  async relayToOpenAI(payload) {
    try {
      const { sdp, token } = payload;
      const response = await fetch("https://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-12-17", {
        method: "POST",
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/sdp',
        },
        body: sdp
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const answerSdp = await response.text();
      this.sendSocketNotification("OPENAI_ANSWER", { sdp: answerSdp });
    } catch (error) {
      console.error("Error relaying to OpenAI:", error);
      this.sendSocketNotification("ERROR", { message: error.message });
    }
  },

  stop: function() {
    this.reset();
  }
});