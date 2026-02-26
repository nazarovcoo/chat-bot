"""
BotPanel Manager — автоматически запускает и следит за ботами всех клиентов.

Как работает:
  1. Читает всех пользователей из Firestore
  2. Для каждого у кого есть токен бота — запускает bot.py
  3. Каждые 60 секунд проверяет новых клиентов и перезапускает упавшие боты

Запуск:
    OPENAI_API_KEY=sk-... GEMINI_API_KEY=AIza... ANTHROPIC_API_KEY=sk-ant-... \
    python manager.py --key serviceAccount.json
"""

import argparse
import logging
import os
import subprocess
import sys
import time
import threading

import firebase_admin
from firebase_admin import credentials, firestore

logging.basicConfig(
    format="%(asctime)s [%(levelname)s] %(message)s",
    level=logging.INFO,
    handlers=[logging.StreamHandler(sys.stdout)],
)
log = logging.getLogger(__name__)

# uid → subprocess.Popen
running: dict[str, subprocess.Popen] = {}
KEY_PATH = ""
BOT_SCRIPT = os.path.join(os.path.dirname(__file__), "bot.py")
db = None


def get_all_users() -> list[str]:
    """Возвращает список uid всех пользователей."""
    try:
        docs = db.collection("users").stream()
        return [d.id for d in docs]
    except Exception as e:
        log.error(f"Ошибка чтения пользователей: {e}")
        return []


def user_has_bot(uid: str) -> bool:
    """Проверяет, настроен ли бот у пользователя."""
    try:
        bots = db.collection("users").document(uid).collection("bots").limit(1).get()
        for doc in bots:
            token = doc.to_dict().get("token", "")
            if token:
                return True
        return False
    except Exception as e:
        log.error(f"Ошибка проверки бота {uid}: {e}")
        return False


def user_has_provider(uid: str) -> bool:
    """Проверяет, включён ли хоть один AI провайдер."""
    try:
        doc = db.collection("users").document(uid).collection("settings").document("ai").get()
        if not doc.exists:
            return False
        providers = doc.to_dict().get("providers", {})
        platform_keys = {
            "openai": os.environ.get("OPENAI_API_KEY", ""),
            "gemini": os.environ.get("GEMINI_API_KEY", ""),
            "claude": os.environ.get("ANTHROPIC_API_KEY", ""),
        }
        return any(
            providers.get(p, {}).get("enabled") and platform_keys.get(p)
            for p in ["openai", "gemini", "claude"]
        )
    except Exception as e:
        log.error(f"Ошибка проверки провайдера {uid}: {e}")
        return False


def is_agent_active(uid: str) -> bool:
    """Проверяет, активен ли агент у пользователя."""
    try:
        doc = db.collection("users").document(uid).collection("settings").document("agent").get()
        if doc.exists:
            return doc.to_dict().get("active", True)
        return True
    except Exception:
        return True


def start_bot(uid: str):
    """Запускает bot.py для конкретного пользователя."""
    env = os.environ.copy()
    proc = subprocess.Popen(
        [sys.executable, BOT_SCRIPT, "--uid", uid, "--key", KEY_PATH],
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
    )
    running[uid] = proc
    log.info(f"🚀 Запущен бот для uid={uid} (pid={proc.pid})")

    # Логируем вывод бота в отдельном потоке
    def _log_output(uid, proc):
        for line in proc.stdout:
            log.info(f"[{uid[:8]}] {line.rstrip()}")

    t = threading.Thread(target=_log_output, args=(uid, proc), daemon=True)
    t.start()


def stop_bot(uid: str):
    """Останавливает бота."""
    proc = running.pop(uid, None)
    if proc and proc.poll() is None:
        proc.terminate()
        try:
            proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            proc.kill()
        log.info(f"⏹ Остановлен бот uid={uid}")


def sync_bots():
    """Главный цикл синхронизации — запускает/останавливает ботов."""
    uids = get_all_users()
    active_uids = set()

    for uid in uids:
        should_run = (
            user_has_bot(uid)
            and user_has_provider(uid)
            and is_agent_active(uid)
        )

        if should_run:
            active_uids.add(uid)
            proc = running.get(uid)
            if proc is None:
                start_bot(uid)
            elif proc.poll() is not None:
                # Процесс упал — перезапускаем
                log.warning(f"⚠️  Бот uid={uid} завершился (код {proc.returncode}). Перезапуск...")
                del running[uid]
                time.sleep(2)
                start_bot(uid)
        else:
            # Агент выключен — останавливаем бота если работал
            if uid in running:
                log.info(f"⏸ Агент отключён, останавливаем бота uid={uid}")
                stop_bot(uid)

    # Останавливаем ботов удалённых пользователей
    stale = set(running.keys()) - active_uids
    for uid in stale:
        log.info(f"🗑 Пользователь удалён, останавливаем бота uid={uid}")
        stop_bot(uid)

    log.info(f"✅ Активных ботов: {len(running)} / Всего пользователей: {len(uids)}")


def main():
    global db, KEY_PATH

    parser = argparse.ArgumentParser(description="BotPanel Manager")
    parser.add_argument("--key", required=True, help="Путь к serviceAccount.json")
    parser.add_argument("--interval", type=int, default=60, help="Интервал проверки (сек)")
    args = parser.parse_args()

    KEY_PATH = args.key

    # Проверяем API ключи
    keys_found = [p for p in ["OPENAI_API_KEY", "GEMINI_API_KEY", "ANTHROPIC_API_KEY"] if os.environ.get(p)]
    if not keys_found:
        log.error("❌ Не найдено ни одного API ключа! Задайте переменные окружения.")
        sys.exit(1)
    log.info(f"🔑 Найдены ключи: {keys_found}")

    log.info("Подключение к Firebase...")
    cred = credentials.Certificate(KEY_PATH)
    firebase_admin.initialize_app(cred)
    db = firestore.client()
    log.info("✅ Firebase подключён")

    log.info(f"🤖 Manager запущен. Проверка каждые {args.interval} сек. Ctrl+C для остановки.")

    try:
        while True:
            sync_bots()
            time.sleep(args.interval)
    except KeyboardInterrupt:
        log.info("🛑 Остановка всех ботов...")
        for uid in list(running.keys()):
            stop_bot(uid)
        log.info("✅ Все боты остановлены.")


if __name__ == "__main__":
    main()
