let webcamRunning = false;
let lastVideoTime = -1;
let currentSearchWord = "赤い財布";
let lastSaveTime = 0; 

let peer = null;
let conn = null;

let video, canvas, ctx, statusBox, startButton, stopButton, connStatus;

// ページ全体の読み込みが完了してから安全に初期化を実行
window.addEventListener('DOMContentLoaded', () => {
  video = document.getElementById("video");
  canvas = document.getElementById("outputCanvas");
  if (canvas) ctx = canvas.getContext("2d");
  statusBox = document.getElementById("status");
  startButton = document.getElementById("startButton");
  stopButton = document.getElementById("stopButton");
  connStatus = document.getElementById("connectionStatus");

  try {
    peer = new Peer();
    peer.on('open', (id) => {
      console.log("PeerJS Connected, ID:", id);
    });
    peer.on('error', (err) => {
      console.error("PeerJSエラー:", err);
    });
    peer.on('call', (call) => {
      call.answer();
      call.on('stream', (remoteStream) => {
        if (video) {
          video.srcObject = remoteStream;
          webcamRunning = true;
          if (startButton) startButton.style.display = "none";
          if (stopButton) stopButton.style.display = "block";
          if (statusBox) {
            statusBox.innerText = `ステータス: 「${currentSearchWord}」を探索中...`;
            statusBox.style.color = "#00ff00";
          }
          video.onloadeddata = () => { predictWebcam(); };
        }
      });
    });
  } catch (e) {
    console.error("Peer初期化失敗:", e);
  }

  if (statusBox) {
    statusBox.innerText = "ステータス: 準備完了（Renderサーバー経由モード）";
    statusBox.style.color = "#00ff00";
  }
});

// タブ切り替え
window.switchTab = function(tabName) {
  document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
  if (tabName === 'search') {
    document.querySelector('.tab-menu button:nth-child(1)').classList.add('active');
    document.getElementById('searchTab').classList.add('active');
  } else {
    document.querySelector('.tab-menu button:nth-child(2)').classList.add('active');
    document.getElementById('registerTab').classList.add('active');
  }
};

// PC接続
window.connectToPC = function() {
  const pcIdInput = document.getElementById("pcIdInput");
  if (!pcIdInput) return;
  const pcId = pcIdInput.value.trim();
  if (!pcId) { alert("PCのIDを入力してください！"); return; }
  if (connStatus) {
    connStatus.innerText = "ステータス: 接続中...";
    connStatus.style.color = "#ffc107";
  }
  conn = peer.connect(pcId);
  conn.on('open', () => {
    if (connStatus) {
      connStatus.innerText = "ステータス: 接続完了 ✅";
      connStatus.style.color = "#28a745";
    }
    if (startButton) {
      startButton.disabled = false;
      startButton.innerText = "遠隔カメラ起動 & 探索スタート";
    }
    if (statusBox) {
      statusBox.innerText = "ステータス: 準備完了";
      statusBox.style.color = "#00ff00";
    }
  });
};

// 探す言葉の更新
window.updateTarget = function() {
  const targetObj = document.getElementById("targetObject");
  if (!targetObj) return;
  const inputVal = targetObj.value.trim();
  if (!inputVal) { alert("探すものを入力してください！"); return; }
  currentSearchWord = inputVal;
  if (statusBox) {
    statusBox.innerText = `🎯 「${currentSearchWord}」を探します`;
    statusBox.style.color = "#00ff00";
  }
};

window.startCamera = function() {
  const targetObj = document.getElementById("targetObject");
  if (!targetObj) return;
  const inputVal = targetObj.value.trim();
  if (!inputVal) {
    alert("探すものを入力してください！");
    targetObj.focus();
    return;
  }
  if (!conn || !conn.open) { alert("先にPCと接続してください！"); return; }
  currentSearchWord = inputVal;
  conn.send({ action: 'start', keyword: currentSearchWord, smartphoneId: peer.id });
  if (statusBox) statusBox.innerText = "ステータス: 遠隔カメラ起動要求を送信中...";
};

window.stopCamera = function() {
  if (conn && conn.open) conn.send({ action: 'stop' });
  webcamRunning = false;
  if (video && video.srcObject) video.srcObject.getTracks().forEach(t => t.stop());
  if (video) video.srcObject = null;
  if (ctx && canvas) ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (stopButton) stopButton.style.display = "none";
  if (startButton) startButton.style.display = "block";
  if (statusBox) statusBox.innerText = "ステータス: 停止しました";
};

