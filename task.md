# Project: ReceptionMonk AI Receptionist – Animated Promotional Reel

## 1. Objective

Build a minimal, professional animated promotional video demonstrating ReceptionMonk's AI receptionist handling a phone conversation.

The video should visually represent two participants:
- Customer
- ReceptionMonk AI Receptionist

The animation must respond to two actual audio tracks independently. Waveform movement must reflect the real audio amplitude rather than predefined animations.

The final output must be suitable for Instagram Reels.

## 2. Video Specifications

- Aspect ratio: 9:16
- Resolution: 1080 × 1920
- Format: MP4
- Frame rate: 30 FPS
- Duration: Automatically determined from audio duration.
- Visual style: Minimal, professional, Google-inspired.
- Background: Off-white/light neutral.
- Layout: Vertical and centrally aligned.

Avoid excessive gradients, neon effects, glowing elements, particles and unnecessary transitions.

## 3. Brand Configuration

Do not hardcode colors in individual components.

Create a centralized CSS variables file.

Initial brand values:

```css
:root {
    --brand-orange: #F97316;
    --brand-black: #1C1C1C;
    --brand-white: #FFFFFF;

    --customer-color: #4285F4;
    --call-connected-color: #34A853;

    --background-color: #F8F9FA;
    --muted-color: #DADCE0;
    --secondary-text-color: #5F6368;
}
```

All visual components must reference these variables.

Changing a variable should update the entire application.

## 4. Assets

Use the actual ReceptionMonk logo supplied by the user.

Asset location:
`assets/favicon.svg`

Do not recreate, approximate or replace the logo.

Use the SVG as the AI receptionist's avatar/logo.

For the customer avatar, use a simple neutral profile icon. Prefer an SVG icon rather than an external image.

## 5. Suggested Project Structure

```text
receptionmonk-reel/
│
├── index.html
│
├── css/
│   ├── variables.css
│   ├── layout.css
│   ├── components.css
│   └── animation.css
│
├── js/
│   ├── main.js
│   ├── audio-loader.js
│   ├── audio-analyser.js
│   ├── waveform.js
│   ├── timeline.js
│   └── renderer.js
│
├── assets/
│   ├── favicon.svg
│   └── customer-avatar.svg
│
├── audio/
│   ├── customer.wav
│   └── receptionist.wav
│
├── config/
│   └── animation-config.js
│
└── output/
```

Keep modules independent and maintain separation of concerns.

## 6. Visual Layout

Create a vertical composition.

Suggested arrangement:

```text
          ReceptionMonk
          AI Receptionist


       ┌─────────────────┐
       │                 │
       │  Customer       │
       │  Avatar         │
       │                 │
       │  Blue Waveform  │
       │                 │
       │                 │
       │  Connected      │
       │  Call Icon      │
       │                 │
       │                 │
       │  ReceptionMonk  │
       │  Logo           │
       │                 │
       │  Orange Waveform│
       │                 │
       └─────────────────┘
```

Design requirements:

- Customer avatar at the upper portion.
- Customer waveform immediately below the avatar.
- Connected-call indicator around the middle.
- ReceptionMonk logo in the lower portion.
- AI waveform immediately below the logo.
- Maintain generous spacing.
- Keep everything centered.

Use simple circles, thin lines and restrained shadows.

Avoid unnecessary decorative elements.

## 7. Audio Processing – Most Important Requirement

There will be TWO independent audio files:

1. Customer audio.
2. Receptionist audio.

The system must analyse both independently.

Do not use speaker diarization.

Do not manually define speaking timestamps.

### Audio loading

- Load both audio files.
- Decode them using the Web Audio API.
- Determine their durations.
- Support configurable start offsets.
- Synchronize both tracks against one common timeline.

### Amplitude analysis

Use Web Audio API AudioBuffer decoding and audio sample analysis.

Calculate RMS (Root Mean Square) amplitude over small time windows.

Conceptually:

RMS = sqrt(sum(sample²) / number_of_samples)

The RMS value should determine waveform height.

Expected behaviour:

