const logger = require('../utils/logger');
const fetch = global.fetch;
const config = require('../config');
const {
  createMonitoringRequest,
  getMonitoringRequestsForChat,
  getMonitoringRequestById,
  findStationById,
  listStations,
  cancelMonitoringRequest
} = require('../services/monitoringService');
const {
  getPendingNotifications,
  markNotificationDelivered
} = require('../services/notificationService');
const { refreshSession } = require('../eticket/session');
const { fetchTrainList } = require('../eticket/client');
const { parseTrainList } = require('../services/availabilityParser');

const TELEGRAM_BASE = `https://api.telegram.org/bot${config.telegramBotToken}`;
let updateOffset = 0;
const conversationStates = new Map();

const WEEKDAY_LABELS = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
const DATE_OPTIONS_COUNT = 14;
const PASSENGER_OPTIONS = Array.from({ length: 10 }, (_, index) => index + 1);
const BOT_COMMANDS = [
  { command: 'start', description: 'Начать работу с ботом' },
  { command: 'monitor', description: 'Создать новый мониторинг' },
  { command: 'status', description: 'Показать активные мониторинги' },
  { command: 'help', description: 'Показать справку' },
  { command: 'cancel', description: 'Удалить мониторинг по ID' }
];
// Only Afrosiyob and Rotem qualify; live API may label Rotem as "Jaloliddin Manguberdi"
// or "Джалолиддин Мангуберды". We match on the live brand text only.
const PREMIUM_BRAND_PATTERN = /afrosiyob|rotem|jaloliddin|manguberdi|мангуберд/i;

function isPremiumBrand(trainType) {
  return PREMIUM_BRAND_PATTERN.test(String(trainType || ''));
}

function normalizeTrainBrand(trainType) {
  return String(trainType || '').trim();
}

function buildTrainSelectionLabel(train) {
  const departure = extractTimeOfDay(train.departure);
  const arrival = extractTimeOfDay(train.arrival);
  const trainType = normalizeTrainBrand(train.trainType);
  const trainNumber = String(train.trainNumber || '').trim();

  const brandPart = trainType ? ` · ${trainType}` : '';
  const numberPart = trainNumber ? ` · № ${trainNumber}` : '';
  return `${departure} → ${arrival}${numberPart}${brandPart}`;
}

function extractTimeOfDay(timestamp) {
  const text = String(timestamp || '');
  const match = text.match(/(?:^|T|\s)(\d{2}:\d{2})(?::\d{2})?/);
  if (match) {
    return match[1];
  }
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date.toISOString().substr(11, 5);
}

function buildDateOptions(daysAhead = DATE_OPTIONS_COUNT) {
  const options = [];
  const now = new Date();
  for (let i = 0; i < daysAhead; i += 1) {
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
    const iso = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
    const label = `${WEEKDAY_LABELS[day.getDay()]} ${String(day.getDate()).padStart(2, '0')}.${String(day.getMonth() + 1).padStart(2, '0')}`;
    options.push({ date: iso, label });
  }
  return options;
}

function toISODate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function buildCalendarMonthGrid(monthDate = new Date(), today = new Date()) {
  const monthStart = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
  const monthEnd = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0);
  const firstWeekday = monthStart.getDay();
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());

  const cells = [];
  for (let i = 0; i < firstWeekday; i += 1) {
    cells.push({ type: 'empty', text: ' ', isActive: false, date: null, day: null });
  }

  for (let day = 1; day <= monthEnd.getDate(); day += 1) {
    const cellDate = new Date(monthDate.getFullYear(), monthDate.getMonth(), day);
    const isoDate = toISODate(cellDate);
    const isActive = cellDate >= startOfToday;
    cells.push({
      type: 'day',
      text: String(day),
      isActive,
      day,
      date: isoDate,
      label: String(day)
    });
  }

  const rows = [];
  for (let i = 0; i < cells.length; i += 7) {
    rows.push(cells.slice(i, i + 7));
  }

  return {
    monthKey: toISODate(monthStart),
    monthLabel: new Intl.DateTimeFormat('ru-RU', { month: 'long', year: 'numeric' }).format(monthStart),
    header: WEEKDAY_LABELS,
    rows,
    days: cells.filter((cell) => cell.type === 'day' && cell.isActive)
  };
}

