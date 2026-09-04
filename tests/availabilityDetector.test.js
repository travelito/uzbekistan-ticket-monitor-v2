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

  it('requires exact origin AND destination match, excluding through-trains ending elsewhere', () => {
    // Real data: request aed8625c (Бухара -> Самарканд). 711Ф genuinely stops at Самарканд en
    // route to "Ташкент Центральный", but without real per-train stop data we can't safely tell
    // that apart from a train serving a totally different destination, so it is excluded.
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

    expect(matches).toHaveLength(0);
  });

  it('rejects a train serving a completely different destination city (real bug: 752Ж Ташкент -> Хива matched a Ташкент -> Самарканд request)', () => {
    // Real data: request 028c904b (Ташкент -> Самарканд, window 07:00-09:13). The previous
    // "relaxed destination" logic treated Хива and Самарканд as two unrelated cities and let
    // 752Ж through since its origin ("Ташкент") happened to match.
    const trains = [
      {
        trainNumber: '752Ж',
        trainType: 'Jaloliddin Manguberdi',
        origin: 'Ташкент',
        destination: 'Хива',
        departure: '15.08.2026 07:00',
        arrival: '15.08.2026 09:13',
        cars: [{ type: 'Сидячий', availableSeats: 6 }]
      },
      {
        trainNumber: '766Ф',
        trainType: 'Afrosiyob',
        origin: 'Ташкент Центральный',
        destination: 'Бухара',
        departure: '15.08.2026 07:30',
        arrival: '15.08.2026 09:43',
        cars: [{ type: 'Сидячий', availableSeats: 1 }]
      }
    ];

    const matches = findMatchingTrains(trains, {
      passengers: 3,
      train_types: [],
      depart_window_start: '07:00',
      depart_window_end: '09:13',
      dep_station_name: 'Ташкент',
      arv_station_name: 'Самарканд'
    });

    expect(matches).toHaveLength(0);
  });

  it('matches a train boarding from a same-city sub-station variant when the destination matches exactly', () => {
    // Real data: requests 9db32e93/7a5e5ca9/028c904b (Ташкент -> Самарканд). Train 768Ф boards
    // at "Ташкент Центральный" (a sub-station of the requested "Ташкент") and ends exactly at
    // "Самарканд" - it must count as a match once seats are available (the real 768Ф had 0 seats
    // at the time of this incident, hence no notification, but the route itself was compatible).
    const trains = [
      {
        trainNumber: '768Ф',
        trainType: 'Afrosiyob',
        origin: 'Ташкент Центральный',
        destination: 'Самарканд',
        departure: '15.08.2026 07:55',
        arrival: '15.08.2026 10:10',
        cars: [{ type: 'Сидячий', availableSeats: 5 }]
      },
      {
        trainNumber: '752Ж',
        trainType: 'Jaloliddin Manguberdi',
        origin: 'Ташкент',
        destination: 'Хива',
        departure: '15.08.2026 07:00',
        arrival: '15.08.2026 09:13',
        cars: [{ type: 'Сидячий', availableSeats: 6 }]
      }
    ];

    const matches = findMatchingTrains(trains, {
      passengers: 3,
      train_types: [],
      depart_window_start: '07:00',
      depart_window_end: '09:13',
      dep_station_name: 'Ташкент',
      arv_station_name: 'Самарканд'
    });

    expect(matches.map((train) => train.trainNumber)).toEqual(['768Ф']);
  });

  it('does not match through-trains ending at a different named station in the same city', () => {
    // Real data: requests d9c4f77a/9e83af4d (Самарканд -> Ташкент, 2026-08-15). Trains 709Ф/777Ф
    // board at Бухара/"Бухара 1" and end at "Ташкент Центральный" - neither the origin nor the
    // destination match the request, so they are excluded. The only true Самарканд-origin train
    // (767Ф) is sold out (0 seats).
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

  it('matches 17cde3d5 corridor case via train_routes directory when originRoute starts earlier', () => {
    // Real data: request 17cde3d5 (Бухара -> Хива, 11:14-14:36, 3 passengers). Train 752Ж
    // appears with originRoute depStationName='Ташкент' even when querying from Бухара, so
    // strict origin/destination matching misses it; train_routes directory should allow it.
    const trains = [
      {
        trainNumber: '752Ж',
        trainType: 'Jaloliddin Manguberdi',
        origin: 'Ташкент',
        destination: 'Хива',
        departure: '09.09.2026 11:14',
        arrival: '09.09.2026 14:36',
        cars: [{ type: 'Сидячий', availableSeats: 178 }]
      }
    ];

    const matches = findMatchingTrains(trains, {
      passengers: 3,
      train_types: [],
      depart_window_start: '11:14',
      depart_window_end: '14:36',
      dep_station_name: 'Бухара',
      arv_station_name: 'Хива',
      trainRoutesByNumber: {
        '752Ж': {
          route_stations: ['Хива', 'Бухара', 'Самарканд', 'Ташкент'],
          bidirectional: true
        }
      }
    });

    expect(matches.map((train) => train.trainNumber)).toEqual(['752Ж']);
  });

  it('matches 028c904b via train_routes directory when both stations are on the known route in reverse order', () => {
    // With curated route data for 752Ж, Ташкент -> Самарканд is a valid reverse segment on the
    // known route Хива -> Бухара -> Самарканд -> Ташкент.
    const trains = [
      {
        trainNumber: '752Ж',
        trainType: 'Jaloliddin Manguberdi',
        origin: 'Ташкент',
        destination: 'Хива',
        departure: '15.08.2026 07:00',
        arrival: '15.08.2026 09:13',
        cars: [{ type: 'Сидячий', availableSeats: 6 }]
      }
    ];

    const matches = findMatchingTrains(trains, {
      passengers: 3,
      train_types: [],
      depart_window_start: '07:00',
      depart_window_end: '09:13',
      dep_station_name: 'Ташкент',
      arv_station_name: 'Самарканд',
      trainRoutesByNumber: {
        '752Ж': {
          route_stations: ['Хива', 'Бухара', 'Самарканд', 'Ташкент'],
          bidirectional: true
        }
      }
    });

    expect(matches.map((train) => train.trainNumber)).toEqual(['752Ж']);
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
