const express = require('express');
const cors = require('cors');
const axios = require('axios');
const path = require('path');
const fs = require('fs');
const { execFile, spawn } = require('child_process');

const app = express();
const PORT = process.env.PORT || 3000;
const BIN_DIR = path.join(__dirname, 'bin');

if (!fs.existsSync(BIN_DIR)) fs.mkdirSync(BIN_DIR, { recursive: true });

const isWin = process.platform === 'win32';
const YTDLP_PATH = path.join(BIN_DIR, isWin ? 'yt-dlp.exe' : 'yt-dlp');

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
              { label: '4K Ultra HD (2160p)', quality: '4K', type: 'video/mp4', formatCode: 'bestvideo[vcodec^=avc1][height<=2160]+bestaudio[acodec^=mp4a]/bestvideo[height<=2160]+bestaudio/best[ext=mp4]/best', ext: 'mp4' },
              { label: '2K Quad HD (1440p)', quality: '2K', type: 'video/mp4', formatCode: 'bestvideo[vcodec^=avc1][height<=1440]+bestaudio[acodec^=mp4a]/bestvideo[height<=1440]+bestaudio/best[ext=mp4]/best', ext: 'mp4' },
              { label: '1080p Full HD', quality: '1080p', type: 'video/mp4', formatCode: 'bestvideo[vcodec^=avc1][height<=1080]+bestaudio[acodec^=mp4a]/bestvideo[height<=1080]+bestaudio/best[ext=mp4]/best', ext: 'mp4' },
              { label: '720p HD', quality: '720p', type: 'video/mp4', formatCode: 'bestvideo[vcodec^=avc1][height<=720]+bestaudio[acodec^=mp4a]/bestvideo[height<=720]+bestaudio/best[ext=mp4]/best', ext: 'mp4' },
              { label: '480p SD', quality: '480p', type: 'video/mp4', formatCode: 'bestvideo[vcodec^=avc1][height<=480]+bestaudio[acodec^=mp4a]/bestvideo[height<=480]+bestaudio/best[ext=mp4]/best', ext: 'mp4' },
              { label: 'Audio High Quality (MP3)', quality: 'Audio', type: 'audio/mp3', formatCode: 'bestaudio[ext=m4a]/bestaudio/best', ext: 'mp3' }
            ]
          });
        }
        return reject(new Error('Could not fetch video details. Please check link.'));
      }

      try {
        const info = JSON.parse(stdout);
        const title = info.title || `${platform.toUpperCase()} Video`;
        const thumbnail = info.thumbnail || `https://via.placeholder.com/300x300?text=${platform.toUpperCase()}`;

        const rawFormats = info.formats || [];
        const formats = [];
        const seenQualities = new Set();

        const heights = [2160, 1440, 1080, 720, 480, 360, 240];
        heights.forEach(h => {
          const hasHeight = rawFormats.some(f => f.height === h || (f.height && Math.abs(f.height - h) < 40));
          if (hasHeight || h === 720 || h === 1080) {
            let label = `${h}p SD`;
            let qTag = `${h}p`;
            if (h >= 2160) { label = '4K Ultra HD (2160p)'; qTag = '4K'; }
            else if (h >= 1440) { label = '2K Quad HD (1440p)'; qTag = '2K'; }
            else if (h >= 1080) { label = '1080p Full HD'; qTag = '1080p'; }
            else if (h >= 720) { label = '720p HD'; qTag = '720p'; }
            else if (h >= 480) { label = '480p SD'; qTag = '480p'; }

            if (!seenQualities.has(label)) {
              seenQualities.add(label);
              formats.push({
                label,
                quality: qTag,
                type: 'video/mp4',
                formatCode: `bestvideo[vcodec^=avc1][height<=${h}]+bestaudio[acodec^=mp4a]/bestvideo[height<=${h}]+bestaudio/best[height<=${h}][ext=mp4]/best`,
                ext: 'mp4'
              });
            }
          }
        });

        formats.push({
          label: 'Audio High Quality (MP3)',
          quality: 'Audio',
          type: 'audio/mp3',
          formatCode: 'bestaudio[ext=m4a]/bestaudio/best',
          ext: 'mp3'
        });

        resolve({
          title,
          thumbnail,
          platform,
          videoId: info.id || Date.now().toString(),
          formats
        });
      } catch (e) {
        reject(new Error('Failed to parse video info.'));
      }
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
  const { videoUrl, formatCode, filename } = req.query;
  const safeFilename = (filename || 'downloaded_video.mp4').replace(/[^a-zA-Z0-9_.-]/g, '_');
  const ext = safeFilename.endsWith('.mp3') ? 'mp3' : 'mp4';

  if (!videoUrl) {
    return res.status(400).send('Missing videoUrl parameter.');
  }

  res.setHeader('Content-Type', ext === 'mp3' ? 'audio/mpeg' : 'video/mp4');
  res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}"`);

  const selectedFormat = formatCode || 'bestvideo[vcodec^=avc1]+bestaudio[acodec^=mp4a]/bestvideo+bestaudio/best[ext=mp4]/best';
  const args = ['--ffmpeg-location', BIN_DIR, '--no-part', '-f', selectedFormat, '-o', '-', videoUrl];

  console.log(`Piping direct H.264 MP4 stream for ${safeFilename}...`);
  const ytProcess = spawn(YTDLP_PATH, args);

  ytProcess.stdout.pipe(res);

  ytProcess.stderr.on('data', (d) => {
    const msg = d.toString();
    if (msg.includes('ERROR:')) console.error('yt-dlp stream error:', msg);
  });

  req.on('close', () => {
    try {
      ytProcess.kill();
    } catch (e) {}
  });
});

app.listen(PORT, () => {
  console.log(`Media Downloader Server running on port ${PORT}`);
  ensureYtdlp().catch(console.error);
});
