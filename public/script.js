// Initialize Socket.IO connection
const socket = io();

// DOM Elements
const converterForm = document.getElementById("converterForm");
const videoInput = document.getElementById("video");
const optionsInput = document.getElementById("options");
const showPresetsBtn = document.getElementById("showPresets");
const presetsDiv = document.getElementById("presets");
const progressCard = document.getElementById("progressCard");
const timeInfo = document.getElementById("timeInfo");
const frameInfo = document.getElementById("frameInfo");
const speedInfo = document.getElementById("speedInfo");
const progressBar = document.getElementById("progressBar");
const resultCard = document.getElementById("resultCard");
const resultContent = document.getElementById("resultContent");

// Add animations and visual enhancements
document.head.insertAdjacentHTML(
  "beforeend",
  `
  <style>
    @keyframes pulse {
      0% { transform: scale(1); opacity: 1; }
      50% { transform: scale(1.01); opacity: 0.9; }
      100% { transform: scale(1); opacity: 1; }
    }
    .processing {
      animation: pulse 1.5s infinite ease-in-out;
    }
    .file-info {
      margin-top: 8px;
      padding: 8px 12px;
      background-color: rgba(67, 97, 238, 0.1);
      border-radius: 6px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      color: var(--gray-700);
      font-size: 0.9rem;
    }
    .file-size {
      color: var(--gray-600);
    }
    @media (prefers-color-scheme: dark) {
      .file-info {
        background-color: rgba(67, 97, 238, 0.2);
        color: var(--gray-300);
      }
      .file-size {
        color: var(--gray-400);
      }
    }
  </style>
`
);

// Show/hide presets with animation
showPresetsBtn.addEventListener("click", () => {
  presetsDiv.classList.toggle("hidden");
  if (!presetsDiv.classList.contains("hidden")) {
    presetsDiv.style.opacity = "0";
    presetsDiv.style.transform = "translateY(-10px)";
    setTimeout(() => {
      presetsDiv.style.transition = "all 0.3s ease";
      presetsDiv.style.opacity = "1";
      presetsDiv.style.transform = "translateY(0)";
    }, 10);
  }
});

// Handle preset buttons
presetsDiv.addEventListener("click", (e) => {
  if (e.target.tagName === "BUTTON" && e.target.dataset.preset) {
    optionsInput.value = e.target.dataset.preset;

    // Add subtle highlight effect on selection
    e.target.style.transform = "scale(0.95)";
    e.target.style.backgroundColor = "var(--primary)";
    e.target.style.color = "white";

    setTimeout(() => {
      e.target.style.transform = "";
      presetsDiv.classList.add("hidden");

      // Reset all button styles
      setTimeout(() => {
        const allButtons = presetsDiv.querySelectorAll("button");
        allButtons.forEach((btn) => {
          btn.style.backgroundColor = "";
          btn.style.color = "";
        });
      }, 300);
    }, 150);
  }
});

// Display selected file information
videoInput.addEventListener("change", (e) => {
  if (e.target.files.length) {
    const fileName = e.target.files[0].name;
    const fileSize = formatFileSize(e.target.files[0].size);
    const fileInfo = document.createElement("div");
    fileInfo.className = "file-info";
    fileInfo.innerHTML = `
      <span class="file-name">📁 ${fileName}</span>
      <span class="file-size">${fileSize}</span>
    `;

    // Remove existing file info if present
    const existingInfo = document.querySelector(".file-info");
    if (existingInfo) {
      existingInfo.remove();
    }

    // Add after the input
    videoInput.parentNode.appendChild(fileInfo);
  }
});

