const { parseTrainList } = require('../src/services/availabilityParser');

describe('Availability parser', () => {
  it('normalizes a simple Railway API train response', () => {
    const sampleResponse = {
      data: {
        trains: [
          {
            trainNumber: '7100',
            trainTypeName: 'Sharq',
            depStationName: 'Tashkent Central',
            arvStationName: 'Bukhara',
            departureDateTime: '2026-09-08T08:37:00',
            arrivalDateTime: '2026-09-08T14:35:00',
            cars: [
              {
                wagonTypeName: 'Coupe',
                availableSeats: 5
              }
            ]
          }
        ]
      }
    };

    const result = parseTrainList(sampleResponse);

    expect(result).toEqual([
      {
        trainNumber: '7100',
        trainType: 'Sharq',
        origin: 'Tashkent Central',
        destination: 'Bukhara',
        departure: '2026-09-08T08:37:00',
        arrival: '2026-09-08T14:35:00',
        cars: [
          {
            type: 'Coupe',
            availableSeats: 5
          }
        ]
      }
    ]);
  });

  it('normalizes the live directions.forward Railway response', () => {
    const sampleResponse = {
      data: {
        directions: {
          forward: {
            trains: [
              {
                type: 'СКРСТ',
                number: '766Ф',
                departureDate: '12.10.2026 07:30',
                arrivalDate: '12.10.2026 11:39',
                brand: 'Afrosiyob',
                originRoute: {
                  depStationName: 'Ташкент Центральный',
                  arvStationName: 'Бухара'
                },
                cars: [{ type: 'Сидячий', freeSeats: 2 }]
              }
            ]
          }
        }
      }
    };

    expect(parseTrainList(sampleResponse)).toEqual([
      {
        trainNumber: '766Ф',
        trainType: 'Afrosiyob',
        origin: 'Ташкент Центральный',
        destination: 'Бухара',
        departure: '12.10.2026 07:30',
        arrival: '12.10.2026 11:39',
        cars: [{ type: 'Сидячий', availableSeats: 2 }]
      }
    ]);
  });

  it('also parses an optional backward direction', () => {
    const result = parseTrainList({
      data: {
        directions: {
          forward: { trains: [] },
          backward: { trains: [{ number: '054Щ', cars: [] }] }
        }
      }
    });

    expect(result).toHaveLength(1);
    expect(result[0].trainNumber).toBe('054Щ');
  });
});
