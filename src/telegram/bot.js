const logger = require('../utils/logger');
const fetch = global.fetch;
const config = require('../config');
const { findStationsByTerm } = require('../services/supabaseClient');
const {
  createMonitoringRequest,
  getMonitoringRequestsForChat,
  getMonitoringRequestById
} = require('../services/monitoringService');
const {
  getPendingNotifications,
  markNotificationDelivered
} = require('../services/notificationService');

const TELEGRAM_BASE = `https://api.telegram.org/bot${config.telegramBotToken}`;
let updateOffset = 0;
const conversationStates = new Map();

function missingTokenError() {
  throw new Error('Telegram bot token is not configured. Set TELEGRAM_BOT_TOKEN in environment variables.');
}

async function callTelegram(method, body) {
  if (!config.telegramBotToken) {
    throw missingTokenError();
  }

  const response = await fetch(`${TELEGRAM_BASE}/${method}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  const data = await response.json();
  if (!data.ok) {
    throw new Error(`Telegram API error: ${data.description}`);
  }
  return data.result;
}

async function sendMessage(chatId, text, extra = {}) {
  logger.info('telegram.send', 'Sending message to Telegram chat', { chatId });
  return callTelegram('sendMessage', {
    chat_id: chatId,
    text,
    ...extra
  });
}

async function getUpdates() {
  if (!config.telegramBotToken) {
    throw missingTokenError();
  }

  const url = `${TELEGRAM_BASE}/getUpdates?timeout=30&offset=${updateOffset + 1}`;
  const response = await fetch(url);
  const data = await response.json();
  if (!data.ok) {
    throw new Error(`Telegram getUpdates failed: ${data.description}`);
  }
  return data.result;
}

function escapeMarkdown(text) {
  return String(text)
    .replace(/([_\*\[\]()~`>#+\-=|{}.!])/g, '\\$1');
}

function buildHelpText() {
  return [
    '*Uzbekistan Ticket Monitor Bot*',
    '',
    '/start - приветствие и помощь',
    '/help - список команд',
    '/status - ваши активные мониторинги',
    '/monitor - создать новый мониторинг'
  ].join('\n');
}

function formatStationOption(station, index) {
  const title = station.name || station.title || station.code || station.id;
  const code = station.code ? ` (${station.code})` : '';
  return `${index + 1}. ${escapeMarkdown(title)}${escapeMarkdown(code)}`;
}

function formatMonitoringRequestSummary(data) {
  return [
    `*Отправление:* ${escapeMarkdown(data.originStationName)}`,
    `*Прибытие:* ${escapeMarkdown(data.destinationStationName)}`,
    `*Дата:* ${escapeMarkdown(data.date)}`,
    `*Время:* ${escapeMarkdown(data.departWindowStart)} - ${escapeMarkdown(data.departWindowEnd)}`,
    `*Пассажиры:* ${escapeMarkdown(String(data.passengers))}`
  ].join('\n');
}

async function handleNewMessage(message) {
  const chatId = message.chat?.id;
  const text = message.text?.trim();
  if (!chatId || !text) {
    return;
  }

  if (text.startsWith('/start') || text.startsWith('/help')) {
    await sendMessage(chatId, buildHelpText());
    conversationStates.delete(chatId);
    return;
  }

  if (text.startsWith('/status')) {
    const requests = await getMonitoringRequestsForChat(chatId);
    if (!requests || requests.length === 0) {
      await sendMessage(chatId, 'У вас нет активных мониторингов. Используйте /monitor для создания нового.');
      return;
    }

    const lines = requests.map((request) => {
      return [
        `*ID:* ${escapeMarkdown(request.id)}`,
        `*Маршрут:* ${escapeMarkdown(request.origin_station_id || '')} → ${escapeMarkdown(request.destination_station_id || '')}`,
        `*Дата:* ${escapeMarkdown(request.travel_date || '')}`,
        `*Время:* ${escapeMarkdown(request.depart_window_start || '00:00')} - ${escapeMarkdown(request.depart_window_end || '23:59')}`
      ].join('\n');
    });

    await sendMessage(chatId, `*Ваши активные мониторинги:*\n\n${lines.join('\n\n')}`);
    return;
  }

  if (text.startsWith('/monitor')) {
    conversationStates.set(chatId, { step: 'askDepStation', data: {} });
    await sendMessage(chatId, 'Введите название станции отправления или города.');
    return;
  }

  const state = conversationStates.get(chatId);
  if (!state) {
    await sendMessage(chatId, 'Неизвестная команда. Используйте /help для списка команд.');
    return;
  }

  await processConversationStep(chatId, state, text);
}

async function processConversationStep(chatId, state, text) {
  switch (state.step) {
    case 'askDepStation': {
      const stations = await findStationsByTerm(text);
      if (!stations || stations.length === 0) {
        await sendMessage(chatId, 'Станции не найдены. Попробуйте другое название.');
        return;
      }
      state.step = 'pickDepStation';
      state.stations = stations.slice(0, 5);
      const options = state.stations.map((station, index) => formatStationOption(station, index)).join('\n');
      await sendMessage(chatId, `Найдено несколько станций:\n${options}\n\nВведите номер станции.`);
      return;
    }
    case 'pickDepStation': {
      const index = Number(text.trim());
      if (!Number.isInteger(index) || index < 1 || index > (state.stations?.length || 0)) {
        await sendMessage(chatId, 'Введите номер станции из списка.');
        return;
      }
      const station = state.stations[index - 1];
      state.data.originStationId = station.id;
      state.data.originStationName = station.name || station.code || station.id;
      state.step = 'askArvStation';
      await sendMessage(chatId, `Выбрана станция отправления: ${escapeMarkdown(state.data.originStationName)}. Введите станцию прибытия.`);
      return;
    }
    case 'askArvStation': {
      const stations = await findStationsByTerm(text);
      if (!stations || stations.length === 0) {
        await sendMessage(chatId, 'Станции не найдены. Попробуйте другое название.');
        return;
      }
      state.step = 'pickArvStation';
      state.stations = stations.slice(0, 5);
      const options = state.stations.map((station, index) => formatStationOption(station, index)).join('\n');
      await sendMessage(chatId, `Найдено несколько станций:\n${options}\n\nВведите номер станции.`);
      return;
    }
    case 'pickArvStation': {
      const index = Number(text.trim());
      if (!Number.isInteger(index) || index < 1 || index > (state.stations?.length || 0)) {
        await sendMessage(chatId, 'Введите номер станции из списка.');
        return;
      }
      const station = state.stations[index - 1];
      state.data.destinationStationId = station.id;
      state.data.destinationStationName = station.name || station.code || station.id;
      state.step = 'askDate';
      await sendMessage(chatId, 'Введите дату поездки в формате YYYY-MM-DD.');
      return;
    }
    case 'askDate': {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
        await sendMessage(chatId, 'Неверный формат даты. Введите дату как YYYY-MM-DD.');
        return;
      }
      state.data.date = text;
      state.step = 'askDepartWindow';
      await sendMessage(chatId, 'Введите временной диапазон отправления: утро, день, вечер, any или HH:mm-HH:mm.');
      return;
    }
    case 'askDepartWindow': {
      const cleaned = text.trim().toLowerCase();
      const ranges = {
        утро: ['06:00', '12:00'],
        день: ['12:00', '18:00'],
        вечер: ['18:00', '23:59'],
        any: ['00:00', '23:59'],
        любое: ['00:00', '23:59']
      };
      if (ranges[cleaned]) {
        [state.data.departWindowStart, state.data.departWindowEnd] = ranges[cleaned];
      } else if (/^\d{2}:\d{2}-\d{2}:\d{2}$/.test(cleaned)) {
        const [start, end] = cleaned.split('-');
        state.data.departWindowStart = start;
        state.data.departWindowEnd = end;
      } else {
        await sendMessage(chatId, 'Неверный формат. Введите утро/день/вечер/any или HH:mm-HH:mm.');
        return;
      }
      state.step = 'confirm';
      const summary = formatMonitoringRequestSummary({
        originStationName: state.data.originStationName,
        destinationStationName: state.data.destinationStationName,
        date: state.data.date,
        departWindowStart: state.data.departWindowStart,
        departWindowEnd: state.data.departWindowEnd,
        passengers: 1
      });
      await sendMessage(chatId, `${summary}\n\nЕсли всё верно, введите *yes*.`);
      return;
    }
    case 'confirm': {
      if (text.trim().toLowerCase() !== 'yes') {
        await sendMessage(chatId, 'Создание мониторинга отменено. Начните заново с /monitor.');
        conversationStates.delete(chatId);
        return;
      }

      const request = await createMonitoringRequest({
        userId: String(chatId),
        originStationId: state.data.originStationId,
        destinationStationId: state.data.destinationStationId,
        date: state.data.date,
        passengers: 1,
        trainTypes: [],
        departWindowStart: state.data.departWindowStart,
        departWindowEnd: state.data.departWindowEnd
      });

      if (!request) {
        await sendMessage(chatId, 'Не удалось создать мониторинг. Попробуйте позже.');
        conversationStates.delete(chatId);
        return;
      }

      await sendMessage(chatId, `Мониторинг создан. ID: ${escapeMarkdown(request.id)}.`);
      conversationStates.delete(chatId);
      return;
    }
    default:
      await sendMessage(chatId, 'Неизвестный шаг. Начните заново с /monitor.');
      conversationStates.delete(chatId);
      return;
  }
}