// Format file size in human-readable format
function formatFileSize(bytes) {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

// Show error message
function showError(message) {
  resultContent.innerHTML = `<p class="error">${message}</p>`;
  progressCard.classList.add("hidden");
  resultCard.classList.remove("hidden");
}

// Handle form submission
converterForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  // Validate input
  if (!videoInput.files.length) {
    showError("Please select a media file");
    return;
  }

  const file = videoInput.files[0];
  const isImage = file.type.startsWith("image/");

  // Create form data
  const formData = new FormData();
  formData.append("video", file);

  // Get the options value
  let options = optionsInput.value;

  // For images, ensure output format is specified if not already
  if (isImage && !options.includes("output.")) {
    // Extract file extension from the preset if possible
    const formatMatch = options.match(/output\.(jpg|png|webp|gif)/);
    const outputFormat = formatMatch ? formatMatch[1] : "jpg";
    // Add output format to options if not present
    if (!options.includes("output.")) {
      options += ` output.${outputFormat}`;
    }
  }

  formData.append("options", options);
  formData.append("isImage", isImage);

  // Show progress card and hide result card
  progressCard.classList.remove("hidden");
  resultCard.classList.add("hidden");
  progressBar.style.width = "0%";

  // Add button loading state
  const convertButton = document.getElementById("convertBtn");
  const originalButtonText = convertButton.innerHTML;
  convertButton.innerHTML = "Processing...";
  convertButton.disabled = true;

  try {
    // Submit request to server
    const response = await fetch("/convert", {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || "Server error");
    }

    const data = await response.json();

    // Listen for progress events
    const sessionId = data.sessionId;

    socket.on(`progress:${sessionId}`, (progress) => {
      timeInfo.textContent = `Time: ${progress.time}`;
      frameInfo.textContent = `Frame: ${progress.frame}`;
      speedInfo.textContent = `Speed: ${progress.speed}`;

      // Estimate progress (very rough)
      const timeParts = progress.time.split(":");
      const seconds =
        parseInt(timeParts[0]) * 3600 +
        parseInt(timeParts[1]) * 60 +
        parseFloat(timeParts[2]);

      // Get duration from metadata (simplified)
      const file = videoInput.files[0];
      const videoDuration = 100; // This would ideally be extracted from the video
      const percentComplete = Math.min((seconds / videoDuration) * 100, 100);
      progressBar.style.width = `${percentComplete}%`;

      // Add pulse animation during processing
      progressCard.classList.add("processing");
    });

    socket.on(`complete:${sessionId}`, (result) => {
      progressCard.classList.remove("processing");

      // Reset button state
      convertButton.innerHTML = originalButtonText;
      convertButton.disabled = false;

      if (result.success) {
        // Check file extension to determine if it's an image
        const fileExt = result.outputFile.split(".").pop().toLowerCase();
        const isImageOutput = [
          "jpg",
          "jpeg",
          "png",
          "gif",
          "webp",
          "bmp",
          "tiff",
        ].includes(fileExt);

        if (isImageOutput) {
          resultContent.innerHTML = `
            <div class="success-message">Image conversion completed successfully!</div>
            <img src="/output/${result.outputFile}" style="max-width: 100%; max-height: 500px;">
            <a href="/output/${result.outputFile}" download class="download-link">
              Download Converted Image
            </a>
          `;
        } else {
          resultContent.innerHTML = `
            <div class="success-message">Conversion completed successfully!</div>
            <video controls>
              <source src="/output/${result.outputFile}" type="video/mp4">
              Your browser does not support the video tag.
            </video>
            <a href="/output/${result.outputFile}" download class="download-link">
              Download Converted File
            </a>
          `;
        }
      } else {
        resultContent.innerHTML = `
          <p class="error">Conversion failed. Please check your FFmpeg options and try again.</p>
        `;
      }

      progressCard.classList.add("hidden");
      resultCard.classList.remove("hidden");

      // Clean up socket listeners
      socket.off(`progress:${sessionId}`);
      socket.off(`complete:${sessionId}`);
    });
  } catch (error) {
    // Reset button state
    convertButton.innerHTML = originalButtonText;
    convertButton.disabled = false;

    showError(error.message);
  }
});

// Optional: Fetch FFmpeg formats on page load for reference
// async function fetchFFmpegFormats() {
//   try {
//     const response = await fetch('/formats');
//     const data = await response.json();
//     console.log('Available FFmpeg formats:', data.output);
//   } catch (error) {
//     console.error('Error fetching FFmpeg formats:', error);
//   }
// }
// fetchFFmpegFormats();

// Function to check if all files are images
function areAllImages(files) {
  return Array.from(files).every(file => file.type.startsWith("image/"));
}

