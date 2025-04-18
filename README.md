# FFmpeg UI

A simple web-based user interface for FFmpeg, allowing you to easily convert and process video/audio files through your browser.

## ⚠️ Compatibility Notice

**This application is designed to work on macOS systems only.** It may not function correctly on Windows or Linux.

## Prerequisites

Before you can use this application, you must have:

- **macOS** operating system
- **FFmpeg** installed on your system
- **Node.js** (v14 or higher)
- **npm** (Node package manager)

### Installing FFmpeg

FFmpeg must be installed on your Mac for this application to work. You can install it using Homebrew:

```bash
brew install ffmpeg
```

If you don't have Homebrew installed, you can get it from [brew.sh](https://brew.sh/).

Alternatively, you can download FFmpeg directly from the [official website](https://ffmpeg.org/download.html).

## Installation

1. Clone this repository:

   ```bash
   git clone https://github.com/yourusername/ffmpeg-ui.git
   cd ffmpeg-ui
   ```

2. Install dependencies:

   ```bash
   npm install
   ```

3. Configure the application (optional):
   ```bash
   cp config.json.example config.json
   ```
   Then edit `config.json` to set your FFmpeg path if it's not in a standard location.

## Usage

1. Start the server:

   ```bash
   npm start
   ```

2. Open your browser and navigate to:

   ```
   http://localhost:3000
   ```

3. Upload a video or audio file, enter your desired FFmpeg options, and click "Convert".

## Features

- Simple web interface for FFmpeg
- Real-time conversion progress tracking
- Support for custom FFmpeg command options
- Handles video and audio conversions
- Supports image sequence extraction

## Troubleshooting

- If you encounter an error mentioning "FFmpeg not found", ensure FFmpeg is properly installed and accessible in your PATH, or specify the exact path in the `config.json` file.
- Make sure the uploads and output directories have the proper permissions.
- Check the browser console and server logs for detailed error messages.

## Project Structure

- `public/` - Static web assets
- `uploads/` - Temporary storage for uploaded files
- `server.js` - Main application server
- `config.json` - Configuration settings (create from example)

## License

This project is licensed under the ISC License - see the LICENSE file for details.
