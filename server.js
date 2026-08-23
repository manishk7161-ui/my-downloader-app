const express = require('express');
const cors = require('cors');
const axios = require('axios');
const path = require('path');
const fs = require('fs');
const { execFile, exec } = require('child_process');

const app = express();
const PORT = process.env.PORT || 3000;
const BIN_DIR = path.join(__dirname, 'bin');
const TEMP_DIR = path.join(__dirname, 'temp_downloads');

if (!fs.existsSync(BIN_DIR)) fs.mkdirSync(BIN_DIR, { recursive: true });
if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });

const isWin = process.platform === 'win32';
const YTDLP_PATH = path.join(BIN_DIR, isWin ? 'yt-dlp.exe' : 'yt-dlp');

// Ensure yt-dlp binary exists on startup (Auto-download for Linux Cloud / Railway)
async function ensureYtdlp() {
  if (!fs.existsSync(YTDLP_PATH)) {
    console.log('Downloading yt-dlp binary for environment...');
    const downloadUrl = isWin
      ? 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe'
      : 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp';

    const response = await axios({ method: 'GET', url: downloadUrl, responseType: 'arraybuffer' });
    fs.writeFileSync(YTDLP_PATH, response.data);
    if (!isWin) fs.chmodSync(YTDLP_PATH, '755');
    console.log('yt-dlp binary downloaded successfully.');
  }
}
ensureYtdlp().catch(console.error);

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../src')));

// Platform Detection Helper
function detectPlatform(url) {
  if (!url) return null;
  if (/youtube\.com|youtu\.be/i.test(url)) return 'youtube';
  if (/instagram\.com/i.test(url)) return 'instagram';
  if (/facebook\.com|fb\.watch/i.test(url)) return 'facebook';
  return 'unknown';
}

// Extract Video Info & Metadata
function getVideoMetadata(url, platform) {
  return new Promise((resolve, reject) => {
    execFile(YTDLP_PATH, ['-j', '--no-playlist', url], { maxBuffer: 10 * 1024 * 1024 }, (err, stdout) => {
      if (err || !stdout) {
        if (platform === 'youtube') {
          const videoIdMatch = url.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|shorts\/|live\/|watch\?.+&v=))([\w-]{11})/i);
          const videoId = videoIdMatch ? videoIdMatch[1] : 'video';
          return resolve({
            title: 'YouTube HD Video',
            thumbnail: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
            platform: 'youtube',
            videoId,
            formats: [
              { label: '1080p Full HD (Merged Playable MP4)', quality: '1080p', type: 'video/mp4', formatCode: 'bestvideo[height<=1080]+bestaudio/best[ext=mp4]/best', ext: 'mp4' },
              { label: '720p HD (Playable MP4)', quality: '720p', type: 'video/mp4', formatCode: 'bestvideo[height<=720]+bestaudio/best[ext=mp4]/best', ext: 'mp4' },
              { label: 'Audio High Quality (MP3)', quality: 'Audio', type: 'audio/mp3', formatCode: 'bestaudio/best', ext: 'mp3' }
            ]
          });
        }
        return reject(new Error('Could not fetch video information. Please check link.'));
      }

      try {
        const info = JSON.parse(stdout);
        const title = info.title || `${platform.toUpperCase()} Video`;
        const thumbnail = info.thumbnail || `https://via.placeholder.com/300x300?text=${platform.toUpperCase()}`;

        resolve({
          title,
          thumbnail,
          platform,
          videoId: info.id || Date.now().toString(),
          formats: [
            { label: '1080p Full HD (Merged Playable MP4)', quality: '1080p', type: 'video/mp4', formatCode: 'bestvideo[height<=1080]+bestaudio/best[ext=mp4]/best', ext: 'mp4' },
            { label: '720p HD (Merged Playable MP4)', quality: '720p', type: 'video/mp4', formatCode: 'bestvideo[height<=720]+bestaudio/best[ext=mp4]/best', ext: 'mp4' },
            { label: '480p Standard (Playable MP4)', quality: '480p', type: 'video/mp4', formatCode: 'bestvideo[height<=480]+bestaudio/best[ext=mp4]/best', ext: 'mp4' },
            { label: 'Audio High Quality (MP3)', quality: 'Audio', type: 'audio/mp3', formatCode: 'bestaudio/best', ext: 'mp3' }
          ]
        });
      } catch (e) {
        reject(new Error('Failed to parse video info.'));
      }
    });
  });
}

// API Endpoint to parse media URL
app.post('/api/parse', async (req, res) => {
  const { url } = req.body;
  if (!url) {
    return res.status(400).json({ success: false, error: 'Please provide a valid video URL.' });
  }

  const platform = detectPlatform(url);
  if (platform === 'unknown') {
    return res.status(400).json({ success: false, error: 'Unsupported link. Please paste a YouTube, Instagram, or Facebook URL.' });
  }

  try {
    const data = await getVideoMetadata(url, platform);
    return res.json({ success: true, data });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message || 'Failed to extract video details.' });
  }
});

// Download Proxy Endpoint
app.get('/api/download', (req, res) => {
  const { videoUrl, formatCode, filename } = req.query;
  const safeFilename = (filename || 'downloaded_video.mp4').replace(/[^a-zA-Z0-9_.-]/g, '_');
  const tempFileId = Date.now() + '_' + Math.random().toString(36).substring(7);
  const ext = safeFilename.endsWith('.mp3') ? 'mp3' : 'mp4';
  const targetFilePath = path.join(TEMP_DIR, `${tempFileId}.${ext}`);

  if (!videoUrl) {
    return res.status(400).send('Missing videoUrl parameter.');
  }

  const selectedFormat = formatCode || 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best';
  const args = ['--no-part', '--merge-output-format', ext, '-f', selectedFormat, '-o', targetFilePath, videoUrl];

  console.log(`Executing yt-dlp merge download to ${targetFilePath}...`);
  execFile(YTDLP_PATH, args, { timeout: 180000 }, (err, stdout, stderr) => {
    if (err || !fs.existsSync(targetFilePath)) {
      console.error('Download/Merge Error:', err || stderr);
      return res.status(500).send('Failed to process video file.');
    }

    res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}"`);
    res.setHeader('Content-Type', ext === 'mp3' ? 'audio/mpeg' : 'video/mp4');

    const fileStream = fs.createReadStream(targetFilePath);
    fileStream.pipe(res);

    res.on('finish', () => {
      fs.unlink(targetFilePath, () => {});
    });
  });
});

app.listen(PORT, () => {
  console.log(`Media Downloader Server running on port ${PORT}`);
});
