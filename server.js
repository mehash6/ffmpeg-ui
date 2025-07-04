const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const multer = require("multer");
const path = require("path");
const { spawn, execSync } = require("child_process");
const fs = require("fs");
const archiver = require("archiver");

// Helper function to detect ffmpeg path
function getFFmpegPath() {
  // Check if config file exists
  const configPath = path.join(__dirname, "config.json");
  if (fs.existsSync(configPath)) {
    try {
      const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
      if (config.ffmpegPath && fs.existsSync(config.ffmpegPath)) {
        console.log(`Using FFmpeg from config file: ${config.ffmpegPath}`);
        return config.ffmpegPath;
      }
    } catch (err) {
      console.error("Error reading config file:", err);
    }
  }

  // Auto-detect using which command
  try {
    const ffmpegPath = execSync("which ffmpeg", { encoding: "utf8" }).trim();
    console.log(`Auto-detected FFmpeg path: ${ffmpegPath}`);
    return ffmpegPath;
  } catch (err) {
    // Fall back to just using "ffmpeg" and letting PATH resolve it
    console.log("Could not detect FFmpeg path, falling back to 'ffmpeg'");
    return "ffmpeg";
  }
}

// Get FFmpeg path early
const FFMPEG_PATH = getFFmpegPath();

// Create Express app and HTTP server
const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Configure middleware
app.use(express.static("public"));
app.use(express.json());

// Ensure directories exist
if (!fs.existsSync("./uploads")) fs.mkdirSync("./uploads");
if (!fs.existsSync("./public/output"))
  fs.mkdirSync("./public/output", { recursive: true });

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: "./uploads/",
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  },
});
const upload = multer({ storage });

// Handle file conversion
app.post("/convert", upload.single("video"), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No file uploaded" });
  }

  const sessionId = Date.now().toString();
  res.json({ sessionId });

  const inputPath = path.join(__dirname, "uploads", req.file.filename);
  const isImage = req.body.isImage === "true";

  // Set appropriate output extension based on options
  let outputExt = ".mp4";
  if (isImage) {
    const formatMatch = req.body.options.match(/output\.(jpg|png|webp|gif)/i);
    if (formatMatch) {
      outputExt = `.${formatMatch[1]}`;
    }
  }

  const outputPath = path.join(
    __dirname,
    "public/output",
    `output_${sessionId}${outputExt}`
  );

  // Parse FFmpeg options
  const options = req.body.options || "";
  let args = ["-i", inputPath];

  // Add user options if provided, replace the output placeholder with the actual output path
  if (options.trim()) {
    // Split options but respect quotes
    const parsedOptions = options.match(/(?:[^\s"]+|"[^"]*")+/g) || [];

    // Replace output.ext with actual output path
    const cleanedOptions = parsedOptions.map((opt) => {
      if (opt.match(/output\.(jpg|png|webp|gif)/i)) {
        return outputPath;
      }
      return opt;
    });

    args.push(...cleanedOptions);
  } else {
    // Add output path if no options are provided
    args.push(outputPath);
  }

  console.log("Running FFmpeg with args:", args);

  // Spawn FFmpeg process with auto-detected or configured path
  const ffmpeg = spawn(FFMPEG_PATH, args);

  // Handle FFmpeg output
  ffmpeg.stderr.on("data", (data) => {
    const output = data.toString();
    console.log(output);

    // Parse progress from FFmpeg output
    const progress = parseFFmpegProgress(output);
    if (progress) {
      io.emit(`progress:${sessionId}`, progress);
    }
  });

  // Handle process completion
  ffmpeg.on("close", (code) => {
    console.log(`FFmpeg process exited with code ${code}`);

    io.emit(`complete:${sessionId}`, {
      success: code === 0,
      outputFile: path.basename(outputPath),
    });

    // Optionally clean up the input file after processing
    // fs.unlinkSync(inputPath);
  });
});

