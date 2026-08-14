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

  it('excludes through-trains that only share the destination city but not the requested origin/destination stations', () => {
    // Real data: request 60b5d583 (Самарканд -> Ташкент) incorrectly notified about
    // 709Ф, a Бухара -> Ташкент Центральный through-train, alongside the correct 767Ф match.
    const trains = [
      {
        trainNumber: '767Ф',
        trainType: 'Afrosiyob',
        origin: 'Самарканд',
        destination: 'Ташкент',
        departure: '18.08.2026 17:40',
        arrival: '18.08.2026 20:12',
        cars: [{ type: 'Сидячий', availableSeats: 43 }]
      },
      {
        trainNumber: '709Ф',
        trainType: 'Sharq',
        origin: 'Бухара',
        destination: 'Ташкент Центральный',
        departure: '18.08.2026 19:23',
        arrival: '18.08.2026 23:06',
        cars: [{ type: 'Сидячий', availableSeats: 95 }]
      }
    ];

    const matches = findMatchingTrains(trains, {
      passengers: 3,
      train_types: [],
      depart_window_start: '17:40',
      depart_window_end: '20:12',
      dep_station_name: 'Самарканд',
      arv_station_name: 'Ташкент'
    });

    expect(matches.map((train) => train.trainNumber)).toEqual(['767Ф']);
  });

  it('matches through-trains whose destination is a further terminus than the requested stop', () => {
    // Real data: request aed8625c (Бухара -> Самарканд, 4 passengers, window 10:57-12:41).
    // Trains 771Ф/711Ф genuinely board at Бухара and stop at Самарканд en route to their
    // official terminus "Ташкент Центральный" - destination must not be required to match exactly.
    const trains = [
      {
        trainNumber: '751М',
        trainType: 'Jaloliddin Manguberdi',
        origin: 'Хива',
        destination: 'Ташкент',
        departure: '15.08.2026 10:57',
        arrival: '15.08.2026 12:41',
        cars: [{ type: 'Сидячий', availableSeats: 98 }]
      },
      {
        trainNumber: '711Ф',
        trainType: 'Sharq',
        origin: 'Бухара',
        destination: 'Ташкент Центральный',
        departure: '15.08.2026 05:21',
        arrival: '15.08.2026 07:38',
        cars: [{ type: 'Сидячий', availableSeats: 167 }]
      }
    ];

    const matches = findMatchingTrains(trains, {
      passengers: 4,
      train_types: [],
      depart_window_start: '00:00',
      depart_window_end: '23:59',
      dep_station_name: 'Бухара',
      arv_station_name: 'Самарканд'
    });

    // 751М is excluded (boards at Хива, wrong origin); 711Ф matches on origin alone
    expect(matches.map((train) => train.trainNumber)).toEqual(['711Ф']);
  });

  it('does not match through-trains ending at a different named station in the same city', () => {
    // Real data: requests d9c4f77a/9e83af4d (Самарканд -> Ташкент, 2026-08-15). Trains 709Ф/777Ф
    // board at Бухара/"Бухара 1" and end at "Ташкент Центральный" - a different physical station
    // than the requested "Ташкент" - so they must not count as matches even with origin relaxed
    // destination checking. The only true Самарканд-origin train (767Ф) is sold out (0 seats).
    const trains = [
      {
        trainNumber: '709Ф',
        trainType: 'Sharq',
        origin: 'Бухара',
        destination: 'Ташкент Центральный',
        departure: '15.08.2026 19:23',
        arrival: '15.08.2026 23:06',
        cars: [{ type: 'Сидячий', availableSeats: 104 }]
      },
      {
        trainNumber: '767Ф',
        trainType: 'Afrosiyob',
        origin: 'Самарканд',
        destination: 'Ташкент',
        departure: '15.08.2026 17:40',
        arrival: '15.08.2026 20:12',
        cars: [{ type: 'Сидячий', availableSeats: 0 }]
      }
    ];

    const matches = findMatchingTrains(trains, {
      passengers: 3,
      train_types: [],
      depart_window_start: '18:49',
      depart_window_end: '21:04',
      dep_station_name: 'Самарканд',
      arv_station_name: 'Ташкент'
    });

    expect(matches).toHaveLength(0);
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
