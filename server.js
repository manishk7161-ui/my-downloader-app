const express = require('express');
const cors = require('cors');
const axios = require('axios');
const path = require('path');
const fs = require('fs');
const http = require('http');
const https = require('https');
const { execFile, spawn } = require('child_process');

let ffmpegStaticPath = null;
try {
  ffmpegStaticPath = require('ffmpeg-static');
} catch (e) {}

const app = express();
const PORT = process.env.PORT || 3000;
const BIN_DIR = path.join(__dirname, 'bin');

if (!fs.existsSync(BIN_DIR)) fs.mkdirSync(BIN_DIR, { recursive: true });

const isWin = process.platform === 'win32';
const YTDLP_PATH = path.join(BIN_DIR, isWin ? 'yt-dlp.exe' : 'yt-dlp');
const FFMPEG_DIR = ffmpegStaticPath ? path.dirname(ffmpegStaticPath) : BIN_DIR;

async function ensureYtdlp() {
  try {
    if (!fs.existsSync(YTDLP_PATH)) {
      console.log('Downloading yt-dlp binary for cloud environment...');
      const downloadUrl = isWin
        ? 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe'
        : 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp';

      const response = await axios({ method: 'GET', url: downloadUrl, responseType: 'arraybuffer', timeout: 30000 });
      fs.writeFileSync(YTDLP_PATH, response.data);
      if (!isWin) fs.chmodSync(YTDLP_PATH, '755');
      console.log('yt-dlp binary downloaded successfully.');
    }
  } catch (e) {
    console.error('yt-dlp auto-download warning:', e.message);
  }
}

app.use(cors());
app.use(express.json());

const possiblePaths = [
  path.join(__dirname, 'src'),
  path.join(__dirname, '../src'),
  __dirname
];

possiblePaths.forEach(p => {
  if (fs.existsSync(p)) {
    app.use(express.static(p));
  }
});

app.get('/', (req, res) => {
  const possibleIndexFiles = [
    path.join(__dirname, 'src/index.html'),
    path.join(__dirname, '../src/index.html'),
    path.join(__dirname, 'index.html')
  ];

  for (const file of possibleIndexFiles) {
    if (fs.existsSync(file)) {
      return res.sendFile(file);
    }
  }

  return res.status(200).send('<h1>UltraDownloader Server is Live!</h1>');
});

function detectPlatform(url) {
  if (!url) return null;
  if (/youtube\.com|youtu\.be/i.test(url)) return 'youtube';
  if (/instagram\.com/i.test(url)) return 'instagram';
  if (/facebook\.com|fb\.watch/i.test(url)) return 'facebook';
  return 'unknown';
}

function getVideoMetadata(url, platform) {
  return new Promise((resolve, reject) => {
    execFile(YTDLP_PATH, ['-j', '--no-playlist', url], { maxBuffer: 15 * 1024 * 1024 }, (err, stdout) => {
      let title = `${platform.toUpperCase()} Video`;
      let thumbnail = `https://via.placeholder.com/300x300?text=${platform.toUpperCase()}`;

      if (!err && stdout) {
        try {
          const info = JSON.parse(stdout);
          if (info.title) title = info.title;
          if (info.thumbnail) thumbnail = info.thumbnail;
        } catch (e) {}
      }

      if (platform === 'youtube' && thumbnail.includes('placeholder')) {
        const videoIdMatch = url.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|shorts\/|live\/|watch\?.+&v=))([\w-]{11})/i);
        if (videoIdMatch) thumbnail = `https://img.youtube.com/vi/${videoIdMatch[1]}/hqdefault.jpg`;
      }

      const formats = [
        { label: '1080p Full HD Video', quality: '1080p', type: 'video/mp4', formatCode: 'best[ext=mp4]/bestvideo[ext=mp4]+bestaudio[ext=m4a]/b[ext=mp4]/best', ext: 'mp4' },
        { label: '720p HD Video', quality: '720p', type: 'video/mp4', formatCode: 'best[ext=mp4]/bestvideo[ext=mp4]+bestaudio[ext=m4a]/b[ext=mp4]/best', ext: 'mp4' },
        { label: '480p SD Video', quality: '480p', type: 'video/mp4', formatCode: 'best[ext=mp4]/bestvideo[ext=mp4]+bestaudio[ext=m4a]/b[ext=mp4]/best', ext: 'mp4' },
        { label: 'Audio High Quality (MP3)', quality: 'Audio', type: 'audio/mp3', formatCode: 'bestaudio[ext=m4a]/bestaudio/best', ext: 'mp3' }
      ];

      resolve({
        title,
        thumbnail,
        platform,
        videoId: Date.now().toString(),
        formats
      });
    });
  });
}

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

app.get('/api/download', (req, res) => {
  const { videoUrl, filename } = req.query;
  const safeFilename = (filename || 'downloaded_video.mp4').replace(/[^a-zA-Z0-9_.-]/g, '_');
  const ext = safeFilename.endsWith('.mp3') ? 'mp3' : 'mp4';

  if (!videoUrl) {
    return res.status(400).send('Missing videoUrl parameter.');
  }

  const formatArg = ext === 'mp3' ? 'bestaudio[ext=m4a]/bestaudio/best' : 'best[ext=mp4]/bestvideo[ext=mp4]+bestaudio[ext=m4a]/b[ext=mp4]/best';

  execFile(YTDLP_PATH, ['-g', '-f', formatArg, videoUrl], { timeout: 15000 }, (err, stdout) => {
    if (!err && stdout && stdout.trim()) {
      const urls = stdout.trim().split('\n');
      const cdnUrl = urls[0];
      if (cdnUrl && cdnUrl.startsWith('http')) {
        const client = cdnUrl.startsWith('https') ? https : http;
        return client.get(cdnUrl, (cdnRes) => {
          if (cdnRes.statusCode === 200 || cdnRes.statusCode === 206) {
            const headers = {
              'Content-Type': ext === 'mp3' ? 'audio/mpeg' : 'video/mp4',
              'Content-Disposition': `attachment; filename="${safeFilename}"`
            };
            if (cdnRes.headers['content-length']) {
              headers['Content-Length'] = cdnRes.headers['content-length'];
            }
            res.writeHead(200, headers);
            return cdnRes.pipe(res);
          }
          fallbackStream();
        }).on('error', () => {
          fallbackStream();
        });
      }
    }
    fallbackStream();
  });

  function fallbackStream() {
    const args = ['--no-part', '-f', formatArg, '-o', '-', videoUrl];
    const ytProcess = spawn(YTDLP_PATH, args);

    let headerSent = false;
    ytProcess.stdout.on('data', (chunk) => {
      if (!headerSent) {
        headerSent = true;
        res.writeHead(200, {
          'Content-Type': ext === 'mp3' ? 'audio/mpeg' : 'video/mp4',
          'Content-Disposition': `attachment; filename="${safeFilename}"`
        });
      }
      res.write(chunk);
    });

    ytProcess.stdout.on('end', () => {
      if (headerSent) res.end();
    });

    ytProcess.on('exit', () => {
      if (!headerSent && !res.headersSent) {
        return res.status(500).send('Download error. Please try again.');
      }
    });
  }
});

app.listen(PORT, () => {
  console.log(`Media Downloader Server running on port ${PORT}`);
  ensureYtdlp().catch(console.error);
});
