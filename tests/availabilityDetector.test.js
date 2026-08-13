const { findMatchingTrains, shouldNotify } = require('../src/services/availabilityDetector');

describe('Availability detector', () => {
  const sampleTrains = [
    {
      trainNumber: '7100',
      trainType: 'Sharq',
      origin: 'Tashkent Central',
      destination: 'Bukhara',
      departure: '2026-09-08T08:37:00',
      arrival: '2026-09-08T14:35:00',
      cars: [{ type: 'Coupe', availableSeats: 5 }]
    },
    {
      trainNumber: '7200',
      trainType: 'Afrosiyob',
      origin: 'Tashkent Central',
      destination: 'Bukhara',
      departure: '2026-09-08T19:00:00',
      arrival: '2026-09-08T21:30:00',
      cars: [{ type: 'Business', availableSeats: 3 }]
    }
  ];

  it('finds trains matching passenger count and train type', () => {
    const request = {
      passengers: 1,
      train_types: ['Sharq'],
      depart_window_start: '08:00',
      depart_window_end: '18:00'
    };

    const matches = findMatchingTrains(sampleTrains, request);
    expect(matches).toHaveLength(1);
    expect(matches[0].trainNumber).toBe('7100');
  });

  it('returns no matches when train type does not match', () => {
    const request = {
      passengers: 1,
      train_types: ['Rotem Hyundai'],
      depart_window_start: '08:00',
      depart_window_end: '18:00'
    };

    const matches = findMatchingTrains(sampleTrains, request);
    expect(matches).toHaveLength(0);
  });

  it('returns matches for any time window when depart_window_start is missing', () => {
    const request = {
      passengers: 1,
      train_types: ['Afrosiyob']
    };

    const matches = findMatchingTrains(sampleTrains, request);
    expect(matches).toHaveLength(1);
    expect(matches[0].trainNumber).toBe('7200');
  });

  it('should notify when payloads differ', () => {
    const currentPayload = {
      matchingTrains: [{ trainNumber: '7100' }]
    };
    const lastPayload = JSON.stringify({ matchingTrains: [{ trainNumber: '7200' }] });
    expect(shouldNotify(currentPayload, lastPayload)).toBe(true);
  });

  it('should not notify when payloads are identical', () => {
    const currentPayload = {
      matchingTrains: [{ trainNumber: '7100' }]
    };
    const lastPayload = JSON.stringify({ matchingTrains: [{ trainNumber: '7100' }] });
    expect(shouldNotify(currentPayload, lastPayload)).toBe(false);
  });
});
