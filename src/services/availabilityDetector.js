function parseTimeWindow(value, endValue) {
  if (!value || typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim();
  if (normalized === 'any' || normalized === '00:00-23:59') {
    return null;
  }

  const [start, end] = (endValue ? [normalized, endValue.trim()] : normalized.split('-'))
    .map((part) => part.trim());
  if (!start || !end) {
    return null;
  }

  return {
    start,
    end
  };
}

function parseTime(timestamp) {
  const text = String(timestamp || '');
  const explicitDateTime = text.match(/(?:^|T|\s)(\d{2}:\d{2})(?::\d{2})?/);
  if (explicitDateTime) {
    return explicitDateTime[1];
  }

  const date = new Date(text);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date.toISOString().substr(11, 5);
}

function isWithinWindow(timestamp, window) {
  if (!window || !window.start || !window.end) {
    return true;
  }

  const time = parseTime(timestamp);
  if (!time) {
    return false;
  }

  // Window crosses midnight (e.g. 22:23-00:01) when start is after end
  if (window.start > window.end) {
    return time >= window.start || time <= window.end;
  }

  return time >= window.start && time <= window.end;
}

function isTrainTypeAllowed(trainType, requestedTypes = []) {
  if (!requestedTypes || requestedTypes.length === 0) {
    return true;
  }

  const normalizedTrainType = String(trainType || '').toLowerCase();
  return requestedTypes.some((type) => normalizedTrainType.includes(String(type || '').toLowerCase()));
}

function normalizeStationName(name) {
  return String(name || '').trim().toLowerCase();
}

// Both origin and destination must match the requested station names exactly. Earlier attempts
// to relax either side to accommodate through-trains (boarding/alighting at an intermediate stop
// before the train's listed terminus) proved unsafe: without real per-train stop-sequence data,
// "a further stop on the same corridor" is indistinguishable from "a completely unrelated
// direction" (e.g. a Ташкент -> Хива train wrongly matched a Ташкент -> Самарканд request because
// Хива/Самарканд were treated as two equally-valid "different cities"). A missed notification for
// a genuine through-ticket is a much safer failure mode than notifying about the wrong route.
function isRouteMatch(train, request) {
  const expectedOrigin = normalizeStationName(request.dep_station_name);
  if (expectedOrigin && normalizeStationName(train.origin) !== expectedOrigin) {
    return false;
  }

  const expectedDestination = normalizeStationName(request.arv_station_name);
  if (expectedDestination && normalizeStationName(train.destination) !== expectedDestination) {
    return false;
  }

  return true;
}

function getAvailableSeatCount(cars = []) {
  return cars.reduce((sum, car) => sum + (Number.isFinite(car.availableSeats) ? car.availableSeats : 0), 0);
}

function findMatchingTrains(normalizedTrains, request) {
  const window = parseTimeWindow(
    request.depart_window_start || '00:00',
    request.depart_window_end
  );
  const requestedTypes = Array.isArray(request.train_types)
    ? request.train_types
    : request.train_types
    ? String(request.train_types).split(',').map((value) => value.trim())
    : [];

  return normalizedTrains.filter((train) => {
    if (!train) {
      return false;
    }

    if (!isRouteMatch(train, request)) {
      return false;
    }

    if (!isTrainTypeAllowed(train.trainType, requestedTypes)) {
      return false;
    }

    if (!isWithinWindow(train.departure, window)) {
      return false;
    }

    const availableSeats = getAvailableSeatCount(train.cars);
    return availableSeats >= Number(request.passengers || 1);
  });
}

function buildNotificationPayload(request, matchingTrains) {
  return {
    monitoringRequestId: request.id,
    foundAt: new Date().toISOString(),
    searchMeta: {
      depStationCode: request.dep_station_code,
      arvStationCode: request.arv_station_code,
      travelDate: request.travel_date,
      passengers: request.passengers,
      trainTypes: request.train_types,
      departWindowStart: request.depart_window_start,
      departWindowEnd: request.depart_window_end
    },
    matchingTrains: matchingTrains.map((train) => ({
      trainNumber: train.trainNumber,
      trainType: train.trainType,
      origin: train.origin,
      destination: train.destination,
      departure: train.departure,
      arrival: train.arrival,
      cars: train.cars
    }))
  };
}

function shouldNotify(currentPayload, lastPayload) {
  if (!lastPayload) {
    return true;
  }

  try {
    const lastJson = typeof lastPayload === 'string' ? JSON.parse(lastPayload) : lastPayload;
    return JSON.stringify(currentPayload.matchingTrains) !== JSON.stringify(lastJson.matchingTrains);
  } catch (error) {
    return true;
  }
}

module.exports = {
  findMatchingTrains,
  buildNotificationPayload,
  shouldNotify
};