// ================= リアルタイム推論ループ =================
async function predictWebcam() {
  if (!webcamRunning) return;

  if (video && video.videoWidth > 0 && video.videoHeight > 0) {
    const displayWidth = video.clientWidth;
    const displayHeight = video.clientHeight;
    if (canvas.width !== displayWidth || canvas.height !== displayHeight) {
      canvas.width = displayWidth;
      canvas.height = displayHeight;
    }
  }

  if (video && video.currentTime !== lastVideoTime) {
    lastVideoTime = video.currentTime;

    const now = Date.now();
    if (now - lastSaveTime > 3000) {
      lastSaveTime = now;
      try {
        const tempCanvas = document.createElement("canvas");
        tempCanvas.width = video.videoWidth;
        tempCanvas.height = video.videoHeight;
        const tempCtx = tempCanvas.getContext("2d");
        tempCtx.drawImage(video, 0, 0, tempCanvas.width, tempCanvas.height);
        const base64Image = tempCanvas.toDataURL("image/jpeg").split(",")[1];

        const detections = await detectObjectWithGemini(base64Image, currentSearchWord);

        if (ctx && canvas) ctx.clearRect(0, 0, canvas.width, canvas.height);

        if (detections && detections.length > 0) {
          if (statusBox) {
            statusBox.innerText = `🎉 「${currentSearchWord}」を発見しました！`;
            statusBox.style.color = "#00ff00";
          }

          const scaleX = canvas.width / video.videoWidth;
          const scaleY = canvas.height / video.videoHeight;

          detections.forEach(det => {
            const [ymin, xmin, ymax, xmax] = det.box_2d;
            const x = (xmin / 1000) * video.videoWidth * scaleX;
            const y = (ymin / 1000) * video.videoHeight * scaleY;
            const w = ((xmax - xmin) / 1000) * video.videoWidth * scaleX;
            const h = ((ymax - ymin) / 1000) * video.videoHeight * scaleY;

            ctx.strokeStyle = "#00ff00";
            ctx.lineWidth = 4;
            ctx.strokeRect(x, y, w, h);
            ctx.fillStyle = "rgba(0, 255, 0, 0.7)";
            ctx.fillRect(x, y > 25 ? y - 25 : 0, w, 25);
            ctx.fillStyle = "#000";
            ctx.font = "bold 14px sans-serif";
            ctx.fillText(det.label || currentSearchWord, x + 5, y > 25 ? y - 7 : 18);
          });

          addGalleryThumbnail(tempCanvas.toDataURL("image/jpeg"));
        } else {
          if (statusBox) {
            statusBox.innerText = `🔍 「${currentSearchWord}」を探索中...`;
            statusBox.style.color = "#aaa";
          }
        }
      } catch (err) {
        console.error("サーバー通信エラー:", err);
      }
    }
  }

  if (webcamRunning) {
    window.requestAnimationFrame(predictWebcam);
  }
}

async function detectObjectWithGemini(base64Image, searchQuery) {
  try {
    const res = await fetch(`data:image/jpeg;base64,${base64Image}`);
    const blob = await res.blob();

    const formData = new FormData();
    formData.append("file", blob, "image.jpg");
    formData.append("query", searchQuery);

    const response = await fetch('/detect-gemini', {
      method: "POST",
      body: formData
    });

    if (!response.ok) {
      console.error("サーバー応答エラー:", response.status);
      return [];
    }

    const result = await response.json();
    return Array.isArray(result) ? result : [];
  } catch (err) {
    console.error("fetchエラー:", err);
    return [];
  }
}

function addGalleryThumbnail(dataUrl) {
  const gallery = document.getElementById("imageGallery");
  if (!gallery) return;
  const img = document.createElement("img");
  img.src = dataUrl;
  img.style.cssText = "width: 80px; height: 80px; object-fit: cover; border-radius: 8px; border: 2px solid #00ff00; cursor: pointer; flex-shrink: 0;";
  img.onclick = () => {
    const modal = document.getElementById("imagePreviewModal");
    const previewImg = document.getElementById("previewImage");
    if (modal && previewImg) {
      previewImg.src = dataUrl;
      modal.style.display = "flex";
    }
  };
  gallery.prepend(img);
}

window.closePreview = function() {
  const modal = document.getElementById("imagePreviewModal");
  if (modal) modal.style.display = "none";
};

window.clearGallery = function() {
  const gallery = document.getElementById("imageGallery");
  if (gallery) gallery.innerHTML = "";
};