| Audio condition | Waveform behaviour |
|---|---|
| Silence | Nearly flat |
| Low-volume speech | Small fluctuations |
| Normal speech | Medium fluctuations |
| Loud speech | Larger fluctuations |
| Sudden loud sound | Quick increase |

Implement configurable smoothing to prevent jitter.

Use a peak/RMS-based approach if necessary to make speech fluctuations visually recognizable.

### Independent waveform control

Customer audio must control ONLY the customer waveform.

Receptionist audio must control ONLY the ReceptionMonk waveform.

Example:

```text
Customer speaks:
    Blue waveform active.
    Orange waveform resting.

AI speaks:
    Orange waveform active.
    Blue waveform resting.

Both speak:
    Both waveforms react independently.

Silence:
    Both waveforms settle.
```

Do not artificially activate one waveform based on the other.

## 8. Waveform Animation

Create an SVG-based waveform component.

Requirements:

- Configurable number of bars.
- Configurable bar width.
- Configurable spacing.
- Configurable maximum height.
- Configurable sensitivity.
- Configurable smoothing.
- Smooth transitions between amplitude samples.
- Symmetrical visual arrangement around the center line.

The waveform should look like a professional audio visualizer, not an equalizer from a music player.

Use subtle movement and avoid excessive amplitude.

The two waveform components should share the same implementation but receive independent audio data.

## 9. Animation States

Implement the following states:

### State 1: Initial

- Both avatars visible.
- Both waveforms resting.
- Call indicator in incoming-call state.

### State 2: Connecting

- Subtle incoming-call animation.
- Call icon transitions into connected state.

### State 3: Connected

- Green connected-call indicator.
- Both participants visible.
- Waveforms ready to respond.

### State 4: Conversation

- Customer waveform responds to customer audio.
- Receptionist waveform responds to receptionist audio.
- Waveforms independently return to resting state during silence.

### State 5: Call Completed

- Both waveforms settle.
- Call indicator transitions to disconnected state.
- End animation should be subtle.

All transitions should be configurable through the animation timeline.

Do not invent fixed timestamps for the conversation.

Call connection and disconnection timing can be configured separately.

## 10. Configuration

Create a centralized JavaScript configuration file.

It should support:

- Audio file paths.
- Audio start offsets.
- Video resolution.
- Frame rate.
- Waveform bar count.
- Waveform sensitivity.
- Waveform smoothing.
- Maximum waveform height.
- Waveform spacing.
- Avatar dimensions.
- Logo dimensions.
- Call connection timing.
- Call disconnection timing.
- Background color.

Do not require editing animation logic to change visual parameters.

Colors should remain in CSS variables.

## 11. Rendering and Export

The application must support:

1. Browser preview.
2. Audio synchronization preview.
3. Final MP4 rendering.

Use a deterministic rendering approach.

Recommended approach:
- HTML/SVG/CSS for visuals.
- JavaScript for audio analysis and timeline calculations.
- Playwright or an equivalent browser renderer for frame capture.
- FFmpeg for assembling frames and mixing the original audio tracks.

Important:
- Do not depend on real-time browser playback speed for final synchronization.
- Calculate animation state from the actual video timestamp.
- Use the same timeline for both audio tracks and visual frames.
- Preserve original audio timing.
- Mix both audio tracks into the final video.
- Handle audio start offsets correctly.
- Ensure the final video does not drift out of synchronization.

The exported video should be 1080 × 1920 at 30 FPS.

## 12. Developer Experience

Provide simple commands for:

- Installing dependencies.
- Starting the development server.
- Previewing the animation.
- Replacing audio files.
- Rendering the final video.

Keep the implementation easy to maintain.

Do not introduce unnecessary dependencies.

Include meaningful error messages for missing audio files, unsupported formats and rendering failures.

## 13. Acceptance Criteria

The implementation is complete when:

1. The vertical composition looks correct at 1080 × 1920.
2. The original ReceptionMonk logo is used.
3. Colors are configurable through CSS variables.
4. Customer and receptionist audio are analysed independently.
5. Waveform heights reflect actual audio amplitude.
6. Quiet speech produces smaller fluctuations.
7. Loud speech produces larger fluctuations.
8. Silence returns the waveform to its resting state.
9. Both tracks remain synchronized.
10. Call connection and disconnection transitions work.
11. The final MP4 contains the original mixed audio.
12. The exported video plays correctly in Instagram Reels format.