// Function to check if all files are videos
function areAllVideos(files) {
  return Array.from(files).every(file => file.type.startsWith("video/"));
}

// Function to check if media types are consistent
function checkMediaTypeConsistency(files) {
  if (files.length === 0) return { consistent: false, type: null };
  if (files.length === 1) {
    return {
      consistent: true,
      type: files[0].type.startsWith("image/") ? "image" : "video"
    };
  }

  const isAllImages = areAllImages(files);
  const isAllVideos = areAllVideos(files);

  return {
    consistent: isAllImages || isAllVideos,
    type: isAllImages ? "image" : isAllVideos ? "video" : "mixed"
  };
}

// Handle form submission
converterForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  // Validate input
  if (!videoInput.files.length) {
    showError("Please select one or more media files");
    return;
  }

  // Check if media types are consistent
  const mediaTypeCheck = checkMediaTypeConsistency(videoInput.files);
  if (!mediaTypeCheck.consistent) {
    showError("Please select either all images or all videos, not mixed types");
    return;
  }

  const files = Array.from(videoInput.files);
  const isBatch = files.length > 1;
  const isImage = mediaTypeCheck.type === "image";

  // Create form data
  const formData = new FormData();
  files.forEach((file, index) => {
    formData.append("video", file);
  });

  // Get the options value
  let options = optionsInput.value;

  // For images, ensure output format is specified if not already
  if (isImage && !options.includes("output.")) {
    const formatMatch = options.match(/output\.(jpg|png|webp|gif)/);
    const outputFormat = formatMatch ? formatMatch[1] : "jpg";
    if (!options.includes("output.")) {
      options += ` output.${outputFormat}`;
    }
  }

  formData.append("options", options);
  formData.append("isImage", isImage);
  formData.append("isBatch", isBatch);

  // Show progress card and hide result card
  progressCard.classList.remove("hidden");
  resultCard.classList.add("hidden");
  progressBar.style.width = "0%";

  // Update progress card for batch processing
  if (isBatch) {
    const progressTitle = progressCard.querySelector("h2");
    progressTitle.textContent = `Processing (${files.length} files)`;
  }

  // Add button loading state
  const convertButton = document.getElementById("convertBtn");
  const originalButtonText = convertButton.innerHTML;
  convertButton.innerHTML = `Processing${isBatch ? ` ${files.length} files...` : '...'}`;
  convertButton.disabled = true;

  try {
    const response = await fetch(isBatch ? "/convert-batch" : "/convert", {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || "Server error");
    }

    const data = await response.json();
    const sessionId = data.sessionId;

    if (isBatch) {
      // Handle batch progress
      let completedFiles = 0;
      const totalFiles = files.length;

      socket.on(`batch-progress:${sessionId}`, (progress) => {
        timeInfo.textContent = `File ${progress.currentFile} of ${progress.totalFiles}`;
        frameInfo.textContent = `Progress: ${progress.fileName}`;
        speedInfo.textContent = `Speed: ${progress.speed}`;

        const percentComplete = (progress.currentFile / progress.totalFiles) * 100;
        progressBar.style.width = `${percentComplete}%`;
        progressCard.classList.add("processing");
      });

      socket.on(`batch-complete:${sessionId}`, (results) => {
        progressCard.classList.remove("processing");
        convertButton.innerHTML = originalButtonText;
        convertButton.disabled = false;

        // Display batch results
        const successCount = results.filter(r => r.success).length;
        const failureCount = results.length - successCount;

        let resultsHTML = `
          <div class="success-message">Batch processing completed!</div>
          <p>${successCount} successful, ${failureCount} failed</p>
          <div class="batch-results">
        `;

        results.forEach((result, index) => {
          if (result.success) {
            resultsHTML += `
              <div class="batch-item">
                <span class="batch-filename">${files[index].name}</span>
                <a href="/output/${result.outputFile}" download class="download-link small">
                  Download
                </a>
              </div>
            `;
          } else {
            resultsHTML += `
              <div class="batch-item error">
                <span class="batch-filename">${files[index].name}</span>
                <span>Failed</span>
              </div>
            `;
          }
        });

        resultsHTML += `
          </div>
          <a href="/download-batch/${sessionId}" class="download-link">
            Download All (ZIP)
          </a>
        `;

        resultContent.innerHTML = resultsHTML;
        progressCard.classList.add("hidden");
        resultCard.classList.remove("hidden");

        // Clean up socket listeners
        socket.off(`batch-progress:${sessionId}`);
        socket.off(`batch-complete:${sessionId}`);
      });
    } else {
      // Single file processing (existing code)
      socket.on(`progress:${sessionId}`, (progress) => {
        timeInfo.textContent = `Time: ${progress.time}`;
        frameInfo.textContent = `Frame: ${progress.frame}`;
        speedInfo.textContent = `Speed: ${progress.speed}`;

        const timeParts = progress.time.split(":");
        const seconds =
          parseInt(timeParts[0]) * 3600 +
          parseInt(timeParts[1]) * 60 +
          parseFloat(timeParts[2]);

        const file = videoInput.files[0];
        const videoDuration = 100;
        const percentComplete = Math.min((seconds / videoDuration) * 100, 100);
        progressBar.style.width = `${percentComplete}%`;

        progressCard.classList.add("processing");
      });

      socket.on(`complete:${sessionId}`, (result) => {
        progressCard.classList.remove("processing");
        convertButton.innerHTML = originalButtonText;
        convertButton.disabled = false;

        if (result.success) {
          const fileExt = result.outputFile.split(".").pop().toLowerCase();
          const isImageOutput = [
            "jpg",
            "jpeg",
            "png",
            "gif",
            "webp",
            "bmp",
            "tiff",
          ].includes(fileExt);

          if (isImageOutput) {
            resultContent.innerHTML = `
              <div class="success-message">Image conversion completed successfully!</div>
              <img src="/output/${result.outputFile}" style="max-width: 100%; max-height: 500px;">
              <a href="/output/${result.outputFile}" download class="download-link">
                Download Converted Image
              </a>
            `;
          } else {
            resultContent.innerHTML = `
              <div class="success-message">Conversion completed successfully!</div>
              <video controls>
                <source src="/output/${result.outputFile}" type="video/mp4">
                Your browser does not support the video tag.
              </video>
              <a href="/output/${result.outputFile}" download class="download-link">
                Download Converted File
              </a>
            `;
          }
        } else {
          resultContent.innerHTML = `
            <p class="error">Conversion failed. Please check your FFmpeg options and try again.</p>
          `;
        }

        progressCard.classList.add("hidden");
        resultCard.classList.remove("hidden");

        socket.off(`progress:${sessionId}`);
        socket.off(`complete:${sessionId}`);
      });
    }
  } catch (error) {
    convertButton.innerHTML = originalButtonText;
    convertButton.disabled = false;
    showError(error.message);
  }
});

