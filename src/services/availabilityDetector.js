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

function getAvailableSeatCount(cars = []) {
  return cars.reduce((sum, car) => sum + (Number.isFinite(car.availableSeats) ? car.availableSeats : 0), 0);
}

function normalizeTrainNumber(value) {
  return String(value || '').trim().toUpperCase();
}

// Exact-match mode: a train qualifies only if its departure AND arrival time (HH:mm, taken
// literally from the live API response) equal the ones the user picked when creating the
// request. Station names/brands are never hardcoded here - they only ever come from the live
// train list. The train number is intentionally NOT part of the match - it is stored only as a
// secondary confirmation field (see request.train_number) since railway.uz occasionally reuses
// times across schedule revisions.
function isAllowedBrand(trainType, allowedBrands) {
  const normalized = String(trainType || '').trim().toLowerCase();
  const validBrands = Array.isArray(allowedBrands) && allowedBrands.length > 0
    ? allowedBrands.map((brand) => String(brand || '').trim().toLowerCase())
    : ['afrosiyob', 'rotem'];

  if (!normalized) {
    return false;
  }

  return validBrands.some((brand) => {
    if (!brand) {
      return false;
    }

    if (normalized.includes(brand)) {
      return true;
    }

    if (brand === 'rotem' && (normalized.includes('jaloliddin') || normalized.includes('manguberdi'))) {
      return true;
    }

    return false;
  });
}

function findMatchingTrains(normalizedTrains, request) {
  const exactDeparture = String(request.exact_departure || request.exact_departure_time || '').trim();
  const exactArrival = String(request.exact_arrival || '').trim();
  if (!exactDeparture || !exactArrival) {
    return [];
  }

  const allowedBrands = Array.isArray(request.allowed_brands) && request.allowed_brands.length > 0
    ? request.allowed_brands
    : ['Afrosiyob', 'Rotem'];

  return normalizedTrains.filter((train) => {
    if (!train) {
      return false;
    }

    if (parseTime(train.departure) !== exactDeparture || parseTime(train.arrival) !== exactArrival) {
      return false;
    }

    if (!isAllowedBrand(train.trainType, allowedBrands)) {
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
      exactDeparture: request.exact_departure,
      exactArrival: request.exact_arrival,
      trainNumber: request.train_number
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

function normalizeCarSnapshot(cars = []) {
  return (Array.isArray(cars) ? cars : [])
    .map((car) => ({
      type: String(car?.type || '').trim().toLowerCase(),
      availableSeats: Number.isFinite(car?.availableSeats) ? car.availableSeats : 0
    }))
    .sort((a, b) => {
      if (a.type === b.type) {
        return a.availableSeats - b.availableSeats;
      }
      return a.type.localeCompare(b.type);
    });
}

function normalizeTrainSnapshot(train) {
  const departureTime = parseTime(train?.departure) || String(train?.departure || '').trim();
  const arrivalTime = parseTime(train?.arrival) || String(train?.arrival || '').trim();

  return {
    trainNumber: normalizeTrainNumber(train?.trainNumber),
    trainType: String(train?.trainType || '').trim().toLowerCase(),
    departure: departureTime,
    arrival: arrivalTime,
    cars: normalizeCarSnapshot(train?.cars)
  };
}

function buildMatchingTrainsSignature(payload) {
  const matchingTrains = Array.isArray(payload?.matchingTrains) ? payload.matchingTrains : [];

  return matchingTrains
    .map(normalizeTrainSnapshot)
    .sort((a, b) => {
      if (a.trainNumber !== b.trainNumber) {
        return a.trainNumber.localeCompare(b.trainNumber);
      }
      if (a.departure !== b.departure) {
        return a.departure.localeCompare(b.departure);
      }
      if (a.arrival !== b.arrival) {
        return a.arrival.localeCompare(b.arrival);
      }
      return a.trainType.localeCompare(b.trainType);
    });
}

function shouldNotify(currentPayload, lastPayload) {
  if (!lastPayload) {
    return true;
  }

  try {
    const lastJson = typeof lastPayload === 'string' ? JSON.parse(lastPayload) : lastPayload;
    const currentSignature = buildMatchingTrainsSignature(currentPayload);
    const lastSignature = buildMatchingTrainsSignature(lastJson);
    return JSON.stringify(currentSignature) !== JSON.stringify(lastSignature);
  } catch (error) {
    return true;
  }
}
module.exports = {
  findMatchingTrains,
  buildNotificationPayload,
  buildMatchingTrainsSignature,
  shouldNotify
};
