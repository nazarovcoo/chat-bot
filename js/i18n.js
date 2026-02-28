/**
 * i18n - Интернационализация (RU/EN)
 */
(function (global) {
  var translations = {
    ru: {
      // Common
      ok: 'ОК',
      cancel: 'Отмена',
      save: 'Сохранить',
      delete: 'Удалить',
      edit: 'Редактировать',
      add: 'Добавить',
      close: 'Закрыть',
      loading: 'Загрузка...',
      saving: 'Сохраняю...',
      saved: 'Сохранено',
      error: 'Ошибка',
      success: 'Успешно',
      yes: 'Да',
      no: 'Нет',
      wait: 'Подождите...',
      done: 'Готово',
      active: 'Активен',
      inactive: 'Неактивен',
      
      // Auth
      yourName: 'Ваше имя',
      login: 'Войти',
      logout: 'Выйти',
      unauthorized: 'Сначала авторизуйтесь',
      
      // Projects
      newProject: 'Новый проект',
      createProject: 'Создать проект',
      creatingProject: 'Создаю...',
      projectName: 'Название проекта',
      projectNamePlaceholder: 'Например: CreateBot AI',
      botDomain: 'IP / Домен бота',
      botDomainPlaceholder: 'Например: bot.example.com',
      selectProject: 'Выберите проект',
      renameProject: 'Переименовать проект',
      projectCreated: 'Проект создан',
      projectSettings: 'Настройки проекта',
      
      // Telegram
      connectTelegram: 'Подключить Telegram',
      connecting: 'Подключаю...',
      telegramToken: 'Telegram Bot API токен',
      telegramTokenPlaceholder: 'Введите токен',
      telegramConnected: 'подключён',
      telegramNotConnected: 'Не подключён',
      paste: 'Вставить',
      invalidToken: 'Невалидный Telegram токен',
      
      // Sources / Knowledge Base
      sources: 'Источники',
      addSource: 'Добавить источник',
      searchSources: 'Поиск по источникам...',
      addManually: 'Вручную',
      addByUrl: 'По ссылке',
      uploadFile: 'Загрузить файл',
      sourceTitle: 'Название',
      sourceTitlePlaceholder: 'Например: Частые вопросы',
      sourceText: 'Текст',
      sourceTextPlaceholder: 'Вставьте текст базы знаний...',
      sourceUrl: 'URL',
      sourceUrlPlaceholder: 'https://example.com',
      deleteSource: 'Удалить источник?',
      deleteSourceConfirm: 'Источник будет удалён из базы знаний.',
      fileNotSupported: 'Файл не поддерживается',
      fileTooLarge: 'Файл слишком большой',
      
      // Chats
      chats: 'Чаты',
      noChats: 'Нет чатов',
      newMessage: 'Напишите сообщение...',
      messagePlaceholder: 'Введите сообщение',
      send: 'Отправить',
      operator: 'Оператор',
      customer: 'Пользователь',
      noMessages: 'Нет сообщений',
      typing: 'Печатает...',
      
      // Settings
      settings: 'Настройки',
      instructions: 'Инструкции для бота',
      instructionsPlaceholder: 'Ты — вежливый ассистент компании...',
      botName: 'Имя бота',
      botNamePlaceholder: 'Например: Мой магазин бот',
      
      // Plans
      starter: 'Starter',
      pro: 'Pro',
      business: 'Business',
      selectPlan: 'Выбрать',
      paymentSoon: 'Оплата скоро будет доступна',
      
      // Analytics
      analytics: 'Аналитика',
      noData: 'Нет данных для экспорта',
      export: 'Экспорт',
      date: 'Дата',
      channel: 'Канал',
      provider: 'Провайдер',
      model: 'Модель',
      inputTokens: 'Input токены',
      outputTokens: 'Output токены',
      totalTokens: 'Всего токенов',
      cost: 'Стоимость',
      latency: 'Латентность (ms)',
      status: 'Статус',
      
      // KB Processing
      processingFile: 'Читаю файл...',
      chunkingFile: 'Разбиваю на части...',
      generatingQA: 'Генерирую вопросы и ответы...',
      checkingDuplicates: 'Проверяю дубликаты...',
      savingData: 'Сохраняю...',
      unknownError: 'Неизвестная ошибка',
      
      // Errors
      errorSending: 'Ошибка отправки',
      errorLoading: 'Ошибка загрузки',
      errorSaving: 'Ошибка сохранения',
      errorDeleting: 'Ошибка удаления',
      networkError: 'Ошибка сети',
      tryAgain: 'Попробуйте ещё раз',
      fillAllFields: 'Заполните все поля',
      fillFields: 'Заполните поля',
      
      // Empty states
      noProjects: 'Нет проектов',
      createFirstProject: 'Создайте первый проект',
      noSources: 'Нет источников',
      addFirstSource: 'Добавьте первый источник знаний',
      dataAfterChats: 'данные появятся после диалогов',
      
      // Tooltips
      refresh: 'Обновить',
      clearChat: 'Очистить чат',
      theme: 'Сменить тему',
      menu: 'Меню',
      search: 'Поиск',
      scrollDown: 'Прокрутить вниз',
      howItWorks: 'Как это работает?',
      knowledgeBase: 'База знаний',
      newDesign: 'Новый дизайн',
      language: 'Язык',
      
      // Auto-replies
      autoReplies: 'Автоответы',
      keyword: 'Ключевое слово',
      keywordPlaceholder: 'Например: цена, прайс, стоимость',
      answer: 'Ответ',
      answerPlaceholder: 'Текст ответа, который получит пользователь...',
      enable: 'Вкл',
      disable: 'Выкл',
      exactMatch: 'точное',
      containsMatch: 'содержит',
      
      // Referral
      referral: 'Партнёрская программа',
      refLink: 'Реферальная ссылка',
      refConditions: 'Условия партнёрской программы',
      copied: 'Скопировано: ',
      
      // Confirmations
      confirmDelete: 'Удалить бота?',
      confirmAction: 'Подтвердить действие',
      areYouSure: 'Вы уверены?',
      
      // Chat
      notes: 'Заметки оператора',
      notesPlaceholder: 'Заметки оператора (сохраняются автоматически)...',
      replyToCustomer: 'Ответить клиенту напрямую',
      
      // Misc
      uploadFileHint: 'Выберите или перетащите файл (.txt, .md, .csv, .pdf, .docx, .pptx)',
      addAnswer: 'Добавить ответ',
      editAnswer: 'Редактирование ответа',
      replaceAnswer: 'Новые данные для ответа на вопрос',
      howToReplace: 'Замена ответа позволяет изменить информацию, которую ИИ-агент использует отвечая на вопрос',
      additionalInstructions: 'Дайте особые указания по поведению, условиям и стилю ответа на вопрос',
      howToAdd: 'Как дополнить существующие данные для ответа?',
      broadcast: 'Рассылка',
      broadcastText: 'Введите текст рассылки...',
      tgStatus: 'TG',
      user: 'Пользователь',
      companyName: 'Название компании',
      companyNamePlaceholder: 'Например: MyShop',
      expiryDate: 'Срок действия',
      promoCode: 'Промокод',
      promoCodePlaceholder: 'Введите промокод...',
      ownerId: 'ID владельца',
      ownerIdPlaceholder: 'Например: 123456789',
    },
    en: {
      ok: 'OK',
      cancel: 'Cancel',
      save: 'Save',
      delete: 'Delete',
      edit: 'Edit',
      add: 'Add',
      close: 'Close',
      loading: 'Loading...',
      saving: 'Saving...',
      saved: 'Saved',
      error: 'Error',
      success: 'Success',
      yes: 'Yes',
      no: 'No',
      wait: 'Wait...',
      done: 'Done',
      active: 'Active',
      inactive: 'Inactive',
      
      yourName: 'Your name',
      login: 'Login',
      logout: 'Logout',
      unauthorized: 'Please login first',
      
      newProject: 'New project',
      createProject: 'Create project',
      creatingProject: 'Creating...',
      projectName: 'Project name',
      projectNamePlaceholder: 'e.g., CreateBot AI',
      botDomain: 'Bot IP / Domain',
      botDomainPlaceholder: 'e.g., bot.example.com',
      selectProject: 'Select project',
      renameProject: 'Rename project',
      projectCreated: 'Project created',
      projectSettings: 'Project settings',
      
      connectTelegram: 'Connect Telegram',
      connecting: 'Connecting...',
      telegramToken: 'Telegram Bot API token',
      telegramTokenPlaceholder: 'Enter token',
      telegramConnected: 'connected',
      telegramNotConnected: 'Not connected',
      paste: 'Paste',
      invalidToken: 'Invalid Telegram token',
      
      sources: 'Sources',
      addSource: 'Add source',
      searchSources: 'Search sources...',
      addManually: 'Manual',
      addByUrl: 'By URL',
      uploadFile: 'Upload file',
      sourceTitle: 'Title',
      sourceTitlePlaceholder: 'e.g., FAQ',
      sourceText: 'Text',
      sourceTextPlaceholder: 'Paste knowledge base text...',
      sourceUrl: 'URL',
      sourceUrlPlaceholder: 'https://example.com',
      deleteSource: 'Delete source?',
      deleteSourceConfirm: 'Source will be removed from knowledge base.',
      fileNotSupported: 'File not supported',
      fileTooLarge: 'File too large',
      
      chats: 'Chats',
      noChats: 'No chats',
      newMessage: 'Write a message...',
      messagePlaceholder: 'Enter message',
      send: 'Send',
      operator: 'Operator',
      customer: 'User',
      noMessages: 'No messages',
      typing: 'Typing...',
      
      settings: 'Settings',
      instructions: 'Bot instructions',
      instructionsPlaceholder: 'You are a friendly assistant...',
      botName: 'Bot name',
      botNamePlaceholder: 'e.g., My Shop Bot',
      
      starter: 'Starter',
      pro: 'Pro',
      business: 'Business',
      selectPlan: 'Select',
      paymentSoon: 'Payment coming soon',
      
      analytics: 'Analytics',
      noData: 'No data to export',
      export: 'Export',
      date: 'Date',
      channel: 'Channel',
      provider: 'Provider',
      model: 'Model',
      inputTokens: 'Input tokens',
      outputTokens: 'Output tokens',
      totalTokens: 'Total tokens',
      cost: 'Cost',
      latency: 'Latency (ms)',
      status: 'Status',
      
      processingFile: 'Reading file...',
      chunkingFile: 'Splitting into chunks...',
      generatingQA: 'Generating Q&A...',
      checkingDuplicates: 'Checking duplicates...',
      savingData: 'Saving...',
      unknownError: 'Unknown error',
      
      errorSending: 'Send error',
      errorLoading: 'Load error',
      errorSaving: 'Save error',
      errorDeleting: 'Delete error',
      networkError: 'Network error',
      tryAgain: 'Try again',
      fillAllFields: 'Fill all fields',
      fillFields: 'Fill fields',
      
      noProjects: 'No projects',
      createFirstProject: 'Create your first project',
      noSources: 'No sources',
      addFirstSource: 'Add your first knowledge source',
      dataAfterChats: 'data will appear after conversations',
      
      refresh: 'Refresh',
      clearChat: 'Clear chat',
      theme: 'Change theme',
      menu: 'Menu',
      search: 'Search',
      scrollDown: 'Scroll down',
      howItWorks: 'How it works?',
      knowledgeBase: 'Knowledge base',
      newDesign: 'New design',
      language: 'Language',
      
      autoReplies: 'Auto-replies',
      keyword: 'Keyword',
      keywordPlaceholder: 'e.g., price, cost',
      answer: 'Answer',
      answerPlaceholder: 'Answer text user will receive...',
      enable: 'On',
      disable: 'Off',
      exactMatch: 'exact',
      containsMatch: 'contains',
      
      referral: 'Referral program',
      refLink: 'Referral link',
      refConditions: 'Referral program conditions',
      copied: 'Copied: ',
      
      confirmDelete: 'Delete bot?',
      confirmAction: 'Confirm action',
      areYouSure: 'Are you sure?',
      
      notes: 'Operator notes',
      notesPlaceholder: 'Operator notes (auto-saved)...',
      replyToCustomer: 'Reply to customer directly',
      
      uploadFileHint: 'Select or drag file (.txt, .md, .csv, .pdf, .docx, .pptx)',
      addAnswer: 'Add answer',
      editAnswer: 'Edit answer',
      replaceAnswer: 'New answer data',
      howToReplace: 'Answer replacement changes info that AI agent uses',
      additionalInstructions: 'Give special instructions for behavior and style',
      howToAdd: 'How to add to existing data?',
      broadcast: 'Broadcast',
      broadcastText: 'Enter broadcast text...',
      tgStatus: 'TG',
      user: 'User',
      companyName: 'Company name',
      companyNamePlaceholder: 'e.g., MyShop',
      expiryDate: 'Expiry date',
      promoCode: 'Promo code',
      promoCodePlaceholder: 'Enter promo code...',
      ownerId: 'Owner ID',
      ownerIdPlaceholder: 'e.g., 123456789',
    }
  };

  var currentLang = 'ru';

  function setLang(lang) {
    if (translations[lang]) {
      currentLang = lang;
      try {
        localStorage.setItem('lang', lang);
      } catch (e) {}
    }
  }

  function getLang() {
    return currentLang;
  }

  function t(key, params) {
    var dict = translations[currentLang] || translations.ru;
    var text = dict[key] || translations.ru[key] || key;
    
    if (params) {
      Object.keys(params).forEach(function (k) {
        text = text.replace('{' + k + '}', params[k]);
      });
    }
    
    return text;
  }

  function init() {
    try {
      var saved = localStorage.getItem('lang');
      if (saved && translations[saved]) {
        currentLang = saved;
      }
    } catch (e) {}
  }

  init();

  var I18n = {
    t: t,
    setLang: setLang,
    getLang: getLang,
    lang: currentLang
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = I18n;
  } else {
    global.I18n = I18n;
  }

})(typeof window !== 'undefined' ? window : global);