// Display selected file information
videoInput.addEventListener("change", (e) => {
  if (e.target.files.length) {
    const fileInfo = document.createElement("div");
    fileInfo.className = "file-info";
    
    if (e.target.files.length === 1) {
      const fileName = e.target.files[0].name;
      const fileSize = formatFileSize(e.target.files[0].size);
      fileInfo.innerHTML = `
        <span class="file-name">📁 ${fileName}</span>
        <span class="file-size">${fileSize}</span>
      `;
    } else {
      // Multiple files selected
      const totalSize = Array.from(e.target.files).reduce((sum, file) => sum + file.size, 0);
      const mediaTypeCheck = checkMediaTypeConsistency(e.target.files);
      const fileType = mediaTypeCheck.consistent ? 
        (mediaTypeCheck.type === "image" ? "images" : "videos") : 
        "mixed types";
      
      fileInfo.innerHTML = `
        <span class="file-name">📁 ${e.target.files.length} files (${fileType})</span>
        <span class="file-size">${formatFileSize(totalSize)}</span>
      `;
    }

    // Remove existing file info if present
    const existingInfo = document.querySelector(".file-info");
    if (existingInfo) {
      existingInfo.remove();
    }

    // Add after the input
    videoInput.parentNode.appendChild(fileInfo);
  }
});