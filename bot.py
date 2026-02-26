"""
BotPanel — Telegram AI Bot
Клиент выбирает AI провайдера через кнопки в Telegram.
Настройки (включённые провайдеры, модели) — из Firebase Firestore.
API ключи AI провайдеров — из переменных окружения (не хранятся у клиента).

Запуск:
    OPENAI_API_KEY=sk-... GEMINI_API_KEY=AIza... ANTHROPIC_API_KEY=sk-ant-... \
    python bot.py --uid USER_ID --key serviceAccount.json
"""

import argparse
import asyncio
import logging
import os
import sys
from datetime import datetime, timezone

import firebase_admin
from firebase_admin import credentials, firestore
from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup
from telegram.ext import (
    Application,
    MessageHandler,
    CommandHandler,
    CallbackQueryHandler,
    filters,
    ContextTypes,
)

logging.basicConfig(
    format="%(asctime)s [%(levelname)s] %(message)s",
    level=logging.INFO,
    handlers=[logging.StreamHandler(sys.stdout)],
)
log = logging.getLogger(__name__)

db = None
USER_ID = None

# API ключи платформы — берутся из переменных окружения
PLATFORM_KEYS = {
    "openai": os.environ.get("OPENAI_API_KEY", ""),
    "gemini": os.environ.get("GEMINI_API_KEY", ""),
    "claude": os.environ.get("ANTHROPIC_API_KEY", ""),
}

# Хранит выбор AI для каждого клиента: { telegram_user_id: "openai"|"gemini"|"claude" }
user_ai_choice: dict[int, str] = {}

PROVIDER_NAMES = {
    "openai": "🟢 OpenAI GPT",
    "gemini": "🔵 Google Gemini",
    "claude": "🟠 Anthropic Claude",
}


# ══════════════════════════════════════════════════════════════════════════════
# FIREBASE
# ══════════════════════════════════════════════════════════════════════════════

def user_col(name: str):
    return db.collection("users").document(USER_ID).collection(name)


def get_bot_config() -> dict:
    docs = user_col("bots").limit(1).get()
    for doc in docs:
        return doc.to_dict()
    return {}


def get_ai_providers() -> dict:
    """Возвращает dict с настройками провайдеров клиента (enabled, model)."""
    doc = user_col("settings").document("ai").get()
    if doc.exists:
        return doc.to_dict().get("providers", {})
    return {}


def get_enabled_providers() -> list[str]:
    """Возвращает список включённых провайдеров у которых есть платформенный API ключ."""
    providers = get_ai_providers()
    return [p for p in ["openai", "gemini", "claude"]
            if providers.get(p, {}).get("enabled") and PLATFORM_KEYS.get(p)]


def get_agent_active() -> bool:
    doc = user_col("settings").document("agent").get()
    if doc.exists:
        return doc.to_dict().get("active", True)
    return True


def get_rules() -> str:
    doc = user_col("settings").document("rules").get()
    if doc.exists:
        return doc.to_dict().get("text", "")
    return ""


def get_kb_items() -> list[dict]:
    docs = user_col("kbItems").order_by("_ts").get()
    return [d.to_dict() for d in docs]


def save_unanswered(question: str):
    user_col("unanswered").add({
        "text": question,
        "_ts": firestore.SERVER_TIMESTAMP,
    })


def save_topic(question: str):
    user_col("topics").add({
        "name": question[:80],
        "chats": 1,
        "last": datetime.now(timezone.utc).strftime("%d.%m.%Y %H:%M"),
        "_ts": firestore.SERVER_TIMESTAMP,
    })


# ══════════════════════════════════════════════════════════════════════════════
# AI PROVIDERS
# ══════════════════════════════════════════════════════════════════════════════

def build_prompt(question: str, kb_items: list[dict], rules: str) -> str:
    kb_text = "\n\n".join(
        f"### {i.get('title','')}\n{i.get('content','')}"
        for i in kb_items if i.get("title") and i.get("content")
    )
    system = rules.strip() or (
        "Ты — вежливый ассистент. Отвечай только на основе базы знаний. "
        "Если информации нет — скажи: «Уточните у менеджера». Не придумывай."
    )
    return f"{system}\n\nБаза знаний:\n{kb_text}\n\nВопрос: {question}"