// Get list of available formats
app.get("/formats", (req, res) => {
  const ffmpeg = spawn(FFMPEG_PATH, ["-formats"]);
  let output = "";

  ffmpeg.stdout.on("data", (data) => {
    output += data.toString();
  });

  ffmpeg.stderr.on("data", (data) => {
    output += data.toString();
  });

  ffmpeg.on("close", (code) => {
    res.json({ output });
  });
});

// Function to parse FFmpeg progress output
function parseFFmpegProgress(output) {
  const timeMatch = output.match(/time=(\d+:\d+:\d+.\d+)/);
  const frameMatch = output.match(/frame=\s*(\d+)/);
  const speedMatch = output.match(/speed=(\d+.\d+x)/);

  if (timeMatch) {
    return {
      time: timeMatch[1],
      frame: frameMatch ? frameMatch[1] : "N/A",
      speed: speedMatch ? speedMatch[1] : "N/A",
    };
  }
  return null;
}

// Handle batch file conversion
app.post("/convert-batch", upload.array("video", 100), async (req, res) => {
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ error: "No files uploaded" });
  }

  const sessionId = Date.now().toString();
  res.json({ sessionId });

  const { isImage } = req.body;
  const results = [];
  const totalFiles = req.files.length;

  // Process files sequentially
  for (let i = 0; i < totalFiles; i++) {
    const file = req.files[i];
    const inputPath = path.join(__dirname, "uploads", file.filename);
    
    // Set appropriate output extension based on options
    let outputExt = ".mp4";
    if (isImage === "true") {
      const formatMatch = req.body.options.match(/output\.(jpg|png|webp|gif)/i);
      if (formatMatch) {
        outputExt = `.${formatMatch[1]}`;
      }
    }

    const outputPath = path.join(
      __dirname,
      "public/output",
      `output_${sessionId}_${i}${outputExt}`
    );

    // Parse FFmpeg options
    const options = req.body.options || "";
    let args = ["-i", inputPath];

    if (options.trim()) {
      const parsedOptions = options.match(/(?:[^\s"]+|"[^"]*")+/g) || [];
      const cleanedOptions = parsedOptions.map((opt) => {
        if (opt.match(/output\.(jpg|png|webp|gif)/i)) {
          return outputPath;
        }
        return opt;
      });
      args.push(...cleanedOptions);
    } else {
      args.push(outputPath);
    }

    try {
      await new Promise((resolve, reject) => {
        const ffmpeg = spawn(FFMPEG_PATH, args);
        let lastProgress = null;

        ffmpeg.stderr.on("data", (data) => {
          const output = data.toString();
          console.log(output);
          
          const progress = parseFFmpegProgress(output);
          if (progress) {
            lastProgress = progress;
            io.emit(`batch-progress:${sessionId}`, {
              currentFile: i + 1,
              totalFiles,
              fileName: file.originalname,
              speed: progress.speed,
              time: progress.time,
              frame: progress.frame
            });
          }
        });

        ffmpeg.on("close", (code) => {
          if (code === 0) {
            results.push({
              success: true,
              outputFile: path.basename(outputPath),
              originalFile: file.originalname
            });
            resolve();
          } else {
            results.push({
              success: false,
              originalFile: file.originalname,
              error: `FFmpeg exited with code ${code}`
            });
            resolve(); // Continue with next file even if this one failed
          }
        });

        ffmpeg.on("error", (err) => {
          results.push({
            success: false,
            originalFile: file.originalname,
            error: err.message
          });
          resolve();
        });
      });
    } catch (error) {
      results.push({
        success: false,
        originalFile: file.originalname,
        error: error.message
      });
    }
  }

  // Emit completion event
  io.emit(`batch-complete:${sessionId}`, results);
  
  // Create ZIP file if requested
  app.get(`/download-batch/${sessionId}`, (req, res) => {
    const archiver = require('archiver');
    const archive = archiver('zip', { zlib: { level: 9 } });
    
    res.attachment(`batch_${sessionId}.zip`);
    archive.pipe(res);
    
    results.forEach((result, index) => {
      if (result.success) {
        const outputPath = path.join(__dirname, "public/output", result.outputFile);
        archive.file(outputPath, { name: result.outputFile });
      }
    });
    
    archive.finalize();
  });
});

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
