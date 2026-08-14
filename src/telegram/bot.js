const logger = require('../utils/logger');
const fetch = global.fetch;
const config = require('../config');
const { findStationsByTerm } = require('../services/supabaseClient');
const {
  createMonitoringRequest,
  getMonitoringRequestsForChat,
  getMonitoringRequestById,
  findStationById,
  cancelMonitoringRequest
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

async function sendInlineOptions(chatId, text, options) {
  // options: array of { text, callback_data }
  const keyboard = options.map((opt) => [{ text: opt.text, callback_data: opt.callback_data }]);
  return callTelegram('sendMessage', {
    chat_id: chatId,
    text,
    reply_markup: { inline_keyboard: keyboard }
  });
}

async function answerCallback(callbackQueryId, text = '', showAlert = false) {
  try {
    await callTelegram('answerCallbackQuery', { callback_query_id: callbackQueryId, text, show_alert: showAlert });
  } catch (err) {
    logger.warn('telegram.callback', 'Failed to answer callback_query', { message: err.message });
  }
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

async function handleCallbackQuery(callbackQuery) {
  const cb = callbackQuery;
  const data = cb.data || '';
  const chatId = cb.message?.chat?.id;
  if (!chatId) return;

  // Expected formats: dep:<index>, arv:<index>, time:<key>
  const [action, payload] = data.split(':');
  const state = conversationStates.get(chatId) || { step: null, data: {} };

  if (action === 'dep') {
    const index = Number(payload);
    if (!Number.isInteger(index) || index < 0 || index >= (state.stations?.length || 0)) {
      await answerCallback(cb.id, 'Ошибка: станция не найдена');
      return;
    }
    const station = state.stations[index];
    state.data.originStationId = station.id;
    state.data.originStationName = station.name || station.code || station.id;
    state.step = 'askArvStation';
    conversationStates.set(chatId, state);
    await answerCallback(cb.id, `Выбрано: ${state.data.originStationName}`);
    await sendMessage(chatId, `Станция отправления: ${escapeMarkdown(state.data.originStationName)}. Введите станцию прибытия текстом.`);
    return;
  }

  if (action === 'arv') {
    const index = Number(payload);
    if (!Number.isInteger(index) || index < 0 || index >= (state.stations?.length || 0)) {
      await answerCallback(cb.id, 'Ошибка: станция не найдена');
      return;
    }
    const station = state.stations[index];
    state.data.destinationStationId = station.id;
    state.data.destinationStationName = station.name || station.code || station.id;
    state.step = 'askDate';
    conversationStates.set(chatId, state);
    await answerCallback(cb.id, `Выбрано: ${state.data.destinationStationName}`);
    await sendMessage(chatId, `Станция прибытия: ${escapeMarkdown(state.data.destinationStationName)}. Введите дату поездки в формате YYYY-MM-DD.`);
    return;
  }

  if (action === 'time') {
    const ranges = {
      morning: ['06:00', '12:00'],
      day: ['12:00', '18:00'],
      evening: ['18:00', '23:59'],
      any: ['00:00', '23:59']
    };
    const picked = ranges[payload] || ranges.any;
    state.data.departWindowStart = picked[0];
    state.data.departWindowEnd = picked[1];
    state.step = 'askPassengers';
    conversationStates.set(chatId, state);
    await answerCallback(cb.id, `Выбрано: ${payload}`);
    await sendMessage(chatId, 'Сколько пассажиров? (введите число)');
    return;
  }

  if (action === 'cancel') {
    try {
      const request = await cancelMonitoringRequest(payload, chatId);
      if (!request) {
        await answerCallback(cb.id, 'Мониторинг не найден среди ваших активных запросов.', true);
        return;
      }

      const originName = await getStationName(request.origin_station_id);
      const destinationName = await getStationName(request.destination_station_id);
      const messageId = cb.message?.message_id;
      if (!messageId) {
        await answerCallback(cb.id, 'Не удалось обновить сообщение.', true);
        return;
      }

      await callTelegram('editMessageText', {
        chat_id: chatId,
        message_id: messageId,
        text: `✅ Мониторинг ${escapeMarkdown(originName)} → ${escapeMarkdown(destinationName)}, ${escapeMarkdown(request.travel_date)} удалён.`,
        reply_markup: { inline_keyboard: [] }
      });
      await answerCallback(cb.id, 'Мониторинг удалён.');
    } catch (error) {
      logger.error('telegram.cancel', 'Failed to cancel monitoring from inline button', {
        chatId,
        requestId: payload,
        error: error.message
      });
      await answerCallback(cb.id, 'Не удалось удалить мониторинг. Попробуйте ещё раз.', true);
    }
    return;
  }
}

function escapeMarkdown(text) {
  return String(text)
    .replace(/([_\*\[\]()~`>#+\-=|{}.!])/g, '\\$1');
}

async function getStationName(stationId) {
  try {
    const station = await findStationById(stationId);
    return station?.name || station?.code || stationId.substring(0, 8);
  } catch (error) {
    logger.warn('telegram.stations', 'Failed to fetch station name', { stationId, error: error.message });
    return stationId.substring(0, 8);
  }
}

function formatMonitoringRequestStatus(request, shortId) {
  // Format: 🚄 Origin → Destination, 📅 Date, Time, 👥 Passengers, 🆔 ID (8 chars)
  const departWindow = request.depart_window_start || '00:00';
  const arrivalWindow = request.depart_window_end || '23:59';
  const passengers = request.passengers || 1;
  
  return [
    `🚄 ${escapeMarkdown(request.originStationName)} → ${escapeMarkdown(request.destinationStationName)}`,
    `📅 ${escapeMarkdown(request.travel_date)}, ${escapeMarkdown(departWindow)}–${escapeMarkdown(arrivalWindow)}`,
    `👥 ${passengers} ${passengers === 1 ? 'пассажир' : 'пассажиров'}`,
    `🆔 ${shortId}`
  ].join('\n');
}

function buildHelpText() {
  return [
    '*Uzbekistan Ticket Monitor Bot*',
    '',
    '*Команды:*',
    '/start - приветствие и помощь',
    '/help - список команд',
    '/status - ваши активные мониторинги',
    '/monitor - создать новый мониторинг',
    '/cancel <ID> - удалить мониторинг (ID смотри в /status)',
    '',
    '*Заметки:*',
    '• Для изменения пассажиров или других параметров мониторинга удалите старый запрос и создайте новый',
    '• Каждый мониторинг получает уникальный ID при создании'
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
      await sendMessage(chatId, 'У вас нет активных мониторингов. Используйте /monitor для создания нового.\n\nЧтобы удалить, напишите /cancel <ID>');
      return;
    }

    // Enrich requests with station names
    const enrichedRequests = await Promise.all(
      requests.map(async (request) => {
        const originName = await getStationName(request.origin_station_id);
        const destinationName = await getStationName(request.destination_station_id);
        return {
          ...request,
          originStationName: originName,
          destinationStationName: destinationName
        };
      })
    );

    const lines = enrichedRequests.map((request) => {
      const shortId = request.id.substring(0, 8);
      return formatMonitoringRequestStatus(request, shortId);
    });

    const keyboard = enrichedRequests.map((request) => ([{
      text: `❌ Удалить ${request.originStationName} → ${request.destinationStationName} (${request.id.substring(0, 8)})`,
      callback_data: `cancel:${request.id}`
    }]));
    await sendMessage(chatId, `*Ваши активные мониторинги:*\n\n${lines.join('\n\n')}\n\nЧтобы удалить, напишите /cancel <ID>`, {
      reply_markup: { inline_keyboard: keyboard }
    });
    return;
  }

  if (text.startsWith('/cancel')) {
    const match = text.match(/^\/cancel(?:@\w+)?\s+([0-9a-f-]{8,36})$/i);
    if (!match) {
      await sendMessage(chatId, '❌ Мониторинг с таким ID не найден среди ваших активных запросов.');
      return;
    }

    const request = await cancelMonitoringRequest(match[1], chatId);
    if (!request) {
      await sendMessage(chatId, '❌ Мониторинг с таким ID не найден среди ваших активных запросов.');
      return;
    }

    const originName = await getStationName(request.origin_station_id);
    const destinationName = await getStationName(request.destination_station_id);
    await sendMessage(
      chatId,
      `✅ Мониторинг ${escapeMarkdown(originName)} → ${escapeMarkdown(destinationName)}, ${escapeMarkdown(request.travel_date)} удалён.`
    );
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
      state.stations = stations.slice(0, 8);
      conversationStates.set(chatId, state);
      const options = state.stations.map((station, index) => ({ text: `${station.name || station.code}`, callback_data: `dep:${index}` }));
      await sendInlineOptions(chatId, 'Найдено несколько станций. Выберите станцию отправления:', options);
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
      state.stations = stations.slice(0, 8);
      conversationStates.set(chatId, state);
      const options = state.stations.map((station, index) => ({ text: `${station.name || station.code}`, callback_data: `arv:${index}` }));
      await sendInlineOptions(chatId, 'Найдено несколько станций. Выберите станцию прибытия:', options);
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
      state.step = 'askPassengers';
      await sendMessage(chatId, 'Сколько пассажиров? (введите число)');
      return;
    }
    case 'askPassengers': {
      const passengers = Number(text.trim());
      if (!Number.isInteger(passengers) || passengers < 1 || passengers > 10) {
        await sendMessage(chatId, 'Введите целое число от 1 до 10.');
        return;
      }
      state.data.passengers = passengers;
      state.step = 'confirm';
      const summary = formatMonitoringRequestSummary({
        originStationName: state.data.originStationName,
        destinationStationName: state.data.destinationStationName,
        date: state.data.date,
        departWindowStart: state.data.departWindowStart,
        departWindowEnd: state.data.departWindowEnd,
        passengers: state.data.passengers
      });
      await sendMessage(chatId, `${summary}\n\nЕсли всё верно, введите *yes* для подтверждения.`);
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
        passengers: state.data.passengers || 1,
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
        if (update.callback_query) {
          await handleCallbackQuery(update.callback_query);
        }
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