async def ask_openai(prompt: str, api_key: str, model: str) -> str:
    from openai import AsyncOpenAI
    client = AsyncOpenAI(api_key=api_key)
    r = await client.chat.completions.create(
        model=model or "gpt-4o-mini",
        messages=[{"role": "user", "content": prompt}],
        max_tokens=1000, temperature=0.3,
    )
    return r.choices[0].message.content.strip()


async def ask_gemini(prompt: str, api_key: str, model: str) -> str:
    import google.generativeai as genai
    genai.configure(api_key=api_key)
    m = genai.GenerativeModel(model or "gemini-1.5-flash")
    r = await asyncio.to_thread(m.generate_content, prompt)
    return r.text.strip()


async def ask_claude(prompt: str, api_key: str, model: str) -> str:
    import anthropic
    client = anthropic.Anthropic(api_key=api_key)
    msg = await asyncio.to_thread(
        client.messages.create,
        model=model or "claude-haiku-4-5-20251001",
        max_tokens=1000,
        messages=[{"role": "user", "content": prompt}],
    )
    return msg.content[0].text.strip()


async def get_answer(question: str, provider: str) -> tuple[str, bool]:
    api_key = PLATFORM_KEYS.get(provider, "")
    if not api_key:
        return "⚠️ Провайдер временно недоступен. Попробуйте другой.", False

    providers = get_ai_providers()
    model = providers.get(provider, {}).get("model", "")

    kb    = get_kb_items()
    rules = get_rules()
    prompt = build_prompt(question, kb, rules)

    try:
        if provider == "openai":
            answer = await ask_openai(prompt, api_key, model)
        elif provider == "gemini":
            answer = await ask_gemini(prompt, api_key, model)
        elif provider == "claude":
            answer = await ask_claude(prompt, api_key, model)
        else:
            return "Неизвестный провайдер.", False

        refuse = ["уточните у менеджера", "не знаю", "нет информации", "не могу ответить"]
        answered = not any(p in answer.lower() for p in refuse)
        return answer, answered

    except Exception as e:
        log.error(f"AI ошибка ({provider}): {e}")
        return "Произошла ошибка. Попробуйте позже.", False


# ══════════════════════════════════════════════════════════════════════════════
# KEYBOARDS
# ══════════════════════════════════════════════════════════════════════════════

def make_ai_keyboard(enabled: list[str]) -> InlineKeyboardMarkup:
    buttons = [
        InlineKeyboardButton(PROVIDER_NAMES[p], callback_data=f"choose_ai:{p}")
        for p in enabled
    ]
    rows = [buttons[i:i+2] for i in range(0, len(buttons), 2)]
    return InlineKeyboardMarkup(rows)


# ══════════════════════════════════════════════════════════════════════════════
# HANDLERS
# ══════════════════════════════════════════════════════════════════════════════

