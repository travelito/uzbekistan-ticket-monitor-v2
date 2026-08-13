const { createMonitoringRequest } = require('../monitoringService');

async function createTestRequest() {
  return createMonitoringRequest({
    userId: 'test-helper',
    originStationId: '4e0139a2-4d6f-4012-bce8-613fd11d1adc',
    destinationStationId: '7179b114-9549-4957-93f2-048437f4092e',
    date: '2026-09-08',
    passengers: 1,
    trainTypes: ['Sharq'],
    departWindowStart: '08:00',
    departWindowEnd: '14:00'
  });
}

module.exports = createTestRequest;
