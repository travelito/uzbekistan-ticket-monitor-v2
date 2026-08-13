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
});
