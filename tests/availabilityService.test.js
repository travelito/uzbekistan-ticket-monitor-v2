const { shouldSaveAvailabilityCheck } = require('../src/supabase/availabilityService');
const { buildMatchingTrainsSignature } = require('../src/services/availabilityDetector');

const now = new Date('2026-09-04T00:00:00.000Z');
const matchingTrains = [{
  trainNumber: '766Ф',
  trainType: 'Afrosiyob',
  departure: '04.09.2026 07:30',
  arrival: '04.09.2026 09:43',
  cars: [{ type: 'Сидячий', availableSeats: 5 }]
}];

function currentCheck(overrides = {}) {
  return {
    success: true,
    available: true,
    availableSeats: 5,
    matchingTrainsSignature: buildMatchingTrainsSignature({ matchingTrains }),
    ...overrides
  };
}

function latestCheck(overrides = {}) {
  return {
    checked_at: '2026-09-03T12:00:01.000Z',
    success: true,
    available: true,
    available_seats: 5,
    response_data: {
      matchingTrainsSignature: buildMatchingTrainsSignature({ matchingTrains })
    },
    ...overrides
  };
}

describe('availability check persistence', () => {
  it('saves the first check', () => {
    expect(shouldSaveAvailabilityCheck(currentCheck(), null, now)).toBe(true);
  });

  it('skips an unchanged check before the 24-hour heartbeat', () => {
    expect(shouldSaveAvailabilityCheck(currentCheck(), latestCheck(), now)).toBe(false);
  });

  it('saves a check when matching train seats change', () => {
    const changedTrains = [{ ...matchingTrains[0], cars: [{ type: 'Сидячий', availableSeats: 6 }] }];
    const changed = currentCheck({
      availableSeats: 6,
      matchingTrainsSignature: buildMatchingTrainsSignature({ matchingTrains: changedTrains })
    });

    expect(shouldSaveAvailabilityCheck(changed, latestCheck(), now)).toBe(true);
  });

  it('saves a heartbeat after 24 hours without a change', () => {
    const oldCheck = latestCheck({ checked_at: '2026-09-02T23:59:59.000Z' });
    expect(shouldSaveAvailabilityCheck(currentCheck(), oldCheck, now)).toBe(true);
  });

  it('saves every failed check', () => {
    expect(shouldSaveAvailabilityCheck(currentCheck({ success: false }), latestCheck(), now)).toBe(true);
  });

  it('creates a new baseline when the previous check has no stored signature', () => {
    const legacyCheck = latestCheck({ response_data: { normalizedTrains: matchingTrains } });
    expect(shouldSaveAvailabilityCheck(currentCheck(), legacyCheck, now)).toBe(true);
  });
});