async def cmd_start(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    enabled = get_enabled_providers()
    uid = update.message.from_user.id

    if not enabled:
        await update.message.reply_text(
            "👋 Привет! Бот настраивается. Скоро буду готов помочь."
        )
        return

    if len(enabled) == 1:
        user_ai_choice[uid] = enabled[0]
        rules = get_rules()
        greeting = "👋 Привет! Задайте любой вопрос."
        for line in rules.split("\n"):
            if "привет" in line.lower() or "здравствуй" in line.lower():
                greeting = line.strip()
                break
        await update.message.reply_text(greeting)
    else:
        await update.message.reply_text(
            "👋 Привет! Выберите AI ассистента:",
            reply_markup=make_ai_keyboard(enabled)
        )


async def cmd_ai(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    """Команда /ai — сменить провайдера."""
    enabled = get_enabled_providers()
    if len(enabled) <= 1:
        await update.message.reply_text("Доступен только один AI провайдер.")
        return
    await update.message.reply_text(
        "Выберите AI ассистента:",
        reply_markup=make_ai_keyboard(enabled)
    )


async def callback_choose_ai(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()

    provider = query.data.split(":")[1]
    uid = query.from_user.id
    user_ai_choice[uid] = provider

    name = PROVIDER_NAMES.get(provider, provider)
    await query.edit_message_text(
        f"✅ Выбрано: *{name}*\n\nТеперь задайте ваш вопрос.",
        parse_mode="Markdown"
    )
    log.info(f"Пользователь {uid} выбрал: {provider}")


async def handle_message(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    question = update.message.text.strip()
    if not question:
        return

    uid  = update.message.from_user.id
    name = update.message.from_user.first_name or str(uid)
    log.info(f"Вопрос от {name} ({uid}): {question[:60]}")

    if not get_agent_active():
        await update.message.reply_text("🔇 Бот временно недоступен. Попробуйте позже.")
        return

    enabled = get_enabled_providers()
    if not enabled:
        await update.message.reply_text("⚠️ AI не настроен. Обратитесь к администратору.")
        return

    if uid not in user_ai_choice:
        if len(enabled) == 1:
            user_ai_choice[uid] = enabled[0]
        else:
            await update.message.reply_text(
                "Сначала выберите AI ассистента:",
                reply_markup=make_ai_keyboard(enabled)
            )
            return

    provider = user_ai_choice[uid]

    if provider not in enabled:
        del user_ai_choice[uid]
        await update.message.reply_text(
            f"Провайдер {PROVIDER_NAMES.get(provider, provider)} больше недоступен. Выберите другой:",
            reply_markup=make_ai_keyboard(enabled)
        )
        return

    await update.message.chat.send_action("typing")
    answer, is_answered = await get_answer(question, provider)

    footer = f"\n\n_— {PROVIDER_NAMES[provider]}_" if len(enabled) > 1 else ""
    await update.message.reply_text(answer + footer, parse_mode="Markdown")

    if is_answered:
        save_topic(question)
    else:
        save_unanswered(question)


async def handle_error(update: object, ctx: ContextTypes.DEFAULT_TYPE):
    log.error(f"Ошибка: {ctx.error}")


# ══════════════════════════════════════════════════════════════════════════════
# MAIN
# ══════════════════════════════════════════════════════════════════════════════

def main():
    global db, USER_ID

    parser = argparse.ArgumentParser(description="BotPanel Telegram Bot")
    parser.add_argument("--uid", required=True, help="User ID из панели управления")
    parser.add_argument("--key", required=True, help="Путь к serviceAccount.json")
    args = parser.parse_args()

    USER_ID = args.uid

    # Проверяем наличие хотя бы одного API ключа
    available_keys = [p for p, k in PLATFORM_KEYS.items() if k]
    if not available_keys:
        log.warning("⚠️  Нет API ключей! Задайте OPENAI_API_KEY / GEMINI_API_KEY / ANTHROPIC_API_KEY")
    else:
        log.info(f"🔑 API ключи доступны: {available_keys}")

    log.info("Подключение к Firebase...")
    cred = credentials.Certificate(args.key)
    firebase_admin.initialize_app(cred)
    db = firestore.client()
    log.info("✅ Firebase подключён")

    bot_cfg = get_bot_config()
    token   = bot_cfg.get("token", "")
    if not token:
        log.error("❌ Токен бота не найден! Добавьте бота в панели управления.")
        sys.exit(1)

    enabled = get_enabled_providers()
    kb_count = len(get_kb_items())
    log.info(f"🤖 Бот: {bot_cfg.get('name', '')}")
    log.info(f"🧠 Включённые AI: {enabled or ['нет']}")
    log.info(f"📖 База знаний: {kb_count} записей")

    app = Application.builder().token(token).build()
    app.add_handler(CommandHandler("start", cmd_start))
    app.add_handler(CommandHandler("ai", cmd_ai))
    app.add_handler(CallbackQueryHandler(callback_choose_ai, pattern=r"^choose_ai:"))
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, handle_message))
    app.add_error_handler(handle_error)

    log.info("🚀 Бот запущен! Ctrl+C для остановки.")
    app.run_polling(allowed_updates=Update.ALL_TYPES)


if __name__ == "__main__":
    main()
