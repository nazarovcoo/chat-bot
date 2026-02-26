#!/bin/bash
# Использование:
#   ./deploy.sh          → деплой на продакшн (praicer-tovarov.netlify.app)
#   ./deploy.sh staging  → деплой на черновик (praicer-staging.netlify.app)

cp /Users/ahmadnazarov/Desktop/bot/unit-economics.html /Users/ahmadnazarov/Desktop/bot/deploy/index.html

if [ "$1" = "staging" ]; then
  netlify deploy --prod --site 0fdd8d90-8f74-4ba1-8392-5e2f603761bd --dir deploy
  echo "✅ Черновик обновлён: https://praicer-staging.netlify.app"
else
  netlify deploy --prod --site 374224ae-46cd-447c-a25f-3647a52abbe5 --dir deploy
  echo "✅ Продакшн обновлён: https://praicer-tovarov.netlify.app"
fi