function buildCalendarKeyboard(monthView) {
  const keyboard = [
    [
      { text: '◀', callback_data: `mcal:prev:${monthView.monthKey}` },
      { text: monthView.monthLabel, callback_data: `mcal:label:${monthView.monthKey}` },
      { text: '▶', callback_data: `mcal:next:${monthView.monthKey}` }
    ],
    monthView.header.map((label) => ({ text: label, callback_data: 'mcal:header' }))
  ];

  for (const row of monthView.rows) {
    const keyboardRow = row.map((cell) => {
      if (cell.type === 'empty') {
        return { text: ' ', callback_data: 'mcal:empty' };
      }

      if (!cell.isActive) {
        return { text: ' ', callback_data: 'mcal:empty' };
      }

      return { text: String(cell.day), callback_data: `mdate:${cell.date}` };
    });
    keyboard.push(keyboardRow);
  }

  return keyboard;
}

function chunkButtons(buttons, perRow = 2) {
  const rows = [];
  for (let i = 0; i < buttons.length; i += perRow) {
    rows.push(buttons.slice(i, i + perRow));
  }
  return rows;
}

async function sendInlineKeyboard(chatId, text, buttons, perRow = 2) {
  const keyboard = chunkButtons(
    buttons.map((button) => ({ text: button.text, callback_data: button.callback_data })),
    perRow
  );
  return callTelegram('sendMessage', {
    chat_id: chatId,
    text,
    reply_markup: { inline_keyboard: keyboard }
  });
}

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

