import os
import json
import re
from fastapi import FastAPI, HTTPException, File, UploadFile, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import google.generativeai as genai

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")
if GEMINI_API_KEY:
    genai.configure(api_key=GEMINI_API_KEY)

@app.post("/detect-gemini")
async def detect_gemini(file: UploadFile = File(...), query: str = Form(...)):
    if not GEMINI_API_KEY:
        raise HTTPException(status_code=500, detail="Gemini API key not configured on server")

    try:
        image_bytes = await file.read()
        if not image_bytes:
            return []

        # ユーザー様ご指定のモデル名に確実に合わせる
        model = genai.GenerativeModel("models/gemini-3.8-flash")

        prompt = f"""この画像の中から「{query}」を探してください。
見つかった場合は、その物体の位置をバウンディングボックス（左上と右下の座標、0から1000の正規化座標）で示し、次のJSON配列の形式だけで正確に答えてください。余計な文章は一切含めないこと。
フォーマット例:
[{{"box_2d": [ymin, xmin, ymax, xmax], "label": "{query}"}}]
見つからない場合は空の配列 [] を返してください。"""

        print(f"📡 Gemini (3.8-flash) に問い合わせ中... 検索ワード: {query}")

        # 最新モデルに合わせたシンプルな呼び出し形式
        response = model.generate_content(
            [prompt, {"mime_type": "image/jpeg", "data": image_bytes}]
        )

        text_result = response.text
        print("📥 Geminiからの応答:", text_result)

        # JSON部分だけをきれいに抽出
        clean_json = re.sub(r"```json|```", "", text_result).strip()
        
        # 配列部分だけを安全に抜き出すための正規表現マッチ
        match = re.search(r'\[.*\]', clean_json, re.DOTALL)
        if match:
            clean_json = match.group(0)

        return json.loads(clean_json)

    except Exception as e:
        print("❌ Gemini Server Error:", str(e))
        return []

# 静的ファイルとindex.htmlをルートに安全に自動配信
app.mount("/", StaticFiles(directory=".", html=True), name="static")