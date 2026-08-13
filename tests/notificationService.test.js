const { shouldNotify } = require('../src/services/availabilityDetector');

describe('Notification deduplication', () => {
  it('returns true when there is no last payload', () => {
    const currentPayload = { matchingTrains: [{ trainNumber: '7100' }] };
    expect(shouldNotify(currentPayload, null)).toBe(true);
  });

  it('returns false when matching train payloads are identical', () => {
    const currentPayload = { matchingTrains: [{ trainNumber: '7100' }] };
    const lastPayload = JSON.stringify({ matchingTrains: [{ trainNumber: '7100' }] });
    expect(shouldNotify(currentPayload, lastPayload)).toBe(false);
  });
});
