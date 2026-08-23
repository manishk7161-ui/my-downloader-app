document.addEventListener('DOMContentLoaded', () => {
  const videoUrlInput = document.getElementById('videoUrl');
  const pasteBtn = document.getElementById('pasteBtn');
  const fetchBtn = document.getElementById('fetchBtn');
  const statusMessage = document.getElementById('statusMessage');
  
  const previewCard = document.getElementById('previewCard');
  const videoThumb = document.getElementById('videoThumb');
  const videoTitle = document.getElementById('videoTitle');
  const platformTag = document.getElementById('platformTag');
  const qualityOptions = document.getElementById('qualityOptions');

  const progressCard = document.getElementById('progressCard');
  const downloadFileName = document.getElementById('downloadFileName');
  const downloadPercentage = document.getElementById('downloadPercentage');
  const progressBar = document.getElementById('progressBar');
  const downloadSpeed = document.getElementById('downloadSpeed');
  const downloadStatus = document.getElementById('downloadStatus');

  // Clipboard Paste Button
  pasteBtn.addEventListener('click', async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        videoUrlInput.value = text;
      }
    } catch (err) {
      alert('Please paste the URL manually.');
    }
  });

  // Analyze Link Button
  fetchBtn.addEventListener('click', async () => {
    const url = videoUrlInput.value.trim();
    if (!url) {
      alert('Please enter or paste a valid video URL.');
      return;
    }

    statusMessage.classList.remove('hidden');
    previewCard.classList.add('hidden');

    try {
      const response = await fetch('/api/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url })
      });

      const resData = await response.json();
      statusMessage.classList.add('hidden');

      if (!resData.success) {
        alert(resData.error || 'Failed to extract video information.');
        return;
      }

      displayVideoPreview(url, resData.data);
    } catch (err) {
      statusMessage.classList.add('hidden');
      alert('Error connecting to extraction server.');
    }
  });

  // Display video details & quality options
  function displayVideoPreview(originalUrl, data) {
    videoThumb.src = data.thumbnail || 'https://via.placeholder.com/150';
    videoTitle.textContent = data.title || 'Video Preview';
    
    // Platform Badge Styling
    const platform = data.platform.toUpperCase();
    platformTag.textContent = platform;
    if (platform === 'YOUTUBE') {
      platformTag.className = 'inline-block px-2.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-rose-950 text-rose-300 border border-rose-800';
    } else if (platform === 'INSTAGRAM') {
      platformTag.className = 'inline-block px-2.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-pink-950 text-pink-300 border border-pink-800';
    } else if (platform === 'FACEBOOK') {
      platformTag.className = 'inline-block px-2.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-blue-950 text-blue-300 border border-blue-800';
    }

    // Render Quality Buttons
    qualityOptions.innerHTML = '';
    data.formats.forEach((fmt) => {
      const optionCard = document.createElement('div');
      optionCard.className = 'quality-option-card flex items-center justify-between p-3.5 bg-slate-900 border border-slate-800 rounded-xl cursor-pointer shadow-sm';
      optionCard.innerHTML = `
        <div class="flex items-center space-x-3 overflow-hidden">
          <div class="w-9 h-9 rounded-xl bg-indigo-950/80 border border-indigo-700/50 flex items-center justify-center text-indigo-400 text-sm shrink-0">
            <i class="fa-solid ${fmt.ext === 'mp3' ? 'fa-music text-purple-400' : 'fa-video text-indigo-400'}"></i>
          </div>
          <div class="truncate">
            <h5 class="text-xs font-bold text-slate-200 truncate">${fmt.label}</h5>
            <p class="text-[10px] text-slate-400">Audio + Video Merged • Playable MP4</p>
          </div>
        </div>
        <button class="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold px-3.5 py-2 rounded-xl shadow-md flex items-center space-x-1.5 transition shrink-0">
          <i class="fa-solid fa-download"></i>
          <span>Download</span>
        </button>
      `;

      optionCard.querySelector('button').addEventListener('click', (e) => {
        e.stopPropagation();
        triggerDownload(originalUrl, data.title, fmt);
      });

      qualityOptions.appendChild(optionCard);
    });

    previewCard.classList.remove('hidden');
    previewCard.scrollIntoView({ behavior: 'smooth' });
  }

  // Trigger Video Download & Progress simulation
  function triggerDownload(videoUrl, title, format) {
    const cleanTitle = (title || 'video').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 30);
    const fileName = `${cleanTitle}_${format.quality}.${format.ext}`;

    progressCard.classList.remove('hidden');
    progressCard.scrollIntoView({ behavior: 'smooth' });

    downloadFileName.textContent = fileName;
    downloadPercentage.textContent = '0%';
    progressBar.style.width = '0%';
    downloadStatus.textContent = 'Merging video & audio with FFmpeg...';

    let percent = 0;
    const interval = setInterval(() => {
      percent += Math.floor(Math.random() * 10) + 5;
      if (percent >= 100) {
        percent = 100;
        clearInterval(interval);

        downloadPercentage.textContent = '100%';
        progressBar.style.width = '100%';
        downloadStatus.textContent = 'Download Complete!';

        // Actual browser file download via ffmpeg stream endpoint
        const downloadUrl = `/api/download?videoUrl=${encodeURIComponent(videoUrl)}&formatCode=${encodeURIComponent(format.formatCode)}&filename=${encodeURIComponent(fileName)}`;
        const a = document.createElement('a');
        a.href = downloadUrl;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);

        setTimeout(() => {
          progressCard.classList.add('hidden');
        }, 4500);
      } else {
        downloadPercentage.textContent = `${percent}%`;
        progressBar.style.width = `${percent}%`;
        downloadSpeed.textContent = `Speed: ${(Math.random() * 3 + 4).toFixed(1)} MB/s`;
        downloadStatus.textContent = percent < 60 ? 'Downloading video & audio streams...' : 'Merging into playable MP4...';
      }
    }, 350);
  }
});