async function syncPendingNotifications() {
  const notifications = await getPendingNotifications();
  if (!notifications || notifications.length === 0) {
    return;
  }

  for (const notification of notifications) {
    try {
      const request = await getMonitoringRequestById(notification.monitoring_request_id);
      if (!request || !request.user_id) {
        logger.warn('telegram.sync', 'Skipping notification without valid monitoring request or user_id', {
          notificationId: notification.id,
          monitoringRequestId: notification.monitoring_request_id
        });
        continue;
      }

      const result = await sendMessage(request.user_id, notification.message);
      await markNotificationDelivered(notification.id, result?.message_id || null);
    } catch (error) {
      logger.error('telegram.sync', 'Failed to deliver pending notification', {
        notificationId: notification.id,
        error: error.message
      });
    }
  }
}

async function startTelegramPolling() {
  if (!config.telegramBotToken) {
    logger.warn('telegram.poll', 'Telegram bot token is not configured. Polling will not start.');
    return;
  }

  logger.info('telegram.poll', 'Starting Telegram polling loop');
  while (true) {
    try {
      const updates = await getUpdates();
      for (const update of updates) {
        updateOffset = update.update_id;
        if (update.message) {
          await handleNewMessage(update.message);
        }
      }
      await syncPendingNotifications();
    } catch (error) {
      logger.error('telegram.poll', 'Telegram polling failed', { message: error.message });
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
  }
}

module.exports = {
  sendMessage,
  startTelegramPolling
};
