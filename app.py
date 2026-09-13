"""
Trilha Gramatical — wrapper Streamlit
--------------------------------------
Este arquivo apenas hospeda o app (HTML/CSS/JS já prontos) dentro do Streamlit.
Toda a lógica de exercícios, login e sincronização com Supabase roda no
navegador (arquivos static/index.html, static/styles.css, static/app.js,
static/auth.js, static/content.js) — o Python aqui só serve esses arquivos.

Como rodar localmente:
    pip install -r requirements.txt
    streamlit run app.py

Como publicar no Streamlit Community Cloud:
    1. Suba esta pasta inteira para um repositório no GitHub.
    2. Em https://share.streamlit.io, clique em "New app" e aponte para
       este repositório, branch e arquivo "app.py".
    3. Pronto — o Streamlit gera uma URL pública (ex.: https://SEU-APP.streamlit.app).
"""

import streamlit as st
from pathlib import Path

st.set_page_config(
    page_title="Trilha Gramatical — Prática de Inglês",
    page_icon="📘",
    layout="wide",
)

STATIC_DIR = Path(__file__).parent / "static"

def read_static(filename: str) -> str:
    return (STATIC_DIR / filename).read_text(encoding="utf-8")

def build_bundle() -> str:
    """Inlines CSS/JS into a single HTML string so it can be rendered inside
    an iframe via st.components.v1.html (Streamlit cannot serve separate
    static files on its own)."""
    html = read_static("index.html")
    css = read_static("styles.css")
    content_js = read_static("content.js")
    auth_js = read_static("auth.js")
    app_js = read_static("app.js")

    html = html.replace(
        '<link rel="stylesheet" href="styles.css">',
        f"<style>\n{css}\n</style>",
    )
    html = html.replace('<script src="content.js"></script>', f"<script>\n{content_js}\n</script>")
    html = html.replace('<script src="auth.js"></script>', f"<script>\n{auth_js}\n</script>")
    html = html.replace('<script src="app.js"></script>', f"<script>\n{app_js}\n</script>")
    return html

bundle_html = build_bundle()

# height=0 with scrolling handled internally by the app's own layout;
# a generous fixed height avoids double scrollbars on most screens.
st.components.v1.html(bundle_html, height=920, scrolling=True)
