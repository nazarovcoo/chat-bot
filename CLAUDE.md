# Правила для Claude

## ОБЯЗАТЕЛЬНО после каждого изменения кода

### admin.html → Firebase (chatbot-acd16)
После любого изменения файла `admin.html` **всегда** запускать деплой:

```bash
firebase deploy --only hosting --project chatbot-acd16
```

Это публикует на https://chatbot-acd16.web.app и https://createbotaiagent.com

### unit-economics.html → Netlify
После любого изменения файла `unit-economics.html` **всегда** запускать деплой:

```bash
bash deploy.sh
```

Это скопирует файл в `deploy/index.html` и опубликует на https://praicer-tovarov.netlify.app

Не нужно спрашивать разрешения — деплоить автоматически после каждого изменения.