async function configureBotCommands() {
  try {
    await callTelegram('setMyCommands', { commands: BOT_COMMANDS });
    logger.info('telegram.commands', 'Telegram command menu configured');
  } catch (error) {
    logger.error('telegram.commands', 'Failed to configure Telegram command menu', { message: error.message });
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

const ACCESS_DENIED_TEXT = '⛔ Доступ ограничен. Обратитесь к администратору.';

function isAuthorizedUser(userId) {
  if (!config.allowedTelegramIds.length) return true;
  return config.allowedTelegramIds.includes(Number(userId));
}

async function handleCallbackQuery(callbackQuery) {
  const cb = callbackQuery;
  const data = cb.data || '';
  const chatId = cb.message?.chat?.id;
  if (!chatId) return;

  // Expected formats: morig:<index>, mdest:<index>, mdate:<date>, mcal:<prev|next>:<monthKey>, mtrain:<index>, mpax:<n>
  const [action, ...rest] = data.split(':');
  const payload = rest.join(':');
  const state = conversationStates.get(chatId) || { step: null, data: {} };

  if (action === 'mcal') {
    const direction = rest[0];
    const monthKey = rest.slice(1).join(':');
    if (!direction || !monthKey) {
      await answerCallback(cb.id, 'Ошибка: неверный диапазон календаря.', true);
      return;
    }

    const monthBase = new Date(`${monthKey}T00:00:00`);
    if (Number.isNaN(monthBase.getTime())) {
      await answerCallback(cb.id, 'Ошибка: месяц календаря не распознан.', true);
      return;
    }

    const targetMonth = new Date(
      monthBase.getFullYear(),
      monthBase.getMonth() + (direction === 'next' ? 1 : -1),
      1
    );

    state.calendarMonth = targetMonth;
    conversationStates.set(chatId, state);
    await showDateStep(chatId, state);
    return;
  }

  if (action === 'morig') {
    const index = Number(payload);
    if (!Number.isInteger(index) || index < 0 || index >= (state.originStations?.length || 0)) {
      await answerCallback(cb.id, 'Ошибка: станция не найдена. Начните заново с /monitor.', true);
      return;
    }
    const station = state.originStations[index];
    state.data.originStationId = station.id;
    state.data.originStationCode = station.code;
    state.data.originStationName = station.name || station.code || station.id;
    conversationStates.set(chatId, state);
    await answerCallback(cb.id, `Отправление: ${station.name}`);
    await showDestinationStep(chatId, state);
    return;
  }

  if (action === 'mdest') {
    const index = Number(payload);
    if (!Number.isInteger(index) || index < 0 || index >= (state.destinationStations?.length || 0)) {
      await answerCallback(cb.id, 'Ошибка: станция не найдена. Начните заново с /monitor.', true);
      return;
    }
    const station = state.destinationStations[index];
    state.data.destinationStationId = station.id;
    state.data.destinationStationCode = station.code;
    state.data.destinationStationName = station.name || station.code || station.id;
    conversationStates.set(chatId, state);
    await answerCallback(cb.id, `Прибытие: ${station.name}`);
    await showDateStep(chatId, state);
    return;
  }

  if (action === 'mdate') {
    const selectedDate = payload && /^\d{4}-\d{2}-\d{2}$/.test(payload) ? payload : null;
    if (!selectedDate) {
      await answerCallback(cb.id, 'Ошибка: дата не найдена. Начните заново с /monitor.', true);
      return;
    }

    const chosenDate = selectedDate;
    state.data.date = chosenDate;
    conversationStates.set(chatId, state);
    const chosenLabel = state.dateOptions?.find((option) => option.date === chosenDate)?.label || chosenDate;
    await answerCallback(cb.id, chosenLabel);
    await fetchAndShowTrains(chatId, state);
    return;
  }

  if (action === 'mtrain') {
    const index = Number(payload);
    if (!Number.isInteger(index) || index < 0 || index >= (state.trains?.length || 0)) {
      await answerCallback(cb.id, 'Ошибка: поезд не найден. Начните заново с /monitor.', true);
      return;
    }
    const train = state.trains[index];
    const departureTime = extractTimeOfDay(train.departure);
    const arrivalTime = extractTimeOfDay(train.arrival);
    state.data.exactDeparture = departureTime;
    state.data.exactArrival = arrivalTime;
    state.data.exactDepartureTime = departureTime;
    state.data.selectedTrainNumber = train.trainNumber;
    state.data.trainNumber = train.trainNumber;
    state.data.allowedBrands = Array.from(new Set(['Afrosiyob', 'Rotem']));
    state.data.apiOriginStationName = train.origin;
    state.data.apiDestinationStationName = train.destination;
    conversationStates.set(chatId, state);
    await answerCallback(cb.id, `🚄 ${state.data.exactDeparture} → ${state.data.exactArrival}`);
    await showPassengerStep(chatId, state);
    return;
  }

  if (action === 'mpax') {
    const passengers = Number(payload);
    if (!Number.isInteger(passengers) || passengers < 1) {
      await answerCallback(cb.id, 'Ошибка: некорректное число пассажиров.', true);
      return;
    }
    await answerCallback(cb.id, `Пассажиров: ${passengers}`);
    await finalizeMonitoringRequest(chatId, state, passengers);
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

async function startMonitorFlow(chatId) {
  const stations = await listStations();
  if (!stations || stations.length === 0) {
    await sendMessage(chatId, 'В базе пока нет ни одной станции. Обратитесь к администратору.');
    return;
  }

  const state = { data: {}, originStations: stations };
  conversationStates.set(chatId, state);

  const buttons = stations.map((station, index) => ({ text: station.name, callback_data: `morig:${index}` }));
  await sendInlineKeyboard(chatId, '🚉 Выберите станцию отправления:', buttons);
}

async function showDestinationStep(chatId, state) {
  const stations = await listStations();
  const destinationStations = stations.filter((station) => station.id !== state.data.originStationId);

  if (destinationStations.length === 0) {
    await sendMessage(chatId, 'Нет доступных станций назначения. Начните заново с /monitor.');
    conversationStates.delete(chatId);
    return;
  }

  state.destinationStations = destinationStations;
  conversationStates.set(chatId, state);

  const buttons = destinationStations.map((station, index) => ({ text: station.name, callback_data: `mdest:${index}` }));
  await sendInlineKeyboard(
    chatId,
    `🚉 Отправление: ${state.data.originStationName}\n🏁 Выберите станцию прибытия:`,
    buttons
  );
}

async function showDateStep(chatId, state) {
  const monthDate = state.calendarMonth
    ? new Date(state.calendarMonth.getFullYear(), state.calendarMonth.getMonth(), 1)
    : new Date();
  const monthView = buildCalendarMonthGrid(new Date(monthDate.getFullYear(), monthDate.getMonth(), 1), new Date());
  state.calendarMonth = new Date(monthView.monthKey + 'T00:00:00');
  state.dateOptions = monthView.days;
  conversationStates.set(chatId, state);

  const keyboard = buildCalendarKeyboard(monthView);
  await callTelegram('sendMessage', {
    chat_id: chatId,
    text: `🏁 Прибытие: ${state.data.destinationStationName}\n📅 Выберите дату поездки:`,
    reply_markup: { inline_keyboard: keyboard }
  });
}

function buildCalendarMonthGridForExport(monthDate = new Date(), today = new Date()) {
  return buildCalendarMonthGrid(monthDate, today);
}

async function fetchAndShowTrains(chatId, state) {
  let normalizedTrains;
  try {
    await refreshSession();
    const response = await fetchTrainList({
      date: state.data.date,
      depStationCode: state.data.originStationCode,
      arvStationCode: state.data.destinationStationCode
    });
    normalizedTrains = parseTrainList(response);
  } catch (error) {
    logger.error('telegram.monitor', 'Failed to fetch live train list for /monitor flow', {
      chatId,
      error: error.message
    });
    await sendMessage(chatId, '⚠️ Не удалось получить список поездов. Попробуйте выбрать дату ещё раз.');
    await showDateStep(chatId, state);
    return;
  }

  const premiumTrains = normalizedTrains
    .filter((train) => isPremiumBrand(train.trainType))
    .sort((a, b) => {
      const aKey = `${String(a.departure || '').trim()}|${String(a.arrival || '').trim()}|${String(a.trainNumber || '').trim()}`;
      const bKey = `${String(b.departure || '').trim()}|${String(b.arrival || '').trim()}|${String(b.trainNumber || '').trim()}`;
      return aKey.localeCompare(bKey);
    });

  if (premiumTrains.length === 0) {
    await sendMessage(
      chatId,
      `😕 На ${escapeMarkdown(state.data.date)} нет поездов Afrosiyob/Rotem для этого направления. Выберите другую дату.`
    );
    await showDateStep(chatId, state);
    return;
  }

  state.trains = premiumTrains;
  conversationStates.set(chatId, state);

  const buttons = premiumTrains.map((train, index) => ({
    text: `🚄 ${buildTrainSelectionLabel(train)}`,
    callback_data: `mtrain:${index}`
  }));
  await sendInlineKeyboard(chatId, `📅 Дата: ${state.data.date}\n🚄 Выберите поезд (только Afrosiyob / Rotem):`, buttons, 1);
}

async function showPassengerStep(chatId, state) {
  const buttons = PASSENGER_OPTIONS.map((count) => ({ text: String(count), callback_data: `mpax:${count}` }));
  await sendInlineKeyboard(
    chatId,
    `🚄 ${state.data.exactDeparture} → ${state.data.exactArrival}\n👥 Сколько пассажиров?`,
    buttons,
    5
  );
}

async function finalizeMonitoringRequest(chatId, state, passengers) {
  const request = await createMonitoringRequest({
    userId: String(chatId),
    originStationId: state.data.originStationId,
    destinationStationId: state.data.destinationStationId,
    date: state.data.date,
    passengers,
    exactDeparture: state.data.exactDeparture,
    exactArrival: state.data.exactArrival,
    exactDepartureTime: state.data.exactDepartureTime || state.data.exactDeparture,
    trainNumber: state.data.trainNumber,
    selectedTrainNumber: state.data.selectedTrainNumber || state.data.trainNumber,
    allowedBrands: Array.isArray(state.data.allowedBrands) ? state.data.allowedBrands : ['Afrosiyob', 'Rotem'],
    apiOriginStationName: state.data.apiOriginStationName,
    apiDestinationStationName: state.data.apiDestinationStationName
  });

  conversationStates.delete(chatId);

  if (!request) {
    await sendMessage(chatId, 'Не удалось создать мониторинг. Попробуйте позже.');
    return;
  }

  const shortId = String(request.id).substring(0, 8);
  const summary = [
    `✅ Мониторинг создан. ID: ${shortId}`,
    `🚉 ${escapeMarkdown(state.data.originStationName)} → ${escapeMarkdown(state.data.destinationStationName)}`,
    `📅 ${escapeMarkdown(state.data.date)}`,
    `🚄 ${state.data.exactDeparture} → ${state.data.exactArrival} (поезд ${escapeMarkdown(state.data.trainNumber)})`,
    `👥 ${passengers} ${passengers === 1 ? 'пассажир' : 'пассажиров'}`
  ].join('\n');
  await sendMessage(chatId, summary);
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
  // Format: 🚄 Origin → Destination, 📅 Date, exact time, 👥 Passengers, 🆔 ID (8 chars)
  const passengers = request.passengers || 1;
  const timeLine = request.exact_departure && request.exact_arrival
    ? `🚄 ${escapeMarkdown(request.exact_departure)} → ${escapeMarkdown(request.exact_arrival)}${request.train_number ? ` (поезд ${escapeMarkdown(request.train_number)})` : ''}`
    : null;

  return [
    `🚉 ${escapeMarkdown(request.originStationName)} → ${escapeMarkdown(request.destinationStationName)}`,
    `📅 ${escapeMarkdown(request.travel_date)}`,
    timeLine,
    `👥 ${passengers} ${passengers === 1 ? 'пассажир' : 'пассажиров'}`,
    `🆔 ${shortId}`
  ].filter(Boolean).join('\n');
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
      await sendMessage(chatId, 'У вас пока нет активных запросов мониторинга.');
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

    await sendMessage(chatId, '*Ваши активные мониторинги:*');

    for (const request of enrichedRequests) {
      const shortId = request.id.substring(0, 8);
      await sendMessage(chatId, formatMonitoringRequestStatus(request, shortId), {
        reply_markup: {
          inline_keyboard: [[{
            text: `❌ Удалить ${request.originStationName} → ${request.destinationStationName} (${shortId})`,
            callback_data: `cancel:${request.id}`
          }]]
        }
      });
    }
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
    await startMonitorFlow(chatId);
    return;
  }

  if (conversationStates.has(chatId)) {
    await sendMessage(chatId, 'Пожалуйста, используйте кнопки выше, чтобы продолжить настройку мониторинга.');
    return;
  }

  await sendMessage(chatId, 'Неизвестная команда. Используйте /help для списка команд.');
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
  await configureBotCommands();
  while (true) {
    try {
      const updates = await getUpdates();
      for (const update of updates) {
        updateOffset = update.update_id;
        if (update.callback_query) {
          const cbFromId = update.callback_query.from?.id;
          if (!isAuthorizedUser(cbFromId)) {
            const chatId = update.callback_query.message?.chat?.id;
            await answerCallback(update.callback_query.id, ACCESS_DENIED_TEXT, true);
            if (chatId) {
              await sendMessage(chatId, ACCESS_DENIED_TEXT);
            }
            continue;
          }
          await handleCallbackQuery(update.callback_query);
        }
        if (update.message) {
          const msgFromId = update.message.from?.id;
          const chatId = update.message.chat?.id;
          if (!isAuthorizedUser(msgFromId)) {
            if (chatId) {
              await sendMessage(chatId, ACCESS_DENIED_TEXT);
            }
            continue;
          }
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
  startTelegramPolling,
  buildCalendarMonthGrid: buildCalendarMonthGridForExport
};
