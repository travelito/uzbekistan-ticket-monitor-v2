function firstAvailableValue(source, keys) {
  for (const key of keys) {
    if (source && Object.prototype.hasOwnProperty.call(source, key)) {
      return source[key];
    }
  }
  return undefined;
}

function asNumber(value) {
  if (value == null) {
    return undefined;
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : undefined;
  }
  const normalized = String(value).replace(/[^0-9]/g, '');
  return normalized ? Number(normalized) : undefined;
}

function parseCar(rawCar) {
  if (!rawCar || typeof rawCar !== 'object') {
    return null;
  }

  const type = firstAvailableValue(rawCar, [
    'type',
    'wagonTypeName',
    'carTypeName',
    'className',
    'name'
  ]);

  const availableSeats = asNumber(firstAvailableValue(rawCar, [
    'availableSeats',
    'countFreeSeats',
    'freeSeats',
    'freePlaceCount',
    'available',
    'countFreePlaces'
  ]));

  return {
    type: type || 'unknown',
    availableSeats: availableSeats ?? 0
  };
}

function normalizeTrain(rawTrain) {
  if (!rawTrain || typeof rawTrain !== 'object') {
    return null;
  }

  const trainNumber = firstAvailableValue(rawTrain, [
    'trainNumber',
    'number',
    'trainNo'
  ]);

  const trainType = firstAvailableValue(rawTrain, [
    'trainType',
    'trainTypeName',
    'brandName',
    'brand',
    'type'
  ]);

  const origin = firstAvailableValue(rawTrain, [
    'depStationName',
    'originStationName',
    'origin',
    'from'
  ]);

  const destination = firstAvailableValue(rawTrain, [
    'arvStationName',
    'destinationStationName',
    'destination',
    'to'
  ]);

  const departure = firstAvailableValue(rawTrain, [
    'departureDateTime',
    'depDateTime',
    'depTime',
    'departure'
  ]);

  const arrival = firstAvailableValue(rawTrain, [
    'arrivalDateTime',
    'arvDateTime',
    'arrTime',
    'arrival'
  ]);

  const cars = Array.isArray(rawTrain.cars)
    ? rawTrain.cars.map(parseCar).filter(Boolean)
    : Array.isArray(rawTrain.carTypes)
    ? rawTrain.carTypes.map(parseCar).filter(Boolean)
    : [];

  return {
    trainNumber: trainNumber || 'unknown',
    trainType: trainType || 'unknown',
    origin: origin || 'unknown',
    destination: destination || 'unknown',
    departure: departure || null,
    arrival: arrival || null,
    cars
  };
}

function parseTrainList(response) {
  if (!response || typeof response !== 'object') {
    return [];
  }

  const trains = response?.data?.trains ?? response?.trains ?? response?.data ?? [];

  if (!Array.isArray(trains)) {
    return [];
  }

  return trains.map(normalizeTrain).filter(Boolean);
}

module.exports = {
  parseTrainList
};
