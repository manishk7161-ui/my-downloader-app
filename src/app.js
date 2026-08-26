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

  const shareWhatsappBtn = document.getElementById('shareWhatsappBtn');
  const pwaInstallBtn = document.getElementById('pwaInstallBtn');

  let deferredPrompt;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    if (pwaInstallBtn) pwaInstallBtn.classList.remove('hidden');
  });

  if (pwaInstallBtn) {
    pwaInstallBtn.addEventListener('click', async () => {
      if (deferredPrompt) {
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        if (outcome === 'accepted') {
          pwaInstallBtn.classList.add('hidden');
        }
        deferredPrompt = null;
      }
    });
  }

  if (shareWhatsappBtn) {
    shareWhatsappBtn.addEventListener('click', () => {
      const text = encodeURIComponent(`🔥 Download YouTube, Instagram Reels & Facebook Videos in HD Free without watermark!\nTry now: ${window.location.href}`);
      window.open(`https://api.whatsapp.com/send?text=${text}`, '_blank');
    });
  }

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

  function displayVideoPreview(originalUrl, data) {
    videoThumb.src = data.thumbnail || 'https://via.placeholder.com/150';
    videoTitle.textContent = data.title || 'Video Preview';
    
    const platform = data.platform.toUpperCase();
    platformTag.textContent = platform;
    if (platform === 'YOUTUBE') {
      platformTag.className = 'inline-block px-2.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-rose-950 text-rose-300 border border-rose-800';
    } else if (platform === 'INSTAGRAM') {
      platformTag.className = 'inline-block px-2.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-pink-950 text-pink-300 border border-pink-800';
    } else if (platform === 'FACEBOOK') {
      platformTag.className = 'inline-block px-2.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-blue-950 text-blue-300 border border-blue-800';
    }

    qualityOptions.innerHTML = '';
    data.formats.forEach((fmt) => {
      const optionCard = document.createElement('div');
      optionCard.className = 'quality-option-card flex items-center justify-between p-3.5 bg-slate-900 border border-slate-800 rounded-xl cursor-pointer shadow-sm';
      optionCard.innerHTML = `
        <div class="flex items-center space-x-3 overflow-hidden">
          <div class="w-9 h-9 rounded-xl bg-indigo-950/80 border border-indigo-700/50 flex items-center justify-center text-indigo-400 text-sm shrink-0">
            <i class="fa-solid ${fmt.ext === 'mp3' ? 'fa-music text-purple-400' : 'fa-film text-indigo-400'}"></i>
          </div>
          <div class="truncate">
            <h5 class="text-xs font-bold text-slate-200 truncate">${fmt.label}</h5>
            <p class="text-[10px] text-emerald-400 font-medium">1-Tap System Download</p>
          </div>
        </div>
        <button class="bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white text-xs font-extrabold px-4 py-2 rounded-xl shadow-md flex items-center space-x-1.5 transition shrink-0">
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

  function triggerDownload(videoUrl, title, format) {
    const cleanTitle = (title || 'video').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 30);
    const fileName = `${cleanTitle}_${format.quality}.${format.ext}`;

    const downloadUrl = `/api/download?videoUrl=${encodeURIComponent(videoUrl)}&formatCode=${encodeURIComponent(format.formatCode)}&filename=${encodeURIComponent(fileName)}`;

    if (progressCard) {
      progressCard.classList.remove('hidden');
      downloadFileName.textContent = fileName;
      downloadPercentage.textContent = 'Starting...';
      progressBar.style.width = '100%';
      downloadStatus.textContent = 'Downloading to Device Storage...';

      setTimeout(() => {
        progressCard.classList.add('hidden');
      }, 5000);
    }

    const a = document.createElement('a');
    a.href = downloadUrl;
    a.download = fileName;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
    }, 1000);
  }
});
