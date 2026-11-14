import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

app = FastAPI()

# CORSの設定（スマホアプリからのアクセスを許可）
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ルート（https://your-app.onrender.com/）にアクセスされたときに index.html を返す
@app.get("/")
def read_root():
    if os.path.exists("index.html"):
        return FileResponse("index.html")
    return {"status": "FINDRONE Gemini Server is running live!"}

# 同階層にあるCSSやJavaScript、画像などの静的ファイルを公開する設定
app.mount("/", StaticFiles(directory="."), name="static")
