function parseTimeWindow(value) {
  if (!value || typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim();
  if (normalized === 'any' || normalized === '00:00-23:59') {
    return null;
  }

  const [start, end] = normalized.split('-').map((part) => part.trim());
  if (!start || !end) {
    return null;
  }

  return {
    start,
    end
  };
}

function parseTime(timestamp) {
  const date = new Date(timestamp);
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

  return time >= window.start && time <= window.end;
}

function isTrainTypeAllowed(trainType, requestedTypes = []) {
  if (!requestedTypes || requestedTypes.length === 0) {
    return true;
  }

  const normalizedTrainType = String(trainType || '').toLowerCase();
  return requestedTypes.some((type) => normalizedTrainType.includes(String(type || '').toLowerCase()));
}

function getAvailableSeatCount(cars = []) {
  return cars.reduce((sum, car) => sum + (Number.isFinite(car.availableSeats) ? car.availableSeats : 0), 0);
}

function findMatchingTrains(normalizedTrains, request) {
  const window = parseTimeWindow(request.depart_window_start || '00:00-23:59');
  const requestedTypes = Array.isArray(request.train_types)
    ? request.train_types
    : request.train_types
    ? String(request.train_types).split(',').map((value) => value.trim())
    : [];

  return normalizedTrains.filter((train) => {
    if (!train) {
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
