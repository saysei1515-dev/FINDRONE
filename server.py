import os
import json
import re
from fastapi import FastAPI, HTTPException, File, UploadFile, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
import google.generativeai as genai

app = FastAPI()

# CORSの設定（スマホアプリからのアクセスを許可）
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Renderの環境変数からAPIキーを安全に取得
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")
if GEMINI_API_KEY:
    genai.configure(api_key=GEMINI_API_KEY)

# Geminiによる物体検知のエンドポイント
@app.post("/detect-gemini")
async def detect_gemini(file: UploadFile = File(...), query: Form(...)):
    if not GEMINI_API_KEY:
        raise HTTPException(status_code=500, detail="Gemini API key not configured on server")
    
    try:
        image_bytes = await file.read()
        
        # 正式な軽量モデル "gemini-1.5-flash" を使用
        model = genai.GenerativeModel("gemini-1.5-flash")
        
        prompt = f"""この画像の中から「{query}」を探してください。
見つかった場合は、その物体の位置をバウンディングボックス（左上と右下の座標、0から1000の正規化座標）で示し、次のJSON配列の形式だけで正確に答えてください。余計な文章は一切含めないこと。
フォーマット例:
[{{\"box_2d\": [ymin, xmin, ymax, xmax], \"label\": \"{query}\"}}]
見つからない場合は空の配列 [] を返してください。"""

        response = model.generate_content(
            [prompt, {"mime_type": "image/jpeg", "data": image_bytes}],
            generation_config={"response_mime_type": "application/json"}
        )
        
        clean_json = re.sub(r"```json|```", "", response.text).strip()
        return json.loads(clean_json)
    except Exception as e:
        print("Gemini Error:", e)
        return []

# ルートアクセス時に index.html を返す
@app.get("/")
def read_root():
    if os.path.exists("index.html"):
        return FileResponse("index.html")
    return {"status": "FINDRONE Gemini Server is running live!"}

# 静響ファイルの配信設定
app.mount("/", StaticFiles(directory="."), name="static")
