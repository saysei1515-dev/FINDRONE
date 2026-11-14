import cv2
import numpy as np
from fastapi import FastAPI, File, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from ultralytics import YOLO

app = FastAPI()

# CORSの設定（スマホアプリからのアクセスを許可）
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# YOLO-Worldモデルの読み込み
model = YOLO("yolov8s-world.pt")

# 検知したいカスタムクラスを事前に設定
model.set_classes(["red box", "person", "drone", "target"])


@app.post("/detect")
async def detect(file: UploadFile = File(...)):
  # アップロードされた画像データを受信
  contents = await file.read()
  nparr = np.frombuffer(contents, np.uint8)
  img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

  # YOLO-Worldで推論を実行
  results = model(img, conf=0.25)

  # 検出されたバウンディングボックスの情報をまとめる
  detections = []
  for r in results:
    boxes = r.boxes
    for box in boxes:
      x1, y1, x2, y2 = box.xyxy[0].tolist()
      conf = float(box.conf[0])
      cls_id = int(box.cls[0])
      cls_name = model.names[cls_id]

      detections.append({
          "class": cls_name,
          "confidence": conf,
          "box": [x1, y1, x2, y2],
      })

  return {"detections": detections}
