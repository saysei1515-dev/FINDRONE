let webcamRunning = false;
let lastVideoTime = -1;
let currentSearchWord = "赤い財布";
let lastSaveTime = 0; 

// 枠を画面に消えずに残し続けるための変数
let cachedDetections = [];
let boxExpireTime = 0;

let peer = null;
let conn = null;

let video, canvas, ctx, statusBox, startButton, stopButton, connStatus;

// ▼ Florence-2 用の変数
let florenceModel = null;
let florenceProcessor = null;
let florenceTokenizer = null;
let isModelLoaded = false;

// ページ全体の読み込みが完了してから安全に初期化を実行
window.addEventListener('DOMContentLoaded', async () => {
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

  // ▼ Florence-2 モデルの事前ロード開始
  if (statusBox) {
    statusBox.innerText = "ステータス: AIモデル(Florence-2)をロード中...";
    statusBox.style.color = "#ffc107";
  }

  try {
    const { AutoProcessor, AutoTokenizer, Florence2ForConditionalGeneration } = window.Florence2Helper;
    const model_id = 'onnx-community/Florence-2-base-ft';
    
    florenceModel = await Florence2ForConditionalGeneration.from_pretrained(model_id, {
      dtype: {
        embed_tokens: 'fp16',
        vision_encoder: 'fp16',
        encoder_model: 'q4',
        decoder_model_merged: 'q4',
      },
      device: 'wasm',
    });

    florenceProcessor = await AutoProcessor.from_pretrained(model_id);
    florenceTokenizer = await AutoTokenizer.from_pretrained(model_id);
    isModelLoaded = true;

    if (statusBox) {
      statusBox.innerText = "ステータス: 準備完了（Florence-2ブラウザ実行モード）";
      statusBox.style.color = "#00ff00";
    }
  } catch (err) {
    console.error("Florence-2モデルのロードに失敗:", err);
    if (statusBox) {
      statusBox.innerText = "ステータス: AIモデルのロードに失敗しました";
      statusBox.style.color = "#dc3545";
    }
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
    if (statusBox && isModelLoaded) {
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
  cachedDetections = [];
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
    // 処理間隔を調整（Florence-2の負荷を考慮して3秒おき）
    if (now - lastSaveTime > 3000 && isModelLoaded) {
      lastSaveTime = now;
      try {
        const tempCanvas = document.createElement("canvas");

        const MAX_WIDTH = 640;
        let targetWidth = video.videoWidth;
        let targetHeight = video.videoHeight;
        if (targetWidth > MAX_WIDTH) {
          targetHeight = Math.round((targetHeight * MAX_WIDTH) / targetWidth);
          targetWidth = MAX_WIDTH;
        }
        tempCanvas.width = targetWidth;
        tempCanvas.height = targetHeight;

        const tempCtx = tempCanvas.getContext("2d");
        tempCtx.drawImage(video, 0, 0, tempCanvas.width, tempCanvas.height);

        const dataUrl = tempCanvas.toDataURL("image/jpeg", 0.8);

        // ▼ Florence-2によるローカル推論の実行
        const detections = await detectObjectWithFlorence(dataUrl, currentSearchWord);

        if (detections && detections.length > 0) {
          cachedDetections = detections;
          boxExpireTime = Date.now() + 2500;

          if (statusBox) {
            statusBox.innerText = `🎉 「${currentSearchWord}」を発見しました！`;
            statusBox.style.color = "#00ff00";
          }
          addGalleryThumbnail(dataUrl);
        }
      } catch (err) {
        console.error("Florence-2推論エラー:", err);
      }
    }
  }

  // 毎フレームの描画処理
  if (ctx && canvas) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (Date.now() < boxExpireTime && cachedDetections.length > 0) {
      const scaleX = canvas.width / video.videoWidth;
      const scaleY = canvas.height / video.videoHeight;

      cachedDetections.forEach(det => {
        // Florence-2の出力座標形式 [x1, y1, x2, y2] に対応
        const [x1, y1, x2, y2] = det.box_2d;
        const x = x1 * scaleX;
        const y = y1 * scaleY;
        const w = (x2 - x1) * scaleX;
        const h = (y2 - y1) * scaleY;

        ctx.strokeStyle = "#00ff00";
        ctx.lineWidth = 4;
        ctx.strokeRect(x, y, w, h);
        ctx.fillStyle = "rgba(0, 255, 0, 0.7)";
        ctx.fillRect(x, y > 25 ? y - 25 : 0, w, 25);
        ctx.fillStyle = "#000";
        ctx.font = "bold 14px sans-serif";
        ctx.fillText(det.label || currentSearchWord, x + 5, y > 25 ? y - 7 : 18);
      });
    }
  }

  if (webcamRunning) {
    window.requestAnimationFrame(predictWebcam);
  }
}

// ▼ Florence-2 専用の推論関数（サーバー通信なし・ブラウザ内完結）
async function detectObjectWithFlorence(dataUrl, searchQuery) {
  if (!isModelLoaded) return [];
  try {
    const { RawImage } = window.Florence2Helper;
    const image = await RawImage.fromURL(dataUrl);

    const task = '<CAPTION_TO_PHRASE_GROUNDING>';
    const prompt = task + searchQuery; // 例: "<CAPTION_TO_PHRASE_GROUNDING>red wallet"

    const text_inputs = florenceTokenizer(prompt);
    const vision_inputs = await florenceProcessor(image);

    const generated_ids = await florenceModel.generate({
      ...text_inputs,
      ...vision_inputs,
      max_new_tokens: 100,
    });

    const generated_text = florenceTokenizer.batch_decode(generated_ids, { skip_special_tokens: false })[0];
    const result = florenceProcessor.post_process_generation(generated_text, task, image.size);

    const parsed = result[task] || { bboxes: [], labels: [] };

    // 既存コードの形式（{ box_2d: [x1, y1, x2, y2], label: ... }）に変換して返す
    const detections = [];
    for (let i = 0; i < parsed.bboxes.length; i++) {
      detections.push({
        box_2d: parsed.bboxes[i],
        label: parsed.labels[i] || searchQuery
      });
    }
    return detections;
  } catch (err) {
    console.error("Florence処理失敗:", err);
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