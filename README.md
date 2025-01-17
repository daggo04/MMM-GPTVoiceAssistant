# MMM-GPTVoiceAssistant

A voice-enabled GPT assistant module for MagicMirror². This module provides a conversational AI interface using OpenAI's GPT-4 with real-time audio capabilities, allowing users to interact with their MagicMirror² through natural speech.

![Example of MMM-GPTVoiceAssistant](./example.gif)

## Features
- Real-time voice interaction with GPT-4
- Visual feedback during conversations
- Automatic timeout after inactivity
- Message history with fade effect
- Keyboard controls for development/testing
- Configurable voice trigger phrase

## Dependencies
This module requires:
- OpenAI API key with access to GPT-4 real-time audio capabilities
- MagicMirror² v2.25.0 or later
- A microphone connected to your MagicMirror²
- Speakers for audio output

### Node.js Dependencies
- `node-fetch`: For making HTTP requests to OpenAI API
- `wrtc`: For WebRTC functionality
- Additional dependencies will be installed automatically via npm

## Installation

### 1. Clone the Repository
```bash
cd ~/MagicMirror/modules
git clone https://github.com/yourusername/MMM-GPTVoiceAssistant.git
```

### 2. Install Dependencies
```bash
cd MMM-GPTVoiceAssistant
npm install
```

### 3. Configure Environment
Add your OpenAI API key to your MagicMirror's `config/config.env`:
```bash
OPENAI_API_KEY=your_api_key_here
```

### 4. Add to Config
Add the module to your `config/config.js` file:
```js
{
    module: "MMM-GPTVoiceAssistant",
    position: "bottom_right",
    config: {
        // Voice trigger settings
        triggerPhrase: "Hey Aurora",
        
        // Keyboard controls (for development)
        microphoneToggleKey: "o",  // Toggle between OFF and ACTIVE
        
        // Timing settings
        inactivityTimeout: 60000,  // 1 minute in milliseconds
        
        // Debug settings
        debug: false,
        logAPI: "concise", // "verbose", "concise" or false
        logActivityUpdates: true, // Log activity updates and timeout countdown for debugging
        visualFeedback: true, // Toggle indicators to listening state

        // Visual settings
        maxMessages: 10, // Maximum number of messages to show
        fadePoint: 0.2, // Set percentage of messages to display before starting to fade
        fade: true, // Fade messages when reaching fadePoint
    }
}
```

## Configuration Options

Option|Type|Default|Description
------|------|------|-----------
`triggerPhrase`|`string`|`"Hey Aurora"`|Voice command to activate the assistant
`microphoneToggleKey`|`string`|`"o"`|Keyboard shortcut for testing
`inactivityTimeout`|`number`|`60000`|Time in ms to wait before deactivating (1 minute)
`debug`|`boolean`|`false`|Enable debug logging
`logAPI`|`string`|`"false"`|API logging level ("verbose", "concise", or false)
`logActivityUpdates`|`boolean`|`true`|Log activity updates and timeout countdown
`visualFeedback`|`boolean`|`true`|Show visual indicators for listening state
`maxMessages`|`number`|`10`|Maximum number of messages to show in history
`fadePoint`|`number`|`0.2`|Start fading messages at this point (0-1)
`fade`|`boolean`|`true`|Enable message fade effect

## Testing & Development

For development and testing:
1. Ensure your OpenAI API key is set in `config/config.env`
2. Use the keyboard shortcut (default: 'o') to toggle the microphone
3. Check the browser console and terminal for debug information

## Debugging

Enable debug logging in your config:
```js
config: {
    debug: true,
    logAPI: "verbose",  // or "concise"
    logActivityUpdates: true
}
```

## Contributing

1. Fork the repository
2. Create a new branch for your feature
3. Submit a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgments

Special thanks to the MagicMirror² community and OpenAI for making this module possible.