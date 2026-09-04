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

  function exactRequest(overrides = {}) {
    const request = {
      passengers: 1,
      exact_departure: '19:00',
      exact_arrival: '21:30',
      allowed_brands: ['Afrosiyob', 'Rotem']
    };

    return { ...request, ...overrides };
  }

  it('finds a train matching its exact departure and arrival time', () => {
    const matches = findMatchingTrains(sampleTrains, exactRequest());

    expect(matches).toHaveLength(1);
    expect(matches[0].trainNumber).toBe('7200');
  });

  it('rejects a train when either selected time differs', () => {
    expect(findMatchingTrains(sampleTrains, exactRequest({ exact_departure: '19:01' }))).toHaveLength(0);
    expect(findMatchingTrains(sampleTrains, exactRequest({ exact_arrival: '21:31' }))).toHaveLength(0);
  });

  it('accepts the Rotem live-brand aliases and rejects non-premium trains', () => {
    const trains = [
      { ...sampleTrains[0], trainType: 'Sharq', departure: '10:00', arrival: '12:00' },
      { ...sampleTrains[1], trainType: 'Jaloliddin Manguberdi', departure: '10:00', arrival: '12:00' }
    ];

    const matches = findMatchingTrains(trains, exactRequest({ exact_departure: '10:00', exact_arrival: '12:00' }));
    expect(matches.map((train) => train.trainNumber)).toEqual(['7200']);
  });

  it('requires enough seats for the selected passenger count', () => {
    expect(findMatchingTrains(sampleTrains, exactRequest({ passengers: 4 }))).toHaveLength(0);
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

  it('should not notify when only station labels or array order differ', () => {
    const currentPayload = {
      matchingTrains: [
        {
          trainNumber: '765Ф',
          trainType: 'Afrosiyob',
          origin: 'Ташкент',
          destination: 'Бухара',
          departure: '15.08.2026 10:30',
          arrival: '15.08.2026 14:20',
          cars: [
            { type: 'Сидячий', availableSeats: 33 },
            { type: 'VIP', availableSeats: 2 }
          ]
        }
      ]
    };

    const lastPayload = JSON.stringify({
      matchingTrains: [
        {
          trainNumber: '765Ф',
          trainType: 'Afrosiyob',
          origin: 'Ташкент Центральный',
          destination: 'Бухара 1',
          departure: '2026-08-15T10:30:00',
          arrival: '2026-08-15T14:20:00',
          cars: [
            { type: 'VIP', availableSeats: 2 },
            { type: 'Сидячий', availableSeats: 33 }
          ]
        }
      ]
    });

    expect(shouldNotify(currentPayload, lastPayload)).toBe(false);
  });

  it('should notify when seats change for the same train', () => {
    const currentPayload = {
      matchingTrains: [
        {
          trainNumber: '765Ф',
          trainType: 'Afrosiyob',
          departure: '15.08.2026 10:30',
          arrival: '15.08.2026 14:20',
          cars: [{ type: 'Сидячий', availableSeats: 34 }]
        }
      ]
    };

    const lastPayload = JSON.stringify({
      matchingTrains: [
        {
          trainNumber: '765Ф',
          trainType: 'Afrosiyob',
          departure: '15.08.2026 10:30',
          arrival: '15.08.2026 14:20',
          cars: [{ type: 'Сидячий', availableSeats: 33 }]
        }
      ]
    });

    expect(shouldNotify(currentPayload, lastPayload)).toBe(true);
  });
});
