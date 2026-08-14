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

  it('filters Railway DD.MM.YYYY departure times by the actual clock time', () => {
    const trains = [
      {
        trainNumber: '766Ф',
        trainType: 'Afrosiyob',
        departure: '12.10.2026 07:30',
        arrival: '12.10.2026 11:39',
        cars: [{ type: 'Сидячий', availableSeats: 5 }]
      },
      {
        trainNumber: '770Ф',
        trainType: 'Afrosiyob',
        departure: '12.10.2026 08:30',
        arrival: '12.10.2026 12:36',
        cars: [{ type: 'Сидячий', availableSeats: 5 }]
      }
    ];

    const matches = findMatchingTrains(trains, {
      passengers: 1,
      train_types: [],
      depart_window_start: '08:30',
      depart_window_end: '12:42'
    });

    expect(matches.map((train) => train.trainNumber)).toEqual(['770Ф']);
  });

  it('matches trains departing within a window that crosses midnight', () => {
    const trains = [
      {
        trainNumber: '712Ф',
        trainType: 'Sharq',
        departure: '12.10.2026 00:02',
        arrival: '12.10.2026 02:27',
        cars: [{ type: 'Сидячий', availableSeats: 216 }]
      },
      {
        trainNumber: '772Ф',
        trainType: 'Afrosiyob',
        departure: '12.10.2026 22:23',
        arrival: '13.10.2026 00:01',
        cars: [{ type: 'Сидячий', availableSeats: 88 }]
      },
      {
        trainNumber: '766Ф',
        trainType: 'Afrosiyob',
        departure: '12.10.2026 09:53',
        arrival: '12.10.2026 11:39',
        cars: [{ type: 'Сидячий', availableSeats: 5 }]
      }
    ];

    const matches = findMatchingTrains(trains, {
      passengers: 5,
      train_types: [],
      depart_window_start: '22:23',
      depart_window_end: '00:01'
    });

    expect(matches.map((train) => train.trainNumber)).toEqual(['772Ф']);
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
