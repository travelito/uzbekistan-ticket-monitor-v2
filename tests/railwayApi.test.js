const { buildTrainListPayload } = require('../src/services/railwayApi');

describe('Railway API client', () => {
  it('builds the expected payload for train list requests', () => {
    const payload = buildTrainListPayload({
      date: '2026-09-08',
      depStationCode: '2900000',
      arvStationCode: '2900800'
    });

    expect(payload).toEqual({
      directions: {
        forward: {
          date: '2026-09-08',
          depStationCode: '2900000',
          arvStationCode: '2900800'
        }
      }
    });
  });
});
