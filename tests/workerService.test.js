const { buildMonitoringNotificationMessage } = require('../src/services/workerService');

describe('workerService notification message formatting', () => {
  it('uses monitored route from request (17cde3d5) instead of train originRoute endpoints', () => {
    const request = {
      id: '17cde3d5-8dc6-4d15-8bc3-403d73cde317',
      dep_station_name: 'Бухара',
      arv_station_name: 'Хива'
    };

    const matchingTrains = [
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

    const message = buildMonitoringNotificationMessage(request, matchingTrains);

    expect(message).toContain('📍 Бухара → Хива');
    expect(message).not.toContain('📍 Ташкент → Хива');
    expect(message).toContain('🚄 *Поезд 752Ж (Jaloliddin Manguberdi)*');
    expect(message).toContain('🕐 Отправление: 09.09.2026 11:14');
    expect(message).toContain('💺 Сидячий: 178');
  });
});