## 14. Implementation Instructions for Codex

Before writing code:

1. Inspect the existing working directory.
2. Check whether an existing project or package configuration exists.
3. Preserve existing files wherever possible.
4. Propose the implementation architecture.
5. Implement the project in small, testable modules.
6. Test audio analysis using the actual supplied audio files.
7. Verify waveform synchronization.
8. Generate a short preview before rendering the entire video.
9. Verify the final MP4 dimensions, frame rate and audio synchronization.

Do not substitute simulated waveform animations for actual audio analysis.

Do not introduce unnecessary design elements beyond the agreed visual direction.

Prioritize correctness, simplicity, maintainability and visual consistency.

## 15. Audio Source Modes (Important)

The application must support TWO audio processing modes.

A configurable flag should determine which mode is used.

### Mode 1: Dual Track Mode (Default)

```javascript
const AUDIO_CONFIG = {
    mode: "dual-track"
};
```

Inputs:
- `customer.wav`
- `receptionist.wav`

Behaviour:
- Analyse both audio tracks independently.
- Customer audio controls the blue waveform.
- Receptionist audio controls the orange waveform.
- Waveform amplitude reflects actual audio volume.
- No manual speaker timestamps required.

### Mode 2: Single Track + Speaker Timeline Mode

Use this mode when separate audio tracks are unavailable.

```javascript
const AUDIO_CONFIG = {
    mode: "single-track-timeline"
};
```

Input:
- One combined call recording.
- A manually defined conversation timeline.

Example:

```javascript
const conversation = [
    { start: 0, end: 4, speaker: "customer" },
    { start: 4, end: 8, speaker: "ai" },
    { start: 8, end: 12, speaker: "customer" },
    { start: 12, end: 17, speaker: "ai" }
];
```

Behaviour:

1. Read the current playback/rendering timestamp.
2. Identify the active speaker using the conversation timeline.
3. Extract the corresponding audio segment's amplitude.
4. Animate only the respective speaker's waveform.
5. Keep the other speaker's waveform inactive.
6. When no segment matches the current timestamp, both waveforms remain inactive.

Important:
- Waveform height must STILL reflect actual audio amplitude.
- Do not use random or predefined waveform animations.
- Speaker identification comes from the manually supplied timeline.
- Audio amplitude comes from the actual combined recording.
- Support silence between conversation segments.

### 16. Timeline Configuration

Keep the conversation timeline separate from the main application logic.

Example configuration:

```javascript
const TIMELINE_CONFIG = {
    enabled: true,

    conversation: [
        { start: 0, end: 4, speaker: "customer" },
        { start: 4, end: 8, speaker: "ai" },
        { start: 8, end: 12, speaker: "customer" },
        { start: 12, end: 17, speaker: "ai" }
    ]
};
```

Validate:
- Start time must be less than end time.
- Speaker must be either `customer` or `ai`.
- Segments must not overlap.
- Timestamps must be within the audio duration.
- Unspecified intervals should be treated as silence.

### 17. Audio Mode Selection

The application must select its processing pipeline based on the configuration flag.

| Feature | Dual Track | Single Track + Timeline |
|---|---|---|
| Audio files | Two | One |
| Speaker identification | Separate tracks | Manual timestamps |
| Waveform amplitude | Actual audio | Actual audio |
| Speaker switching | Automatic | Timeline-based |
| Manual timestamps | Not required | Required |
| Independent waveforms | Yes | Yes |

### 18. Acceptance Criteria – Additional

1. Dual-track mode works without a conversation timeline.
2. Single-track mode works using manually supplied speaker timestamps.
3. Changing the configuration flag switches processing modes.
4. Both modes produce identical visual layouts.
5. Both modes maintain audio-video synchronization.
6. Neither mode uses simulated audio amplitude.
7. Missing or invalid timeline data produces meaningful errors.
8. The original audio must be preserved in the final MP4.

**Implementation principle:** Keep audio source selection, speaker identification, amplitude analysis and waveform rendering as separate modules. Both audio modes should feed the same waveform rendering system.
